import type { IanaTimezone } from './timezones'

export interface CityOption {
  id: string
  label: string
  iana: IanaTimezone
  /** Optional search aliases (lowercase). */
  aliases?: string[]
}

/** Curated cities for the add-location picker. */
export const CITY_OPTIONS: readonly CityOption[] = [
  { id: 'miami', label: 'Miami', iana: 'America/New_York', aliases: ['florida', 'edt', 'est'] },
  { id: 'new-york', label: 'New York', iana: 'America/New_York', aliases: ['nyc', 'eastern'] },
  { id: 'chicago', label: 'Chicago', iana: 'America/Chicago', aliases: ['central', 'cdt', 'cst'] },
  { id: 'denver', label: 'Denver', iana: 'America/Denver', aliases: ['mountain', 'mdt', 'mst'] },
  { id: 'los-angeles', label: 'Los Angeles', iana: 'America/Los_Angeles', aliases: ['la', 'pst', 'pdt'] },
  { id: 'seattle', label: 'Seattle', iana: 'America/Los_Angeles' },
  { id: 'toronto', label: 'Toronto', iana: 'America/Toronto' },
  { id: 'sao-paulo', label: 'São Paulo', iana: 'America/Sao_Paulo', aliases: ['brazil'] },
  { id: 'mexico-city', label: 'Mexico City', iana: 'America/Mexico_City' },
  { id: 'london', label: 'London', iana: 'Europe/London', aliases: ['uk', 'gmt', 'bst'] },
  { id: 'paris', label: 'Paris', iana: 'Europe/Paris', aliases: ['cet', 'cest'] },
  { id: 'berlin', label: 'Berlin', iana: 'Europe/Berlin' },
  { id: 'amsterdam', label: 'Amsterdam', iana: 'Europe/Amsterdam' },
  { id: 'madrid', label: 'Madrid', iana: 'Europe/Madrid' },
  { id: 'rome', label: 'Rome', iana: 'Europe/Rome' },
  { id: 'moscow', label: 'Moscow', iana: 'Europe/Moscow' },
  { id: 'dubai', label: 'Dubai', iana: 'Asia/Dubai', aliases: ['gst', 'uae'] },
  { id: 'ist', label: 'IST', iana: 'Asia/Kolkata', aliases: ['india', 'kolkata', 'mumbai', 'delhi'] },
  { id: 'mumbai', label: 'Mumbai', iana: 'Asia/Kolkata' },
  { id: 'singapore', label: 'Singapore', iana: 'Asia/Singapore' },
  { id: 'hong-kong', label: 'Hong Kong', iana: 'Asia/Hong_Kong' },
  { id: 'shanghai', label: 'Shanghai', iana: 'Asia/Shanghai', aliases: ['china', 'beijing'] },
  { id: 'tokyo', label: 'Tokyo', iana: 'Asia/Tokyo', aliases: ['jst', 'japan'] },
  { id: 'seoul', label: 'Seoul', iana: 'Asia/Seoul' },
  { id: 'aest', label: 'AEST', iana: 'Australia/Sydney', aliases: ['sydney', 'australia'] },
  { id: 'melbourne', label: 'Melbourne', iana: 'Australia/Melbourne' },
  { id: 'auckland', label: 'Auckland', iana: 'Pacific/Auckland', aliases: ['nz', 'new zealand'] },
  { id: 'honolulu', label: 'Honolulu', iana: 'Pacific/Honolulu', aliases: ['hawaii', 'hst'] },
  { id: 'anchorage', label: 'Anchorage', iana: 'America/Anchorage', aliases: ['alaska'] },
  { id: 'cairo', label: 'Cairo', iana: 'Africa/Cairo' },
  { id: 'johannesburg', label: 'Johannesburg', iana: 'Africa/Johannesburg' },
  { id: 'nairobi', label: 'Nairobi', iana: 'Africa/Nairobi' },
  { id: 'bangkok', label: 'Bangkok', iana: 'Asia/Bangkok' },
  { id: 'jakarta', label: 'Jakarta', iana: 'Asia/Jakarta' },
  { id: 'manila', label: 'Manila', iana: 'Asia/Manila' },
  { id: 'vancouver', label: 'Vancouver', iana: 'America/Vancouver' },
  { id: 'buenos-aires', label: 'Buenos Aires', iana: 'America/Argentina/Buenos_Aires' },
  { id: 'istanbul', label: 'Istanbul', iana: 'Europe/Istanbul' },
  { id: 'stockholm', label: 'Stockholm', iana: 'Europe/Stockholm' },
  { id: 'zurich', label: 'Zurich', iana: 'Europe/Zurich' }
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
