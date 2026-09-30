/*
 * World Time Buddy — service worker. Makes the static site work offline and load instantly.
 *
 * Everything the app needs is a static file, so the strategy is simple:
 *   - The build lists every emitted file (PRECACHE) and stamps a hash of them (BUILD_ID). On
 *     install they are cached together under a cache named after that hash, so a new deploy gets a
 *     fresh cache and `activate` deletes the old one — nothing stale can pile up.
 *   - Pages (navigations): network first, so a new deploy shows up on the next visit; cached copy
 *     when offline.
 *   - /assets/*: cache first — the file names contain a content hash, so a cached one never changes.
 *   - Everything else same-origin (icons, manifest): stale-while-revalidate.
 *
 * The two placeholders below are replaced by scripts/lib/sw-build.ts after `vite build`; until then
 * this file is still valid JavaScript (dev server, tests).
 */
'use strict'

const BUILD_ID = '__BUILD_ID__'
const PRECACHE = ['__PRECACHE__']
const CACHE_PREFIX = 'wtb-'
const CACHE_NAME = CACHE_PREFIX + BUILD_ID

/** Absolute URLs of everything to cache on install, resolved against the worker's scope. */
function precacheUrls(scope) {
  return PRECACHE.filter((p) => p !== '__PRECACHE__').map((p) => new URL(p, scope).href)
}

/** Which strategy applies to a request. */
function strategyFor(request, scope) {
  if (request.method !== 'GET') return 'ignore'
  const url = new URL(request.url)
  const base = new URL(scope)
  if (url.origin !== base.origin) return 'ignore' // never touch third-party requests
  if (request.mode === 'navigate') return 'navigation'
  if (url.pathname.startsWith(base.pathname + 'assets/')) return 'cache-first'
  return 'stale-while-revalidate'
}

async function onInstall(caches, scope) {
  const cache = await caches.open(CACHE_NAME)
  // addAll is all-or-nothing: if any file fails, the install fails and the previous worker (and its
  // complete cache) keeps serving, rather than a half-populated cache going live.
  await cache.addAll(precacheUrls(scope))
}

async function onActivate(caches) {
  const names = await caches.keys()
  await Promise.all(
    names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME).map((n) => caches.delete(n))
  )
}

/**
 * Respond to a fetch. `waitUntil` lets background cache refreshes outlive the response.
 * Returns undefined for requests the worker should not handle (the browser then does its normal thing).
 */
async function handleFetch(request, { caches, scope, fetchFn, waitUntil }) {
  const strategy = strategyFor(request, scope)
  if (strategy === 'ignore') return undefined

  const cache = await caches.open(CACHE_NAME)

  if (strategy === 'navigation') {
    try {
      const response = await fetchFn(request)
      if (response && response.ok) waitUntil(cache.put(request, response.clone()))
      return response
    } catch (error) {
      // Offline: any cached copy of this page, else the app shell.
      const cached =
        (await cache.match(request, { ignoreSearch: true })) ||
        (await cache.match(new URL('./', scope).href)) ||
        (await cache.match(new URL('./index.html', scope).href))
      if (cached) return cached
      throw error
    }
  }

  const cached = await cache.match(request)

  if (strategy === 'cache-first') {
    if (cached) return cached
    const response = await fetchFn(request)
    if (response && response.ok) waitUntil(cache.put(request, response.clone()))
    return response
  }

  // stale-while-revalidate
  const refresh = fetchFn(request).then((response) => {
    if (response && response.ok) return cache.put(request, response.clone()).then(() => response)
    return response
  })
  if (cached) {
    waitUntil(refresh.catch(() => undefined)) // refresh quietly; offline failures are fine
    return cached
  }
  return refresh
}

// Wire up the events only inside a real service worker, so tests can load this file.
if (typeof ServiceWorkerGlobalScope !== 'undefined' && self instanceof ServiceWorkerGlobalScope) {
  self.addEventListener('install', (event) => {
    event.waitUntil(onInstall(self.caches, self.registration.scope))
  })
  self.addEventListener('activate', (event) => {
    event.waitUntil(onActivate(self.caches).then(() => self.clients.claim()))
  })
  self.addEventListener('fetch', (event) => {
    const response = handleFetch(event.request, {
      caches: self.caches,
      scope: self.registration.scope,
      fetchFn: (request) => fetch(request),
      waitUntil: (promise) => event.waitUntil(promise)
    })
    // Only claim the request if we have a strategy for it.
    if (strategyFor(event.request, self.registration.scope) !== 'ignore') {
      event.respondWith(response.then((r) => r || fetch(event.request)))
    }
  })
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BUILD_ID, CACHE_NAME, CACHE_PREFIX, precacheUrls, strategyFor, onInstall, onActivate, handleFetch }
}
