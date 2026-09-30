import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import {
  formatClock,
  msUntilNextMinute,
  trayMenuLines,
  trayTitle,
  type TrayState
} from './trayModel'
import { isSafeExternalUrl, isTrustedSender, parsePublishedState } from './ipcValidation'
import { DEFAULT_PREFS, isOnScreen, sanitizePrefs } from './prefsModel'

// Mon 2024-01-15 15:00 IST = 09:30 UTC.
const now = DateTime.fromISO('2024-01-15T15:00:00', { zone: 'Asia/Kolkata' })

const state: TrayState = {
  timeFormat: '12h',
  theme: 'system',
  locations: [
    { id: 'london', label: 'London', iana: 'Europe/London' },
    { id: 'ist', label: 'IST', iana: 'Asia/Kolkata', isHome: true },
    { id: 'auckland', label: 'Auckland', iana: 'Pacific/Auckland' }
  ]
}

describe('tray model', () => {
  it('formats clocks without depending on the system locale', () => {
    expect(formatClock(now, 'Asia/Kolkata', '12h')).toBe('3:00 PM')
    expect(formatClock(now, 'Asia/Kolkata', '24h')).toBe('15:00')
    expect(formatClock(now, 'Europe/London', '12h')).toBe('9:30 AM')
    const midnight = DateTime.fromISO('2024-01-15T00:05:00Z')
    expect(formatClock(midnight, 'UTC', '12h')).toBe('12:05 AM')
    expect(formatClock(midnight.plus({ hours: 12 }), 'UTC', '12h')).toBe('12:05 PM')
  })

  it('shows the home city and time in the menu bar', () => {
    expect(trayTitle(state, now)).toBe('IST 3:00 PM')
    expect(trayTitle({ ...state, timeFormat: '24h' }, now)).toBe('IST 15:00')
  })

  it('falls back to the first location when none is flagged home', () => {
    const noHome = { ...state, locations: state.locations.map((l) => ({ ...l, isHome: false })) }
    expect(trayTitle(noHome, now)).toBe('London 9:30 AM')
  })

  it('truncates long labels and is empty before state arrives', () => {
    const long = {
      ...state,
      locations: [{ id: 'x', label: 'A very long custom label', iana: 'UTC', isHome: true }]
    }
    // 12 characters max: 11 of the label plus the ellipsis.
    expect(trayTitle(long, now)).toBe('A very long… 9:30 AM')
    expect(trayTitle(null, now)).toBe('')
    expect(trayMenuLines(null, now)).toEqual([])
  })

  it('lists every location and tags a different weekday', () => {
    // 15:00 Mon IST is 04:00 Tue in Auckland (NZDT).
    expect(trayMenuLines(state, now)).toEqual([
      'London  —  9:30 AM',
      'IST  —  3:00 PM',
      'Auckland  —  10:30 PM'
    ])
    const later = now.plus({ hours: 4 }) // 19:00 IST = Tue 02:30 Auckland
    expect(trayMenuLines(state, later)[2]).toBe('Auckland  —  2:30 AM (Tue)')
  })

  it('waits for the next minute boundary', () => {
    expect(msUntilNextMinute(0)).toBe(60_005)
    expect(msUntilNextMinute(30_000)).toBe(30_005)
  })
})

describe('parsePublishedState', () => {
  const valid = {
    timeFormat: '24h',
    theme: 'dark',
    locations: [{ id: 'ist', label: 'IST', iana: 'Asia/Kolkata', isHome: true }]
  }

  it('accepts a well-formed payload', () => {
    expect(parsePublishedState(valid)).toEqual(valid)
  })

  it('drops unknown fields instead of passing them through', () => {
    const parsed = parsePublishedState({
      ...valid,
      evil: 'x',
      locations: [{ ...valid.locations[0], extra: { a: 1 } }]
    })
    expect(parsed).toEqual(valid)
  })

  it.each([
    ['null', null],
    ['array', []],
    ['string', 'x'],
    ['no locations', { ...valid, locations: [] }],
    ['bad format', { ...valid, timeFormat: '9h' }],
    ['bad theme', { ...valid, theme: 'neon' }],
    ['non-string label', { ...valid, locations: [{ id: 'a', label: 5, iana: 'UTC' }] }],
    ['unknown zone', { ...valid, locations: [{ id: 'a', label: 'A', iana: 'Mars/Base' }] }],
    ['bad isHome', { ...valid, locations: [{ id: 'a', label: 'A', iana: 'UTC', isHome: 'yes' }] }],
    ['oversized label', { ...valid, locations: [{ id: 'a', label: 'x'.repeat(500), iana: 'UTC' }] }]
  ])('rejects %s', (_name, input) => {
    expect(parsePublishedState(input)).toBeNull()
  })

  it('rejects an oversized list', () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ id: `l${i}`, label: 'L', iana: 'UTC' }))
    expect(parsePublishedState({ ...valid, locations: many })).toBeNull()
  })
})

describe('sender and URL trust', () => {
  it('trusts only the packaged renderer or the dev server origin', () => {
    expect(isTrustedSender('file:///opt/app/out/renderer/index.html')).toBe(true)
    expect(isTrustedSender('file:///opt/app/out/renderer/index.html#widget')).toBe(true)
    expect(isTrustedSender('http://localhost:5173/#widget', 'http://localhost:5173')).toBe(true)

    expect(isTrustedSender('http://localhost:5173/', undefined)).toBe(false)
    expect(isTrustedSender('http://localhost:9999/', 'http://localhost:5173')).toBe(false)
    expect(isTrustedSender('https://evil.example/renderer/index.html')).toBe(false)
    expect(isTrustedSender('file:///etc/passwd')).toBe(false)
    expect(isTrustedSender('not a url')).toBe(false)
    expect(isTrustedSender(undefined)).toBe(false)
  })

  it('opens only https links externally', () => {
    expect(isSafeExternalUrl('https://example.com/a')).toBe(true)
    expect(isSafeExternalUrl('http://example.com')).toBe(false)
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('smb://host/share')).toBe(false)
    expect(isSafeExternalUrl('nope')).toBe(false)
  })
})

describe('prefs', () => {
  it('falls back to defaults for junk', () => {
    expect(sanitizePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(sanitizePrefs('x')).toEqual(DEFAULT_PREFS)
    expect(sanitizePrefs({ trayEnabled: 'yes' })).toEqual(DEFAULT_PREFS)
  })

  it('keeps valid values and rounds bounds', () => {
    const prefs = sanitizePrefs({
      trayEnabled: false,
      mainBounds: { x: 10.4, y: 20.6, width: 1100, height: 700 }
    })
    expect(prefs).toEqual({
      trayEnabled: false,
      mainBounds: { x: 10, y: 21, width: 1100, height: 700 }
    })
  })

  it('discards absurd or non-numeric bounds', () => {
    for (const bounds of [
      { x: 0, y: 0, width: 5, height: 5 },
      { x: 0, y: 0, width: 1e9, height: 700 },
      { x: NaN, y: 0, width: 800, height: 600 },
      { x: '0', y: 0, width: 800, height: 600 },
      'big'
    ]) {
      expect(sanitizePrefs({ mainBounds: bounds }).mainBounds).toBeUndefined()
    }
  })

  it('detects windows stranded off every display', () => {
    const displays = [{ x: 0, y: 0, width: 1920, height: 1080 }]
    expect(isOnScreen({ x: 100, y: 100, width: 800, height: 600 }, displays)).toBe(true)
    expect(isOnScreen({ x: 1850, y: 100, width: 800, height: 600 }, displays)).toBe(false)
    expect(isOnScreen({ x: 3000, y: 0, width: 800, height: 600 }, displays)).toBe(false)
    expect(isOnScreen({ x: -700, y: 100, width: 800, height: 600 }, displays)).toBe(true)
    const two = [...displays, { x: 1920, y: 0, width: 1920, height: 1080 }]
    expect(isOnScreen({ x: 3000, y: 0, width: 800, height: 600 }, two)).toBe(true)
  })
})
