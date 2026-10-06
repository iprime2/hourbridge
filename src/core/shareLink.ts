import { DateTime } from 'luxon'
import { sanitizeLocations } from './persistence'
import type { Location } from './timezones'

/**
 * A link that carries a list of cities, so a colleague can open the same set in one click. The
 * cities travel in the URL *fragment* (after the `#`), which browsers never send to a server, and
 * only the cities are included: no working hours, theme or anything else personal.
 */
export interface SharedLocation {
  label: string
  iana: string
  isHome?: boolean
}

export type SharedLink =
  | { status: 'none' }
  /** There is a share link, but it cannot be read (cut off, edited, or not ours). */
  | { status: 'invalid' }
  | { status: 'ready'; cities: SharedLocation[] }

export const MAX_SHARED_CITIES = 30
const MAX_LABEL_LENGTH = 40
const MAX_FRAGMENT_LENGTH = 6000
const FORMAT_VERSION = 1

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(encoded: string): string | null {
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
  } catch {
    return null
  }
}

/** The cities to put in a link: at most 30, and the home city is always among them. */
function chosen(locations: readonly Location[]): Location[] {
  const picked = locations.slice(0, MAX_SHARED_CITIES)
  const home = locations.find((l) => l.isHome)
  if (home && !picked.includes(home)) picked[picked.length - 1] = home
  return picked
}

/**
 * A link only makes sense from a web page. The desktop app (`file:`) and the iOS app
 * (`capacitor:`) have no address anyone else could open.
 */
export function isShareableProtocol(protocol: string): boolean {
  return protocol === 'https:' || protocol === 'http:'
}

export function encodeShare(locations: readonly Location[]): string {
  const cities = chosen(locations).map((l) => (l.isHome ? [l.label, l.iana, 1] : [l.label, l.iana]))
  return toBase64Url(JSON.stringify({ v: FORMAT_VERSION, c: cities }))
}

/** `base` is the page address without any fragment, e.g. `https://example.com/`. */
export function buildShareUrl(base: string, locations: readonly Location[]): string {
  return `${base.replace(/#.*$/, '')}#share=${encodeShare(locations)}`
}

const isKnownZone = (iana: string): boolean => DateTime.now().setZone(iana).isValid

// Control characters have no business in a city name.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g

function readCity(entry: unknown): SharedLocation | null {
  if (!Array.isArray(entry) || typeof entry[0] !== 'string' || typeof entry[1] !== 'string') return null
  const label = entry[0].replace(CONTROL, '').trim().slice(0, MAX_LABEL_LENGTH)
  const iana = entry[1]
  if (!label || iana.length > 64 || !isKnownZone(iana)) return null
  return entry[2] === 1 ? { label, iana, isHome: true } : { label, iana }
}

/**
 * What the page's `location.hash` holds. A link is untrusted input: it is size-limited, decoded
 * defensively, and every city is checked (known timezone, short plain label) before it is shown.
 */
export function parseShareHash(hash: string): SharedLink {
  const match = /^#?share=(.*)$/.exec(hash)
  if (!match) return { status: 'none' }
  const encoded = match[1]
  if (encoded.length === 0 || encoded.length > MAX_FRAGMENT_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    return { status: 'invalid' }
  }
  const text = fromBase64Url(encoded)
  if (text === null) return { status: 'invalid' }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { status: 'invalid' }
  }
  const record = data as { v?: unknown; c?: unknown } | null
  if (!record || record.v !== FORMAT_VERSION || !Array.isArray(record.c) || record.c.length > MAX_SHARED_CITIES) {
    return { status: 'invalid' }
  }
  const cities: SharedLocation[] = []
  let homeSeen = false
  for (const entry of record.c) {
    const city = readCity(entry)
    if (!city) continue
    if (city.isHome && homeSeen) delete city.isHome // one home only
    if (city.isHome) homeSeen = true
    cities.push(city)
  }
  return cities.length > 0 ? { status: 'ready', cities } : { status: 'invalid' }
}

function slug(text: string, fallback: string): string {
  const base = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
  return base || fallback
}

/** Give shared cities ids that do not clash with the `taken` ones (ids are only used as keys). */
function withIds(cities: readonly SharedLocation[], taken: ReadonlySet<string>): Location[] {
  const used = new Set(taken)
  return cities.map((city) => {
    const root = slug(city.label, slug(city.iana.split('/').pop() ?? '', 'city'))
    let id = root
    for (let n = 2; used.has(id); n++) id = `${root}-${n}`
    used.add(id)
    return { id, label: city.label, iana: city.iana, ...(city.isHome ? { isHome: true } : {}) }
  })
}

/** The shared cities as the whole list (the home city comes from the link). Null if nothing usable. */
export function replaceWithShared(shared: readonly SharedLocation[]): Location[] | null {
  return sanitizeLocations(withIds(shared, new Set()))
}

/**
 * Your cities plus the shared ones you do not have yet. A zone you already show is skipped (a
 * second row for the same zone adds nothing), and your home city never changes. Returns `current`
 * itself when there is nothing to add.
 */
export function mergeShared(current: readonly Location[], shared: readonly SharedLocation[]): Location[] {
  const seen = new Set(current.map((l) => l.iana))
  const fresh: SharedLocation[] = []
  for (const city of shared) {
    if (seen.has(city.iana)) continue
    seen.add(city.iana)
    fresh.push({ label: city.label, iana: city.iana })
  }
  if (fresh.length === 0) return current as Location[]
  return [...current, ...withIds(fresh, new Set(current.map((l) => l.id)))]
}
