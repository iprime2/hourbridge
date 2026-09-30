import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron'

export type MenuCommand = 'add-location' | 'today' | 'prev-day' | 'next-day' | 'toggle-format'

export interface MenuActions {
  sendCommand: (command: MenuCommand) => void
  toggleWidget: () => void
  isLoginItem: () => boolean
  setLoginItem: (open: boolean) => void
  isTrayEnabled: () => boolean
  setTrayEnabled: (enabled: boolean) => void
}

const REPO_URL = 'https://github.com/iprime2/world-time-buddy'

/**
 * Native application menu. macOS gets the standard app menu (About / Hide / Quit); every
 * platform gets Edit roles so ⌘C/⌘V work in inputs. Shortcuts avoid bare keys and text-editing
 * chords (⌘←/→) so they never steal keystrokes from the search or rename fields.
 */
export function buildAppMenu(actions: MenuActions): Menu {
  const isMac = process.platform === 'darwin'
  const canLoginItem = isMac || process.platform === 'win32'

  const view: MenuItemConstructorOptions[] = [
    { label: 'Today', accelerator: 'CmdOrCtrl+T', click: () => actions.sendCommand('today') },
    {
      label: 'Previous Day',
      accelerator: 'CmdOrCtrl+[',
      click: () => actions.sendCommand('prev-day')
    },
    { label: 'Next Day', accelerator: 'CmdOrCtrl+]', click: () => actions.sendCommand('next-day') },
    {
      label: 'Switch 12/24-Hour Clock',
      accelerator: 'CmdOrCtrl+Shift+H',
      click: () => actions.sendCommand('toggle-format')
    },
    { type: 'separator' },
    {
      label: 'Show Widget',
      accelerator: 'CmdOrCtrl+Shift+W',
      click: () => actions.toggleWidget()
    },
    { type: 'separator' },
    { role: 'togglefullscreen' }
  ]
  if (!app.isPackaged) {
    view.push({ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' })
  }

  const fileItems: MenuItemConstructorOptions[] = [
    {
      label: 'Add Location…',
      accelerator: 'CmdOrCtrl+K',
      click: () => actions.sendCommand('add-location')
    }
  ]
  if (canLoginItem) {
    fileItems.push(
      { type: 'separator' },
      {
        label: 'Launch at Login',
        type: 'checkbox',
        checked: actions.isLoginItem(),
        click: (item) => actions.setLoginItem(item.checked)
      }
    )
  }
  if (isMac) {
    fileItems.push({
      label: 'Show Time in Menu Bar',
      type: 'checkbox',
      checked: actions.isTrayEnabled(),
      click: (item) => actions.setTrayEnabled(item.checked)
    })
  }
  fileItems.push({ type: 'separator' }, isMac ? { role: 'close' } : { role: 'quit' })

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    { label: 'File', submenu: fileItems },
    { role: 'editMenu' },
    { label: 'View', submenu: view },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [{ label: 'World Time Buddy on GitHub', click: () => void shell.openExternal(REPO_URL) }]
    }
  ]

  return Menu.buildFromTemplate(template)
}
