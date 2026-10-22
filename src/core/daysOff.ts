import { DateTime } from 'luxon'
import type { CalendarDay } from './holidays'
import type { TimelineColumn } from './timeEngine'
import type { Location } from './timezones'

/**
 * A day (or run of days) a row is off that the public-holiday data does not know about: a
 * festival missing from the data, a company holiday, someone's leave. Dates are that row's *own*
 * calendar dates, like public holidays, as `YYYY-MM-DD`; `to` is inclusive and absent for one day.
 */
export interface DayOff {
  from: string
  to?: string
  name: string
}

export const MAX_DAYS_OFF = 50
export const MAX_DAY_OFF_NAME_LENGTH = 40
/** The longest run one entry may cover. */
export const MAX_DAY_OFF_SPAN = 366
export const DEFAULT_DAY_OFF_NAME = 'Day off'
const EARLIEST_YEAR = 2000
const LATEST_YEAR = 2100

/** A real calendar date in range, as `YYYY-MM-DD`, or null. */
export function cleanIsoDate(raw: unknown): string | null {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const dt = DateTime.fromISO(raw, { zone: 'utc' })
  // fromISO rolls nothing over, but check the round trip anyway: "2025-02-30" must not pass.
  if (!dt.isValid || dt.toISODate() !== raw) return null
  if (dt.year < EARLIEST_YEAR || dt.year >= LATEST_YEAR) return null
  return raw
}

function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_DAY_OFF_NAME_LENGTH)
}

/** Days between two ISO dates, counting both ends (1 for the same day). */
export function spanDays(from: string, to: string): number {
  const a = DateTime.fromISO(from, { zone: 'utc' })
  const b = DateTime.fromISO(to, { zone: 'utc' })
  return Math.round(b.diff(a, 'days').days) + 1
}

/** One entry, checked and in the stored form (`to` only when it is a later day), or null. */
export function sanitizeDayOff(raw: unknown): DayOff | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  const from = cleanIsoDate(d.from)
  if (!from) return null
  const to = d.to === undefined ? from : cleanIsoDate(d.to)
  if (!to || to < from || spanDays(from, to) > MAX_DAY_OFF_SPAN) return null
  return { from, ...(to !== from ? { to } : {}), name: cleanName(d.name) || DEFAULT_DAY_OFF_NAME }
}

/**
 * A row's list, cleaned: bad entries are dropped one by one, exact duplicates once, sorted by
 * date, at most 50. Null when nothing is left (so nothing is stored).
 */
export function sanitizeDaysOff(raw: unknown): DayOff[] | null {
  if (!Array.isArray(raw)) return null
  const seen = new Set<string>()
  const kept: DayOff[] = []
  for (const entry of raw) {
    const day = sanitizeDayOff(entry)
    if (!day) continue
    const key = `${day.from}|${day.to ?? ''}|${day.name}`
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(day)
  }
  kept.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : (a.to ?? a.from) < (b.to ?? b.from) ? -1 : 1))
  return kept.length ? kept.slice(0, MAX_DAYS_OFF) : null
}

export function isoDay(day: CalendarDay): string {
  return `${String(day.year).padStart(4, '0')}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`
}

/** The names of the row's days off that cover this calendar date (its own date), in order. */
export function daysOffOn(location: Pick<Location, 'daysOff'>, day: CalendarDay): string[] {
  if (!location.daysOff?.length) return []
  const key = isoDay(day)
  return location.daysOff.filter((d) => d.from <= key && key <= (d.to ?? d.from)).map((d) => d.name)
}

/** The row's days off at this column's instant, judged on the row's own calendar date. */
export function daysOffAt(column: Pick<TimelineColumn, 'cells'>, location: Pick<Location, 'iana' | 'daysOff'>): string[] {
  const cell = column.cells[location.iana]
  return cell ? daysOffOn(location, cell) : []
}

/** Entries that end on or after `from`, soonest first, at most `count`. */
export function upcomingDaysOff(location: Pick<Location, 'daysOff'>, from: CalendarDay, count = 3): DayOff[] {
  const key = isoDay(from)
  return (location.daysOff ?? []).filter((d) => (d.to ?? d.from) >= key).slice(0, count)
}

/** "Mon, Oct 20" or "Mon, Oct 20 – Fri, Oct 24" for an entry. */
export function describeDayOffDates(day: DayOff): string {
  const fmt = (iso: string) => DateTime.fromISO(iso, { zone: 'utc' }).toLocaleString({ weekday: 'short', month: 'short', day: 'numeric' })
  return day.to ? `${fmt(day.from)} – ${fmt(day.to)}` : fmt(day.from)
}

/** Tooltip / screen-reader note for a tile on one of the row's own days off. */
export function describeDaysOff(names: readonly string[]): string {
  return `Day off: ${names.join(', ')}`
}
