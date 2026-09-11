import { DateTime } from 'luxon'
import { formatLiveClock, offsetForLocation } from '@renderer/lib/formatters'
import type { TimeFormat } from '@renderer/lib/timeEngine'
import { getHomeLocation, type Location } from '@renderer/lib/timezones'

export interface WidgetRow {
  id: string
  label: string
  isHome: boolean
  time: string
  offset: string
}

/** Build compact widget display rows for the current instant. */
export function buildWidgetRows(
  locations: readonly Location[],
  timeFormat: TimeFormat,
  now: DateTime = DateTime.now()
): WidgetRow[] {
  const home = getHomeLocation(locations)
  return locations.map((location) => ({
    id: location.id,
    label: location.label,
    isHome: Boolean(location.isHome) || location.id === home.id,
    time: formatLiveClock(now, location.iana, timeFormat),
    offset: offsetForLocation(location, now, home.iana)
  }))
}
