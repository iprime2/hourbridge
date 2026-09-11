import type { TimeFormat } from '@renderer/lib/timeEngine'
import type { Location } from '@renderer/lib/timezones'

export const WTB_STORAGE_KEY = 'wtb:state'

export interface PersistedBuddyState {
  locations: Location[]
  timeFormat: TimeFormat
}

function isTimeFormat(value: unknown): value is TimeFormat {
  return value === '12h' || value === '24h'
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

/** Parse persisted buddy state; returns null when missing or invalid. */
export function parsePersistedBuddyState(raw: string | null): PersistedBuddyState | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as unknown
    if (!data || typeof data !== 'object') return null
    const record = data as Record<string, unknown>
    if (!Array.isArray(record.locations) || !record.locations.every(isLocation)) return null
    if (!isTimeFormat(record.timeFormat)) return null
    if (record.locations.length === 0) return null
    return {
      locations: record.locations.map((l) => ({ ...l })),
      timeFormat: record.timeFormat
    }
  } catch {
    return null
  }
}

export function loadPersistedBuddyState(
  storage: Pick<Storage, 'getItem'> = localStorage
): PersistedBuddyState | null {
  return parsePersistedBuddyState(storage.getItem(WTB_STORAGE_KEY))
}

export function savePersistedBuddyState(
  state: PersistedBuddyState,
  storage: Pick<Storage, 'setItem'> = localStorage
): void {
  storage.setItem(WTB_STORAGE_KEY, JSON.stringify(state))
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
