import { describe, expect, it } from 'vitest'
import {
  isWidgetView,
  loadPersistedBuddyState,
  parsePersistedBuddyState,
  savePersistedBuddyState,
  WTB_STORAGE_KEY
} from '@renderer/lib/persistence'
import { DEFAULT_LOCATIONS } from '@renderer/lib/timezones'

describe('persistence', () => {
  it('parses valid persisted buddy state', () => {
    const raw = JSON.stringify({
      locations: DEFAULT_LOCATIONS,
      timeFormat: '24h'
    })
    const parsed = parsePersistedBuddyState(raw)
    expect(parsed?.timeFormat).toBe('24h')
    expect(parsed?.locations).toHaveLength(DEFAULT_LOCATIONS.length)
  })

  it('rejects invalid payloads', () => {
    expect(parsePersistedBuddyState(null)).toBeNull()
    expect(parsePersistedBuddyState('{')).toBeNull()
    expect(parsePersistedBuddyState('not-json')).toBeNull()
    expect(parsePersistedBuddyState(JSON.stringify({ locations: [], timeFormat: '12h' }))).toBeNull()
    expect(
      parsePersistedBuddyState(JSON.stringify({ locations: DEFAULT_LOCATIONS, timeFormat: '9h' }))
    ).toBeNull()
    expect(
      parsePersistedBuddyState(
        JSON.stringify({ locations: [{ id: 1, label: 'x', iana: 'UTC' }], timeFormat: '12h' })
      )
    ).toBeNull()
    expect(
      parsePersistedBuddyState(JSON.stringify({ timeFormat: '12h' }))
    ).toBeNull()
  })

  it('detects widget view from hash or query', () => {
    expect(isWidgetView('', '#widget')).toBe(true)
    expect(isWidgetView('', '#/widget')).toBe(true)
    expect(isWidgetView('?view=widget', '')).toBe(true)
    expect(isWidgetView('view=widget', '')).toBe(true)
    expect(isWidgetView('', '#main')).toBe(false)
    expect(isWidgetView('?view=main', '#other')).toBe(false)
    expect(isWidgetView('', '#widget/extra')).toBe(false)
  })

  it('round-trips through storage', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      }
    }
    savePersistedBuddyState(
      { locations: [...DEFAULT_LOCATIONS], timeFormat: '12h' },
      storage
    )
    expect(store.get(WTB_STORAGE_KEY)).toContain('IST')
    expect(loadPersistedBuddyState(storage)?.timeFormat).toBe('12h')
  })

  it('returns null for corrupt JSON in storage', () => {
    const storage = {
      getItem: () => '{corrupt',
      setItem: () => undefined
    }
    expect(loadPersistedBuddyState(storage)).toBeNull()
  })
})
