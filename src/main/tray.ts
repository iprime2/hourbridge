import { Menu, Tray, nativeImage } from 'electron'
import { DateTime } from 'luxon'
import { msUntilNextMinute, trayMenuLines, trayTitle, type TrayState } from './trayModel'

interface MenuBarHandlers {
  showMain: () => void
  showWidget: () => void
  quit: () => void
}

/**
 * macOS menu-bar clock: the home city's time as text next to (no) icon, with a dropdown
 * listing every location. Text-only avoids shipping a template image and stays crisp in
 * light/dark menu bars. No-op on other platforms.
 */
export class MenuBarClock {
  private tray: Tray | null = null
  private timer: NodeJS.Timeout | null = null
  private state: TrayState | null = null

  constructor(private readonly handlers: MenuBarHandlers) {}

  setState(state: TrayState): void {
    this.state = state
    this.refresh()
  }

  setEnabled(enabled: boolean): void {
    if (process.platform !== 'darwin') return
    if (enabled && !this.tray) {
      this.tray = new Tray(nativeImage.createEmpty())
      this.tray.setToolTip('Hourbridge')
      this.refresh()
      this.schedule()
    } else if (!enabled && this.tray) {
      this.dispose()
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.tray?.destroy()
    this.tray = null
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.refresh()
      this.schedule()
    }, msUntilNextMinute(Date.now()))
  }

  private refresh(): void {
    if (!this.tray) return
    const now = DateTime.now()
    this.tray.setTitle(trayTitle(this.state, now), { fontType: 'monospacedDigit' })

    const lines = trayMenuLines(this.state, now)
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        ...lines.map((label) => ({ label, enabled: false })),
        ...(lines.length ? [{ type: 'separator' as const }] : []),
        { label: 'Open Hourbridge', click: this.handlers.showMain },
        { label: 'Show Widget', click: this.handlers.showWidget },
        { type: 'separator' },
        { label: 'Quit', click: this.handlers.quit }
      ])
    )
  }
}
