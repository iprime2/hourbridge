/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '@renderer/App'
import TimeGrid from '@renderer/components/TimeGrid'
import { DateTime } from 'luxon'
import { DEFAULT_LOCATIONS } from '@core/timezones'
import { WTB_STORAGE_KEY } from '@core/persistence'

const row = (name: RegExp) => screen.getByLabelText(name)
const tile = (label: RegExp, hour: number) =>
  within(row(label)).getByRole('button', { name: new RegExp(`home hour ${hour},`) })
const rowLabels = () =>
  screen.getAllByLabelText(/ timezone row$/).map((el) => el.getAttribute('aria-label'))

describe('App — planning, shortcuts and settings', () => {
  beforeEach(() => {
    localStorage.removeItem(WTB_STORAGE_KEY)
    document.documentElement.removeAttribute('data-theme')
  })
  afterEach(() => {
    window.wtb = undefined
  })

  it('selects a range by dragging across tiles and shows it in the planner', () => {
    render(<App />)
    const ist = /IST timezone row/i

    fireEvent.mouseDown(tile(ist, 15))
    fireEvent.mouseOver(tile(ist, 17), { buttons: 1 })
    fireEvent.mouseUp(window)

    const planner = screen.getByRole('region', { name: /meeting planner/i })
    expect(within(planner).getByText('3h')).toBeInTheDocument()
    // The whole range is marked on every row.
    for (const r of [/IST timezone row/i, /London timezone row/i]) {
      for (const h of [15, 16, 17]) expect(tile(r, h)).toHaveClass('is-selected')
      expect(tile(r, 18)).not.toHaveClass('is-selected')
    }
  })

  it('stops extending once the mouse button is released', () => {
    render(<App />)
    const ist = /IST timezone row/i
    fireEvent.mouseDown(tile(ist, 10))
    fireEvent.mouseUp(window)
    fireEvent.mouseOver(tile(ist, 14), { buttons: 1 })
    const planner = screen.getByRole('region', { name: /meeting planner/i })
    expect(within(planner).getByText('1h')).toBeInTheDocument()
  })

  it('extends the selection with shift-click and clears it with Escape', async () => {
    const user = userEvent.setup()
    render(<App />)
    const ist = /IST timezone row/i
    fireEvent.mouseDown(tile(ist, 9))
    fireEvent.mouseUp(window)
    fireEvent.mouseDown(tile(ist, 12), { shiftKey: true })
    fireEvent.mouseUp(window)

    const planner = screen.getByRole('region', { name: /meeting planner/i })
    expect(within(planner).getByText('4h')).toBeInTheDocument()

    screen.getByRole('grid').focus()
    await user.keyboard('{Escape}')
    expect(within(planner).queryByText('4h')).toBeNull()
    expect(within(planner).getByText(/click or drag/i)).toBeInTheDocument()
  })

  it('resizes with Shift+Arrow and moves with the arrows', async () => {
    const user = userEvent.setup()
    render(<App />)
    fireEvent.mouseDown(tile(/IST timezone row/i, 9))
    fireEvent.mouseUp(window)
    const planner = screen.getByRole('region', { name: /meeting planner/i })

    screen.getByRole('grid').focus()
    await user.keyboard('{Shift>}{ArrowRight}{ArrowRight}{/Shift}')
    expect(within(planner).getByText('3h')).toBeInTheDocument()
    await user.keyboard('{ArrowRight}')
    expect(tile(/IST timezone row/i, 10)).toHaveClass('is-selected')
    expect(tile(/IST timezone row/i, 9)).not.toHaveClass('is-selected')
  })

  it('selects with the keyboard on a focused tile (Enter)', async () => {
    const user = userEvent.setup()
    render(<App />)
    tile(/Tokyo timezone row/i, 8).focus()
    await user.keyboard('{Enter}')
    expect(tile(/Tokyo timezone row/i, 8)).toHaveClass('is-selected')
  })

  it('opens the add dialog with Ctrl+K and closes it with Escape, restoring focus', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.keyboard('{Control>}k{/Control}')
    expect(screen.getByRole('dialog', { name: /add a location/i })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: /add a location/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'Add location' })).toHaveFocus()
  })

  it('adds a city found by country name and can add it with the keyboard alone', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.keyboard('{Control>}k{/Control}')
    await user.type(screen.getByLabelText('Search cities'), 'germany')
    await user.keyboard('{Enter}')
    expect(row(/Berlin timezone row/i)).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /add a location/i })).toBeNull()
  })

  it('changes day with [ ] and returns with T — but not while typing', async () => {
    const user = userEvent.setup()
    render(<App />)
    const group = screen.getByRole('group', { name: /comparison date/i })
    const selected = () =>
      within(group).getByRole('button', { pressed: true }).getAttribute('aria-label')
    const today = selected()

    await user.keyboard(']')
    expect(selected()).not.toBe(today)
    await user.keyboard('t')
    expect(selected()).toBe(today)
    await user.keyboard('[[') // user-event: "[[" types a literal "["
    expect(selected()).not.toBe(today)

    // Typing "t" into the search field must not jump the date.
    await user.keyboard('{Control>}k{/Control}')
    const before = selected()
    await user.type(screen.getByLabelText('Search cities'), 'tt')
    expect(selected()).toBe(before)
  })

  it('applies and persists the theme from the settings menu', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(JSON.parse(localStorage.getItem(WTB_STORAGE_KEY)!).theme).toBe('dark')

    await user.click(screen.getByRole('radio', { name: 'System' }))
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('closes the settings popover on Escape and outside click', async () => {
    const user = userEvent.setup()
    render(<App />)
    const open = async () => user.click(screen.getByRole('button', { name: 'Settings' }))

    await open()
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull()

    await open()
    await user.click(document.body)
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull()
  })

  describe('working hours (defined in the home timezone)', () => {
    // Pin "today" to a Wednesday so weekday handling never depends on when the suite runs.
    // IST home: Wed 2024-01-17 11:30. In January Miami is EST (UTC−5, i.e. IST − 10:30).
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2024-01-17T06:00:00Z'))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    const workHoursOf = (label: string) =>
      [...screen.getByLabelText(new RegExp(`^${label} timezone row$`)).querySelectorAll('.hour-tile.is-work')].map(
        (t) => Number((t as HTMLElement).dataset.hour)
      )

    async function setWorkHours(start: string, end: string) {
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Settings' }))
      await user.selectOptions(screen.getByLabelText('Working hours start'), start)
      await user.selectOptions(screen.getByLabelText('Working hours end'), end)
      return user
    }

    it('starts at 9–17 inclusive: nine columns, the same in every city', () => {
      render(<App />)
      const expected = [9, 10, 11, 12, 13, 14, 15, 16, 17]
      for (const city of ['Miami', 'IST', 'AEST', 'London', 'Tokyo']) {
        expect(workHoursOf(city), city).toEqual(expected)
      }
    })

    it('makes 1 PM – 9 PM include the 9 PM tile, in the home row', async () => {
      render(<App />)
      await setWorkHours('13', '21')
      expect(workHoursOf('IST')).toEqual([13, 14, 15, 16, 17, 18, 19, 20, 21])
      expect(
        within(row(/^IST timezone row$/i)).getByRole('button', { name: /9:00 PM \(home hour 21,/ })
      ).toHaveClass('is-work')
      // …and the tile after it (10 PM) is not.
      expect(
        within(row(/^IST timezone row$/i)).getByRole('button', { name: /10:00 PM \(home hour 22,/ })
      ).not.toHaveClass('is-work')
    })

    it('shows the same window in every other city, so the green columns line up', async () => {
      render(<App />)
      await setWorkHours('13', '21')
      const expected = [13, 14, 15, 16, 17, 18, 19, 20, 21]
      for (const city of ['Miami', 'AEST', 'London', 'Tokyo']) {
        expect(workHoursOf(city), city).toEqual(expected)
      }
      // In London that same window is 07:30 → 15:30 local (GMT), not London's own 1–9 PM.
      const londonFirst = within(row(/^London timezone row$/i)).getByRole('button', {
        name: /home hour 13,/
      })
      expect(londonFirst.getAttribute('aria-label')).toMatch(/7:30 AM/)
    })

    it('still flags a green tile as night in a city that is asleep', async () => {
      render(<App />)
      await setWorkHours('13', '21')
      // Miami (EST) local = IST − 10:30: columns 13–16 are 02:30–05:30 there.
      const asleep = [...row(/^Miami timezone row$/i).querySelectorAll('.hour-tile.is-work.is-asleep')].map(
        (t) => Number((t as HTMLElement).dataset.hour)
      )
      expect(asleep).toEqual([13, 14, 15, 16])
      const first = row(/^Miami timezone row$/i).querySelector('[data-hour="13"]')!
      expect(first.querySelector('.tile-moon')).not.toBeNull()
      expect(first.getAttribute('aria-label')).toMatch(/your working hours, night there/)
      // Awake-and-working tiles carry no moon.
      expect(row(/^Miami timezone row$/i).querySelector('[data-hour="20"] .tile-moon')).toBeNull()
    })

    it('a full-day window leaves nothing awake/night on a weekday', async () => {
      render(<App />)
      await setWorkHours('0', '23')
      expect(document.querySelectorAll('.hour-tile.is-awake')).toHaveLength(0)
      expect(document.querySelectorAll('.hour-tile.is-night')).toHaveLength(0)
      expect(document.querySelectorAll('.hour-tile.is-work')).toHaveLength(5 * 24)
    })

    it('a one-hour window is allowed', async () => {
      render(<App />)
      await setWorkHours('10', '10')
      expect(workHoursOf('IST')).toEqual([10])
    })

    it('tells the user whose clock the hours are on', async () => {
      const user = userEvent.setup()
      render(<App />)
      await user.click(screen.getByRole('button', { name: 'Settings' }))
      expect(screen.getByText('Your working hours (IST time)')).toBeInTheDocument()
    })

    it('follows the home city: making London home re-anchors the window to London time', async () => {
      const user = userEvent.setup()
      render(<App />)
      await user.click(screen.getByRole('button', { name: /set london as home/i }))
      // Grid is now London's Wednesday; the same 9–17 hours are London's 9 AM–5 PM tiles.
      expect(workHoursOf('London')).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17])
      expect(
        within(row(/^London timezone row$/i)).getByRole('button', { name: /9:00 AM \(home hour 9,/ })
      ).toHaveClass('is-work')
      await user.click(screen.getByRole('button', { name: 'Settings' }))
      expect(screen.getByText('Your working hours (London time)')).toBeInTheDocument()
    })

    it('lets you pick your working days: off Thursday and Friday, working Saturday and Sunday', async () => {
      const user = userEvent.setup()
      const nineToFive = [9, 10, 11, 12, 13, 14, 15, 16, 17]
      render(<App />)
      expect(workHoursOf('IST')).toEqual(nineToFive) // today is a Wednesday, a working day by default

      await user.click(screen.getByRole('button', { name: 'Settings' }))
      for (const day of ['Thursday', 'Friday', 'Saturday', 'Sunday']) {
        await user.click(screen.getByRole('button', { name: day }))
      }
      expect(screen.getByText(/tiles on Sat–Wed/)).toBeInTheDocument()
      expect(workHoursOf('IST')).toEqual(nineToFive) // Wednesday is still on

      const nextDay = () => user.click(screen.getByRole('button', { name: 'Next day' }))
      await nextDay() // Thursday: a day off, so nothing is green
      expect(workHoursOf('IST')).toEqual([])
      await nextDay() // Friday
      expect(workHoursOf('IST')).toEqual([])
      await nextDay() // Saturday: worked
      expect(workHoursOf('IST')).toEqual(nineToFive)
      await nextDay() // Sunday: worked
      expect(workHoursOf('IST')).toEqual(nineToFive)
      await nextDay() // Monday: worked
      expect(workHoursOf('IST')).toEqual(nineToFive)

      // It is saved, in order, and the hours beside it are untouched.
      expect(JSON.parse(localStorage.getItem(WTB_STORAGE_KEY)!).workHours).toEqual({
        start: 9,
        end: 17,
        days: [1, 2, 3, 6, 7]
      })
    })

    it('keeps your working days when you change your hours', async () => {
      const user = userEvent.setup()
      render(<App />)
      await user.click(screen.getByRole('button', { name: 'Settings' }))
      await user.click(screen.getByRole('button', { name: 'Wednesday' })) // today is a Wednesday
      expect(workHoursOf('IST')).toEqual([]) // now a day off
      await user.selectOptions(screen.getByLabelText('Working hours start'), '10')
      expect(JSON.parse(localStorage.getItem(WTB_STORAGE_KEY)!).workHours).toEqual({
        start: 10,
        end: 17,
        days: [1, 2, 4, 5]
      })
    })

    it('carries the meaning in text as well as colour', () => {
      render(<App />)
      const labels = within(row(/^IST timezone row$/i))
        .getAllByRole('button', { name: /home hour/ })
        .map((b) => b.getAttribute('aria-label') ?? '')
      expect(labels.filter((l) => l.includes('your working hours'))).toHaveLength(9)
    })
  })

  it('renames a location inline and persists it', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(within(row(/London timezone row/i)).getByRole('button', { name: /rename london/i }))
    const input = screen.getByLabelText('Rename London')
    await user.clear(input)
    await user.type(input, 'Team UK{Enter}')

    expect(row(/Team UK timezone row/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^London timezone row/i)).toBeNull()
    const saved = JSON.parse(localStorage.getItem(WTB_STORAGE_KEY)!)
    expect(saved.locations.find((l: { id: string }) => l.id === 'london').label).toBe('Team UK')
  })

  it('cancels a rename with Escape', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(within(row(/London timezone row/i)).getByRole('button', { name: /rename london/i }))
    await user.type(screen.getByLabelText('Rename London'), 'xyz{Escape}')
    expect(row(/London timezone row/i)).toBeInTheDocument()
  })

  it('reorders rows and disables impossible moves', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(rowLabels()).toEqual([
      'Miami timezone row',
      'IST timezone row',
      'AEST timezone row',
      'London timezone row',
      'Tokyo timezone row'
    ])
    expect(within(row(/Miami timezone row/i)).getByRole('button', { name: /move miami up/i })).toBeDisabled()
    expect(within(row(/Tokyo timezone row/i)).getByRole('button', { name: /move tokyo down/i })).toBeDisabled()

    await user.click(within(row(/London timezone row/i)).getByRole('button', { name: /move london up/i }))
    expect(rowLabels().slice(2, 4)).toEqual(['London timezone row', 'AEST timezone row'])
  })

  it('sorts rows west to east from settings', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: /sort rows/i }))
    // Miami (UTC−4/−5) is the westernmost and Tokyo/AEST the easternmost of the defaults.
    const labels = rowLabels()
    expect(labels[0]).toBe('Miami timezone row')
    expect(['AEST timezone row', 'Tokyo timezone row']).toContain(labels[labels.length - 1])
  })

  it('shows a "now" line only when viewing today', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(document.querySelector('.now-line')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: /next day/i }))
    expect(document.querySelector('.now-line')).toBeNull()
    await user.click(screen.getByRole('button', { name: /go to today/i }))
    expect(document.querySelector('.now-line')).not.toBeNull()
  })

  it('marks every tile with its phase for assistive tech, not just by color', () => {
    render(<App />)
    const labels = within(row(/IST timezone row/i))
      .getAllByRole('button', { name: /home hour/ })
      .map((b) => b.getAttribute('aria-label') ?? '')
    expect(labels.every((l) => /working hours|awake|night/.test(l))).toBe(true)
    expect(labels.some((l) => l.includes('night'))).toBe(true)
  })

  it('does not announce the ticking clock to screen readers', () => {
    render(<App />)
    expect(document.querySelectorAll('.location-time[aria-live]')).toHaveLength(0)
  })

  describe('Electron integration', () => {
    it('handles native menu commands', () => {
      let handler: ((c: WtbMenuCommand) => void) | undefined
      const unsubscribe = vi.fn()
      window.wtb = {
        openWidget: vi.fn(async () => undefined),
        closeWidget: vi.fn(async () => undefined),
        focusMain: vi.fn(async () => undefined),
        setAlwaysOnTop: vi.fn(async (v: boolean) => v),
        getAlwaysOnTop: vi.fn(async () => true),
        publishState: vi.fn(async () => undefined),
        onMenuCommand: (h) => {
          handler = h
          return unsubscribe
        }
      }
      const { unmount } = render(<App />)
      expect(handler).toBeDefined()

      act(() => handler!('add-location'))
      expect(screen.getByRole('dialog', { name: /add a location/i })).toBeInTheDocument()

      act(() => handler!('next-day'))
      act(() => handler!('toggle-format'))
      expect(screen.getByRole('button', { name: /switch to 12-hour format/i })).toBeInTheDocument()

      unmount()
      expect(unsubscribe).toHaveBeenCalled()
    })

    it('publishes the locations, format and theme for the menu-bar clock', async () => {
      const user = userEvent.setup()
      const publishState = vi.fn(async (_state: unknown) => undefined)
      window.wtb = {
        openWidget: vi.fn(),
        closeWidget: vi.fn(),
        focusMain: vi.fn(),
        setAlwaysOnTop: vi.fn(),
        getAlwaysOnTop: vi.fn(),
        publishState
      } as unknown as typeof window.wtb
      render(<App />)

      expect(publishState).toHaveBeenCalled()
      const first = publishState.mock.calls[0][0] as unknown as {
        locations: { id: string }[]
        timeFormat: string
        theme: string
      }
      expect(first.locations.map((l) => l.id)).toContain('ist')
      expect(first.timeFormat).toBe('12h')
      expect(first.theme).toBe('system')

      await user.click(screen.getByRole('button', { name: /switch to 24-hour format/i }))
      const last = publishState.mock.calls.at(-1)![0] as unknown as { timeFormat: string }
      expect(last.timeFormat).toBe('24h')
    })

    it('works with no Electron bridge at all (plain browser)', () => {
      window.wtb = undefined
      expect(() => render(<App />)).not.toThrow()
    })
  })
})


describe('App — drag-and-drop reordering', () => {
  beforeEach(() => {
    localStorage.removeItem(WTB_STORAGE_KEY)
  })

  const handle = (label: string) => screen.getByRole('button', { name: `Reorder ${label}` })
  const order = () =>
    screen.getAllByLabelText(/ timezone row$/).map((el) => el.getAttribute('aria-label')!.replace(' timezone row', ''))
  const savedOrder = () =>
    (JSON.parse(localStorage.getItem(WTB_STORAGE_KEY)!).locations as { label: string }[]).map((l) => l.label)

  /** jsdom has no DataTransfer or layout, so supply both. */
  const transfer = () => ({ setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '', dropEffect: '' })
  function layout(el: HTMLElement, top: number, height = 60) {
    el.getBoundingClientRect = () =>
      ({ top, height, bottom: top + height, left: 0, right: 1000, width: 1000, x: 0, y: top, toJSON() {} }) as DOMRect
  }
  /**
   * jsdom has no DragEvent, so Testing Library builds a plain Event and drops `clientY`.
   * Real browsers' DragEvent extends MouseEvent, so set the coordinate explicitly here.
   */
  function dragAt(
    type: 'dragOver' | 'drop',
    el: Element,
    dataTransfer: ReturnType<typeof transfer>,
    clientY: number
  ): boolean {
    const event = createEvent[type](el, { dataTransfer })
    Object.defineProperty(event, 'clientY', { value: clientY })
    return fireEvent(el, event)
  }
  const TOP_HALF = 110 // rows are laid out at top=100, height=60 → midpoint 130
  const BOTTOM_HALF = 150

  function drag(from: string, onto: string, half: number) {
    const dataTransfer = transfer()
    fireEvent.dragStart(handle(from), { dataTransfer })
    const target = screen.getByLabelText(new RegExp(`^${onto} timezone row$`, 'i'))
    layout(target, 100)
    dragAt('dragOver', target, dataTransfer, half)
    dragAt('drop', target, dataTransfer, half)
    fireEvent.dragEnd(handle(from), { dataTransfer })
    return dataTransfer
  }

  it('gives every row a labelled drag handle', () => {
    render(<App />)
    for (const l of ['Miami', 'IST', 'AEST', 'London', 'Tokyo']) {
      expect(handle(l)).toHaveAttribute('draggable', 'true')
    }
  })

  it('does not render handles when reordering is not enabled', () => {
    render(
      <TimeGrid
        locations={DEFAULT_LOCATIONS}
        homeZone="Asia/Kolkata"
        selectedDate={{ year: 2024, month: 7, day: 15 }}
        timeFormat="12h"
        activeHour={null}
        now={DateTime.fromISO('2024-07-15T12:00:00', { zone: 'Asia/Kolkata' })}
        onSelectHour={vi.fn()}
        onHoverHour={vi.fn()}
        onNudgeHour={vi.fn()}
        onRemove={vi.fn()}
        onSetHome={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /^Reorder/ })).toBeNull()
  })

  it('moves a row above another when dropped on its top half', () => {
    render(<App />)
    drag('London', 'Miami', TOP_HALF)
    expect(order()).toEqual(['London', 'Miami', 'IST', 'AEST', 'Tokyo'])
  })

  it('moves a row below another when dropped on its bottom half', () => {
    render(<App />)
    drag('Miami', 'Tokyo', BOTTOM_HALF)
    expect(order()).toEqual(['IST', 'AEST', 'London', 'Tokyo', 'Miami'])
  })

  it('handles the in-between gaps (drag down past one row)', () => {
    render(<App />)
    // Miami → the gap above London: lands directly before London, i.e. after AEST.
    drag('Miami', 'London', TOP_HALF)
    expect(order()).toEqual(['IST', 'AEST', 'Miami', 'London', 'Tokyo'])
  })

  it('leaves the order alone when dropped where it already is', () => {
    render(<App />)
    const before = order()
    drag('IST', 'IST', TOP_HALF) // gap above itself
    drag('IST', 'IST', BOTTOM_HALF) // gap below itself
    drag('IST', 'AEST', TOP_HALF) // same gap as "below itself"
    expect(order()).toEqual(before)
  })

  it('persists the new order and keeps home and selection intact', () => {
    render(<App />)
    fireEvent.mouseDown(
      within(screen.getByLabelText(/^IST timezone row$/)).getByRole('button', { name: /home hour 10,/ })
    )
    fireEvent.mouseUp(window)
    drag('Tokyo', 'Miami', TOP_HALF)
    expect(savedOrder()).toEqual(['Tokyo', 'Miami', 'IST', 'AEST', 'London'])
    expect(within(screen.getByLabelText(/^IST timezone row$/)).getByLabelText('Home timezone')).toBeInTheDocument()
    expect(
      within(screen.getByLabelText(/^IST timezone row$/)).getByRole('button', { name: /home hour 10,/ })
    ).toHaveClass('is-selected')
  })

  it('uses the label cell as the drag image and carries the location id', () => {
    render(<App />)
    const dataTransfer = transfer()
    fireEvent.dragStart(handle('London'), { dataTransfer })
    expect(dataTransfer.effectAllowed).toBe('move')
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'london')
    const [ghost] = dataTransfer.setDragImage.mock.calls[0]
    expect((ghost as HTMLElement).classList.contains('location-meta')).toBe(true)
    fireEvent.dragEnd(handle('London'), { dataTransfer })
  })

  it('shows an insertion line and fades the dragged row, then clears both', async () => {
    render(<App />)
    const dataTransfer = transfer()
    fireEvent.dragStart(handle('Tokyo'), { dataTransfer })
    await waitFor(() =>
      expect(screen.getByLabelText(/^Tokyo timezone row$/)).toHaveClass('is-dragging')
    )

    const aest = screen.getByLabelText(/^AEST timezone row$/)
    layout(aest, 100)
    dragAt('dragOver', aest, dataTransfer, TOP_HALF)
    expect(aest).toHaveClass('drop-before')

    // A gap that would change nothing shows no line.
    const tokyo = screen.getByLabelText(/^Tokyo timezone row$/)
    layout(tokyo, 100)
    dragAt('dragOver', tokyo, dataTransfer, BOTTOM_HALF)
    expect(document.querySelector('.drop-before, .drop-after')).toBeNull()

    // Below the last row, for a different dragged row, the line sits under the last row.
    fireEvent.dragEnd(handle('Tokyo'), { dataTransfer })
    fireEvent.dragStart(handle('Miami'), { dataTransfer })
    await waitFor(() =>
      expect(screen.getByLabelText(/^Miami timezone row$/)).toHaveClass('is-dragging')
    )
    layout(tokyo, 100)
    dragAt('dragOver', tokyo, dataTransfer, BOTTOM_HALF)
    expect(tokyo).toHaveClass('drop-after')

    fireEvent.dragEnd(handle('Miami'), { dataTransfer })
    expect(document.querySelector('.is-dragging, .drop-before, .drop-after')).toBeNull()
  })

  it('keeps the indicator while the pointer moves between children, clears it on leaving the grid', async () => {
    render(<App />)
    const dataTransfer = transfer()
    fireEvent.dragStart(handle('Tokyo'), { dataTransfer })
    await waitFor(() =>
      expect(screen.getByLabelText(/^Tokyo timezone row$/)).toHaveClass('is-dragging')
    )
    const aest = screen.getByLabelText(/^AEST timezone row$/)
    layout(aest, 100)
    dragAt('dragOver', aest, dataTransfer, TOP_HALF)
    expect(aest).toHaveClass('drop-before')

    const grid = screen.getByRole('grid')
    grid.getBoundingClientRect = () =>
      ({ top: 50, bottom: 500, left: 0, right: 1000, width: 1000, height: 450, x: 0, y: 50, toJSON() {} }) as DOMRect
    const leave = (x: number, y: number) => {
      // Chromium leaves relatedTarget null on drag events, so the code must not depend on it.
      const event = createEvent.dragLeave(aest, { dataTransfer, relatedTarget: null })
      Object.defineProperty(event, 'clientX', { value: x })
      Object.defineProperty(event, 'clientY', { value: y })
      fireEvent(aest, event)
    }

    leave(300, 150) // crossing from one child to another, still inside the grid
    expect(aest).toHaveClass('drop-before')

    leave(300, 20) // pointer is above the grid (over the toolbar)
    expect(aest).not.toHaveClass('drop-before')
    fireEvent.dragEnd(handle('Tokyo'), { dataTransfer })
  })

  it('positions the indicator on dragenter alone (a fast pointer may skip dragover)', async () => {
    render(<App />)
    const dataTransfer = transfer()
    fireEvent.dragStart(handle('Tokyo'), { dataTransfer })
    await waitFor(() =>
      expect(screen.getByLabelText(/^Tokyo timezone row$/)).toHaveClass('is-dragging')
    )
    const london = screen.getByLabelText(/^London timezone row$/)
    layout(london, 100)
    const enter = createEvent.dragEnter(london, { dataTransfer })
    Object.defineProperty(enter, 'clientY', { value: TOP_HALF })
    expect(fireEvent(london, enter)).toBe(false) // cancelled, like dragover
    expect(london).toHaveClass('drop-before')
    fireEvent.dragEnd(handle('Tokyo'), { dataTransfer })
  })

  it('accepts only its own drags (a dragged file must not be treated as a drop target)', () => {
    render(<App />)
    const target = screen.getByLabelText(/^AEST timezone row$/)
    layout(target, 100)
    // Foreign drag: not cancelled, so the browser keeps refusing the drop.
    expect(dragAt('dragOver', target, transfer(), TOP_HALF)).toBe(true)
    dragAt('drop', target, transfer(), TOP_HALF)
    expect(order()).toEqual(['Miami', 'IST', 'AEST', 'London', 'Tokyo'])

    // Our own drag: cancelled, which is what marks the row as a valid drop target.
    const own = transfer()
    fireEvent.dragStart(handle('Miami'), { dataTransfer: own })
    expect(dragAt('dragOver', target, own, TOP_HALF)).toBe(false)
    fireEvent.dragEnd(handle('Miami'), { dataTransfer: own })
  })

  it('ignores a drop after the drag was cancelled', () => {
    render(<App />)
    const dataTransfer = transfer()
    fireEvent.dragStart(handle('London'), { dataTransfer })
    fireEvent.dragEnd(handle('London'), { dataTransfer }) // e.g. Escape mid-drag
    const target = screen.getByLabelText(/^Miami timezone row$/)
    layout(target, 100)
    dragAt('drop', target, dataTransfer, TOP_HALF)
    expect(order()).toEqual(['Miami', 'IST', 'AEST', 'London', 'Tokyo'])
  })

  describe('keyboard', () => {
    it('moves a row with ↑ / ↓ on its handle and keeps focus there', async () => {
      const user = userEvent.setup()
      render(<App />)
      handle('London').focus()
      await user.keyboard('{ArrowUp}')
      expect(order()).toEqual(['Miami', 'IST', 'London', 'AEST', 'Tokyo'])
      expect(handle('London')).toHaveFocus()

      await user.keyboard('{ArrowUp}{ArrowUp}')
      expect(order()[0]).toBe('London')
      expect(handle('London')).toHaveFocus()

      await user.keyboard('{ArrowDown}')
      expect(order().indexOf('London')).toBe(1)
      expect(handle('London')).toHaveFocus()
    })

    it('announces the new position to screen readers', async () => {
      const user = userEvent.setup()
      render(<App />)
      handle('London').focus()
      await user.keyboard('{ArrowUp}')
      expect(screen.getByText('London moved to position 3 of 5')).toBeInTheDocument()
    })

    it('says so at the ends of the list instead of doing nothing silently', async () => {
      const user = userEvent.setup()
      render(<App />)
      handle('Miami').focus()
      await user.keyboard('{ArrowUp}')
      expect(screen.getByText('Miami is already first')).toBeInTheDocument()
      handle('Tokyo').focus()
      await user.keyboard('{ArrowDown}')
      expect(screen.getByText('Tokyo is already last')).toBeInTheDocument()
      expect(order()).toEqual(['Miami', 'IST', 'AEST', 'London', 'Tokyo'])
    })

    it('does not steal Left/Right from the grid', async () => {
      const user = userEvent.setup()
      render(<App />)
      handle('IST').focus()
      await user.keyboard('{ArrowLeft}{ArrowRight}')
      expect(order()).toEqual(['Miami', 'IST', 'AEST', 'London', 'Tokyo'])
    })
  })
})
