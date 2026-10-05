// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

// The worker is a classic script that also exports its logic for tests when loaded as CommonJS.
const sw = createRequire(import.meta.url)('./public/sw.js') as {
  CACHE_NAME: string
  CACHE_PREFIX: string
  precacheUrls: (scope: string) => string[]
  strategyFor: (request: Request, scope: string) => string
  onInstall: (caches: FakeCaches, scope: string) => Promise<void>
  onActivate: (caches: FakeCaches) => Promise<void>
  handleFetch: (request: Request, ctx: Ctx) => Promise<Response | undefined>
}

const SCOPE = 'https://app.example/'
const url = (path: string, scope = SCOPE) => new URL(path, scope).href
const get = (path: string, init: RequestInit = {}, scope = SCOPE) => new Request(url(path, scope), init)
const nav = (path = './', scope = SCOPE) => {
  // Request.mode cannot be set to "navigate" by script, so fake just that property.
  const r = new Request(url(path, scope))
  Object.defineProperty(r, 'mode', { value: 'navigate' })
  return r
}

class FakeCache {
  store = new Map<string, Response>()
  constructor(private network: (url: string) => Promise<Response>) {}
  private key(req: Request | string, ignoreSearch = false): string {
    const u = new URL(typeof req === 'string' ? req : req.url)
    if (ignoreSearch) u.search = ''
    return u.href
  }
  async match(req: Request | string, opts?: { ignoreSearch?: boolean }) {
    const wanted = this.key(req, opts?.ignoreSearch)
    for (const [k, v] of this.store) {
      if (this.key(k, opts?.ignoreSearch) === wanted) return v.clone()
    }
    return undefined
  }
  async put(req: Request | string, res: Response) {
    this.store.set(this.key(req), res)
  }
  // Like the real Cache.addAll: fetch everything first, and store nothing if any request fails.
  async addAll(urls: string[]) {
    const responses = await Promise.all(urls.map((u) => this.network(u)))
    responses.forEach((r, i) => {
      if (!r.ok) throw new TypeError(`addAll: ${urls[i]} -> ${r.status}`)
    })
    urls.forEach((u, i) => this.store.set(this.key(u), responses[i]))
  }
}

class FakeCaches {
  caches = new Map<string, FakeCache>()
  constructor(public network: (url: string) => Promise<Response> = async () => new Response('ok')) {}
  async open(name: string) {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache(this.network))
    return this.caches.get(name)!
  }
  async keys() {
    return [...this.caches.keys()]
  }
  async delete(name: string) {
    return this.caches.delete(name)
  }
}

interface Ctx {
  caches: FakeCaches
  scope: string
  fetchFn: (r: Request) => Promise<Response>
  waitUntil: (p: Promise<unknown>) => void
}

function context(network: (r: Request) => Promise<Response>) {
  const pending: Promise<unknown>[] = []
  const ctx: Ctx = {
    caches: new FakeCaches(),
    scope: SCOPE,
    fetchFn: vi.fn(network),
    waitUntil: (p) => void pending.push(p)
  }
  return { ctx, settle: () => Promise.all(pending) }
}
const online = (body = 'net') => async () => new Response(body)
const offline = async () => {
  throw new TypeError('Failed to fetch')
}
const text = async (r: Response | undefined) => (r ? r.text() : undefined)

describe('strategyFor', () => {
  it('handles only same-origin GETs', () => {
    expect(sw.strategyFor(get('assets/a.js', { method: 'POST' }), SCOPE)).toBe('ignore')
    expect(sw.strategyFor(new Request('https://cdn.other/assets/a.js'), SCOPE)).toBe('ignore')
    expect(sw.strategyFor(new Request('http://app.example/x'), SCOPE)).toBe('ignore') // different origin (scheme)
  })

  it('picks a strategy by what is being requested', () => {
    expect(sw.strategyFor(nav(), SCOPE)).toBe('navigation')
    expect(sw.strategyFor(get('assets/index-abc123.js'), SCOPE)).toBe('cache-first')
    expect(sw.strategyFor(get('icon-192.png'), SCOPE)).toBe('stale-while-revalidate')
    expect(sw.strategyFor(get('manifest.webmanifest'), SCOPE)).toBe('stale-while-revalidate')
  })

  it('keeps a holiday file the first time it is fetched (cache-first), though it is not installed up front', () => {
    expect(sw.strategyFor(get('assets/holidays/IN-abc123.js'), SCOPE)).toBe('cache-first')
  })

  it('only treats the assets/ folder as immutable, not look-alikes', () => {
    expect(sw.strategyFor(get('assetsfoo/x.js'), SCOPE)).toBe('stale-while-revalidate')
    expect(sw.strategyFor(get('other/assets/x.js'), SCOPE)).toBe('stale-while-revalidate')
  })

  it('works when the site is served from a sub-path', () => {
    const scope = 'https://user.github.io/time/'
    expect(sw.strategyFor(get('assets/a.js', {}, scope), scope)).toBe('cache-first')
    expect(sw.strategyFor(new Request('https://user.github.io/assets/a.js'), scope)).toBe(
      'stale-while-revalidate'
    )
  })
})

describe('precacheUrls', () => {
  it('drops the unbuilt placeholder (dev/test) so nothing bogus is fetched', () => {
    expect(sw.precacheUrls(SCOPE)).toEqual([])
  })
})

describe('install / activate', () => {
  it('installs nothing to fetch in dev, and does not throw', async () => {
    await expect(sw.onInstall(new FakeCaches(), SCOPE)).resolves.toBeUndefined()
  })

  it('deletes older versions of this app’s cache but leaves other caches alone', async () => {
    const caches = new FakeCaches()
    for (const name of [sw.CACHE_NAME, `${sw.CACHE_PREFIX}old-build`, `${sw.CACHE_PREFIX}older`, 'someone-elses-cache']) {
      await caches.open(name)
    }
    await sw.onActivate(caches)
    expect((await caches.keys()).sort()).toEqual([sw.CACHE_NAME, 'someone-elses-cache'].sort())
  })
})

describe('installing a built site (with a real precache list)', () => {
  // Build a copy of the worker with a filled-in list, exactly as the build step does.
  const source = require_source()
  function require_source() {
    return createRequire(import.meta.url)('node:fs').readFileSync(
      new URL('./public/sw.js', import.meta.url),
      'utf8'
    ) as string
  }
  function load(precache: string[]) {
    const code = source
      .replace("'__BUILD_ID__'", '"testbuild"')
      .replace("['__PRECACHE__']", JSON.stringify(precache))
    const module = { exports: {} as typeof sw }
    new Function('module', 'URL', 'Response', 'Request', code)(module, URL, Response, Request)
    return module.exports
  }

  it('caches every listed file under a cache named after the build', async () => {
    const built = load(['./', 'index.html', 'assets/app-1.js', 'icon-192.png'])
    const caches = new FakeCaches()
    await built.onInstall(caches, SCOPE)
    expect(await caches.keys()).toEqual(['hb-testbuild'])
    const cache = await caches.open('hb-testbuild')
    expect([...cache.store.keys()].sort()).toEqual(
      [SCOPE, url('index.html'), url('assets/app-1.js'), url('icon-192.png')].sort()
    )
  })

  it('fails the install — leaving the previous cache serving — if any file cannot be fetched', async () => {
    const built = load(['./', 'assets/missing.js'])
    const caches = new FakeCaches(async (u) => (u.endsWith('missing.js') ? new Response('', { status: 404 }) : new Response('ok')))
    await expect(built.onInstall(caches, SCOPE)).rejects.toThrow(/404/)
    const cache = await caches.open('hb-testbuild')
    expect(cache.store.size).toBe(0) // all-or-nothing
  })

  it('a new build activates cleanly: its cache stays and the previous build’s is removed', async () => {
    const caches = new FakeCaches()
    await caches.open('hb-previous')
    const built = load(['./'])
    await built.onInstall(caches, SCOPE)
    await built.onActivate(caches)
    expect(await caches.keys()).toEqual(['hb-testbuild'])
  })
})

describe('navigation (pages): network first, cached copy offline', () => {
  it('returns the fresh page when online and keeps it for later', async () => {
    const { ctx, settle } = context(online('<html>new</html>'))
    const res = await sw.handleFetch(nav('./'), ctx)
    expect(await text(res)).toBe('<html>new</html>')
    await settle()
    const cache = await ctx.caches.open(sw.CACHE_NAME)
    expect(await text(await cache.match(url('./')))).toBe('<html>new</html>')
  })

  it('serves the cached page when offline', async () => {
    const { ctx, settle } = context(online('<html>v1</html>'))
    await sw.handleFetch(nav('./'), ctx)
    await settle()
    const off = { ...ctx, fetchFn: vi.fn(offline) }
    expect(await text(await sw.handleFetch(nav('./'), off))).toBe('<html>v1</html>')
  })

  it('serves the app shell for an offline navigation to a URL it never saw (e.g. with a query)', async () => {
    const { ctx, settle } = context(online('<html>shell</html>'))
    await sw.handleFetch(nav('./'), ctx)
    await settle()
    const off = { ...ctx, fetchFn: vi.fn(offline) }
    expect(await text(await sw.handleFetch(nav('./?utm_source=x'), off))).toBe('<html>shell</html>')
  })

  it('does not cache error pages', async () => {
    const { ctx, settle } = context(async () => new Response('nope', { status: 500 }))
    const res = await sw.handleFetch(nav('./'), ctx)
    expect(res?.status).toBe(500) // still shown to the user
    await settle()
    const cache = await ctx.caches.open(sw.CACHE_NAME)
    expect(cache.store.size).toBe(0)
  })

  it('fails honestly when offline with nothing cached', async () => {
    const { ctx } = context(offline)
    await expect(sw.handleFetch(nav('./'), ctx)).rejects.toThrow(/Failed to fetch/)
  })
})

describe('hashed assets: cache first', () => {
  it('serves from cache without touching the network', async () => {
    const { ctx } = context(online('should not be used'))
    const cache = await ctx.caches.open(sw.CACHE_NAME)
    await cache.put(url('assets/app-1.js'), new Response('cached js'))
    expect(await text(await sw.handleFetch(get('assets/app-1.js'), ctx))).toBe('cached js')
    expect(ctx.fetchFn).not.toHaveBeenCalled()
  })

  it('fetches on a miss, stores it, and then serves it offline', async () => {
    const { ctx, settle } = context(online('fresh js'))
    expect(await text(await sw.handleFetch(get('assets/app-2.js'), ctx))).toBe('fresh js')
    await settle()
    const off = { ...ctx, fetchFn: vi.fn(offline) }
    expect(await text(await sw.handleFetch(get('assets/app-2.js'), off))).toBe('fresh js')
    expect(off.fetchFn).not.toHaveBeenCalled()
  })

  it('does not cache a failed response', async () => {
    const { ctx, settle } = context(async () => new Response('', { status: 404 }))
    const res = await sw.handleFetch(get('assets/gone.js'), ctx)
    expect(res?.status).toBe(404)
    await settle()
    expect((await ctx.caches.open(sw.CACHE_NAME)).store.size).toBe(0)
  })
})

describe('other files (icons, manifest): stale while revalidate', () => {
  it('answers from cache immediately and refreshes it in the background', async () => {
    const { ctx, settle } = context(online('new icon'))
    const cache = await ctx.caches.open(sw.CACHE_NAME)
    await cache.put(url('icon-192.png'), new Response('old icon'))
    expect(await text(await sw.handleFetch(get('icon-192.png'), ctx))).toBe('old icon')
    await settle()
    expect(await text(await cache.match(url('icon-192.png')))).toBe('new icon')
  })

  it('uses the network on a miss', async () => {
    const { ctx } = context(online('net icon'))
    expect(await text(await sw.handleFetch(get('icon-512.png'), ctx))).toBe('net icon')
  })

  it('still serves the cached copy when the background refresh fails (offline)', async () => {
    const { ctx, settle } = context(offline)
    const cache = await ctx.caches.open(sw.CACHE_NAME)
    await cache.put(url('manifest.webmanifest'), new Response('{}'))
    expect(await text(await sw.handleFetch(get('manifest.webmanifest'), ctx))).toBe('{}')
    await expect(settle()).resolves.toBeDefined() // the swallowed refresh error must not surface
  })

  it('fails honestly when offline with nothing cached', async () => {
    const { ctx } = context(offline)
    await expect(sw.handleFetch(get('icon-192.png'), ctx)).rejects.toThrow(/Failed to fetch/)
  })
})

describe('requests it must leave alone', () => {
  it('ignores non-GET and cross-origin requests without touching cache or network', async () => {
    const { ctx } = context(online())
    expect(await sw.handleFetch(get('api', { method: 'POST', body: 'x' }), ctx)).toBeUndefined()
    expect(await sw.handleFetch(new Request('https://analytics.example/collect'), ctx)).toBeUndefined()
    expect(ctx.fetchFn).not.toHaveBeenCalled()
    expect(ctx.caches.caches.size).toBe(0)
  })
})
