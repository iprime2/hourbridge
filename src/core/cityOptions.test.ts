import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import {
  allCityOptions,
  CITY_OPTIONS,
  detectLocalZone,
  filterCityOptions,
  localCityOption,
  parseOffsetQuery,
  searchCities
} from '@core/cityOptions'

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
      expect(city.iana).toMatch(/^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/)
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

describe('allCityOptions / searchCities', () => {
  const now = DateTime.fromISO('2024-01-15T12:00:00Z')

  it('extends the curated list with every runtime zone, with unique ids', () => {
    const all = allCityOptions()
    expect(all.length).toBeGreaterThan(CITY_OPTIONS.length + 100)
    const ids = all.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of all) expect(DateTime.now().setZone(c.iana).isValid, c.iana).toBe(true)
  })

  it('shows modern names instead of retired ICU aliases', () => {
    const zones = new Set(allCityOptions().map((c) => c.iana))
    expect(zones.has('Asia/Calcutta')).toBe(false)
    expect(zones.has('Asia/Katmandu')).toBe(false)
    expect(zones.has('Europe/Kiev')).toBe(false)
  })

  it('finds cities by country name', () => {
    expect(searchCities('germany')[0].id).toBe('berlin')
    expect(searchCities('nepal')[0].iana).toBe('Asia/Kathmandu')
    expect(searchCities('japan')[0].id).toBe('tokyo')
  })

  it('finds zones that are not in the curated list', () => {
    const r = searchCities('reykjavik')
    expect(r.some((c) => c.iana === 'Atlantic/Reykjavik')).toBe(true)
  })

  it('ranks exact and prefix label matches above substring matches', () => {
    const r = searchCities('par')
    expect(r[0].label.toLowerCase().startsWith('par')).toBe(true)
    expect(searchCities('london')[0].id).toBe('london')
  })

  it('returns curated popular cities for an empty query and respects the limit', () => {
    const r = searchCities('', new Set(), { limit: 5 })
    expect(r).toHaveLength(5)
    expect(r[0].id).toBe(CITY_OPTIONS[0].id)
  })

  it('excludes ids already on the grid', () => {
    const r = searchCities('london', new Set(['london']))
    expect(r.every((c) => c.id !== 'london')).toBe(true)
  })

  it('searches by UTC offset', () => {
    const r = searchCities('+5:30', new Set(), { now, limit: 200 })
    expect(r.length).toBeGreaterThan(0)
    expect(r.every((c) => now.setZone(c.iana).offset === 330)).toBe(true)
    expect(r.some((c) => c.iana === 'Asia/Kolkata')).toBe(true)
    expect(searchCities('utc-8', new Set(), { now, limit: 200 }).some((c) => c.id === 'los-angeles')).toBe(true)
  })

  it('returns nothing for gibberish', () => {
    expect(searchCities('zzzz-not-a-city')).toEqual([])
  })
})

describe('parseOffsetQuery', () => {
  it('parses common offset spellings', () => {
    expect(parseOffsetQuery('+5:30')).toBe(330)
    expect(parseOffsetQuery('utc-8')).toBe(-480)
    expect(parseOffsetQuery('GMT+530')).toBe(330)
    expect(parseOffsetQuery('+14')).toBe(840)
    expect(parseOffsetQuery('−3')).toBe(-180)
  })

  it('rejects out-of-range values and non-offsets', () => {
    expect(parseOffsetQuery('+15')).toBeNull()
    expect(parseOffsetQuery('+5:75')).toBeNull()
    expect(parseOffsetQuery('paris')).toBeNull()
    expect(parseOffsetQuery('')).toBeNull()
  })
})

describe('local zone', () => {
  it('detects a valid local zone and builds a picker entry', () => {
    const zone = detectLocalZone()
    expect(zone === null || DateTime.now().setZone(zone).isValid).toBe(true)
    const option = localCityOption()
    if (option) {
      expect(option.id.startsWith('local:')).toBe(true)
      expect(option.label.startsWith('My location')).toBe(true)
    }
  })
})
