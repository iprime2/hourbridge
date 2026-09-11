import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import {
  isWidgetView,
  parsePersistedBuddyState,
  savePersistedBuddyState,
  WTB_STORAGE_KEY
} from '@renderer/lib/persistence'
import { DEFAULT_LOCATIONS } from '@renderer/lib/timezones'
import { buildWidgetRows } from '@renderer/lib/widgetRows'

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
    expect(parsePersistedBuddyState(JSON.stringify({ locations: [], timeFormat: '12h' }))).toBeNull()
    expect(
      parsePersistedBuddyState(JSON.stringify({ locations: DEFAULT_LOCATIONS, timeFormat: '9h' }))
    ).toBeNull()
  })

  it('detects widget view from hash or query', () => {
    expect(isWidgetView('', '#widget')).toBe(true)
    expect(isWidgetView('', '#/widget')).toBe(true)
    expect(isWidgetView('?view=widget', '')).toBe(true)
    expect(isWidgetView('', '#main')).toBe(false)
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
  })
})

describe('buildWidgetRows', () => {
  it('lists label, live time, and home offset', () => {
    const now = DateTime.fromISO('2024-06-15T12:00:00', { zone: 'Asia/Kolkata' })
    const rows = buildWidgetRows(DEFAULT_LOCATIONS, '12h', now)
    expect(rows).toHaveLength(DEFAULT_LOCATIONS.length)

    const ist = rows.find((r) => r.id === 'ist')
    expect(ist?.isHome).toBe(true)
    expect(ist?.offset).toBe('home')
    expect(ist?.time).toMatch(/12:00\s*pm/i)

    const tokyo = rows.find((r) => r.id === 'tokyo')
    expect(tokyo?.isHome).toBe(false)
    expect(tokyo?.offset).not.toBe('home')
    expect(tokyo?.time.length).toBeGreaterThan(0)
  })
})
