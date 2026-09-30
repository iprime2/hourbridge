import { useSyncExternalStore } from 'react'
import App from '@renderer/App'
import MobileApp from '@mobile/MobileApp'
import InstallPrompt from './InstallPrompt'

/**
 * The desktop grid needs room and a pointer (hover, drag-to-select, keyboard shortcuts). Anything
 * narrower, or touch-first (phones, and iPads whose primary input is touch), gets the touch layout.
 */
export const DESKTOP_QUERY = '(min-width: 900px) and (pointer: fine)'

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(DESKTOP_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function useDesktopLayout(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true
  )
}

/**
 * One site, two layouts. Both keep their state in the same storage key, so resizing the window or
 * rotating a tablet across the breakpoint carries the cities, home city and settings over.
 */
export default function WebApp() {
  const desktop = useDesktopLayout()
  return (
    <>
      {desktop ? <App /> : <MobileApp />}
      <InstallPrompt />
    </>
  )
}
