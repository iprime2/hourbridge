/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The adapter is the only module that touches Capacitor; replace it wholesale.
vi.mock('@mobile/native', () => ({
  hapticSelection: vi.fn(),
  shareMeeting: vi.fn(async () => ''),
  shareTextFile: vi.fn(async () => undefined),
  syncStatusBar: vi.fn(),
  restoreStateFromNative: vi.fn(async () => undefined),
  mirrorStateToNative: vi.fn(() => () => undefined),
  isNative: vi.fn(() => false),
  prefersDark: vi.fn(() => false)
}))

import MobileApp from '@mobile/MobileApp'
import * as native from '@mobile/native'
import { setHolidayLoader } from '@core/holidays'
import { encodeShare } from '@core/shareLink'
import { HB_STORAGE_KEY } from '@core/persistence'

const row = (name: RegExp) => screen.getByLabelText(name)
const tile = (label: RegExp, hour: number) =>
  within(row(label)).getByRole('button', { name: new RegExp(`home hour ${hour},`) })
const rowLabels = () =>
  screen.getAllByLabelText(/ timezone row$/).map((el) => el.getAttribute('aria-label'))

describe('MobileApp (iOS)', () => {
  beforeEach(() => {
    localStorage.removeItem(HB_STORAGE_KEY)
    document.documentElement.removeAttribute('data-theme')
    vi.mocked(native.hapticSelection).mockClear()
    vi.mocked(native.shareMeeting).mockClear()
    vi.mocked(native.syncStatusBar).mockClear()
  })
  afterEach(() => vi.restoreAllMocks())

  it('renders the default cities with IST as home', () => {
    render(<MobileApp />)
    expect(screen.getByRole('heading', { name: /hourbridge/i })).toBeInTheDocument()
    expect(rowLabels()).toEqual([
      'Miami timezone row',
      'IST timezone row',
      'AEST timezone row',
      'London timezone row',
      'Tokyo timezone row'
    ])
    expect(within(row(/IST timezone row/i)).getByText('Home')).toBeInTheDocument()
  })

  it('tapping an hour selects it, ticks the haptic engine, and reveals the planner', async () => {
    const user = userEvent.setup()
    render(<MobileApp />)
    expect(screen.getByText('Tap an hour to plan a meeting.')).toBeInTheDocument()

    await user.click(tile(/IST timezone row/i, 15))
    expect(native.hapticSelection).toHaveBeenCalledTimes(1)
    expect(tile(/London timezone row/i, 15)).toHaveClass('is-selected')
    expect(screen.getByLabelText('Meeting title')).toBeInTheDocument()
    expect(screen.getByText('1h')).toBeInTheDocument()
  })

  it('lengthens the meeting from the planner (no drag on touch)', async () => {
    const user = userEvent.setup()
    render(<MobileApp />)
    await user.click(tile(/IST timezone row/i, 10))
    for (let step = 0; step < 3; step++) await user.click(screen.getByRole('button', { name: /lengthen/i })) // 1h → 1h 30m → 2h → 3h
    expect(screen.getByText('3h')).toBeInTheDocument()
    for (const h of [10, 11, 12]) expect(tile(/IST timezone row/i, h)).toHaveClass('is-selected')
  })

  it('plans a 30-minute meeting that starts on the half hour', async () => {
    const user = userEvent.setup()
    render(<MobileApp />)
    await user.click(tile(/IST timezone row/i, 10))
    await user.click(screen.getByRole('button', { name: 'Shorten the meeting' }))
    await user.click(screen.getByRole('button', { name: 'Shorten the meeting' })) // 1h → 45m → 30m
    await user.selectOptions(screen.getByRole('combobox', { name: 'Start time' }), '30')
    expect(document.querySelector('.planner-when')?.textContent).toMatch(/10:30 AM – 11:00 AM IST$/)
    expect(tile(/IST timezone row/i, 10)).toHaveClass('is-selected')
    expect(tile(/IST timezone row/i, 11)).not.toHaveClass('is-selected')
  })

  it('shares through the native share sheet with text, calendar file and a safe name', async () => {
    const user = userEvent.setup()
    vi.mocked(native.shareMeeting).mockResolvedValueOnce('')
    render(<MobileApp />)
    await user.click(tile(/IST timezone row/i, 15))
    await user.type(screen.getByLabelText('Meeting title'), 'Design review')
    expect(screen.queryByRole('button', { name: 'Copy details' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Share' }))
    expect(native.shareMeeting).toHaveBeenCalledTimes(1)
    const [text, ics, filename] = vi.mocked(native.shareMeeting).mock.calls[0]
    expect(text.split('\n')[0]).toBe('Design review')
    expect(text).toContain('IST (home)')
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('SUMMARY:Design review')
    expect(filename).toBe('design-review.ics')
  })

  it('shows what the share step reports (e.g. a failure)', async () => {
    const user = userEvent.setup()
    vi.mocked(native.shareMeeting).mockResolvedValueOnce('Could not share')
    render(<MobileApp />)
    await user.click(tile(/IST timezone row/i, 15))
    await user.click(screen.getByRole('button', { name: 'Share' }))
    expect(await screen.findByText('Could not share')).toBeInTheDocument()
    // Status text is announced politely.
    expect(screen.getAllByRole('status').some((s) => s.textContent === 'Could not share')).toBe(true)
  })

  describe('city sheet', () => {
    it('opens from the city cell and can set home', async () => {
      const user = userEvent.setup()
      render(<MobileApp />)
      await user.click(screen.getByRole('button', { name: 'London options' }))
      const sheet = screen.getByRole('dialog', { name: 'London' })
      await user.click(within(sheet).getByRole('button', { name: 'Set as home' }))

      expect(screen.queryByRole('dialog', { name: 'London' })).toBeNull()
      expect(within(row(/London timezone row/i)).getByText('Home')).toBeInTheDocument()
      expect(within(row(/IST timezone row/i)).queryByText('Home')).toBeNull()
    })

    it('removes a non-home city but explains why home cannot be removed', async () => {
      const user = userEvent.setup()
      render(<MobileApp />)

      await user.click(screen.getByRole('button', { name: 'IST options' }))
      const homeSheet = screen.getByRole('dialog', { name: 'IST' })
      expect(within(homeSheet).queryByRole('button', { name: /^Remove/ })).toBeNull()
      expect(within(homeSheet).getByText(/home can’t be removed/i)).toBeInTheDocument()
      await user.click(within(homeSheet).getByRole('button', { name: 'Done' }))

      await user.click(screen.getByRole('button', { name: 'Tokyo options' }))
      await user.click(screen.getByRole('button', { name: 'Remove Tokyo' }))
      expect(screen.queryByLabelText(/Tokyo timezone row/i)).toBeNull()
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('renames a city, enabling Rename only for a real change', async () => {
      const user = userEvent.setup()
      render(<MobileApp />)
      await user.click(screen.getByRole('button', { name: 'London options' }))
      const rename = screen.getByRole('button', { name: 'Rename' })
      expect(rename).toBeDisabled()

      const input = screen.getByLabelText('Display name')
      await user.clear(input)
      expect(rename).toBeDisabled() // empty is not a name
      await user.type(input, 'Team UK')
      expect(rename).toBeEnabled()
      await user.click(rename)

      // The sheet title follows the new name and the row is renamed.
      expect(screen.getByRole('dialog', { name: 'Team UK' })).toBeInTheDocument()
      expect(row(/Team UK timezone row/i)).toBeInTheDocument()
    })

    it('reorders and disables moves at the list ends', async () => {
      const user = userEvent.setup()
      render(<MobileApp />)
      await user.click(screen.getByRole('button', { name: 'Miami options' }))
      expect(screen.getByRole('button', { name: 'Move up' })).toBeDisabled()
      await user.click(screen.getByRole('button', { name: 'Move down' }))
      expect(rowLabels().slice(0, 2)).toEqual(['IST timezone row', 'Miami timezone row'])
    })

    it('closes with Escape or the backdrop', async () => {
      const user = userEvent.setup()
      render(<MobileApp />)
      await user.click(screen.getByRole('button', { name: 'London options' }))
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).toBeNull()

      await user.click(screen.getByRole('button', { name: 'London options' }))
      const backdrop = document.querySelector('.m-backdrop') as HTMLElement
      // pointerdown on the backdrop itself (not the sheet) dismisses.
      backdrop.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })
  })

  it('adds a city from the sheet and closes it', async () => {
    const user = userEvent.setup()
    render(<MobileApp />)
    await user.click(screen.getByRole('button', { name: 'Add location' }))
    const sheet = screen.getByRole('dialog', { name: 'Add a location' })
    await user.type(within(sheet).getByLabelText('Search cities'), 'Paris')
    await user.click(within(sheet).getByRole('option', { name: /Paris/ }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(row(/Paris timezone row/i)).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(HB_STORAGE_KEY)!).locations.some(
      (l: { id: string }) => l.id === 'paris'
    )).toBe(true)
  })

  it('does not auto-focus the search field (that would pop the keyboard over the list)', async () => {
    const user = userEvent.setup()
    render(<MobileApp />)
    await user.click(screen.getByRole('button', { name: 'Add location' }))
    expect(screen.getByLabelText('Search cities')).not.toHaveFocus()
  })

  it('applies the theme from settings, persists it, and syncs the status bar', async () => {
    const user = userEvent.setup()
    render(<MobileApp />)
    expect(native.syncStatusBar).toHaveBeenCalledWith('system')

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(native.syncStatusBar).toHaveBeenLastCalledWith('dark')
    expect(JSON.parse(localStorage.getItem(HB_STORAGE_KEY)!).theme).toBe('dark')
  })

  it('switches to 24-hour time from settings', async () => {
    const user = userEvent.setup()
    render(<MobileApp />)
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('radio', { name: '24-hour' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(within(row(/IST timezone row/i)).getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument()
  })

  describe('date bar', () => {
    it('disables "Today" while on today and re-enables it after moving', async () => {
      const user = userEvent.setup()
      render(<MobileApp />)
      const today = screen.getByRole('button', { name: /go to today/i })
      expect(today).toBeDisabled()

      await user.click(screen.getByRole('button', { name: /next day/i }))
      expect(today).toBeEnabled()
      await user.click(today)
      expect(today).toBeDisabled()
    })

    it('shows the "now" line only on today', async () => {
      const user = userEvent.setup()
      render(<MobileApp />)
      expect(document.querySelector('.m-now')).not.toBeNull()
      await user.click(screen.getByRole('button', { name: /previous day/i }))
      expect(document.querySelector('.m-now')).toBeNull()
    })
  })

  it('gives every interactive control an accessible name', () => {
    render(<MobileApp />)
    for (const button of screen.getAllByRole('button')) {
      const name = button.getAttribute('aria-label') ?? button.textContent ?? ''
      expect(name.trim(), button.outerHTML.slice(0, 80)).not.toBe('')
    }
  })
})

describe('MobileApp (iOS) on a public holiday at home', () => {
  beforeEach(() => {
    localStorage.removeItem(HB_STORAGE_KEY)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-26T04:30:00Z')) // Monday 10:00 in Kolkata, Republic Day
    setHolidayLoader(async (code) => (code === 'IN' ? { '2026': [['01-26', 'Republic Day']] } : null))
  })
  afterEach(() => vi.useRealTimers())

  it('marks the holiday on the home tiles and drops the working hours for the day', async () => {
    render(<MobileApp />)
    const home = () => row(/^IST timezone row$/)
    expect(home().querySelectorAll('.m-tile.is-work')).toHaveLength(9)
    await waitFor(() => expect(home().querySelectorAll('.m-tile.is-work')).toHaveLength(0))
    expect(home().querySelectorAll('.m-tile.has-holiday')).toHaveLength(24)
    expect(tile(/^IST timezone row$/, 12)).toHaveAccessibleName(/Public holiday: Republic Day/)
  })
})

describe('MobileApp (iOS) — links in and out', () => {
  beforeEach(() => {
    localStorage.removeItem(HB_STORAGE_KEY)
    window.history.replaceState(null, '', '/')
  })
  afterEach(() => {
    window.history.replaceState(null, '', '/')
    vi.mocked(native.isNative).mockReturnValue(false)
  })

  it('offers Google Calendar and Outlook links on the web, with a meeting chosen', async () => {
    const user = userEvent.setup()
    render(<MobileApp />)
    expect(screen.queryByRole('link', { name: /Add to Google Calendar/ })).toBeNull() // no meeting yet
    await user.click(tile(/IST timezone row/i, 10))
    expect(screen.getByRole('link', { name: /Add to Google Calendar/ })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: /Add to Outlook/ })).toBeInTheDocument()
  })

  it('leaves them out inside the native app, whose share sheet reaches the calendars', async () => {
    vi.mocked(native.isNative).mockReturnValue(true)
    const user = userEvent.setup()
    render(<MobileApp />)
    await user.click(tile(/IST timezone row/i, 10))
    expect(screen.queryByRole('link', { name: /Add to/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
  })

  it('asks before using cities from a shared link, and adds the new ones when told to', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', `/#share=${encodeShare([{ id: 'p', label: 'Paris', iana: 'Europe/Paris' }])}`)
    render(<MobileApp />)
    expect(screen.getByRole('region', { name: 'Shared cities' })).toHaveTextContent('1 city was shared with you: Paris.')
    expect(rowLabels()).not.toContain('Paris timezone row')
    await user.click(screen.getByRole('button', { name: 'Add 1 new city' }))
    expect(rowLabels()).toContain('Paris timezone row')
    expect(screen.queryByRole('region', { name: 'Shared cities' })).toBeNull()
    expect(window.location.hash).toBe('')
  })

  it('lists Export and Import in Settings, and hands the file to the share sheet only when native', async () => {
    const user = userEvent.setup()
    vi.mocked(native.isNative).mockReturnValue(true)
    vi.mocked(native.shareTextFile).mockClear()
    render(<MobileApp />)
    await user.click(screen.getByRole('button', { name: /settings/i }))
    await user.click(screen.getByRole('button', { name: 'Export settings' }))
    expect(native.shareTextFile).toHaveBeenCalledTimes(1)
    const [name, text, title] = vi.mocked(native.shareTextFile).mock.calls[0]
    expect(name).toMatch(/^hourbridge-settings-.*\.json$/)
    expect(JSON.parse(text).kind).toBe('hourbridge-settings')
    expect(title).toBe('Hourbridge settings')
    expect(screen.queryByRole('button', { name: 'Copy share link' })).toBeInTheDocument() // jsdom is on http
  })
})

