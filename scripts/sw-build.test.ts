// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  computeBuildId,
  finalizeServiceWorker,
  injectIntoServiceWorker,
  isLazyAsset,
  isPrecacheable,
  LAZY_ASSET_DIR,
  listFiles
} from './lib/sw-build'

const realSource = readFileSync(join(__dirname, '../src/web/public/sw.js'), 'utf8')

describe('the real sw.js', () => {
  it('has exactly one of each build placeholder (the build step depends on them)', () => {
    expect(realSource.split("'__BUILD_ID__'")).toHaveLength(2)
    expect(realSource.split("['__PRECACHE__']")).toHaveLength(2)
  })
})

describe('computeBuildId', () => {
  const files = [
    { path: 'index.html', content: '<html>' },
    { path: 'assets/a-1.js', content: 'a' }
  ]

  it('is a short, stable hex id', () => {
    const id = computeBuildId(files)
    expect(id).toMatch(/^[0-9a-f]{12}$/)
    expect(computeBuildId(files)).toBe(id)
  })

  it('does not depend on the order files are listed in', () => {
    expect(computeBuildId([...files].reverse())).toBe(computeBuildId(files))
  })

  it('changes when a file’s bytes, name, or presence changes', () => {
    const base = computeBuildId(files)
    expect(computeBuildId([{ ...files[0], content: '<html!>' }, files[1]])).not.toBe(base)
    expect(computeBuildId([files[0], { ...files[1], path: 'assets/a-2.js' }])).not.toBe(base)
    expect(computeBuildId([...files, { path: 'x.png', content: '' }])).not.toBe(base)
  })

  it('cannot be fooled by moving bytes between a name and its content', () => {
    expect(computeBuildId([{ path: 'ab', content: 'c' }])).not.toBe(
      computeBuildId([{ path: 'a', content: 'bc' }])
    )
  })
})

describe('isPrecacheable', () => {
  it('skips the worker itself and source maps', () => {
    expect(isPrecacheable('sw.js')).toBe(false)
    expect(isPrecacheable('assets/index-1.js.map')).toBe(false)
    expect(isPrecacheable('index.html')).toBe(true)
    expect(isPrecacheable('assets/index-1.js')).toBe(true)
    expect(isPrecacheable('icon-192.png')).toBe(true)
  })
})

describe('isLazyAsset', () => {
  it('is only the per-country holiday files', () => {
    expect(LAZY_ASSET_DIR).toBe('assets/holidays/')
    expect(isLazyAsset('assets/holidays/IN-abc.js')).toBe(true)
    expect(isLazyAsset('assets/index-abc.js')).toBe(false)
    expect(isLazyAsset('assets/web-abc.js')).toBe(false)
    expect(isLazyAsset('holidays/IN.js')).toBe(false)
  })
})

describe('injectIntoServiceWorker', () => {
  it('produces valid JavaScript that carries the id and list', () => {
    const out = injectIntoServiceWorker(realSource, { buildId: 'abc123', precache: ['./', 'a b.js', 'q"uote.js'] })
    expect(out).not.toContain("'__BUILD_ID__'")
    // The array placeholder is gone. (A bare '__PRECACHE__' string legitimately remains in the
    // worker's own dev-mode guard, which ignores an unbuilt list.)
    expect(out).not.toContain("['__PRECACHE__']")
    const sandbox = { module: { exports: {} as Record<string, unknown> }, URL, Response, Request }
    runInNewContext(out, sandbox) // throws on a syntax error
    expect(sandbox.module.exports.CACHE_NAME).toBe('hb-abc123')
    expect((sandbox.module.exports.precacheUrls as (s: string) => string[])('https://h/')).toEqual([
      'https://h/',
      'https://h/a%20b.js',
      'https://h/q%22uote.js'
    ])
  })

  it('refuses to run on a worker without the placeholders instead of shipping a broken cache', () => {
    expect(() => injectIntoServiceWorker('console.log(1)', { buildId: 'x', precache: [] })).toThrow(
      /placeholders/
    )
  })
})

describe('finalizeServiceWorker', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hb-sw-'))
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'index.html'), '<html></html>')
    writeFileSync(join(dir, 'assets', 'index-abc.js'), 'js')
    writeFileSync(join(dir, 'assets', 'index-abc.js.map'), '{}')
    writeFileSync(join(dir, 'icon-192.png'), 'png')
    writeFileSync(join(dir, 'sw.js'), realSource)
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('lists the site deterministically with POSIX paths', () => {
    expect(listFiles(dir)).toEqual(['assets/index-abc.js', 'assets/index-abc.js.map', 'icon-192.png', 'index.html', 'sw.js'])
  })

  it('stamps the emitted files into sw.js, minus itself and the source map', () => {
    const { buildId, precache } = finalizeServiceWorker(dir)
    expect(precache).toEqual(['./', 'assets/index-abc.js', 'icon-192.png', 'index.html'])
    const out = readFileSync(join(dir, 'sw.js'), 'utf8')
    expect(out).toContain(JSON.stringify(buildId))
    expect(out).toContain('"assets/index-abc.js"')
    expect(out).not.toContain('index-abc.js.map')
  })

  it('leaves the per-country holiday files out of the install list, but not out of the build id', () => {
    mkdirSync(join(dir, 'assets', 'holidays'))
    writeFileSync(join(dir, 'assets', 'holidays', 'IN-abc.js'), 'india')
    writeFileSync(join(dir, 'assets', 'holidays', 'US-abc.js'), 'usa')
    const first = finalizeServiceWorker(dir)
    expect(first.precache).toEqual(['./', 'assets/index-abc.js', 'icon-192.png', 'index.html'])
    expect(readFileSync(join(dir, 'sw.js'), 'utf8')).not.toContain('holidays/IN-abc.js')

    // New holiday data, even with every other file unchanged, must start a fresh cache.
    writeFileSync(join(dir, 'sw.js'), realSource)
    writeFileSync(join(dir, 'assets', 'holidays', 'IN-abc.js'), 'india, edited')
    expect(finalizeServiceWorker(dir).buildId).not.toBe(first.buildId)
  })

  it('gives a different id after any file changes, so the next deploy refreshes the cache', () => {
    const before = finalizeServiceWorker(dir).buildId
    writeFileSync(join(dir, 'sw.js'), realSource) // a fresh build re-copies the placeholder worker
    writeFileSync(join(dir, 'icon-192.png'), 'a different icon')
    expect(finalizeServiceWorker(dir).buildId).not.toBe(before)
  })

  it('gives the same id for an identical site (reproducible builds)', () => {
    const first = finalizeServiceWorker(dir).buildId
    writeFileSync(join(dir, 'sw.js'), realSource)
    expect(finalizeServiceWorker(dir).buildId).toBe(first)
  })

  it('refuses to finalize twice, which would mean the placeholders were already consumed', () => {
    finalizeServiceWorker(dir)
    expect(() => finalizeServiceWorker(dir)).toThrow(/placeholders/)
  })
})
