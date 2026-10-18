import { useEffect, useMemo, useRef, useState } from 'react'
import '@ui/planner.css'
import { copyText, downloadTextFile, fileSlug } from '@ui/browser'
import { HolidayIcon } from '@ui/icons'
import UpcomingSlots, { type UpcomingSlotsProps } from '@ui/UpcomingSlots'
import {
  describeDuration,
  formatDuration,
  meetingColumns,
  meetingPlan,
  resizeMeeting,
  type Meeting
} from '@core/meeting'
import {
  availableAt,
  holidaysDuring,
  isAsleepDuring,
  type CityHolidays,
  type HourRange,
  type PlannerSummary
} from '@core/planner'
import { googleCalendarUrl, outlookCalendarUrl } from '@core/calendarLinks'
import { buildShareUrl, meetingForLink } from '@core/shareLink'
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
import { isOutsideHoursDuring, ownHours, rowName } from '@core/people'

interface PlannerBarProps {
  /** The meeting being planned (when it starts and how long it lasts), or null. */
  meeting: Meeting | null
  columns: TimelineColumn[]
  locations: readonly Location[]
  homeZone: string
  timeFormat: TimeFormat
  workHours?: WorkHours
  summary: PlannerSummary
  title: string
  onTitle: (title: string) => void
  onSelectRange: (from: number, to: number) => void
  /** Lengthen (+1) or shorten (−1) by one step: 15 minutes up to an hour, 30 up to two, then hourly. */
  onResize: (steps: number) => void
  /** Start at :00, :15, :30 or :45 of the hour the meeting starts in. */
  onStartMinute: (minuteOfHour: number) => void
  onClear: () => void
  /** Platform share sheet (iOS). Desktop omits it and gets Copy + calendar download. */
  onShare?: (text: string, ics: string, filename: string) => void
  /** Empty-state instruction; the default describes mouse and keyboard use. */
  hint?: string
  /**
   * Offer "Google Calendar" and "Outlook" links (they open that calendar's own page with the meeting
   * filled in). Left off in the iOS app, whose share sheet already reaches the calendars.
   */
  calendarLinks?: boolean
  /**
   * The page address, without its fragment, when it is one other people can open (the web app).
   * With it the planner offers "Copy link": a link to this meeting and these cities that opens in
   * the other person's own timezone. The desktop and iOS apps have no such address and leave it out.
   */
  shareBase?: string
  /** Search the days after the one shown for good times (left out, only the day is planned). */
  upcoming?: Pick<UpcomingSlotsProps, 'from' | 'holidays' | 'now' | 'onPick'>
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

/** "asleep", "asleep or on holiday", "asleep, on holiday or outside their hours" (empty items skipped). */
function orList(items: readonly string[]): string {
  const kept = items.filter(Boolean)
  if (kept.length <= 1) return kept.join('')
  return `${kept.slice(0, -1).join(', ')} or ${kept[kept.length - 1]}`
}

/** "Tokyo (Culture Day)" — a city and what it is celebrating. */
function cityHoliday({ location, names }: CityHolidays): string {
  return `${rowName(location)} (${names.join(', ')})`
}

/** "Tokyo is on a public holiday (Culture Day)." / "Tokyo (…) and Paris (…) are on a public holiday." */
function holidaySentence(items: readonly CityHolidays[]): string {
  if (items.length === 1) return `${rowName(items[0].location)} is on a public holiday (${items[0].names.join(', ')}).`
  return `${listNames(items.map(cityHoliday))} are on a public holiday.`
}

/** "3 – 6 PM" style label for a run of home-hour columns, in the home zone. */
function windowLabel(range: HourRange, format: TimeFormat, homeLabel: string): string {
  const start = formatTime(range.start, 0, format)
  const end = formatTime((range.end + 1) % 24, 0, format)
  return `${start} – ${end} ${homeLabel}`
}

export default function PlannerBar({
  meeting,
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
  onStartMinute,
  onClear,
  onShare,
  hint = DESKTOP_HINT,
  calendarLinks = true,
  shareBase,
  upcoming
}: PlannerBarProps) {
  const [status, setStatus] = useState('')
  const statusTimer = useRef<number>(0)
  useEffect(() => () => window.clearTimeout(statusTimer.current), [])

  const homeLabel = locations.find((l) => l.isHome)?.label ?? homeZone

  const plan: MeetingPlan | null = useMemo(() => (meeting ? meetingPlan(meeting, columns) : null), [meeting, columns])
  /** The hour columns the meeting touches. */
  const selection: HourRange | null = useMemo(() => (meeting ? meetingColumns(meeting) : null), [meeting])

  // Is the whole selection inside YOUR working hours? (Same answer for every city.)
  const insideMyHours = useMemo(() => {
    if (!selection) return false
    for (let h = selection.start; h <= selection.end; h++) {
      if (!isWorkColumn(columns[h], workHours)) return false
    }
    return true
  }, [selection, columns, workHours])

  // For each city: asleep at any point of the meeting? Otherwise how it sits against your hours.
  // Someone with their own hours is never "asleep" inside them, and is flagged when it runs outside.
  const perLocation = useMemo(() => {
    if (!plan) return []
    return locations.map((location) => {
      const hours = ownHours(location)
      const outside = hours ? isOutsideHoursDuring(plan, location.iana, hours) : false
      const asleep = (!hours || outside) && isAsleepDuring(plan, location.iana)
      const phase: HourPhase = asleep ? 'night' : insideMyHours ? 'work' : 'awake'
      return { location, phase, offHours: outside && !asleep }
    })
  }, [plan, locations, insideMyHours])

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

  // A meeting that cannot travel in a link (one stretched by a clock change, say) gets no button.
  const linkMeeting = plan && shareBase ? meetingForLink(plan, title) : null

  async function onCopyLink(): Promise<void> {
    if (!shareBase || !linkMeeting) return
    const url = buildShareUrl(shareBase, locations, linkMeeting)
    flash((await copyText(url)) ? 'Link copied: it opens this meeting in each person’s own time' : 'Could not copy')
  }

  const asleepNames = perLocation.filter((p) => p.phase === 'night').map((p) => rowName(p.location))
  const offHoursNames = perLocation.filter((p) => p.offHours).map((p) => rowName(p.location))
  const anyOwnHours = locations.some((l) => ownHours(l) !== null)
  const canShorten = meeting ? resizeMeeting(meeting, -1) !== meeting : false
  const canLengthen = meeting ? resizeMeeting(meeting, 1) !== meeting : false

  const { best, sharedWindows } = summary
  const bestRange: HourRange | null = best ? { start: best.homeHour, end: best.homeHour } : null

  return (
    <section className="planner" role="region" aria-label="Meeting planner">
      {meeting && selection && plan ? (
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
            <select
              className="settings-select planner-start"
              aria-label="Start time"
              value={meeting.startMinute % 60}
              onChange={(e) => onStartMinute(Number(e.target.value))}
            >
              {[0, 15, 30, 45].map((minute) => (
                <option key={minute} value={minute}>
                  {formatTime(selection.start, minute, timeFormat)}
                </option>
              ))}
            </select>
            <div className="planner-length" role="group" aria-label="Meeting length">
              <button
                type="button"
                className="btn btn-icon"
                aria-label="Shorten the meeting"
                disabled={!canShorten}
                onClick={() => onResize(-1)}
              >
                −
              </button>
              <span className="planner-hours tabular">
                <span aria-hidden="true">{formatDuration(meeting.minutes)}</span>
                <span className="sr-only">{describeDuration(meeting.minutes)}</span>
              </span>
              <button
                type="button"
                className="btn btn-icon"
                aria-label="Lengthen the meeting"
                disabled={!canLengthen}
                onClick={() => onResize(1)}
              >
                +
              </button>
            </div>
            <div className="planner-actions">
              {onShare ? (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => onShare(inviteText, icsText, icsName)}
                  >
                    Share
                  </button>
                  {linkMeeting ? (
                    <button type="button" className="btn" onClick={() => void onCopyLink()}>
                      Copy link
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <button type="button" className="btn btn-primary" onClick={() => void onCopy()}>
                    Copy details
                  </button>
                  {linkMeeting ? (
                    <button type="button" className="btn" onClick={() => void onCopyLink()}>
                      Copy link
                    </button>
                  ) : null}
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
              {calendarLinks ? (
                <>
                  <a
                    className="btn"
                    href={googleCalendarUrl(plan, { title: meetingTitle, details: inviteText })}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Add to Google Calendar (opens in a new tab)"
                  >
                    Google Calendar
                  </a>
                  <a
                    className="btn"
                    href={outlookCalendarUrl(plan, { title: meetingTitle, details: inviteText })}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Add to Outlook (opens in a new tab)"
                  >
                    Outlook
                  </a>
                </>
              ) : null}
              <button type="button" className="btn btn-ghost" onClick={onClear}>
                Clear
              </button>
            </div>
          </div>

          <ul className="planner-people" aria-label="Meeting time for each location">
            {perLocation.map(({ location, phase, offHours }) => (
              <li key={location.id} className={`planner-person is-${phase}`}>
                <span className="phase-dot" aria-hidden="true" />
                <span className="planner-person-name">{rowName(location)}</span>
                <span className="planner-person-time tabular">
                  {formatSlot(plan, location.iana, timeFormat)}
                </span>
                {holidayOf(location.id).length ? (
                  <span className="planner-person-holiday" title={describeHolidays(holidayOf(location.id))}>
                    <HolidayIcon /> {holidayOf(location.id).join(', ')}
                  </span>
                ) : null}
                {offHours ? <span className="planner-person-off">outside their hours</span> : null}
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
            {offHoursNames.length > 0
              ? ` ${listNames(offHoursNames)} ${offHoursNames.length === 1 ? 'is' : 'are'} outside their working hours.`
              : ''}
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
                Best times — you’re working and nobody’s{' '}
                {orList(['asleep', holidays.length > 0 ? 'on holiday' : '', anyOwnHours ? 'outside their hours' : ''])}:
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
                {best.holiday || best.offHours
                  ? [
                      `${availableAt(best)} of ${best.total} available`,
                      best.holiday ? `${best.holiday} on holiday` : '',
                      best.offHours ? `${best.offHours} off work` : ''
                    ]
                      .filter(Boolean)
                      .join(', ')
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
          {upcoming ? (
            <UpcomingSlots
              {...upcoming}
              locations={locations}
              homeZone={homeZone}
              homeLabel={homeLabel}
              timeFormat={timeFormat}
              workHours={workHours}
            />
          ) : null}
        </div>
      )}

      <div className="planner-status" role="status" aria-live="polite">
        {status}
      </div>
    </section>
  )
}
