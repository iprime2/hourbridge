import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  countryName,
  countryOfZone,
  coverageGaps,
  daysBetween,
  coverageNote,
  hasHolidayData,
  holidayGroups,
  holidayCoverage,
  holidayNames,
  HOLIDAY_YEARS,
  loadCountryHolidays,
  lookupHolidays,
  peekCountryHolidays,
  setHolidayLoader,
  upcomingHolidays,
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

describe('daysBetween', () => {
  const day = (year: number, month: number, d: number) => ({ year, month, day: d })

  it('counts whole calendar days, in either direction', () => {
    expect(daysBetween(day(2026, 1, 26), day(2026, 1, 26))).toBe(0)
    expect(daysBetween(day(2026, 1, 26), day(2026, 1, 27))).toBe(1)
    expect(daysBetween(day(2026, 1, 26), day(2026, 1, 25))).toBe(-1)
    expect(daysBetween(day(2025, 12, 30), day(2026, 1, 2))).toBe(3)
  })

  it('is not thrown by leap years or by daylight saving (no clock is involved)', () => {
    expect(daysBetween(day(2028, 2, 28), day(2028, 3, 1))).toBe(2) // 2028 has a 29 February
    expect(daysBetween(day(2027, 2, 28), day(2027, 3, 1))).toBe(1)
    expect(daysBetween(day(2026, 3, 7), day(2026, 3, 9))).toBe(2) // US clocks change on the 8th
    expect(daysBetween(day(2026, 1, 1), day(2027, 1, 1))).toBe(365)
  })
})

describe('upcomingHolidays', () => {
  const table: CountryHolidays = {
    '2026': [
      ['12-25', 'Christmas Day'],
      ['01-01', "New Year's Day"],
      ['04-03', 'Good Friday'],
      ['04-03', 'Another holiday'],
      ['05-01', 'Labour Day'],
      ['12-26', 'Boxing Day']
    ],
    '2027': [
      ['01-01', "New Year's Day"],
      ['03-26', 'Good Friday']
    ]
  }
  const on = (year: number, month: number, day: number) => ({ year, month, day })
  const dates = (days: ReturnType<typeof upcomingHolidays>) => days.map((d) => `${d.year}-${d.month}-${d.day}`)

  it('lists the next holiday days in date order, whatever order the table is in', () => {
    expect(dates(upcomingHolidays(table, on(2026, 1, 1), 3))).toEqual(['2026-1-1', '2026-4-3', '2026-5-1'])
  })

  it('starts on the day itself, not the day after', () => {
    expect(dates(upcomingHolidays(table, on(2026, 4, 3), 1))).toEqual(['2026-4-3'])
    expect(dates(upcomingHolidays(table, on(2026, 4, 4), 1))).toEqual(['2026-5-1'])
  })

  it('makes two holidays on one day a single entry, and counts it once', () => {
    const days = upcomingHolidays(table, on(2026, 2, 1), 2)
    expect(days[0]).toEqual({ year: 2026, month: 4, day: 3, names: ['Good Friday', 'Another holiday'] })
    expect(days).toHaveLength(2)
  })

  it('still collects every holiday of the last day it returns', () => {
    const days = upcomingHolidays(table, on(2026, 2, 1), 1)
    expect(days).toEqual([{ year: 2026, month: 4, day: 3, names: ['Good Friday', 'Another holiday'] }])
  })

  it('carries on into the next year', () => {
    expect(dates(upcomingHolidays(table, on(2026, 12, 25), 5))).toEqual([
      '2026-12-25',
      '2026-12-26',
      '2027-1-1',
      '2027-3-26'
    ])
  })

  it('returns fewer than asked for at the end of the data, and nothing after it', () => {
    expect(upcomingHolidays(table, on(2027, 3, 26), 5)).toHaveLength(1)
    expect(upcomingHolidays(table, on(2027, 3, 27), 5)).toEqual([])
    expect(upcomingHolidays(table, on(2031, 1, 1), 5)).toEqual([])
  })

  it('starts at the first year it has when asked about an earlier one', () => {
    expect(dates(upcomingHolidays(table, on(2020, 6, 1), 2))).toEqual(['2026-1-1', '2026-4-3'])
  })

  it('has nothing for no table, an empty one, or a count below one', () => {
    expect(upcomingHolidays(null, on(2026, 1, 1))).toEqual([])
    expect(upcomingHolidays(undefined, on(2026, 1, 1))).toEqual([])
    expect(upcomingHolidays({}, on(2026, 1, 1))).toEqual([])
    expect(upcomingHolidays(table, on(2026, 1, 1), 0)).toEqual([])
  })

  it('does not change the table it is given', () => {
    const before = JSON.stringify(table)
    upcomingHolidays(table, on(2026, 1, 1), 5)
    expect(JSON.stringify(table)).toBe(before)
  })

  it('works on the real data: India after Republic Day has Independence Day among the next few', async () => {
    setHolidayLoader()
    const india = await loadCountryHolidays('IN')
    const names = upcomingHolidays(india, on(2026, 1, 27), 5).flatMap((d) => d.names)
    expect(names).toContain('Independence Day')
    expect(names).not.toContain('Republic Day')
  })
})

describe('holidayGroups', () => {
  const city = (label: string, iana: string) => ({ label, iana })

  it('lists each country once, in the order its first city appears, with all its cities', () => {
    const groups = holidayGroups([
      city('IST', 'Asia/Kolkata'),
      city('Miami', 'America/New_York'),
      city('Tokyo', 'Asia/Tokyo'),
      city('Los Angeles', 'America/Los_Angeles')
    ])
    expect(groups.map((g) => [g.code, g.country, g.cities])).toEqual([
      ['IN', 'India', ['IST']],
      ['US', 'United States', ['Miami', 'Los Angeles']],
      ['JP', 'Japan', ['Tokyo']]
    ])
  })

  it('takes "today" from the first city of a country', () => {
    expect(holidayGroups([city('Miami', 'America/New_York'), city('LA', 'America/Los_Angeles')])[0].zone).toBe('America/New_York')
  })

  it('treats an alias of a zone as the same country', () => {
    const groups = holidayGroups([city('Delhi', 'Asia/Calcutta'), city('Mumbai', 'Asia/Kolkata')])
    expect(groups).toHaveLength(1)
    expect(groups[0].cities).toEqual(['Delhi', 'Mumbai'])
  })

  it('keeps a zone with no country, one group per zone, instead of dropping it', () => {
    const groups = holidayGroups([city('UTC', 'UTC'), city('Also UTC', 'UTC'), city('Offset', 'Etc/GMT+5')])
    expect(groups.map((g) => [g.key, g.code, g.country, g.cities])).toEqual([
      ['UTC', null, null, ['UTC', 'Also UTC']],
      ['Etc/GMT+5', null, null, ['Offset']]
    ])
  })

  it('includes a country with no data (its row says so), and is empty for no cities', () => {
    expect(holidayGroups([city('Kathmandu', 'Asia/Kathmandu')])[0]).toMatchObject({ code: 'NP', country: 'Nepal' })
    expect(holidayGroups([])).toEqual([])
  })
})
