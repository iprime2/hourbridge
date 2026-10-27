import type { DateTime } from 'luxon'
import '@ui/upcoming.css'
import { describeDaysAway, formatHolidayDate } from '@core/formatters'
import {
  coverageNote,
  daysBetween,
  holidayCoverage,
  holidayGroups,
  HOLIDAY_YEARS,
  upcomingHolidays,
  type CalendarDay,
  type HolidayGroup
} from '@core/holidays'
import { getHomeLocation, type Location } from '@core/timezones'
import { useCountryHolidays } from '@core/useHolidays'
import { describeDayOffDates, upcomingDaysOff, type DayOff } from '@core/daysOff'
import { rowName } from '@core/people'

interface UpcomingHolidaysProps {
  locations: readonly Location[]
  /** The first day to look at: the day the grid is showing. */
  from: CalendarDay
  /** The current moment, to say how far away each holiday is (on each country's own date). */
  now: DateTime
  /** How many holiday days to list for each country. */
  count?: number
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** One country: its cities on the left, its next holidays on the right (or why there are none). */
function CountryRow({ group, from, now, count }: { group: HolidayGroup; from: CalendarDay; now: DateTime; count: number }) {
  const table = useCountryHolidays(group.code)
  const coverage = holidayCoverage(group.code)
  const there = now.setZone(group.zone)
  const today: CalendarDay = { year: there.year, month: there.month, day: there.day }
  const days = upcomingHolidays(table, from, count)

  let message: string | null = null
  if (coverage === 'unknown') {
    message = 'This timezone belongs to no country, so it has no public holidays.'
  } else if (coverage === 'none') {
    message = `No public holiday data for ${group.country} yet.`
  } else if (table === undefined) {
    message = 'Loading holidays…'
  } else if (table === null) {
    message = `Could not load the holidays for ${group.country}. They need a connection the first time.`
  } else if (days.length === 0) {
    message = `No more public holidays after ${formatHolidayDate(from)} in the data, which covers ${HOLIDAY_YEARS[0]}–${HOLIDAY_YEARS[1]}.`
  }
  const note = coverage === 'partial' ? coverageNote(group.code) : null

  return (
    <li className="upcoming-row">
      <div className="upcoming-where">
        <span className="upcoming-country">{group.country ?? group.cities.join(', ')}</span>
        {group.country ? <span className="upcoming-cities">{group.cities.join(', ')}</span> : null}
      </div>
      <div className="upcoming-what">
        {message ? (
          <p className="upcoming-note" role="status">
            {message}
          </p>
        ) : (
          <ul className="upcoming-days" aria-label={`Next public holidays in ${group.country}`}>
            {days.map((day) => {
              const away = daysBetween(today, day)
              return (
                <li key={`${day.year}-${day.month}-${day.day}`} className="upcoming-day">
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
        {note ? <p className="upcoming-note">{note}</p> : null}
      </div>
    </li>
  )
}

function dayOf(iso: string): CalendarDay {
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

/** One row's own days off still to come (from the day the grid shows), with how far away each is there. */
function DaysOffRow({ location, days, now }: { location: Location; days: readonly DayOff[]; now: DateTime }) {
  const there = now.setZone(location.iana)
  const today: CalendarDay = { year: there.year, month: there.month, day: there.day }
  return (
    <li className="upcoming-row is-own">
      <div className="upcoming-where">
        <span className="upcoming-country">{location.person ?? location.label}</span>
        <span className="upcoming-cities">{location.person ? `${location.label} · ` : ''}own days off</span>
      </div>
      <div className="upcoming-what">
        <ul className="upcoming-days" aria-label={`Upcoming days off for ${rowName(location)}`}>
          {days.map((day) => {
            const start = daysBetween(today, dayOf(day.from))
            const end = daysBetween(today, dayOf(day.to ?? day.from))
            const away = start <= 0 && end >= 0 ? 'now' : describeDaysAway(start)
            return (
              <li key={`${day.from}-${day.to ?? ''}-${day.name}`} className="upcoming-day">
                <time className="upcoming-date" dateTime={day.from}>
                  {describeDayOffDates(day)}
                </time>
                <span className="upcoming-name">{day.name}</span>
                <span className={['upcoming-away', away === 'now' || start === 0 ? 'is-today' : ''].filter(Boolean).join(' ')}>
                  {away}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </li>
  )
}

/**
 * The next few public holidays of every country on screen, all at once, at the bottom of both
 * layouts. Each country says plainly when it has nothing to show and why — a country the data does
 * not cover, a file that did not load — rather than an empty row that looks like "no holidays".
 */
export default function UpcomingHolidays({ locations, from, now, count = 3 }: UpcomingHolidaysProps) {
  const home = getHomeLocation(locations)
  const homeToday = now.setZone(home.iana)
  const isToday = daysBetween({ year: homeToday.year, month: homeToday.month, day: homeToday.day }, from) === 0
  const groups = holidayGroups(locations)
  const own = locations
    .map((location) => ({ location, days: upcomingDaysOff(location, from, count) }))
    .filter((r) => r.days.length > 0)

  return (
    <section className="upcoming" aria-label="Upcoming public holidays">
      <div className="upcoming-head">
        <h2 className="upcoming-title">Upcoming holidays</h2>
        <span className="upcoming-from">{isToday ? 'from today' : `from ${formatHolidayDate(from)}`}</span>
      </div>
      <ul className="upcoming-rows" aria-label="Upcoming holidays by country">
        {own.map(({ location, days }) => (
          <DaysOffRow key={`own-${location.id}`} location={location} days={days} now={now} />
        ))}
        {groups.map((group) => (
          <CountryRow key={group.key} group={group} from={from} now={now} count={count} />
        ))}
      </ul>
    </section>
  )
}
