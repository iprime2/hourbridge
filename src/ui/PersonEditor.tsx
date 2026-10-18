import '@ui/people.css'
import { useId, useState, type FormEvent } from 'react'
import { describePersonHours, MAX_PERSON_LENGTH, type PersonHours } from '@core/people'
import { formatTime, type TimeFormat } from '@core/timeEngine'
import type { Location } from '@core/timezones'
import { toggleWorkDay, WEEKDAYS } from '@core/workDays'

export interface PersonEditorProps {
  location: Location
  timeFormat: TimeFormat
  onSave: (person: string, hours: PersonHours | null) => void
  onCancel?: () => void
  /** Put the cursor in the name field (the desktop dialog; not on a phone, where it raises the keyboard). */
  autoFocus?: boolean
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const DEFAULT_HOURS: PersonHours = { start: 9, end: 17 }

/**
 * Who a row is for, and their own working hours in that city's time. Shared by the desktop row
 * popover and the iOS city sheet. The home row has no own hours: yours are in Settings.
 */
export default function PersonEditor({ location, timeFormat, onSave, onCancel, autoFocus = false }: PersonEditorProps) {
  const id = useId()
  const [name, setName] = useState(location.person ?? '')
  const [hasHours, setHasHours] = useState(Boolean(location.hours) && !location.isHome)
  const [hours, setHours] = useState<PersonHours>(location.hours ?? DEFAULT_HOURS)
  const days = hours.days ?? [1, 2, 3, 4, 5]

  function submit(e: FormEvent): void {
    e.preventDefault()
    onSave(name, hasHours && !location.isHome ? hours : null)
  }

  return (
    <form className="person-editor" onSubmit={submit} aria-label={`Person for ${location.label}`}>
      <label className="settings-field" htmlFor={`${id}-name`}>
        <span className="settings-label">Person</span>
        <input
          id={`${id}-name`}
          className="city-picker-input"
          value={name}
          maxLength={MAX_PERSON_LENGTH}
          placeholder={`Who is in ${location.label}?`}
          autoComplete="off"
          autoFocus={autoFocus}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      {location.isHome ? (
        <span className="settings-hint">This is you. Your working hours are in Settings.</span>
      ) : (
        <div className="settings-field">
          <label className="settings-check">
            <input type="checkbox" checked={hasHours} onChange={(e) => setHasHours(e.target.checked)} />
            <span>Has their own working hours</span>
          </label>
          {hasHours ? (
            <>
              <div className="settings-row">
                <select
                  className="settings-select"
                  aria-label={`Their hours start (${location.label} time)`}
                  value={hours.start}
                  onChange={(e) => {
                    const start = Number(e.target.value)
                    setHours({ ...hours, start, end: Math.max(hours.end, start) })
                  }}
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {formatTime(h, 0, timeFormat)}
                    </option>
                  ))}
                </select>
                <span aria-hidden="true">to</span>
                <select
                  className="settings-select"
                  aria-label={`Their hours end (${location.label} time)`}
                  value={hours.end}
                  onChange={(e) => setHours({ ...hours, end: Number(e.target.value) })}
                >
                  {HOURS.filter((h) => h >= hours.start).map((h) => (
                    <option key={h} value={h}>
                      {formatTime(h, 0, timeFormat)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="day-toggles" role="group" aria-label="Their working days">
                {WEEKDAYS.map(({ iso, short, long }) => (
                  <button
                    key={iso}
                    type="button"
                    className="day-toggle"
                    aria-pressed={days.includes(iso)}
                    aria-label={long}
                    onClick={() => setHours({ ...hours, days: toggleWorkDay(days, iso) })}
                  >
                    {short}
                  </button>
                ))}
              </div>
              <span className="settings-hint">
                Covers the {describePersonHours(hours, timeFormat)} tiles in {location.label} time, marked with a bar
                along the top. The planner only counts them as free inside these hours.
              </span>
            </>
          ) : (
            <span className="settings-hint">Without them, anyone awake there counts as free.</span>
          )}
        </div>
      )}

      <div className="settings-actions">
        <button type="submit" className="btn btn-primary">
          Save
        </button>
        {onCancel ? (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  )
}
