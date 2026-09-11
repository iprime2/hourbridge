import { describe, expect, it } from 'vitest'
import { formatOffsetHours, formatTileTime } from '@renderer/lib/formatters'

describe('formatters', () => {
  it('formats half-hour offsets', () => {
    expect(formatOffsetHours(-9.5)).toBe('−9:30')
    expect(formatOffsetHours(5.5)).toBe('+5:30')
    expect(formatOffsetHours(0)).toBe('0')
  })

  it('formats tile times with half hours', () => {
    expect(formatTileTime(2, 30, '12h')).toBe('2:30a')
    expect(formatTileTime(14, 30, '24h')).toBe('14:30')
    expect(formatTileTime(12, 0, '12h')).toBe('12p')
  })
})
