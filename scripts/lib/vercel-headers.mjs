// Emulates the `headers` section of vercel.json so the built site can be checked locally.
//
// Vercel applies every rule whose `source` matches the request path, in file order, and a later
// rule wins for the same header name. Only the source syntax this repo uses is supported: plain
// paths and the `(.*)` wildcard. Anything else throws, so a new pattern can never be silently
// ignored by the preflight.

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function compileRules(rules) {
  return rules.map((rule) => {
    if (/[:*?+{}()[\]|]/.test(rule.source.replaceAll('(.*)', ''))) {
      throw new Error(`Unsupported vercel.json header source: ${rule.source}`)
    }
    const pattern = rule.source.split('(.*)').map(escapeRegExp).join('(.*)')
    return { source: rule.source, re: new RegExp(`^${pattern}$`), headers: rule.headers }
  })
}

/** The headers Vercel would send for `pathname` (header names are case-insensitive). */
export function headersFor(compiled, pathname) {
  const merged = new Map()
  for (const rule of compiled) {
    if (!rule.re.test(pathname)) continue
    for (const { key, value } of rule.headers) merged.set(key.toLowerCase(), { key, value })
  }
  return Object.fromEntries([...merged.values()].map(({ key, value }) => [key, value]))
}
