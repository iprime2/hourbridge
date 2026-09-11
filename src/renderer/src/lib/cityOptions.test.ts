import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import { CITY_OPTIONS, filterCityOptions } from '@renderer/lib/cityOptions'

describe('CITY_OPTIONS', () => {
  it('is a non-empty curated list', () => {
    expect(CITY_OPTIONS.length).toBeGreaterThanOrEqual(20)
  })

  it('has unique ids', () => {
    const ids = CITY_OPTIONS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('includes common cities', () => {
    const labels = new Set(CITY_OPTIONS.map((c) => c.label))
    for (const city of ['London', 'Tokyo', 'New York', 'Paris', 'IST', 'AEST']) {
      expect(labels.has(city)).toBe(true)
    }
  })

  it('uses valid-looking IANA zone ids', () => {
    for (const city of CITY_OPTIONS) {
      expect(city.iana).toMatch(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/)
      const dt = DateTime.now().setZone(city.iana)
      expect(dt.isValid, `${city.label} → ${city.iana}`).toBe(true)
    }
  })
})

describe('filterCityOptions', () => {
  it('filters by label and aliases', () => {
    expect(filterCityOptions('paris').some((c) => c.id === 'paris')).toBe(true)
    expect(filterCityOptions('india').some((c) => c.iana === 'Asia/Kolkata')).toBe(true)
  })

  it('respects exclude ids', () => {
    const excluded = filterCityOptions('', new Set(['london', 'tokyo']))
    expect(excluded.every((c) => c.id !== 'london' && c.id !== 'tokyo')).toBe(true)
  })
})
