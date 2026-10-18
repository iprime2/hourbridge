import { useRef, useState, type ChangeEvent } from 'react'
import { copyText, downloadTextFile } from '@ui/browser'
import { countryName, countryOfZone, coverageGaps, HOLIDAY_DATA_SOURCE, HOLIDAY_YEARS } from '@core/holidays'
import type { Board, ResolvedState, ThemePreference } from '@core/persistence'
import { BoardsSettings, type BoardControls } from '@ui/Boards'
import {
  buildSettingsFile,
  MAX_SETTINGS_FILE_CHARS,
  parseSettingsFile,
  settingsFileName
} from '@core/settingsFile'
import { buildShareUrl, isShareableProtocol } from '@core/shareLink'
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
  /** Apply an imported settings file (already validated). Without it there is no "Your data" section. */
  onImportSettings?: (settings: ResolvedState) => void
  /** Where an exported file goes. Defaults to a browser download; iOS passes its share sheet. */
  onExportFile?: (filename: string, text: string) => void | Promise<void>
  /** Make, rename, switch and delete boards. Without it there is no "Boards" section. */
  boardControls?: BoardControls
  /** Every board with its cities, so an exported file carries them all. */
  savedBoards?: { boards: readonly Board[]; activeBoard: string }
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

// FileReader rather than Blob.text(): it works in every webview the app runs in.
function readFileText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

const canShareLink = (): boolean => typeof window !== 'undefined' && isShareableProtocol(window.location.protocol)

interface Notice {
  kind: 'ok' | 'error'
  text: string
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
  locations,
  onImportSettings,
  onExportFile,
  boardControls,
  savedBoards
}: SettingsPanelProps) {
  const [pending, setPending] = useState<ResolvedState | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const startOptions = Array.from({ length: 24 }, (_, h) => h)
  // Both ends are inclusive tiles, so the last hour can equal the first (a one-hour window).
  const endOptions = Array.from({ length: 24 - workHours.start }, (_, i) => workHours.start + i)
  const days = workHours.days ?? DEFAULT_WORK_DAYS
  const homeCountry = locations?.length ? countryOfZone(getHomeLocation(locations).iana) : null
  const gaps = locations ? coverageGaps(locations.map((l) => l.iana)) : []

  async function exportSettings(): Promise<void> {
    if (!locations) return
    const filename = settingsFileName()
    const text = buildSettingsFile({
      locations: [...locations],
      timeFormat,
      theme,
      workHours,
      ...(savedBoards ? { boards: [...savedBoards.boards], activeBoard: savedBoards.activeBoard } : {})
    })
    try {
      await (onExportFile ?? ((name, content) => downloadTextFile(name, content, 'application/json')))(filename, text)
      setNotice({ kind: 'ok', text: `Saved ${filename}.` })
    } catch {
      setNotice({ kind: 'error', text: 'Could not save the file.' })
    }
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = '' // so choosing the same file again still counts
    setPending(null)
    if (!file) return
    // Check the size before reading: a few KB is normal, and four bytes a character is the worst case.
    if (file.size > MAX_SETTINGS_FILE_CHARS * 4) {
      setNotice({ kind: 'error', text: 'This file is too large to be a Hourbridge settings file.' })
      return
    }
    try {
      const result = parseSettingsFile(await readFileText(file))
      if (result.ok) {
        setNotice(null)
        setPending(result.state)
      } else {
        setNotice({ kind: 'error', text: result.error })
      }
    } catch {
      setNotice({ kind: 'error', text: 'Could not read the file.' })
    }
  }

  function applyImport(): void {
    if (!pending || !onImportSettings) return
    onImportSettings(pending)
    setPending(null)
    setNotice({ kind: 'ok', text: 'Settings imported.' })
  }

  async function copyShareLink(): Promise<void> {
    if (!locations) return
    const base = `${window.location.origin}${window.location.pathname}`
    const copied = await copyText(buildShareUrl(base, locations))
    setNotice(
      copied
        ? { kind: 'ok', text: 'Link copied. Whoever opens it can add your cities to theirs.' }
        : { kind: 'error', text: 'Could not copy the link.' }
    )
  }

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

      {boardControls ? <BoardsSettings {...boardControls} /> : null}

      {locations && onImportSettings ? (
        <div className="settings-field">
          <span className="settings-label">Your data</span>
          <div className="settings-actions">
            <button type="button" className="btn" onClick={() => void exportSettings()}>
              Export settings
            </button>
            <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
              Import settings…
            </button>
            {canShareLink() ? (
              <button type="button" className="btn" onClick={() => void copyShareLink()}>
                Copy share link
              </button>
            ) : null}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="Choose a settings file to import"
            onChange={(e) => void chooseFile(e)}
          />
          {pending ? (
            <div className="settings-pending" role="group" aria-label="Import settings">
              <p>
                Replace your cities, boards and settings with the ones in this file? It has {pending.locations.length}{' '}
                {pending.locations.length === 1 ? 'city' : 'cities'} (home: {getHomeLocation(pending.locations).label}),{' '}
                {pending.timeFormat === '24h' ? '24-hour' : '12-hour'} time and the {THEME_LABEL[pending.theme].toLowerCase()} theme.
                {pending.boards.length > 1
                  ? ` It also has ${pending.boards.length - 1} more ${pending.boards.length === 2 ? 'board' : 'boards'}.`
                  : ''}
              </p>
              <div className="settings-actions">
                <button type="button" className="btn btn-primary" onClick={applyImport}>
                  Replace my settings
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          {notice ? (
            <p
              className={['settings-notice', notice.kind === 'error' ? 'is-error' : ''].filter(Boolean).join(' ')}
              role={notice.kind === 'error' ? 'alert' : 'status'}
            >
              {notice.text}
            </p>
          ) : null}
          <span className="settings-hint">
            Your cities and settings are kept in this browser only. Export them to keep a copy or move them to
            another device. A share link carries just your list of cities, in the part of the address that is
            never sent to a server.
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
