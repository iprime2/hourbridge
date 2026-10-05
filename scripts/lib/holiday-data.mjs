// Pure helpers for scripts/generate-holidays.mjs: read the IANA tz database tables and shape
// holiday lists into the compact form the app ships. No file or network access in here.

const dataLines = (text) =>
  text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line && !line.startsWith('#'))

/** zone.tab rows are `CC<TAB>coordinates<TAB>Zone<TAB>comment`. Returns { zone: CC }. */
export function parseZoneTab(text) {
  const zones = {}
  for (const line of dataLines(text)) {
    const [country, , zone] = line.split('\t')
    if (country && zone) zones[zone] = country
  }
  return zones
}

/** iso3166.tab rows are `CC<TAB>Country name`. Returns { CC: name }. */
export function parseIsoCountries(text) {
  const names = {}
  for (const line of dataLines(text)) {
    const [code, name] = line.split('\t')
    if (code && name) names[code] = name
  }
  return names
}

/** tzdata.zi link lines are `L target alias` (the alias is another name for the target zone). */
export function parseLinks(text) {
  const links = {}
  for (const line of dataLines(text)) {
    const [kind, target, alias] = line.split(/\s+/)
    if (kind === 'L' && target && alias) links[alias] = target
  }
  return links
}

/** The version comment on the first line of tzdata.zi, e.g. "2026b". */
export function parseTzVersion(text) {
  return /^# version (\S+)/.exec(text)?.[1] ?? 'unknown'
}

/**
 * Every zone name the app can meet -> its country: the zone.tab entries plus every alias of one
 * (so `Asia/Katmandu` and `Europe/Kiev` resolve like `Asia/Kathmandu` and `Europe/Kyiv`).
 * Zones with no country (UTC, Etc/*) are left out. Keys come out sorted, so the output is stable.
 */
export function zoneCountries(zoneTab, links) {
  const table = { ...zoneTab }
  const resolve = (name) => {
    for (let hops = 0; name !== undefined && hops < 4; hops++) {
      if (zoneTab[name]) return zoneTab[name]
      name = links[name]
    }
    return undefined
  }
  for (const alias of Object.keys(links)) {
    if (!table[alias]) {
      const country = resolve(links[alias])
      if (country) table[alias] = country
    }
  }
  return Object.fromEntries(Object.entries(table).sort(([a], [b]) => (a < b ? -1 : 1)))
}

/**
 * One year of a country's holidays as `[["MM-DD", name], …]`: public holidays only (not
 * observances like Mother's Day or bank-only days), de-duplicated, in date order.
 * `holidays` is what date-holidays' getHolidays(year) returns.
 */
export function encodeYear(holidays) {
  const seen = new Set()
  const rows = []
  for (const h of holidays) {
    if (h.type !== 'public') continue
    const mmdd = String(h.date).slice(5, 10)
    const key = `${mmdd}\u0000${h.name}`
    if (!/^\d\d-\d\d$/.test(mmdd) || seen.has(key)) continue
    seen.add(key)
    rows.push([mmdd, h.name])
  }
  return rows.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
}
