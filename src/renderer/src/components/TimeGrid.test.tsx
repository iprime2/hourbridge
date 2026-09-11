/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DateTime } from 'luxon'
import TimeGrid from '@renderer/components/TimeGrid'
import { DEFAULT_LOCATIONS } from '@renderer/lib/timezones'

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
