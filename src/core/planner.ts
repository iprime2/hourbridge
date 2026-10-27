import {
  classifyDayNight,
  classifyTile,
  DEFAULT_WORK_HOURS,
  isWorkColumn,
  type HourPhase,
  type TimelineColumn,
  type WorkHours
} from './timeEngine'
import type { DateTime } from 'luxon'
import type { MeetingPlan } from './share'
import { daysOffAt } from './daysOff'
import { inPersonHours, ownHours } from './people'
import { getHomeLocation, type Location } from './timezones'

/** Inclusive range of home-hour columns (0–23). */
export interface HourRange {
  start: number
  end: number
}

export interface HourScore {
  homeHour: number
  /** The column is inside your working hours (identical for every city). */
  mine: boolean
  /**
   * Cities where it is not night at this instant. Someone with their own working hours counts as
   * awake inside those hours even at night: they said they work then.
   */
  awake: number
  total: number
  /**
   * Of those awake, the cities where it is a public holiday or one of their own days off (their
   * local date). Present only when there is one: people on holiday are awake but not available.
   */
  holiday?: number
  /**
   * Of those awake and not on holiday, the people outside their own working hours (rows that have
   * some). Present only when there is one.
   */
  offHours?: number
  /** The hour does not exist that day (a daylight-saving gap in the home zone): never a candidate. */
  skipped?: true
}

export interface PlannerSummary {
  scores: HourScore[]
  /** Runs of home hours inside your working hours where everyone is awake and none is on holiday. */
  sharedWindows: HourRange[]
  /** Runs of home hours where everyone is awake and none is on holiday, whether or not you work. */
  awakeWindows: HourRange[]
  /** Best single hour: inside your hours first, then the most people available, then earliest. */
  best: HourScore | null
}

/**
 * How many of the cities at this hour can take a meeting: awake, not on a public holiday, and
 * inside their own working hours when they have some.
 */
export function availableAt(score: Pick<HourScore, 'awake' | 'holiday' | 'offHours'>): number {
  return score.awake - (score.holiday ?? 0) - (score.offHours ?? 0)
}

/** How a city's tile reads for the column (see `HourPhase`). */
export function phaseAt(
  column: TimelineColumn,
  location: Pick<Location, 'iana'>,
  work: WorkHours = DEFAULT_WORK_HOURS
): HourPhase {
  const cell = column.cells[location.iana]
  if (!cell) return 'night'
  return classifyTile(column, cell, work).phase
}

/** Is it a public holiday in `location` on its local date at this column's instant? */
export function isHolidayAt(column: TimelineColumn, location: Pick<Location, 'iana'>): boolean {
  return (column.cells[location.iana]?.holidays?.length ?? 0) > 0
}

/** Is it night in `location` at this column's instant? */
export function isAsleepAt(column: TimelineColumn, location: Pick<Location, 'iana'>): boolean {
  const cell = column.cells[location.iana]
  return !cell || classifyDayNight(cell.hour) === 'night'
}

/**
 * Is the city asleep at any moment of the meeting? Local time is checked at the start, every 15
 * minutes after it, and at the last instant. Night and day each last an hour or more, so a stretch
 * of night inside the meeting is caught by one of those checks, however the meeting is aligned: one
 * that starts at 21:45 there and runs past 22:00 counts as night, as it should.
 */
export function isAsleepDuring(plan: MeetingPlan, zone: string): boolean {
  if (plan.end <= plan.start) return false
  const asleepAt = (t: DateTime): boolean => classifyDayNight(t.setZone(zone).hour) === 'night'
  for (let t = plan.start; t < plan.end; t = t.plus({ minutes: 15 })) {
    if (asleepAt(t)) return true
  }
  return asleepAt(plan.end.minus({ milliseconds: 1 }))
}

function runsWhere(hours: readonly boolean[]): HourRange[] {
  const runs: HourRange[] = []
  let start = -1
  for (let h = 0; h <= hours.length; h++) {
    const on = h < hours.length && hours[h]
    if (on && start === -1) start = h
    if (!on && start !== -1) {
      runs.push({ start, end: h - 1 })
      start = -1
    }
  }
  return runs
}

function scoreColumn(
  column: TimelineColumn,
  locations: readonly Location[],
  work: WorkHours,
  homeId: string | null
): HourScore {
  const inOwnHours = (l: Location): boolean => {
    const hours = ownHours(l)
    const cell = column.cells[l.iana]
    return hours !== null && cell !== undefined && inPersonHours(cell, hours)
  }
  const awake = locations.filter((l) => !isAsleepAt(column, l) || inOwnHours(l))
  // Your own city's holiday only takes you out of the picture when you take holidays off.
  // Someone's own day off always counts (they entered it), wherever they are.
  const isOff = (l: Location): boolean =>
    (isHolidayAt(column, l) && !(l.id === homeId && work.holidaysOff === false)) || daysOffAt(column, l).length > 0
  const onHoliday = awake.filter(isOff).length
  const offHours = awake.filter((l) => !isOff(l) && ownHours(l) !== null && !inOwnHours(l)).length
  return {
    homeHour: column.homeHour,
    mine: isWorkColumn(column, work),
    awake: awake.length,
    total: locations.length,
    ...(onHoliday ? { holiday: onHoliday } : {}),
    ...(offHours ? { offHours } : {})
  }
}

export function summarizePlanner(
  columns: readonly TimelineColumn[],
  locations: readonly Location[],
  work: WorkHours = DEFAULT_WORK_HOURS
): PlannerSummary {
  const homeId = locations.length ? getHomeLocation(locations).id : null
  const scores: HourScore[] = columns.map((column) =>
    // A skipped hour is not a real moment (its column only repeats the next one), so it never
    // counts as working, awake, or best — and it breaks a run of good hours.
    column.transition === 'skipped'
      ? { homeHour: column.homeHour, mine: false, awake: 0, total: locations.length, skipped: true }
      : scoreColumn(column, locations, work, homeId)
  )

  let best: HourScore | null = null
  for (const s of scores) {
    if (s.skipped) continue
    if (
      !best ||
      (s.mine && !best.mine) ||
      (s.mine === best.mine && availableAt(s) > availableAt(best))
    ) {
      best = s
    }
  }

  const everyoneAvailable = (s: HourScore): boolean => s.total > 0 && availableAt(s) === s.total
  return {
    scores,
    sharedWindows: runsWhere(scores.map((s) => s.mine && everyoneAvailable(s))),
    awakeWindows: runsWhere(scores.map(everyoneAvailable)),
    best
  }
}

/** The public holidays of one city during some hours. */
export interface CityHolidays {
  location: Location
  /** Each holiday once, in the order met. */
  names: string[]
}

/**
 * Which cities are on a public holiday during `range` (the whole day when null), and what the
 * holiday is. Each city's own calendar date decides, so a city can appear for one end of the
 * range only.
 */
export function holidaysDuring(
  columns: readonly TimelineColumn[],
  locations: readonly Location[],
  range: HourRange | null
): CityHolidays[] {
  const hours = columns.filter((c) => range === null || rangeContains(range, c.homeHour))
  const found: CityHolidays[] = []
  for (const location of locations) {
    const names = new Set<string>()
    for (const column of hours) {
      for (const name of column.cells[location.iana]?.holidays ?? []) names.add(name)
    }
    if (names.size) found.push({ location, names: [...names] })
  }
  return found
}

/**
 * Which rows are on one of their own days off during `range` (the whole day when null), and
 * which ones. Like `holidaysDuring`, each row's own calendar date decides.
 */
export function daysOffDuring(
  columns: readonly TimelineColumn[],
  locations: readonly Location[],
  range: HourRange | null
): CityHolidays[] {
  const hours = columns.filter((c) => range === null || rangeContains(range, c.homeHour))
  const found: CityHolidays[] = []
  for (const location of locations) {
    if (!location.daysOff?.length) continue
    const names = new Set<string>()
    for (const column of hours) for (const name of daysOffAt(column, location)) names.add(name)
    if (names.size) found.push({ location, names: [...names] })
  }
  return found
}

/** Normalize a range so `start <= end`, clamped to the 24 home-hour columns. */
export function normalizeRange(a: number, b: number): HourRange {
  const lo = Math.max(0, Math.min(23, Math.min(a, b)))
  const hi = Math.max(0, Math.min(23, Math.max(a, b)))
  return { start: lo, end: hi }
}

export function rangeContains(range: HourRange | null, hour: number): boolean {
  return range !== null && hour >= range.start && hour <= range.end
}
