import { useEffect, useState } from 'react'

/** Chromium's install event, which TypeScript's DOM types don't include. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

export const DISMISS_KEY = 'hb:install-dismissed'
const DISMISS_DAYS = 30

/** Already running as an installed app (home-screen icon, desktop app window)? */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true
}

/** iPhone/iPad Safari has no install event: people must use Share → Add to Home Screen. */
export function isIos(): boolean {
  // iPadOS 13+ reports itself as a Mac, so tell it apart by touch support.
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function recentlyDismissed(now = Date.now()): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY))
    return at > 0 && now - at < DISMISS_DAYS * 24 * 60 * 60 * 1000
  } catch {
    return false
  }
}

function rememberDismissal(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    // Storage blocked: the banner will simply be offered again next visit.
  }
}

/**
 * A small, dismissible nudge to install the site as an app. Shown only where installing is possible
 * and not already done: Chromium browsers (real install button) and iOS (instructions).
 */
export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosHint, setShowIosHint] = useState(false)

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return

    const onPrompt = (event: Event): void => {
      event.preventDefault() // keep it until the person asks, instead of the browser's mini-bar
      setInstallEvent(event as BeforeInstallPromptEvent)
    }
    const onInstalled = (): void => {
      setInstallEvent(null)
      setShowIosHint(false)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    if (isIos()) setShowIosHint(true)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!installEvent && !showIosHint) return null

  const dismiss = (): void => {
    rememberDismissal()
    setInstallEvent(null)
    setShowIosHint(false)
  }

  const install = async (): Promise<void> => {
    if (!installEvent) return
    await installEvent.prompt()
    // The browser only allows each captured event to be used once.
    setInstallEvent(null)
  }

  return (
    <aside className="install-banner" role="region" aria-label="Install the app">
      {installEvent ? (
        <>
          <p className="install-text">
            <strong>Install Hourbridge</strong> for a home-screen icon and offline use.
          </p>
          <div className="install-actions">
            <button type="button" className="btn btn-primary" onClick={() => void install()}>
              Install
            </button>
            <button type="button" className="btn btn-ghost" onClick={dismiss}>
              Not now
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="install-text">
            <strong>Install this app:</strong> tap the Share button, then <em>Add to Home Screen</em>.
          </p>
          <div className="install-actions">
            <button type="button" className="btn btn-ghost" onClick={dismiss}>
              Got it
            </button>
          </div>
        </>
      )}
    </aside>
  )
}
