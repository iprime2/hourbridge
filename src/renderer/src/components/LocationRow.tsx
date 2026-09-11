import type { Location } from '@renderer/lib/timezones'
import type { TimeFormat, TimelineCell, TimelineColumn } from '@renderer/lib/timeEngine'
import { formatLiveClock, formatOffsetHours, formatTileTime } from '@renderer/lib/formatters'
import { getOffsetHoursRelativeToHome } from '@renderer/lib/timeEngine'
import { DateTime } from 'luxon'

interface LocationRowProps {
  location: Location
  homeZone: string
  columns: TimelineColumn[]
  activeHour: number | null
  timeFormat: TimeFormat
  now: DateTime
  onSelectHour: (hour: number | null) => void
  onHoverHour: (hour: number | null) => void
  onRemove: (id: string) => void
  onSetHome: (id: string) => void
}

export default function LocationRow({
  location,
  homeZone,
  columns,
  activeHour,
  timeFormat,
  now,
  onSelectHour,
  onHoverHour,
  onRemove,
  onSetHome
}: LocationRowProps) {
  const offsetLabel = location.isHome
    ? 'home'
    : formatOffsetHours(getOffsetHoursRelativeToHome(now, location.iana, homeZone))

  const live = formatLiveClock(now, location.iana, timeFormat)

  return (
    <div
      className={['location-row', location.isHome ? 'is-home' : ''].filter(Boolean).join(' ')}
      role="row"
      aria-label={`${location.label} timezone row`}
    >
      <div className="location-meta">
        <div className="location-offset" title="Offset relative to home">
          {offsetLabel}
        </div>
        <div className="location-identity">
          <span className="location-label">{location.label}</span>
          {location.isHome ? (
            <span className="home-badge" aria-label="Home timezone">
              HOME
            </span>
          ) : null}
        </div>
        <div className="location-live" aria-live="polite">
          {live}
        </div>
        <div className="location-actions">
          {!location.isHome ? (
            <>
              <button
                type="button"
                className="btn btn-tiny"
                aria-label={`Set ${location.label} as home`}
                onClick={() => onSetHome(location.id)}
              >
                Set home
              </button>
              <button
                type="button"
                className="btn btn-tiny btn-danger"
                aria-label={`Remove ${location.label}`}
                onClick={() => onRemove(location.id)}
              >
                Remove
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="hour-track" role="presentation">
        {columns.map((col) => {
          const cell: TimelineCell | undefined = col.cells[location.iana]
          if (!cell) return null
          const isActive = activeHour === col.homeHour
          const label = formatTileTime(cell.hour, cell.minute, timeFormat)
          return (
            <button
              key={col.homeHour}
              type="button"
              className={[
                'hour-tile',
                cell.period === 'day' ? 'is-day' : 'is-night',
                isActive ? 'is-active' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={`${location.label} ${formatLiveClock(
                col.instant,
                location.iana,
                timeFormat
              )} (home hour ${col.homeHour})`}
              aria-pressed={isActive}
              onClick={() => onSelectHour(col.homeHour)}
              onMouseEnter={() => onHoverHour(col.homeHour)}
              onMouseLeave={() => onHoverHour(null)}
              onFocus={() => onHoverHour(col.homeHour)}
            >
              <span className="hour-tile-time">{label}</span>
              {cell.day !== columns[0]?.cells[location.iana]?.day ? (
                <span className="hour-tile-day">{cell.day}</span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
