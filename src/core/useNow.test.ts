/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { msUntilNextTick, useNow } from '@core/useNow'

describe('msUntilNextTick', () => {
  it('waits for the next minute boundary (+5ms guard)', () => {
    expect(msUntilNextTick(0, 'minute')).toBe(60_005)
    expect(msUntilNextTick(59_000, 'minute')).toBe(1_005)
    expect(msUntilNextTick(119_999, 'minute')).toBe(6)
  })

  it('waits for the next second boundary', () => {
    expect(msUntilNextTick(1_250, 'second')).toBe(755)
  })
})

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T10:00:45.000Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('advances exactly when the minute rolls over, not on a fixed interval', () => {
    const { result } = renderHook(() => useNow('minute'))
    expect(result.current.toUTC().toFormat('HH:mm')).toBe('10:00')

    act(() => {
      vi.advanceTimersByTime(14_000) // 10:00:59 — still the same minute
    })
    expect(result.current.toUTC().toFormat('HH:mm')).toBe('10:00')

    act(() => {
      vi.advanceTimersByTime(2_000) // 10:01:01
    })
    expect(result.current.toUTC().toFormat('HH:mm')).toBe('10:01')
  })

  it('stops ticking after unmount', () => {
    const { unmount } = renderHook(() => useNow('second'))
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
