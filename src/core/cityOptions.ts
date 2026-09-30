import { DateTime } from 'luxon'
import type { IanaTimezone } from './timezones'

export interface CityOption {
  id: string
  label: string
  iana: IanaTimezone
  /** Optional search aliases (lowercase): countries, abbreviations, nicknames. */
  aliases?: string[]
  /** Continent/region, e.g. "Europe". Present on generated entries. */
  region?: string
}

/** Curated cities for the add-location picker. Ids are persisted — never rename them. */
export const CITY_OPTIONS: readonly CityOption[] = [
  { id: 'miami', label: 'Miami', iana: 'America/New_York', aliases: ['florida', 'edt', 'est'] },
  { id: 'new-york', label: 'New York', iana: 'America/New_York', aliases: ['nyc', 'eastern', 'usa', 'united states'] },
  { id: 'chicago', label: 'Chicago', iana: 'America/Chicago', aliases: ['central', 'cdt', 'cst'] },
  { id: 'denver', label: 'Denver', iana: 'America/Denver', aliases: ['mountain', 'mdt', 'mst'] },
  { id: 'los-angeles', label: 'Los Angeles', iana: 'America/Los_Angeles', aliases: ['la', 'pst', 'pdt', 'pacific'] },
  { id: 'seattle', label: 'Seattle', iana: 'America/Los_Angeles' },
  { id: 'toronto', label: 'Toronto', iana: 'America/Toronto', aliases: ['canada'] },
  { id: 'sao-paulo', label: 'São Paulo', iana: 'America/Sao_Paulo', aliases: ['brazil', 'brasil', 'sao paulo'] },
  { id: 'mexico-city', label: 'Mexico City', iana: 'America/Mexico_City', aliases: ['mexico'] },
  { id: 'london', label: 'London', iana: 'Europe/London', aliases: ['uk', 'gmt', 'bst', 'england', 'britain', 'united kingdom'] },
  { id: 'paris', label: 'Paris', iana: 'Europe/Paris', aliases: ['cet', 'cest', 'france'] },
  { id: 'berlin', label: 'Berlin', iana: 'Europe/Berlin', aliases: ['germany', 'deutschland'] },
  { id: 'amsterdam', label: 'Amsterdam', iana: 'Europe/Amsterdam', aliases: ['netherlands', 'holland'] },
  { id: 'madrid', label: 'Madrid', iana: 'Europe/Madrid', aliases: ['spain'] },
  { id: 'rome', label: 'Rome', iana: 'Europe/Rome', aliases: ['italy'] },
  { id: 'moscow', label: 'Moscow', iana: 'Europe/Moscow', aliases: ['russia'] },
  { id: 'dubai', label: 'Dubai', iana: 'Asia/Dubai', aliases: ['gst', 'uae', 'emirates'] },
  { id: 'ist', label: 'IST', iana: 'Asia/Kolkata', aliases: ['india', 'kolkata', 'mumbai', 'delhi'] },
  { id: 'mumbai', label: 'Mumbai', iana: 'Asia/Kolkata', aliases: ['india', 'bombay'] },
  { id: 'singapore', label: 'Singapore', iana: 'Asia/Singapore', aliases: ['sgt'] },
  { id: 'hong-kong', label: 'Hong Kong', iana: 'Asia/Hong_Kong', aliases: ['hkt'] },
  { id: 'shanghai', label: 'Shanghai', iana: 'Asia/Shanghai', aliases: ['china', 'beijing'] },
  { id: 'tokyo', label: 'Tokyo', iana: 'Asia/Tokyo', aliases: ['jst', 'japan'] },
  { id: 'seoul', label: 'Seoul', iana: 'Asia/Seoul', aliases: ['korea', 'kst'] },
  { id: 'aest', label: 'AEST', iana: 'Australia/Sydney', aliases: ['sydney', 'australia'] },
  { id: 'melbourne', label: 'Melbourne', iana: 'Australia/Melbourne', aliases: ['australia'] },
  { id: 'auckland', label: 'Auckland', iana: 'Pacific/Auckland', aliases: ['nz', 'new zealand', 'nzst'] },
  { id: 'honolulu', label: 'Honolulu', iana: 'Pacific/Honolulu', aliases: ['hawaii', 'hst'] },
  { id: 'anchorage', label: 'Anchorage', iana: 'America/Anchorage', aliases: ['alaska'] },
  { id: 'cairo', label: 'Cairo', iana: 'Africa/Cairo', aliases: ['egypt'] },
  { id: 'johannesburg', label: 'Johannesburg', iana: 'Africa/Johannesburg', aliases: ['south africa', 'sast'] },
  { id: 'nairobi', label: 'Nairobi', iana: 'Africa/Nairobi', aliases: ['kenya', 'eat'] },
  { id: 'bangkok', label: 'Bangkok', iana: 'Asia/Bangkok', aliases: ['thailand'] },
  { id: 'jakarta', label: 'Jakarta', iana: 'Asia/Jakarta', aliases: ['indonesia'] },
  { id: 'manila', label: 'Manila', iana: 'Asia/Manila', aliases: ['philippines'] },
  { id: 'vancouver', label: 'Vancouver', iana: 'America/Vancouver', aliases: ['canada'] },
  { id: 'buenos-aires', label: 'Buenos Aires', iana: 'America/Argentina/Buenos_Aires', aliases: ['argentina'] },
  { id: 'istanbul', label: 'Istanbul', iana: 'Europe/Istanbul', aliases: ['turkey', 'türkiye'] },
  { id: 'stockholm', label: 'Stockholm', iana: 'Europe/Stockholm', aliases: ['sweden'] },
  { id: 'zurich', label: 'Zurich', iana: 'Europe/Zurich', aliases: ['switzerland'] },

  // — Extended set: capitals and business hubs people actually schedule across. —
  { id: 'san-francisco', label: 'San Francisco', iana: 'America/Los_Angeles', aliases: ['sf', 'bay area', 'silicon valley', 'california'] },
  { id: 'washington-dc', label: 'Washington DC', iana: 'America/New_York', aliases: ['dc', 'usa'] },
  { id: 'boston', label: 'Boston', iana: 'America/New_York', aliases: ['massachusetts'] },
  { id: 'atlanta', label: 'Atlanta', iana: 'America/New_York', aliases: ['georgia'] },
  { id: 'dallas', label: 'Dallas', iana: 'America/Chicago', aliases: ['texas'] },
  { id: 'houston', label: 'Houston', iana: 'America/Chicago', aliases: ['texas'] },
  { id: 'austin', label: 'Austin', iana: 'America/Chicago', aliases: ['texas'] },
  { id: 'phoenix', label: 'Phoenix', iana: 'America/Phoenix', aliases: ['arizona'] },
  { id: 'montreal', label: 'Montreal', iana: 'America/Toronto', aliases: ['canada', 'quebec'] },
  { id: 'calgary', label: 'Calgary', iana: 'America/Edmonton', aliases: ['canada', 'alberta'] },
  { id: 'bogota', label: 'Bogotá', iana: 'America/Bogota', aliases: ['colombia', 'bogota'] },
  { id: 'lima', label: 'Lima', iana: 'America/Lima', aliases: ['peru'] },
  { id: 'santiago', label: 'Santiago', iana: 'America/Santiago', aliases: ['chile'] },
  { id: 'caracas', label: 'Caracas', iana: 'America/Caracas', aliases: ['venezuela'] },
  { id: 'lisbon', label: 'Lisbon', iana: 'Europe/Lisbon', aliases: ['portugal'] },
  { id: 'dublin', label: 'Dublin', iana: 'Europe/Dublin', aliases: ['ireland'] },
  { id: 'brussels', label: 'Brussels', iana: 'Europe/Brussels', aliases: ['belgium'] },
  { id: 'vienna', label: 'Vienna', iana: 'Europe/Vienna', aliases: ['austria'] },
  { id: 'prague', label: 'Prague', iana: 'Europe/Prague', aliases: ['czech', 'czechia'] },
  { id: 'warsaw', label: 'Warsaw', iana: 'Europe/Warsaw', aliases: ['poland'] },
  { id: 'budapest', label: 'Budapest', iana: 'Europe/Budapest', aliases: ['hungary'] },
  { id: 'athens', label: 'Athens', iana: 'Europe/Athens', aliases: ['greece', 'eet'] },
  { id: 'helsinki', label: 'Helsinki', iana: 'Europe/Helsinki', aliases: ['finland'] },
  { id: 'oslo', label: 'Oslo', iana: 'Europe/Oslo', aliases: ['norway'] },
  { id: 'copenhagen', label: 'Copenhagen', iana: 'Europe/Copenhagen', aliases: ['denmark'] },
  { id: 'kyiv', label: 'Kyiv', iana: 'Europe/Kyiv', aliases: ['kiev', 'ukraine'] },
  { id: 'tel-aviv', label: 'Tel Aviv', iana: 'Asia/Jerusalem', aliases: ['israel', 'jerusalem'] },
  { id: 'riyadh', label: 'Riyadh', iana: 'Asia/Riyadh', aliases: ['saudi arabia', 'saudi', 'ksa'] },
  { id: 'doha', label: 'Doha', iana: 'Asia/Qatar', aliases: ['qatar'] },
  { id: 'tehran', label: 'Tehran', iana: 'Asia/Tehran', aliases: ['iran'] },
  { id: 'karachi', label: 'Karachi', iana: 'Asia/Karachi', aliases: ['pakistan', 'pkt', 'lahore', 'islamabad'] },
  { id: 'dhaka', label: 'Dhaka', iana: 'Asia/Dhaka', aliases: ['bangladesh'] },
  { id: 'kathmandu', label: 'Kathmandu', iana: 'Asia/Kathmandu', aliases: ['nepal'] },
  { id: 'colombo', label: 'Colombo', iana: 'Asia/Colombo', aliases: ['sri lanka'] },
  { id: 'bangalore', label: 'Bangalore', iana: 'Asia/Kolkata', aliases: ['bengaluru', 'india'] },
  { id: 'kuala-lumpur', label: 'Kuala Lumpur', iana: 'Asia/Kuala_Lumpur', aliases: ['malaysia', 'kl'] },
  { id: 'ho-chi-minh', label: 'Ho Chi Minh City', iana: 'Asia/Ho_Chi_Minh', aliases: ['vietnam', 'saigon', 'hanoi'] },
  { id: 'taipei', label: 'Taipei', iana: 'Asia/Taipei', aliases: ['taiwan'] },
  { id: 'perth', label: 'Perth', iana: 'Australia/Perth', aliases: ['australia', 'awst'] },
  { id: 'brisbane', label: 'Brisbane', iana: 'Australia/Brisbane', aliases: ['australia', 'queensland'] },
  { id: 'adelaide', label: 'Adelaide', iana: 'Australia/Adelaide', aliases: ['australia', 'acst'] },
  { id: 'lagos', label: 'Lagos', iana: 'Africa/Lagos', aliases: ['nigeria', 'wat'] },
  { id: 'casablanca', label: 'Casablanca', iana: 'Africa/Casablanca', aliases: ['morocco'] },
  { id: 'utc', label: 'UTC', iana: 'UTC', aliases: ['gmt', 'zulu', 'coordinated universal time'] }
] as const

export function filterCityOptions(
  query: string,
  excludeIds: ReadonlySet<string> = new Set()
): CityOption[] {
  const q = query.trim().toLowerCase()
  return CITY_OPTIONS.filter((city) => {
    if (excludeIds.has(city.id)) return false
    if (!q) return true
    if (city.label.toLowerCase().includes(q)) return true
    if (city.iana.toLowerCase().includes(q)) return true
    return city.aliases?.some((a) => a.includes(q)) ?? false
  })
}

/* ------------------------------------------------------------------------- */
/* Full zone database + ranked search                                        */
/* ------------------------------------------------------------------------- */

/** V8/ICU still reports some zones under retired names; show and store the modern one. */
const LEGACY_TO_CANONICAL: Readonly<Record<string, string>> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Rangoon': 'Asia/Yangon',
  'Europe/Kiev': 'Europe/Kyiv',
  'America/Godthab': 'America/Nuuk',
  'Africa/Asmera': 'Africa/Asmara',
  'Atlantic/Faeroe': 'Atlantic/Faroe'
}

function isValidZone(iana: string): boolean {
  return DateTime.now().setZone(iana).isValid
}

function canonicalZone(iana: string): string {
  const modern = LEGACY_TO_CANONICAL[iana]
  return modern && isValidZone(modern) ? modern : iana
}

function labelFromZone(iana: string): string {
  const last = iana.split('/').pop() ?? iana
  return last.replace(/_/g, ' ')
}

let allOptionsCache: readonly CityOption[] | null = null

/**
 * Curated cities first, then every other IANA zone the runtime knows about
 * (≈420 in Chromium/WebKit), so any place on Earth is reachable.
 */
export function allCityOptions(): readonly CityOption[] {
  if (allOptionsCache) return allOptionsCache

  const supported: string[] =
    typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl
      ? (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf(
          'timeZone'
        )
      : []

  const takenIds = new Set(CITY_OPTIONS.map((c) => c.id))
  const takenLabels = new Set(CITY_OPTIONS.map((c) => c.label.toLowerCase()))
  const generated: CityOption[] = []

  for (const raw of supported) {
    const iana = canonicalZone(raw)
    const label = labelFromZone(iana)
    if (takenLabels.has(label.toLowerCase())) continue
    const id = `tz:${iana}`
    if (takenIds.has(id)) continue
    takenIds.add(id)
    takenLabels.add(label.toLowerCase())
    generated.push({ id, label, iana, region: iana.split('/')[0] })
  }

  generated.sort((a, b) => a.label.localeCompare(b.label))
  allOptionsCache = [...CITY_OPTIONS.filter((c) => isValidZone(c.iana)), ...generated]
  return allOptionsCache
}

/** Parse "+5:30", "utc-8", "GMT+530" → offset in minutes, or null when not an offset query. */
export function parseOffsetQuery(query: string): number | null {
  const m = /^(?:utc|gmt)?\s*([+\-−])\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(query.trim())
  if (!m) return null
  const sign = m[1] === '+' ? 1 : -1
  const hours = Number(m[2])
  const minutes = m[3] ? Number(m[3]) : 0
  if (hours > 14 || minutes > 59) return null
  return sign * (hours * 60 + minutes)
}

function scoreOption(city: CityOption, q: string): number {
  const label = city.label.toLowerCase()
  if (label === q) return 100
  if (label.startsWith(q)) return 80
  if (label.split(/[\s-]+/).some((w) => w.startsWith(q))) return 70
  if (city.aliases?.some((a) => a === q)) return 65
  if (city.aliases?.some((a) => a.startsWith(q))) return 55
  if (label.includes(q)) return 45
  if (city.aliases?.some((a) => a.includes(q))) return 35
  if (city.iana.toLowerCase().replace(/_/g, ' ').includes(q)) return 25
  if (city.region?.toLowerCase().startsWith(q)) return 10
  return 0
}

/**
 * Ranked city/zone search over the full database.
 * Empty query → the curated popular cities. "+5:30" / "utc-8" → zones at that offset now.
 */
export function searchCities(
  query: string,
  excludeIds: ReadonlySet<string> = new Set(),
  options: { limit?: number; now?: DateTime } = {}
): CityOption[] {
  const { limit = 20, now = DateTime.now() } = options
  const q = query.trim().toLowerCase()
  const pool = allCityOptions().filter((c) => !excludeIds.has(c.id))

  if (!q) return pool.slice(0, limit)

  const offset = parseOffsetQuery(q)
  if (offset !== null) {
    return pool
      .filter((c) => now.setZone(c.iana).offset === offset)
      .slice(0, limit)
  }

  return pool
    .map((city, index) => ({ city, index, score: scoreOption(city, q) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((r) => r.city)
}

/** The device's own IANA zone, or null when the runtime can't tell. */
export function detectLocalZone(): IanaTimezone | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return zone && isValidZone(zone) ? zone : null
  } catch {
    return null
  }
}

/** A picker entry for the device's own zone, e.g. "My location (Kolkata)". */
export function localCityOption(): CityOption | null {
  const iana = detectLocalZone()
  if (!iana) return null
  const canonical = canonicalZone(iana)
  const curated = CITY_OPTIONS.find((c) => c.iana === canonical)
  return {
    id: `local:${canonical}`,
    label: `My location (${curated?.label ?? labelFromZone(canonical)})`,
    iana: canonical,
    aliases: ['local', 'here', 'me', 'current', 'my location']
  }
}
