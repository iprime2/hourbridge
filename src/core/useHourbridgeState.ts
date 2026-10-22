import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DateTime } from 'luxon'
import type { CityOption } from '@core/cityOptions'
import {
  boardsForStorage,
  cleanBoardName,
  loadResolvedState,
  MAX_BOARDS,
  savePersistedState,
  type Board,
  type ResolvedState,
  type ThemePreference
} from '@core/persistence'
import { cleanPersonName, sanitizePersonHours, type PersonHours } from '@core/people'
import { sanitizeDaysOff, type DayOff } from '@core/daysOff'
import {
  DEFAULT_MEETING_MINUTES,
  meetingColumns,
  meetingFromRange,
  MINUTES_PER_DAY,
  moveMeeting,
  resizeMeeting,
  withStartMinute,
  type Meeting
} from '@core/meeting'
import { normalizeRange } from '@core/planner'
import { moveItem } from '@core/reorder'
import { mergeShared, replaceWithShared, type SharedLocation } from '@core/shareLink'
import { useHolidayLookup } from '@core/useHolidays'
import { getHomeLocation, type Location } from '@core/timezones'
import type { TimeFormat, WorkHours } from '@core/timeEngine'

export interface CalendarDate {
  year: number
  month: number
  day: number
}

const MAX_LABEL_LENGTH = 40

/** Every board, and which one is on screen; kept together so both change in one update. */
interface BoardStore {
  boards: Board[]
  activeBoard: string
}

function activeOf(store: BoardStore): Board {
  return store.boards.find((b) => b.id === store.activeBoard) ?? store.boards[0]
}

/** An id no board has yet. */
function freshBoardId(boards: readonly Board[]): string {
  const taken = new Set(boards.map((b) => b.id))
  for (let n = boards.length + 1; ; n++) {
    const id = `board-${n}`
    if (!taken.has(id)) return id
  }
}

function todayInZone(zone: string): CalendarDate {
  const now = DateTime.now().setZone(zone)
  return { year: now.year, month: now.month, day: now.day }
}

export function useHourbridgeState() {
  // Read storage exactly once; everything else derives from React state.
  const [initial] = useState(() => loadResolvedState())

  const [store, setStore] = useState<BoardStore>(() => ({ boards: initial.boards, activeBoard: initial.activeBoard }))
  const locations = activeOf(store).locations
  /** Change the cities of the board on screen. Returning the same array changes nothing. */
  const setLocations = useCallback((next: Location[] | ((prev: Location[]) => Location[])) => {
    setStore((prev) => {
      const board = activeOf(prev)
      const value = typeof next === 'function' ? next(board.locations) : next
      if (value === board.locations) return prev
      return { ...prev, boards: prev.boards.map((b) => (b.id === board.id ? { ...b, locations: value } : b)) }
    })
  }, [])
  const [selectedDate, setSelectedDate] = useState<CalendarDate>(() =>
    todayInZone(getHomeLocation(initial.locations).iana)
  )
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(initial.timeFormat)
  const [theme, setTheme] = useState<ThemePreference>(initial.theme)
  const [workHours, setWorkHours] = useState<WorkHours>(initial.workHours)
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [hoveredHour, setHoveredHour] = useState<number | null>(null)
  /** The end of a drag/shift-select that stays fixed while the other end moves. */
  const anchor = useRef<number | null>(null)
  /** How long a click on one hour tile makes the meeting: what the length buttons last set. */
  const clickMinutes = useRef(DEFAULT_MEETING_MINUTES)

  useEffect(() => {
    savePersistedState({
      locations: activeOf(store).locations,
      timeFormat,
      theme,
      workHours,
      ...boardsForStorage(store.boards, activeOf(store).id)
    })
  }, [store, timeFormat, theme, workHours])

  const home = useMemo(() => getHomeLocation(locations), [locations])
  /** Public holidays for the cities on screen; a new function whenever a country's data arrives. */
  const holidays = useHolidayLookup(locations)

  /** The hour columns the meeting touches: what the grid highlights. */
  const selection = useMemo(() => (meeting ? meetingColumns(meeting) : null), [meeting])
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

  /** Name the person a row is for and set their own hours (null: none). Both are cleaned here. */
  const setPerson = useCallback(
    (id: string, person: string, hours: PersonHours | null) => {
      const name = cleanPersonName(person)
      const own = hours ? sanitizePersonHours(hours) : null
      setLocations((prev) =>
        prev.map((l) => {
          if (l.id !== id) return l
          const next: Location = { ...l }
          delete next.person
          delete next.hours
          if (name) next.person = name
          if (own) next.hours = own
          return next
        })
      )
    },
    [setLocations]
  )

  /** Replace a row's own days off with `days` (cleaned here; an empty list removes them). */
  const setDaysOff = useCallback(
    (id: string, days: readonly DayOff[]) => {
      const clean = sanitizeDaysOff(days)
      setLocations((prev) =>
        prev.map((l) => {
          if (l.id !== id) return l
          const next: Location = { ...l }
          if (clean) next.daysOff = clean
          else delete next.daysOff
          return next
        })
      )
    },
    [setLocations]
  )

  /* —— boards: several saved lists of cities —— */

  /** Show another board. The meeting is cleared: it was planned against the other cities. */
  const switchBoard = useCallback((id: string) => {
    setStore((prev) => (prev.activeBoard === id || !prev.boards.some((b) => b.id === id) ? prev : { ...prev, activeBoard: id }))
    anchor.current = null
    setMeeting(null)
  }, [])

  /** Start a new board holding only your home city, and show it (not past `MAX_BOARDS`). */
  const createBoard = useCallback((name: string) => {
    setStore((prev) => {
      if (prev.boards.length >= MAX_BOARDS) return prev
      const home = getHomeLocation(activeOf(prev).locations)
      const id = freshBoardId(prev.boards)
      const board: Board = {
        id,
        name: cleanBoardName(name) || `Board ${prev.boards.length + 1}`,
        locations: [{ id: home.id, label: home.label, iana: home.iana, isHome: true }]
      }
      return { boards: [...prev.boards, board], activeBoard: id }
    })
    anchor.current = null
    setMeeting(null)
  }, [])

  const renameBoard = useCallback((id: string, name: string) => {
    const next = cleanBoardName(name)
    if (!next) return
    setStore((prev) => ({ ...prev, boards: prev.boards.map((b) => (b.id === id ? { ...b, name: next } : b)) }))
  }, [])

  /** Delete a board (never the last one). Deleting the board on screen shows its neighbour. */
  const deleteBoard = useCallback((id: string) => {
    setStore((prev) => {
      const index = prev.boards.findIndex((b) => b.id === id)
      if (index === -1 || prev.boards.length === 1) return prev
      const boards = prev.boards.filter((b) => b.id !== id)
      const activeBoard = prev.activeBoard === id ? boards[Math.min(index, boards.length - 1)].id : prev.activeBoard
      return { boards, activeBoard }
    })
    anchor.current = null
    setMeeting(null)
  }, [])

  /* —— bringing settings in from outside (both inputs were validated by their parsers) —— */

  /** Replace the cities, boards and every setting with those of an imported settings file. */
  const importSettings = useCallback((next: ResolvedState) => {
    setStore({ boards: next.boards, activeBoard: next.activeBoard })
    setTimeFormat(next.timeFormat)
    setTheme(next.theme)
    setWorkHours(next.workHours)
    setSelectedDate(todayInZone(getHomeLocation(next.locations).iana))
    anchor.current = null
    setMeeting(null)
  }, [])

  /**
   * Open a shared list of cities instead of the ones on this board (`replace`) or after them
   * (`add`). Only cities change.
   */
  const applySharedCities = useCallback(
    (shared: readonly SharedLocation[], mode: 'replace' | 'add') => {
      if (mode === 'add') {
        setLocations((prev) => mergeShared(prev, shared))
        return
      }
      const next = replaceWithShared(shared)
      if (!next) return
      setLocations(next)
      setSelectedDate(todayInZone(getHomeLocation(next).iana))
      anchor.current = null
      setMeeting(null)
    },
    [setLocations]
  )

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

  /* —— the meeting: a start and a length in minutes, shown against the hour columns —— */

  /** A meeting of the usual click length that starts on the hour of `hour`, kept inside the day. */
  const meetingAt = useCallback(
    (hour: number): Meeting => ({
      startMinute: hour * 60,
      minutes: Math.min(clickMinutes.current, MINUTES_PER_DAY - hour * 60)
    }),
    []
  )

  const selectHour = useCallback(
    (hour: number | null) => {
      anchor.current = hour
      setMeeting(hour === null ? null : meetingAt(hour))
    },
    [meetingAt]
  )

  /**
   * Select from `from` to `to` (either order); `from` becomes the anchor. Across several tiles that
   * is those whole hours; on a single tile (a plain click, or a drag that comes back to it) it is
   * a meeting of the usual length, like `selectHour`.
   */
  const selectRange = useCallback(
    (from: number, to: number) => {
      anchor.current = from
      setMeeting(from === to ? meetingAt(from) : meetingFromRange(normalizeRange(from, to)))
    },
    [meetingAt]
  )

  /** Shift-click: grow the selection from its anchor to `hour`. */
  const extendSelection = useCallback((hour: number) => {
    setMeeting((prev) => {
      const from = anchor.current ?? (prev ? meetingColumns(prev).start : hour)
      anchor.current = from
      return meetingFromRange(normalizeRange(from, hour))
    })
  }, [])

  /**
   * Lengthen or shorten by `steps` rungs of 15, 30, 45, 60, 90, 120, 180 … minutes, never below
   * 15 minutes or past midnight. The length chosen here is what the next click on a tile gives.
   */
  const resizeSelection = useCallback((steps: number) => {
    setMeeting((prev) => {
      if (!prev) return prev
      const next = resizeMeeting(prev, steps)
      clickMinutes.current = next.minutes // the same value if React runs this twice
      return next
    })
  }, [])

  /**
   * Show `date` with `next` selected: a slot picked from the days ahead, or a meeting opened from a
   * share link (already placed on your home calendar by `placeMeeting`).
   */
  const openMeeting = useCallback((date: CalendarDate, next: Meeting) => {
    setSelectedDate({ year: date.year, month: date.month, day: date.day })
    anchor.current = meetingColumns(next).start
    setMeeting(next)
  }, [])

  /** Start at :00, :15, :30 or :45 of the hour the meeting starts in. */
  const setMeetingStart = useCallback((minuteOfHour: number) => {
    setMeeting((prev) => (prev ? withStartMinute(prev, minuteOfHour) : prev))
  }, [])

  const hoverHour = useCallback((hour: number | null) => {
    setHoveredHour(hour)
  }, [])

  /** Move the meeting by whole hours. One that fits in an hour wraps around midnight; longer ones clamp. */
  const nudgeHour = useCallback(
    (delta: number) => {
      setMeeting((prev) => {
        if (!prev) {
          const hour = ((hoveredHour ?? 12) + delta + 24) % 24
          anchor.current = hour
          return meetingAt(hour)
        }
        const next = moveMeeting(prev, delta)
        anchor.current = meetingColumns(next).start
        return next
      })
    },
    [hoveredHour, meetingAt]
  )

  /** The boards for a switcher: name and how many cities, in order. */
  const boardList = useMemo(
    () => store.boards.map((b) => ({ id: b.id, name: b.name, cities: b.locations.length })),
    [store.boards]
  )
  const activeBoard = activeOf(store).id

  return {
    locations,
    boards: boardList,
    activeBoard,
    /** Every board with its cities, for exporting settings. */
    savedBoards: store,
    switchBoard,
    createBoard,
    renameBoard,
    deleteBoard,
    setPerson,
    setDaysOff,
    home,
    existingIds,
    selectedDate,
    timeFormat,
    theme,
    workHours,
    holidays,
    meeting,
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
    importSettings,
    applySharedCities,
    selectHour,
    selectRange,
    extendSelection,
    resizeSelection,
    setMeetingStart,
    openMeeting,
    hoverHour,
    nudgeHour
  }
}

export type HourbridgeState = ReturnType<typeof useHourbridgeState>
