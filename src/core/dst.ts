import { DateTime } from 'luxon'

export interface DstChange {
  /** The first instant the new offset is in effect. */
  at: DateTime
  /** Change in UTC offset, in minutes (+60 = clocks go forward). */
  deltaMinutes: number
}

export interface DstInfo {
  inDst: boolean
  nextChange: DstChange | null
}

const STEP_DAYS = 7
const DEFAULT_HORIZON_DAYS = 400

function offsetAt(zone: string, ms: number): number {
  return DateTime.fromMillis(ms, { zone }).offset
}

/**
 * Whether `zone` is on daylight time at `instant`, and when its offset next changes.
 * Scans in weekly steps then bisects to the exact minute, so it costs ~60 lookups.
 */
export function getDstInfo(
  zone: string,
  instant: DateTime,
  horizonDays: number = DEFAULT_HORIZON_DAYS
): DstInfo {
  const local = instant.setZone(zone)
  if (!local.isValid) return { inDst: false, nextChange: null }

  const startMs = instant.toMillis()
  const startOffset = local.offset
  const stepMs = STEP_DAYS * 24 * 60 * 60 * 1000
  const endMs = startMs + horizonDays * 24 * 60 * 60 * 1000

  let lo = startMs
  for (let hi = startMs + stepMs; lo < endMs; hi += stepMs) {
    if (offsetAt(zone, hi) !== startOffset) {
      // Bisect (lo, hi] down to one minute.
      let a = lo
      let b = hi
      while (b - a > 60_000) {
        const mid = Math.floor((a + b) / 2)
        if (offsetAt(zone, mid) === startOffset) a = mid
        else b = mid
      }
      // Offsets only ever change on whole-minute boundaries. `a` is before the change and `b` is
      // at/after it, less than a minute apart, so the minute at or below `b` is the transition.
      const at = DateTime.fromMillis(Math.floor(b / 60_000) * 60_000, { zone })
      return {
        inDst: local.isInDST,
        nextChange: { at, deltaMinutes: at.offset - startOffset }
      }
    }
    lo = hi
  }

  return { inDst: local.isInDST, nextChange: null }
}

/** "Clocks go forward 1h on Mar 8" — null when the zone has no upcoming change. */
export function describeDstChange(change: DstChange | null): string | null {
  if (!change) return null
  const hours = Math.abs(change.deltaMinutes) / 60
  const amount = Number.isInteger(hours) ? `${hours}h` : `${Math.abs(change.deltaMinutes)}m`
  const direction = change.deltaMinutes > 0 ? 'forward' : 'back'
  return `Clocks go ${direction} ${amount} on ${change.at.toFormat('LLL d')}`
}
