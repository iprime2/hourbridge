import { useEffect, useRef } from 'react'
import { DateTime } from 'luxon'
import {
  describeHolidays,
  describeHourTransition,
  describeTilePhase,
  formatLiveClock,
  formatOffsetHours,
  formatTileTime,
  formatZoneAbbr,
  tileTimeParts
} from '@core/formatters'
import { HolidayIcon, MoonIcon } from '@ui/icons'
import { rangeContains, type HourRange } from '@core/planner'
import { inPersonHours, ownHours, shortName } from '@core/people'
import {
  classifyTile,
  getOffsetHoursRelativeToHome,
  type TimeFormat,
  type TimelineColumn,
  type WorkHours
} from '@core/timeEngine'
import type { Location } from '@core/timezones'
import type { CalendarDate } from '@core/useHourbridgeState'

interface MobileGridProps {
  locations: readonly Location[]
  homeZone: string
  columns: TimelineColumn[]
  selectedDate: CalendarDate
  selection: HourRange | null
  workHours: WorkHours
  timeFormat: TimeFormat
  now: DateTime
  onSelectHour: (hour: number) => void
  onOpenCity: (id: string) => void
}

/**
 * Spreadsheet-style timeline: one scroll surface, sticky header row and sticky city column,
 * 24 hour tiles per city. Tiles are ≥ 44pt so they are easy to tap.
 */
export default function MobileGrid({
  locations,
  homeZone,
  columns,
  selectedDate,
  selection,
  workHours,
  timeFormat,
  now,
  onSelectHour,
  onOpenCity
}: MobileGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const homeNow = now.setZone(homeZone)
  const showNow =
    homeNow.year === selectedDate.year &&
    homeNow.month === selectedDate.month &&
    homeNow.day === selectedDate.day
  const nowFraction = (homeNow.hour + homeNow.minute / 60) / 24

  // Start with the current hour in view (a couple of columns of context on the left).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const tile = parseFloat(getComputedStyle(el).getPropertyValue('--m-tile')) || 56
    el.scrollLeft = Math.max(0, (showNow ? homeNow.hour - 2 : 8) * tile)
    // Only on first paint and when the visible date changes — not on every clock tick.
  }, [selectedDate.year, selectedDate.month, selectedDate.day])

  const homeLabel = locations.find((l) => l.isHome)?.label ?? homeZone

  return (
    <div className="m-scroll" ref={scrollRef} role="grid" aria-label="Timezone comparison grid">
      <div className="m-table">
        <div className="m-row m-head" role="row">
          <div className="m-corner" role="columnheader">
            Hours in {homeLabel}
          </div>
          {columns.map((col) => (
            <div
              key={col.homeHour}
              className={[
                'm-hour',
                rangeContains(selection, col.homeHour) ? 'is-selected' : '',
                col.transition === 'skipped' ? 'is-skipped' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              role="columnheader"
              aria-hidden="true"
            >
              {formatTileTime(col.homeHour, 0, timeFormat)}
            </div>
          ))}
          {showNow ? (
            // In the sticky header so it stays visible above the rows when scrolling vertically.
            <span
              className="m-now-pill"
              aria-hidden="true"
              style={{ ['--now-frac' as string]: nowFraction }}
            >
              Now
            </span>
          ) : null}
        </div>

        {locations.map((location) => {
          const local = now.setZone(location.iana)
          const offset = location.isHome
            ? 'home'
            : formatOffsetHours(getOffsetHoursRelativeToHome(now, location.iana, homeZone))
          const firstDay = columns[0]?.cells[location.iana]?.day
          const hours = ownHours(location)
          return (
            <div
              key={location.id}
              className={['m-row', location.isHome ? 'is-home' : ''].filter(Boolean).join(' ')}
              role="row"
              aria-label={`${location.person ? `${location.person}, ` : ''}${location.label} timezone row`}
            >
              <button
                type="button"
                className="m-city"
                aria-label={`${location.person ? `${location.person}, ` : ''}${location.label} options`}
                onClick={() => onOpenCity(location.id)}
              >
                <span className="m-city-name">
                  {shortName(location)}
                  {location.isHome ? <span className="badge">Home</span> : null}
                </span>
                <span className="m-city-time tabular">
                  {formatLiveClock(now, location.iana, timeFormat)}
                </span>
                <span className="m-city-sub tabular">
                  {location.person ? `${location.label} · ` : ''}
                  {offset} · {formatZoneAbbr(local)}
                  {!local.hasSame(now.setZone(homeZone), 'day')
                    ? ` · ${local.toFormat('ccc')}`
                    : ''}
                </span>
              </button>

              {columns.map((col) => {
                const cell = col.cells[location.iana]
                if (!cell) return null
                if (col.transition === 'skipped') {
                  // The home zone's clocks jump over this hour today: an empty slot, never data.
                  const note = describeHourTransition('skipped')
                  return (
                    <div
                      key={col.homeHour}
                      className="m-tile is-skipped"
                      role="img"
                      aria-label={`${location.label}: ${note}`}
                    >
                      <span aria-hidden="true">–</span>
                    </div>
                  )
                }
                const { phase, asleep } = classifyTile(col, cell, workHours)
                const selected = rangeContains(selection, col.homeHour)
                const parts = tileTimeParts(cell.hour, cell.minute, timeFormat)
                const holidayNote = cell.holidays ? describeHolidays(cell.holidays) : null
                const tileNotes = [col.transition ? describeHourTransition(col.transition) : null, holidayNote].filter(Boolean)
                const theirHours = hours !== null && inPersonHours(cell, hours)
                return (
                  <button
                    key={col.homeHour}
                    type="button"
                    className={[
                      'm-tile',
                      `is-${phase}`,
                      phase === 'work' && asleep ? 'is-asleep' : '',
                      holidayNote ? 'has-holiday' : '',
                      theirHours ? 'in-their-hours' : '',
                      selected ? 'is-selected' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-pressed={selected}
                    aria-label={`${location.label} ${formatLiveClock(
                      col.instant,
                      location.iana,
                      timeFormat
                    )} (home hour ${col.homeHour}, ${describeTilePhase(phase, asleep)}${
                      theirHours ? `, ${shortName(location)}’s working hours` : ''
                    }${tileNotes.length ? `, ${tileNotes.join(', ')}` : ''})`}
                    onClick={() => onSelectHour(col.homeHour)}
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
                    <span className="m-tile-time">
                      {parts.digits}
                      {parts.suffix ? <span className="m-tile-suffix">{parts.suffix}</span> : null}
                    </span>
                    {cell.day !== firstDay ? (
                      <span className="m-tile-day">
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
          )
        })}

        {showNow ? (
          <div
            className="m-now"
            aria-hidden="true"
            style={{ ['--now-frac' as string]: nowFraction }}
          />
        ) : null}
      </div>
    </div>
  )
}
