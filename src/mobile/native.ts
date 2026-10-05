/**
 * The only module that talks to Capacitor plugins. Everything here degrades to a harmless
 * no-op (or a web fallback) in a plain browser and in tests, so UI code never branches on platform.
 */
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Haptics } from '@capacitor/haptics'
import { Preferences } from '@capacitor/preferences'
import { Share } from '@capacitor/share'
import { StatusBar, Style } from '@capacitor/status-bar'
import { subscribePersist, HB_STORAGE_KEY, type ThemePreference } from '@core/persistence'
import { copyText } from '@ui/browser'

export const isNative = (): boolean => Capacitor.isNativePlatform()

/**
 * WKWebView storage can be evicted under disk pressure. Native Preferences never is, so we
 * mirror every save there and restore from it if the web copy has gone missing.
 */
export async function restoreStateFromNative(): Promise<void> {
  if (!isNative()) return
  try {
    if (localStorage.getItem(HB_STORAGE_KEY)) return
    const { value } = await Preferences.get({ key: HB_STORAGE_KEY })
    if (value) localStorage.setItem(HB_STORAGE_KEY, value)
  } catch {
    // A failed restore just means first-run defaults; never block startup on it.
  }
}

/** Mirror future saves into native Preferences. Returns an unsubscribe function. */
export function mirrorStateToNative(): () => void {
  if (!isNative()) return () => undefined
  return subscribePersist((json) => {
    void Preferences.set({ key: HB_STORAGE_KEY, value: json }).catch(() => undefined)
  })
}

/** A light tick for selection changes (native haptics; a short vibration where browsers allow it). */
export function hapticSelection(): void {
  if (isNative()) {
    void Haptics.selectionChanged().catch(() => undefined)
    return
  }
  try {
    // Android browsers only; iOS Safari has no vibration API, so this is simply skipped there.
    navigator.vibrate?.(8)
  } catch {
    // Vibration can be blocked by permissions policy; it is purely cosmetic.
  }
}

export function prefersDark(theme: ThemePreference): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
}

/** Keep status-bar text legible against the app's own theme (which can differ from the OS). */
export function syncStatusBar(theme: ThemePreference): void {
  if (!isNative()) return
  // Style.Dark = light text, for dark backgrounds.
  void StatusBar.setStyle({ style: prefersDark(theme) ? Style.Dark : Style.Light }).catch(
    () => undefined
  )
}

/**
 * Share a meeting. On iOS this opens the share sheet with the text and the .ics file, so the
 * receiver (or Calendar itself) can add it. In a browser it uses the Web Share API where the
 * platform has one (phones, installed PWAs) and otherwise copies the text.
 * Resolves with a short status message for the UI ("" when there is nothing to say).
 */
export async function shareMeeting(text: string, ics: string, filename: string): Promise<string> {
  if (!isNative()) return shareOnWeb(text, ics, filename)
  try {
    await Filesystem.writeFile({
      path: filename,
      data: ics,
      directory: Directory.Cache,
      encoding: Encoding.UTF8
    })
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache })
    await Share.share({ title: 'Meeting', text, url: uri, dialogTitle: 'Share meeting time' })
    return ''
  } catch (error) {
    // Dismissing the share sheet rejects on some iOS versions; that isn't an error to surface.
    const message = error instanceof Error ? error.message : String(error)
    return /cancel|dismiss/i.test(message) ? '' : 'Could not share'
  }
}

async function shareOnWeb(text: string, ics: string, filename: string): Promise<string> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const data: ShareData = { title: 'Meeting', text }
      // Attach the calendar file when the browser can share files, so "Add to Calendar" appears.
      const file = new File([ics], filename, { type: 'text/calendar' })
      if (navigator.canShare?.({ files: [file] })) data.files = [file]
      await navigator.share(data)
      return ''
    } catch (error) {
      // The person closing the share sheet is not a failure.
      if (error instanceof DOMException && error.name === 'AbortError') return ''
      // Anything else (blocked, unsupported payload): copying is better than failing.
    }
  }
  return (await copyText(text)) ? 'Copied to clipboard' : 'Could not copy'
}
