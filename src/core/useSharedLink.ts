import { useCallback, useEffect, useState } from 'react'
import { parseShareHash, type SharedLink } from './shareLink'

const read = (): SharedLink =>
  typeof window === 'undefined' ? { status: 'none' } : parseShareHash(window.location.hash)

/**
 * The shared list of cities in the page address (`#share=…`), if there is one. `dismiss` takes the
 * link out of the address bar (so a reload does not ask again) and clears it from view.
 */
export function useSharedLink(): { link: SharedLink; dismiss: () => void } {
  const [link, setLink] = useState<SharedLink>(read)

  useEffect(() => {
    const onChange = (): void => setLink(read())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const dismiss = useCallback(() => {
    try {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    } catch {
      // Some embedded webviews refuse to rewrite the address; the banner still goes away.
    }
    setLink({ status: 'none' })
  }, [])

  return { link, dismiss }
}
