import { DateTime } from 'luxon'
import { MIN_MEETING_MINUTES, MINUTES_PER_DAY } from './meeting'
import { sanitizeLocations } from './persistence'
import type { MeetingPlan } from './share'
import type { Location } from './timezones'

/**
 * A link that carries a list of cities, so a colleague can open the same set in one click, and
 * optionally one meeting. Everything travels in the URL *fragment* (after the `#`), which browsers
 * never send to a server, and only the cities and the meeting are included: no working hours,
 * theme or anything else personal.
 */
export interface SharedLocation {
  label: string
  iana: string
  isHome?: boolean
}

/**
 * A proposed meeting. The start is an absolute instant, so whoever opens the link sees it in their
 * own timezone; the length is in real minutes (what the calendar invite says).
 */
export interface SharedMeeting {
  start: DateTime
  minutes: number
  title?: string
}

export type SharedLink =
  | { status: 'none' }
  /** There is a share link, but it cannot be read (cut off, edited, or not ours). */
  | { status: 'invalid' }
  | { status: 'ready'; cities: SharedLocation[]; meeting?: SharedMeeting }

export const MAX_SHARED_CITIES = 30
const MAX_LABEL_LENGTH = 40
export const MAX_MEETING_TITLE_LENGTH = 80
const MINUTE_MS = 60_000
/** A shared meeting starts between 2000 and 2100: anything else was not planned in this app. */
const EARLIEST_MINUTE = Date.UTC(2000, 0, 1) / MINUTE_MS
const LATEST_MINUTE = Date.UTC(2100, 0, 1) / MINUTE_MS
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

// Control characters have no business in a city name or a meeting title.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g

/** A title as shared: one line, trimmed, at most 80 characters; empty when nothing is left. */
function cleanTitle(title: string): string {
  return title.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_MEETING_TITLE_LENGTH)
}

/**
 * Can this meeting travel in a link? It must start on a quarter hour (every timezone in use is a
 * whole number of quarter hours from UTC, so it then starts on a quarter hour everywhere), last
 * 15 minutes to a day in steps of 15, and fall between 2000 and 2100.
 */
function isShareable(startMinute: number, minutes: number): boolean {
  return (
    Number.isSafeInteger(startMinute) &&
    startMinute >= EARLIEST_MINUTE &&
    startMinute < LATEST_MINUTE &&
    startMinute % 15 === 0 &&
    Number.isInteger(minutes) &&
    minutes >= MIN_MEETING_MINUTES &&
    minutes <= MINUTES_PER_DAY &&
    minutes % 15 === 0
  )
}

/**
 * The planned meeting as it would be shared, or null when it cannot be (see `isShareable`). The
 * length is the real time between start and end, which is what calendars are told too.
 */
export function meetingForLink(plan: MeetingPlan, title = ''): SharedMeeting | null {
  const start = plan.start.toMillis() / MINUTE_MS
  const minutes = (plan.end.toMillis() - plan.start.toMillis()) / MINUTE_MS
  if (!isShareable(start, minutes)) return null
  const name = cleanTitle(title)
  return { start: plan.start, minutes, ...(name ? { title: name } : {}) }
}

export function encodeShare(locations: readonly Location[], meeting?: SharedMeeting | null): string {
  const cities = chosen(locations).map((l) => (l.isHome ? [l.label, l.iana, 1] : [l.label, l.iana]))
  const payload: { v: number; c: unknown[]; m?: unknown[] } = { v: FORMAT_VERSION, c: cities }
  if (meeting) {
    const start = Math.round(meeting.start.toMillis() / MINUTE_MS)
    if (!isShareable(start, meeting.minutes)) throw new RangeError('This meeting cannot be shared in a link')
    const title = cleanTitle(meeting.title ?? '')
    payload.m = title ? [start, meeting.minutes, title] : [start, meeting.minutes]
  }
  return toBase64Url(JSON.stringify(payload))
}

/** `base` is the page address without any fragment, e.g. `https://example.com/`. */
export function buildShareUrl(base: string, locations: readonly Location[], meeting?: SharedMeeting | null): string {
  return `${base.replace(/#.*$/, '')}#share=${encodeShare(locations, meeting)}`
}

const isKnownZone = (iana: string): boolean => DateTime.now().setZone(iana).isValid

function readCity(entry: unknown): SharedLocation | null {
  if (!Array.isArray(entry) || typeof entry[0] !== 'string' || typeof entry[1] !== 'string') return null
  const label = entry[0].replace(CONTROL, '').trim().slice(0, MAX_LABEL_LENGTH)
  const iana = entry[1]
  if (!label || iana.length > 64 || !isKnownZone(iana)) return null
  return entry[2] === 1 ? { label, iana, isHome: true } : { label, iana }
}

/** `[startMinute, minutes]` or `[startMinute, minutes, title]`, all checked; null if any part is off. */
function readMeeting(entry: unknown): SharedMeeting | null {
  if (!Array.isArray(entry) || entry.length < 2 || entry.length > 3) return null
  const [start, minutes, title] = entry as unknown[]
  if (typeof start !== 'number' || typeof minutes !== 'number' || !isShareable(start, minutes)) return null
  if (title !== undefined && typeof title !== 'string') return null
  const name = typeof title === 'string' ? cleanTitle(title) : ''
  const at = DateTime.fromMillis(start * MINUTE_MS, { zone: 'utc' })
  return name ? { start: at, minutes, title: name } : { start: at, minutes }
}

/**
 * What the page's `location.hash` holds. A link is untrusted input: it is size-limited, decoded
 * defensively, and every city is checked (known timezone, short plain label) before it is shown.
 * A meeting, when there is one, must be entirely valid, or the whole link is refused: showing the
 * cities alone would hide that the sender meant to propose a time.
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
  const record = data as { v?: unknown; c?: unknown; m?: unknown } | null
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
  if (cities.length === 0) return { status: 'invalid' }
  if (record.m === undefined) return { status: 'ready', cities }
  const meeting = readMeeting(record.m)
  return meeting ? { status: 'ready', cities, meeting } : { status: 'invalid' }
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
