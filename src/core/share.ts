import { DateTime } from 'luxon'
import { formatTime, type TimeFormat } from './timeEngine'
import { rowName } from './people'
import type { Location } from './timezones'

export interface MeetingPlan {
  /** Absolute start instant. */
  start: DateTime
  /** Absolute end instant (exclusive). */
  end: DateTime
}

function clock(dt: DateTime, mode: TimeFormat): string {
  return formatTime(dt.hour, dt.minute, mode)
}

/** "Mon, Sep 29 · 8:30 PM – 9:30 PM" for one location. */
export function formatSlot(plan: MeetingPlan, zone: string, mode: TimeFormat): string {
  const start = plan.start.setZone(zone)
  const end = plan.end.setZone(zone)
  const date = start.toFormat('ccc, LLL d')
  const endSuffix = end.hasSame(start, 'day') ? '' : ` (${end.toFormat('ccc')})`
  return `${date} · ${clock(start, mode)} – ${clock(end, mode)}${endSuffix}`
}

/** Plain-text summary suitable for chat/email: one line per location, home first. */
export function buildInviteText(
  plan: MeetingPlan,
  locations: readonly Location[],
  mode: TimeFormat,
  title = 'Proposed meeting time'
): string {
  const ordered = [...locations].sort((a, b) => Number(Boolean(b.isHome)) - Number(Boolean(a.isHome)))
  const lines = ordered.map(
    (l) => `${rowName(l)}${l.isHome ? ' (home)' : ''}: ${formatSlot(plan, l.iana, mode)}`
  )
  return [title, ...lines].join('\n')
}

/** ICS TEXT values: escape backslash, semicolon, comma, and newlines (RFC 5545 §3.3.11). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Fold a content line to 75 octets per RFC 5545 §3.1 (continuations start with one space). */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line
  const parts: string[] = []
  let current = ''
  let bytes = 0
  // First line may hold 75 octets; continuation lines 74 plus the leading space.
  let limit = 75
  for (const ch of line) {
    const size = encoder.encode(ch).length
    if (bytes + size > limit) {
      parts.push(current)
      current = ''
      bytes = 0
      limit = 74
    }
    current += ch
    bytes += size
  }
  if (current) parts.push(current)
  return parts.join('\r\n ')
}

function icsUtc(dt: DateTime): string {
  return dt.toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'")
}

export interface IcsOptions {
  title: string
  description?: string
  /** Stable id; defaults to one derived from the start instant. */
  uid?: string
  /** DTSTAMP; defaults to now. */
  now?: DateTime
}

/** A single-event iCalendar file in UTC, importable by Apple/Google/Outlook calendars. */
export function buildIcs(plan: MeetingPlan, options: IcsOptions): string {
  const stamp = icsUtc(options.now ?? DateTime.now())
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hourbridge//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${options.uid ?? `${icsUtc(plan.start)}@hourbridge.app`}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsUtc(plan.start)}`,
    `DTEND:${icsUtc(plan.end)}`,
    `SUMMARY:${escapeIcsText(options.title)}`
  ]
  if (options.description) lines.push(`DESCRIPTION:${escapeIcsText(options.description)}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.map(foldIcsLine).join('\r\n') + '\r\n'
}
