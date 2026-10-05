// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  encodeYear,
  parseIsoCountries,
  parseLinks,
  parseTzVersion,
  parseZoneTab,
  zoneCountries
} from './lib/holiday-data.mjs'

const ZONE_TAB = `# tzdb timezone descriptions
CH\t+4723+00832\tEurope/Zurich
LI\t+4709+00931\tEurope/Vaduz
IN\t+2232+08822\tAsia/Kolkata
NP\t+2743+08519\tAsia/Kathmandu
UA\t+5026+03031\tEurope/Kyiv\tmost of Ukraine
ET\t+0902+03842\tAfrica/Addis_Ababa
`

const TZDATA_ZI = `# version 2026b
# This zic input file is in the public domain.
R Europe 1977 1980 - Ap Su>=1 1:00u 1:00 S
Z Asia/Kolkata 5:53:28 - LMT 1854 Jun 28
L Europe/Kyiv Europe/Kiev
L Asia/Kolkata Asia/Calcutta
L Asia/Kathmandu Asia/Katmandu
L Asia/Calcutta India/Legacy
L Etc/UTC UTC
`

describe('parseZoneTab', () => {
  it('maps each zone to its country and ignores comments and the comment column', () => {
    const zones = parseZoneTab(ZONE_TAB)
    expect(zones['Europe/Kyiv']).toBe('UA')
    expect(zones['Asia/Kathmandu']).toBe('NP')
    expect(Object.keys(zones)).toHaveLength(6)
  })

  it('keeps Vaduz in Liechtenstein rather than Switzerland', () => {
    expect(parseZoneTab(ZONE_TAB)['Europe/Vaduz']).toBe('LI')
  })
})

describe('parseIsoCountries', () => {
  it('reads code and name', () => {
    expect(parseIsoCountries('# c\nIN\tIndia\nGB\tBritain (UK)\n')).toEqual({ IN: 'India', GB: 'Britain (UK)' })
  })
})

describe('parseLinks / parseTzVersion', () => {
  it('reads only link lines', () => {
    expect(parseLinks(TZDATA_ZI)).toMatchObject({ 'Europe/Kiev': 'Europe/Kyiv', 'Asia/Katmandu': 'Asia/Kathmandu' })
    expect(parseLinks(TZDATA_ZI)['Asia/Kolkata']).toBeUndefined() // a Zone line, not a link
  })

  it('reads the tz database version', () => {
    expect(parseTzVersion(TZDATA_ZI)).toBe('2026b')
    expect(parseTzVersion('nothing here')).toBe('unknown')
  })
})

describe('zoneCountries', () => {
  const table = zoneCountries(parseZoneTab(ZONE_TAB), parseLinks(TZDATA_ZI))

  it('resolves old and alternative names through their link', () => {
    expect(table['Europe/Kiev']).toBe('UA')
    expect(table['Asia/Katmandu']).toBe('NP')
    expect(table['Asia/Calcutta']).toBe('IN')
  })

  it('follows a link of a link', () => {
    expect(table['India/Legacy']).toBe('IN')
  })

  it('leaves out zones that belong to no country', () => {
    expect(table.UTC).toBeUndefined()
    expect(table['Etc/UTC']).toBeUndefined()
  })

  it('never overrides a zone.tab entry with a link, and is sorted', () => {
    expect(table['Europe/Zurich']).toBe('CH')
    const keys = Object.keys(table)
    expect(keys).toEqual([...keys].sort())
  })
})

describe('encodeYear', () => {
  const h = (date, name, type = 'public') => ({ date: `${date} 00:00:00`, name, type })

  it('keeps public holidays only, as MM-DD in date order', () => {
    expect(
      encodeYear([
        h('2026-12-25', 'Christmas Day'),
        h('2026-05-10', "Mother's Day", 'observance'),
        h('2026-12-24', 'Christmas Eve', 'bank'),
        h('2026-01-01', "New Year's Day")
      ])
    ).toEqual([
      ['01-01', "New Year's Day"],
      ['12-25', 'Christmas Day']
    ])
  })

  it('drops exact duplicates but keeps two different holidays on one date', () => {
    expect(
      encodeYear([h('2026-04-03', 'Good Friday'), h('2026-04-03', 'Good Friday'), h('2026-04-03', 'Another')])
    ).toEqual([
      ['04-03', 'Another'],
      ['04-03', 'Good Friday']
    ])
  })

  it('keeps the two days of a two-day holiday as two entries', () => {
    expect(encodeYear([h('2026-02-16', 'Spring Festival'), h('2026-02-17', 'Spring Festival')])).toHaveLength(2)
  })

  it('copes with nothing', () => {
    expect(encodeYear([])).toEqual([])
  })
})
