import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('worldTimeBuddy', {
  platform: process.platform
})

contextBridge.exposeInMainWorld('wtb', {
  openWidget: (): Promise<void> => ipcRenderer.invoke('wtb:open-widget'),
  closeWidget: (): Promise<void> => ipcRenderer.invoke('wtb:close-widget'),
  focusMain: (): Promise<void> => ipcRenderer.invoke('wtb:focus-main'),
  setAlwaysOnTop: (value: boolean): Promise<boolean> =>
    ipcRenderer.invoke('wtb:set-always-on-top', value),
  getAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke('wtb:get-always-on-top')
})
