import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import CityPicker from '@ui/CityPicker'
import Logo from '@ui/Logo'
import PlannerBar from '@ui/PlannerBar'
import SettingsPanel from '@ui/SettingsPanel'
import UpcomingHolidays from '@ui/UpcomingHolidays'
import MobileGrid from '@mobile/MobileGrid'
import Sheet from '@mobile/Sheet'
import { hapticSelection, shareMeeting, syncStatusBar } from '@mobile/native'
import { buildTimelineForLocations } from '@core/formatters'
import { summarizePlanner } from '@core/planner'
import { useTheme } from '@core/theme'
import { useNow } from '@core/useNow'
import { useHourbridgeState, type CalendarDate } from '@core/useHourbridgeState'

type SheetState = { kind: 'add' } | { kind: 'settings' } | { kind: 'city'; id: string } | null

function dayLabel(date: CalendarDate, zone: string): string {
  return DateTime.fromObject(date, { zone }).toFormat('EEE, LLL d')
}

export default function MobileApp() {
  const state = useHourbridgeState()
  const now = useNow('minute')
  useTheme(state.theme)

  // Lets mobile.css scope its page-level rules to this layout (see the note at the top of it).
  // A layout effect, so the class is in place before the first paint (no flash of unscoped body styles).
  useLayoutEffect(() => {
    document.documentElement.classList.add('is-mobile-ui')
    return () => document.documentElement.classList.remove('is-mobile-ui')
  }, [])

  const [sheet, setSheet] = useState<SheetState>(null)
  const [title, setTitle] = useState('')
  const [toast, setToast] = useState('')

  const homeZone = state.home.iana

  useEffect(() => {
    syncStatusBar(state.theme)
  }, [state.theme])

  const columns = useMemo(
    () => buildTimelineForLocations(state.selectedDate, state.locations, homeZone, state.holidays),
    [state.selectedDate, state.locations, homeZone, state.holidays]
  )
  const summary = useMemo(
    () => summarizePlanner(columns, state.locations, state.workHours),
    [columns, state.locations, state.workHours]
  )
  const existingZones = useMemo(() => new Set(state.locations.map((l) => l.iana)), [state.locations])

  const { selectHour } = state
  const onSelectHour = useCallback(
    (hour: number) => {
      hapticSelection()
      selectHour(hour)
    },
    [selectHour]
  )

  const closeSheet = useCallback(() => setSheet(null), [])

  const today = now.setZone(homeZone)
  const isToday =
    state.selectedDate.year === today.year &&
    state.selectedDate.month === today.month &&
    state.selectedDate.day === today.day

  async function onShare(text: string, ics: string, filename: string): Promise<void> {
    const message = await shareMeeting(text, ics, filename)
    if (message) {
      setToast(message)
      window.setTimeout(() => setToast(''), 2500)
    }
  }

  const activeCity =
    sheet?.kind === 'city' ? state.locations.find((l) => l.id === sheet.id) ?? null : null

  return (
    <div className="m-app">
      <header className="m-header">
        <div className="m-brand">
          <Logo size={28} />
          <h1 className="m-title">Hourbridge</h1>
        </div>
        <div className="m-header-actions">
          <button
            type="button"
            className="btn btn-icon"
            aria-label="Add location"
            onClick={() => setSheet({ kind: 'add' })}
          >
            +
          </button>
          <button
            type="button"
            className="btn btn-icon"
            aria-label="Settings"
            onClick={() => setSheet({ kind: 'settings' })}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
              <circle cx="16" cy="7" r="2.2" />
              <circle cx="8" cy="17" r="2.2" />
            </svg>
          </button>
        </div>
      </header>

      <div className="m-datebar" role="group" aria-label="Comparison date">
        <button
          type="button"
          className="btn btn-icon btn-ghost"
          aria-label="Previous day"
          onClick={() => state.shiftDate(-1)}
        >
          ‹
        </button>
        <span className="m-date" aria-live="polite">
          {dayLabel(state.selectedDate, homeZone)}
        </span>
        <button
          type="button"
          className="btn btn-icon btn-ghost"
          aria-label="Next day"
          onClick={() => state.shiftDate(1)}
        >
          ›
        </button>
        <button
          type="button"
          className="btn"
          aria-label="Go to today"
          disabled={isToday}
          onClick={state.goToToday}
        >
          Today
        </button>
      </div>

      <main className="m-main">
        <MobileGrid
          locations={state.locations}
          homeZone={homeZone}
          columns={columns}
          selectedDate={state.selectedDate}
          selection={state.selection}
          workHours={state.workHours}
          timeFormat={state.timeFormat}
          now={now}
          onSelectHour={onSelectHour}
          onOpenCity={(id) => setSheet({ kind: 'city', id })}
        />
      </main>

      <div className="m-planner">
        <PlannerBar
          meeting={state.meeting}
          columns={columns}
          locations={state.locations}
          homeZone={homeZone}
          timeFormat={state.timeFormat}
          workHours={state.workHours}
          summary={summary}
          title={title}
          hint="Tap an hour to plan a meeting."
          onTitle={setTitle}
          onSelectRange={state.selectRange}
          onResize={state.resizeSelection}
          onStartMinute={state.setMeetingStart}
          onClear={() => state.selectHour(null)}
          onShare={(text, ics, filename) => void onShare(text, ics, filename)}
        />
        <UpcomingHolidays locations={state.locations} from={state.selectedDate} now={now} />
      </div>

      {toast ? (
        <div className="m-toast" role="status">
          {toast}
        </div>
      ) : null}

      {sheet?.kind === 'add' ? (
        <Sheet title="Add a location" onClose={closeSheet}>
          <CityPicker
            excludeIds={state.existingIds}
            existingZones={existingZones}
            timeFormat={state.timeFormat}
            now={now}
            autoFocus={false}
            onPick={(city) => {
              state.addLocation(city)
              closeSheet()
            }}
            onEscape={closeSheet}
          />
        </Sheet>
      ) : null}

      {sheet?.kind === 'settings' ? (
        <Sheet title="Settings" onClose={closeSheet}>
          <SettingsPanel
            theme={state.theme}
            timeFormat={state.timeFormat}
            workHours={state.workHours}
            homeLabel={state.home.label}
            locations={state.locations}
            onTheme={state.setTheme}
            onTimeFormat={state.setTimeFormat}
            onWorkHours={state.setWorkHours}
            onSortByOffset={() => {
              state.sortByOffset()
              closeSheet()
            }}
          />
        </Sheet>
      ) : null}

      {activeCity ? (
        <CitySheet
          key={activeCity.id}
          label={activeCity.label}
          isHome={Boolean(activeCity.isHome)}
          isFirst={state.locations[0]?.id === activeCity.id}
          isLast={state.locations[state.locations.length - 1]?.id === activeCity.id}
          onClose={closeSheet}
          onRename={(label) => state.renameLocation(activeCity.id, label)}
          onSetHome={() => {
            state.setHome(activeCity.id)
            closeSheet()
          }}
          onMove={(delta) => state.moveLocation(activeCity.id, delta)}
          onRemove={() => {
            state.removeLocation(activeCity.id)
            closeSheet()
          }}
        />
      ) : null}
    </div>
  )
}

interface CitySheetProps {
  label: string
  isHome: boolean
  isFirst: boolean
  isLast: boolean
  onClose: () => void
  onRename: (label: string) => void
  onSetHome: () => void
  onMove: (delta: number) => void
  onRemove: () => void
}

function CitySheet({
  label,
  isHome,
  isFirst,
  isLast,
  onClose,
  onRename,
  onSetHome,
  onMove,
  onRemove
}: CitySheetProps) {
  const [draft, setDraft] = useState(label)
  const changed = draft.trim() !== '' && draft.trim() !== label

  return (
    <Sheet title={label} onClose={onClose}>
      <div className="m-actions">
        <div className="m-rename">
          <input
            className="city-picker-input"
            aria-label="Display name"
            value={draft}
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!changed}
            onClick={() => onRename(draft)}
          >
            Rename
          </button>
        </div>
        {!isHome ? (
          <button type="button" className="btn m-action" onClick={onSetHome}>
            Set as home
          </button>
        ) : null}
        <div className="m-action-pair">
          <button type="button" className="btn m-action" disabled={isFirst} onClick={() => onMove(-1)}>
            Move up
          </button>
          <button type="button" className="btn m-action" disabled={isLast} onClick={() => onMove(1)}>
            Move down
          </button>
        </div>
        {!isHome ? (
          <button type="button" className="btn btn-danger m-action" onClick={onRemove}>
            Remove {label}
          </button>
        ) : (
          <p className="settings-hint">
            Home can’t be removed. Set another city as home first.
          </p>
        )}
      </div>
    </Sheet>
  )
}
