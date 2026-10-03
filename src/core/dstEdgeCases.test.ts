import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import { describeDstChange, getDstInfo } from '@core/dst'
import { getOffsetHoursRelativeToHome, instantFromHomeDateTime } from '@core/timeEngine'

const at = (iso: string, zone = 'UTC') => DateTime.fromISO(iso, { zone })

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

describe('home zone with DST: wall times that do not exist or happen twice', () => {
  it('moves a wall time inside the spring-forward gap to the next valid minute', () => {
    // New York 2025-03-09: 02:00 EST jumps straight to 03:00 EDT, so 02:30 never happens.
    const instant = instantFromHomeDateTime(
      { year: 2025, month: 3, day: 9, hour: 2, minute: 30 },
      'America/New_York'
    )
    expect(instant.toUTC().toISO()).toBe('2025-03-09T07:30:00.000Z') // 03:30 EDT
  })

  it('takes the first occurrence of a wall time that repeats on fall-back', () => {
    // New York 2025-11-02: 01:30 happens in EDT and again in EST; we get the EDT one.
    const instant = instantFromHomeDateTime(
      { year: 2025, month: 11, day: 2, hour: 1, minute: 30 },
      'America/New_York'
    )
    expect(instant.toUTC().toISO()).toBe('2025-11-02T05:30:00.000Z')
  })

  // Known gaps: buildDayTimeline builds each column from a home wall-clock hour (0-23), so a
  // home zone that observes DST gets a malformed timeline on its two transition days.
  it.todo(
    'buildDayTimeline: spring-forward day has no duplicate column (home New York 2025-03-09 currently gives columns 2 and 3 the same instant, 07:00 UTC)'
  )
  it.todo(
    'buildDayTimeline: fall-back day shows the repeated hour (home New York 2025-11-02 currently skips the 01:00 EST hour, 06:00 UTC)'
  )
})
