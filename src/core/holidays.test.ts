import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  countryName,
  countryOfZone,
  coverageGaps,
  coverageNote,
  hasHolidayData,
  holidayCoverage,
  holidayNames,
  HOLIDAY_YEARS,
  loadCountryHolidays,
  lookupHolidays,
  peekCountryHolidays,
  setHolidayLoader,
  type CountryHolidays
} from '@core/holidays'

describe('countryOfZone', () => {
  it.each([
    ['Asia/Kolkata', 'IN'],
    ['America/New_York', 'US'],
    ['America/Los_Angeles', 'US'],
    ['Europe/London', 'GB'],
    ['Australia/Sydney', 'AU'],
    ['Asia/Tokyo', 'JP']
  ])('%s is in %s', (zone, country) => {
    expect(countryOfZone(zone)).toBe(country)
  })

  it('knows the other names of a zone', () => {
    expect(countryOfZone('Asia/Calcutta')).toBe('IN')
    expect(countryOfZone('Asia/Katmandu')).toBe('NP')
    expect(countryOfZone('Europe/Kiev')).toBe('UA')
  })

  it('does not put a small neighbour in the big country that shares its clock', () => {
    expect(countryOfZone('Europe/Vaduz')).toBe('LI') // not CH, although both keep Zurich time
    expect(countryOfZone('Europe/Zurich')).toBe('CH')
  })

  it('has no country for UTC or an unknown zone', () => {
    expect(countryOfZone('UTC')).toBeNull()
    expect(countryOfZone('Etc/GMT+5')).toBeNull()
    expect(countryOfZone('Mars/Olympus')).toBeNull()
  })

  it('names countries', () => {
    expect(countryName('IN')).toBe('India')
    expect(countryName('US')).toBe('United States')
    expect(countryName('ZZ')).toBe('ZZ') // unknown code: show the code rather than nothing
  })
})

describe('holidayCoverage', () => {
  it('says how far "no holiday shown" can be trusted', () => {
    expect(holidayCoverage('US')).toBe('full')
    expect(holidayCoverage('IN')).toBe('partial')
    expect(holidayCoverage('NP')).toBe('none')
    expect(holidayCoverage(null)).toBe('unknown')
  })

  it('explains what is missing from a partial country, and only from one', () => {
    expect(coverageNote('IN')).toMatch(/Holi, Diwali and Eid/)
    expect(coverageNote('US')).toBeNull()
    expect(coverageNote(null)).toBeNull()
  })
})

describe('holidayNames (pure)', () => {
  const table: CountryHolidays = {
    '2026': [
      ['01-01', "New Year's Day"],
      ['04-03', 'Good Friday'],
      ['04-03', 'Another holiday'],
      ['12-25', 'Christmas Day']
    ]
  }

  it('returns every holiday on the day', () => {
    expect(holidayNames(table, { year: 2026, month: 4, day: 3 })).toEqual(['Good Friday', 'Another holiday'])
    expect(holidayNames(table, { year: 2026, month: 12, day: 25 })).toEqual(['Christmas Day'])
  })

  it('returns nothing on an ordinary day, for a year it has no data for, and for no table', () => {
    expect(holidayNames(table, { year: 2026, month: 4, day: 4 })).toEqual([])
    expect(holidayNames(table, { year: 2031, month: 1, day: 1 })).toEqual([])
    expect(holidayNames(null, { year: 2026, month: 1, day: 1 })).toEqual([])
    expect(holidayNames(undefined, { year: 2026, month: 1, day: 1 })).toEqual([])
  })

  it('matches month and day exactly, not as a prefix', () => {
    expect(holidayNames(table, { year: 2026, month: 1, day: 10 })).toEqual([]) // "01-10" is not "01-01"
    expect(holidayNames(table, { year: 2026, month: 11, day: 25 })).toEqual([])
  })
})

describe('loading a country', () => {
  beforeEach(() => setHolidayLoader()) // the real files (the shared setup turns holidays off)

  it('loads a covered country once and serves it from memory afterwards', async () => {
    expect(peekCountryHolidays('GB')).toBeUndefined() // not asked for yet
    const first = await loadCountryHolidays('GB')
    expect(first).not.toBeNull()
    expect(peekCountryHolidays('GB')).toBe(first)
    expect(await loadCountryHolidays('GB')).toBe(first)
  })

  it('shares one load between simultaneous callers', async () => {
    const [a, b] = await Promise.all([loadCountryHolidays('DE'), loadCountryHolidays('DE')])
    expect(a).toBe(b)
  })

  it('has the well-known fixed-date holidays', async () => {
    const us = await loadCountryHolidays('US')
    expect(holidayNames(us, { year: 2026, month: 7, day: 4 })).toContain('Independence Day')
    expect(holidayNames(us, { year: 2026, month: 12, day: 25 })).toContain('Christmas Day')
    const de = await loadCountryHolidays('DE')
    expect(holidayNames(de, { year: 2026, month: 10, day: 3 }).length).toBeGreaterThan(0)
    const inn = await loadCountryHolidays('IN')
    expect(holidayNames(inn, { year: 2026, month: 1, day: 26 })).toEqual(['Republic Day'])
  })

  it('moves Easter with the year, not with the calendar', async () => {
    const gb = await loadCountryHolidays('GB')
    expect(holidayNames(gb, { year: 2026, month: 4, day: 3 })).toContain('Good Friday')
    expect(holidayNames(gb, { year: 2027, month: 3, day: 26 })).toContain('Good Friday')
    expect(holidayNames(gb, { year: 2027, month: 4, day: 3 })).not.toContain('Good Friday')
  })

  it('resolves to null for a country with no data and for anything that is not a country code', async () => {
    expect(await loadCountryHolidays('NP')).toBeNull()
    expect(peekCountryHolidays('NP')).toBeUndefined() // never even attempted
    for (const bad of ['', 'us', 'USA', '../zones', 'U', 'ZZ', '__proto__']) {
      expect(await loadCountryHolidays(bad), bad).toBeNull()
    }
  })

  it('covers the years it says it covers', async () => {
    const [from, to] = HOLIDAY_YEARS
    const jp = (await loadCountryHolidays('JP'))!
    expect(Object.keys(jp).map(Number)).toEqual(Array.from({ length: to - from + 1 }, (_, i) => from + i))
  })
})

describe('lookupHolidays (by zone, from what is loaded)', () => {
  beforeEach(() => setHolidayLoader())

  it('finds the holiday once the country has loaded, and is empty before', async () => {
    const day = { year: 2026, month: 1, day: 1 }
    expect(lookupHolidays('Europe/Paris', day)).toEqual([]) // France not loaded yet
    await loadCountryHolidays('FR')
    expect(lookupHolidays('Europe/Paris', day)).not.toEqual([])
  })

  it('reaches a country through any of its zones and aliases', async () => {
    await loadCountryHolidays('IN')
    const day = { year: 2026, month: 8, day: 15 }
    expect(lookupHolidays('Asia/Kolkata', day)).toEqual(['Independence Day'])
    expect(lookupHolidays('Asia/Calcutta', day)).toEqual(['Independence Day'])
  })

  it('is empty for UTC and for a country with no data', () => {
    expect(lookupHolidays('UTC', { year: 2026, month: 1, day: 1 })).toEqual([])
    expect(lookupHolidays('Asia/Kathmandu', { year: 2026, month: 1, day: 1 })).toEqual([])
  })
})

describe('hasHolidayData', () => {
  it('is true for covered countries (even partly) and false for everything else', () => {
    expect(hasHolidayData('US')).toBe(true)
    expect(hasHolidayData('IN')).toBe(true) // partial, but there is data
    expect(hasHolidayData('NP')).toBe(false)
    expect(hasHolidayData('ZZ')).toBe(false)
    expect(hasHolidayData('__proto__')).toBe(false)
    expect(hasHolidayData(null)).toBe(false)
  })
})

describe('setHolidayLoader (the test seam)', () => {
  const table: CountryHolidays = { '2026': [['03-14', 'Pi Day']] }

  it('serves what the replacement loader returns, once, and forgets it on the next swap', async () => {
    const load = vi.fn(async (_code: string) => table)
    setHolidayLoader(load)
    expect(await loadCountryHolidays('FR')).toBe(table)
    expect(await loadCountryHolidays('FR')).toBe(table)
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith('FR')
    expect(lookupHolidays('Europe/Paris', { year: 2026, month: 3, day: 14 })).toEqual(['Pi Day'])

    setHolidayLoader(null)
    expect(peekCountryHolidays('FR')).toBeUndefined()
    expect(lookupHolidays('Europe/Paris', { year: 2026, month: 3, day: 14 })).toEqual([])
  })

  it('null means no holidays anywhere', async () => {
    setHolidayLoader(null)
    expect(await loadCountryHolidays('US')).toBeNull()
    expect(lookupHolidays('America/New_York', { year: 2026, month: 12, day: 25 })).toEqual([])
  })

  it('never calls the loader for a code that is not a covered country', async () => {
    const load = vi.fn(async (_code: string) => table)
    setHolidayLoader(load)
    for (const code of ['NP', 'ZZ', 'us', '../zones']) await loadCountryHolidays(code)
    expect(load).not.toHaveBeenCalled()
  })

  it('treats a loader that fails as "not loaded yet" and tries again next time', async () => {
    const load = vi
      .fn<(code: string) => Promise<CountryHolidays | null>>()
      .mockRejectedValueOnce(new Error('chunk failed to load'))
      .mockResolvedValue(table)
    setHolidayLoader(load)
    expect(await loadCountryHolidays('FR')).toBeNull()
    expect(peekCountryHolidays('FR')).toBeUndefined() // not remembered as "France has none"
    expect(await loadCountryHolidays('FR')).toBe(table)
    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('coverageGaps', () => {
  it('lists the countries the data covers only in part, or not at all, once each and by name', () => {
    const gaps = coverageGaps(['Asia/Kolkata', 'Asia/Calcutta', 'Asia/Kathmandu', 'America/New_York', 'UTC', 'Asia/Tokyo'])
    expect(gaps.map((g) => [g.country, g.coverage])).toEqual([
      ['India', 'partial'],
      ['Nepal', 'none']
    ])
    expect(gaps[0].note).toMatch(/Holi, Diwali and Eid/)
    expect(gaps[1].note).toBeNull()
  })

  it('is empty when everything is covered, and for no zones', () => {
    expect(coverageGaps(['America/New_York', 'Europe/London', 'UTC'])).toEqual([])
    expect(coverageGaps([])).toEqual([])
  })
})
