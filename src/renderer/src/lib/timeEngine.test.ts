import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import { DEFAULT_LOCATIONS, HOME_TIMEZONE, getHomeLocation } from '@renderer/lib/timezones'
import {
  buildDayTimeline,
  classifyDayNight,
  compareHomeHourAcrossZones,
  formatTime,
  getLocalWallTime,
  getOffsetHoursRelativeToHome,
  instantFromHomeDateTime
} from '@renderer/lib/timeEngine'

/** Fixed summer date in IST (Miami on EDT). */
const SUMMER_DATE = { year: 2024, month: 7, day: 15 }
/** Fixed winter date in IST (Miami on EST). */
const WINTER_DATE = { year: 2024, month: 1, day: 15 }

const ZONES = {
  miami: 'America/New_York',
  ist: HOME_TIMEZONE,
  sydney: 'Australia/Sydney',
  london: 'Europe/London',
  tokyo: 'Asia/Tokyo'
} as const

describe('location catalog', () => {
  it('defaults home to Asia/Kolkata and includes expected cities', () => {
    expect(HOME_TIMEZONE).toBe('Asia/Kolkata')
    expect(getHomeLocation().iana).toBe(HOME_TIMEZONE)
    expect(DEFAULT_LOCATIONS.map((l) => l.label)).toEqual([
      'Miami',
      'IST',
      'AEST',
      'London',
      'Tokyo'
    ])
    expect(DEFAULT_LOCATIONS.find((l) => l.label === 'Miami')?.iana).toBe('America/New_York')
  })
})

describe('IST noon maps to known local times', () => {
  it('maps summer IST noon to correct London/Tokyo/Sydney/Miami wall times', () => {
    // 2024-07-15 12:00 IST = 06:30 UTC
    const instant = instantFromHomeDateTime({ ...SUMMER_DATE, hour: 12, minute: 0 })

    expect(instant.toUTC().toISO()).toBe('2024-07-15T06:30:00.000Z')

    const miami = getLocalWallTime(instant, ZONES.miami)
    const london = getLocalWallTime(instant, ZONES.london)
    const tokyo = getLocalWallTime(instant, ZONES.tokyo)
    const sydney = getLocalWallTime(instant, ZONES.sydney)
    const ist = getLocalWallTime(instant, ZONES.ist)

    expect(ist).toMatchObject({ hour: 12, minute: 0, zone: ZONES.ist })
    // EDT (UTC-4): 02:30
    expect(miami).toMatchObject({ hour: 2, minute: 30, zone: ZONES.miami })
    // BST (UTC+1): 07:30
    expect(london).toMatchObject({ hour: 7, minute: 30, zone: ZONES.london })
    // JST (UTC+9): 15:30
    expect(tokyo).toMatchObject({ hour: 15, minute: 30, zone: ZONES.tokyo })
    // AEST winter (UTC+10): 16:30
    expect(sydney).toMatchObject({ hour: 16, minute: 30, zone: ZONES.sydney })
  })

  it('maps winter IST noon correctly when Miami is on EST', () => {
    // 2024-01-15 12:00 IST = 06:30 UTC
    const instant = instantFromHomeDateTime({ ...WINTER_DATE, hour: 12, minute: 0 })

    expect(instant.toUTC().toISO()).toBe('2024-01-15T06:30:00.000Z')

    const miami = getLocalWallTime(instant, ZONES.miami)
    const london = getLocalWallTime(instant, ZONES.london)
    const sydney = getLocalWallTime(instant, ZONES.sydney)

    // EST (UTC-5): 01:30
    expect(miami).toMatchObject({ hour: 1, minute: 30 })
    // GMT (UTC+0): 06:30
    expect(london).toMatchObject({ hour: 6, minute: 30 })
    // AEDT summer (UTC+11): 17:30
    expect(sydney).toMatchObject({ hour: 17, minute: 30 })
  })
})

describe('offset relative to home (IST)', () => {
  it('is -9.5 for Miami in summer (EDT)', () => {
    const instant = instantFromHomeDateTime({ ...SUMMER_DATE, hour: 12 })
    expect(getOffsetHoursRelativeToHome(instant, ZONES.miami)).toBe(-9.5)
  })

  it('is -10.5 for Miami in winter (EST)', () => {
    const instant = instantFromHomeDateTime({ ...WINTER_DATE, hour: 12 })
    expect(getOffsetHoursRelativeToHome(instant, ZONES.miami)).toBe(-10.5)
  })
})

describe('compareHomeHourAcrossZones', () => {
  it('selecting IST hour 10 yields one coherent absolute instant across zones', () => {
    const zones = Object.values(ZONES)
    const result = compareHomeHourAcrossZones(
      { ...SUMMER_DATE, hour: 10, minute: 0 },
      zones
    )

    expect(result.instant.toUTC().toISO()).toBe('2024-07-15T04:30:00.000Z')

    const byZone = Object.fromEntries(result.locals.map((l) => [l.zone, l]))
    expect(byZone[ZONES.ist]).toMatchObject({ hour: 10, minute: 0 })
    // IST 10:00 → Miami 00:30 (EDT, −9.5h)
    expect(byZone[ZONES.miami]).toMatchObject({ hour: 0, minute: 30 })
    // → London 05:30 BST
    expect(byZone[ZONES.london]).toMatchObject({ hour: 5, minute: 30 })
    // → Tokyo 13:30
    expect(byZone[ZONES.tokyo]).toMatchObject({ hour: 13, minute: 30 })
    // → Sydney 14:30 AEST
    expect(byZone[ZONES.sydney]).toMatchObject({ hour: 14, minute: 30 })

    // All locals must share the same absolute millisecond
    const ms = result.instant.toMillis()
    for (const local of result.locals) {
      expect(
        DateTime.fromObject(
          {
            year: local.year,
            month: local.month,
            day: local.day,
            hour: local.hour,
            minute: local.minute
          },
          { zone: local.zone }
        ).toMillis()
      ).toBe(ms)
    }
  })
})

describe('buildDayTimeline half-hour offsets', () => {
  it('shows :30 minutes for whole-hour zones when home is IST', () => {
    const timeline = buildDayTimeline(SUMMER_DATE, [ZONES.ist, ZONES.miami, ZONES.london])

    expect(timeline).toHaveLength(24)

    const col10 = timeline[10]
    expect(col10.homeHour).toBe(10)
    expect(col10.cells[ZONES.ist]).toMatchObject({ hour: 10, minute: 0 })
    expect(col10.cells[ZONES.miami]).toMatchObject({ hour: 0, minute: 30 })
    expect(col10.cells[ZONES.london]).toMatchObject({ hour: 5, minute: 30 })

    const col0 = timeline[0]
    expect(col0.cells[ZONES.ist]).toMatchObject({ hour: 0, minute: 0 })
    // IST midnight = previous calendar day 14:30 EDT
    expect(col0.cells[ZONES.miami]).toMatchObject({ hour: 14, minute: 30 })
  })
})

describe('formatTime', () => {
  it('formats 12h and 24h modes', () => {
    expect(formatTime(0, 0, '24h')).toBe('00:00')
    expect(formatTime(13, 30, '24h')).toBe('13:30')
    expect(formatTime(0, 0, '12h')).toBe('12:00 AM')
    expect(formatTime(12, 0, '12h')).toBe('12:00 PM')
    expect(formatTime(13, 30, '12h')).toBe('1:30 PM')
    expect(formatTime(9, 5, '12h')).toBe('9:05 AM')
  })

  it('throws on invalid hour or minute', () => {
    expect(() => formatTime(24, 0, '24h')).toThrow(/hour must be an integer 0–23/)
    expect(() => formatTime(-1, 0, '12h')).toThrow(/hour must be an integer 0–23/)
    expect(() => formatTime(10, 60, '24h')).toThrow(/minute must be an integer 0–59/)
    expect(() => formatTime(10.5, 0, '24h')).toThrow(/hour must be an integer 0–23/)
  })
})

describe('compareHomeHourAcrossZones edge cases', () => {
  it('returns empty locals for an empty zone list', () => {
    const result = compareHomeHourAcrossZones({ ...SUMMER_DATE, hour: 12 }, [])
    expect(result.locals).toEqual([])
    expect(result.instant.isValid).toBe(true)
  })

  it('stays coherent across the US DST spring-forward boundary', () => {
    // 2024-03-10: US clocks spring forward 02:00 → 03:00 local.
    // Same IST wall clock before vs after should remain one absolute instant each,
    // and Miami local hour shifts by +1 once EDT is in effect.
    const before = compareHomeHourAcrossZones(
      { year: 2024, month: 3, day: 9, hour: 12, minute: 0 },
      [ZONES.ist, ZONES.miami]
    )
    const after = compareHomeHourAcrossZones(
      { year: 2024, month: 3, day: 11, hour: 12, minute: 0 },
      [ZONES.ist, ZONES.miami]
    )

    for (const result of [before, after]) {
      const ms = result.instant.toMillis()
      for (const local of result.locals) {
        expect(
          DateTime.fromObject(
            {
              year: local.year,
              month: local.month,
              day: local.day,
              hour: local.hour,
              minute: local.minute
            },
            { zone: local.zone }
          ).toMillis()
        ).toBe(ms)
      }
    }

    const miamiBefore = before.locals.find((l) => l.zone === ZONES.miami)!
    const miamiAfter = after.locals.find((l) => l.zone === ZONES.miami)!
    expect(miamiBefore).toMatchObject({ hour: 1, minute: 30 })
    expect(miamiAfter).toMatchObject({ hour: 2, minute: 30 })
  })
})

describe('classifyDayNight', () => {
  /**
   * Night = hours 0–5 and 22–23; day = 6–21 (inclusive).
   * Classification uses the local hour of the tile (0–23).
   */
  it('classifies night and day sample hours', () => {
    for (const h of [0, 1, 5, 22, 23]) {
      expect(classifyDayNight(h)).toBe('night')
    }
    for (const h of [6, 12, 18, 21]) {
      expect(classifyDayNight(h)).toBe('day')
    }
  })

  it('throws on out-of-range hours', () => {
    expect(() => classifyDayNight(24)).toThrow(/hour must be an integer 0–23/)
    expect(() => classifyDayNight(-1)).toThrow(/hour must be an integer 0–23/)
  })
})
