import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setHolidayLoader, type CountryHolidays } from '@core/holidays'
import { holidayCountries, useCountryHolidays, useHolidayLookup } from '@core/useHolidays'
import type { Location } from '@core/timezones'

const city = (id: string, iana: string): Location => ({ id, label: id, iana })
const DELHI = city('delhi', 'Asia/Kolkata')
const TOKYO = city('tokyo', 'Asia/Tokyo')
const PARIS = city('paris', 'Europe/Paris')
const KATHMANDU = city('kathmandu', 'Asia/Kathmandu') // no data for Nepal
const UTC = city('utc', 'UTC')
const NEW_YEAR = { year: 2026, month: 1, day: 1 }

const table = (name: string): CountryHolidays => ({ '2026': [['01-01', name]] })

describe('holidayCountries', () => {
  it('lists each covered country once, sorted, and skips zones with no country or no data', () => {
    const NY = city('ny', 'America/New_York')
    const LA = city('la', 'America/Los_Angeles')
    expect(holidayCountries([TOKYO, NY, DELHI, LA, KATHMANDU, UTC])).toEqual(['IN', 'JP', 'US'])
    expect(holidayCountries([])).toEqual([])
  })
})

describe('useHolidayLookup', () => {
  beforeEach(() => setHolidayLoader(null))

  it('answers "no holiday" until a country arrives, then answers with it', async () => {
    let release!: (value: CountryHolidays) => void
    setHolidayLoader(() => new Promise<CountryHolidays>((resolve) => (release = resolve)))
    const { result } = renderHook(() => useHolidayLookup([DELHI]))
    const before = result.current
    expect(before('Asia/Kolkata', NEW_YEAR)).toEqual([])

    await act(async () => release(table("New Year's Day")))
    await waitFor(() => expect(result.current).not.toBe(before))
    expect(result.current('Asia/Kolkata', NEW_YEAR)).toEqual(["New Year's Day"])
  })

  it('keeps the same function while nothing changes, so memoised timelines are not rebuilt', async () => {
    setHolidayLoader(async () => table('Holiday'))
    const locations = [DELHI]
    const { result, rerender } = renderHook(({ list }) => useHolidayLookup(list), { initialProps: { list: locations } })
    await waitFor(() => expect(result.current('Asia/Kolkata', NEW_YEAR)).toEqual(['Holiday']))
    const settled = result.current
    rerender({ list: [...locations] }) // a new array with the same cities
    rerender({ list: [{ ...DELHI, label: 'Renamed' }] }) // a rename is not a new country
    expect(result.current).toBe(settled)
  })

  it('fetches a country once, however many cities are in it or rerenders there are', async () => {
    const load = vi.fn(async (_code: string) => table('Holiday'))
    setHolidayLoader(load)
    const second = city('delhi2', 'Asia/Calcutta')
    const { result, rerender } = renderHook(({ list }) => useHolidayLookup(list), { initialProps: { list: [DELHI, second] } })
    await waitFor(() => expect(result.current('Asia/Kolkata', NEW_YEAR)).toEqual(['Holiday']))
    rerender({ list: [DELHI, second] })
    rerender({ list: [DELHI] })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('loads a newly added city\'s country and keeps the ones it already has', async () => {
    setHolidayLoader(async (code) => table(`holiday in ${code}`))
    const { result, rerender } = renderHook(({ list }) => useHolidayLookup(list), { initialProps: { list: [DELHI] } })
    await waitFor(() => expect(result.current('Asia/Kolkata', NEW_YEAR)).toEqual(['holiday in IN']))
    expect(result.current('Europe/Paris', NEW_YEAR)).toEqual([])
    rerender({ list: [DELHI, PARIS] })
    await waitFor(() => expect(result.current('Europe/Paris', NEW_YEAR)).toEqual(['holiday in FR']))
    expect(result.current('Asia/Kolkata', NEW_YEAR)).toEqual(['holiday in IN'])
  })

  it('does not load anything for cities that have no holiday data, and does not rerender for them', async () => {
    const load = vi.fn(async (_code: string) => table('x'))
    setHolidayLoader(load)
    let renders = 0
    const { result } = renderHook(() => {
      renders++
      return useHolidayLookup([KATHMANDU, UTC])
    })
    await act(async () => {})
    expect(load).not.toHaveBeenCalled()
    expect(result.current('Asia/Kathmandu', NEW_YEAR)).toEqual([])
    expect(renders).toBe(1)
  })

  it('stays quiet when the data cannot be loaded, and tries again for a later city list', async () => {
    const load = vi
      .fn<(code: string) => Promise<CountryHolidays | null>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(table('Holiday'))
    setHolidayLoader(load)
    const { result, rerender } = renderHook(({ list }) => useHolidayLookup(list), { initialProps: { list: [TOKYO] } })
    await act(async () => {})
    expect(result.current('Asia/Tokyo', NEW_YEAR)).toEqual([])
    rerender({ list: [TOKYO, PARIS] }) // the list changed, so the missing country is requested again
    await waitFor(() => expect(result.current('Asia/Tokyo', NEW_YEAR)).toEqual(['Holiday']))
  })

  it('ignores a country that arrives after the component is gone', async () => {
    let release!: (value: CountryHolidays) => void
    setHolidayLoader(() => new Promise<CountryHolidays>((resolve) => (release = resolve)))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = renderHook(() => useHolidayLookup([DELHI]))
    unmount()
    await act(async () => release(table('late')))
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('useCountryHolidays', () => {
  beforeEach(() => setHolidayLoader(null))

  it('is undefined while the file loads, then the table', async () => {
    let release!: (value: CountryHolidays) => void
    setHolidayLoader(() => new Promise<CountryHolidays>((resolve) => (release = resolve)))
    const { result } = renderHook(() => useCountryHolidays('JP'))
    expect(result.current).toBeUndefined()
    const t = table('Holiday')
    await act(async () => release(t))
    await waitFor(() => expect(result.current).toBe(t))
  })

  it('is null at once for a zone with no country and for a country with no data, loading nothing', () => {
    const load = vi.fn(async (_code: string) => table('x'))
    setHolidayLoader(load)
    expect(renderHook(() => useCountryHolidays(null)).result.current).toBeNull()
    expect(renderHook(() => useCountryHolidays('NP')).result.current).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })

  it('is null (not stuck on loading) when the file cannot be loaded', async () => {
    setHolidayLoader(async () => {
      throw new Error('offline')
    })
    const { result } = renderHook(() => useCountryHolidays('FR'))
    await waitFor(() => expect(result.current).toBeNull())
  })

  it('never shows the previous country\'s table for the new one', async () => {
    setHolidayLoader(async (code) => table(`holiday in ${code}`))
    const { result, rerender } = renderHook(({ code }) => useCountryHolidays(code), { initialProps: { code: 'JP' as string | null } })
    await waitFor(() => expect(result.current).toEqual(table('holiday in JP')))
    const seen: unknown[] = []
    rerender({ code: 'FR' })
    seen.push(result.current)
    await waitFor(() => expect(result.current).toEqual(table('holiday in FR')))
    expect(seen).toEqual([undefined]) // loading, not Japan's table under France's name
  })

  it('answers from memory for a country that has already loaded', async () => {
    const load = vi.fn(async (_code: string) => table('Holiday'))
    setHolidayLoader(load)
    const first = renderHook(() => useCountryHolidays('IN'))
    await waitFor(() => expect(first.result.current).not.toBeUndefined())
    const second = renderHook(() => useCountryHolidays('IN'))
    expect(second.result.current).toBe(first.result.current)
    expect(load).toHaveBeenCalledTimes(1)
  })
})
