import {
  buildDayTimeline,
  formatTime,
  getLocalWallTime,
  getOffsetHoursRelativeToHome,
  type HourPhase,
  type HourTransition,
  type TimeFormat,
  type TimelineColumn
} from '@core/timeEngine'
import type { HolidayLookup } from '@core/holidays'
import type { Location } from '@core/timezones'
import { DateTime } from 'luxon'
import type { CalendarDate } from '@core/useHourbridgeState'
import { daysOffOn } from '@core/daysOff'

/** Format offset hours like -9.5 → "−9:30", 5.5 → "+5:30", 0 → "0". */
export function formatOffsetHours(hours: number): string {
  if (Object.is(hours, -0) || hours === 0) return '0'
  const sign = hours < 0 ? '−' : '+'
  const abs = Math.abs(hours)
  const h = Math.floor(abs)
  const m = Math.round((abs - h) * 60)
  if (m === 0) return `${sign}${h}`
  return `${sign}${h}:${String(m).padStart(2, '0')}`
}

/** A tile label split so the UI can render the am/pm suffix smaller than the digits. */
export interface TileTimeParts {
  /** "9", "9:30", "21", "21:30" — minutes omitted on the hour. */
  digits: string
  /** "a" / "p" in 12-hour mode; empty in 24-hour mode. */
  suffix: string
}

export function tileTimeParts(hour: number, minute: number, mode: TimeFormat): TileTimeParts {
  const mm = String(minute).padStart(2, '0')
  if (mode === '24h') {
    const hh = String(hour).padStart(2, '0')
    return { digits: minute === 0 ? hh : `${hh}:${mm}`, suffix: '' }
  }
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return {
    digits: minute === 0 ? String(hour12) : `${hour12}:${mm}`,
    suffix: hour < 12 ? 'a' : 'p'
  }
}

/** Compact label for hour tiles (omit :00; keep :30). */
export function formatTileTime(hour: number, minute: number, mode: TimeFormat): string {
  const { digits, suffix } = tileTimeParts(hour, minute, mode)
  return `${digits}${suffix}`
}

/**
 * Short zone name for a row: a real abbreviation when the platform knows one (EDT, PST),
 * otherwise a numeric "UTC+5:30" — never the confusing "GMT+1" for London in summer.
 */
export function formatZoneAbbr(local: DateTime): string {
  const short = local.offsetNameShort ?? ''
  if (/^[A-Z]{2,5}$/.test(short) && short !== 'GMT') return short
  const offset = local.offset
  if (offset === 0) return 'UTC'
  const sign = offset < 0 ? '−' : '+'
  const abs = Math.abs(offset)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`
}

export function formatLiveClock(
  instant: DateTime,
  zone: string,
  mode: TimeFormat
): string {
  const local = getLocalWallTime(instant, zone)
  return formatTime(local.hour, local.minute, mode)
}

export function buildTimelineForLocations(
  date: CalendarDate,
  locations: readonly Location[],
  homeZone: string,
  holidays?: HolidayLookup
): TimelineColumn[] {
  const zones = locations.map((l) => l.iana)
  // Deduplicate zones for engine Record keys while preserving order for display via locations
  const uniqueZones = [...new Set(zones)]
  const columns = buildDayTimeline(date, uniqueZones, homeZone, holidays)
  // Your own days off (the home row's), on the home date: they take your working hours away.
  const home = locations.find((l) => l.isHome && l.iana === homeZone)
  const off = home ? daysOffOn(home, date) : []
  return off.length ? columns.map((c) => ({ ...c, homeDaysOff: off })) : columns
}

export function offsetForLocation(
  location: Location,
  instant: DateTime,
  homeZone: string
): string {
  if (location.isHome) return 'home'
  const hours = getOffsetHoursRelativeToHome(instant, location.iana, homeZone)
  return formatOffsetHours(hours)
}

/** Screen-reader / tooltip wording for a tile (never rely on colour alone). */
export function describeTilePhase(phase: HourPhase, asleep: boolean): string {
  if (phase === 'work') return asleep ? 'your working hours, night there' : 'your working hours'
  return phase === 'awake' ? 'awake' : 'night'
}

/** "Mon, Jan 26": a calendar day for a holiday list (the weekday matters when planning around it). */
export function formatHolidayDate(day: { year: number; month: number; day: number }): string {
  return DateTime.utc(day.year, day.month, day.day).toLocaleString({
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
}

/** How far a day is from today, in words: "today", "tomorrow", "in 3 days", "yesterday", "2 days ago". */
export function describeDaysAway(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  return days > 0 ? `in ${days} days` : `${-days} days ago`
}

/** Tooltip / screen-reader note for a tile on a public holiday. */
export function describeHolidays(names: readonly string[]): string {
  return `Public holiday: ${names.join(', ')}`
}

/** Tooltip / screen-reader note for a home hour that daylight saving makes special. */
export function describeHourTransition(transition: HourTransition): string {
  return transition === 'skipped'
    ? 'No such hour: the clocks go forward'
    : 'This hour happens twice; the first one is shown'
}
