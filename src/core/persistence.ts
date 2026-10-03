import { DateTime } from 'luxon'
import {
  DEFAULT_WORK_DAYS,
  DEFAULT_WORK_HOURS,
  type TimeFormat,
  type WorkHours
} from '@core/timeEngine'
import { sameDays, sanitizeWorkDays } from '@core/workDays'
import { DEFAULT_LOCATIONS, HOME_TIMEZONE, type Location } from '@core/timezones'

export const WTB_STORAGE_KEY = 'wtb:state'

/**
 * Bump when the persisted shape changes; add a step in `parsePersistedBuddyState`.
 * v4: working hours may carry `days` (ISO weekdays you work). Older payloads have none, which
 * means Monday–Friday, so v3 and earlier need no data change.
 */
export const PERSIST_VERSION = 4

export type ThemePreference = 'system' | 'light' | 'dark'

export interface PersistedBuddyState {
  /** Absent on v1 payloads written before settings existed. */
  version?: number
  locations: Location[]
  timeFormat: TimeFormat
  theme?: ThemePreference
  workHours?: WorkHours
}

/** State with every optional setting filled in. */
export type ResolvedBuddyState = Required<PersistedBuddyState>

function isTimeFormat(value: unknown): value is TimeFormat {
  return value === '12h' || value === '24h'
}

function isTheme(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

function isLocation(value: unknown): value is Location {
  if (!value || typeof value !== 'object') return false
  const loc = value as Record<string, unknown>
  return (
    typeof loc.id === 'string' &&
    typeof loc.label === 'string' &&
    typeof loc.iana === 'string' &&
    (loc.isHome === undefined || typeof loc.isHome === 'boolean')
  )
}

/** Current shape: whole hours 0–23, both ends inclusive, in the home timezone. */
function isWorkHours(value: unknown): value is WorkHours {
  if (!value || typeof value !== 'object') return false
  const w = value as Record<string, unknown>
  return (
    Number.isInteger(w.start) &&
    Number.isInteger(w.end) &&
    (w.start as number) >= 0 &&
    (w.end as number) <= 23 &&
    (w.start as number) <= (w.end as number)
  )
}

/**
 * The form working hours are stored and loaded in: `days` is kept only when it differs from
 * Monday–Friday, so a default week looks exactly like it did before `days` existed. A garbled
 * `days` is dropped (back to Monday–Friday) without discarding the hours beside it.
 */
export function normalizeWorkHours(hours: WorkHours): WorkHours {
  const base = { start: hours.start, end: hours.end }
  const days = sanitizeWorkDays(hours.days)
  return days && !sameDays(days, DEFAULT_WORK_DAYS) ? { ...base, days } : base
}

/**
 * v1/v2 stored working hours as a half-open local range [start, end) with end up to 24, applied
 * as local hours in every city. Now the window is start…end *inclusive* in the home zone.
 *
 * We keep the hours the person actually picked, so a saved "1 PM – 9 PM" is still 1 PM – 9 PM
 * (and now includes the 9 PM tile, which is what they asked for). The one exception is the
 * never-customised old default (9–18): it adopts the new default rather than gaining a tile.
 */
function migrateWorkHours(raw: unknown, version: number): unknown {
  if (version >= 3 || !raw || typeof raw !== 'object') return raw
  const w = raw as Record<string, unknown>
  if (!Number.isInteger(w.start) || !Number.isInteger(w.end)) return raw
  const start = w.start as number
  const end = w.end as number
  // Invalid under the old rules (e.g. start = end was an empty window): don't let the new,
  // looser rules reinterpret it as a valid one-hour window.
  if (start < 0 || end > 24 || start >= end) return null
  if (start === 9 && end === 18) return { ...DEFAULT_WORK_HOURS }
  return { start, end: Math.min(23, end) }
}

function isKnownZone(iana: string): boolean {
  return DateTime.now().setZone(iana).isValid
}

/**
 * Make a location list safe to render: drops zones the runtime can't resolve,
 * de-duplicates ids, and guarantees exactly one home. Returns null if nothing survives.
 */
export function sanitizeLocations(input: readonly Location[]): Location[] | null {
  const seen = new Set<string>()
  const kept: Location[] = []
  for (const loc of input) {
    if (seen.has(loc.id) || !isKnownZone(loc.iana)) continue
    seen.add(loc.id)
    kept.push({ ...loc })
  }
  if (kept.length === 0) return null

  const homeId =
    kept.find((l) => l.isHome)?.id ??
    kept.find((l) => l.iana === HOME_TIMEZONE)?.id ??
    kept[0].id
  return kept.map((l) => {
    const copy = { ...l }
    if (l.id === homeId) copy.isHome = true
    else delete copy.isHome
    return copy
  })
}

/** Parse persisted buddy state; returns null when missing or invalid. */
export function parsePersistedBuddyState(raw: string | null): PersistedBuddyState | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as unknown
    if (!data || typeof data !== 'object') return null
    const record = data as Record<string, unknown>
    if (!Array.isArray(record.locations) || !record.locations.every(isLocation)) return null
    if (!isTimeFormat(record.timeFormat)) return null
    const locations = sanitizeLocations(record.locations)
    if (!locations) return null
    const version = typeof record.version === 'number' ? record.version : 1
    const migrated = migrateWorkHours(record.workHours, version)
    return {
      version: PERSIST_VERSION,
      locations,
      timeFormat: record.timeFormat,
      // v1 payloads have neither field; unknown/garbled values fall back to defaults.
      theme: isTheme(record.theme) ? record.theme : 'system',
      workHours: isWorkHours(migrated) ? normalizeWorkHours(migrated) : { ...DEFAULT_WORK_HOURS }
    }
  } catch {
    return null
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    // Access itself can throw (blocked site data, some embedded webviews).
    return null
  }
}

export function loadPersistedBuddyState(
  storage: Pick<Storage, 'getItem'> | null = safeStorage()
): PersistedBuddyState | null {
  if (!storage) return null
  try {
    return parsePersistedBuddyState(storage.getItem(WTB_STORAGE_KEY))
  } catch {
    return null
  }
}

/** The stored state with defaults applied, or the built-in defaults on first run. */
export function loadResolvedBuddyState(
  storage?: Pick<Storage, 'getItem'> | null
): ResolvedBuddyState {
  const stored = loadPersistedBuddyState(storage)
  return {
    version: PERSIST_VERSION,
    locations: stored?.locations ?? DEFAULT_LOCATIONS.map((l) => ({ ...l })),
    timeFormat: stored?.timeFormat ?? '12h',
    theme: stored?.theme ?? 'system',
    workHours: stored?.workHours ?? { ...DEFAULT_WORK_HOURS }
  }
}

type PersistListener = (json: string) => void
const persistListeners = new Set<PersistListener>()

/**
 * Observe every successful save with the serialized payload. The iOS app uses this to
 * mirror state into native Preferences, which — unlike WKWebView storage — is never evicted.
 */
export function subscribePersist(listener: PersistListener): () => void {
  persistListeners.add(listener)
  return () => persistListeners.delete(listener)
}

export function savePersistedBuddyState(
  state: PersistedBuddyState,
  storage: Pick<Storage, 'setItem'> | null = safeStorage()
): void {
  const json = JSON.stringify({
    ...state,
    ...(state.workHours ? { workHours: normalizeWorkHours(state.workHours) } : {}),
    version: PERSIST_VERSION
  })
  try {
    storage?.setItem(WTB_STORAGE_KEY, json)
  } catch {
    // Quota exceeded / storage blocked: keep running with in-memory state.
    return
  }
  persistListeners.forEach((listener) => listener(json))
}

export function isWidgetView(
  search: string = typeof window !== 'undefined' ? window.location.search : '',
  hash: string = typeof window !== 'undefined' ? window.location.hash : ''
): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  if (params.get('view') === 'widget') return true
  const normalized = hash.replace(/^#\/?/, '')
  return normalized === 'widget'
}
