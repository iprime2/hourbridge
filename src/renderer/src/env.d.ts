/// <reference types="vite/client" />
/// <reference types="@testing-library/jest-dom" />

interface WtbApi {
  openWidget: () => Promise<void>
  closeWidget: () => Promise<void>
  focusMain: () => Promise<void>
  setAlwaysOnTop: (value: boolean) => Promise<boolean>
  getAlwaysOnTop: () => Promise<boolean>
}

interface Window {
  worldTimeBuddy?: {
    platform: NodeJS.Platform
  }
  wtb?: WtbApi
}
