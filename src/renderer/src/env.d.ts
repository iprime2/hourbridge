/// <reference types="vite/client" />
/// <reference types="@testing-library/jest-dom" />

/** Menu actions the native app menu can trigger in the renderer. */
type HbMenuCommand = 'add-location' | 'today' | 'prev-day' | 'next-day' | 'toggle-format'

/** The slice of app state the main process needs (menu-bar clock). */
interface HbPublishedState {
  locations: { id: string; label: string; iana: string; isHome?: boolean }[]
  timeFormat: '12h' | '24h'
  theme: 'system' | 'light' | 'dark'
}

interface HbApi {
  openWidget: () => Promise<void>
  closeWidget: () => Promise<void>
  focusMain: () => Promise<void>
  setAlwaysOnTop: (value: boolean) => Promise<boolean>
  getAlwaysOnTop: () => Promise<boolean>
  publishState?: (state: HbPublishedState) => Promise<void>
  /** Subscribe to native-menu commands; returns an unsubscribe function. */
  onMenuCommand?: (handler: (command: HbMenuCommand) => void) => () => void
}

interface Window {
  hourbridge?: {
    platform: NodeJS.Platform
  }
  hb?: HbApi
}
