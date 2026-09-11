import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'

// Helps Electron start under WSL / headless Linux where GPU init often fails.
if (process.platform === 'linux') {
  app.disableHardwareAcceleration()
}

let mainWindow: BrowserWindow | null = null
let widgetWindow: BrowserWindow | null = null

function rendererUrl(hash?: string): string {
  const base = process.env.ELECTRON_RENDERER_URL
  if (base) {
    return hash ? `${base}${hash.startsWith('#') ? hash : `#${hash}`}` : base
  }
  return ''
}

function loadRenderer(win: BrowserWindow, hash?: string): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(rendererUrl(hash))
  } else {
    const file = join(__dirname, '../renderer/index.html')
    if (hash) {
      win.loadFile(file, { hash: hash.replace(/^#/, '') })
    } else {
      win.loadFile(file)
    }
  }
}

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 800,
    minHeight: 500,
    show: false,
    title: 'World Time Buddy',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadRenderer(mainWindow)
  return mainWindow
}

function createWidgetWindow(): BrowserWindow {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.focus()
    return widgetWindow
  }

  widgetWindow = new BrowserWindow({
    width: 320,
    height: 420,
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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  widgetWindow.on('ready-to-show', () => {
    widgetWindow?.show()
  })

  widgetWindow.on('closed', () => {
    widgetWindow = null
  })

  loadRenderer(widgetWindow, 'widget')
  return widgetWindow
}

function registerIpc(): void {
  ipcMain.handle('wtb:open-widget', () => {
    createWidgetWindow()
  })

  ipcMain.handle('wtb:close-widget', () => {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.close()
    }
  })

  ipcMain.handle('wtb:focus-main', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow()
    } else {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  ipcMain.handle('wtb:set-always-on-top', (_event, value: unknown) => {
    const onTop = Boolean(value)
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.setAlwaysOnTop(onTop)
    }
    return onTop
  })

  ipcMain.handle('wtb:get-always-on-top', () => {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      return widgetWindow.isAlwaysOnTop()
    }
    return true
  })
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
