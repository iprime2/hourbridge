/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '@renderer/App'
import { HB_STORAGE_KEY } from '@core/persistence'

const IST = { id: 'ist', label: 'IST', iana: 'Asia/Kolkata', isHome: true }
const LONDON = { id: 'london', label: 'London', iana: 'Europe/London' }

function seed(locations: unknown[] = [IST, LONDON]): void {
  localStorage.setItem(
    HB_STORAGE_KEY,
    JSON.stringify({ version: 7, locations, timeFormat: '12h', theme: 'system', workHours: { start: 9, end: 17 } })
  )
}

const tileOf = (row: RegExp, hour: number) =>
  within(screen.getByRole('row', { name: row })).getAllByRole('button').find((b) => b.getAttribute('data-hour') === String(hour))!

async function addDayOff(user: ReturnType<typeof userEvent.setup>, name: string, from: string, to = '') {
  const form = screen.getByRole('form', { name: /^Add a day off for/ })
  await user.type(within(form).getByRole('textbox', { name: 'What it is' }), name)
  fireEvent.change(within(form).getByLabelText('From'), { target: { value: from } })
  if (to) fireEvent.change(within(form).getByLabelText('To (optional)'), { target: { value: to } })
  await user.click(within(form).getByRole('button', { name: 'Add day off' }))
}

describe('days off, in the desktop app', () => {
  beforeEach(() => {
    // Monday 15 January 2024, 11:30 AM IST.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2024-01-15T06:00:00Z'))
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('adds a day off for London: its tiles, the planner and the holiday panel all say so', async () => {
    seed()
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Add a person in London' }))
    await addDayOff(user, 'Leave', '2024-01-15')

    const list = screen.getByRole('list', { name: 'Days off for London' })
    expect(list).toHaveTextContent('Leave')
    expect(JSON.parse(localStorage.getItem(HB_STORAGE_KEY)!).locations[1].daysOff).toEqual([{ from: '2024-01-15', name: 'Leave' }])
    await user.keyboard('{Escape}')

    // 5 AM IST is still Sunday in London; 6 AM IST is Monday there.
    expect(tileOf(/London timezone row/, 5)).not.toHaveClass('has-holiday')
    expect(tileOf(/London timezone row/, 6)).toHaveClass('has-holiday')
    expect(tileOf(/London timezone row/, 12)).toHaveAccessibleName(/Day off: Leave/)

    const planner = screen.getByRole('region', { name: 'Meeting planner' })
    expect(planner).toHaveTextContent('Days off: London (Leave)')
    expect(planner).toHaveTextContent('No time works for everyone')

    expect(screen.getByRole('list', { name: 'Upcoming days off for London' })).toHaveTextContent(/Mon, Jan 15\s*Leave\s*now/)

    await user.click(tileOf(/London timezone row/, 14))
    expect(planner).toHaveTextContent('London is off (Leave).')
  })

  it('a day off of your own takes your working hours away', async () => {
    seed([{ ...IST, daysOff: [{ from: '2024-01-15', name: 'Leave' }] }, LONDON])
    render(<App />)
    expect(tileOf(/IST timezone row/, 12)).not.toHaveClass('is-work')
    expect(tileOf(/IST timezone row/, 12)).toHaveAccessibleName(/Day off: Leave/)
  })

  it('names the person and their city once: “Tom in London (Leave)”', () => {
    seed([IST, { ...LONDON, person: 'Tom', daysOff: [{ from: '2024-01-15', name: 'Leave' }] }])
    render(<App />)
    expect(screen.getByRole('region', { name: 'Meeting planner' })).toHaveTextContent('Days off: Tom in London (Leave)')
    expect(screen.getByRole('list', { name: 'Upcoming days off for Tom (London)' })).toHaveTextContent('Leave')
  })

  it('refuses a range that ends before it starts, and removes an entry', async () => {
    seed([IST, { ...LONDON, daysOff: [{ from: '2024-02-01', name: 'Strike' }] }])
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Add a person in London' }))
    await addDayOff(user, 'Backwards', '2024-03-10', '2024-03-01')
    expect(screen.getByRole('alert')).toHaveTextContent('The last day can’t be before the first.')
    expect(screen.getByRole('list', { name: 'Days off for London' })).not.toHaveTextContent('Backwards')

    await user.click(screen.getByRole('button', { name: /^Remove Strike, / }))
    expect(screen.queryByRole('list', { name: 'Days off for London' })).toBeNull()
    expect(JSON.parse(localStorage.getItem(HB_STORAGE_KEY)!).locations[1]).not.toHaveProperty('daysOff')
  })

  it('adds a range of days', async () => {
    seed()
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Add a person in London' }))
    await addDayOff(user, 'Diwali break', '2024-10-31', '2024-11-03')
    expect(JSON.parse(localStorage.getItem(HB_STORAGE_KEY)!).locations[1].daysOff).toEqual([
      { from: '2024-10-31', to: '2024-11-03', name: 'Diwali break' }
    ])
    expect(screen.getByRole('list', { name: 'Days off for London' })).toHaveTextContent(/Thu, Oct 31 – Sun, Nov 3/)
  })
})
