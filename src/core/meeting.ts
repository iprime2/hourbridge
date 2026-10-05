import type { HourRange } from './planner'
import type { MeetingPlan } from './share'
import type { TimelineColumn } from './timeEngine'

/**
 * The meeting being planned, in the grid's own terms: when it starts and how long it lasts, in
 * minutes from midnight (home time) of the day the grid shows. The grid still shows whole-hour
 * tiles; a meeting can start on any quarter of an hour and last as little as 15 minutes.
 */
export interface Meeting {
  /** Minutes after the day's first home-hour column; a multiple of 15, 0 … 1425. */
  startMinute: number
  /** How long it lasts; a multiple of 15, at least 15, and it must end by midnight. */
  minutes: number
}

export const MIN_MEETING_MINUTES = 15
export const MINUTES_PER_DAY = 24 * 60

/** What a click on one hour tile selects, until the person picks another length. */
export const DEFAULT_MEETING_MINUTES = 60

/** The whole-hour range of columns a drag or a best-time chip selects, as a meeting. */
export function meetingFromRange(range: HourRange): Meeting {
  return { startMinute: range.start * 60, minutes: (range.end - range.start + 1) * 60 }
}

/** The hour columns a meeting touches (what the grid highlights). */
export function meetingColumns(meeting: Meeting): HourRange {
  return {
    start: Math.floor(meeting.startMinute / 60),
    end: Math.ceil((meeting.startMinute + meeting.minutes) / 60) - 1
  }
}

/**
 * The next length along 15, 30, 45, 60, 90, 120, 180, 240 …: quarter-hour steps up to an hour,
 * half-hour steps up to two, then whole hours. `steps` may be negative; it never goes below 15
 * minutes (the caller keeps it inside the day).
 */
export function stepMeetingLength(minutes: number, steps: number): number {
  let length = minutes
  for (let i = 0; i < Math.abs(steps); i++) {
    if (steps > 0) length += length < 60 ? 15 : length < 120 ? 30 : 60
    else length -= length <= 60 ? 15 : length <= 120 ? 30 : 60
    if (length <= MIN_MEETING_MINUTES) return MIN_MEETING_MINUTES
  }
  return length
}

/** Lengthen or shorten by `steps` rungs of the ladder, within 15 minutes … the end of the day. */
export function resizeMeeting(meeting: Meeting, steps: number): Meeting {
  const room = MINUTES_PER_DAY - meeting.startMinute
  const minutes = Math.min(room, stepMeetingLength(meeting.minutes, steps))
  return minutes === meeting.minutes ? meeting : { ...meeting, minutes }
}

/**
 * Move by whole hours, keeping the length and the minute past the hour. A meeting that fits in an
 * hour wraps around midnight (like a single tile always did); a longer one stops at the day's ends.
 */
export function moveMeeting(meeting: Meeting, hours: number): Meeting {
  const delta = hours * 60
  const latest = MINUTES_PER_DAY - meeting.minutes
  if (meeting.minutes <= 60) {
    const wrapped = (((meeting.startMinute + delta) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
    return { ...meeting, startMinute: Math.min(wrapped, latest) }
  }
  return { ...meeting, startMinute: Math.min(latest, Math.max(0, meeting.startMinute + delta)) }
}

/**
 * Start `minuteOfHour` (0, 15, 30 or 45) past the hour the meeting starts in. A meeting that would
 * then run past midnight is shortened to end there.
 */
export function withStartMinute(meeting: Meeting, minuteOfHour: number): Meeting {
  const startMinute = Math.floor(meeting.startMinute / 60) * 60 + minuteOfHour
  return { startMinute, minutes: Math.min(meeting.minutes, MINUTES_PER_DAY - startMinute) }
}

/**
 * The meeting as absolute instants, from the grid's columns. Whole-hour meetings come out exactly
 * as before (the end is the last column's instant plus an hour), and a partial hour is counted from
 * the column it falls in, so a daylight-saving change in the home zone cannot shift it.
 */
export function meetingPlan(meeting: Meeting, columns: readonly TimelineColumn[]): MeetingPlan | null {
  const range = meetingColumns(meeting)
  const first = columns[range.start]
  const last = columns[range.end]
  if (!first || !last) return null
  return {
    start: first.instant.plus({ minutes: meeting.startMinute - range.start * 60 }),
    end: last.instant.plus({ minutes: meeting.startMinute + meeting.minutes - range.end * 60 })
  }
}

/** "15m", "45m", "1h", "1h 30m". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** The same in words, for screen readers: "1 hour 30 minutes". */
export function describeDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const parts: string[] = []
  if (h) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`)
  if (m) parts.push(`${m} minutes`)
  return parts.join(' ')
}
