/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DateTime } from 'luxon'
import TimeGrid from '@renderer/components/TimeGrid'
import { DEFAULT_LOCATIONS, type Location } from '@core/timezones'

describe('TimeGrid', () => {
  const selectedDate = { year: 2024, month: 7, day: 15 }
  const now = DateTime.fromISO('2024-07-15T12:00:00', { zone: 'Asia/Kolkata' })

  function renderGrid(
    overrides: Partial<{
      activeHour: number | null
      onNudgeHour: (delta: number) => void
      onSelectHour: (hour: number | null) => void
      onHoverHour: (hour: number | null) => void
    }> = {}
  ) {
    const onNudgeHour = overrides.onNudgeHour ?? vi.fn()
    const onSelectHour = overrides.onSelectHour ?? vi.fn()
    const onHoverHour = overrides.onHoverHour ?? vi.fn()

    render(
      <TimeGrid
        locations={DEFAULT_LOCATIONS}
        homeZone="Asia/Kolkata"
        selectedDate={selectedDate}
        timeFormat="12h"
        activeHour={overrides.activeHour ?? 12}
        now={now}
        onSelectHour={onSelectHour}
        onHoverHour={onHoverHour}
        onNudgeHour={onNudgeHour}
        onRemove={vi.fn()}
        onSetHome={vi.fn()}
      />
    )

    return { onNudgeHour, onSelectHour, onHoverHour }
  }

  it('nudges the selected hour with arrow keys when focused', async () => {
    const user = userEvent.setup()
    const { onNudgeHour } = renderGrid()

    const grid = screen.getByRole('grid', { name: /timezone comparison grid/i })
    grid.focus()
    await user.keyboard('{ArrowRight}')
    expect(onNudgeHour).toHaveBeenCalledWith(1)

    await user.keyboard('{ArrowLeft}')
    expect(onNudgeHour).toHaveBeenCalledWith(-1)
  })

  it('clears selection on Escape', async () => {
    const user = userEvent.setup()
    const { onSelectHour, onHoverHour } = renderGrid()

    const grid = screen.getByRole('grid', { name: /timezone comparison grid/i })
    grid.focus()
    await user.keyboard('{Escape}')
    expect(onHoverHour).toHaveBeenCalledWith(null)
    expect(onSelectHour).toHaveBeenCalledWith(null)
  })

  it('renders a row for each location', () => {
    renderGrid()
    for (const loc of DEFAULT_LOCATIONS) {
      expect(screen.getByLabelText(new RegExp(`${loc.label} timezone row`, 'i'))).toBeInTheDocument()
    }
  })
})

describe('TimeGrid on a daylight-saving day in the home zone', () => {
  const locations: Location[] = [
    { id: 'ny', label: 'New York', iana: 'America/New_York', isHome: true },
    { id: 'in', label: 'Mumbai', iana: 'Asia/Kolkata' }
  ]

  function renderOn(date: { year: number; month: number; day: number }) {
    const now = DateTime.fromObject({ ...date, hour: 12 }, { zone: 'America/New_York' })
    return render(
      <TimeGrid
        locations={locations}
        homeZone="America/New_York"
        selectedDate={date}
        timeFormat="12h"
        activeHour={null}
        now={now}
        onSelectHour={vi.fn()}
        onHoverHour={vi.fn()}
        onNudgeHour={vi.fn()}
        onRemove={vi.fn()}
        onSetHome={vi.fn()}
      />
    )
  }

  it('shows an empty, unselectable slot for the hour that does not exist, in every row', () => {
    const { container } = renderOn({ year: 2025, month: 3, day: 9 })
    for (const city of ['New York', 'Mumbai']) {
      expect(screen.getByRole('img', { name: `${city}: No such hour: the clocks go forward` })).toBeInTheDocument()
    }
    expect(container.querySelectorAll('button.hour-tile')).toHaveLength(2 * 23) // no tile mirrors another
    expect(container.querySelectorAll('.hour-header')).toHaveLength(24) // the grid stays 24 wide
    expect(container.querySelectorAll('.hour-header.is-skipped')).toHaveLength(1)
  })

  it('keeps every tile on the fall-back day and notes the hour that happens twice', () => {
    const { container } = renderOn({ year: 2025, month: 11, day: 2 })
    expect(container.querySelectorAll('button.hour-tile')).toHaveLength(2 * 24)
    expect(screen.queryByRole('img', { name: /no such hour/i })).toBeNull()
    expect(screen.getAllByRole('button', { name: /home hour 1,.*happens twice/i })).toHaveLength(2)
  })

  it('looks the same as before on an ordinary day', () => {
    const { container } = renderOn({ year: 2025, month: 6, day: 1 })
    expect(container.querySelectorAll('button.hour-tile')).toHaveLength(2 * 24)
    expect(container.querySelectorAll('.is-skipped')).toHaveLength(0)
    expect(screen.queryAllByRole('button', { name: /happens twice/i })).toHaveLength(0)
  })
})
