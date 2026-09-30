import { DateTime } from 'luxon'

export interface TrayLocation {
  id: string
  label: string
  iana: string
  isHome?: boolean
}

export interface TrayState {
  locations: TrayLocation[]
  timeFormat: '12h' | '24h'
  theme: 'system' | 'light' | 'dark'
}

const MAX_TITLE_LABEL = 12

const pad = (n: number): string => String(n).padStart(2, '0')

/** Locale-independent clock text, matching the renderer ("9:05 PM" / "21:05"). */
export function formatClock(now: DateTime, iana: string, format: '12h' | '24h'): string {
  const local = now.setZone(iana)
  if (format === '24h') return `${pad(local.hour)}:${pad(local.minute)}`
  const hour12 = local.hour % 12 === 0 ? 12 : local.hour % 12
  return `${hour12}:${pad(local.minute)} ${local.hour < 12 ? 'AM' : 'PM'}`
}

export function homeOf(state: TrayState): TrayLocation | undefined {
  return state.locations.find((l) => l.isHome) ?? state.locations[0]
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

/** Menu-bar text: the home city and its time, e.g. "IST 9:05 PM". Empty until state arrives. */
export function trayTitle(state: TrayState | null, now: DateTime): string {
  if (!state) return ''
  const home = homeOf(state)
  if (!home) return ''
  return `${truncate(home.label, MAX_TITLE_LABEL)} ${formatClock(now, home.iana, state.timeFormat)}`
}

/** One line per location for the tray dropdown, with the weekday when the date differs from home. */
export function trayMenuLines(state: TrayState | null, now: DateTime): string[] {
  if (!state) return []
  const home = homeOf(state)
  if (!home) return []
  const homeDay = now.setZone(home.iana)
  return state.locations.map((l) => {
    const local = now.setZone(l.iana)
    const day = local.hasSame(homeDay, 'day') ? '' : ` (${local.toFormat('ccc')})`
    return `${l.label}  —  ${formatClock(now, l.iana, state.timeFormat)}${day}`
  })
}

/** Milliseconds until the next minute boundary, so the menu-bar clock flips on time. */
export function msUntilNextMinute(nowMs: number): number {
  return 60_000 - (nowMs % 60_000) + 5
}
