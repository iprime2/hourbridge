import type { DateTime } from 'luxon'
import { DEFAULT_WORK_DAYS, formatTime, isWorkDay, type TimeFormat, type TimelineCell } from './timeEngine'
import { describeWorkDays, sameDays, sanitizeWorkDays } from './workDays'
import { sanitizeDaysOff } from './daysOff'
import type { Location } from './timezones'

/**
 * Someone's own working hours, in *their* city's local time: whole hours 0–23, both ends
 * inclusive (`{ start: 7, end: 15 }` is 7 AM to 3 PM and covers the 7 AM … 3 PM tiles), on the
 * days they work, judged in their own zone. `days` absent means Monday–Friday.
 *
 * Only rows other than home carry these: your own hours are the working hours in Settings.
 */
export interface PersonHours {
  start: number
  end: number
  days?: readonly number[]
}

export const MAX_PERSON_LENGTH = 40

/** A person's name as stored: one line, trimmed, at most 40 characters; empty when nothing is left. */
export function cleanPersonName(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_PERSON_LENGTH)
}

/** Valid hours in the stored form (`days` only when not Monday–Friday), or null. */
export function sanitizePersonHours(raw: unknown): PersonHours | null {
  if (!raw || typeof raw !== 'object') return null
  const h = raw as Record<string, unknown>
  const { start, end } = h
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null
  if ((start as number) < 0 || (end as number) > 23 || (start as number) > (end as number)) return null
  const days = h.days === undefined ? null : sanitizeWorkDays(h.days)
  if (h.days !== undefined && !days) return null
  return {
    start: start as number,
    end: end as number,
    ...(days && !sameDays(days, DEFAULT_WORK_DAYS) ? { days } : {})
  }
}

/**
 * The extra fields of a row, cleaned: a bad name, bad hours or a bad day off is dropped on its
 * own, so the city itself survives. Hours on the home row are kept but ignored (see `ownHours`), so making
 * someone home and back again does not lose them.
 */
export function cleanPersonFields<T extends Location>(location: T): T {
  const copy: T = { ...location }
  const person = cleanPersonName(copy.person)
  if (person) copy.person = person
  else delete copy.person
  const hours = sanitizePersonHours(copy.hours)
  if (hours) copy.hours = hours
  else delete copy.hours
  const daysOff = sanitizeDaysOff(copy.daysOff)
  if (daysOff) copy.daysOff = daysOff
  else delete copy.daysOff
  return copy
}

/** How a row is named in sentences: "Priya (Pune)", or just the city. */
export function rowName(location: Pick<Location, 'label' | 'person'>): string {
  return location.person ? `${location.person} (${location.label})` : location.label
}

/** The name a row is known by in a short list: the person, or the city. */
export function shortName(location: Pick<Location, 'label' | 'person'>): string {
  return location.person || location.label
}

/** Is this tile inside the person's own hours, on one of their days (their local date)? */
export function inPersonHours(
  cell: Pick<TimelineCell, 'hour' | 'weekday'>,
  hours: PersonHours
): boolean {
  return isWorkDay(cell.weekday, hours) && cell.hour >= hours.start && cell.hour <= hours.end
}

/** The own hours that count for this row: none for home, whose hours are yours. */
export function ownHours(location: Pick<Location, 'hours' | 'isHome'>): PersonHours | null {
  return location.isHome ? null : location.hours ?? null
}

/**
 * Is any moment of a meeting outside the person's hours? Checked like `isAsleepDuring`: at the
 * start, every 15 minutes, and at the last instant, in their zone.
 */
export function isOutsideHoursDuring(
  plan: { start: DateTime; end: DateTime },
  zone: string,
  hours: PersonHours
): boolean {
  if (plan.end <= plan.start) return false
  const outside = (t: DateTime): boolean => {
    const local = t.setZone(zone)
    return !inPersonHours({ hour: local.hour, weekday: local.weekday }, hours)
  }
  for (let t = plan.start; t < plan.end; t = t.plus({ minutes: 15 })) {
    if (outside(t)) return true
  }
  return outside(plan.end.minus({ milliseconds: 1 }))
}

/**
 * "9:00 AM … 5:00 PM, Mon–Fri": the first and last hour tiles, as Settings shows your own hours
 * (the end hour is included, so this runs until 5:59 PM).
 */
export function describePersonHours(hours: PersonHours, format: TimeFormat): string {
  return `${formatTime(hours.start, 0, format)} … ${formatTime(hours.end, 0, format)}, ${describeWorkDays(hours.days)}`
}
