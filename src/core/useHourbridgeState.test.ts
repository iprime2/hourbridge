/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import { useHourbridgeState } from '@core/useHourbridgeState'
import { HB_STORAGE_KEY } from '@core/persistence'
import { DEFAULT_LOCATIONS, HOME_TIMEZONE } from '@core/timezones'
import { CITY_OPTIONS } from '@core/cityOptions'

describe('useHourbridgeState', () => {
  beforeEach(() => {
    localStorage.removeItem(HB_STORAGE_KEY)
  })

  it('defaults to catalog locations with IST as home', () => {
    const { result } = renderHook(() => useHourbridgeState())
    expect(result.current.locations.map((l) => l.id)).toEqual(
      DEFAULT_LOCATIONS.map((l) => l.id)
    )
    expect(result.current.home.iana).toBe(HOME_TIMEZONE)
    expect(result.current.home.id).toBe('ist')
    expect(result.current.timeFormat).toBe('12h')
  })

  it('adds a location and refuses to remove home', () => {
    const { result } = renderHook(() => useHourbridgeState())
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
    const { result } = renderHook(() => useHourbridgeState())

    act(() => {
      result.current.setHome('london')
    })

    const homes = result.current.locations.filter((l) => l.isHome)
    expect(homes).toHaveLength(1)
    expect(homes[0].id).toBe('london')
    expect(result.current.home.id).toBe('london')
  })

  it('toggles time format', () => {
    const { result } = renderHook(() => useHourbridgeState())
    expect(result.current.timeFormat).toBe('12h')

    act(() => {
      result.current.setTimeFormat('24h')
    })
    expect(result.current.timeFormat).toBe('24h')
  })

  it('shifts date and returns to today', () => {
    const { result } = renderHook(() => useHourbridgeState())
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
    const { result } = renderHook(() => useHourbridgeState())

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


describe('useHourbridgeState — ranges, settings, ordering', () => {
  beforeEach(() => {
    localStorage.removeItem(HB_STORAGE_KEY)
  })

  it('selects a range in either drag direction and anchors at the start of the drag', () => {
    const { result } = renderHook(() => useHourbridgeState())
    act(() => result.current.selectRange(14, 10))
    expect(result.current.selection).toEqual({ start: 10, end: 14 })

    // Shift-click grows from the anchor (14), so extending to 20 keeps 14 fixed.
    act(() => result.current.extendSelection(20))
    expect(result.current.selection).toEqual({ start: 14, end: 20 })
    act(() => result.current.extendSelection(9))
    expect(result.current.selection).toEqual({ start: 9, end: 14 })
  })

  it('resizes the meeting length within 1h..end-of-day', () => {
    const { result } = renderHook(() => useHourbridgeState())
    act(() => result.current.selectHour(20))
    act(() => result.current.resizeSelection(2))
    expect(result.current.selection).toEqual({ start: 20, end: 22 })
    act(() => result.current.resizeSelection(10))
    expect(result.current.selection).toEqual({ start: 20, end: 23 })
    act(() => result.current.resizeSelection(-10))
    expect(result.current.selection).toEqual({ start: 20, end: 20 })
  })

  it('ignores resize when nothing is selected', () => {
    const { result } = renderHook(() => useHourbridgeState())
    act(() => result.current.resizeSelection(1))
    expect(result.current.selection).toBeNull()
  })

  it('moves a range as a block and clamps at the day boundaries', () => {
    const { result } = renderHook(() => useHourbridgeState())
    act(() => result.current.selectRange(21, 23))
    act(() => result.current.nudgeHour(5))
    expect(result.current.selection).toEqual({ start: 21, end: 23 })
    act(() => result.current.nudgeHour(-30))
    expect(result.current.selection).toEqual({ start: 0, end: 2 })
  })

  it('clears the selection', () => {
    const { result } = renderHook(() => useHourbridgeState())
    act(() => result.current.selectRange(3, 5))
    act(() => result.current.selectHour(null))
    expect(result.current.selection).toBeNull()
    expect(result.current.selectedHour).toBeNull()
  })

  it('renames a location, trimming and refusing empty names', () => {
    const { result } = renderHook(() => useHourbridgeState())
    act(() => result.current.renameLocation('london', '  Team UK  '))
    expect(result.current.locations.find((l) => l.id === 'london')?.label).toBe('Team UK')
    act(() => result.current.renameLocation('london', '   '))
    expect(result.current.locations.find((l) => l.id === 'london')?.label).toBe('Team UK')
    act(() => result.current.renameLocation('london', 'x'.repeat(100)))
    expect(result.current.locations.find((l) => l.id === 'london')?.label).toHaveLength(40)
  })

  it('moves a location up and down without leaving the list', () => {
    const { result } = renderHook(() => useHourbridgeState())
    const ids = () => result.current.locations.map((l) => l.id)
    const first = ids()[0]
    act(() => result.current.moveLocation(first, -1))
    expect(ids()[0]).toBe(first)
    act(() => result.current.moveLocation(first, 1))
    expect(ids()[1]).toBe(first)
    const last = ids()[ids().length - 1]
    act(() => result.current.moveLocation(last, 1))
    expect(ids()[ids().length - 1]).toBe(last)
  })

  it('sorts rows west to east by UTC offset', () => {
    const { result } = renderHook(() => useHourbridgeState())
    act(() => result.current.sortByOffset())
    const now = DateTime.now()
    const offsets = result.current.locations.map((l) => now.setZone(l.iana).offset)
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b))
  })

  it('persists theme, work hours and location order across remounts', () => {
    const first = renderHook(() => useHourbridgeState())
    act(() => {
      first.result.current.setTheme('dark')
      first.result.current.setWorkHours({ start: 8, end: 20 })
      first.result.current.setTimeFormat('24h')
      first.result.current.moveLocation('tokyo', -1)
    })
    const order = first.result.current.locations.map((l) => l.id)
    first.unmount()

    const second = renderHook(() => useHourbridgeState())
    expect(second.result.current.theme).toBe('dark')
    expect(second.result.current.workHours).toEqual({ start: 8, end: 20 })
    expect(second.result.current.timeFormat).toBe('24h')
    expect(second.result.current.locations.map((l) => l.id)).toEqual(order)
  })

  it('persists the working days across remounts', () => {
    const first = renderHook(() => useHourbridgeState())
    expect(first.result.current.workHours.days).toBeUndefined() // Monday–Friday until you change it
    act(() => first.result.current.setWorkHours({ start: 9, end: 17, days: [7, 6, 1, 2, 3] }))
    first.unmount()

    const second = renderHook(() => useHourbridgeState())
    expect(second.result.current.workHours).toEqual({ start: 9, end: 17, days: [1, 2, 3, 6, 7] })
  })

  it('recovers from corrupt storage with the default locations', () => {
    localStorage.setItem(HB_STORAGE_KEY, '{not json')
    const { result } = renderHook(() => useHourbridgeState())
    expect(result.current.locations.map((l) => l.id)).toEqual(DEFAULT_LOCATIONS.map((l) => l.id))
  })

  it('never crashes when persisted locations have no home flag', () => {
    localStorage.setItem(
      HB_STORAGE_KEY,
      JSON.stringify({
        timeFormat: '12h',
        locations: [
          { id: 'lon', label: 'London', iana: 'Europe/London' },
          { id: 'tok', label: 'Tokyo', iana: 'Asia/Tokyo' }
        ]
      })
    )
    const { result } = renderHook(() => useHourbridgeState())
    expect(result.current.home.id).toBe('lon')
  })
})


describe('useHourbridgeState — reorderLocation', () => {
  beforeEach(() => {
    localStorage.removeItem(HB_STORAGE_KEY)
  })
  const ids = (r: { current: ReturnType<typeof useHourbridgeState> }) => r.current.locations.map((l) => l.id)

  it('puts a row at its final index and shifts the rest', () => {
    const { result } = renderHook(() => useHourbridgeState())
    const initial = ids(result)
    act(() => result.current.reorderLocation(initial[4], 0))
    expect(ids(result)).toEqual([initial[4], ...initial.slice(0, 4)])
    act(() => result.current.reorderLocation(initial[4], 4))
    expect(ids(result)).toEqual(initial)
  })

  it('clamps out-of-range targets and ignores unknown ids', () => {
    const { result } = renderHook(() => useHourbridgeState())
    const initial = ids(result)
    act(() => result.current.reorderLocation(initial[0], 99))
    expect(ids(result)[initial.length - 1]).toBe(initial[0])
    act(() => result.current.reorderLocation('nope', 0))
    expect(ids(result)).toEqual([...initial.slice(1), initial[0]])
  })

  it('does not create a new array (or re-render consumers) for a no-op', () => {
    const { result } = renderHook(() => useHourbridgeState())
    const before = result.current.locations
    act(() => result.current.reorderLocation(before[2].id, 2))
    expect(result.current.locations).toBe(before)
    act(() => result.current.moveLocation(before[0].id, -1))
    expect(result.current.locations).toBe(before)
  })

  it('keeps the home flag on its city and persists the order', () => {
    const { result, unmount } = renderHook(() => useHourbridgeState())
    act(() => result.current.reorderLocation('ist', 0))
    expect(result.current.home.id).toBe('ist')
    const order = ids(result)
    unmount()
    const again = renderHook(() => useHourbridgeState())
    expect(ids(again.result)).toEqual(order)
  })

  it('applies several rapid moves in sequence (no stale reads)', () => {
    const { result } = renderHook(() => useHourbridgeState())
    const initial = ids(result)
    act(() => {
      result.current.moveLocation(initial[0], 1)
      result.current.moveLocation(initial[0], 1)
    })
    expect(ids(result).indexOf(initial[0])).toBe(2)
  })
})
