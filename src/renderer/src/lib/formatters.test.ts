import { describe, expect, it } from 'vitest'
import { filterCityOptions, CITY_OPTIONS } from '@renderer/lib/cityOptions'
import { formatOffsetHours, formatTileTime } from '@renderer/lib/formatters'

describe('cityOptions', () => {
  it('includes a useful curated set', () => {
    expect(CITY_OPTIONS.length).toBeGreaterThanOrEqual(20)
    expect(CITY_OPTIONS.some((c) => c.label === 'London')).toBe(true)
  })

  it('filters by label and aliases and respects exclude ids', () => {
    const hits = filterCityOptions('india')
    expect(hits.some((c) => c.iana === 'Asia/Kolkata')).toBe(true)

    const excluded = filterCityOptions('', new Set(['london']))
    expect(excluded.every((c) => c.id !== 'london')).toBe(true)
  })
})

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
