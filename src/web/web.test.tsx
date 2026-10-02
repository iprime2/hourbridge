/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WebApp, { DESKTOP_QUERY } from './WebApp'
import InstallPrompt, { DISMISS_KEY, isIos, isStandalone } from './InstallPrompt'
import { registerServiceWorker } from './registerServiceWorker'
import { resolveThemeColor, watchThemeColor } from './themeColor'
import { mockMatchMedia } from './mediaMock'

const DAY = 24 * 60 * 60 * 1000

describe('WebApp: one site, two layouts', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('is-mobile-ui')
    document.documentElement.removeAttribute('data-theme')
  })

  it('uses the desktop grid on a wide screen with a mouse or trackpad', () => {
    mockMatchMedia({ [DESKTOP_QUERY]: true })
    render(<WebApp />)
    expect(document.querySelector('.app-shell')).not.toBeNull()
    expect(document.querySelector('.m-app')).toBeNull()
  })

  it('uses the touch layout on a phone or a touch-first tablet', () => {
    mockMatchMedia({ [DESKTOP_QUERY]: false })
    render(<WebApp />)
    expect(document.querySelector('.m-app')).not.toBeNull()
    expect(document.querySelector('.app-shell')).toBeNull()
  })

  it('defines "desktop" as at least 900px wide AND a fine pointer', () => {
    expect(DESKTOP_QUERY).toBe('(min-width: 900px) and (pointer: fine)')
  })

  it('switches layout live when the window crosses the breakpoint, keeping the user’s cities', async () => {
    const user = userEvent.setup()
    const media = mockMatchMedia({ [DESKTOP_QUERY]: true })
    render(<WebApp />)

    await user.keyboard('{Control>}k{/Control}')
    await user.type(screen.getByLabelText('Search cities'), 'reykjavik')
    await user.keyboard('{Enter}')
    expect(screen.getByLabelText('Reykjavik timezone row')).toBeInTheDocument()

    media.set(DESKTOP_QUERY, false)
    expect(document.querySelector('.m-app')).not.toBeNull()
    expect(screen.getByLabelText('Reykjavik timezone row')).toBeInTheDocument()

    media.set(DESKTOP_QUERY, true)
    expect(document.querySelector('.app-shell')).not.toBeNull()
    expect(screen.getByLabelText('Reykjavik timezone row')).toBeInTheDocument()
  })

  it('scopes the touch layout’s page-level styles to while it is showing', () => {
    const media = mockMatchMedia({ [DESKTOP_QUERY]: false })
    render(<WebApp />)
    expect(document.documentElement.classList.contains('is-mobile-ui')).toBe(true)
    media.set(DESKTOP_QUERY, true)
    expect(document.documentElement.classList.contains('is-mobile-ui')).toBe(false)
  })

  it('stops listening for breakpoint changes when unmounted', () => {
    const media = mockMatchMedia({ [DESKTOP_QUERY]: true })
    const { unmount } = render(<WebApp />)
    expect(media.listenerCount(DESKTOP_QUERY)).toBeGreaterThan(0)
    unmount()
    expect(media.listenerCount(DESKTOP_QUERY)).toBe(0)
  })

  it('has no Widget button in either layout (there is no widget window in a browser)', () => {
    const media = mockMatchMedia({ [DESKTOP_QUERY]: true })
    render(<WebApp />)
    expect(screen.queryByRole('button', { name: /widget/i })).toBeNull()
    media.set(DESKTOP_QUERY, false)
    expect(screen.queryByRole('button', { name: /widget/i })).toBeNull()
  })
})

describe('InstallPrompt', () => {
  const setUserAgent = (ua: string, platform = '', touchPoints = 0) => {
    Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
    Object.defineProperty(navigator, 'platform', { value: platform, configurable: true })
    Object.defineProperty(navigator, 'maxTouchPoints', { value: touchPoints, configurable: true })
  }
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
  const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140 Safari/537.36'

  /** Chromium fires this when the site is installable. */
  const fireInstallEvent = (prompt = vi.fn(async () => undefined)) => {
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void> }
    event.prompt = prompt
    act(() => {
      window.dispatchEvent(event)
    })
    return { event, prompt }
  }

  beforeEach(() => {
    localStorage.clear()
    mockMatchMedia({})
    setUserAgent(DESKTOP_UA)
    delete (navigator as unknown as Record<string, unknown>).standalone
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows nothing unless the browser can actually install the site', () => {
    render(<InstallPrompt />)
    expect(screen.queryByRole('region', { name: /install/i })).toBeNull()
  })

  it('offers a real Install button when the browser signals it can install', async () => {
    const user = userEvent.setup()
    render(<InstallPrompt />)
    const { event, prompt } = fireInstallEvent()
    expect(event.defaultPrevented).toBe(true) // kept for later instead of the browser’s own mini-bar

    const banner = screen.getByRole('region', { name: /install the app/i })
    expect(within(banner).getByText(/install world time buddy/i)).toBeInTheDocument()
    await user.click(within(banner).getByRole('button', { name: 'Install' }))
    expect(prompt).toHaveBeenCalledTimes(1)
    // A captured event can be used once, so the banner goes away afterwards.
    expect(screen.queryByRole('region', { name: /install the app/i })).toBeNull()
  })

  it('remembers "Not now" for 30 days', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<InstallPrompt />)
    fireInstallEvent()
    await user.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('region', { name: /install the app/i })).toBeNull()
    expect(Number(localStorage.getItem(DISMISS_KEY))).toBeGreaterThan(0)

    unmount()
    render(<InstallPrompt />)
    fireInstallEvent()
    expect(screen.queryByRole('region', { name: /install the app/i })).toBeNull()
  })

  it('asks again once the 30 days are up, but not a day before', () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() - 29 * DAY))
    const first = render(<InstallPrompt />)
    fireInstallEvent()
    expect(screen.queryByRole('region', { name: /install the app/i })).toBeNull()
    first.unmount()

    localStorage.setItem(DISMISS_KEY, String(Date.now() - 31 * DAY))
    render(<InstallPrompt />)
    fireInstallEvent()
    expect(screen.getByRole('region', { name: /install the app/i })).toBeInTheDocument()
  })

  it('never shows inside the installed app (display-mode: standalone)', () => {
    mockMatchMedia({ '(display-mode: standalone)': true })
    expect(isStandalone()).toBe(true)
    render(<InstallPrompt />)
    fireInstallEvent()
    expect(screen.queryByRole('region', { name: /install the app/i })).toBeNull()
  })

  it('never shows in an iOS home-screen app (navigator.standalone)', () => {
    setUserAgent(IPHONE)
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
    expect(isStandalone()).toBe(true)
    render(<InstallPrompt />)
    expect(screen.queryByRole('region', { name: /install the app/i })).toBeNull()
  })

  it('tells iPhone users how to install, since iOS has no install button', async () => {
    const user = userEvent.setup()
    setUserAgent(IPHONE)
    render(<InstallPrompt />)
    const banner = screen.getByRole('region', { name: /install the app/i })
    expect(banner).toHaveTextContent(/share.*add to home screen/i)
    expect(within(banner).queryByRole('button', { name: 'Install' })).toBeNull()
    await user.click(within(banner).getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('region', { name: /install the app/i })).toBeNull()
    expect(localStorage.getItem(DISMISS_KEY)).not.toBeNull()
  })

  it('recognizes iPadOS (which claims to be a Mac) by its touch screen, but not a real Mac', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 'MacIntel', 5)
    expect(isIos()).toBe(true)
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 'MacIntel', 0)
    expect(isIos()).toBe(false)
    setUserAgent(DESKTOP_UA)
    expect(isIos()).toBe(false)
  })

  it('hides once the app has been installed', () => {
    render(<InstallPrompt />)
    fireInstallEvent()
    expect(screen.getByRole('region', { name: /install the app/i })).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
    expect(screen.queryByRole('region', { name: /install the app/i })).toBeNull()
  })

  it('still works when storage is blocked', async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(<InstallPrompt />)
    fireInstallEvent()
    await user.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('region', { name: /install the app/i })).toBeNull()
  })

  it('removes its listeners on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<InstallPrompt />)
    unmount()
    const removed = remove.mock.calls.map((c) => c[0])
    expect(removed).toContain('beforeinstallprompt')
    expect(removed).toContain('appinstalled')
  })
})

describe('themeColor', () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta name="theme-color" content="#f4f6fa">'
    document.documentElement.removeAttribute('data-theme')
  })
  const content = () => document.querySelector('meta[name="theme-color"]')!.getAttribute('content')

  it('resolves the colour from the explicit theme first, then the system', () => {
    expect(resolveThemeColor('dark', false)).toBe('#0c111c')
    expect(resolveThemeColor('light', true)).toBe('#f4f6fa')
    expect(resolveThemeColor(undefined, true)).toBe('#0c111c')
    expect(resolveThemeColor(undefined, false)).toBe('#f4f6fa')
  })

  it('tracks the theme the layouts set on <html>, and the system preference', async () => {
    const media = mockMatchMedia({ '(prefers-color-scheme: dark)': false })
    const stop = watchThemeColor()
    expect(content()).toBe('#f4f6fa')

    document.documentElement.setAttribute('data-theme', 'dark')
    await Promise.resolve() // MutationObserver callbacks are microtasks
    await new Promise((r) => setTimeout(r, 0))
    expect(content()).toBe('#0c111c')

    document.documentElement.removeAttribute('data-theme') // back to "system"
    await new Promise((r) => setTimeout(r, 0))
    expect(content()).toBe('#f4f6fa')

    media.set('(prefers-color-scheme: dark)', true)
    expect(content()).toBe('#0c111c')
    stop()
  })

  it('creates the meta tag if the page lacks one', () => {
    document.head.innerHTML = ''
    mockMatchMedia({})
    const stop = watchThemeColor()
    expect(content()).toBe('#f4f6fa')
    stop()
  })

  it('stops updating after cleanup', async () => {
    const media = mockMatchMedia({ '(prefers-color-scheme: dark)': false })
    const stop = watchThemeColor()
    stop()
    document.documentElement.setAttribute('data-theme', 'dark')
    await new Promise((r) => setTimeout(r, 0))
    media.set('(prefers-color-scheme: dark)', true)
    expect(content()).toBe('#f4f6fa')
    expect(media.listenerCount('(prefers-color-scheme: dark)')).toBe(0)
  })
})

describe('registerServiceWorker', () => {
  const setWorker = (value: unknown) =>
    Object.defineProperty(navigator, 'serviceWorker', { value, configurable: true })
  afterEach(() => {
    delete (navigator as unknown as Record<string, unknown>).serviceWorker
  })

  it('registers a relative ./sw.js so the scope follows wherever the site is hosted', async () => {
    const registration = { scope: 'x' }
    const register = vi.fn(async () => registration)
    setWorker({ register })
    expect(await registerServiceWorker({ enabled: true })).toBe(registration)
    expect(register).toHaveBeenCalledWith('./sw.js')
  })

  it('does nothing outside production builds (dev would cache stale modules)', async () => {
    const register = vi.fn()
    setWorker({ register })
    expect(await registerServiceWorker({ enabled: false })).toBeNull()
    expect(register).not.toHaveBeenCalled()
  })

  it('does nothing in browsers without service workers', async () => {
    delete (navigator as unknown as Record<string, unknown>).serviceWorker
    expect(await registerServiceWorker({ enabled: true })).toBeNull()
  })

  it('treats a failed registration as harmless', async () => {
    setWorker({ register: vi.fn(async () => Promise.reject(new Error('insecure context'))) })
    expect(await registerServiceWorker({ enabled: true })).toBeNull()
  })
})
