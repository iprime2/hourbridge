import { useEffect, useMemo, useRef } from 'react'
import { DateTime } from 'luxon'
import LocationRow from '@renderer/components/LocationRow'
import { buildTimelineForLocations } from '@renderer/lib/formatters'
import type { Location } from '@renderer/lib/timezones'
import type { TimeFormat } from '@renderer/lib/timeEngine'
import type { CalendarDate } from '@renderer/hooks/useTimeBuddyState'

interface TimeGridProps {
  locations: readonly Location[]
  homeZone: string
  selectedDate: CalendarDate
  timeFormat: TimeFormat
  activeHour: number | null
  now: DateTime
  onSelectHour: (hour: number | null) => void
  onHoverHour: (hour: number | null) => void
  onNudgeHour: (delta: number) => void
  onRemove: (id: string) => void
  onSetHome: (id: string) => void
}

export default function TimeGrid({
  locations,
  homeZone,
  selectedDate,
  timeFormat,
  activeHour,
  now,
  onSelectHour,
  onHoverHour,
  onNudgeHour,
  onRemove,
  onSetHome
}: TimeGridProps) {
  const gridRef = useRef<HTMLDivElement>(null)

  const columns = useMemo(
    () => buildTimelineForLocations(selectedDate, locations, homeZone),
    [selectedDate, locations, homeZone]
  )

  useEffect(() => {
    const el = gridRef.current
    if (!el) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        onNudgeHour(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        onNudgeHour(1)
      } else if (e.key === 'Escape') {
        onHoverHour(null)
        onSelectHour(null)
      }
    }

    el.addEventListener('keydown', onKeyDown)
    return () => el.removeEventListener('keydown', onKeyDown)
  }, [onNudgeHour, onHoverHour, onSelectHour])

  return (
    <div
      className="time-grid"
      ref={gridRef}
      role="grid"
      aria-label="Timezone comparison grid"
      tabIndex={0}
    >
      <div className="time-grid-header" role="row">
        <div className="location-meta location-meta-header">
          <span className="sr-only">Location</span>
        </div>
        <div className="hour-track hour-track-header" role="rowheader">
          {columns.map((col) => (
            <div
              key={col.homeHour}
              className={['hour-header', activeHour === col.homeHour ? 'is-active' : '']
                .filter(Boolean)
                .join(' ')}
              aria-hidden="true"
            >
              {col.homeHour}
            </div>
          ))}
        </div>
      </div>

      {locations.map((location) => (
        <LocationRow
          key={location.id}
          location={location}
          homeZone={homeZone}
          columns={columns}
          activeHour={activeHour}
          timeFormat={timeFormat}
          now={now}
          onSelectHour={onSelectHour}
          onHoverHour={onHoverHour}
          onRemove={onRemove}
          onSetHome={onSetHome}
        />
      ))}
    </div>
  )
}
