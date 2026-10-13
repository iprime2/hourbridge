import { describe, expect, it } from 'vitest'
import {
  buildShareUrl,
  encodeShare,
  isShareableProtocol,
  MAX_SHARED_CITIES,
  mergeShared,
  parseShareHash,
  replaceWithShared,
  type SharedLocation
} from '@core/shareLink'
import { DEFAULT_LOCATIONS, type Location } from '@core/timezones'

const toBase64Url = (value: unknown) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
const hashOf = (value: unknown) => `#share=${toBase64Url(value)}`
const cities = (hash: string) => {
  const link = parseShareHash(hash)
  return link.status === 'ready' ? link.cities : null
}

describe('building and reading a share link', () => {
  it('round-trips the default cities with the home city marked', () => {
    const url = buildShareUrl('https://example.com/app/', DEFAULT_LOCATIONS)
    expect(url.startsWith('https://example.com/app/#share=')).toBe(true)
    expect(cities(url.slice(url.indexOf('#')))).toEqual([
      { label: 'Miami', iana: 'America/New_York' },
      { label: 'IST', iana: 'Asia/Kolkata', isHome: true },
      { label: 'AEST', iana: 'Australia/Sydney' },
      { label: 'London', iana: 'Europe/London' },
      { label: 'Tokyo', iana: 'Asia/Tokyo' }
    ])
  })

  it('carries non-ASCII names, such as São Paulo and 東京, exactly', () => {
    const picked: Location[] = [
      { id: 'a', label: 'São Paulo', iana: 'America/Sao_Paulo', isHome: true },
      { id: 'b', label: '東京 🗼', iana: 'Asia/Tokyo' }
    ]
    expect(cities(`#share=${encodeShare(picked)}`)).toEqual([
      { label: 'São Paulo', iana: 'America/Sao_Paulo', isHome: true },
      { label: '東京 🗼', iana: 'Asia/Tokyo' }
    ])
  })

  it('makes a fragment that is safe in a URL: letters, digits, - and _ only', () => {
    expect(encodeShare(DEFAULT_LOCATIONS)).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('replaces any fragment already on the address, and puts nothing before the #', () => {
    const url = buildShareUrl('https://example.com/?x=1#widget', DEFAULT_LOCATIONS)
    expect(url.match(/#/g)).toHaveLength(1)
    expect(url.startsWith('https://example.com/?x=1#share=')).toBe(true)
  })

  it('shares only the cities, nothing else about the person', () => {
    const decoded = JSON.parse(atob(encodeShare(DEFAULT_LOCATIONS).replace(/-/g, '+').replace(/_/g, '/')))
    expect(Object.keys(decoded).sort()).toEqual(['c', 'v'])
    expect(JSON.stringify(decoded)).not.toMatch(/workHours|theme|timeFormat|id"/)
  })

  it('caps a very long list but keeps the home city', () => {
    const many: Location[] = Array.from({ length: 50 }, (_, i) => ({ id: `c${i}`, label: `City ${i}`, iana: 'Europe/Paris', isHome: i === 45 }))
    const shared = cities(`#share=${encodeShare(many)}`)!
    expect(shared).toHaveLength(MAX_SHARED_CITIES)
    expect(shared.filter((c) => c.isHome)).toEqual([{ label: 'City 45', iana: 'Europe/Paris', isHome: true }])
  })
})

describe('what is not a share link, or not a usable one', () => {
  it('ignores addresses that are not share links, including the widget view', () => {
    for (const hash of ['', '#', '#widget', '#/widget', '#section', '#shared=abc', '#xshare=abc']) {
      expect(parseShareHash(hash), hash).toEqual({ status: 'none' })
    }
  })

  it.each([
    ['empty', '#share='],
    ['not base64', '#share=@@@'],
    ['base64 of something that is not JSON', `#share=${btoa('hello').replace(/=+$/, '')}`],
    ['JSON that is not ours', hashOf({ hello: 'world' })],
    ['a different format version', hashOf({ v: 2, c: [['Paris', 'Europe/Paris']] })],
    ['no cities', hashOf({ v: 1, c: [] })],
    ['cities that are not a list', hashOf({ v: 1, c: 'Paris' })],
    ['only unknown zones', hashOf({ v: 1, c: [['Nowhere', 'Mars/Olympus']] })],
    ['too many cities', hashOf({ v: 1, c: Array.from({ length: MAX_SHARED_CITIES + 1 }, () => ['Paris', 'Europe/Paris']) })],
    ['a fragment that is far too long', `#share=${'A'.repeat(7000)}`],
    ['a cut-off link', `${hashOf({ v: 1, c: [['Paris', 'Europe/Paris']] }).slice(0, -6)}`]
  ])('says invalid for %s', (_name, hash) => {
    expect(parseShareHash(hash)).toEqual({ status: 'invalid' })
  })

  it('keeps the good cities of a list that also has bad ones', () => {
    const hash = hashOf({
      v: 1,
      c: [['Paris', 'Europe/Paris'], ['Nowhere', 'Mars/Olympus'], [7, 'Europe/Rome'], ['Rome'], null, ['Oslo', 'Europe/Oslo']]
    })
    expect(cities(hash)).toEqual([
      { label: 'Paris', iana: 'Europe/Paris' },
      { label: 'Oslo', iana: 'Europe/Oslo' }
    ])
  })

  it('cleans a label: control characters removed, trimmed, cut to 40 characters; one with nothing left is dropped', () => {
    const hash = hashOf({
      v: 1,
      c: [['  Pa\u0000r\nis  ', 'Europe/Paris'], ['x'.repeat(100), 'Europe/Rome'], ['\u0001\u0002', 'Europe/Oslo']]
    })
    expect(cities(hash)).toEqual([
      { label: 'Paris', iana: 'Europe/Paris' },
      { label: 'x'.repeat(40), iana: 'Europe/Rome' }
    ])
  })

  it('keeps only the first home city, and does not execute or interpret a label', () => {
    const hash = hashOf({
      v: 1,
      c: [['<img src=x onerror=alert(1)>', 'Europe/Paris', 1], ['Rome', 'Europe/Rome', 1]]
    })
    expect(cities(hash)).toEqual([
      { label: '<img src=x onerror=alert(1)>', iana: 'Europe/Paris', isHome: true },
      { label: 'Rome', iana: 'Europe/Rome' }
    ])
  })

  it('refuses a zone name that is absurdly long', () => {
    expect(parseShareHash(hashOf({ v: 1, c: [['x', `Europe/${'a'.repeat(100)}`]] }))).toEqual({ status: 'invalid' })
  })
})

describe('replaceWithShared', () => {
  it('gives the shared list as the whole list, with the home from the link and fresh ids', () => {
    const list = replaceWithShared([
      { label: 'Paris', iana: 'Europe/Paris' },
      { label: 'Tokyo', iana: 'Asia/Tokyo', isHome: true }
    ])!
    expect(list.map((l) => [l.label, l.isHome ?? false])).toEqual([['Paris', false], ['Tokyo', true]])
    expect(new Set(list.map((l) => l.id)).size).toBe(2)
  })

  it('makes the ids unique even for cities with the same name', () => {
    const list = replaceWithShared([
      { label: 'Springfield', iana: 'America/Chicago' },
      { label: 'Springfield', iana: 'America/New_York' }
    ])!
    expect(list.map((l) => l.id)).toEqual(['springfield', 'springfield-2'])
  })

  it('still produces an id for a name with no letters in it', () => {
    const list = replaceWithShared([{ label: '東京', iana: 'Asia/Tokyo' }])!
    expect(list[0].id).toBe('tokyo')
  })

  it('picks a home when the link names none, and is null for nothing', () => {
    const list = replaceWithShared([{ label: 'Paris', iana: 'Europe/Paris' }])!
    expect(list.filter((l) => l.isHome)).toHaveLength(1)
    expect(replaceWithShared([])).toBeNull()
  })
})

describe('mergeShared', () => {
  const mine: Location[] = [
    { id: 'ist', label: 'IST', iana: 'Asia/Kolkata', isHome: true },
    { id: 'london', label: 'London', iana: 'Europe/London' }
  ]

  it('adds the cities you do not have, after yours, and never changes your home', () => {
    const shared: SharedLocation[] = [
      { label: 'Tokyo', iana: 'Asia/Tokyo', isHome: true },
      { label: 'Paris', iana: 'Europe/Paris' }
    ]
    const merged = mergeShared(mine, shared)
    expect(merged.map((l) => l.label)).toEqual(['IST', 'London', 'Tokyo', 'Paris'])
    expect(merged.filter((l) => l.isHome).map((l) => l.label)).toEqual(['IST'])
  })

  it('skips a zone you already show, even under another name, and a repeat within the link', () => {
    const merged = mergeShared(mine, [
      { label: 'Delhi', iana: 'Asia/Kolkata' },
      { label: 'Paris', iana: 'Europe/Paris' },
      { label: 'Lyon', iana: 'Europe/Paris' }
    ])
    expect(merged.map((l) => l.label)).toEqual(['IST', 'London', 'Paris'])
  })

  it('does not reuse an id you already have', () => {
    const clash: Location[] = [{ id: 'paris', label: 'Home', iana: 'Asia/Kolkata', isHome: true }]
    expect(mergeShared(clash, [{ label: 'Paris', iana: 'Europe/Paris' }]).map((l) => l.id)).toEqual(['paris', 'paris-2'])
  })

  it('returns your own list, untouched, when there is nothing new', () => {
    expect(mergeShared(mine, [{ label: 'Delhi', iana: 'Asia/Kolkata' }])).toBe(mine)
    expect(mergeShared(mine, [])).toBe(mine)
  })

  it('does not change what it is given', () => {
    const before = JSON.stringify(mine)
    mergeShared(mine, [{ label: 'Paris', iana: 'Europe/Paris' }])
    expect(JSON.stringify(mine)).toBe(before)
  })
})

describe('isShareableProtocol', () => {
  it('is true for web pages and false for the desktop and iOS apps', () => {
    expect(isShareableProtocol('https:')).toBe(true)
    expect(isShareableProtocol('http:')).toBe(true) // a local preview
    expect(isShareableProtocol('file:')).toBe(false) // Electron
    expect(isShareableProtocol('capacitor:')).toBe(false) // iOS
    expect(isShareableProtocol('')).toBe(false)
  })
})
