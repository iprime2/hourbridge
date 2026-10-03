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
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  weekday: number
  hour: number
  minute: number
  second: number
  zone: IanaTimezone
}

/**
 * How a tile reads for *you*, the person planning:
 *  work  = inside your working hours — the same real-time window in every city, so the green
 *          columns line up down the grid;
 *  awake = outside your hours, but that city is awake;
 *  night = outside your hours and that city is asleep.
 */
export type HourPhase = 'work' | 'awake' | 'night'

/**
 * Your working hours, defined in the HOME timezone as whole hours 0–23 with **both ends
 * inclusive**: `{ start: 13, end: 21 }` is "1 PM to 9 PM" and covers the 1 PM … 9 PM tiles.
 */
export interface WorkHours {
  start: number
  end: number
}

export const DEFAULT_WORK_HOURS: WorkHours = { start: 9, end: 17 }

export interface TimelineCell {
  hour: number
  minute: number
  year: number
  month: number
  day: number
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  weekday: number
  period: DayNight
}

/**
 * What daylight saving does to a wall-clock hour in the home zone:
 *  skipped  = the hour does not exist that day (clocks jump over it);
 *  repeated = the hour happens twice, and the column shows the first.
 */
export type HourTransition = 'skipped' | 'repeated'

export interface TimelineColumn {
  /** Hour column in the home timezone (0–23). */
  homeHour: number
  /**
   * The instant this column stands for. For a `skipped` hour it is the first real moment after
   * the gap, so it duplicates the next column — show the column as empty, never as data.
   */
  instant: DateTime
  /** Set only on the days when daylight saving makes this home hour special. */
  transition?: HourTransition
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

export interface ResolvedWallTime {
  instant: DateTime
  /** Set when the wall time does not exist (`skipped`) or happens twice (`repeated`). */
  transition?: HourTransition
}

const WINDOW_MS = 36 * 60 * 60 * 1000 // wider than any UTC offset, so it brackets a nearby change

/**
 * Resolve a calendar date + wall-clock time in `zone` to an absolute instant, and say when
 * daylight saving made that wall time special.
 *
 * - A wall time inside a spring-forward gap does not exist: it moves forward past the gap.
 * - A wall time that repeats on fall-back resolves to the *first* occurrence.
 *
 * luxon alone gets the second rule wrong in a useful-to-know way: it picks between the two
 * copies using the zone's offset *today*, so the answer would change with the season the app
 * is opened in. Here both candidate offsets are tried explicitly, so it never does.
 */
export function resolveWallTime(parts: HomeDateTimeParts, zone: IanaTimezone): ResolvedWallTime {
  const wall = {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
    millisecond: 0
  }
  // Also what validates the date and the zone, with the error callers already rely on.
  assertValid(DateTime.fromObject(wall, { zone }), `home ${zone}`)

  const wallAsUtc = DateTime.fromObject(wall, { zone: 'utc' }).toMillis()
  const offsetAt = (ms: number): number => DateTime.fromMillis(ms, { zone }).offset
  const before = offsetAt(wallAsUtc - WINDOW_MS)
  const after = offsetAt(wallAsUtc + WINDOW_MS)

  const matches = [...new Set([before, after])]
    .map((offsetMinutes) => wallAsUtc - offsetMinutes * 60_000)
    .filter((ms) => {
      const local = DateTime.fromMillis(ms, { zone })
      return (
        local.year === wall.year &&
        local.month === wall.month &&
        local.day === wall.day &&
        local.hour === wall.hour &&
        local.minute === wall.minute &&
        local.second === wall.second
      )
    })

  const at = (ms: number): DateTime => DateTime.fromMillis(ms, { zone })
  if (matches.length === 0) {
    // In a gap: apply the offset from before the change, which lands just past it.
    return { instant: at(wallAsUtc - before * 60_000), transition: 'skipped' }
  }
  if (matches.length === 2) return { instant: at(Math.min(...matches)), transition: 'repeated' }
  return { instant: at(matches[0]) }
}

/** Resolve a calendar date + time in the home zone to an absolute instant. */
export function instantFromHomeDateTime(
  parts: HomeDateTimeParts,
  homeZone: IanaTimezone = HOME_TIMEZONE
): DateTime {
  return resolveWallTime(parts, homeZone).instant
}

/** Wall-clock components of `instant` in `zone`. */
export function getLocalWallTime(instant: DateTime, zone: IanaTimezone): LocalWallTime {
  const local = assertValid(instant.setZone(zone), zone)
  return {
    year: local.year,
    month: local.month,
    day: local.day,
    weekday: local.weekday,
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

/**
 * 24 columns (home hours 0–23) for a calendar date in home TZ.
 *
 * Always 24, indexed by home hour: the grids, the selection and the planner all rely on that. On
 * a day when the home zone changes its clocks, the affected column says so in `transition`
 * instead of silently repeating another column's data.
 */
export function buildDayTimeline(
  date: Pick<HomeDateTimeParts, 'year' | 'month' | 'day'>,
  zones: readonly IanaTimezone[],
  homeZone: IanaTimezone = HOME_TIMEZONE
): TimelineColumn[] {
  const columns: TimelineColumn[] = []

  for (let homeHour = 0; homeHour < 24; homeHour++) {
    const { instant, transition } = resolveWallTime({ ...date, hour: homeHour, minute: 0 }, homeZone)
    const cells: Record<IanaTimezone, TimelineCell> = {}

    for (const zone of zones) {
      const local = getLocalWallTime(instant, zone)
      cells[zone] = {
        hour: local.hour,
        minute: local.minute,
        year: local.year,
        month: local.month,
        day: local.day,
        weekday: local.weekday,
        period: classifyDayNight(local.hour)
      }
    }

    columns.push(transition ? { homeHour, instant, transition, cells } : { homeHour, instant, cells })
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

/** Is a real instant inside your working hours? Weekdays only, judged in the home zone. */
export function isWorkInstant(
  instant: DateTime,
  homeZone: IanaTimezone,
  work: WorkHours = DEFAULT_WORK_HOURS
): boolean {
  const home = instant.setZone(homeZone)
  return home.weekday >= 1 && home.weekday <= 5 && home.hour >= work.start && home.hour <= work.end
}

/** Is this home-hour column inside your working hours? (`instant` is already in the home zone.) */
export function isWorkColumn(
  column: Pick<TimelineColumn, 'homeHour' | 'instant'>,
  work: WorkHours = DEFAULT_WORK_HOURS
): boolean {
  const weekday = column.instant.weekday
  return weekday >= 1 && weekday <= 5 && column.homeHour >= work.start && column.homeHour <= work.end
}

export interface TileState {
  phase: HourPhase
  /** It is night in that city at this instant — kept even when your working hours colour the tile. */
  asleep: boolean
}

/**
 * State of one tile: whether the column is inside your working hours, and whether that city is
 * asleep. Both are reported so a green tile at 3 AM in Miami can still be flagged as night there.
 */
export function classifyTile(
  column: Pick<TimelineColumn, 'homeHour' | 'instant'>,
  cell: Pick<TimelineCell, 'hour'>,
  work: WorkHours = DEFAULT_WORK_HOURS
): TileState {
  const asleep = classifyDayNight(cell.hour) === 'night'
  if (isWorkColumn(column, work)) return { phase: 'work', asleep }
  return { phase: asleep ? 'night' : 'awake', asleep }
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
