/** IANA timezone id, e.g. `Asia/Kolkata`. */
export type IanaTimezone = string

export interface Location {
  /** Stable id for UI keys / selection. */
  id: string
  /** Display label. */
  label: string
  /** IANA zone used for conversion. */
  iana: IanaTimezone
  /** True when this row is the home / reference zone. */
  isHome?: boolean
}

/** Default home timezone (IST). */
export const HOME_TIMEZONE: IanaTimezone = 'Asia/Kolkata'

/**
 * Default comparison locations for the timeline UI (Slice 3).
 * Miami uses America/New_York so EDT/EST match US Eastern clock.
 */
export const DEFAULT_LOCATIONS: readonly Location[] = [
  { id: 'miami', label: 'Miami', iana: 'America/New_York' },
  { id: 'ist', label: 'IST', iana: HOME_TIMEZONE, isHome: true },
  { id: 'aest', label: 'AEST', iana: 'Australia/Sydney' },
  { id: 'london', label: 'London', iana: 'Europe/London' },
  { id: 'tokyo', label: 'Tokyo', iana: 'Asia/Tokyo' }
] as const

export function getHomeLocation(
  locations: readonly Location[] = DEFAULT_LOCATIONS
): Location {
  const home = locations.find((l) => l.isHome) ?? locations.find((l) => l.iana === HOME_TIMEZONE)
  if (!home) {
    throw new Error('No home location found')
  }
  return home
}
