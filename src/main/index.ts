import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeTheme,
  screen,
  session,
  shell,
  type BrowserWindowConstructorOptions,
  type IpcMainInvokeEvent
} from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { isSafeExternalUrl, isTrustedSender, parsePublishedState } from './ipcValidation'
import { buildAppMenu, type MenuCommand } from './menu'
import { isOnScreen, sanitizePrefs, type Bounds, type Prefs } from './prefsModel'
import { MenuBarClock } from './tray'

// Helps Electron start under WSL / headless Linux where GPU init often fails.
if (process.platform === 'linux') {
  app.disableHardwareAcceleration()
}

const isMac = process.platform === 'darwin'

let mainWindow: BrowserWindow | null = null
let widgetWindow: BrowserWindow | null = null
let prefs: Prefs = sanitizePrefs(null)

/* —— preferences —— */

const prefsFile = (): string => join(app.getPath('userData'), 'prefs.json')

function loadPrefs(): Prefs {
  try {
    return sanitizePrefs(JSON.parse(readFileSync(prefsFile(), 'utf8')))
  } catch {
    return sanitizePrefs(null)
  }
}

function savePrefs(): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(prefsFile(), JSON.stringify(prefs))
  } catch {
    // Preferences are a convenience; never let a full disk take the app down.
  }
}

function restorableBounds(saved: Bounds | undefined): Bounds | undefined {
  if (!saved) return undefined
  const displays = screen.getAllDisplays().map((d) => d.workArea)
  return isOnScreen(saved, displays) ? saved : undefined
}

/* —— renderer loading & hardening —— */

function loadRenderer(win: BrowserWindow, hash?: string): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void win.loadURL(hash ? `${devUrl}#${hash.replace(/^#/, '')}` : devUrl)
  } else {
    const file = join(__dirname, '../renderer/index.html')
    void win.loadFile(file, hash ? { hash: hash.replace(/^#/, '') } : undefined)
  }
}

const secureWebPreferences: BrowserWindowConstructorOptions['webPreferences'] = {
  preload: join(__dirname, '../preload/index.js'),
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  devTools: !app.isPackaged
}

/** Deny popups and stray navigation; hand off https links to the OS browser. */
function harden(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (isTrustedSender(url, process.env.ELECTRON_RENDERER_URL)) return
    event.preventDefault()
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
  })
}

/** Privileged IPC is for our own renderer only. */
function assertTrusted(event: IpcMainInvokeEvent): void {
  if (!isTrustedSender(event.senderFrame?.url, process.env.ELECTRON_RENDERER_URL)) {
    throw new Error('Untrusted IPC sender')
  }
}

/* —— windows —— */

function createWindow(): BrowserWindow {
  const saved = restorableBounds(prefs.mainBounds)
  const win = new BrowserWindow({
    width: saved?.width ?? 1180,
    height: saved?.height ?? 760,
    x: saved?.x,
    y: saved?.y,
    minWidth: 820,
    minHeight: 520,
    show: false,
    title: 'World Time Buddy',
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 14 } }
      : {}),
    webPreferences: secureWebPreferences
  })
  mainWindow = win

  win.on('ready-to-show', () => win.show())
  win.on('close', () => {
    prefs.mainBounds = win.getNormalBounds()
    savePrefs()
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  harden(win)
  loadRenderer(win)
  return win
}

function createWidgetWindow(): BrowserWindow {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.focus()
    return widgetWindow
  }

  const saved = restorableBounds(prefs.widgetBounds)
  const win = new BrowserWindow({
    width: saved?.width ?? 320,
    height: saved?.height ?? 420,
    x: saved?.x,
    y: saved?.y,
    minWidth: 280,
    minHeight: 200,
    maxWidth: 420,
    show: false,
    frame: false,
    transparent: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: 'World Time Buddy Widget',
    webPreferences: secureWebPreferences
  })
  widgetWindow = win

  if (isMac) {
    // Float above other apps, follow the user across Spaces and over full-screen apps.
    win.setAlwaysOnTop(true, 'floating')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  win.on('ready-to-show', () => win.show())
  win.on('close', () => {
    prefs.widgetBounds = win.getNormalBounds()
    savePrefs()
  })
  win.on('closed', () => {
    if (widgetWindow === win) widgetWindow = null
  })

  harden(win)
  loadRenderer(win, 'widget')
  return win
}

/** Show (creating if needed) the main window, then run `fn` once its page is ready. */
function withMainWindow(fn: (win: BrowserWindow) => void): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    fn(mainWindow)
    return
  }
  const win = createWindow()
  win.webContents.once('did-finish-load', () => fn(win))
}

function sendCommand(command: MenuCommand): void {
  withMainWindow((win) => win.webContents.send('wtb:menu-command', command))
}

function toggleWidget(): void {
  if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.close()
  else createWidgetWindow()
}

/* —— menu bar clock (macOS) —— */

const menuBarClock = new MenuBarClock({
  showMain: () => withMainWindow(() => undefined),
  showWidget: () => void createWidgetWindow(),
  quit: () => app.quit()
})

/* —— IPC —— */

function registerIpc(): void {
  ipcMain.handle('wtb:open-widget', (event) => {
    assertTrusted(event)
    createWidgetWindow()
  })

  ipcMain.handle('wtb:close-widget', (event) => {
    assertTrusted(event)
    if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.close()
  })

  ipcMain.handle('wtb:focus-main', (event) => {
    assertTrusted(event)
    withMainWindow(() => undefined)
  })

  ipcMain.handle('wtb:set-always-on-top', (event, value: unknown) => {
    assertTrusted(event)
    if (typeof value !== 'boolean') throw new TypeError('Expected a boolean')
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.setAlwaysOnTop(value, isMac ? 'floating' : undefined)
    }
    return value
  })

  ipcMain.handle('wtb:get-always-on-top', (event) => {
    assertTrusted(event)
    if (widgetWindow && !widgetWindow.isDestroyed()) return widgetWindow.isAlwaysOnTop()
    return true
  })

  ipcMain.handle('wtb:publish-state', (event, payload: unknown) => {
    assertTrusted(event)
    const state = parsePublishedState(payload)
    if (!state) throw new TypeError('Invalid state payload')
    // Native chrome (title bar, menus, dialogs) follows the in-app theme choice.
    nativeTheme.themeSource = state.theme
    menuBarClock.setState(state)
  })
}

/* —— lifecycle —— */

// One instance only: a second launch just brings the existing window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => withMainWindow(() => undefined))

  void app.whenReady().then(() => {
    prefs = loadPrefs()

    // Nothing in this app needs device permissions; clipboard writes from a click are the exception.
    const allow = (permission: string): boolean => permission === 'clipboard-sanitized-write'
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) =>
      callback(allow(permission))
    )
    session.defaultSession.setPermissionCheckHandler((_contents, permission) => allow(permission))

    app.setAboutPanelOptions({
      applicationName: 'World Time Buddy',
      applicationVersion: app.getVersion(),
      copyright: 'World Time Buddy'
    })

    registerIpc()
    Menu.setApplicationMenu(
      buildAppMenu({
        sendCommand,
        toggleWidget,
        isLoginItem: () => app.getLoginItemSettings().openAtLogin,
        setLoginItem: (open) => app.setLoginItemSettings({ openAtLogin: open }),
        isTrayEnabled: () => prefs.trayEnabled,
        setTrayEnabled: (enabled) => {
          prefs.trayEnabled = enabled
          savePrefs()
          menuBarClock.setEnabled(enabled)
        }
      })
    )
    menuBarClock.setEnabled(prefs.trayEnabled)
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    // macOS apps stay alive in the menu bar / Dock until explicitly quit.
    if (!isMac) app.quit()
  })

  app.on('before-quit', () => menuBarClock.dispose())
}
