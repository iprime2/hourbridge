import { describe, expect, it } from 'vitest'
import {
  isWidgetView,
  loadPersistedState,
  loadResolvedState,
  normalizeWorkHours,
  parsePersistedState,
  PERSIST_VERSION,
  sanitizeLocations,
  savePersistedState,
  subscribePersist,
  HB_STORAGE_KEY
} from '@core/persistence'
import { DEFAULT_LOCATIONS } from '@core/timezones'

describe('persistence', () => {
  it('parses valid persisted state', () => {
    const raw = JSON.stringify({
      locations: DEFAULT_LOCATIONS,
      timeFormat: '24h'
    })
    const parsed = parsePersistedState(raw)
    expect(parsed?.timeFormat).toBe('24h')
    expect(parsed?.locations).toHaveLength(DEFAULT_LOCATIONS.length)
  })

  it('rejects invalid payloads', () => {
    expect(parsePersistedState(null)).toBeNull()
    expect(parsePersistedState('{')).toBeNull()
    expect(parsePersistedState('not-json')).toBeNull()
    expect(parsePersistedState(JSON.stringify({ locations: [], timeFormat: '12h' }))).toBeNull()
    expect(
      parsePersistedState(JSON.stringify({ locations: DEFAULT_LOCATIONS, timeFormat: '9h' }))
    ).toBeNull()
    expect(
      parsePersistedState(
        JSON.stringify({ locations: [{ id: 1, label: 'x', iana: 'UTC' }], timeFormat: '12h' })
      )
    ).toBeNull()
    expect(
      parsePersistedState(JSON.stringify({ timeFormat: '12h' }))
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
    savePersistedState(
      { locations: [...DEFAULT_LOCATIONS], timeFormat: '12h' },
      storage
    )
    expect(store.get(HB_STORAGE_KEY)).toContain('IST')
    expect(loadPersistedState(storage)?.timeFormat).toBe('12h')
  })

  it('returns null for corrupt JSON in storage', () => {
    const storage = {
      getItem: () => '{corrupt',
      setItem: () => undefined
    }
    expect(loadPersistedState(storage)).toBeNull()
  })
})

describe('persistence v2', () => {
  const v1 = { locations: DEFAULT_LOCATIONS, timeFormat: '12h' }

  it('migrates v1 payloads by filling defaults', () => {
    const parsed = parsePersistedState(JSON.stringify(v1))
    expect(parsed?.version).toBe(PERSIST_VERSION)
    expect(parsed?.theme).toBe('system')
    expect(parsed?.workHours).toEqual({ start: 9, end: 17 })
  })

  it('keeps valid current-version settings and replaces garbled ones', () => {
    const ok = parsePersistedState(
      JSON.stringify({ ...v1, version: 3, theme: 'dark', workHours: { start: 8, end: 20 } })
    )
    expect(ok?.theme).toBe('dark')
    expect(ok?.workHours).toEqual({ start: 8, end: 20 })

    // Inclusive 0–23 hours: end may equal start, but 24, reversed or negative values are rejected.
    expect(
      parsePersistedState(JSON.stringify({ ...v1, version: 3, workHours: { start: 10, end: 10 } }))
        ?.workHours
    ).toEqual({ start: 10, end: 10 })

    for (const workHours of [
      { start: 18, end: 9 },
      { start: -1, end: 5 },
      { start: 9, end: 24 },
      { start: 9.5, end: 12 },
      'x',
      null
    ]) {
      const bad = parsePersistedState(
        JSON.stringify({ ...v1, version: 3, theme: 'neon', workHours })
      )
      expect(bad?.theme).toBe('system')
      expect(bad?.workHours).toEqual({ start: 9, end: 17 })
    }
  })

  describe('migrating working hours from the half-open v1/v2 shape', () => {
    const migrate = (version: number | undefined, workHours: unknown) =>
      parsePersistedState(
        JSON.stringify({ ...v1, ...(version === undefined ? {} : { version }), workHours })
      )?.workHours

    it('keeps the hours the person picked — a saved 1 PM – 9 PM stays 1 PM – 9 PM', () => {
      // The end hour used to be excluded; it is included now, so the window gains its last tile.
      expect(migrate(2, { start: 13, end: 21 })).toEqual({ start: 13, end: 21 })
      expect(migrate(2, { start: 8, end: 20 })).toEqual({ start: 8, end: 20 })
      expect(migrate(2, { start: 13, end: 14 })).toEqual({ start: 13, end: 14 })
    })

    it('clamps a midnight close to 11 PM, the last tile of the day', () => {
      expect(migrate(2, { start: 0, end: 24 })).toEqual({ start: 0, end: 23 })
    })

    it('moves the never-customised old default (9–18) to the new default (9–17)', () => {
      expect(migrate(2, { start: 9, end: 18 })).toEqual({ start: 9, end: 17 })
      expect(migrate(undefined, { start: 9, end: 18 })).toEqual({ start: 9, end: 17 })
      // Only that exact pair: anything else the user chose is left alone.
      expect(migrate(2, { start: 9, end: 19 })).toEqual({ start: 9, end: 19 })
      expect(migrate(2, { start: 10, end: 18 })).toEqual({ start: 10, end: 18 })
    })

    it('treats an unversioned payload as v1', () => {
      expect(migrate(undefined, { start: 8, end: 20 })).toEqual({ start: 8, end: 20 })
    })

    it('does not touch a payload that is already current', () => {
      expect(migrate(3, { start: 9, end: 18 })).toEqual({ start: 9, end: 18 })
    })

    it('falls back to the default when the old value was already invalid', () => {
      expect(migrate(2, { start: 18, end: 9 })).toEqual({ start: 9, end: 17 })
      expect(migrate(2, { start: 5, end: 5 })).toEqual({ start: 9, end: 17 })
      expect(migrate(2, { start: 5, end: 25 })).toEqual({ start: 9, end: 17 })
      expect(migrate(2, 'nope')).toEqual({ start: 9, end: 17 })
    })

    it('is stable: migrating what we just wrote changes nothing', () => {
      const store = new Map<string, string>()
      const storage = { setItem: (k: string, v: string) => void store.set(k, v) }
      const migrated = migrate(2, { start: 13, end: 21 })!
      savePersistedState(
        { locations: [...DEFAULT_LOCATIONS], timeFormat: '12h', workHours: migrated },
        storage
      )
      expect(JSON.parse(store.get(HB_STORAGE_KEY)!).version).toBe(PERSIST_VERSION)
      expect(parsePersistedState(store.get(HB_STORAGE_KEY)!)?.workHours).toEqual(migrated)
    })
  })

  it('drops locations whose zone the runtime cannot resolve', () => {
    const parsed = parsePersistedState(
      JSON.stringify({
        timeFormat: '12h',
        locations: [
          { id: 'a', label: 'A', iana: 'Asia/Kolkata', isHome: true },
          { id: 'b', label: 'B', iana: 'Mars/Olympus' }
        ]
      })
    )
    expect(parsed?.locations.map((l) => l.id)).toEqual(['a'])
  })

  it('returns null when no location survives sanitizing', () => {
    expect(
      parsePersistedState(
        JSON.stringify({ timeFormat: '12h', locations: [{ id: 'x', label: 'X', iana: 'Nope/Zone' }] })
      )
    ).toBeNull()
  })

  it('guarantees exactly one home and de-duplicates ids', () => {
    const noHome = sanitizeLocations([
      { id: 'lon', label: 'London', iana: 'Europe/London' },
      { id: 'tok', label: 'Tokyo', iana: 'Asia/Tokyo' }
    ])
    expect(noHome?.filter((l) => l.isHome).map((l) => l.id)).toEqual(['lon'])

    const istHome = sanitizeLocations([
      { id: 'lon', label: 'London', iana: 'Europe/London' },
      { id: 'ist', label: 'IST', iana: 'Asia/Kolkata' }
    ])
    expect(istHome?.find((l) => l.isHome)?.id).toBe('ist')

    const two = sanitizeLocations([
      { id: 'a', label: 'A', iana: 'Europe/London', isHome: true },
      { id: 'b', label: 'B', iana: 'Asia/Tokyo', isHome: true },
      { id: 'a', label: 'A again', iana: 'Asia/Tokyo' }
    ])
    expect(two).toHaveLength(2)
    expect(two?.filter((l) => l.isHome).map((l) => l.id)).toEqual(['a'])
  })

  it('writes the current version and notifies subscribers', () => {
    const store = new Map<string, string>()
    const storage = { setItem: (k: string, v: string) => void store.set(k, v) }
    const seen: string[] = []
    const off = subscribePersist((json) => seen.push(json))

    savePersistedState({ locations: [...DEFAULT_LOCATIONS], timeFormat: '24h', theme: 'dark' }, storage)
    off()
    savePersistedState({ locations: [...DEFAULT_LOCATIONS], timeFormat: '24h' }, storage)

    expect(JSON.parse(store.get(HB_STORAGE_KEY)!).version).toBe(PERSIST_VERSION)
    expect(seen).toHaveLength(1)
    expect(JSON.parse(seen[0]).theme).toBe('dark')
  })

  it('survives storage that throws on write or read', () => {
    const seen: string[] = []
    const off = subscribePersist((j) => seen.push(j))
    const throwing = {
      setItem: () => {
        throw new Error('QuotaExceededError')
      }
    }
    expect(() =>
      savePersistedState({ locations: [...DEFAULT_LOCATIONS], timeFormat: '12h' }, throwing)
    ).not.toThrow()
    off()
    expect(seen).toHaveLength(0)

    expect(
      loadPersistedState({
        getItem: () => {
          throw new Error('SecurityError')
        }
      })
    ).toBeNull()
    expect(loadPersistedState(null)).toBeNull()
  })

  it('resolves defaults on first run', () => {
    const resolved = loadResolvedState({ getItem: () => null })
    expect(resolved.locations.map((l) => l.id)).toEqual(DEFAULT_LOCATIONS.map((l) => l.id))
    expect(resolved.theme).toBe('system')
    expect(resolved.workHours).toEqual({ start: 9, end: 17 })
  })
})

describe('persistence v4: working days', () => {
  const base = { locations: DEFAULT_LOCATIONS, timeFormat: '12h' }
  const load = (workHours: unknown, version = 4) =>
    parsePersistedState(JSON.stringify({ ...base, version, workHours }))?.workHours
  const memoryStorage = () => {
    const store = new Map<string, string>()
    return { store, storage: { setItem: (k: string, v: string) => void store.set(k, v) } }
  }

  it('leaves older payloads alone: no days means Monday–Friday', () => {
    expect(load({ start: 8, end: 20 }, 3)).toEqual({ start: 8, end: 20 })
    expect(load({ start: 8, end: 20 }, 2)).toEqual({ start: 8, end: 20 })
    expect(parsePersistedState(JSON.stringify({ ...base, version: 3 }))?.version).toBe(PERSIST_VERSION)
  })

  it('keeps a custom week, sorted and without repeats', () => {
    // Off Thursday and Friday, working Saturday and Sunday.
    expect(load({ start: 9, end: 17, days: [7, 6, 3, 2, 1, 1] })).toEqual({
      start: 9,
      end: 17,
      days: [1, 2, 3, 6, 7]
    })
  })

  it('stores a Monday–Friday week exactly the way it was stored before days existed', () => {
    expect(load({ start: 9, end: 17, days: [1, 2, 3, 4, 5] })).toEqual({ start: 9, end: 17 })
    expect(load({ start: 9, end: 17, days: [5, 4, 3, 2, 1] })).toEqual({ start: 9, end: 17 })
  })

  it.each([[[]], [[0, 1]], [[8]], [[1.5]], [['mon']], ['mon-fri'], [null], [{}], [[1, null]]])(
    'drops garbled days %j but keeps the hours beside them',
    (days) => {
      expect(load({ start: 10, end: 19, days })).toEqual({ start: 10, end: 19 })
    }
  )

  it('round-trips a custom week through save and load', () => {
    const { store, storage } = memoryStorage()
    savePersistedState(
      {
        locations: [...DEFAULT_LOCATIONS],
        timeFormat: '12h',
        workHours: { start: 9, end: 17, days: [6, 7, 1, 2, 3] }
      },
      storage
    )
    const saved = JSON.parse(store.get(HB_STORAGE_KEY)!)
    expect(saved.version).toBe(PERSIST_VERSION)
    expect(saved.workHours).toEqual({ start: 9, end: 17, days: [1, 2, 3, 6, 7] })
    expect(parsePersistedState(store.get(HB_STORAGE_KEY)!)?.workHours).toEqual(saved.workHours)
  })

  it('does not write days for a default week', () => {
    const { store, storage } = memoryStorage()
    savePersistedState(
      { locations: [...DEFAULT_LOCATIONS], timeFormat: '12h', workHours: { start: 9, end: 17, days: [1, 2, 3, 4, 5] } },
      storage
    )
    expect(JSON.parse(store.get(HB_STORAGE_KEY)!).workHours).toEqual({ start: 9, end: 17 })
  })

  it('normalizeWorkHours does not change what it is given', () => {
    const input = { start: 9, end: 17, days: [7, 1] }
    expect(normalizeWorkHours(input)).toEqual({ start: 9, end: 17, days: [1, 7] })
    expect(input.days).toEqual([7, 1])
  })
})

describe('persistence v5: holidays at home', () => {
  const base = { locations: DEFAULT_LOCATIONS, timeFormat: '12h' }
  const load = (workHours: unknown, version = 5) =>
    parsePersistedState(JSON.stringify({ ...base, version, workHours }))?.workHours
  const memoryStorage = () => {
    const store = new Map<string, string>()
    return { store, storage: { setItem: (k: string, v: string) => void store.set(k, v) } }
  }

  it('leaves older payloads alone: no holidaysOff means holidays are days off', () => {
    expect(load({ start: 9, end: 17 }, 4)).toEqual({ start: 9, end: 17 })
    expect(load({ start: 9, end: 17, days: [6, 7] }, 4)).toEqual({ start: 9, end: 17, days: [6, 7] })
  })

  it('keeps "I work through holidays" next to a custom week', () => {
    expect(load({ start: 9, end: 17, holidaysOff: false })).toEqual({ start: 9, end: 17, holidaysOff: false })
    expect(load({ start: 9, end: 17, days: [7, 1], holidaysOff: false })).toEqual({
      start: 9,
      end: 17,
      days: [1, 7],
      holidaysOff: false
    })
  })

  it('stores the default (holidays are days off) exactly as it was stored before the setting existed', () => {
    expect(load({ start: 9, end: 17, holidaysOff: true })).toEqual({ start: 9, end: 17 })
  })

  it.each([[0], ['no'], [null], [{}], [[]]])('reads a garbled holidaysOff %j as the default', (holidaysOff) => {
    expect(load({ start: 10, end: 19, holidaysOff })).toEqual({ start: 10, end: 19 })
  })

  it('round-trips through save and load, and only writes it when it is false', () => {
    const { store, storage } = memoryStorage()
    const save = (holidaysOff: boolean) => {
      savePersistedState(
        { locations: [...DEFAULT_LOCATIONS], timeFormat: '12h', workHours: { start: 9, end: 17, holidaysOff } },
        storage
      )
      return JSON.parse(store.get(HB_STORAGE_KEY)!).workHours
    }
    expect(save(true)).toEqual({ start: 9, end: 17 })
    expect(save(false)).toEqual({ start: 9, end: 17, holidaysOff: false })
    expect(parsePersistedState(store.get(HB_STORAGE_KEY)!)?.workHours).toEqual({
      start: 9,
      end: 17,
      holidaysOff: false
    })
  })
})
