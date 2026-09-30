import { useEffect, useRef, type ReactNode } from 'react'

interface SheetProps {
  title: string
  onClose: () => void
  children: ReactNode
}

/** A modal bottom sheet: dims the page, closes on backdrop tap or Escape, respects safe areas. */
export default function Sheet({ title, onClose, children }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="m-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="m-sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="m-sheet-grabber" aria-hidden="true" />
        <div className="m-sheet-head">
          <h2 className="m-sheet-title">{title}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="m-sheet-body">{children}</div>
      </div>
    </div>
  )
}
