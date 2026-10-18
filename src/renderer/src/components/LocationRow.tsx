import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { DateTime } from 'luxon'
import type { Location } from '@core/timezones'
import {
  DEFAULT_WORK_HOURS,
  classifyTile,
  type TimeFormat,
  type TimelineCell,
  type TimelineColumn,
  type WorkHours
} from '@core/timeEngine'
import {
  describeHolidays,
  describeHourTransition,
  describeTilePhase,
  formatLiveClock,
  formatOffsetHours,
  formatZoneAbbr,
  tileTimeParts
} from '@core/formatters'
import { getOffsetHoursRelativeToHome } from '@core/timeEngine'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  HolidayIcon,
  HomeIcon,
  IconButton,
  PersonIcon,
  MoonIcon,
  PencilIcon,
  TrashIcon
} from '@ui/icons'
import { describeDstChange, getDstInfo, type DstChange } from '@core/dst'
import { rangeContains, type HourRange } from '@core/planner'
import { describePersonHours, inPersonHours, ownHours, shortName, type PersonHours } from '@core/people'
import PersonEditor from '@ui/PersonEditor'

/** Everything a row needs to take part in drag-and-drop reordering (owned by TimeGrid). */
export interface RowReorder {
  /** This row is the one being dragged. */
  isDragging: boolean
  /** Where the drop indicator line goes on this row while another row is dragged over it. */
  dropEdge: 'before' | 'after' | null
  onDragStart: (e: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onDragOver: (e: DragEvent<HTMLElement>) => void
  onDrop: (e: DragEvent<HTMLElement>) => void
  /** Keyboard alternative: ↑ / ↓ on the focused handle. */
  onKeyMove: (delta: number) => void
}

interface LocationRowProps {
  location: Location
  homeZone: string
  columns: TimelineColumn[]
  activeHour: number | null
  selection?: HourRange | null
  workHours?: WorkHours
  timeFormat: TimeFormat
  now: DateTime
  isFirst?: boolean
  isLast?: boolean
  onSelectHour: (hour: number | null) => void
  onSelectRange?: (from: number, to: number) => void
  onExtendSelection?: (hour: number) => void
  onHoverHour: (hour: number | null) => void
  onRemove: (id: string) => void
  onSetHome: (id: string) => void
  onRename?: (id: string, label: string) => void
  /** Name the person on the row and set their own hours; omit to hide the button. */
  onSetPerson?: (id: string, person: string, hours: PersonHours | null) => void
  onMove?: (id: string, delta: number) => void
  /** Omit to render the row without a drag handle. */
  reorder?: RowReorder
}

/** Only call out a clock change when it is close enough to matter for planning. */
const DST_SOON_DAYS = 45

function isChangeSoon(change: DstChange | null, now: DateTime): boolean {
  return change !== null && change.at.diff(now, 'days').days <= DST_SOON_DAYS
}

export default function LocationRow({
  location,
  homeZone,
  columns,
  activeHour,
  selection = null,
  workHours = DEFAULT_WORK_HOURS,
  timeFormat,
  now,
  isFirst = false,
  isLast = false,
  onSelectHour,
  onSelectRange,
  onExtendSelection,
  onHoverHour,
  onRemove,
  onSetHome,
  onRename,
  onSetPerson,
  onMove,
  reorder
}: LocationRowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(location.label)
  const [personOpen, setPersonOpen] = useState(false)
  const personRef = useRef<HTMLDivElement>(null)
  const personButton = useRef<HTMLButtonElement>(null)
  const hours = ownHours(location)
  const name = shortName(location)

  // The person popover closes on Escape (focus back to its button) or a click elsewhere.
  useEffect(() => {
    if (!personOpen) return
    const onPointerDown = (e: MouseEvent): void => {
      if (!personRef.current?.contains(e.target as Node)) setPersonOpen(false)
    }
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setPersonOpen(false)
        personButton.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [personOpen])

  const local = now.setZone(location.iana)
  const offsetHours = getOffsetHoursRelativeToHome(now, location.iana, homeZone)
  const offsetLabel = location.isHome ? 'home' : formatOffsetHours(offsetHours)
  const live = formatLiveClock(now, location.iana, timeFormat)
  const homeLocal = now.setZone(homeZone)
  const otherDay = !local.hasSame(homeLocal, 'day')

  // Transition search is ~60 zone lookups; the answer only changes day to day.
  const dayKey = now.toISODate()
  const dst = useMemo(() => getDstInfo(location.iana, now), [location.iana, dayKey])
  const dstNote = describeDstChange(dst.nextChange)
  const dstSoon = isChangeSoon(dst.nextChange, now)

  function commitRename(): void {
    setEditing(false)
    if (draft.trim() && draft.trim() !== location.label) onRename?.(location.id, draft)
    else setDraft(location.label)
  }

  function onRenameKey(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') {
      setEditing(false)
      setDraft(location.label)
    }
  }

  return (
    <div
      className={[
        'location-row',
        location.isHome ? 'is-home' : '',
        reorder?.isDragging ? 'is-dragging' : '',
        reorder?.dropEdge ? `drop-${reorder.dropEdge}` : ''
      ]
        .filter(Boolean)
        .join(' ')}
      role="row"
      aria-label={`${location.person ? `${location.person}, ` : ''}${location.label} timezone row`}
      // dragenter too: a fast pointer can enter a row before the next dragover arrives.
      onDragEnter={reorder?.onDragOver}
      onDragOver={reorder?.onDragOver}
      onDrop={reorder?.onDrop}
    >
      <div className={['location-meta', editing ? 'is-editing' : ''].filter(Boolean).join(' ')}>
        {reorder ? (
          // Only the grip is draggable, so dragging across the hour tiles still selects a range.
          <button
            type="button"
            className="drag-handle"
            draggable
            data-handle-id={location.id}
            aria-label={`Reorder ${location.label}`}
            aria-keyshortcuts="ArrowUp ArrowDown"
            title="Drag to reorder — or focus and press ↑ ↓"
            onDragStart={reorder.onDragStart}
            onDragEnd={reorder.onDragEnd}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault()
                reorder.onKeyMove(e.key === 'ArrowUp' ? -1 : 1)
              }
            }}
          >
            <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true" fill="currentColor">
              <circle cx="2.5" cy="3" r="1.5" />
              <circle cx="7.5" cy="3" r="1.5" />
              <circle cx="2.5" cy="8" r="1.5" />
              <circle cx="7.5" cy="8" r="1.5" />
              <circle cx="2.5" cy="13" r="1.5" />
              <circle cx="7.5" cy="13" r="1.5" />
            </svg>
          </button>
        ) : null}
        <div className="location-identity">
          {editing ? (
            <input
              className="location-rename"
              aria-label={`Rename ${location.label}`}
              value={draft}
              maxLength={40}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={onRenameKey}
            />
          ) : (
            <span
              className="location-label"
              title={[
                location.person ? `${location.person}, ${location.label} (${location.iana})` : location.iana,
                hours ? `Their working hours: ${describePersonHours(hours, timeFormat)}` : ''
              ]
                .filter(Boolean)
                .join('\n')}
            >
              {name}
            </span>
          )}
          {location.isHome ? (
            <span className="badge" aria-label="Home timezone">
              Home
            </span>
          ) : null}
          {/* One compact badge; the full sentence ("Clocks go back 1h on Nov 1") is its tooltip. */}
          {dst.inDst || dstSoon ? (
            <span
              className={['badge', 'badge-dst', dstSoon ? 'is-soon' : ''].filter(Boolean).join(' ')}
              title={dstNote ?? 'Daylight saving time'}
              aria-label={
                dst.inDst
                  ? `Daylight saving time${dstSoon && dstNote ? `. ${dstNote}` : ''}`
                  : `Daylight saving change soon. ${dstNote ?? ''}`
              }
            >
              {dst.inDst ? 'DST' : 'DST soon'}
            </span>
          ) : null}
        </div>

        {/* The weekday sits with the clock it qualifies, only when it differs from home's date. */}
        <div className="location-time tabular">
          <span>{live}</span>
          {otherDay ? <span className="location-day">{local.toFormat('ccc')}</span> : null}
        </div>

        <div className="location-sub tabular">
          {location.person ? (
            <>
              <span className="location-city" title={`${location.label} · ${formatZoneAbbr(local)}`}>
                {location.label}
              </span>
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          <span title="Offset relative to home">{offsetLabel}</span>
          {/* With a person's name the city takes this line, so the zone moves to its tooltip. */}
          {location.person ? null : (
            <>
              <span aria-hidden="true">·</span>
              <span>{formatZoneAbbr(local)}</span>
            </>
          )}
        </div>

        {/* Icon buttons sit on the second line, so the name and live clock stay visible on hover. */}
        <div className="location-actions">
          {onMove ? (
            <>
              <IconButton
                label={`Move ${location.label} up`}
                disabled={isFirst}
                onClick={() => onMove(location.id, -1)}
              >
                <ChevronUpIcon />
              </IconButton>
              <IconButton
                label={`Move ${location.label} down`}
                disabled={isLast}
                onClick={() => onMove(location.id, 1)}
              >
                <ChevronDownIcon />
              </IconButton>
            </>
          ) : null}
          {onSetPerson ? (
            <IconButton
              ref={personButton}
              label={location.person ? `Edit ${location.person} (${location.label})` : `Add a person in ${location.label}`}
              aria-haspopup="dialog"
              aria-expanded={personOpen}
              onClick={() => setPersonOpen((v) => !v)}
            >
              <PersonIcon />
            </IconButton>
          ) : null}
          {onRename ? (
            <IconButton
              label={`Rename ${location.label} label`}
              onClick={() => {
                setDraft(location.label)
                setEditing(true)
              }}
            >
              <PencilIcon />
            </IconButton>
          ) : null}
          {!location.isHome ? (
            <>
              <IconButton
                label={`Set ${location.label} as home`}
                onClick={() => onSetHome(location.id)}
              >
                <HomeIcon />
              </IconButton>
              <IconButton
                label={`Remove ${location.label}`}
                danger
                onClick={() => onRemove(location.id)}
              >
                <TrashIcon />
              </IconButton>
            </>
          ) : null}
        </div>
        {/* In a portal: inside the sticky label cell, later rows would paint over it and the grid would clip it. */}
        {personOpen && onSetPerson
          ? createPortal(
              <div className="modal-backdrop">
                <div
                  ref={personRef}
                  className="modal person-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-label={`Person in ${location.label}`}
                >
                  <PersonEditor
                    location={location}
                    timeFormat={timeFormat}
                    autoFocus
                    onSave={(person, nextHours) => {
                      onSetPerson(location.id, person, nextHours)
                      setPersonOpen(false)
                      personButton.current?.focus()
                    }}
                    onCancel={() => {
                      setPersonOpen(false)
                      personButton.current?.focus()
                    }}
                  />
                </div>
              </div>,
              document.body
            )
          : null}
      </div>

      <div className="hour-track" role="presentation">
        {columns.map((col) => {
          const cell: TimelineCell | undefined = col.cells[location.iana]
          if (!cell) return null
          if (col.transition === 'skipped') {
            // The home zone's clocks jump over this hour today: an empty slot, never data.
            const note = describeHourTransition('skipped')
            return (
              <div
                key={col.homeHour}
                className="hour-tile is-skipped"
                role="img"
                aria-label={`${location.label}: ${note}`}
                title={note}
              >
                <span aria-hidden="true">–</span>
              </div>
            )
          }
          const inSelection = rangeContains(selection, col.homeHour)
          const isHovered = activeHour === col.homeHour
          const { phase, asleep } = classifyTile(col, cell, workHours)
          const parts = tileTimeParts(cell.hour, cell.minute, timeFormat)
          const firstDay = columns[0]?.cells[location.iana]?.day
          const holidayNote = cell.holidays ? describeHolidays(cell.holidays) : null
          const tileNotes = [col.transition ? describeHourTransition(col.transition) : null, holidayNote].filter(Boolean)
          const theirHours = hours !== null && inPersonHours(cell, hours)
          return (
            <button
              key={col.homeHour}
              type="button"
              data-hour={col.homeHour}
              className={[
                'hour-tile',
                `is-${phase}`,
                phase === 'work' && asleep ? 'is-asleep' : '',
                holidayNote ? 'has-holiday' : '',
                theirHours ? 'in-their-hours' : '',
                isHovered || inSelection ? 'is-active' : '',
                inSelection ? 'is-selected' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={`${location.label} ${formatLiveClock(
                col.instant,
                location.iana,
                timeFormat
              )} (home hour ${col.homeHour}, ${describeTilePhase(phase, asleep)}${
                theirHours ? `, ${name}’s working hours` : ''
              }${tileNotes.length ? `, ${tileNotes.join(', ')}` : ''})`}
              title={tileNotes.length ? tileNotes.join(' · ') : undefined}
              aria-pressed={inSelection}
              onMouseDown={(e) => {
                if (e.button !== 0) return
                if (e.shiftKey && onExtendSelection) onExtendSelection(col.homeHour)
                else if (onSelectRange) onSelectRange(col.homeHour, col.homeHour)
                else onSelectHour(col.homeHour)
              }}
              // Keyboard activation (Enter/Space) arrives as a click with detail 0.
              onClick={(e) => {
                if (e.detail === 0) onSelectHour(col.homeHour)
              }}
              onMouseEnter={() => onHoverHour(col.homeHour)}
              onMouseLeave={() => onHoverHour(null)}
              onFocus={() => onHoverHour(col.homeHour)}
            >
              {phase === 'work' && asleep ? (
                <span className="tile-moon">
                  <MoonIcon />
                </span>
              ) : null}
              {holidayNote ? (
                <span className="tile-holiday">
                  <HolidayIcon />
                </span>
              ) : null}
              <span className="hour-tile-time">
                {parts.digits}
                {parts.suffix ? <span className="hour-tile-suffix">{parts.suffix}</span> : null}
              </span>
              {cell.day !== firstDay ? (
                <span className="hour-tile-day">
                  {DateTime.fromObject(
                    { year: cell.year, month: cell.month, day: cell.day },
                    { zone: 'utc' }
                  ).toFormat('ccc')}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
