// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileRules, headersFor } from './lib/vercel-headers.mjs'

const rule = (source, ...pairs) => ({ source, headers: pairs.map(([key, value]) => ({ key, value })) })

describe('headersFor', () => {
  it('applies every matching rule, in order, and the later rule wins per header', () => {
    const rules = compileRules([
      rule('/(.*)', ['X-A', '1'], ['Cache-Control', 'no-store']),
      rule('/assets/(.*)', ['Cache-Control', 'immutable'])
    ])
    expect(headersFor(rules, '/assets/app.js')).toEqual({ 'X-A': '1', 'Cache-Control': 'immutable' })
    expect(headersFor(rules, '/')).toEqual({ 'X-A': '1', 'Cache-Control': 'no-store' })
  })

  it('treats header names as case-insensitive', () => {
    const rules = compileRules([rule('/(.*)', ['Cache-Control', 'a']), rule('/x', ['cache-control', 'b'])])
    expect(headersFor(rules, '/x')).toEqual({ 'cache-control': 'b' })
  })

  it('matches exact paths exactly', () => {
    const rules = compileRules([rule('/sw.js', ['X-Sw', '1'])])
    expect(headersFor(rules, '/sw.js')).toEqual({ 'X-Sw': '1' })
    expect(headersFor(rules, '/sw.js.map')).toEqual({})
    expect(headersFor(rules, '/nested/sw.js')).toEqual({})
    expect(headersFor(rules, '/swXjs')).toEqual({}) // the dot is literal
  })

  it('lets (.*) match the root and paths across slashes', () => {
    const rules = compileRules([rule('/(.*)', ['X-All', '1'])])
    for (const path of ['/', '/a', '/a/b/c.js']) expect(headersFor(rules, path)).toEqual({ 'X-All': '1' })
  })

  it('refuses source syntax it cannot emulate, rather than ignoring it', () => {
    for (const source of ['/:path*', '/a/(b|c)', '/images/:id', '/(?!api)', '/a+']) {
      expect(() => compileRules([rule(source, ['X', '1'])])).toThrow(/Unsupported/)
    }
  })
})

describe("this repo's vercel.json", () => {
  const config = JSON.parse(readFileSync(join(__dirname, '..', 'vercel.json'), 'utf8'))
  const rules = compileRules(config.headers)

  it('puts the security headers on every kind of response, not just the page', () => {
    for (const path of ['/', '/assets/index-abc.js', '/sw.js', '/manifest.webmanifest', '/nope']) {
      const headers = headersFor(rules, path)
      for (const name of ['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy']) {
        expect(headers[name], `${name} on ${path}`).toBeTruthy()
      }
    }
  })

  it('caches hashed assets forever but never caches the service worker', () => {
    expect(headersFor(rules, '/assets/index-abc.js')['Cache-Control']).toContain('immutable')
    const sw = headersFor(rules, '/sw.js')
    expect(sw['Cache-Control']).toBe('no-cache')
    expect(sw['Service-Worker-Allowed']).toBe('/')
    expect(sw['Content-Security-Policy']).toBeTruthy() // merged with the catch-all rule
  })

  it('serves the manifest with the manifest media type', () => {
    expect(headersFor(rules, '/manifest.webmanifest')['Content-Type']).toBe('application/manifest+json')
  })
})
