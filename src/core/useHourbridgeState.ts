import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DateTime } from 'luxon'
import type { CityOption } from '@core/cityOptions'
import {
  loadResolvedState,
  savePersistedState,
  type ThemePreference
} from '@core/persistence'
import { normalizeRange, type HourRange } from '@core/planner'
import { moveItem } from '@core/reorder'
import { useHolidayLookup } from '@core/useHolidays'
import { getHomeLocation, type Location } from '@core/timezones'
import type { TimeFormat, WorkHours } from '@core/timeEngine'

export interface CalendarDate {
  year: number
  month: number
  day: number
}

const MAX_LABEL_LENGTH = 40

function todayInZone(zone: string): CalendarDate {
  const now = DateTime.now().setZone(zone)
  return { year: now.year, month: now.month, day: now.day }
}

export function useHourbridgeState() {
  // Read storage exactly once; everything else derives from React state.
  const [initial] = useState(() => loadResolvedState())

  const [locations, setLocations] = useState<Location[]>(initial.locations)
  const [selectedDate, setSelectedDate] = useState<CalendarDate>(() =>
    todayInZone(getHomeLocation(initial.locations).iana)
  )
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(initial.timeFormat)
  const [theme, setTheme] = useState<ThemePreference>(initial.theme)
  const [workHours, setWorkHours] = useState<WorkHours>(initial.workHours)
  const [selection, setSelection] = useState<HourRange | null>(null)
  const [hoveredHour, setHoveredHour] = useState<number | null>(null)
  /** The end of a drag/shift-select that stays fixed while the other end moves. */
  const anchor = useRef<number | null>(null)

  useEffect(() => {
    savePersistedState({ locations, timeFormat, theme, workHours })
  }, [locations, timeFormat, theme, workHours])

  const home = useMemo(() => getHomeLocation(locations), [locations])
  /** Public holidays for the cities on screen; a new function whenever a country's data arrives. */
  const holidays = useHolidayLookup(locations)

  const selectedHour = selection ? selection.start : null
  const activeHour = hoveredHour ?? selectedHour

  const existingIds = useMemo(() => new Set(locations.map((l) => l.id)), [locations])

  /* —— locations —— */

  const addLocation = useCallback((city: CityOption) => {
    setLocations((prev) => {
      if (prev.some((l) => l.id === city.id)) return prev
      return [...prev, { id: city.id, label: city.label, iana: city.iana }]
    })
  }, [])

  const removeLocation = useCallback((id: string) => {
    setLocations((prev) => {
      const target = prev.find((l) => l.id === id)
      if (!target || target.isHome) return prev
      return prev.filter((l) => l.id !== id)
    })
  }, [])

  const setHome = useCallback((id: string) => {
    setLocations((prev) => {
      if (!prev.some((l) => l.id === id)) return prev
      return prev.map((l) => ({ ...l, isHome: l.id === id }))
    })
  }, [])

  const renameLocation = useCallback((id: string, label: string) => {
    const next = label.trim().slice(0, MAX_LABEL_LENGTH)
    if (!next) return
    setLocations((prev) => prev.map((l) => (l.id === id ? { ...l, label: next } : l)))
  }, [])

  /** Move a row to `target(currentIndex)`, clamped; a no-op returns the same array (no re-render). */
  const relocate = useCallback((id: string, target: (from: number) => number) => {
    setLocations((prev) => {
      const from = prev.findIndex((l) => l.id === id)
      if (from === -1) return prev
      const next = moveItem(prev, from, target(from))
      return next[from]?.id === id ? prev : next
    })
  }, [])

  /** Put the row at index `toIndex` (its final position), shifting the others. */
  const reorderLocation = useCallback(
    (id: string, toIndex: number) => relocate(id, () => toIndex),
    [relocate]
  )

  const moveLocation = useCallback(
    (id: string, delta: number) => relocate(id, (from) => from + delta),
    [relocate]
  )

  /** Order rows west → east by current UTC offset (stable for equal offsets). */
  const sortByOffset = useCallback(() => {
    const now = DateTime.now()
    setLocations((prev) =>
      prev
        .map((l, index) => ({ l, index, offset: now.setZone(l.iana).offset }))
        .sort((a, b) => a.offset - b.offset || a.index - b.index)
        .map((r) => r.l)
    )
  }, [])

  /* —— date —— */

  const shiftDate = useCallback(
    (days: number) => {
      setSelectedDate((prev) => {
        const dt = DateTime.fromObject(prev, { zone: home.iana }).plus({ days })
        return { year: dt.year, month: dt.month, day: dt.day }
      })
    },
    [home.iana]
  )

  const goToToday = useCallback(() => {
    setSelectedDate(todayInZone(home.iana))
  }, [home.iana])

  /* —— hour selection (a range of home-hour columns) —— */

  const selectHour = useCallback((hour: number | null) => {
    anchor.current = hour
    setSelection(hour === null ? null : { start: hour, end: hour })
  }, [])

  /** Select from `from` to `to` (either order); `from` becomes the anchor. */
  const selectRange = useCallback((from: number, to: number) => {
    anchor.current = from
    setSelection(normalizeRange(from, to))
  }, [])

  /** Shift-click: grow the selection from its anchor to `hour`. */
  const extendSelection = useCallback((hour: number) => {
    setSelection((prev) => {
      const from = anchor.current ?? prev?.start ?? hour
      anchor.current = from
      return normalizeRange(from, hour)
    })
  }, [])

  /** Change meeting length in whole hours; never below one hour or past 23:00. */
  const resizeSelection = useCallback((delta: number) => {
    setSelection((prev) => {
      if (!prev) return prev
      const end = Math.min(23, Math.max(prev.start, prev.end + delta))
      return { start: prev.start, end }
    })
  }, [])

  const hoverHour = useCallback((hour: number | null) => {
    setHoveredHour(hour)
  }, [])

  /** Move the selection by whole hours. A single hour wraps around midnight; a range clamps. */
  const nudgeHour = useCallback(
    (delta: number) => {
      setSelection((prev) => {
        if (!prev) {
          const base = hoveredHour ?? 12
          const hour = (base + delta + 24) % 24
          anchor.current = hour
          return { start: hour, end: hour }
        }
        if (prev.start === prev.end) {
          const hour = (prev.start + delta + 24) % 24
          anchor.current = hour
          return { start: hour, end: hour }
        }
        const span = prev.end - prev.start
        const start = Math.min(23 - span, Math.max(0, prev.start + delta))
        anchor.current = start
        return { start, end: start + span }
      })
    },
    [hoveredHour]
  )

  return {
    locations,
    home,
    existingIds,
    selectedDate,
    timeFormat,
    theme,
    workHours,
    holidays,
    selection,
    selectedHour,
    hoveredHour,
    activeHour,
    addLocation,
    removeLocation,
    setHome,
    renameLocation,
    moveLocation,
    reorderLocation,
    sortByOffset,
    setSelectedDate,
    shiftDate,
    goToToday,
    setTimeFormat,
    setTheme,
    setWorkHours,
    selectHour,
    selectRange,
    extendSelection,
    resizeSelection,
    hoverHour,
    nudgeHour
  }
}

export type HourbridgeState = ReturnType<typeof useHourbridgeState>
