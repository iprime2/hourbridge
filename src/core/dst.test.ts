import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import { describeDstChange, getDstInfo } from '@core/dst'

const at = (iso: string, zone = 'UTC') => DateTime.fromISO(iso, { zone })

describe('getDstInfo', () => {
  it('finds the US spring-forward transition to the minute', () => {
    const info = getDstInfo('America/New_York', at('2024-01-15T12:00:00'))
    expect(info.inDst).toBe(false)
    expect(info.nextChange?.deltaMinutes).toBe(60)
    // 2024-03-10 02:00 EST jumps to 03:00 EDT = 07:00 UTC.
    expect(info.nextChange?.at.toUTC().toISO()).toBe('2024-03-10T07:00:00.000Z')
  })

  it('finds the fall-back transition while on daylight time', () => {
    const info = getDstInfo('America/New_York', at('2024-07-01T12:00:00'))
    expect(info.inDst).toBe(true)
    expect(info.nextChange?.deltaMinutes).toBe(-60)
    expect(info.nextChange?.at.toUTC().toISO()).toBe('2024-11-03T06:00:00.000Z')
  })

  it('handles the southern hemisphere (opposite season)', () => {
    const info = getDstInfo('Australia/Sydney', at('2024-01-15T00:00:00'))
    expect(info.inDst).toBe(true)
    expect(info.nextChange?.deltaMinutes).toBe(-60)
  })

  it('reports no change for zones without DST', () => {
    const ist = getDstInfo('Asia/Kolkata', at('2024-01-15T12:00:00'))
    expect(ist).toEqual({ inDst: false, nextChange: null })
    expect(getDstInfo('Asia/Tokyo', at('2024-07-01T12:00:00')).nextChange).toBeNull()
  })

  it('respects a short horizon', () => {
    const info = getDstInfo('America/New_York', at('2024-01-15T12:00:00'), 10)
    expect(info.nextChange).toBeNull()
  })

  it('does not throw on an unknown zone', () => {
    expect(getDstInfo('Not/AZone', at('2024-01-15T12:00:00'))).toEqual({
      inDst: false,
      nextChange: null
    })
  })
})

describe('describeDstChange', () => {
  it('describes forward and back changes', () => {
    const fwd = getDstInfo('America/New_York', at('2024-01-15T12:00:00')).nextChange
    expect(describeDstChange(fwd)).toBe('Clocks go forward 1h on Mar 10')
    const back = getDstInfo('America/New_York', at('2024-07-01T12:00:00')).nextChange
    expect(describeDstChange(back)).toBe('Clocks go back 1h on Nov 3')
  })

  it('returns null when there is no change', () => {
    expect(describeDstChange(null)).toBeNull()
  })
})
