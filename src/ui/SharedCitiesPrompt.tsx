import '@ui/shared.css'
import { downloadTextFile, fileSlug } from '@ui/browser'
import { placeMeeting, type PlacedMeeting } from '@core/meeting'
import { buildIcs, buildInviteText, formatSlot, type MeetingPlan } from '@core/share'
import { mergeShared, type SharedLink, type SharedLocation, type SharedMeeting } from '@core/shareLink'
import type { TimeFormat } from '@core/timeEngine'
import type { Location } from '@core/timezones'

/** What a link with a meeting needs to show it in your own time and open it in the planner. */
export interface MeetingTarget {
  homeZone: string
  homeLabel: string
  timeFormat: TimeFormat
  /** Add the link's cities you do not have, then show the meeting (on its date) in the planner. */
  onOpen: (cities: readonly SharedLocation[], placed: PlacedMeeting, title: string | undefined) => void
}

interface SharedCitiesPromptProps {
  link: SharedLink
  /** Your cities now, to say how many of the shared ones are new to you. */
  current: readonly Location[]
  onReplace: (cities: readonly SharedLocation[]) => void
  onAdd: (cities: readonly SharedLocation[]) => void
  onDismiss: () => void
  /** Without it, a link's meeting is not offered and only its cities are. */
  meetingTarget?: MeetingTarget
}

const SHOWN_NAMES = 6

/** "Miami, IST, London" — the first few, then how many more. */
function nameList(cities: readonly SharedLocation[]): string {
  const names = cities.slice(0, SHOWN_NAMES).map((c) => c.label)
  const more = cities.length - names.length
  return more > 0 ? `${names.join(', ')} and ${more} more` : names.join(', ')
}

/** "Paris", "Paris and Tokyo", "Paris, Tokyo and Lima". */
function joinAnd(names: readonly string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * Shown when the page was opened from a link that carries a list of cities. Nothing changes until
 * the person chooses: add the new ones to theirs, replace theirs, or leave it.
 */
export default function SharedCitiesPrompt({
  link,
  current,
  onReplace,
  onAdd,
  onDismiss,
  meetingTarget
}: SharedCitiesPromptProps) {
  if (link.status === 'none') return null

  if (link.status === 'ready' && link.meeting && meetingTarget) {
    return (
      <SharedMeetingPrompt
        cities={link.cities}
        meeting={link.meeting}
        current={current}
        target={meetingTarget}
        onAdd={onAdd}
        onDismiss={onDismiss}
      />
    )
  }

  if (link.status === 'invalid') {
    return (
      <aside className="shared-prompt" role="region" aria-label="Shared cities">
        <p className="shared-text">
          <strong>This link’s list of cities could not be read.</strong> It may have been cut off or edited.
        </p>
        <div className="shared-actions">
          <button type="button" className="btn btn-ghost" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </aside>
    )
  }

  const { cities } = link
  const fresh = mergeShared(current, cities).length - current.length
  return (
    <aside className="shared-prompt" role="region" aria-label="Shared cities">
      <p className="shared-text">
        <strong>
          {cities.length} {cities.length === 1 ? 'city was' : 'cities were'} shared with you:
        </strong>{' '}
        {nameList(cities)}.{fresh === 0 ? ' You already have all of them.' : ''}
      </p>
      <div className="shared-actions">
        {fresh > 0 ? (
          <button type="button" className="btn btn-primary" onClick={() => onAdd(cities)}>
            Add {fresh} new {fresh === 1 ? 'city' : 'cities'}
          </button>
        ) : null}
        <button type="button" className="btn" onClick={() => onReplace(cities)}>
          Replace my cities
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </aside>
  )
}

interface SharedMeetingPromptProps {
  cities: readonly SharedLocation[]
  meeting: SharedMeeting
  current: readonly Location[]
  target: MeetingTarget
  onAdd: (cities: readonly SharedLocation[]) => void
  onDismiss: () => void
}

/**
 * A link that proposes a meeting: when it is in your own time, and with whom. Opening it adds the
 * cities you do not have (never changing your home) and shows the meeting in the planner. When the
 * planner cannot show it as one block on your calendar day, it can still go into your calendar.
 */
function SharedMeetingPrompt({ cities, meeting, current, target, onAdd, onDismiss }: SharedMeetingPromptProps) {
  const plan: MeetingPlan = { start: meeting.start, end: meeting.start.plus({ minutes: meeting.minutes }) }
  const placed = placeMeeting(meeting.start, meeting.minutes, target.homeZone)
  const added = mergeShared(current, cities).slice(current.length)

  const saveToCalendar = (): void => {
    const title = meeting.title ?? 'Meeting'
    const people = cities.map((city, i) => ({ id: `shared-${i}`, ...city }))
    const description = buildInviteText(plan, people, target.timeFormat, title)
    downloadTextFile(`${fileSlug(title)}.ics`, buildIcs(plan, { title, description }), 'text/calendar;charset=utf-8')
  }

  return (
    <aside className="shared-prompt" role="region" aria-label="Shared meeting">
      <p className="shared-text">
        <strong>
          {meeting.title ? <>“{meeting.title}” was shared with you:</> : 'A meeting was shared with you:'}
        </strong>{' '}
        <span className="tabular">{formatSlot(plan, target.homeZone, target.timeFormat)}</span> {target.homeLabel},
        with {nameList(cities)}.
        {placed
          ? added.length > 0
            ? ` Opening it adds ${joinAnd(added.map((l) => l.label))} to your cities.`
            : ''
          : ' It crosses midnight or a clock change where you are, so the planner can’t show it as one block.'}
      </p>
      <div className="shared-actions">
        {placed ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => target.onOpen(cities, placed, meeting.title)}
          >
            Open in planner
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={saveToCalendar}>
              Add to calendar
            </button>
            {added.length > 0 ? (
              <button type="button" className="btn" onClick={() => onAdd(cities)}>
                Add {added.length} new {added.length === 1 ? 'city' : 'cities'}
              </button>
            ) : null}
          </>
        )}
        <button type="button" className="btn btn-ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </aside>
  )
}
