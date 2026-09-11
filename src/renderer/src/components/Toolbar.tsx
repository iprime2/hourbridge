import { DateTime } from 'luxon'
import AddLocation from '@renderer/components/AddLocation'
import type { CityOption } from '@renderer/lib/cityOptions'
import type { TimeFormat } from '@renderer/lib/timeEngine'
import type { CalendarDate } from '@renderer/hooks/useTimeBuddyState'

interface ToolbarProps {
  selectedDate: CalendarDate
  homeZone: string
  timeFormat: TimeFormat
  excludeIds: ReadonlySet<string>
  onShiftDate: (days: number) => void
  onSelectDate: (date: CalendarDate) => void
  onGoToday: () => void
  onToggleFormat: () => void
  onAddLocation: (city: CityOption) => void
  onOpenWidget?: () => void
}

function formatStripLabel(date: CalendarDate, homeZone: string): string {
  return DateTime.fromObject(date, { zone: homeZone }).toFormat('ccc, LLL d')
}

/** Build a small date strip: today −3 … today +3 relative to selected date center. */
function stripDates(selected: CalendarDate, homeZone: string): CalendarDate[] {
  const center = DateTime.fromObject(selected, { zone: homeZone })
  const out: CalendarDate[] = []
  for (let d = -3; d <= 3; d++) {
    const dt = center.plus({ days: d })
    out.push({ year: dt.year, month: dt.month, day: dt.day })
  }
  return out
}

export default function Toolbar({
  selectedDate,
  homeZone,
  timeFormat,
  excludeIds,
  onShiftDate,
  onSelectDate,
  onGoToday,
  onToggleFormat,
  onAddLocation,
  onOpenWidget
}: ToolbarProps) {
  const strip = stripDates(selectedDate, homeZone)
  const today = DateTime.now().setZone(homeZone)

  const handleOpenWidget = (): void => {
    if (onOpenWidget) {
      onOpenWidget()
      return
    }
    void window.wtb?.openWidget?.()
  }

  return (
    <header className="toolbar">
      <div className="toolbar-brand">
        <h1 className="toolbar-title">World Time Buddy</h1>
      </div>

      <div className="date-strip" role="group" aria-label="Comparison date">
        <button
          type="button"
          className="btn btn-icon"
          aria-label="Previous day"
          onClick={() => onShiftDate(-1)}
        >
          ‹
        </button>
        <div className="date-strip-days">
          {strip.map((d) => {
            const isSelected =
              d.year === selectedDate.year &&
              d.month === selectedDate.month &&
              d.day === selectedDate.day
            const isToday =
              d.year === today.year && d.month === today.month && d.day === today.day
            return (
              <button
                key={`${d.year}-${d.month}-${d.day}`}
                type="button"
                className={[
                  'date-chip',
                  isSelected ? 'is-selected' : '',
                  isToday ? 'is-today' : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={formatStripLabel(d, homeZone)}
                aria-pressed={isSelected}
                onClick={() => onSelectDate(d)}
              >
                <span className="date-chip-dow">
                  {DateTime.fromObject(d, { zone: homeZone }).toFormat('ccc')}
                </span>
                <span className="date-chip-day">{d.day}</span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className="btn btn-icon"
          aria-label="Next day"
          onClick={() => onShiftDate(1)}
        >
          ›
        </button>
        <button type="button" className="btn btn-ghost" aria-label="Go to today" onClick={onGoToday}>
          Today
        </button>
      </div>

      <div className="toolbar-actions">
        <AddLocation excludeIds={excludeIds} onAdd={onAddLocation} />
        <button
          type="button"
          className="btn"
          aria-label="Open widget"
          onClick={handleOpenWidget}
        >
          Widget
        </button>
        <button
          type="button"
          className="btn btn-toggle"
          aria-label={
            timeFormat === '12h' ? 'Switch to 24-hour format' : 'Switch to 12-hour format'
          }
          aria-pressed={timeFormat === '24h'}
          onClick={onToggleFormat}
        >
          {timeFormat === '12h' ? '12h' : '24h'}
        </button>
      </div>
    </header>
  )
}
