/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '@renderer/App'
import SettingsPanel from '@ui/SettingsPanel'
import { HB_STORAGE_KEY } from '@core/persistence'
import { buildSettingsFile } from '@core/settingsFile'

const IST = { id: 'ist', label: 'IST', iana: 'Asia/Kolkata', isHome: true }
const LONDON = { id: 'london', label: 'London', iana: 'Europe/London' }

function seed(extra: Record<string, unknown> = {}): void {
  localStorage.setItem(
    HB_STORAGE_KEY,
    JSON.stringify({ version: 6, locations: [IST, LONDON], timeFormat: '12h', theme: 'system', workHours: { start: 9, end: 17 }, ...extra })
  )
}

const rows = () => screen.getAllByLabelText(/ timezone row$/).map((el) => el.getAttribute('aria-label')!.replace(' timezone row', ''))
const tileOf = (row: RegExp, hour: number) =>
  within(screen.getByRole('row', { name: row })).getAllByRole('button').find((b) => b.getAttribute('data-hour') === String(hour))!

describe('a person on a row, in the desktop grid', () => {
  beforeEach(() => {
    // Monday 15 January 2024, 11:30 AM IST. London is on GMT, 5:30 behind.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2024-01-15T06:00:00Z'))
    seed()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('names the person, sets their own hours, marks their tiles, and plans around them', async () => {
    const user = userEvent.setup()
    render(<App />)
    // Without own hours, London counts from 6:30 AM there (12 PM IST).
    expect(screen.getByRole('button', { name: '12:00 PM – 6:00 PM IST' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add a person in London' }))
    const dialog = screen.getByRole('dialog', { name: 'Person in London' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Person' }), 'Tom')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Has their own working hours' }))
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Their hours start (London time)' }), '9')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Their hours end (London time)' }), '17')
    expect(dialog).toHaveTextContent('Covers the 9:00 AM … 5:00 PM, Mon–Fri tiles in London time')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(screen.queryByRole('dialog', { name: 'Person in London' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit Tom (London)' })).toHaveFocus()
    expect(rows()).toEqual(['IST', 'Tom, London'])
    const stored = JSON.parse(localStorage.getItem(HB_STORAGE_KEY)!)
    expect(stored.locations[1]).toMatchObject({ person: 'Tom', hours: { start: 9, end: 17 } })

    // 2 PM IST is 8:30 AM in London: before Tom starts. 3 PM IST is 9:30 AM: inside.
    expect(tileOf(/Tom, London/, 14)).not.toHaveClass('in-their-hours')
    expect(tileOf(/Tom, London/, 15)).toHaveClass('in-their-hours')
    expect(tileOf(/Tom, London/, 15)).toHaveAccessibleName(/Tom’s working hours/)
    expect(screen.getByText('Their own working hours')).toBeInTheDocument()

    const planner = screen.getByRole('region', { name: 'Meeting planner' })
    expect(planner).toHaveTextContent('you’re working and nobody’s asleep or outside their hours:')
    expect(within(planner).getByRole('button', { name: '3:00 PM – 6:00 PM IST' })).toBeInTheDocument()

    await user.click(tileOf(/Tom, London/, 14))
    expect(planner).toHaveTextContent('Tom (London) is outside their working hours.')
    expect(within(planner).getByText('Tom (London)').closest('li')).toHaveTextContent('outside their hours')
  })

  it('closes the person popover with Escape, without saving', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Add a person in London' }))
    await user.type(screen.getByRole('textbox', { name: 'Person' }), 'Tom')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add a person in London' })).toHaveFocus()
    expect(rows()).toEqual(['IST', 'London'])
  })

  it('offers no own hours for the home row: yours are in Settings', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Add a person in IST' }))
    const dialog = screen.getByRole('dialog', { name: 'Person in IST' })
    expect(within(dialog).queryByRole('checkbox')).toBeNull()
    expect(dialog).toHaveTextContent('This is you. Your working hours are in Settings.')
  })
})

describe('boards, in the desktop app', () => {
  beforeEach(() => seed())
  afterEach(() => cleanup())

  it('makes a board from Settings, switches between boards in the toolbar, and deletes one after confirming', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.queryByRole('combobox', { name: 'Board' })).toBeNull() // one board: no switcher

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    const settings = screen.getByRole('dialog', { name: 'Settings' })
    await user.type(within(settings).getByRole('textbox', { name: 'New board name' }), 'Family')
    await user.click(within(settings).getByRole('button', { name: 'New board' }))
    expect(rows()).toEqual(['IST'])
    const switcher = screen.getByRole('combobox', { name: 'Board' })
    expect(switcher).toHaveValue('board-2')
    expect(within(settings).getByRole('list', { name: 'Boards' })).toHaveTextContent('My cities · 2 citiesShow')

    await user.selectOptions(switcher, 'main')
    expect(rows()).toEqual(['IST', 'London'])
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull() // a click outside closes it

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Delete Family' }))
    await user.click(screen.getByRole('button', { name: 'Delete Family and its 1 city' }))
    expect(screen.queryByRole('combobox', { name: 'Board' })).toBeNull()
    expect(JSON.parse(localStorage.getItem(HB_STORAGE_KEY)!)).not.toHaveProperty('boards')
  })

  it('renames a board', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Rename My cities' }))
    const input = screen.getByRole('textbox', { name: 'New name for My cities' })
    await user.clear(input)
    await user.type(input, 'Team{Enter}')
    expect(screen.getByRole('list', { name: 'Boards' })).toHaveTextContent('Team · 2 cities')
    expect(JSON.parse(localStorage.getItem(HB_STORAGE_KEY)!).boards).toEqual([{ id: 'main', name: 'Team' }])
  })
})

describe('a settings file with boards', () => {
  afterEach(() => cleanup())

  it('says how many boards it has before replacing yours, and exports every board', async () => {
    const user = userEvent.setup()
    const onImportSettings = vi.fn()
    const family = { id: 'board-2', name: 'Family', locations: [{ ...IST }] }
    render(
      <SettingsPanel
        theme="system"
        timeFormat="12h"
        workHours={{ start: 9, end: 17 }}
        onTheme={vi.fn()}
        onTimeFormat={vi.fn()}
        onWorkHours={vi.fn()}
        locations={[IST, LONDON]}
        onImportSettings={onImportSettings}
        savedBoards={{ boards: [{ id: 'main', name: 'Team', locations: [IST, LONDON] }, family], activeBoard: 'main' }}
        onExportFile={(_, text) => {
          expect(JSON.parse(text).boards).toEqual([{ id: 'main', name: 'Team' }, family])
        }}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Export settings' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/^Saved hourbridge-settings-/)

    const file = buildSettingsFile({
      locations: [IST, LONDON],
      timeFormat: '12h',
      theme: 'system',
      workHours: { start: 9, end: 17 },
      boards: [{ id: 'main', name: 'Team', locations: [IST, LONDON] }, family],
      activeBoard: 'main'
    })
    await user.upload(
      screen.getByLabelText('Choose a settings file to import') as HTMLInputElement,
      new File([file], 'settings.json', { type: 'application/json' })
    )
    expect(await screen.findByRole('group', { name: 'Import settings' })).toHaveTextContent('It also has 1 more board.')
    await user.click(screen.getByRole('button', { name: 'Replace my settings' }))
    expect(onImportSettings.mock.calls[0][0].boards.map((b: { name: string }) => b.name)).toEqual(['Team', 'Family'])
  })
})
