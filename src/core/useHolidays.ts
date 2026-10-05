import { useEffect, useMemo, useState } from 'react'
import {
  countryOfZone,
  hasHolidayData,
  loadCountryHolidays,
  lookupHolidays,
  peekCountryHolidays,
  type CountryHolidays,
  type HolidayLookup
} from './holidays'
import type { Location } from './timezones'

/** The countries of these cities that the holiday data covers, sorted, each once. */
export function holidayCountries(locations: readonly Location[]): string[] {
  const codes = new Set<string>()
  for (const { iana } of locations) {
    const code = countryOfZone(iana)
    if (code && hasHolidayData(code)) codes.add(code)
  }
  return [...codes].sort()
}

/**
 * Public holidays for the cities on screen. Each country's file is fetched the first time a city
 * in it appears; until it arrives the lookup answers "no holiday", then the returned function
 * changes identity so whatever was built from it is built again. The identity is stable otherwise.
 */
export function useHolidayLookup(locations: readonly Location[]): HolidayLookup {
  const key = holidayCountries(locations).join(',')
  const [arrived, setArrived] = useState(0)

  useEffect(() => {
    const missing = (key ? key.split(',') : []).filter((code) => peekCountryHolidays(code) === undefined)
    if (missing.length === 0) return
    let live = true
    void Promise.all(missing.map(loadCountryHolidays)).then(() => {
      if (live) setArrived((n) => n + 1)
    })
    return () => {
      live = false
    }
  }, [key])

  // `arrived` and `key` are what make a new function: the lookup itself reads the shared cache.
  return useMemo<HolidayLookup>(() => (iana, day) => lookupHolidays(iana, day), [arrived, key])
}

/**
 * One country's whole holiday table, for a list rather than a day-by-day lookup: `undefined` while
 * it loads, `null` when there is none (no data for the country, a zone with no country, or a file
 * that could not be fetched — `holidayCoverage` tells the first two from the last).
 */
export function useCountryHolidays(code: string | null): CountryHolidays | null | undefined {
  // What arrived for which country, so a change of country never shows the previous one's table.
  const [arrived, setArrived] = useState<{ code: string; table: CountryHolidays | null } | null>(null)
  const covered = code !== null && hasHolidayData(code)
  const cached = covered ? peekCountryHolidays(code) : null

  useEffect(() => {
    if (!covered || cached !== undefined) return
    let live = true
    void loadCountryHolidays(code).then((table) => {
      if (live) setArrived({ code, table })
    })
    return () => {
      live = false
    }
  }, [code, covered, cached])

  if (!covered) return null
  if (cached !== undefined) return cached
  return arrived?.code === code ? arrived.table : undefined
}
