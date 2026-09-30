import { DateTime } from 'luxon'
import AddLocation from '@renderer/components/AddLocation'
import SettingsMenu from '@renderer/components/SettingsMenu'
import Logo from '@ui/Logo'
import type { CityOption } from '@core/cityOptions'
import type { ThemePreference } from '@core/persistence'
import type { TimeFormat, WorkHours } from '@core/timeEngine'
import type { CalendarDate } from '@core/useTimeBuddyState'

interface ToolbarProps {
  selectedDate: CalendarDate
  homeZone: string
  /** Display name of the home city (for the working-hours setting). */
  homeLabel?: string
  timeFormat: TimeFormat
  theme: ThemePreference
  workHours: WorkHours
  excludeIds: ReadonlySet<string>
  existingZones?: ReadonlySet<string>
  now: DateTime
  addOpen?: boolean
  onAddOpenChange?: (open: boolean) => void
  onShiftDate: (days: number) => void
  onSelectDate: (date: CalendarDate) => void
  onGoToday: () => void
  onToggleFormat: () => void
  onTheme: (theme: ThemePreference) => void
  onTimeFormat: (format: TimeFormat) => void
  onWorkHours: (hours: WorkHours) => void
  onSortByOffset: () => void
  onAddLocation: (city: CityOption) => void
  onOpenWidget?: () => void
}

function formatStripLabel(date: CalendarDate, homeZone: string): string {
  return DateTime.fromObject(date, { zone: homeZone }).toFormat('ccc, LLL d')
}

/** A small date strip: selected date ±3 days, in the home zone. */
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
  homeLabel,
  timeFormat,
  theme,
  workHours,
  excludeIds,
  existingZones,
  now,
  addOpen,
  onAddOpenChange,
  onShiftDate,
  onSelectDate,
  onGoToday,
  onToggleFormat,
  onTheme,
  onTimeFormat,
  onWorkHours,
  onSortByOffset,
  onAddLocation,
  onOpenWidget
}: ToolbarProps) {
  const strip = stripDates(selectedDate, homeZone)
  const today = now.setZone(homeZone)
  const center = DateTime.fromObject(selectedDate, { zone: homeZone })

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
        <Logo size={28} />
        <h1 className="toolbar-title">World Time Buddy</h1>
      </div>

      <div className="date-strip" role="group" aria-label="Comparison date">
        <button
          type="button"
          className="btn btn-icon btn-ghost"
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
          className="btn btn-icon btn-ghost"
          aria-label="Next day"
          onClick={() => onShiftDate(1)}
        >
          ›
        </button>
        <button type="button" className="btn" aria-label="Go to today" onClick={onGoToday}>
          Today
        </button>
        <span className="date-month" aria-hidden="true">
          {center.toFormat('LLLL yyyy')}
        </span>
      </div>

      <div className="toolbar-actions">
        <AddLocation
          excludeIds={excludeIds}
          existingZones={existingZones}
          timeFormat={timeFormat}
          now={now}
          open={addOpen}
          onOpenChange={onAddOpenChange}
          onAdd={onAddLocation}
        />
        <button type="button" className="btn" aria-label="Open widget" onClick={handleOpenWidget}>
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
        <SettingsMenu
          theme={theme}
          timeFormat={timeFormat}
          workHours={workHours}
          homeLabel={homeLabel}
          onTheme={onTheme}
          onTimeFormat={onTimeFormat}
          onWorkHours={onWorkHours}
          onSortByOffset={onSortByOffset}
        />
      </div>
    </header>
  )
}
