const COLORS = { light: '#f4f6fa', dark: '#0c111c' } as const // --bg in tokens.css

/** The browser-chrome colour for the current theme: the explicit choice, else the system's. */
export function resolveThemeColor(dataTheme: string | undefined, systemPrefersDark: boolean): string {
  const dark = dataTheme === 'dark' || (dataTheme !== 'light' && systemPrefersDark)
  return dark ? COLORS.dark : COLORS.light
}

/**
 * Keep <meta name="theme-color"> (the tint of the address bar / installed-app title bar) matching the
 * app. The theme lives in each layout's own state, so this watches the `data-theme` attribute they
 * set on <html> instead of reaching into either. Returns a cleanup function.
 */
export function watchThemeColor(doc: Document = document, win: Window = window): () => void {
  let meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = doc.createElement('meta')
    meta.name = 'theme-color'
    doc.head.appendChild(meta)
  }
  const target = meta
  const query = win.matchMedia('(prefers-color-scheme: dark)')
  const update = (): void => {
    target.setAttribute('content', resolveThemeColor(doc.documentElement.dataset.theme, query.matches))
  }

  const observer = new MutationObserver(update)
  observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  query.addEventListener('change', update)
  update()
  return () => {
    observer.disconnect()
    query.removeEventListener('change', update)
  }
}
