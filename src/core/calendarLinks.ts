import type { DateTime } from 'luxon'
import type { MeetingPlan } from './share'

export interface CalendarLinkOptions {
  title: string
  /** The invite text; trimmed if it would make the link too long to open reliably. */
  details?: string
}

/** Browsers and servers handle URLs of a couple of thousand characters; stay well inside that. */
const MAX_DETAILS_LENGTH = 1500

function clip(text: string): string {
  return text.length > MAX_DETAILS_LENGTH ? `${text.slice(0, MAX_DETAILS_LENGTH - 1)}…` : text
}

/**
 * A link that opens Google Calendar's "new event" page with this meeting filled in, for the person
 * to review and save. No sign-in or API is involved on our side: it is only a link to Google.
 * Times are UTC, so the event lands at the right moment in whatever zone the person's calendar uses.
 */
export function googleCalendarUrl(plan: MeetingPlan, { title, details = '' }: CalendarLinkOptions): string {
  const stamp = (dt: DateTime): string => dt.toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'")
  // The slash between the two times is part of the format, so it is not percent-encoded.
  return (
    'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    `&text=${encodeURIComponent(title)}` +
    `&dates=${stamp(plan.start)}/${stamp(plan.end)}` +
    `&details=${encodeURIComponent(clip(details))}`
  )
}

/**
 * The same for Outlook on the web (outlook.live.com). The `+` of the UTC offset must be encoded or
 * it turns into a space.
 */
export function outlookCalendarUrl(plan: MeetingPlan, { title, details = '' }: CalendarLinkOptions): string {
  const stamp = (dt: DateTime): string => dt.toUTC().toFormat("yyyy-LL-dd'T'HH:mm:ss'+00:00'")
  return (
    'https://outlook.live.com/calendar/0/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent' +
    `&subject=${encodeURIComponent(title)}` +
    `&startdt=${encodeURIComponent(stamp(plan.start))}` +
    `&enddt=${encodeURIComponent(stamp(plan.end))}` +
    `&body=${encodeURIComponent(clip(details))}`
  )
}
