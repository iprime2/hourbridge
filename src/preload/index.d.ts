type MenuCommand = 'add-location' | 'today' | 'prev-day' | 'next-day' | 'toggle-format'

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
      publishState: (state: unknown) => Promise<void>
      onMenuCommand: (handler: (command: MenuCommand) => void) => () => void
    }
  }
}

export {}
