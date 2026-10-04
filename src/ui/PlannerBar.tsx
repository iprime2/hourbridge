import { useEffect, useMemo, useRef, useState } from 'react'
import '@ui/planner.css'
import { copyText, downloadTextFile, fileSlug } from '@ui/browser'
import { HolidayIcon } from '@ui/icons'
import {
  availableAt,
  holidaysDuring,
  isAsleepAt,
  type CityHolidays,
  type HourRange,
  type PlannerSummary
} from '@core/planner'
import { buildIcs, buildInviteText, formatSlot, type MeetingPlan } from '@core/share'
import {
  DEFAULT_WORK_HOURS,
  isWorkColumn,
  formatTime,
  type HourPhase,
  type TimeFormat,
  type TimelineColumn,
  type WorkHours
} from '@core/timeEngine'
import { describeHolidays } from '@core/formatters'
import type { Location } from '@core/timezones'

interface PlannerBarProps {
  selection: HourRange | null
  columns: TimelineColumn[]
  locations: readonly Location[]
  homeZone: string
  timeFormat: TimeFormat
  workHours?: WorkHours
  summary: PlannerSummary
  title: string
  onTitle: (title: string) => void
  onSelectRange: (from: number, to: number) => void
  onResize: (delta: number) => void
  onClear: () => void
  /** Platform share sheet (iOS). Desktop omits it and gets Copy + calendar download. */
  onShare?: (text: string, ics: string, filename: string) => void
  /** Empty-state instruction; the default describes mouse and keyboard use. */
  hint?: string
}

const DESKTOP_HINT =
  'Click or drag across the hours to plan a meeting. Arrow keys move the selection; Shift + arrows change its length.'

const PHASE_TEXT: Record<HourPhase, string> = {
  work: 'awake, and inside your working hours',
  awake: 'awake, outside your working hours',
  night: 'asleep'
}

/** "Miami", "Miami and London", "Miami, London and Tokyo", "Miami, London, Tokyo +2 more". */
function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`
  return `${names.slice(0, 3).join(', ')} +${names.length - 3} more`
}

/** "Tokyo (Culture Day)" — a city and what it is celebrating. */
function cityHoliday({ location, names }: CityHolidays): string {
  return `${location.label} (${names.join(', ')})`
}

/** "Tokyo is on a public holiday (Culture Day)." / "Tokyo (…) and Paris (…) are on a public holiday." */
function holidaySentence(items: readonly CityHolidays[]): string {
  if (items.length === 1) return `${items[0].location.label} is on a public holiday (${items[0].names.join(', ')}).`
  return `${listNames(items.map(cityHoliday))} are on a public holiday.`
}

/** "3 – 6 PM" style label for a run of home-hour columns, in the home zone. */
function windowLabel(range: HourRange, format: TimeFormat, homeLabel: string): string {
  const start = formatTime(range.start, 0, format)
  const end = formatTime((range.end + 1) % 24, 0, format)
  return `${start} – ${end} ${homeLabel}`
}

export default function PlannerBar({
  selection,
  columns,
  locations,
  homeZone,
  timeFormat,
  workHours = DEFAULT_WORK_HOURS,
  summary,
  title,
  onTitle,
  onSelectRange,
  onResize,
  onClear,
  onShare,
  hint = DESKTOP_HINT
}: PlannerBarProps) {
  const [status, setStatus] = useState('')
  const statusTimer = useRef<number>(0)
  useEffect(() => () => window.clearTimeout(statusTimer.current), [])

  const homeLabel = locations.find((l) => l.isHome)?.label ?? homeZone

  const plan: MeetingPlan | null = useMemo(() => {
    if (!selection) return null
    const first = columns[selection.start]
    const last = columns[selection.end]
    if (!first || !last) return null
    return { start: first.instant, end: last.instant.plus({ hours: 1 }) }
  }, [selection, columns])

  // Is the whole selection inside YOUR working hours? (Same answer for every city.)
  const insideMyHours = useMemo(() => {
    if (!selection) return false
    for (let h = selection.start; h <= selection.end; h++) {
      if (!isWorkColumn(columns[h], workHours)) return false
    }
    return true
  }, [selection, columns, workHours])

  // For each city: asleep at any point of the meeting? Otherwise how it sits against your hours.
  const perLocation = useMemo(() => {
    if (!selection) return []
    return locations.map((location) => {
      let asleep = false
      for (let h = selection.start; h <= selection.end && !asleep; h++) {
        asleep = isAsleepAt(columns[h], location)
      }
      const phase: HourPhase = asleep ? 'night' : insideMyHours ? 'work' : 'awake'
      return { location, phase }
    })
  }, [selection, columns, locations, insideMyHours])

  // Public holidays during the meeting, and (with nothing selected) anywhere on this date.
  const holidays = useMemo(() => holidaysDuring(columns, locations, selection), [columns, locations, selection])
  const holidayOf = (id: string): string[] => holidays.find((h) => h.location.id === id)?.names ?? []
  const homeIsOff =
    workHours.holidaysOff !== false && holidays.some((h) => h.location.id === locations.find((l) => l.isHome)?.id)

  const flash = (message: string): void => {
    setStatus(message)
    window.clearTimeout(statusTimer.current)
    statusTimer.current = window.setTimeout(() => setStatus(''), 2500)
  }

  const meetingTitle = title.trim() || 'Meeting'
  const inviteText = plan ? buildInviteText(plan, locations, timeFormat, meetingTitle) : ''
  const icsText = plan ? buildIcs(plan, { title: meetingTitle, description: inviteText }) : ''
  const icsName = `${fileSlug(meetingTitle)}.ics`

  async function onCopy(): Promise<void> {
    flash((await copyText(inviteText)) ? 'Copied to clipboard' : 'Could not copy')
  }

  const asleepNames = perLocation.filter((p) => p.phase === 'night').map((p) => p.location.label)
  const hours = selection ? selection.end - selection.start + 1 : 0

  const { best, sharedWindows } = summary
  const bestRange: HourRange | null = best ? { start: best.homeHour, end: best.homeHour } : null

  return (
    <section className="planner" role="region" aria-label="Meeting planner">
      {selection && plan ? (
        <>
          <div className="planner-head">
            <input
              className="planner-title"
              aria-label="Meeting title"
              placeholder="Meeting title"
              value={title}
              maxLength={80}
              onChange={(e) => onTitle(e.target.value)}
            />
            <div className="planner-when tabular">
              {formatSlot(plan, homeZone, timeFormat)}{' '}
              <span className="planner-zone">{homeLabel}</span>
            </div>
            <div className="planner-length" role="group" aria-label="Meeting length">
              <button
                type="button"
                className="btn btn-icon"
                aria-label="Shorten by one hour"
                disabled={hours <= 1}
                onClick={() => onResize(-1)}
              >
                −
              </button>
              <span className="planner-hours tabular" aria-live="off">
                {hours}h
              </span>
              <button
                type="button"
                className="btn btn-icon"
                aria-label="Lengthen by one hour"
                disabled={selection.end >= 23}
                onClick={() => onResize(1)}
              >
                +
              </button>
            </div>
            <div className="planner-actions">
              {onShare ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onShare(inviteText, icsText, icsName)}
                >
                  Share
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-primary" onClick={() => void onCopy()}>
                    Copy details
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      downloadTextFile(icsName, icsText, 'text/calendar;charset=utf-8')
                      flash('Calendar file saved')
                    }}
                  >
                    Add to calendar
                  </button>
                </>
              )}
              <button type="button" className="btn btn-ghost" onClick={onClear}>
                Clear
              </button>
            </div>
          </div>

          <ul className="planner-people" aria-label="Meeting time for each location">
            {perLocation.map(({ location, phase }) => (
              <li key={location.id} className={`planner-person is-${phase}`}>
                <span className="phase-dot" aria-hidden="true" />
                <span className="planner-person-name">{location.label}</span>
                <span className="planner-person-time tabular">
                  {formatSlot(plan, location.iana, timeFormat)}
                </span>
                {holidayOf(location.id).length ? (
                  <span className="planner-person-holiday" title={describeHolidays(holidayOf(location.id))}>
                    <HolidayIcon /> {holidayOf(location.id).join(', ')}
                  </span>
                ) : null}
                <span className="sr-only">
                  {PHASE_TEXT[phase]}
                  {holidayOf(location.id).length ? `, ${describeHolidays(holidayOf(location.id))}` : ''}
                </span>
              </li>
            ))}
          </ul>
          <p className="planner-summary">
            {insideMyHours ? 'Inside your working hours' : 'Outside your working hours'}
            {' · '}
            {asleepNames.length === 0
              ? 'everyone is awake.'
              : `${listNames(asleepNames)} ${asleepNames.length === 1 ? 'is' : 'are'} asleep.`}
            {holidays.length > 0 ? ` ${holidaySentence(holidays)}` : ''}
            {homeIsOff ? ' At home that is a day off.' : ''}
          </p>
        </>
      ) : (
        <div className="planner-empty">
          <span className="planner-hint">{hint}</span>
          {holidays.length > 0 ? (
            <span className="planner-holidays">
              <HolidayIcon /> <span className="sr-only">Public holidays: </span>
              {holidays.map(cityHoliday).join(' · ')}
              {homeIsOff ? ' — a day off for you' : ''}
            </span>
          ) : null}
          {sharedWindows.length > 0 ? (
            <div className="planner-suggest">
              <span className="planner-suggest-label">
                Best times — you’re working and nobody’s asleep{holidays.length > 0 ? ' or on holiday' : ''}:
              </span>
              {sharedWindows.map((w) => (
                <button
                  key={w.start}
                  type="button"
                  className="btn chip"
                  onClick={() => onSelectRange(w.start, w.end)}
                >
                  {windowLabel(w, timeFormat, homeLabel)}
                </button>
              ))}
            </div>
          ) : bestRange && best && availableAt(best) > 0 ? (
            <div className="planner-suggest">
              <span className="planner-suggest-label">
                No time works for everyone. Best compromise (
                {best.holiday
                  ? `${availableAt(best)} of ${best.total} available, ${best.holiday} on holiday`
                  : `${best.awake} of ${best.total} awake`}
                {best.mine ? '' : ', outside your hours'}):
              </span>
              <button
                type="button"
                className="btn chip"
                onClick={() => onSelectRange(bestRange.start, bestRange.end)}
              >
                {windowLabel(bestRange, timeFormat, homeLabel)}
              </button>
            </div>
          ) : null}
        </div>
      )}

      <div className="planner-status" role="status" aria-live="polite">
        {status}
      </div>
    </section>
  )
}
