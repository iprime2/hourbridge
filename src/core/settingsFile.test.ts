import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import { PERSIST_VERSION } from '@core/persistence'
import {
  buildSettingsFile,
  MAX_IMPORTED_CITIES,
  MAX_SETTINGS_FILE_CHARS,
  parseSettingsFile,
  SETTINGS_FILE_KIND,
  settingsFileName,
  type SettingsSnapshot
} from '@core/settingsFile'
import { DEFAULT_LOCATIONS } from '@core/timezones'

const snapshot: SettingsSnapshot = {
  locations: DEFAULT_LOCATIONS.map((l) => ({ ...l })),
  timeFormat: '24h',
  theme: 'dark',
  workHours: { start: 8, end: 20, days: [1, 2, 3, 6, 7], holidaysOff: false }
}
const now = DateTime.fromISO('2026-10-06T08:15:00Z', { zone: 'utc' })
const read = (text: string) => parseSettingsFile(text)
const withChange = (change: (record: Record<string, unknown>) => void) => {
  const record = JSON.parse(buildSettingsFile(snapshot, now)) as Record<string, unknown>
  change(record)
  return JSON.stringify(record)
}

describe('settings file', () => {
  it('names the file with the day it was made', () => {
    expect(settingsFileName(now)).toBe('hourbridge-settings-2026-10-06.json')
  })

  it('is readable JSON that says what it is, what version and when', () => {
    const text = buildSettingsFile(snapshot, now)
    expect(text.endsWith('\n')).toBe(true)
    const data = JSON.parse(text)
    expect(data).toMatchObject({ kind: SETTINGS_FILE_KIND, version: PERSIST_VERSION, exportedAt: '2026-10-06T08:15:00.000Z' })
    expect(text).toContain('\n  "locations"') // indented, so a person can read and edit it
  })

  it('round-trips everything: cities, home, format, theme, working week and holiday choice', () => {
    const result = read(buildSettingsFile(snapshot, now))
    expect(result).toEqual({ ok: true, state: { version: PERSIST_VERSION, ...snapshot } })
  })

  it('writes the working week in the stored form: defaults are left out', () => {
    const text = buildSettingsFile({ ...snapshot, workHours: { start: 9, end: 17, days: [1, 2, 3, 4, 5], holidaysOff: true } }, now)
    expect(JSON.parse(text).workHours).toEqual({ start: 9, end: 17 })
  })

  it('gives a clear message for a file that is not JSON, not ours, or empty', () => {
    expect(read('not json')).toEqual({ ok: false, error: 'This file is not valid JSON.' })
    expect(read('')).toEqual({ ok: false, error: 'This file is not valid JSON.' })
    expect(read('[]')).toEqual({ ok: false, error: 'This is not a Hourbridge settings file.' })
    expect(read('null')).toEqual({ ok: false, error: 'This is not a Hourbridge settings file.' })
    // Something shaped like the stored state, but not exported by the app, is refused too.
    const stored = JSON.stringify({ version: 5, locations: snapshot.locations, timeFormat: '12h' })
    expect(read(stored)).toEqual({ ok: false, error: 'This is not a Hourbridge settings file.' })
  })

  it('refuses a file from a newer version instead of half-reading it', () => {
    const result = read(withChange((r) => (r.version = PERSIST_VERSION + 1)))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(/newer version/)
  })

  it('refuses a file that is too large, and one with too many cities, before reading it', () => {
    expect(read(' '.repeat(MAX_SETTINGS_FILE_CHARS + 1))).toEqual({
      ok: false,
      error: 'This file is too large to be a Hourbridge settings file.'
    })
    const many = withChange((r) => {
      r.locations = Array.from({ length: MAX_IMPORTED_CITIES + 1 }, (_, i) => ({ id: `c${i}`, label: `City ${i}`, iana: 'Europe/Paris' }))
    })
    const result = read(many)
    expect(!result.ok && result.error).toMatch(/most Hourbridge will import is 100/)
  })

  it('drops cities in zones it does not know, and refuses a file where none are left', () => {
    const mixed = read(
      withChange((r) => {
        r.locations = [
          { id: 'a', label: 'Paris', iana: 'Europe/Paris', isHome: true },
          { id: 'b', label: 'Nowhere', iana: 'Mars/Olympus' }
        ]
      })
    )
    expect(mixed.ok && mixed.state.locations.map((l) => l.label)).toEqual(['Paris'])
    const none = read(withChange((r) => (r.locations = [{ id: 'b', label: 'Nowhere', iana: 'Mars/Olympus' }])))
    expect(none.ok).toBe(false)
  })

  it('refuses a file whose cities are malformed, or with a time format that is neither', () => {
    expect(read(withChange((r) => (r.locations = [{ id: 1 }]))).ok).toBe(false)
    expect(read(withChange((r) => (r.locations = 'Paris'))).ok).toBe(false)
    expect(read(withChange((r) => (r.timeFormat = '36h'))).ok).toBe(false)
  })

  it('falls back to defaults for a garbled theme or working week, without losing the cities', () => {
    const result = read(
      withChange((r) => {
        r.theme = 'neon'
        r.workHours = { start: 20, end: 5 }
      })
    )
    expect(result.ok && result.state.theme).toBe('system')
    expect(result.ok && result.state.workHours).toEqual({ start: 9, end: 17 })
    expect(result.ok && result.state.locations).toHaveLength(snapshot.locations.length)
  })

  it('always leaves exactly one home city', () => {
    const none = read(withChange((r) => (r.locations = snapshot.locations.map(({ isHome: _drop, ...rest }) => rest))))
    expect(none.ok && none.state.locations.filter((l) => l.isHome)).toHaveLength(1)
    const two = read(withChange((r) => (r.locations = snapshot.locations.map((l) => ({ ...l, isHome: true })))))
    expect(two.ok && two.state.locations.filter((l) => l.isHome)).toHaveLength(1)
  })

  it('does not trust the contents: a hostile id or label is carried as plain data, nothing else', () => {
    const hostile = withChange((r) => {
      r.locations = [{ id: '__proto__', label: '<img src=x onerror=alert(1)>', iana: 'Europe/Paris', isHome: true }]
      r.extra = { polluted: true }
    })
    const result = read(hostile)
    expect(result.ok).toBe(true)
    expect(Object.keys(result.ok ? result.state : {}).sort()).toEqual(['locations', 'theme', 'timeFormat', 'version', 'workHours'])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
