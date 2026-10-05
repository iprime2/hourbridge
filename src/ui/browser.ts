/** Copy text to the clipboard; resolves false (never throws) when the platform refuses. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the legacy path (e.g. clipboard permission denied in a webview).
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

/** Trigger a browser/Electron download of an in-memory text file. */
export function downloadTextFile(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoke after the click has been handled.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** A filesystem-safe slug for a downloaded file name. */
export function fileSlug(text: string, fallback = 'meeting'): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug || fallback
}

/** "⌘" on Apple platforms, "Ctrl+" elsewhere — for shortcut hints. */
export function modKeyLabel(): string {
  const platform =
    (typeof window !== 'undefined' && window.hourbridge?.platform) ||
    (typeof navigator !== 'undefined' ? navigator.platform : '')
  return /mac|darwin|iphone|ipad/i.test(platform) ? '⌘' : 'Ctrl+'
}

/** True when a key event started in something the user is typing into. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  return (
    el.isContentEditable ||
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT'
  )
}
