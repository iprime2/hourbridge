import { useEffect, useState, type CSSProperties } from 'react'
import { DateTime } from 'luxon'
import {
  loadPersistedBuddyState,
  WTB_STORAGE_KEY,
  type PersistedBuddyState
} from '@renderer/lib/persistence'
import { DEFAULT_LOCATIONS } from '@renderer/lib/timezones'
import type { TimeFormat } from '@renderer/lib/timeEngine'
import { buildWidgetRows } from '@renderer/lib/widgetRows'

const TICK_MS = 1000

function readState(): PersistedBuddyState {
  return (
    loadPersistedBuddyState() ?? {
      locations: DEFAULT_LOCATIONS.map((l) => ({ ...l })),
      timeFormat: '12h' as TimeFormat
    }
  )
}

export default function WidgetApp() {
  const [buddy, setBuddy] = useState<PersistedBuddyState>(() => readState())
  const [now, setNow] = useState(() => DateTime.now())
  const [alwaysOnTop, setAlwaysOnTop] = useState(true)

  useEffect(() => {
    const id = window.setInterval(() => setNow(DateTime.now()), TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== WTB_STORAGE_KEY) return
      setBuddy(readState())
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

  const rows = buildWidgetRows(buddy.locations, buddy.timeFormat, now)
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
            className="btn btn-tiny btn-danger"
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
            <span className="widget-offset" title="Offset vs home">
              {row.offset}
            </span>
            <span className="widget-label">
              {row.label}
              {row.isHome ? <span className="home-badge">HOME</span> : null}
            </span>
            <span className="widget-time">{row.time}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
