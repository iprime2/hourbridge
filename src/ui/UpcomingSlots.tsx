import { useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import type { CalendarDay, HolidayLookup } from '@core/holidays'
import type { HourRange } from '@core/planner'
import { addDays, findSlots, formatDayLabel } from '@core/slotFinder'
import { formatTime, type TimeFormat, type WorkHours } from '@core/timeEngine'
import type { Location } from '@core/timezones'

export interface UpcomingSlotsProps {
  /** The day the grid shows; the search covers the days after it. */
  from: CalendarDay
  locations: readonly Location[]
  homeZone: string
  homeLabel: string
  timeFormat: TimeFormat
  workHours: WorkHours
  holidays?: HolidayLookup
  /** Hours that have started by now are not offered. */
  now: DateTime
  onPick: (date: CalendarDay, range: HourRange) => void
}

const DAY_CHOICES = [7, 14]
/** Chips shown; the rest are counted. Enough for two working weeks of one slot a day. */
const SHOWN_SLOTS = 10
const QUARTER_HOUR_MS = 15 * 60_000

/** "3:00 PM – 6:00 PM" for a run of home-hour columns (the end tile is included). */
function rangeText(range: HourRange, format: TimeFormat): string {
  return `${formatTime(range.start, 0, format)} – ${formatTime((range.end + 1) % 24, 0, format)}`
}

/**
 * The planner's best times for the next 7 or 14 days, as chips that open the day with the slot
 * selected. Shown under the day's own best times, so the day on screen is not repeated.
 */
export default function UpcomingSlots({
  from,
  locations,
  homeZone,
  homeLabel,
  timeFormat,
  workHours,
  holidays,
  now,
  onPick
}: UpcomingSlotsProps) {
  const [days, setDays] = useState(DAY_CHOICES[0])
  // The clock ticks every minute; the search only needs a new cut-off every quarter of an hour.
  const quarter = Math.ceil(now.toMillis() / QUARTER_HOUR_MS)

  const slots = useMemo(
    () =>
      findSlots({
        from: addDays(from, 1),
        days,
        locations,
        homeZone,
        work: workHours,
        holidays,
        notBefore: DateTime.fromMillis(quarter * QUARTER_HOUR_MS)
      }),
    [from, days, locations, homeZone, workHours, holidays, quarter]
  )

  return (
    <div className="planner-suggest planner-upcoming">
      <span className="planner-suggest-label">
        Next{' '}
        <select
          className="settings-select planner-days"
          aria-label="Days ahead to search"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {DAY_CHOICES.map((n) => (
            <option key={n} value={n}>
              {n} days
            </option>
          ))}
        </select>{' '}
        ({homeLabel}):
      </span>
      {slots.length === 0 ? (
        <span className="planner-upcoming-note">
          No time in these {days} days works for everyone inside your working hours.
          {days < DAY_CHOICES[DAY_CHOICES.length - 1] ? ` Try ${DAY_CHOICES[DAY_CHOICES.length - 1]} days.` : ''}
        </span>
      ) : (
        <>
          {slots.slice(0, SHOWN_SLOTS).map(({ date, range }) => (
            <button
              key={`${date.year}-${date.month}-${date.day}-${range.start}`}
              type="button"
              className="btn chip"
              onClick={() => onPick(date, range)}
            >
              {/* The space sits outside the hidden span: inside it, the accessible name loses it. */}
              {formatDayLabel(date)} · {rangeText(range, timeFormat)}{' '}
              <span className="sr-only">{homeLabel}</span>
            </button>
          ))}
          {slots.length > SHOWN_SLOTS ? (
            <span className="planner-upcoming-note">+{slots.length - SHOWN_SLOTS} more</span>
          ) : null}
        </>
      )}
    </div>
  )
}
