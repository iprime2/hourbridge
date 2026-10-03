import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { DateTime } from 'luxon'
import LocationRow, { type RowReorder } from '@renderer/components/LocationRow'
import { buildTimelineForLocations, formatTileTime } from '@core/formatters'
import { rangeContains, type HourRange } from '@core/planner'
import { insertionForPointer, insertionToFinalIndex, isNoopInsertion } from '@core/reorder'
import type { Location } from '@core/timezones'
import {
  DEFAULT_WORK_HOURS,
  type TimeFormat,
  type TimelineColumn,
  type WorkHours
} from '@core/timeEngine'
import type { CalendarDate } from '@core/useTimeBuddyState'

interface TimeGridProps {
  locations: readonly Location[]
  homeZone: string
  selectedDate: CalendarDate
  timeFormat: TimeFormat
  activeHour: number | null
  now: DateTime
  /** Pre-built timeline; the grid builds its own when omitted. */
  columns?: TimelineColumn[]
  selection?: HourRange | null
  workHours?: WorkHours
  onSelectHour: (hour: number | null) => void
  onSelectRange?: (from: number, to: number) => void
  onExtendSelection?: (hour: number) => void
  onResizeSelection?: (delta: number) => void
  onHoverHour: (hour: number | null) => void
  onNudgeHour: (delta: number) => void
  onRemove: (id: string) => void
  onSetHome: (id: string) => void
  onRename?: (id: string, label: string) => void
  onMove?: (id: string, delta: number) => void
  /** Enables drag-and-drop (and ↑ ↓ on the handle): move `id` so it ends at `toIndex`. */
  onReorder?: (id: string, toIndex: number) => void
}

export default function TimeGrid({
  locations,
  homeZone,
  selectedDate,
  timeFormat,
  activeHour,
  now,
  columns: providedColumns,
  selection = null,
  workHours = DEFAULT_WORK_HOURS,
  onSelectHour,
  onSelectRange,
  onExtendSelection,
  onResizeSelection,
  onHoverHour,
  onNudgeHour,
  onRemove,
  onSetHome,
  onRename,
  onMove,
  onReorder
}: TimeGridProps) {
  const gridRef = useRef<HTMLDivElement>(null)

  const built = useMemo(
    () => (providedColumns ? null : buildTimelineForLocations(selectedDate, locations, homeZone)),
    [providedColumns, selectedDate, locations, homeZone]
  )
  const columns = providedColumns ?? built ?? []

  const homeLabel = locations.find((l) => l.isHome)?.label ?? homeZone

  /* —— drag-and-drop row reordering —— */

  // The ref is what handlers read (always current); the state only drives the visuals.
  const dragIdRef = useRef<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [insertion, setInsertion] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const pendingFocus = useRef<string | null>(null)

  const indexOfId = (id: string): number => locations.findIndex((l) => l.id === id)

  function announceMove(id: string, toIndex: number): void {
    const label = locations.find((l) => l.id === id)?.label ?? ''
    setAnnouncement(`${label} moved to position ${toIndex + 1} of ${locations.length}`)
  }

  function finishDrag(): void {
    dragIdRef.current = null
    setDragId(null)
    setInsertion(null)
  }

  function startDrag(id: string, e: DragEvent<HTMLElement>): void {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    dragIdRef.current = id
    const meta = (e.currentTarget as HTMLElement).closest('.location-meta') as HTMLElement | null
    if (meta) {
      // Use the label cell as the drag image, without its hover overlay hiding the city name.
      meta.classList.add('is-drag-ghost')
      const box = meta.getBoundingClientRect()
      e.dataTransfer.setDragImage(meta, e.clientX - box.left, e.clientY - box.top)
      setTimeout(() => meta.classList.remove('is-drag-ghost'), 0)
    }
    // Fade the source row only after the browser has taken its drag-image snapshot.
    setTimeout(() => {
      if (dragIdRef.current === id) setDragId(id)
    }, 0)
  }

  function overRow(index: number, e: DragEvent<HTMLElement>): void {
    if (dragIdRef.current === null) return // some other drag (a file, selected text): not ours
    e.preventDefault() // marks the row as a valid drop target
    e.dataTransfer.dropEffect = 'move'
    const box = e.currentTarget.getBoundingClientRect()
    const gap = insertionForPointer(index, e.clientY, box.top, box.height)
    setInsertion((prev) => (prev === gap ? prev : gap))
  }

  function dropOnRow(index: number, e: DragEvent<HTMLElement>): void {
    const id = dragIdRef.current
    if (id === null) return
    e.preventDefault()
    const box = e.currentTarget.getBoundingClientRect()
    const gap = insertionForPointer(index, e.clientY, box.top, box.height)
    const from = indexOfId(id)
    finishDrag()
    if (from === -1 || isNoopInsertion(from, gap)) return
    const to = insertionToFinalIndex(from, gap)
    onReorder?.(id, to)
    announceMove(id, to)
  }

  function keyMove(id: string, delta: number): void {
    const from = indexOfId(id)
    const to = from + delta
    const label = locations[from]?.label ?? ''
    if (from === -1 || to < 0 || to >= locations.length) {
      setAnnouncement(`${label} is already ${delta < 0 ? 'first' : 'last'}`)
      return
    }
    pendingFocus.current = id // React may re-insert the node; put focus back afterwards
    onReorder?.(id, to)
    announceMove(id, to)
  }

  useLayoutEffect(() => {
    const id = pendingFocus.current
    if (!id) return
    pendingFocus.current = null
    const handles = gridRef.current?.querySelectorAll<HTMLElement>('[data-handle-id]') ?? []
    for (const handle of handles) {
      if (handle.dataset.handleId === id) handle.focus()
    }
  }, [locations])

  /** Which edge of row `index` shows the drop line (a gap g is drawn above row g, or below the last). */
  function dropEdgeFor(index: number): RowReorder['dropEdge'] {
    if (dragId === null || insertion === null) return null
    const from = indexOfId(dragId)
    if (from === -1 || isNoopInsertion(from, insertion)) return null
    if (insertion === index) return 'before'
    if (insertion === locations.length && index === locations.length - 1) return 'after'
    return null
  }

  // Drag-to-select: while the button is held, entering a tile extends from the drag origin.
  const dragOrigin = useRef<number | null>(null)
  useEffect(() => {
    const el = gridRef.current
    if (!el || !onSelectRange) return

    const hourOf = (target: EventTarget | null): number | null => {
      const tile = (target as Element | null)?.closest('[data-hour]') as HTMLElement | null
      return tile ? Number(tile.dataset.hour) : null
    }
    const onDown = (e: MouseEvent): void => {
      if (e.button === 0 && !e.shiftKey) dragOrigin.current = hourOf(e.target)
    }
    const onOver = (e: MouseEvent): void => {
      if (dragOrigin.current === null || e.buttons !== 1) return
      const hour = hourOf(e.target)
      if (hour !== null) onSelectRange(dragOrigin.current, hour)
    }
    const onUp = (): void => {
      dragOrigin.current = null
    }
    el.addEventListener('mousedown', onDown)
    el.addEventListener('mouseover', onOver)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown)
      el.removeEventListener('mouseover', onOver)
      window.removeEventListener('mouseup', onUp)
    }
  }, [onSelectRange])

  useEffect(() => {
    const el = gridRef.current
    if (!el) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const delta = e.key === 'ArrowLeft' ? -1 : 1
        if (e.shiftKey && onResizeSelection) onResizeSelection(delta)
        else onNudgeHour(delta)
      } else if (e.key === 'Escape') {
        onHoverHour(null)
        onSelectHour(null)
      }
    }

    el.addEventListener('keydown', onKeyDown)
    return () => el.removeEventListener('keydown', onKeyDown)
  }, [onNudgeHour, onResizeSelection, onHoverHour, onSelectHour])

  // The "now" line only makes sense when the visible day is today in the home zone.
  const homeNow = now.setZone(homeZone)
  const showNow =
    homeNow.year === selectedDate.year &&
    homeNow.month === selectedDate.month &&
    homeNow.day === selectedDate.day
  const nowPercent = ((homeNow.hour + homeNow.minute / 60) / 24) * 100

  return (
    <>
      <div
        className="time-grid"
        ref={gridRef}
        role="grid"
        aria-label="Timezone comparison grid"
        aria-describedby="grid-help"
        tabIndex={0}
        onDragLeave={(e) => {
          // Chromium and Safari leave `relatedTarget` null on drag events, so it can't tell "moved to
          // a child" from "left the grid". The pointer position can: only clear once it is outside.
          const box = e.currentTarget.getBoundingClientRect()
          const outside =
            e.clientX <= box.left ||
            e.clientX >= box.right ||
            e.clientY <= box.top ||
            e.clientY >= box.bottom
          if (outside) setInsertion(null)
        }}
      >
        <span id="grid-help" className="sr-only">
          Use left and right arrow keys to move the selected hour, shift plus arrows to change its
          length, and Escape to clear.
        </span>

        <div className="time-grid-header" role="row">
          <div className="location-meta-header">
            <span className="sr-only">Location</span>
            <span aria-hidden="true">Hours shown in {homeLabel}</span>
          </div>
          <div className="hour-track hour-track-header" role="rowheader">
            {columns.map((col) => (
              <div
                key={col.homeHour}
                className={[
                  'hour-header',
                  activeHour === col.homeHour ? 'is-hover' : '',
                  rangeContains(selection, col.homeHour) ? 'is-selected' : '',
                  col.transition === 'skipped' ? 'is-skipped' : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-hidden="true"
              >
                {formatTileTime(col.homeHour, 0, timeFormat)}
              </div>
            ))}
            {showNow ? (
              <div className="now-pill-lane" aria-hidden="true">
                <span className="now-pill" style={{ left: `${nowPercent}%` }}>
                  Now
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {locations.map((location, index) => (
          <LocationRow
            key={location.id}
            location={location}
            homeZone={homeZone}
            columns={columns}
            activeHour={activeHour}
            selection={selection}
            workHours={workHours}
            timeFormat={timeFormat}
            now={now}
            isFirst={index === 0}
            isLast={index === locations.length - 1}
            onSelectHour={onSelectHour}
            onSelectRange={onSelectRange}
            onExtendSelection={onExtendSelection}
            onHoverHour={onHoverHour}
            onRemove={onRemove}
            onSetHome={onSetHome}
            onRename={onRename}
            onMove={onMove}
            reorder={
              onReorder
                ? {
                    isDragging: dragId === location.id,
                    dropEdge: dropEdgeFor(index),
                    onDragStart: (e) => startDrag(location.id, e),
                    onDragEnd: finishDrag,
                    onDragOver: (e) => overRow(index, e),
                    onDrop: (e) => dropOnRow(index, e),
                    onKeyMove: (delta) => keyMove(location.id, delta)
                  }
                : undefined
            }
          />
        ))}

        {showNow ? (
          <div className="now-layer" aria-hidden="true">
            <div className="now-line" style={{ left: `${nowPercent}%` }} />
          </div>
        ) : null}
      </div>
      {/* Announces reorders to screen readers (the grid itself must only contain rows). */}
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </>
  )
}
