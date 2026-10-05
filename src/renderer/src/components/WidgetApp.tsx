import { useEffect, useState, type CSSProperties } from 'react'
import {
  loadResolvedState,
  HB_STORAGE_KEY,
  type ResolvedState
} from '@core/persistence'
import { useTheme } from '@core/theme'
import { useHolidayLookup } from '@core/useHolidays'
import { useNow } from '@core/useNow'
import { describeHolidays } from '@core/formatters'
import { buildWidgetRows } from '@core/widgetRows'
import { HolidayIcon } from '@ui/icons'

export default function WidgetApp() {
  const [saved, setSaved] = useState<ResolvedState>(() => loadResolvedState())
  const now = useNow('minute')
  const [alwaysOnTop, setAlwaysOnTop] = useState(true)
  useTheme(saved.theme)
  const holidays = useHolidayLookup(saved.locations)

  // The main window writes to localStorage; other windows receive a `storage` event.
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== HB_STORAGE_KEY) return
      setSaved(loadResolvedState())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    let cancelled = false
    void window.hb?.getAlwaysOnTop?.().then((value) => {
      if (!cancelled && typeof value === 'boolean') setAlwaysOnTop(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const rows = buildWidgetRows(saved.locations, saved.timeFormat, now, saved.workHours, holidays)
  const dragStyle = { WebkitAppRegion: 'drag' } as CSSProperties
  const noDragStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties

  return (
    <div className="widget-shell">
      <header className="widget-chrome" style={dragStyle}>
        <h1 className="widget-title">Hourbridge</h1>
        <div className="widget-chrome-actions" style={noDragStyle}>
          <button
            type="button"
            className="btn btn-tiny"
            aria-pressed={alwaysOnTop}
            aria-label={alwaysOnTop ? 'Disable always on top' : 'Enable always on top'}
            onClick={() => {
              const next = !alwaysOnTop
              setAlwaysOnTop(next)
              void window.hb?.setAlwaysOnTop?.(next)
            }}
          >
            {alwaysOnTop ? 'Pinned' : 'Unpinned'}
          </button>
          <button
            type="button"
            className="btn btn-tiny"
            aria-label="Open main window"
            onClick={() => void window.hb?.focusMain?.()}
          >
            Main
          </button>
          <button
            type="button"
            className="btn btn-tiny"
            aria-label="Close widget"
            onClick={() => void window.hb?.closeWidget?.()}
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
            aria-label={`${row.label} ${row.time}${row.holiday ? `, public holiday: ${row.holiday}` : ''}`}
          >
            <span className={`phase-dot is-${row.phase}`} aria-hidden="true" />
            <span className="widget-label">
              <span className="widget-name">{row.label}</span>
              <span className="widget-sub tabular">
                {row.offset}
                {row.otherDay ? ` · ${row.weekday}` : ''}
              </span>
              {row.holiday ? (
                <span className="widget-holiday" title={describeHolidays([row.holiday])}>
                  <HolidayIcon /> {row.holiday}
                </span>
              ) : null}
            </span>
            <span className="widget-time tabular">{row.time}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
