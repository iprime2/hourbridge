import { useId, useState, type FormEvent } from 'react'
import '@ui/people.css'
import {
  cleanIsoDate,
  describeDayOffDates,
  MAX_DAY_OFF_NAME_LENGTH,
  MAX_DAY_OFF_SPAN,
  MAX_DAYS_OFF,
  spanDays,
  type DayOff
} from '@core/daysOff'
import type { Location } from '@core/timezones'

export interface DaysOffEditorProps {
  location: Location
  /** The whole new list; saved straight away. */
  onChange: (daysOff: DayOff[]) => void
}

/**
 * A row's own days off: a festival the holiday data lacks, a company holiday, someone's leave.
 * Dates are that city's own calendar dates. Shared by the desktop row dialog and the iOS city
 * sheet; every add and remove is saved at once.
 */
export default function DaysOffEditor({ location, onChange }: DaysOffEditorProps) {
  const id = useId()
  const [name, setName] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState('')
  const list = location.daysOff ?? []
  const full = list.length >= MAX_DAYS_OFF
  const who = location.person ?? location.label

  function add(e: FormEvent): void {
    e.preventDefault()
    const start = cleanIsoDate(from)
    const end = to ? cleanIsoDate(to) : start
    if (!start || !end) {
      setError('Pick a date between 2000 and 2099.')
      return
    }
    if (end < start) {
      setError('The last day can’t be before the first.')
      return
    }
    if (spanDays(start, end) > MAX_DAY_OFF_SPAN) {
      setError(`One entry can cover at most ${MAX_DAY_OFF_SPAN} days.`)
      return
    }
    onChange([...list, { from: start, ...(end !== start ? { to: end } : {}), name }])
    setName('')
    setFrom('')
    setTo('')
    setError('')
  }

  return (
    <section className="days-off" aria-labelledby={`${id}-title`}>
      <h3 className="settings-label" id={`${id}-title`}>
        Days off
      </h3>
      {list.length ? (
        <ul className="days-off-list" aria-label={`Days off for ${who}`}>
          {list.map((day, i) => (
            <li key={`${day.from}-${day.to ?? ''}-${day.name}-${i}`} className="days-off-item">
              <span className="days-off-what">
                <span className="days-off-name">{day.name}</span>
                <span className="days-off-dates">{describeDayOffDates(day)}</span>
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                aria-label={`Remove ${day.name}, ${describeDayOffDates(day)}`}
                onClick={() => onChange(list.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form className="days-off-new" onSubmit={add} aria-label={`Add a day off for ${who}`}>
        <input
          className="city-picker-input"
          aria-label="What it is"
          placeholder="e.g. Diwali, company holiday, leave"
          value={name}
          maxLength={MAX_DAY_OFF_NAME_LENGTH}
          disabled={full}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="settings-row">
          <label className="days-off-date">
            <span>From</span>
            <input
              type="date"
              className="settings-select"
              value={from}
              min="2000-01-01"
              max="2099-12-31"
              required
              disabled={full}
              onChange={(e) => {
                setFrom(e.target.value)
                setError('')
              }}
            />
          </label>
          <label className="days-off-date">
            <span>To (optional)</span>
            <input
              type="date"
              className="settings-select"
              value={to}
              min="2000-01-01"
              max="2099-12-31"
              disabled={full}
              onChange={(e) => {
                setTo(e.target.value)
                setError('')
              }}
            />
          </label>
        </div>
        <button type="submit" className="btn" disabled={full}>
          Add day off
        </button>
        {error ? (
          <p className="settings-notice is-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
      <span className="settings-hint">
        {full
          ? `That is the most days off a row keeps (${MAX_DAYS_OFF}). Remove one to add another.`
          : `Dates are ${location.label}’s own calendar days. ${
              location.isHome ? 'A day off here takes your working hours away.' : `On these days the planner treats ${who} as away.`
            } Saved as soon as you add or remove one.`}
      </span>
    </section>
  )
}
