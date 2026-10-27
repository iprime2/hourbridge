import { DateTime } from 'luxon'
import {
  DEFAULT_WORK_DAYS,
  DEFAULT_WORK_HOURS,
  type TimeFormat,
  type WorkHours
} from '@core/timeEngine'
import { sameDays, sanitizeWorkDays } from '@core/workDays'
import { DEFAULT_LOCATIONS, HOME_TIMEZONE, type Location } from '@core/timezones'
import { cleanPersonFields } from '@core/people'

export const HB_STORAGE_KEY = 'hb:state'

/**
 * Bump when the persisted shape changes; add a step in `parsePersistedState`.
 * v4: working hours may carry `days` (ISO weekdays you work). Older payloads have none, which
 * means Monday–Friday, so v3 and earlier need no data change.
 * v5: working hours may carry `holidaysOff: false` (you work through public holidays at home).
 * Older payloads have none, which means holidays are days off, so v4 and earlier need no data change.
 * v6: a city may carry `person` (a name) and `hours` (that person's own working hours, local), and
 * there may be several saved boards (`boards`, `activeBoard`). All optional: absent means no name,
 * no own hours and one board, so v5 and earlier need no data change.
 * v7: a city may carry `daysOff` (its own days off, on its own dates). Absent means none, so v6
 * and earlier need no data change.
 */
export const PERSIST_VERSION = 7

export type ThemePreference = 'system' | 'light' | 'dark'

export interface PersistedState {
  /** Absent on v1 payloads written before settings existed. */
  version?: number
  locations: Location[]
  timeFormat: TimeFormat
  theme?: ThemePreference
  workHours?: WorkHours
  /**
   * Every saved board, in order. The active board's cities are `locations` (so older readers see
   * the board on screen); its entry here has no `locations`. Absent when there is only the one
   * default board.
   */
  boards?: StoredBoard[]
  /** Id of the board on screen. Stored only with `boards`. */
  activeBoard?: string
}

/** A named list of cities you can switch to (a team, a client, family). */
export interface Board {
  id: string
  name: string
  locations: Location[]
}

/** A board as stored: the active one leaves its cities to `PersistedState.locations`. */
export interface StoredBoard {
  id: string
  name: string
  locations?: Location[]
}

export const DEFAULT_BOARD_ID = 'main'
export const DEFAULT_BOARD_NAME = 'My cities'
export const MAX_BOARDS = 20
export const MAX_BOARD_NAME_LENGTH = 40
/** The most cities a board keeps when read back (the board on screen is not limited). */
export const MAX_BOARD_CITIES = 100

/** State with every optional setting filled in; `boards` always holds every board with its cities. */
export type ResolvedState = Required<Omit<PersistedState, 'boards' | 'activeBoard'>> & {
  boards: Board[]
  activeBoard: string
}

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
 * Monday–Friday and `holidaysOff` only when it is `false`, so a default week looks exactly like it
 * did before either existed. A garbled value is dropped (back to the default) without discarding
 * the hours beside it.
 */
export function normalizeWorkHours(hours: WorkHours): WorkHours {
  const days = sanitizeWorkDays(hours.days)
  return {
    start: hours.start,
    end: hours.end,
    ...(days && !sameDays(days, DEFAULT_WORK_DAYS) ? { days } : {}),
    ...(hours.holidaysOff === false ? { holidaysOff: false } : {})
  }
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
    const copy = cleanPersonFields(l)
    if (l.id === homeId) copy.isHome = true
    else delete copy.isHome
    return copy
  })
}

/** A board name as stored: one line, trimmed, at most 40 characters; empty when nothing is left. */
export function cleanBoardName(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_BOARD_NAME_LENGTH)
}

function isBoardId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_BOARD_NAME_LENGTH
}

/**
 * Read the saved boards. A board whose cities do not parse is dropped on its own; the active
 * board always exists (with `locations`), even when `boards` is missing or garbled.
 */
function parseBoards(raw: unknown, activeRaw: unknown, locations: Location[]): { boards: Board[]; activeBoard: string } {
  const activeId = isBoardId(activeRaw) ? activeRaw : DEFAULT_BOARD_ID
  const boards: Board[] = []
  const seen = new Set<string>()
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (boards.length >= MAX_BOARDS) break
    if (!entry || typeof entry !== 'object') continue
    const b = entry as Record<string, unknown>
    if (!isBoardId(b.id) || seen.has(b.id)) continue
    const name = cleanBoardName(b.name) || `Board ${boards.length + 1}`
    if (b.id === activeId) {
      boards.push({ id: b.id, name, locations })
    } else {
      if (!Array.isArray(b.locations) || b.locations.length > MAX_BOARD_CITIES || !b.locations.every(isLocation)) continue
      const kept = sanitizeLocations(b.locations)
      if (!kept) continue
      boards.push({ id: b.id, name, locations: kept })
    }
    seen.add(b.id)
  }
  if (!seen.has(activeId)) {
    if (boards.length >= MAX_BOARDS) boards.pop()
    boards.unshift({ id: activeId, name: DEFAULT_BOARD_NAME, locations })
  }
  return { boards, activeBoard: activeId }
}

/**
 * The `boards` / `activeBoard` fields to store for these boards: none at all for the single
 * default board, so a one-board setup is stored exactly as before boards existed.
 */
export function boardsForStorage(boards: readonly Board[], activeBoard: string): Pick<PersistedState, 'boards' | 'activeBoard'> {
  const only = boards.length === 1 ? boards[0] : null
  if (only && only.id === DEFAULT_BOARD_ID && only.name === DEFAULT_BOARD_NAME) return {}
  return {
    boards: boards.map((b) => (b.id === activeBoard ? { id: b.id, name: b.name } : { id: b.id, name: b.name, locations: b.locations })),
    activeBoard
  }
}

/** Parse persisted state; returns null when missing or invalid. */
export function parsePersistedState(raw: string | null): PersistedState | null {
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
    const { boards, activeBoard } = parseBoards(record.boards, record.activeBoard, locations)
    return {
      version: PERSIST_VERSION,
      locations,
      timeFormat: record.timeFormat,
      // v1 payloads have neither field; unknown/garbled values fall back to defaults.
      theme: isTheme(record.theme) ? record.theme : 'system',
      workHours: isWorkHours(migrated) ? normalizeWorkHours(migrated) : { ...DEFAULT_WORK_HOURS },
      ...boardsForStorage(boards, activeBoard)
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

export function loadPersistedState(
  storage: Pick<Storage, 'getItem'> | null = safeStorage()
): PersistedState | null {
  if (!storage) return null
  try {
    return parsePersistedState(storage.getItem(HB_STORAGE_KEY))
  } catch {
    return null
  }
}

/** The stored state with defaults applied, or the built-in defaults on first run. */
export function loadResolvedState(
  storage?: Pick<Storage, 'getItem'> | null
): ResolvedState {
  return resolveState(loadPersistedState(storage))
}

/** Fill in every default, and expand the boards so each one carries its cities. */
export function resolveState(stored: PersistedState | null): ResolvedState {
  const locations = stored?.locations ?? DEFAULT_LOCATIONS.map((l) => ({ ...l }))
  const { boards, activeBoard } = stored
    ? parseBoards(stored.boards, stored.activeBoard, locations)
    : { boards: [{ id: DEFAULT_BOARD_ID, name: DEFAULT_BOARD_NAME, locations }], activeBoard: DEFAULT_BOARD_ID }
  return {
    version: PERSIST_VERSION,
    locations,
    timeFormat: stored?.timeFormat ?? '12h',
    theme: stored?.theme ?? 'system',
    workHours: stored?.workHours ?? { ...DEFAULT_WORK_HOURS },
    boards,
    activeBoard
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

export function savePersistedState(
  state: PersistedState,
  storage: Pick<Storage, 'setItem'> | null = safeStorage()
): void {
  const json = JSON.stringify({
    ...state,
    ...(state.workHours ? { workHours: normalizeWorkHours(state.workHours) } : {}),
    version: PERSIST_VERSION
  })
  try {
    storage?.setItem(HB_STORAGE_KEY, json)
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
