import { useEffect, useState } from 'react'
import { DateTime } from 'luxon'

export type TickGranularity = 'minute' | 'second'

/** Milliseconds until the next wall-clock boundary (top of the minute or second). */
export function msUntilNextTick(nowMs: number, granularity: TickGranularity): number {
  const unit = granularity === 'minute' ? 60_000 : 1_000
  // +5ms so we land just after the boundary and never re-render inside the old minute.
  return unit - (nowMs % unit) + 5
}

/**
 * The current instant, refreshed on wall-clock boundaries rather than a drifting interval,
 * so a minute-precision clock flips exactly when the minute does.
 */
export function useNow(granularity: TickGranularity = 'minute'): DateTime {
  const [now, setNow] = useState(() => DateTime.now())

  useEffect(() => {
    let timer: number
    const schedule = (): void => {
      timer = window.setTimeout(() => {
        setNow(DateTime.now())
        schedule()
      }, msUntilNextTick(Date.now(), granularity))
    }
    setNow(DateTime.now())
    schedule()

    // Laptops sleep and phones background the app: timers pause, so resync on return.
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') setNow(DateTime.now())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [granularity])

  return now
}
