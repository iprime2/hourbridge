import { countryName, countryOfZone, coverageGaps, HOLIDAY_DATA_SOURCE, HOLIDAY_YEARS } from '@core/holidays'
import type { ThemePreference } from '@core/persistence'
import { getHomeLocation, type Location } from '@core/timezones'
import { THEME_LABEL, THEME_ORDER } from '@core/theme'
import { DEFAULT_WORK_DAYS, formatTime, type TimeFormat, type WorkHours } from '@core/timeEngine'
import { describeWorkDays, toggleWorkDay, WEEKDAYS } from '@core/workDays'

interface SettingsPanelProps {
  theme: ThemePreference
  timeFormat: TimeFormat
  workHours: WorkHours
  onTheme: (theme: ThemePreference) => void
  onTimeFormat: (format: TimeFormat) => void
  onWorkHours: (hours: WorkHours) => void
  onSortByOffset?: () => void
  /** Name of the home city, so "working hours" says whose clock they are on. */
  homeLabel?: string
  /** The cities on screen. Without them the public-holiday section is left out. */
  locations?: readonly Location[]
}

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}

function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function hourLabel(hour: number, format: TimeFormat): string {
  return formatTime(hour, 0, format)
}

/** Appearance, time format, and working hours — shared by the desktop popover and the iOS sheet. */
export default function SettingsPanel({
  theme,
  timeFormat,
  workHours,
  onTheme,
  onTimeFormat,
  onWorkHours,
  onSortByOffset,
  homeLabel,
  locations
}: SettingsPanelProps) {
  const startOptions = Array.from({ length: 24 }, (_, h) => h)
  // Both ends are inclusive tiles, so the last hour can equal the first (a one-hour window).
  const endOptions = Array.from({ length: 24 - workHours.start }, (_, i) => workHours.start + i)
  const days = workHours.days ?? DEFAULT_WORK_DAYS
  const homeCountry = locations?.length ? countryOfZone(getHomeLocation(locations).iana) : null
  const gaps = locations ? coverageGaps(locations.map((l) => l.iana)) : []

  return (
    <div className="settings-panel">
      <div className="settings-field">
        <span className="settings-label">Appearance</span>
        <Segmented
          label="Theme"
          value={theme}
          options={THEME_ORDER.map((t) => ({ value: t, label: THEME_LABEL[t] }))}
          onChange={onTheme}
        />
      </div>

      <div className="settings-field">
        <span className="settings-label">Time format</span>
        <Segmented
          label="Time format"
          value={timeFormat}
          options={[
            { value: '12h', label: '12-hour' },
            { value: '24h', label: '24-hour' }
          ]}
          onChange={onTimeFormat}
        />
      </div>

      <div className="settings-field">
        <span className="settings-label">
          {homeLabel ? `Your working hours (${homeLabel} time)` : 'Your working hours'}
        </span>
        <div className="settings-row">
          <select
            className="settings-select"
            aria-label="Working hours start"
            value={workHours.start}
            onChange={(e) => {
              const start = Number(e.target.value)
              onWorkHours({ ...workHours, start, end: Math.max(workHours.end, start) })
            }}
          >
            {startOptions.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h, timeFormat)}
              </option>
            ))}
          </select>
          <span aria-hidden="true">to</span>
          <select
            className="settings-select"
            aria-label="Working hours end"
            value={workHours.end}
            onChange={(e) => onWorkHours({ ...workHours, end: Number(e.target.value) })}
          >
            {endOptions.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h, timeFormat)}
              </option>
            ))}
          </select>
        </div>
        <span className="settings-hint">
          Covers the {hourLabel(workHours.start, timeFormat)} …{' '}
          {hourLabel(workHours.end, timeFormat)} tiles on {describeWorkDays(days)}. Every city
          shows this same window in its own local time, so the green columns line up.
        </span>
      </div>

      <div className="settings-field">
        <span className="settings-label">Your working days</span>
        <div className="day-toggles" role="group" aria-label="Working days">
          {WEEKDAYS.map(({ iso, short, long }) => (
            <button
              key={iso}
              type="button"
              className="day-toggle"
              aria-pressed={days.includes(iso)}
              aria-label={long}
              onClick={() => onWorkHours({ ...workHours, days: toggleWorkDay(days, iso) })}
            >
              {short}
            </button>
          ))}
        </div>
        <span className="settings-hint">
          Tap a day to turn it on or off, for example off Thursday and Friday and working
          Saturday and Sunday. At least one day stays on.
        </span>
      </div>

      {locations ? (
        <div className="settings-field">
          <span className="settings-label">Public holidays</span>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={workHours.holidaysOff !== false}
              onChange={(e) => onWorkHours({ ...workHours, holidaysOff: e.target.checked })}
            />
            <span>
              {homeCountry
                ? `Public holidays in ${countryName(homeCountry)} are days off`
                : 'Public holidays at home are days off'}
            </span>
          </label>
          <span className="settings-hint">
            Each city&rsquo;s public holidays are marked on its tiles. Turn this on and a holiday at
            home takes your working hours away for that day, so it is not suggested for meetings.
          </span>
          {gaps.map((gap) => (
            <span key={gap.code} className="settings-hint settings-gap">
              <strong>{gap.country}:</strong>{' '}
              {gap.coverage === 'none' ? 'no public holiday data yet.' : gap.note}
            </span>
          ))}
          <span className="settings-hint">
            Holidays cover {HOLIDAY_YEARS[0]}–{HOLIDAY_YEARS[1]}, from {HOLIDAY_DATA_SOURCE}.
          </span>
        </div>
      ) : null}

      {onSortByOffset ? (
        <button type="button" className="btn" onClick={onSortByOffset}>
          Sort rows west → east
        </button>
      ) : null}
    </div>
  )
}
