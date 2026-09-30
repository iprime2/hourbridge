import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import { buildWidgetRows } from '@core/widgetRows'
import { DEFAULT_LOCATIONS, type Location } from '@core/timezones'

describe('buildWidgetRows', () => {
  const now = DateTime.fromISO('2024-06-15T12:00:00', { zone: 'Asia/Kolkata' })

  it('marks home with isHome and offset "home"', () => {
    const rows = buildWidgetRows(DEFAULT_LOCATIONS, '12h', now)
    const ist = rows.find((r) => r.id === 'ist')
    expect(ist).toMatchObject({
      label: 'IST',
      isHome: true,
      offset: 'home'
    })
    expect(ist?.time).toMatch(/12:00\s*pm/i)
  })

  it('formats non-home offsets relative to home', () => {
    const rows = buildWidgetRows(DEFAULT_LOCATIONS, '12h', now)
    const tokyo = rows.find((r) => r.id === 'tokyo')
    expect(tokyo?.isHome).toBe(false)
    expect(tokyo?.offset).toMatch(/^\+/)
    expect(tokyo?.time.length).toBeGreaterThan(0)

    const miami = rows.find((r) => r.id === 'miami')
    expect(miami?.isHome).toBe(false)
    expect(miami?.offset).toMatch(/^−/)
  })

  it('formats times in 24h mode', () => {
    const rows = buildWidgetRows(DEFAULT_LOCATIONS, '24h', now)
    const ist = rows.find((r) => r.id === 'ist')
    expect(ist?.time).toBe('12:00')
  })

  it('preserves location ordering', () => {
    const rows = buildWidgetRows(DEFAULT_LOCATIONS, '12h', now)
    expect(rows.map((r) => r.id)).toEqual(DEFAULT_LOCATIONS.map((l) => l.id))
  })

  it('treats location matching home id as home when isHome flag is absent', () => {
    const locations: Location[] = [
      { id: 'london', label: 'London', iana: 'Europe/London', isHome: true },
      { id: 'tokyo', label: 'Tokyo', iana: 'Asia/Tokyo' }
    ]
    const rows = buildWidgetRows(locations, '24h', now)
    expect(rows[0]).toMatchObject({ id: 'london', isHome: true })
    // offsetForLocation only returns "home" when location.isHome is set
    expect(rows[0].offset).toBe('home')
    expect(rows[1].isHome).toBe(false)
  })
})


describe('buildWidgetRows — can you reach them right now?', () => {
  const home = { id: 'ist', label: 'IST', iana: 'Asia/Kolkata', isHome: true }
  const cities = [
    home,
    { id: 'london', label: 'London', iana: 'Europe/London' },
    { id: 'miami', label: 'Miami', iana: 'America/New_York' },
    { id: 'tokyo', label: 'Tokyo', iana: 'Asia/Tokyo' }
  ]
  const phases = (iso: string) =>
    Object.fromEntries(
      buildWidgetRows(cities, '12h', DateTime.fromISO(iso, { zone: 'Asia/Kolkata' }), {
        start: 9,
        end: 17
      }).map((r) => [r.id, r.phase])
    )

  it('is "work" for everyone who is awake while you are in your working hours', () => {
    // Mon 15:00 IST = London 09:30, Tokyo 18:30 (awake) and Miami 04:30 (asleep).
    expect(phases('2024-01-15T15:00:00')).toEqual({
      ist: 'work',
      london: 'work',
      miami: 'night',
      tokyo: 'work'
    })
  })

  it('is "awake" once you are outside your hours, and still "night" for sleepers', () => {
    // Mon 20:00 IST = London 14:30, Miami 09:30, Tokyo 23:30 (asleep).
    expect(phases('2024-01-15T20:00:00')).toEqual({
      ist: 'awake',
      london: 'awake',
      miami: 'awake',
      tokyo: 'night'
    })
  })

  it('never shows "work" on a weekend', () => {
    expect(Object.values(phases('2024-01-20T15:00:00'))).not.toContain('work')
  })

  it('includes the end hour: 17:59 is still your working time', () => {
    expect(phases('2024-01-15T17:59:00').ist).toBe('work')
    expect(phases('2024-01-15T18:00:00').ist).toBe('awake')
  })
})
