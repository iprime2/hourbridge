/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import { useTimeBuddyState } from '@renderer/hooks/useTimeBuddyState'
import { WTB_STORAGE_KEY } from '@renderer/lib/persistence'
import { DEFAULT_LOCATIONS, HOME_TIMEZONE } from '@renderer/lib/timezones'
import { CITY_OPTIONS } from '@renderer/lib/cityOptions'

describe('useTimeBuddyState', () => {
  beforeEach(() => {
    localStorage.removeItem(WTB_STORAGE_KEY)
  })

  it('defaults to catalog locations with IST as home', () => {
    const { result } = renderHook(() => useTimeBuddyState())
    expect(result.current.locations.map((l) => l.id)).toEqual(
      DEFAULT_LOCATIONS.map((l) => l.id)
    )
    expect(result.current.home.iana).toBe(HOME_TIMEZONE)
    expect(result.current.home.id).toBe('ist')
    expect(result.current.timeFormat).toBe('12h')
  })

  it('adds a location and refuses to remove home', () => {
    const { result } = renderHook(() => useTimeBuddyState())
    const paris = CITY_OPTIONS.find((c) => c.id === 'paris')!
    const before = result.current.locations.length

    act(() => {
      result.current.addLocation(paris)
    })
    expect(result.current.locations).toHaveLength(before + 1)
    expect(result.current.locations.some((l) => l.id === 'paris')).toBe(true)

    act(() => {
      result.current.removeLocation('ist')
    })
    expect(result.current.locations.some((l) => l.id === 'ist')).toBe(true)

    act(() => {
      result.current.removeLocation('paris')
    })
    expect(result.current.locations.some((l) => l.id === 'paris')).toBe(false)
  })

  it('setHome leaves exactly one home', () => {
    const { result } = renderHook(() => useTimeBuddyState())

    act(() => {
      result.current.setHome('london')
    })

    const homes = result.current.locations.filter((l) => l.isHome)
    expect(homes).toHaveLength(1)
    expect(homes[0].id).toBe('london')
    expect(result.current.home.id).toBe('london')
  })

  it('toggles time format', () => {
    const { result } = renderHook(() => useTimeBuddyState())
    expect(result.current.timeFormat).toBe('12h')

    act(() => {
      result.current.setTimeFormat('24h')
    })
    expect(result.current.timeFormat).toBe('24h')
  })

  it('shifts date and returns to today', () => {
    const { result } = renderHook(() => useTimeBuddyState())
    const today = DateTime.now().setZone(result.current.home.iana)

    act(() => {
      result.current.shiftDate(2)
    })
    const shifted = DateTime.fromObject(result.current.selectedDate, {
      zone: result.current.home.iana
    })
    expect(shifted.toISODate()).toBe(today.plus({ days: 2 }).toISODate())

    act(() => {
      result.current.goToToday()
    })
    expect(result.current.selectedDate).toEqual({
      year: today.year,
      month: today.month,
      day: today.day
    })
  })

  it('selects, hovers, and nudges hours', () => {
    const { result } = renderHook(() => useTimeBuddyState())

    act(() => {
      result.current.selectHour(10)
    })
    expect(result.current.selectedHour).toBe(10)
    expect(result.current.activeHour).toBe(10)

    act(() => {
      result.current.hoverHour(14)
    })
    expect(result.current.hoveredHour).toBe(14)
    expect(result.current.activeHour).toBe(14)

    act(() => {
      result.current.hoverHour(null)
      result.current.nudgeHour(1)
    })
    expect(result.current.selectedHour).toBe(11)

    act(() => {
      result.current.selectHour(0)
      result.current.nudgeHour(-1)
    })
    expect(result.current.selectedHour).toBe(23)
  })
})
