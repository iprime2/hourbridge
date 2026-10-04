#!/usr/bin/env node
// Regenerates src/core/holidayData/ — the public holidays and the timezone -> country table the
// app ships. Run it by hand (npm run generate:holidays) when the date range or a data source moves
// on; the result is committed, so builds, CI and Vercel never need this script or its inputs.
//
//   npm run generate:holidays                  years 2025–2030, tz files from /usr/share/zoneinfo
//   npm run generate:holidays -- --from 2026 --to 2031
//   TZDIR=/path/to/zoneinfo npm run generate:holidays        (needs zone.tab, iso3166.tab, tzdata.zi)
//
// Sources: holiday rules from the `date-holidays` package (a devDependency; ISC code, CC BY 3.0
// data — credited in the README), and zone -> country from the system tz database (public domain).
// The app itself never loads the package: it reads these small files, offline, per country.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Holidays from 'date-holidays'
import {
  encodeYear,
  parseIsoCountries,
  parseLinks,
  parseTzVersion,
  parseZoneTab,
  zoneCountries
} from './lib/holiday-data.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'src/core/holidayData')

const args = process.argv.slice(2)
const option = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback)
const from = Number(option('from', 2025))
const to = Number(option('to', 2030))
const tzDir = process.env.TZDIR ?? '/usr/share/zoneinfo'

if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) {
  console.error(`Bad year range: ${from}–${to}`)
  process.exit(2)
}
const read = (name) => {
  const file = join(tzDir, name)
  if (!existsSync(file)) {
    console.error(`Missing ${file}. Point TZDIR at a zoneinfo folder that has zone.tab, iso3166.tab and tzdata.zi.`)
    process.exit(2)
  }
  return readFileSync(file, 'utf8')
}

/** Countries whose data source is known to be incomplete: shown to the user, never hidden. */
const PARTIAL = {
  IN: 'Only the fixed-date national holidays are included. Festival holidays such as Holi, Diwali and Eid change every year and by state, and are not in the data source yet.'
}

const tzdata = read('tzdata.zi')
const zones = zoneCountries(parseZoneTab(read('zone.tab')), parseLinks(tzdata))
const isoNames = parseIsoCountries(read('iso3166.tab'))
const wanted = [...new Set(Object.values(zones))].sort()

rmSync(join(outDir, 'countries'), { recursive: true, force: true })
mkdirSync(join(outDir, 'countries'), { recursive: true })

// Every country with a timezone gets a name, so the app can say "no holiday data for Nepal" instead
// of silently showing nothing; only those the source covers get a data file.
const countries = {}
const noData = []
let entries = 0
for (const code of wanted) {
  countries[code] = isoNames[code] ?? code
  const hd = new Holidays(code)
  hd.setLanguages('en') // English names where the source has them, its own language otherwise
  const years = {}
  for (let year = from; year <= to; year++) {
    const rows = encodeYear(hd.getHolidays(year))
    if (rows.length) years[year] = rows
    entries += rows.length
  }
  if (Object.keys(years).length === 0) {
    noData.push(code)
    continue
  }
  writeFileSync(join(outDir, 'countries', `${code}.json`), `${JSON.stringify(years)}\n`)
}

const dhVersion = createRequire(import.meta.url)('date-holidays/package.json').version
writeFileSync(join(outDir, 'zones.json'), `${JSON.stringify(zones)}\n`)
writeFileSync(
  join(outDir, 'meta.json'),
  `${JSON.stringify(
    {
      years: [from, to],
      tzdata: parseTzVersion(tzdata),
      source: `date-holidays ${dhVersion} (ISC; data CC BY 3.0)`,
      partial: Object.fromEntries(Object.entries(PARTIAL).filter(([code]) => !noData.includes(code))),
      noData,
      countries
    },
    null,
    2
  )}\n`
)

console.log(
  `${wanted.length - noData.length} countries with data, ${noData.length} without, ${Object.keys(zones).length} zones, ${entries} holidays (${from}–${to}), tzdata ${parseTzVersion(tzdata)}`
)
