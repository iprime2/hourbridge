import { DateTime } from 'luxon'
import { formatLiveClock, offsetForLocation } from '@core/formatters'
import {
  classifyDayNight,
  DEFAULT_WORK_HOURS,
  getLocalWallTime,
  isWorkInstant,
  type HourPhase,
  type TimeFormat,
  type WorkHours
} from '@core/timeEngine'
import type { HolidayLookup } from '@core/holidays'
import { getHomeLocation, type Location } from '@core/timezones'
import { daysOffOn } from '@core/daysOff'

export interface WidgetRow {
  id: string
  label: string
  isHome: boolean
  time: string
  offset: string
  /**
   * Can you reach them right now? night = they are asleep; work = they are awake and you are in
   * your working hours; awake = they are awake but you are outside your hours.
   */
  phase: HourPhase
  /** Short weekday of the current local date, e.g. "Tue". */
  weekday: string
  /** True when the local calendar date differs from the home date. */
  otherDay: boolean
  /** The row's own day off or the public holiday there today (the first); absent on an ordinary day. */
  holiday?: string
}

/** Build compact widget display rows for the current instant. */
export function buildWidgetRows(
  locations: readonly Location[],
  timeFormat: TimeFormat,
  now: DateTime = DateTime.now(),
  work: WorkHours = DEFAULT_WORK_HOURS,
  holidays?: HolidayLookup
): WidgetRow[] {
  const home = getHomeLocation(locations)
  const homeDay = getLocalWallTime(now, home.iana)
  // One of your own days off takes your hours away, like a holiday at home.
  const inMyHours = isWorkInstant(now, home.iana, work, holidays) && daysOffOn(home, homeDay).length === 0
  return locations.map((location) => {
    const local = getLocalWallTime(now, location.iana)
    const asleep = classifyDayNight(local.hour) === 'night'
    const day = { year: local.year, month: local.month, day: local.day }
    // The row's own day off first (it is what that person entered), then the public holiday.
    const holiday = daysOffOn(location, day)[0] ?? holidays?.(location.iana, day)[0]
    return {
      id: location.id,
      label: location.label,
      isHome: Boolean(location.isHome) || location.id === home.id,
      time: formatLiveClock(now, location.iana, timeFormat),
      offset: offsetForLocation(location, now, home.iana),
      phase: asleep ? 'night' : inMyHours ? 'work' : 'awake',
      weekday: now.setZone(location.iana).toFormat('ccc'),
      otherDay:
        local.year !== homeDay.year || local.month !== homeDay.month || local.day !== homeDay.day,
      ...(holiday ? { holiday } : {})
    }
  })
}
