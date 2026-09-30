import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

/** Keep in sync with `WtbMenuCommand` in src/renderer/src/env.d.ts. */
type MenuCommand = 'add-location' | 'today' | 'prev-day' | 'next-day' | 'toggle-format'

contextBridge.exposeInMainWorld('worldTimeBuddy', {
  platform: process.platform
})

// The whole surface the renderer can reach. Every channel is validated again in the main process.
contextBridge.exposeInMainWorld('wtb', {
  openWidget: (): Promise<void> => ipcRenderer.invoke('wtb:open-widget'),
  closeWidget: (): Promise<void> => ipcRenderer.invoke('wtb:close-widget'),
  focusMain: (): Promise<void> => ipcRenderer.invoke('wtb:focus-main'),
  setAlwaysOnTop: (value: boolean): Promise<boolean> =>
    ipcRenderer.invoke('wtb:set-always-on-top', value),
  getAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke('wtb:get-always-on-top'),
  publishState: (state: unknown): Promise<void> => ipcRenderer.invoke('wtb:publish-state', state),
  onMenuCommand: (handler: (command: MenuCommand) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, command: MenuCommand): void => handler(command)
    ipcRenderer.on('wtb:menu-command', listener)
    return () => {
      ipcRenderer.removeListener('wtb:menu-command', listener)
    }
  }
})
