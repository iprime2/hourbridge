import { DateTime } from 'luxon'
import type { TrayLocation, TrayState } from './trayModel'

const MAX_LOCATIONS = 100
const MAX_LABEL = 80

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseLocation(value: unknown): TrayLocation | null {
  if (!isRecord(value)) return null
  const { id, label, iana, isHome } = value
  if (typeof id !== 'string' || typeof label !== 'string' || typeof iana !== 'string') return null
  if (id.length === 0 || id.length > MAX_LABEL || label.length > MAX_LABEL) return null
  if (isHome !== undefined && typeof isHome !== 'boolean') return null
  if (!DateTime.now().setZone(iana).isValid) return null
  return { id, label, iana, ...(isHome ? { isHome: true } : {}) }
}

/**
 * Validate renderer-supplied state before the main process trusts it.
 * The renderer is sandboxed content, so every field is checked rather than cast.
 */
export function parsePublishedState(input: unknown): TrayState | null {
  if (!isRecord(input)) return null
  const { locations, timeFormat, theme } = input
  if (!Array.isArray(locations) || locations.length === 0 || locations.length > MAX_LOCATIONS) {
    return null
  }
  if (timeFormat !== '12h' && timeFormat !== '24h') return null
  if (theme !== 'system' && theme !== 'light' && theme !== 'dark') return null

  const parsed: TrayLocation[] = []
  for (const raw of locations) {
    const loc = parseLocation(raw)
    if (!loc) return null
    parsed.push(loc)
  }
  return { locations: parsed, timeFormat, theme }
}

/**
 * Only our own renderer may drive privileged IPC: the packaged `file://…/renderer/index.html`
 * or, in development, the Vite dev-server origin.
 */
export function isTrustedSender(url: string | undefined, devServerUrl?: string): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    if (devServerUrl) {
      const dev = new URL(devServerUrl)
      if (parsed.origin === dev.origin) return true
    }
    return parsed.protocol === 'file:' && parsed.pathname.endsWith('/renderer/index.html')
  } catch {
    return false
  }
}

/** External links may only open over https — never file:, javascript:, or custom schemes. */
export function isSafeExternalUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}
