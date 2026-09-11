import {
  buildDayTimeline,
  formatTime,
  getLocalWallTime,
  getOffsetHoursRelativeToHome,
  type TimeFormat,
  type TimelineColumn
} from '@renderer/lib/timeEngine'
import type { Location } from '@renderer/lib/timezones'
import { DateTime } from 'luxon'
import type { CalendarDate } from '@renderer/hooks/useTimeBuddyState'

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

/** Compact label for hour tiles (omit :00; keep :30). */
export function formatTileTime(hour: number, minute: number, mode: TimeFormat): string {
  if (mode === '24h') {
    const hh = String(hour).padStart(2, '0')
    return minute === 0 ? hh : `${hh}:${String(minute).padStart(2, '0')}`
  }
  const period = hour < 12 ? 'a' : 'p'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  if (minute === 0) return `${hour12}${period}`
  return `${hour12}:${String(minute).padStart(2, '0')}${period}`
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
  homeZone: string
): TimelineColumn[] {
  const zones = locations.map((l) => l.iana)
  // Deduplicate zones for engine Record keys while preserving order for display via locations
  const uniqueZones = [...new Set(zones)]
  return buildDayTimeline(date, uniqueZones, homeZone)
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
