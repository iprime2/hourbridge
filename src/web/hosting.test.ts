// @vitest-environment node
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '../..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const json = (p: string) => JSON.parse(read(p))

interface HeaderRule {
  source: string
  headers: { key: string; value: string }[]
}
const vercel = json('vercel.json') as {
  installCommand: string
  buildCommand: string
  outputDirectory: string
  headers: HeaderRule[]
}
const headersFor = (source: string) =>
  Object.fromEntries(vercel.headers.find((h) => h.source === source)!.headers.map((h) => [h.key, h.value]))

/** Parse "a 'self'; b 'none'" into { a: ["'self'"], b: ["'none'"] }. */
const directives = (csp: string) =>
  Object.fromEntries(
    csp
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((d) => d[0])
      .map(([name, ...values]) => [name, values])
  ) as Record<string, string[]>

/** Width and height from a PNG's IHDR chunk. */
const pngSize = (path: string): [number, number] => {
  const bytes = readFileSync(join(root, path))
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
}

describe('Vercel deployment config', () => {
  it('builds the web app and serves its output folder', () => {
    expect(vercel.buildCommand).toBe('npm run build:web')
    expect(vercel.outputDirectory).toBe('dist-web')
    expect(read('vite.web.config.ts')).toContain("resolve('dist-web')")
    expect(read('.gitignore')).toContain('dist-web/')
  })

  it('skips the ~100 MB Electron download during install (the web build never runs Electron)', () => {
    expect(vercel.installCommand).toContain('ELECTRON_SKIP_BINARY_DOWNLOAD=1')
    expect(vercel.installCommand).toContain('npm ci')
  })

  it('pins Node so the build matches CI and the Capacitor CLI requirement', () => {
    expect(json('package.json').engines.node).toBe('22.x')
  })

  it('sends a strict content security policy', () => {
    const csp = directives(headersFor('/(.*)')['Content-Security-Policy'])
    expect(csp['default-src']).toEqual(["'self'"])
    expect(csp['script-src']).toEqual(["'self'"]) // no inline scripts, no eval, no third parties
    expect(csp['connect-src']).toEqual(["'self'"])
    expect(csp['worker-src']).toEqual(["'self'"])
    expect(csp['manifest-src']).toEqual(["'self'"])
    expect(csp['object-src']).toEqual(["'none'"])
    expect(csp['frame-ancestors']).toEqual(["'none'"])
    expect(csp['form-action']).toEqual(["'none'"])
    for (const values of Object.values(csp)) {
      expect(values.join(' ')).not.toMatch(/\*|unsafe-eval|https?:/)
    }
  })

  it('has a page-level CSP that is no looser than the header one', () => {
    const meta = read('src/web/index.html').match(/Content-Security-Policy"\s+content="([^"]+)"/)![1]
    const fromMeta = directives(meta)
    const fromHeader = directives(headersFor('/(.*)')['Content-Security-Policy'])
    for (const name of ['default-src', 'script-src', 'connect-src', 'worker-src', 'manifest-src', 'img-src', 'style-src']) {
      expect(fromMeta[name], name).toEqual(fromHeader[name])
    }
  })

  it('adds the standard hardening headers', () => {
    const h = headersFor('/(.*)')
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    expect(h['X-Frame-Options']).toBe('DENY')
    expect(h['Referrer-Policy']).toBe('no-referrer')
    expect(h['Cross-Origin-Opener-Policy']).toBe('same-origin')
    expect(h['Permissions-Policy']).toMatch(/camera=\(\)/)
  })

  it('caches hashed assets forever but never the service worker', () => {
    expect(headersFor('/assets/(.*)')['Cache-Control']).toBe('public, max-age=31536000, immutable')
    expect(headersFor('/sw.js')['Cache-Control']).toBe('no-cache')
  })

  it('serves the manifest with its own content type', () => {
    expect(headersFor('/manifest.webmanifest')['Content-Type']).toBe('application/manifest+json')
  })

  it('never sets the same header from two overlapping rules (Vercel merges them unpredictably)', () => {
    const seen = new Map<string, string>()
    // The catch-all matches every path, so no other rule may repeat one of its headers.
    for (const key of Object.keys(headersFor('/(.*)'))) seen.set(key, '/(.*)')
    for (const rule of vercel.headers.filter((h) => h.source !== '/(.*)')) {
      for (const { key } of rule.headers) {
        expect(seen.has(key), `${key} in ${rule.source} duplicates the catch-all`).toBe(false)
      }
    }
  })
})

describe('web app manifest and icons', () => {
  const manifest = json('src/web/public/manifest.webmanifest')

  it('describes an installable standalone app', () => {
    expect(manifest.name).toBe('World Time Buddy')
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('./')
    expect(manifest.scope).toBe('./') // relative, so it works at a domain root or a sub-path
    expect(manifest.short_name.length).toBeLessThanOrEqual(12)
  })

  it('declares every icon at the size it really has, including a maskable one', () => {
    for (const icon of manifest.icons) {
      const path = join('src/web/public', icon.src)
      expect(existsSync(join(root, path)), path).toBe(true)
      const [w, h] = pngSize(path)
      expect(`${w}x${h}`, icon.src).toBe(icon.sizes)
    }
    const purposes = manifest.icons.map((i: { purpose: string }) => i.purpose)
    expect(purposes).toContain('any')
    expect(purposes).toContain('maskable')
    expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true)
    expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '192x192')).toBe(true)
  })

  it('uses the app’s background colour from the design tokens', () => {
    const tokens = read('src/ui/tokens.css')
    const bg = tokens.match(/--bg:\s*(#[0-9a-f]{6})/i)![1].toLowerCase()
    expect(manifest.background_color.toLowerCase()).toBe(bg)
    expect(manifest.theme_color.toLowerCase()).toBe(bg)
  })

  it('has an index.html whose links all point at files that exist', () => {
    const html = read('src/web/index.html')
    for (const [, href] of html.matchAll(/<link[^>]+href="\.\/([^"]+)"/g)) {
      expect(existsSync(join(root, 'src/web/public', href)), href).toBe(true)
    }
    expect(html).toContain('rel="manifest"')
    expect(html).toContain('rel="apple-touch-icon"')
    expect(pngSize('src/web/public/apple-touch-icon.png')).toEqual([180, 180])
    expect(html).toContain('viewport-fit=cover')
  })
})
