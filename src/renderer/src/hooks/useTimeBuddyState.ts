import { useCallback, useEffect, useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import { CITY_OPTIONS, type CityOption } from '@renderer/lib/cityOptions'
import {
  loadPersistedBuddyState,
  savePersistedBuddyState
} from '@renderer/lib/persistence'
import {
  DEFAULT_LOCATIONS,
  getHomeLocation,
  type Location
} from '@renderer/lib/timezones'
import type { TimeFormat } from '@renderer/lib/timeEngine'

export interface CalendarDate {
  year: number
  month: number
  day: number
}

function todayInZone(zone: string): CalendarDate {
  const now = DateTime.now().setZone(zone)
  return { year: now.year, month: now.month, day: now.day }
}

function cloneLocations(locations: readonly Location[]): Location[] {
  return locations.map((l) => ({ ...l }))
}

function initialLocations(): Location[] {
  return cloneLocations(loadPersistedBuddyState()?.locations ?? DEFAULT_LOCATIONS)
}

function initialTimeFormat(): TimeFormat {
  return loadPersistedBuddyState()?.timeFormat ?? '12h'
}

export function useTimeBuddyState() {
  const [locations, setLocations] = useState<Location[]>(initialLocations)
  const [selectedDate, setSelectedDate] = useState<CalendarDate>(() =>
    todayInZone(getHomeLocation(initialLocations()).iana)
  )
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(initialTimeFormat)
  const [selectedHour, setSelectedHour] = useState<number | null>(null)
  const [hoveredHour, setHoveredHour] = useState<number | null>(null)

  useEffect(() => {
    savePersistedBuddyState({ locations, timeFormat })
  }, [locations, timeFormat])

  const home = useMemo(() => getHomeLocation(locations), [locations])

  const activeHour = hoveredHour ?? selectedHour

  const existingIds = useMemo(() => new Set(locations.map((l) => l.id)), [locations])

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

  const selectHour = useCallback((hour: number | null) => {
    setSelectedHour(hour)
  }, [])

  const hoverHour = useCallback((hour: number | null) => {
    setHoveredHour(hour)
  }, [])

  const nudgeHour = useCallback(
    (delta: number) => {
      setSelectedHour((prev) => {
        const base = prev ?? hoveredHour ?? 12
        return (base + delta + 24) % 24
      })
    },
    [hoveredHour]
  )

  const availableCities = useMemo(
    () => CITY_OPTIONS.filter((c) => !existingIds.has(c.id)),
    [existingIds]
  )

  return {
    locations,
    home,
    selectedDate,
    timeFormat,
    selectedHour,
    hoveredHour,
    activeHour,
    availableCities,
    addLocation,
    removeLocation,
    setHome,
    setSelectedDate,
    shiftDate,
    goToToday,
    setTimeFormat,
    selectHour,
    hoverHour,
    nudgeHour
  }
}

export type TimeBuddyState = ReturnType<typeof useTimeBuddyState>
