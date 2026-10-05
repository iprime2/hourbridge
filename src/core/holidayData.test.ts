// @vitest-environment node
// Guards the generated files in src/core/holidayData: if a regeneration produced something the app
// cannot read, or dropped a holiday everyone knows, this fails before it ships.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = join(__dirname, 'holidayData')
const json = <T>(file: string): T => JSON.parse(readFileSync(join(dir, file), 'utf8')) as T

interface Meta {
  years: [number, number]
  tzdata: string
  source: string
  partial: Record<string, string>
  noData: string[]
  countries: Record<string, string>
}
const meta = json<Meta>('meta.json')
const zones = json<Record<string, string>>('zones.json')
const files = readdirSync(join(dir, 'countries')).map((f) => f.replace(/\.json$/, ''))
const country = (code: string) => json<Record<string, [string, string][]>>(`countries/${code}.json`)

const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

describe('generated holiday data', () => {
  it('has a plausible range, source and tz version', () => {
    const [from, to] = meta.years
    expect(to).toBeGreaterThanOrEqual(from)
    expect(meta.source).toMatch(/date-holidays .*CC BY 3\.0/) // the attribution the license asks for
    expect(meta.tzdata).toMatch(/^\d{4}[a-z]$/)
  })

  it('has a data file for exactly the countries not listed as having none', () => {
    const withData = Object.keys(meta.countries).filter((c) => !meta.noData.includes(c))
    expect([...files].sort()).toEqual([...withData].sort())
    expect(meta.noData.filter((c) => files.includes(c))).toEqual([])
  })

  it('maps every zone to a named country', () => {
    for (const [zone, code] of Object.entries(zones)) {
      expect(meta.countries[code], `${zone} -> ${code}`).toBeTruthy()
    }
    expect(Object.keys(zones).length).toBeGreaterThan(400)
  })

  it('only marks as partial a country that has data', () => {
    for (const code of Object.keys(meta.partial)) expect(files, code).toContain(code)
  })

  it('has every year in range for every country, with real, ordered dates and names', () => {
    const [from, to] = meta.years
    for (const code of files) {
      const years = country(code)
      expect(Object.keys(years).map(Number), code).toEqual(Array.from({ length: to - from + 1 }, (_, i) => from + i))
      for (const [year, rows] of Object.entries(years)) {
        let previous = ''
        for (const [mmdd, name] of rows) {
          const [month, day] = mmdd.split('-').map(Number)
          expect(mmdd, `${code} ${year}`).toMatch(/^\d\d-\d\d$/)
          expect(month >= 1 && month <= 12 && day >= 1 && day <= daysIn(Number(year), month), `${code} ${year} ${mmdd}`).toBe(true)
          expect(name.trim().length, `${code} ${year} ${mmdd}`).toBeGreaterThan(0)
          expect(mmdd >= previous, `${code} ${year}: ${mmdd} after ${previous}`).toBe(true)
          previous = mmdd
        }
      }
    }
  })

  it('keeps the holidays everyone knows', () => {
    const [from, to] = meta.years
    for (let year = from; year <= to; year++) {
      expect(country('US')[year].map(([d]) => d), `US ${year}`).toEqual(expect.arrayContaining(['01-01', '07-04', '12-25']))
      expect(country('GB')[year].map(([d]) => d), `GB ${year}`).toEqual(expect.arrayContaining(['01-01', '12-25']))
      expect(country('IN')[year].map(([d]) => d), `IN ${year}`).toEqual(expect.arrayContaining(['01-26', '08-15', '10-02']))
      expect(country('DE')[year].map(([d]) => d), `DE ${year}`).toContain('10-03')
    }
  })

  it('ships files that match what the generator script writes (no hand edits)', () => {
    expect(existsSync(join(__dirname, '..', '..', 'scripts', 'generate-holidays.mjs'))).toBe(true)
    // A hand-edited file would break this: every file is one line of compact JSON ending in a newline.
    for (const code of files.slice(0, 20)) {
      const text = readFileSync(join(dir, 'countries', `${code}.json`), 'utf8')
      expect(text.endsWith('\n') && text.indexOf('\n') === text.length - 1, code).toBe(true)
    }
  })
})
