import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

/** Keep in sync with `HbMenuCommand` in src/renderer/src/env.d.ts. */
type MenuCommand = 'add-location' | 'today' | 'prev-day' | 'next-day' | 'toggle-format'

contextBridge.exposeInMainWorld('hourbridge', {
  platform: process.platform
})

// The whole surface the renderer can reach. Every channel is validated again in the main process.
contextBridge.exposeInMainWorld('hb', {
  openWidget: (): Promise<void> => ipcRenderer.invoke('hb:open-widget'),
  closeWidget: (): Promise<void> => ipcRenderer.invoke('hb:close-widget'),
  focusMain: (): Promise<void> => ipcRenderer.invoke('hb:focus-main'),
  setAlwaysOnTop: (value: boolean): Promise<boolean> =>
    ipcRenderer.invoke('hb:set-always-on-top', value),
  getAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke('hb:get-always-on-top'),
  publishState: (state: unknown): Promise<void> => ipcRenderer.invoke('hb:publish-state', state),
  onMenuCommand: (handler: (command: MenuCommand) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, command: MenuCommand): void => handler(command)
    ipcRenderer.on('hb:menu-command', listener)
    return () => {
      ipcRenderer.removeListener('hb:menu-command', listener)
    }
  }
})
