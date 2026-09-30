import { useEffect, useRef, useState } from 'react'
import SettingsPanel from '@ui/SettingsPanel'
import type { ThemePreference } from '@core/persistence'
import type { TimeFormat, WorkHours } from '@core/timeEngine'

interface SettingsMenuProps {
  theme: ThemePreference
  timeFormat: TimeFormat
  workHours: WorkHours
  onTheme: (theme: ThemePreference) => void
  onTimeFormat: (format: TimeFormat) => void
  onWorkHours: (hours: WorkHours) => void
  onSortByOffset: () => void
  homeLabel?: string
}

export default function SettingsMenu(props: SettingsMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="popover-anchor" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-icon"
        aria-label="Settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Settings"
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
          <circle cx="16" cy="7" r="2.2" />
          <circle cx="8" cy="17" r="2.2" />
        </svg>
      </button>
      {open ? (
        <div className="popover" role="dialog" aria-label="Settings">
          <SettingsPanel
            theme={props.theme}
            timeFormat={props.timeFormat}
            workHours={props.workHours}
            homeLabel={props.homeLabel}
            onTheme={props.onTheme}
            onTimeFormat={props.onTimeFormat}
            onWorkHours={props.onWorkHours}
            onSortByOffset={() => {
              props.onSortByOffset()
              setOpen(false)
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
