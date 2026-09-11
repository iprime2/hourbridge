import { DateTime } from 'luxon'
import { HOME_TIMEZONE, type IanaTimezone } from './timezones'

export type TimeFormat = '12h' | '24h'

/**
 * Day/night for hour tiles.
 * Night = local hours 0–5 and 22–23; day = 6–21 (inclusive).
 */
export type DayNight = 'day' | 'night'

export interface HomeDateTimeParts {
  year: number
  month: number
  day: number
  hour?: number
  minute?: number
  second?: number
}

export interface LocalWallTime {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  zone: IanaTimezone
}

export interface TimelineCell {
  hour: number
  minute: number
  year: number
  month: number
  day: number
  period: DayNight
}

export interface TimelineColumn {
  /** Hour column in the home timezone (0–23). */
  homeHour: number
  instant: DateTime
  cells: Record<IanaTimezone, TimelineCell>
}

export interface CompareResult {
  instant: DateTime
  locals: LocalWallTime[]
}

function assertValid(dt: DateTime, context: string): DateTime {
  if (!dt.isValid) {
    throw new Error(`Invalid DateTime (${context}): ${dt.invalidReason} — ${dt.invalidExplanation}`)
  }
  return dt
}

/** Resolve a calendar date + time in the home zone to an absolute instant. */
export function instantFromHomeDateTime(
  parts: HomeDateTimeParts,
  homeZone: IanaTimezone = HOME_TIMEZONE
): DateTime {
  return assertValid(
    DateTime.fromObject(
      {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: parts.hour ?? 0,
        minute: parts.minute ?? 0,
        second: parts.second ?? 0,
        millisecond: 0
      },
      { zone: homeZone }
    ),
    `home ${homeZone}`
  )
}

/** Wall-clock components of `instant` in `zone`. */
export function getLocalWallTime(instant: DateTime, zone: IanaTimezone): LocalWallTime {
  const local = assertValid(instant.setZone(zone), zone)
  return {
    year: local.year,
    month: local.month,
    day: local.day,
    hour: local.hour,
    minute: local.minute,
    second: local.second,
    zone
  }
}

/**
 * Numeric offset of `zone` relative to home at `instant`, in hours
 * (e.g. Miami EDT vs IST ≈ -9.5).
 * Computed as (zoneUtcOffset − homeUtcOffset) / 60.
 */
export function getOffsetHoursRelativeToHome(
  instant: DateTime,
  zone: IanaTimezone,
  homeZone: IanaTimezone = HOME_TIMEZONE
): number {
  const zoneOffsetMin = assertValid(instant.setZone(zone), zone).offset
  const homeOffsetMin = assertValid(instant.setZone(homeZone), homeZone).offset
  return (zoneOffsetMin - homeOffsetMin) / 60
}

/** Map a selected home hour to simultaneous local times in each zone. */
export function compareHomeHourAcrossZones(
  parts: HomeDateTimeParts,
  zones: readonly IanaTimezone[],
  homeZone: IanaTimezone = HOME_TIMEZONE
): CompareResult {
  const instant = instantFromHomeDateTime(parts, homeZone)
  return {
    instant,
    locals: zones.map((zone) => getLocalWallTime(instant, zone))
  }
}

/** 24 columns (home hours 0–23) for a calendar date in home TZ. */
export function buildDayTimeline(
  date: Pick<HomeDateTimeParts, 'year' | 'month' | 'day'>,
  zones: readonly IanaTimezone[],
  homeZone: IanaTimezone = HOME_TIMEZONE
): TimelineColumn[] {
  const columns: TimelineColumn[] = []

  for (let homeHour = 0; homeHour < 24; homeHour++) {
    const instant = instantFromHomeDateTime({ ...date, hour: homeHour, minute: 0 }, homeZone)
    const cells: Record<IanaTimezone, TimelineCell> = {}

    for (const zone of zones) {
      const local = getLocalWallTime(instant, zone)
      cells[zone] = {
        hour: local.hour,
        minute: local.minute,
        year: local.year,
        month: local.month,
        day: local.day,
        period: classifyDayNight(local.hour)
      }
    }

    columns.push({ homeHour, instant, cells })
  }

  return columns
}

export function classifyDayNight(hour: number): DayNight {
  if (hour < 0 || hour > 23 || !Number.isInteger(hour)) {
    throw new Error(`hour must be an integer 0–23, got ${hour}`)
  }
  if (hour <= 5 || hour >= 22) {
    return 'night'
  }
  return 'day'
}

export function formatTime(hour: number, minute: number, mode: TimeFormat): string {
  if (hour < 0 || hour > 23 || !Number.isInteger(hour)) {
    throw new Error(`hour must be an integer 0–23, got ${hour}`)
  }
  if (minute < 0 || minute > 59 || !Number.isInteger(minute)) {
    throw new Error(`minute must be an integer 0–59, got ${minute}`)
  }

  const mm = String(minute).padStart(2, '0')

  if (mode === '24h') {
    return `${String(hour).padStart(2, '0')}:${mm}`
  }

  const period = hour < 12 ? 'AM' : 'PM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${mm} ${period}`
}
