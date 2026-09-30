import { useEffect, useRef, useState } from 'react'
import { DateTime } from 'luxon'
import CityPicker from '@ui/CityPicker'
import { modKeyLabel } from '@ui/browser'
import type { CityOption } from '@core/cityOptions'
import type { TimeFormat } from '@core/timeEngine'

interface AddLocationProps {
  excludeIds: ReadonlySet<string>
  existingZones?: ReadonlySet<string>
  timeFormat?: TimeFormat
  now?: DateTime
  onAdd: (city: CityOption) => void
  /** Controlled open state (lets ⌘K open it). Uncontrolled when omitted. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export default function AddLocation({
  excludeIds,
  existingZones,
  timeFormat = '12h',
  now,
  onAdd,
  open: openProp,
  onOpenChange
}: AddLocationProps) {
  const [openInternal, setOpenInternal] = useState(false)
  const open = openProp ?? openInternal
  const setOpen = onOpenChange ?? setOpenInternal
  const triggerRef = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)

  // Return focus to the trigger after the dialog closes.
  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus()
    wasOpen.current = open
  }, [open])

  function handleAdd(city: CityOption): void {
    onAdd(city)
    setOpen(false)
  }

  return (
    <div className="add-location">
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-primary"
        aria-label="Add location"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        + Add location <kbd className="kbd">{modKeyLabel()}K</kbd>
      </button>

      {open ? (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label="Add a location">
            <CityPicker
              excludeIds={excludeIds}
              existingZones={existingZones}
              timeFormat={timeFormat}
              now={now ?? DateTime.now()}
              onPick={handleAdd}
              onEscape={() => setOpen(false)}
            />
            <div className="modal-footer">
              <span className="modal-hint">↑↓ to navigate · Enter to add · Esc to close</span>
              <button
                type="button"
                className="btn btn-ghost"
                aria-label="Close dialog"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
