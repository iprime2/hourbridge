import {
  classifyDayNight,
  classifyTile,
  DEFAULT_WORK_HOURS,
  isWorkColumn,
  type HourPhase,
  type TimelineColumn,
  type WorkHours
} from './timeEngine'
import type { Location } from './timezones'

/** Inclusive range of home-hour columns (0–23). */
export interface HourRange {
  start: number
  end: number
}

export interface HourScore {
  homeHour: number
  /** The column is inside your working hours (identical for every city). */
  mine: boolean
  /** Cities where it is not night at this instant. */
  awake: number
  total: number
}

export interface PlannerSummary {
  scores: HourScore[]
  /** Runs of home hours inside your working hours where nobody is asleep — the best meeting times. */
  sharedWindows: HourRange[]
  /** Runs of home hours where nobody is asleep, whether or not you are working. */
  awakeWindows: HourRange[]
  /** Best single hour: inside your hours first, then the most people awake, then earliest. */
  best: HourScore | null
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

/** Is it night in `location` at this column's instant? */
export function isAsleepAt(column: TimelineColumn, location: Pick<Location, 'iana'>): boolean {
  const cell = column.cells[location.iana]
  return !cell || classifyDayNight(cell.hour) === 'night'
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

export function summarizePlanner(
  columns: readonly TimelineColumn[],
  locations: readonly Location[],
  work: WorkHours = DEFAULT_WORK_HOURS
): PlannerSummary {
  const scores: HourScore[] = columns.map((column) => ({
    homeHour: column.homeHour,
    mine: isWorkColumn(column, work),
    awake: locations.filter((l) => !isAsleepAt(column, l)).length,
    total: locations.length
  }))

  let best: HourScore | null = null
  for (const s of scores) {
    if (
      !best ||
      (s.mine && !best.mine) ||
      (s.mine === best.mine && s.awake > best.awake)
    ) {
      best = s
    }
  }

  const everyoneAwake = (s: HourScore): boolean => s.total > 0 && s.awake === s.total
  return {
    scores,
    sharedWindows: runsWhere(scores.map((s) => s.mine && everyoneAwake(s))),
    awakeWindows: runsWhere(scores.map(everyoneAwake)),
    best
  }
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
