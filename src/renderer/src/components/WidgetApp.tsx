import { useEffect, useState, type CSSProperties } from 'react'
import {
  loadResolvedBuddyState,
  WTB_STORAGE_KEY,
  type ResolvedBuddyState
} from '@core/persistence'
import { useTheme } from '@core/theme'
import { useNow } from '@core/useNow'
import { buildWidgetRows } from '@core/widgetRows'

export default function WidgetApp() {
  const [buddy, setBuddy] = useState<ResolvedBuddyState>(() => loadResolvedBuddyState())
  const now = useNow('minute')
  const [alwaysOnTop, setAlwaysOnTop] = useState(true)
  useTheme(buddy.theme)

  // The main window writes to localStorage; other windows receive a `storage` event.
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== WTB_STORAGE_KEY) return
      setBuddy(loadResolvedBuddyState())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    let cancelled = false
    void window.wtb?.getAlwaysOnTop?.().then((value) => {
      if (!cancelled && typeof value === 'boolean') setAlwaysOnTop(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const rows = buildWidgetRows(buddy.locations, buddy.timeFormat, now, buddy.workHours)
  const dragStyle = { WebkitAppRegion: 'drag' } as CSSProperties
  const noDragStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties

  return (
    <div className="widget-shell">
      <header className="widget-chrome" style={dragStyle}>
        <h1 className="widget-title">World Time Buddy</h1>
        <div className="widget-chrome-actions" style={noDragStyle}>
          <button
            type="button"
            className="btn btn-tiny"
            aria-pressed={alwaysOnTop}
            aria-label={alwaysOnTop ? 'Disable always on top' : 'Enable always on top'}
            onClick={() => {
              const next = !alwaysOnTop
              setAlwaysOnTop(next)
              void window.wtb?.setAlwaysOnTop?.(next)
            }}
          >
            {alwaysOnTop ? 'Pinned' : 'Unpinned'}
          </button>
          <button
            type="button"
            className="btn btn-tiny"
            aria-label="Open main window"
            onClick={() => void window.wtb?.focusMain?.()}
          >
            Main
          </button>
          <button
            type="button"
            className="btn btn-tiny"
            aria-label="Close widget"
            onClick={() => void window.wtb?.closeWidget?.()}
          >
            ×
          </button>
        </div>
      </header>

      <ul className="widget-list" aria-label="Current local times">
        {rows.map((row) => (
          <li
            key={row.id}
            className={['widget-row', row.isHome ? 'is-home' : ''].filter(Boolean).join(' ')}
            aria-label={`${row.label} ${row.time}`}
          >
            <span className={`phase-dot is-${row.phase}`} aria-hidden="true" />
            <span className="widget-label">
              <span className="widget-name">{row.label}</span>
              <span className="widget-sub tabular">
                {row.offset}
                {row.otherDay ? ` · ${row.weekday}` : ''}
              </span>
            </span>
            <span className="widget-time tabular">{row.time}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
