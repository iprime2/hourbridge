import { afterEach, describe, expect, it } from 'vitest'
import { DateTime, Settings } from 'luxon'
import { describeDstChange, getDstInfo } from '@core/dst'
import {
  buildDayTimeline,
  getOffsetHoursRelativeToHome,
  instantFromHomeDateTime,
  resolveWallTime
} from '@core/timeEngine'

const at = (iso: string, zone = 'UTC') => DateTime.fromISO(iso, { zone })

/** luxon picks between the two copies of a repeated wall time using the zone's offset *today*. */
const NOWS = ['2026-01-15T12:00:00Z', '2026-07-15T12:00:00Z']
const setNow = (iso: string) => {
  Settings.now = () => new Date(iso).valueOf()
}
afterEach(() => {
  Settings.now = () => Date.now()
})

describe('30-minute DST changes (Australia/Lord_Howe)', () => {
  it('moves clocks forward 30 minutes and describes it in minutes', () => {
    const info = getDstInfo('Australia/Lord_Howe', at('2025-09-01T00:00:00'))
    expect(info.inDst).toBe(false)
    expect(info.nextChange?.deltaMinutes).toBe(30)
    // 2025-10-05 02:00 +10:30 jumps to 02:30 +11:00 = 2025-10-04 15:30 UTC.
    expect(info.nextChange?.at.toUTC().toISO()).toBe('2025-10-04T15:30:00.000Z')
    expect(describeDstChange(info.nextChange)).toBe('Clocks go forward 30m on Oct 5')
  })

  it('moves clocks back 30 minutes while on daylight time', () => {
    const info = getDstInfo('Australia/Lord_Howe', at('2025-11-01T00:00:00'))
    expect(info.inDst).toBe(true)
    expect(info.nextChange?.deltaMinutes).toBe(-30)
    expect(describeDstChange(info.nextChange)).toBe('Clocks go back 30m on Apr 5')
  })
})

describe('offsets that are not whole hours, relative to home (Asia/Kolkata, +5:30)', () => {
  it.each([
    // zone, instant, hours relative to IST
    ['Asia/Kathmandu', '2025-07-01T00:00:00Z', 0.25], // +5:45, no DST
    ['America/St_Johns', '2025-01-01T00:00:00Z', -9], // -3:30 in winter
    ['America/St_Johns', '2025-07-01T00:00:00Z', -8], // -2:30 in summer
    ['Australia/Lord_Howe', '2025-01-01T00:00:00Z', 5.5], // +11:00 on daylight time
    ['Australia/Lord_Howe', '2025-07-01T00:00:00Z', 5] // +10:30 on standard time
  ])('%s at %s is %s h from home', (zone, iso, expected) => {
    expect(getOffsetHoursRelativeToHome(at(iso), zone)).toBe(expected)
  })
})

describe('resolving a wall time in a zone with DST', () => {
  it('moves a wall time inside the spring-forward gap to the next valid minute', () => {
    // New York 2025-03-09: 02:00 EST jumps straight to 03:00 EDT, so 02:30 never happens.
    const gap = { year: 2025, month: 3, day: 9, hour: 2, minute: 30 }
    expect(instantFromHomeDateTime(gap, 'America/New_York').toUTC().toISO()).toBe('2025-03-09T07:30:00.000Z') // 03:30 EDT
    expect(resolveWallTime(gap, 'America/New_York').transition).toBe('skipped')
  })

  it.each(NOWS)('takes the first of a repeated wall time, whatever today is (now %s)', (now) => {
    setNow(now)
    // New York 2025-11-02 01:30 happens in EDT and again in EST: the EDT one is first.
    const ny = { year: 2025, month: 11, day: 2, hour: 1, minute: 30 }
    expect(instantFromHomeDateTime(ny, 'America/New_York').toUTC().toISO()).toBe('2025-11-02T05:30:00.000Z')
    expect(resolveWallTime(ny, 'America/New_York').transition).toBe('repeated')
    // Sydney 2025-04-06 02:30 happens in AEDT and again in AEST: again the earlier one.
    const sydney = { year: 2025, month: 4, day: 6, hour: 2, minute: 30 }
    expect(instantFromHomeDateTime(sydney, 'Australia/Sydney').toUTC().toISO()).toBe('2025-04-05T15:30:00.000Z')
  })

  it('leaves ordinary wall times alone', () => {
    const noon = { year: 2025, month: 6, day: 1, hour: 12 }
    const resolved = resolveWallTime(noon, 'America/New_York')
    expect(resolved.transition).toBeUndefined()
    expect(resolved.instant.toUTC().toISO()).toBe('2025-06-01T16:00:00.000Z')
    expect(resolved.instant.zoneName).toBe('America/New_York')
  })

  it('still throws for an impossible date or an unknown zone', () => {
    expect(() => instantFromHomeDateTime({ year: 2025, month: 2, day: 30 }, 'America/New_York')).toThrow(/Invalid DateTime/)
    expect(() => instantFromHomeDateTime({ year: 2025, month: 2, day: 3 }, 'Mars/Olympus')).toThrow(/Invalid DateTime/)
  })
})

describe('buildDayTimeline on a DST transition day (home zone observes DST)', () => {
  const zones = ['Asia/Kolkata']
  const flagged = (year: number, month: number, day: number, home: string) =>
    buildDayTimeline({ year, month, day }, zones, home)
      .filter((c) => c.transition)
      .map((c) => [c.homeHour, c.transition])
  const HOUR = 3_600_000

  it.each(NOWS)('spring-forward: marks the hour that does not exist; every other hour has its own instant (now %s)', (now) => {
    setNow(now)
    const columns = buildDayTimeline({ year: 2025, month: 3, day: 9 }, zones, 'America/New_York')
    expect(columns).toHaveLength(24) // the grid and the planner index columns by home hour
    expect(columns.map((c) => c.homeHour)).toEqual(Array.from({ length: 24 }, (_, h) => h))
    expect(flagged(2025, 3, 9, 'America/New_York')).toEqual([[2, 'skipped']])

    const real = columns.filter((c) => c.transition !== 'skipped')
    expect(real).toHaveLength(23)
    for (let i = 1; i < real.length; i++) {
      expect(real[i].instant.toMillis() - real[i - 1].instant.toMillis()).toBe(HOUR) // no duplicates, no holes
    }
    expect(columns[1].instant.toUTC().toISO()).toBe('2025-03-09T06:00:00.000Z') // 01:00 EST
    expect(columns[3].instant.toUTC().toISO()).toBe('2025-03-09T07:00:00.000Z') // 03:00 EDT
  })

  it.each(NOWS)('fall-back: flags the hour that happens twice and shows its first occurrence (now %s)', (now) => {
    setNow(now)
    const columns = buildDayTimeline({ year: 2025, month: 11, day: 2 }, zones, 'America/New_York')
    expect(columns).toHaveLength(24)
    expect(flagged(2025, 11, 2, 'America/New_York')).toEqual([[1, 'repeated']])
    expect(columns[1].instant.toUTC().toISO()).toBe('2025-11-02T05:00:00.000Z') // 01:00 EDT, the first one
    expect(columns[2].instant.toUTC().toISO()).toBe('2025-11-02T07:00:00.000Z') // 02:00 EST
  })

  it.each([
    // home zone, date, expected [hour, kind] flags
    ['Europe/London', [2025, 3, 30], [[1, 'skipped']]],
    ['Europe/London', [2025, 10, 26], [[1, 'repeated']]],
    ['Australia/Sydney', [2025, 10, 5], [[2, 'skipped']]],
    ['Australia/Sydney', [2025, 4, 6], [[2, 'repeated']]],
    ['America/Havana', [2025, 3, 9], [[0, 'skipped']]], // DST starts at midnight
    ['America/New_York', [2025, 6, 1], []],
    ['Europe/London', [2025, 11, 2], []],
    ['Asia/Kolkata', [2025, 3, 9], []],
    ['Asia/Kathmandu', [2025, 3, 9], []]
  ] as const)('%s on %j flags %j, whatever today is', (home, [y, m, d], expected) => {
    for (const now of NOWS) {
      setNow(now)
      expect(flagged(y, m, d, home)).toEqual(expected)
    }
  })

  it('marks every hour of a calendar day that does not exist (Samoa skipped 2011-12-30)', () => {
    expect(flagged(2011, 12, 30, 'Pacific/Apia')).toHaveLength(24)
    expect(flagged(2011, 12, 31, 'Pacific/Apia')).toEqual([])
  })
})
