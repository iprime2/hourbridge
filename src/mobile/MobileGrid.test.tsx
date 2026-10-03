/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DateTime } from 'luxon'
import MobileGrid from '@mobile/MobileGrid'
import { buildTimelineForLocations } from '@core/formatters'
import type { Location } from '@core/timezones'

const locations: Location[] = [
  { id: 'ny', label: 'New York', iana: 'America/New_York', isHome: true },
  { id: 'in', label: 'Mumbai', iana: 'Asia/Kolkata' }
]

function renderOn(date: { year: number; month: number; day: number }, onSelectHour = vi.fn()) {
  const view = render(
    <MobileGrid
      locations={locations}
      homeZone="America/New_York"
      columns={buildTimelineForLocations(date, locations, 'America/New_York')}
      selectedDate={date}
      selection={null}
      workHours={{ start: 9, end: 17 }}
      timeFormat="12h"
      now={DateTime.fromObject({ ...date, hour: 12 }, { zone: 'America/New_York' })}
      onSelectHour={onSelectHour}
      onOpenCity={vi.fn()}
    />
  )
  return { ...view, onSelectHour }
}

describe('MobileGrid on a daylight-saving day in the home zone', () => {
  it('shows an empty slot, not a copy of the next hour, for the hour that does not exist', () => {
    const { container } = renderOn({ year: 2025, month: 3, day: 9 })
    expect(screen.getAllByRole('img', { name: /: No such hour: the clocks go forward/ })).toHaveLength(2)
    expect(container.querySelectorAll('button.m-tile')).toHaveLength(2 * 23)
    expect(container.querySelectorAll('.m-hour')).toHaveLength(24)
    expect(container.querySelectorAll('.m-hour.is-skipped')).toHaveLength(1)
  })

  it('cannot select the hour that does not exist, but can select its neighbours', async () => {
    const user = userEvent.setup()
    const { onSelectHour } = renderOn({ year: 2025, month: 3, day: 9 })
    await user.click(screen.getAllByRole('img', { name: /No such hour/ })[0])
    expect(onSelectHour).not.toHaveBeenCalled()
    await user.click(screen.getAllByRole('button', { name: /New York .*home hour 3,/ })[0])
    expect(onSelectHour).toHaveBeenCalledWith(3)
  })

  it('notes the hour that happens twice on the fall-back day and keeps all 24 tiles', () => {
    const { container } = renderOn({ year: 2025, month: 11, day: 2 })
    expect(container.querySelectorAll('button.m-tile')).toHaveLength(2 * 24)
    expect(screen.getAllByRole('button', { name: /home hour 1,.*happens twice/i })).toHaveLength(2)
  })

  it('is unchanged on an ordinary day', () => {
    const { container } = renderOn({ year: 2025, month: 6, day: 1 })
    expect(container.querySelectorAll('button.m-tile')).toHaveLength(2 * 24)
    expect(container.querySelectorAll('.is-skipped')).toHaveLength(0)
  })
})
