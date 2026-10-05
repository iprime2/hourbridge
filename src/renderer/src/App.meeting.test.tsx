/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '@renderer/App'
import { HB_STORAGE_KEY } from '@core/persistence'

// Pin "today" so nothing depends on the day the suite runs (Wednesday 17 January 2024, 11:30 in IST).
const tile = (row: RegExp, hour: number) =>
  within(screen.getByLabelText(row)).getByRole('button', { name: new RegExp(`home hour ${hour},`) })
const istTile = (hour: number) => tile(/^IST timezone row$/, hour)
const selectedHours = () =>
  [...screen.getByLabelText(/^IST timezone row$/).querySelectorAll('.hour-tile.is-selected')].map((t) =>
    Number((t as HTMLElement).dataset.hour)
  )
const when = () => document.querySelector('.planner-when')?.textContent ?? ''
const lengthWords = () => within(screen.getByRole('group', { name: 'Meeting length' })).getByText(/hour|minutes/, { selector: '.sr-only' }).textContent
const shorten = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Shorten the meeting' }))
const lengthen = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Lengthen the meeting' }))
const startAt = (user: ReturnType<typeof userEvent.setup>, minute: string) =>
  user.selectOptions(screen.getByRole('combobox', { name: 'Start time' }), minute)

describe('App — meetings shorter than an hour', () => {
  beforeEach(() => {
    localStorage.removeItem(HB_STORAGE_KEY)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2024-01-17T06:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('starts as an hour and can be shortened to 45, 30 and 15 minutes, and no shorter', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(istTile(12))
    expect(lengthWords()).toBe('1 hour')
    expect(when()).toMatch(/12:00 PM – 1:00 PM IST$/)
    for (const [words, end] of [['45 minutes', '12:45 PM'], ['30 minutes', '12:30 PM'], ['15 minutes', '12:15 PM'], ['15 minutes', '12:15 PM']] as const) {
      await shorten(user)
      expect(lengthWords()).toBe(words)
      expect(when()).toMatch(new RegExp(`12:00 PM – ${end} IST$`))
    }
    expect(screen.getByRole('button', { name: 'Shorten the meeting' })).toBeDisabled()
  })

  it('starts on the half hour, and the hours it touches follow it on the grid', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(istTile(12))
    await shorten(user)
    await shorten(user) // 30 minutes
    await startAt(user, '30')
    expect(when()).toMatch(/12:30 PM – 1:00 PM IST$/)
    expect(selectedHours()).toEqual([12]) // all within the 12 o'clock tile
    await lengthen(user) // 12:30 – 1:15 touches two tiles
    expect(when()).toMatch(/12:30 PM – 1:15 PM IST$/)
    expect(selectedHours()).toEqual([12, 13])
  })

  it('shows the real minutes in every city, half-hour offsets included', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(istTile(12))
    await shorten(user)
    await shorten(user)
    await startAt(user, '30')
    const people = screen.getByRole('list', { name: 'Meeting time for each location' })
    // 12:30–13:00 IST is 7:00–7:30 AM in London (UTC) and 2:30 PM in Tokyo on 17 January.
    expect(within(people).getByText(/London/).closest('li')).toHaveTextContent('Wed, Jan 17 · 7:00 AM – 7:30 AM')
    expect(within(people).getByText(/Tokyo/).closest('li')).toHaveTextContent('Wed, Jan 17 · 4:00 PM – 4:30 PM')
  })

  it('keeps the length for the next tile you click, and starts that one on the hour', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(istTile(12))
    await shorten(user)
    await shorten(user)
    await startAt(user, '30')
    await user.click(istTile(15))
    expect(lengthWords()).toBe('30 minutes')
    expect(when()).toMatch(/3:00 PM – 3:30 PM IST$/)
  })

  it('moves with the arrow keys by whole hours, keeping minutes, and Shift + arrows change the length by a step', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(istTile(12))
    await shorten(user)
    await shorten(user)
    await startAt(user, '30')
    screen.getByRole('grid', { name: /timezone comparison grid/i }).focus()
    await user.keyboard('{ArrowRight}')
    expect(when()).toMatch(/1:30 PM – 2:00 PM IST$/)
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}') // 30 → 45 minutes
    expect(when()).toMatch(/1:30 PM – 2:15 PM IST$/)
    await user.keyboard('{Shift>}{ArrowLeft}{ArrowLeft}{ArrowLeft}{/Shift}') // 45 → 30 → 15 → 15
    expect(when()).toMatch(/1:30 PM – 1:45 PM IST$/)
  })

  it('still selects whole hours by dragging, as before', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.pointer([{ keys: '[MouseLeft>]', target: istTile(10) }, { target: istTile(12) }, { keys: '[/MouseLeft]' }])
    expect(selectedHours()).toEqual([10, 11, 12])
    expect(when()).toMatch(/10:00 AM – 1:00 PM IST$/)
    expect(lengthWords()).toBe('3 hours')
  })
})
