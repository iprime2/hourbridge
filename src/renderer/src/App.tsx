import { useEffect, useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import Toolbar from '@renderer/components/Toolbar'
import TimeGrid from '@renderer/components/TimeGrid'
import { useTimeBuddyState } from '@renderer/hooks/useTimeBuddyState'

const TICK_MS = 30_000

export default function App() {
  const state = useTimeBuddyState()
  const [now, setNow] = useState(() => DateTime.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(DateTime.now()), TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  const excludeIds = useMemo(
    () => new Set(state.locations.map((l) => l.id)),
    [state.locations]
  )

  return (
    <div className="app-shell">
      <Toolbar
        selectedDate={state.selectedDate}
        homeZone={state.home.iana}
        timeFormat={state.timeFormat}
        excludeIds={excludeIds}
        onShiftDate={state.shiftDate}
        onSelectDate={state.setSelectedDate}
        onGoToday={state.goToToday}
        onToggleFormat={() =>
          state.setTimeFormat(state.timeFormat === '12h' ? '24h' : '12h')
        }
        onAddLocation={state.addLocation}
        onOpenWidget={() => void window.wtb?.openWidget?.()}
      />

      <main className="app-main">
        <TimeGrid
          locations={state.locations}
          homeZone={state.home.iana}
          selectedDate={state.selectedDate}
          timeFormat={state.timeFormat}
          activeHour={state.activeHour}
          now={now}
          onSelectHour={state.selectHour}
          onHoverHour={state.hoverHour}
          onNudgeHour={state.nudgeHour}
          onRemove={state.removeLocation}
          onSetHome={state.setHome}
        />
      </main>

      <p className="app-hint">
        Hover or click an hour column to compare across zones. Arrow keys nudge the selection when
        the grid is focused.
      </p>
    </div>
  )
}
