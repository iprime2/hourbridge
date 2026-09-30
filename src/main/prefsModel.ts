export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** Main-process preferences persisted to `userData/prefs.json`. */
export interface Prefs {
  /** Show the home time in the macOS menu bar. */
  trayEnabled: boolean
  mainBounds?: Bounds
  widgetBounds?: Bounds
}

export const DEFAULT_PREFS: Prefs = { trayEnabled: true }

const MIN_SIZE = 200
const MAX_SIZE = 10_000

function parseBounds(value: unknown): Bounds | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const b = value as Record<string, unknown>
  const nums = [b.x, b.y, b.width, b.height]
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return undefined
  const { x, y, width, height } = b as unknown as Bounds
  if (width < MIN_SIZE || height < MIN_SIZE || width > MAX_SIZE || height > MAX_SIZE) {
    return undefined
  }
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }
}

/** Turn whatever is on disk into safe prefs; anything unrecognised falls back to defaults. */
export function sanitizePrefs(raw: unknown): Prefs {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_PREFS }
  const r = raw as Record<string, unknown>
  const prefs: Prefs = {
    trayEnabled: typeof r.trayEnabled === 'boolean' ? r.trayEnabled : DEFAULT_PREFS.trayEnabled
  }
  const main = parseBounds(r.mainBounds)
  const widget = parseBounds(r.widgetBounds)
  if (main) prefs.mainBounds = main
  if (widget) prefs.widgetBounds = widget
  return prefs
}

/**
 * True when at least a 100×60 corner of `bounds` is on some display — protects against a
 * window restored onto a monitor that has since been unplugged.
 */
export function isOnScreen(bounds: Bounds, displays: readonly Bounds[]): boolean {
  return displays.some((d) => {
    const overlapW = Math.min(bounds.x + bounds.width, d.x + d.width) - Math.max(bounds.x, d.x)
    const overlapH = Math.min(bounds.y + bounds.height, d.y + d.height) - Math.max(bounds.y, d.y)
    return overlapW >= 100 && overlapH >= 60
  })
}
