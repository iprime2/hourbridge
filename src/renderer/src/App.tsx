import { useEffect, useMemo, useState } from 'react'
import Toolbar from '@renderer/components/Toolbar'
import TimeGrid from '@renderer/components/TimeGrid'
import PlannerBar from '@ui/PlannerBar'
import { HolidayIcon, MoonIcon } from '@ui/icons'
import { isEditableTarget } from '@ui/browser'
import { buildTimelineForLocations } from '@core/formatters'
import { summarizePlanner } from '@core/planner'
import { useTheme } from '@core/theme'
import { useNow } from '@core/useNow'
import { useTimeBuddyState } from '@core/useTimeBuddyState'

export default function App() {
  const state = useTimeBuddyState()
  const now = useNow('minute')
  useTheme(state.theme)

  const [addOpen, setAddOpen] = useState(false)
  const [title, setTitle] = useState('')

  const homeZone = state.home.iana

  const columns = useMemo(
    () => buildTimelineForLocations(state.selectedDate, state.locations, homeZone, state.holidays),
    [state.selectedDate, state.locations, homeZone, state.holidays]
  )
  const summary = useMemo(
    () => summarizePlanner(columns, state.locations, state.workHours),
    [columns, state.locations, state.workHours]
  )

  const excludeIds = state.existingIds
  const existingZones = useMemo(
    () => new Set(state.locations.map((l) => l.iana)),
    [state.locations]
  )

  const { shiftDate, goToToday, setTimeFormat, timeFormat } = state

  // Keyboard shortcuts (ignored while typing): ⌘/Ctrl+K add, T today, [ ] previous/next day.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setAddOpen(true)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isEditableTarget(e.target)) return
      if (e.key === 't' || e.key === 'T') goToToday()
      else if (e.key === '[') shiftDate(-1)
      else if (e.key === ']') shiftDate(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goToToday, shiftDate])

  // Native menu (macOS/Windows) drives the same actions.
  useEffect(() => {
    return window.wtb?.onMenuCommand?.((command) => {
      if (command === 'add-location') setAddOpen(true)
      else if (command === 'today') goToToday()
      else if (command === 'prev-day') shiftDate(-1)
      else if (command === 'next-day') shiftDate(1)
      else if (command === 'toggle-format') setTimeFormat(timeFormat === '12h' ? '24h' : '12h')
    })
  }, [goToToday, shiftDate, setTimeFormat, timeFormat])

  // Keep the menu-bar clock (main process) in sync with what's on screen.
  useEffect(() => {
    // Best effort: the menu-bar clock is a convenience, so a refused payload must not surface
    // as an unhandled rejection in the UI.
    void Promise.resolve(
      window.wtb?.publishState?.({
        locations: state.locations,
        timeFormat: state.timeFormat,
        theme: state.theme
      })
    ).catch(() => undefined)
  }, [state.locations, state.timeFormat, state.theme])

  return (
    <div className="app-shell">
      <Toolbar
        selectedDate={state.selectedDate}
        homeZone={homeZone}
        homeLabel={state.home.label}
        locations={state.locations}
        timeFormat={state.timeFormat}
        theme={state.theme}
        workHours={state.workHours}
        excludeIds={excludeIds}
        existingZones={existingZones}
        now={now}
        addOpen={addOpen}
        onAddOpenChange={setAddOpen}
        onShiftDate={state.shiftDate}
        onSelectDate={state.setSelectedDate}
        onGoToday={state.goToToday}
        onToggleFormat={() =>
          state.setTimeFormat(state.timeFormat === '12h' ? '24h' : '12h')
        }
        onTheme={state.setTheme}
        onTimeFormat={state.setTimeFormat}
        onWorkHours={state.setWorkHours}
        onSortByOffset={state.sortByOffset}
        onAddLocation={state.addLocation}
        onOpenWidget={window.wtb?.openWidget ? () => void window.wtb?.openWidget() : undefined}
      />

      <main className="app-main">
        <TimeGrid
          locations={state.locations}
          homeZone={homeZone}
          selectedDate={state.selectedDate}
          timeFormat={state.timeFormat}
          activeHour={state.activeHour}
          now={now}
          columns={columns}
          selection={state.selection}
          workHours={state.workHours}
          onSelectHour={state.selectHour}
          onSelectRange={state.selectRange}
          onExtendSelection={state.extendSelection}
          onResizeSelection={state.resizeSelection}
          onHoverHour={state.hoverHour}
          onNudgeHour={state.nudgeHour}
          onRemove={state.removeLocation}
          onSetHome={state.setHome}
          onRename={state.renameLocation}
          onMove={state.moveLocation}
          onReorder={state.reorderLocation}
        />
      </main>

      <PlannerBar
        selection={state.selection}
        columns={columns}
        locations={state.locations}
        homeZone={homeZone}
        timeFormat={state.timeFormat}
        workHours={state.workHours}
        summary={summary}
        title={title}
        onTitle={setTitle}
        onSelectRange={state.selectRange}
        onResize={state.resizeSelection}
        onClear={() => state.selectHour(null)}
      />

      <footer className="legend" aria-label="Legend">
        <span className="legend-item">
          <span className="legend-swatch is-work" /> Your working hours
        </span>
        <span className="legend-item">
          <span className="legend-swatch is-awake" /> Awake
        </span>
        <span className="legend-item">
          <span className="legend-swatch is-night" /> Night
        </span>
        <span className="legend-item">
          <MoonIcon size={12} /> Asleep during your hours
        </span>
        <span className="legend-item">
          <HolidayIcon size={12} /> Public holiday
        </span>
        <span className="legend-item legend-keys">
          <kbd className="kbd">T</kbd> today · <kbd className="kbd">[</kbd>
          <kbd className="kbd">]</kbd> change day
        </span>
      </footer>
    </div>
  )
}
