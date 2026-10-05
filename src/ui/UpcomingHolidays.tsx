import { useState } from 'react'
import type { DateTime } from 'luxon'
import '@ui/upcoming.css'
import { describeDaysAway, formatHolidayDate } from '@core/formatters'
import {
  countryName,
  countryOfZone,
  coverageNote,
  daysBetween,
  holidayCoverage,
  HOLIDAY_YEARS,
  upcomingHolidays,
  type CalendarDay
} from '@core/holidays'
import { getHomeLocation, type Location } from '@core/timezones'
import { useCountryHolidays } from '@core/useHolidays'

interface UpcomingHolidaysProps {
  locations: readonly Location[]
  /** The first day to look at: the day the grid is showing. */
  from: CalendarDay
  /** The current moment, to say how far away each holiday is (in the chosen city's own date). */
  now: DateTime
  /** How many holiday days to list. */
  count?: number
}

const pad = (n: number): string => String(n).padStart(2, '0')

/**
 * The next few public holidays for one city of your choice (your home city to begin with), at the
 * bottom of both layouts. It says plainly when it has nothing to show and why — a country the data
 * does not cover, a file that did not load — rather than an empty list that looks like "no holidays".
 */
export default function UpcomingHolidays({ locations, from, now, count = 5 }: UpcomingHolidaysProps) {
  const [chosenId, setChosenId] = useState<string | null>(null)
  const home = getHomeLocation(locations)
  const active = locations.find((l) => l.id === chosenId) ?? home

  const code = countryOfZone(active.iana)
  const coverage = holidayCoverage(code)
  const country = code ? countryName(code) : null
  const table = useCountryHolidays(code)

  const there = now.setZone(active.iana)
  const today: CalendarDay = { year: there.year, month: there.month, day: there.day }
  const days = upcomingHolidays(table, from, count)

  let body
  if (coverage === 'unknown') {
    body = `${active.label} is on a timezone that belongs to no country, so it has no public holidays.`
  } else if (coverage === 'none') {
    body = `There is no public holiday data for ${country} yet.`
  } else if (table === undefined) {
    body = 'Loading holidays…'
  } else if (table === null) {
    body = `Could not load the holidays for ${country}. They need a connection the first time.`
  } else if (days.length === 0) {
    body = `No more public holidays after ${formatHolidayDate(from)} in the data, which covers ${HOLIDAY_YEARS[0]}–${HOLIDAY_YEARS[1]}.`
  }
  const note = coverage === 'partial' ? coverageNote(code) : null
  const isToday = daysBetween(today, from) === 0

  return (
    <section className="upcoming" aria-label="Upcoming public holidays">
      <div className="upcoming-head">
        <h2 className="upcoming-title">Upcoming holidays{country ? ` in ${country}` : ''}</h2>
        <span className="upcoming-from">{isToday ? 'from today' : `from ${formatHolidayDate(from)}`}</span>
        {locations.length > 1 ? (
          <div className="upcoming-cities" role="group" aria-label="Show holidays for">
            {locations.map((location) => (
              <button
                key={location.id}
                type="button"
                className="upcoming-city"
                aria-pressed={location.id === active.id}
                onClick={() => setChosenId(location.id)}
              >
                {location.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {body ? (
        <p className="upcoming-note" role="status">
          {body}
        </p>
      ) : (
        <ul className="upcoming-list" aria-label={`Next public holidays in ${country}`}>
          {days.map((day) => {
            const away = daysBetween(today, day)
            return (
              <li key={`${day.year}-${day.month}-${day.day}`} className="upcoming-item">
                <time className="upcoming-date" dateTime={`${day.year}-${pad(day.month)}-${pad(day.day)}`}>
                  {formatHolidayDate(day)}
                </time>
                <span className="upcoming-name">{day.names.join(' · ')}</span>
                <span className={['upcoming-away', away === 0 ? 'is-today' : ''].filter(Boolean).join(' ')}>
                  {describeDaysAway(away)}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {note ? (
        <p className="upcoming-note">
          <strong>{country}:</strong> {note}
        </p>
      ) : null}
    </section>
  )
}
