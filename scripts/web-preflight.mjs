#!/usr/bin/env node
// Pre-flight for the web app: serve the built site with the headers from vercel.json, then drive
// real Chromium at desktop and phone sizes. Fails (exit 1) on any problem.
//
//   npm run build:web && npm run preflight:web
//   npm run preflight:web -- --clean            rehearse Vercel's install + build from `git archive HEAD`
//                                               (add --keep to keep the temporary copy)
//   npm run preflight:web -- --shots out/shots  also save light/dark screenshots per layout
//   npm run preflight:web -- --serve-only       just serve dist-web with the Vercel headers
//
// Playwright is NOT a project dependency. See .claude/skills/web-preflight/SKILL.md for setup.
import { execSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileRules, headersFor } from './lib/vercel-headers.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const option = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined)

// A host that doesn't know .webmanifest must still get the right type from vercel.json's headers.
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/octet-stream'
}

const PROFILES = [
  { name: 'desktop', mobileUi: false, context: { viewport: { width: 1280, height: 800 } } },
  {
    name: 'phone',
    mobileUi: true,
    context: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }
  }
]

/** Headers every response must carry (presence only — vercel.json.test covers the values). */
const SECURITY_HEADERS = [
  'content-security-policy',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'cross-origin-opener-policy',
  'permissions-policy'
]

function prepareSite() {
  if (!flag('clean')) {
    const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'))
    const dir = resolve(option('dir') ?? join(root, config.outputDirectory))
    if (!existsSync(join(dir, 'index.html'))) {
      console.error(`No built site in ${dir}. Run \`npm run build:web\` first (or pass --clean).`)
      process.exit(2)
    }
    return { config, dir }
  }
  // What Vercel does: a fresh checkout of the committed files, then its install and build commands.
  if (execSync('git status --porcelain', { cwd: root, encoding: 'utf8' }).trim()) {
    console.warn('note: --clean builds the last commit; uncommitted changes are not included.')
  }
  const work = mkdtempSync(join(tmpdir(), 'wtb-preflight-'))
  try {
    execSync(`git archive HEAD | tar -x -C "${work}"`, { cwd: root, stdio: 'inherit' })
    const config = JSON.parse(readFileSync(join(work, 'vercel.json'), 'utf8'))
    for (const command of [config.installCommand, config.buildCommand]) {
      console.log(`[clean copy] ${command}`)
      execSync(command, { cwd: work, stdio: 'inherit' })
    }
    return { config, dir: join(work, config.outputDirectory), work }
  } catch (error) {
    if (!flag('keep')) rmSync(work, { recursive: true, force: true })
    throw error
  }
}

function startServer(dir, config) {
  const rules = compileRules(config.headers ?? [])
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
    const headers = headersFor(rules, pathname)
    const file = resolve(dir, `.${pathname === '/' ? '/index.html' : pathname}`)
    const inside = file === dir || file.startsWith(dir + sep)
    if (!inside || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain', ...headers })
      return res.end('not found')
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', ...headers })
    createReadStream(file).pipe(res)
  })
  return new Promise((done) => {
    server.listen(Number(option('port') ?? 0), '127.0.0.1', () => done({ server, port: server.address().port }))
  })
}

function loadPlaywright() {
  const require = createRequire(import.meta.url)
  const places = [process.env.WTB_PLAYWRIGHT_DIR, root, join(tmpdir(), 'wtb-playwright')].filter(Boolean)
  for (const place of places) {
    for (const name of ['playwright-core', 'playwright']) {
      try {
        return require(require.resolve(name, { paths: [place] }))
      } catch {
        // try the next place
      }
    }
  }
  console.error(
    'Playwright not found. It is not a project dependency; install it outside the repo:\n' +
      `  npm i --no-save --no-audit --no-fund --prefix "${join(tmpdir(), 'wtb-playwright')}" playwright-core\n` +
      '(or point WTB_PLAYWRIGHT_DIR at a folder whose node_modules has it)'
  )
  process.exit(2)
}

function chromiumPath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (base && existsSync(base)) {
    const builds = readdirSync(base).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse()
    for (const build of builds) {
      const candidate = join(base, build, 'chrome-linux', 'chrome')
      if (existsSync(candidate)) return candidate
    }
  }
  return undefined // fall back to the browser Playwright downloaded itself
}

const results = []
const record = (scope, name, ok, detail = '') => results.push({ scope, name, ok, detail })

async function checkHeaders(origin) {
  const index = await (await fetch(`${origin}/`)).text()
  const asset = /assets\/[^"']+\.js/.exec(index)?.[0]
  const paths = ['/', asset && `/${asset}`, '/sw.js', '/manifest.webmanifest', '/does-not-exist'].filter(Boolean)
  for (const path of paths) {
    const response = await fetch(origin + path)
    const missing = SECURITY_HEADERS.filter((name) => !response.headers.get(name))
    record('headers', `${path} carries the security headers`, missing.length === 0, missing.join(', '))
  }
  const get = async (path) => (await fetch(origin + path)).headers
  if (asset) record('headers', 'hashed asset is cached as immutable', (await get(`/${asset}`)).get('cache-control')?.includes('immutable') ?? false)
  record('headers', 'sw.js is never cached', (await get('/sw.js')).get('cache-control') === 'no-cache')
  record('headers', 'manifest has its own media type', (await get('/manifest.webmanifest')).get('content-type') === 'application/manifest+json')
}

const launchBrowser = (chromium) =>
  chromium.launch({ executablePath: chromiumPath(), args: process.getuid?.() === 0 ? ['--no-sandbox'] : [] })

async function checkProfile(chromium, origin, profile, shotsDir) {
  const browser = await launchBrowser(chromium)
  const scope = profile.name
  try {
    const context = await browser.newContext(profile.context)
    const page = await context.newPage()
    const problems = []
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(`console.${m.type()}: ${m.text()}`))
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
    page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()}`))
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        ;(window.__csp = window.__csp ?? []).push(`${e.violatedDirective} blocked ${e.blockedURI}`)
      })
    })

    await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0)
    // Bounded wait: a worker blocked by the CSP never becomes ready, and that must fail, not hang.
    const swReady = await page.evaluate(() =>
      Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 8000))])
    )
    record(scope, 'service worker installs and activates', swReady)
    await page.reload({ waitUntil: 'networkidle' })
    const state = await page.evaluate(async () => {
      const names = await caches.keys()
      const counts = {}
      for (const name of names) counts[name] = (await (await caches.open(name)).keys()).length
      const manifest = await (await fetch(document.querySelector('link[rel=manifest]').href)).json()
      return {
        controlled: Boolean(navigator.serviceWorker.controller),
        counts,
        mobileUi: document.documentElement.classList.contains('is-mobile-ui'),
        csp: window.__csp ?? [],
        manifest
      }
    })

    record(scope, 'renders the app', true)
    record(scope, 'no console errors, failed requests or CSP violations', problems.length + state.csp.length === 0, [...problems, ...state.csp].join(' | '))
    record(scope, 'service worker controls the page after a reload', state.controlled)
    const cacheNames = Object.keys(state.counts)
    record(scope, 'exactly one cache, and it is filled', cacheNames.length === 1 && state.counts[cacheNames[0]] > 0, JSON.stringify(state.counts))
    const icons = state.manifest.icons ?? []
    record(
      scope,
      'manifest is installable (name, standalone, 512 + maskable icons)',
      Boolean(state.manifest.name) &&
        state.manifest.display === 'standalone' &&
        icons.some((i) => i.sizes === '512x512') &&
        icons.some((i) => /maskable/.test(i.purpose ?? ''))
    )
    record(scope, profile.mobileUi ? 'uses the touch layout' : 'uses the desktop layout', state.mobileUi === profile.mobileUi)

    if (shotsDir) {
      mkdirSync(shotsDir, { recursive: true })
      for (const scheme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: scheme })
        await page.waitForTimeout(150)
        await page.screenshot({ path: join(shotsDir, `${profile.name}-${scheme}.png`) })
      }
      await page.emulateMedia({ colorScheme: null })
    }

    await context.setOffline(true)
    let offline = false
    try {
      await page.reload({ waitUntil: 'load' }) // throws when nothing can serve the page offline
      offline = await page.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0, null, { timeout: 8000 }).then(() => true, () => false)
    } catch {
      // offline stays false
    }
    record(scope, 'reloads and renders while offline', offline)
  } finally {
    await browser.close()
  }
}

// Republic Day in India, a Monday, 10:00 in Kolkata (the default home city): a public holiday at home.
const HOLIDAY_MORNING = '2026-01-26T04:30:00Z'

/**
 * Public holidays are one small file per country, fetched when a city in it is on screen. In real
 * Chromium that must work under the site's CSP, be kept by the service worker (so it needs no
 * network next time), and show on the tiles.
 */
async function checkHolidays(chromium, origin, profile, shotsDir) {
  const browser = await launchBrowser(chromium)
  const scope = profile.name
  try {
    const context = await browser.newContext(profile.context)
    await context.clock.setFixedTime(HOLIDAY_MORNING)
    const page = await context.newPage()
    const problems = []
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(`console.${m.type()}: ${m.text()}`))
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
    page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()}`))
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        ;(window.__csp = window.__csp ?? []).push(`${e.violatedDirective} blocked ${e.blockedURI}`)
      })
    })
    const marked = () => page.waitForSelector('.has-holiday', { timeout: 8000 }).then(() => true, () => false)

    // First load installs the worker; the reload is the first one it controls, so its fetches are kept.
    await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
    await page.evaluate(() =>
      Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 8000))])
    )
    await page.reload({ waitUntil: 'networkidle' })
    record(scope, 'public holidays load and mark the day', await marked())
    const csp = await page.evaluate(() => window.__csp ?? [])
    record(scope, 'no console errors, failed requests or CSP violations while loading holidays', problems.length + csp.length === 0, [...problems, ...csp].join(' | '))

    const kept = await page.evaluate(async () => {
      let count = 0
      for (const name of await caches.keys()) {
        for (const request of await (await caches.open(name)).keys()) if (request.url.includes('/assets/holidays/')) count++
      }
      return count
    })
    // The default cities span a handful of countries; precaching every country's file would be hundreds.
    record(scope, 'the service worker keeps the holiday files it was asked for, not all of them', kept >= 1 && kept <= 30, `${kept} in the cache`)

    if (shotsDir) {
      mkdirSync(shotsDir, { recursive: true })
      for (const scheme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: scheme })
        await page.waitForTimeout(150)
        await page.screenshot({ path: join(shotsDir, `${profile.name}-holiday-${scheme}.png`) })
      }
      await page.emulateMedia({ colorScheme: null })
    }

    await context.setOffline(true)
    let offline = false
    try {
      await page.reload({ waitUntil: 'load' })
      offline = await marked()
    } catch {
      // offline stays false
    }
    record(scope, 'public holidays still show while offline', offline)
  } finally {
    await browser.close()
  }
}

const { config, dir, work } = prepareSite()
const cleanUp = () => work && !flag('keep') && rmSync(work, { recursive: true, force: true })
const { server, port } = await startServer(dir, config)
const origin = `http://127.0.0.1:${port}`
console.log(`serving ${dir}\n  at ${origin} with the headers from vercel.json`)

if (flag('serve-only')) {
  console.log('Ctrl+C to stop.')
} else {
  try {
    const { chromium } = loadPlaywright()
    const attempt = async (scope, run) => {
      try {
        await run()
      } catch (error) {
        record(scope, 'checks ran to completion', false, String(error.message).split('\n')[0])
      }
    }
    await attempt('headers', () => checkHeaders(origin))
    for (const profile of PROFILES) {
      await attempt(profile.name, () => checkProfile(chromium, origin, profile, option('shots')))
      await attempt(profile.name, () => checkHolidays(chromium, origin, profile, option('shots')))
    }
  } finally {
    server.close()
    cleanUp()
  }
  const width = Math.max(...results.map((r) => r.name.length))
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.scope.padEnd(8)} ${r.name.padEnd(width)}${r.ok || !r.detail ? '' : `  -> ${r.detail}`}`)
  }
  const failed = results.filter((r) => !r.ok).length
  console.log(failed ? `\n${failed} of ${results.length} checks FAILED` : `\nall ${results.length} checks passed`)
  if (option('shots')) console.log(`screenshots in ${resolve(option('shots'))}`)
  process.exit(failed ? 1 : 0)
}
