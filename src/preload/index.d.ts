declare global {
  interface Window {
    worldTimeBuddy: {
      platform: NodeJS.Platform
    }
    wtb?: {
      openWidget: () => Promise<void>
      closeWidget: () => Promise<void>
      focusMain: () => Promise<void>
      setAlwaysOnTop: (value: boolean) => Promise<boolean>
      getAlwaysOnTop: () => Promise<boolean>
    }
  }
}

export {}
