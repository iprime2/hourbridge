import { DateTime } from 'luxon'
import { buildTimelineForLocations } from './formatters'
import type { CalendarDay, HolidayLookup } from './holidays'
import { summarizePlanner, type HourRange } from './planner'
import { DEFAULT_WORK_HOURS, type WorkHours } from './timeEngine'
import type { Location } from './timezones'

/** A run of good hours on one day: you are working and every city is awake and not on holiday. */
export interface FoundSlot {
  /** The home calendar date. */
  date: CalendarDay
  /** Home-hour columns of the run, both ends included (as the planner's best times are). */
  range: HourRange
}

export interface SlotSearch {
  /** First home calendar date to search. */
  from: CalendarDay
  /** How many days, from `from` on. */
  days: number
  locations: readonly Location[]
  homeZone: string
  work?: WorkHours
  holidays?: HolidayLookup
  /** Hours that start before this instant are left out: they are over, or already under way. */
  notBefore?: DateTime
}

/** The longest search: enough for "the next few weeks" without building months of timelines. */
export const MAX_SEARCH_DAYS = 31

/** `date` moved by whole calendar days. Pure calendar arithmetic, the same in every timezone. */
export function addDays(date: CalendarDay, days: number): CalendarDay {
  const moved = DateTime.utc(date.year, date.month, date.day).plus({ days })
  return { year: moved.year, month: moved.month, day: moved.day }
}

/** "Wed, Oct 15" for a calendar date. */
export function formatDayLabel(date: CalendarDay): string {
  return DateTime.utc(date.year, date.month, date.day).toFormat('ccc, LLL d')
}

/**
 * The planner's best times, day by day: for each of `days` days from `from`, every run of home
 * hours where you are working and every city is awake and not on a public holiday. Days you do
 * not work, and a public holiday at home (unless you work through them), have none, because the
 * planner's working-hours test already knows about them. A daylight-saving gap at home breaks a
 * run, as it does in the planner.
 *
 * With `notBefore`, hours that have started by then are cut from the front of a run, and a run
 * that has started or ended entirely is dropped, so a past slot is never offered.
 */
export function findSlots({
  from,
  days,
  locations,
  homeZone,
  work = DEFAULT_WORK_HOURS,
  holidays,
  notBefore
}: SlotSearch): FoundSlot[] {
  const slots: FoundSlot[] = []
  const count = Math.max(0, Math.min(MAX_SEARCH_DAYS, Math.floor(days)))
  if (locations.length === 0 || count === 0) return slots

  for (let d = 0; d < count; d++) {
    const date = addDays(from, d)
    const columns = buildTimelineForLocations(date, locations, homeZone, holidays)
    for (const window of summarizePlanner(columns, locations, work).sharedWindows) {
      let start = window.start
      while (start <= window.end && notBefore && columns[start].instant < notBefore) start++
      if (start <= window.end) slots.push({ date, range: { start, end: window.end } })
    }
  }
  return slots
}
