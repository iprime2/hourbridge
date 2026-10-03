/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DateTime } from 'luxon'
import CityPicker from '@ui/CityPicker'
import PlannerBar from '@ui/PlannerBar'
import SettingsPanel from '@ui/SettingsPanel'
import { detectLocalZone, localCityOption } from '@core/cityOptions'
import { summarizePlanner } from '@core/planner'
import { buildDayTimeline } from '@core/timeEngine'
import type { Location } from '@core/timezones'

const NOW = DateTime.fromISO('2024-01-15T12:00:00Z')

describe('CityPicker', () => {
  function setup(props: Partial<React.ComponentProps<typeof CityPicker>> = {}) {
    const onPick = vi.fn()
    const onEscape = vi.fn()
    render(
      <CityPicker
        excludeIds={new Set()}
        timeFormat="24h"
        now={NOW}
        onPick={onPick}
        onEscape={onEscape}
        {...props}
      />
    )
    return { onPick, onEscape, input: screen.getByLabelText('Search cities') }
  }

  it('finds cities by country and picks the highlighted result with Enter', async () => {
    const user = userEvent.setup()
    const { onPick, input } = setup()
    await user.type(input, 'germany')
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Berlin')
    await user.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'berlin' }))
  })

  it('moves the highlight with the arrow keys and never past the ends', async () => {
    const user = userEvent.setup()
    const { onPick, input } = setup()
    await user.type(input, 'par')
    const options = screen.getAllByRole('option')
    expect(options.length).toBeGreaterThan(1)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowUp}') // already at the top
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1].id)

    await user.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0][0].id).not.toBe(screen.getAllByRole('option')[0].id)
  })

  it('shows each city with its current time in the chosen format', async () => {
    const user = userEvent.setup()
    const { input } = setup({ timeFormat: '24h' })
    await user.type(input, 'tokyo')
    // 12:00 UTC is 21:00 in Tokyo.
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('21:00')
  })

  it('reports Escape to the container and clicking picks', async () => {
    const user = userEvent.setup()
    const { onPick, onEscape, input } = setup()
    await user.type(input, 'tokyo')
    await user.click(screen.getAllByRole('option')[0])
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'tokyo' }))
    await user.type(input, '{Escape}')
    expect(onEscape).toHaveBeenCalled()
  })

  it('does not offer cities that are already on the grid', async () => {
    const user = userEvent.setup()
    const { input } = setup({ excludeIds: new Set(['london']) })
    await user.type(input, 'london')
    expect(screen.queryByRole('option', { name: /^London/ })).toBeNull()
  })

  it('searches by UTC offset', async () => {
    const user = userEvent.setup()
    const { input } = setup()
    await user.type(input, '+9')
    const texts = screen.getAllByRole('option').map((o) => o.textContent)
    expect(texts.some((t) => t?.includes('Tokyo'))).toBe(true)
  })

  it('offers "My location" first on an empty query unless that zone is already shown', () => {
    const zone = detectLocalZone()
    const local = localCityOption()
    if (!zone || !local) return // runtime can't report a zone; nothing to assert
    setup()
    expect(screen.getAllByRole('option')[0]).toHaveTextContent(/My location/)
  })

  it('hides "My location" when its zone is already on the grid', () => {
    const zone = detectLocalZone()
    if (!zone) return
    setup({ existingZones: new Set([localCityOption()!.iana]) })
    expect(screen.queryByText(/My location/)).toBeNull()
  })

  it('has an empty state', async () => {
    const user = userEvent.setup()
    const { input } = setup()
    await user.type(input, 'zzzz-nothing')
    expect(screen.getByText(/no matching cities/i)).toBeInTheDocument()
    await user.keyboard('{Enter}') // nothing highlighted: must not throw
  })
})

describe('SettingsPanel', () => {
  function setup(overrides: Partial<React.ComponentProps<typeof SettingsPanel>> = {}) {
    const handlers = {
      onTheme: vi.fn(),
      onTimeFormat: vi.fn(),
      onWorkHours: vi.fn(),
      onSortByOffset: vi.fn()
    }
    render(
      <SettingsPanel
        theme="system"
        timeFormat="12h"
        workHours={{ start: 9, end: 18 }}
        {...handlers}
        {...overrides}
      />
    )
    return handlers
  }

  it('exposes theme and format as radio groups with the current value checked', () => {
    setup()
    const theme = screen.getByRole('radiogroup', { name: 'Theme' })
    expect(within(theme).getByRole('radio', { name: 'System' })).toBeChecked()
    const format = screen.getByRole('radiogroup', { name: 'Time format' })
    expect(within(format).getByRole('radio', { name: '12-hour' })).toBeChecked()
  })

  it('reports theme and format changes', async () => {
    const user = userEvent.setup()
    const h = setup()
    await user.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(h.onTheme).toHaveBeenCalledWith('dark')
    await user.click(screen.getByRole('radio', { name: '24-hour' }))
    expect(h.onTimeFormat).toHaveBeenCalledWith('24h')
  })

  it('names the home zone the working hours are defined in', () => {
    setup({ homeLabel: 'IST' })
    expect(screen.getByText('Your working hours (IST time)')).toBeInTheDocument()
  })

  it('explains that the window covers whole tiles, end included, in every city', () => {
    setup({ workHours: { start: 13, end: 21 } })
    expect(screen.getByText(/Covers the 1:00 PM … 9:00 PM tiles on Mon–Fri/)).toBeInTheDocument()
    expect(screen.getByText(/same window in its own local time/)).toBeInTheDocument()
  })

  it('says which days the green tiles appear on', () => {
    setup({ workHours: { start: 13, end: 21, days: [1, 2, 3, 6, 7] } })
    expect(screen.getByText(/tiles on Sat–Wed/)).toBeInTheDocument()
  })

  describe('working days', () => {
    const dayButtons = () => within(screen.getByRole('group', { name: 'Working days' })).getAllByRole('button')
    const pressed = () =>
      dayButtons()
        .filter((b) => b.getAttribute('aria-pressed') === 'true')
        .map((b) => b.getAttribute('aria-label'))

    it('shows Monday–Friday as on by default, one button per day', () => {
      setup()
      expect(dayButtons().map((b) => b.textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
      expect(pressed()).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
    })

    it('reflects a custom week', () => {
      setup({ workHours: { start: 9, end: 17, days: [1, 2, 3, 6, 7] } })
      expect(pressed()).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Saturday', 'Sunday'])
    })

    it('reports the new week when a day is tapped, keeping the hours', async () => {
      const user = userEvent.setup()
      const h = setup({ workHours: { start: 9, end: 17 } })
      await user.click(screen.getByRole('button', { name: 'Thursday' }))
      expect(h.onWorkHours).toHaveBeenLastCalledWith({ start: 9, end: 17, days: [1, 2, 3, 5] })
      await user.click(screen.getByRole('button', { name: 'Saturday' }))
      expect(h.onWorkHours).toHaveBeenLastCalledWith({ start: 9, end: 17, days: [1, 2, 3, 4, 5, 6] })
    })

    it('keeps the days when the hours change', async () => {
      const user = userEvent.setup()
      const days = [1, 2, 3, 6, 7]
      const h = setup({ workHours: { start: 9, end: 17, days } })
      await user.selectOptions(screen.getByLabelText('Working hours start'), '10')
      expect(h.onWorkHours).toHaveBeenLastCalledWith({ start: 10, end: 17, days })
      await user.selectOptions(screen.getByLabelText('Working hours end'), '20')
      expect(h.onWorkHours).toHaveBeenLastCalledWith({ start: 9, end: 20, days })
    })

    it('never turns off the last working day', async () => {
      const user = userEvent.setup()
      const h = setup({ workHours: { start: 9, end: 17, days: [3] } })
      await user.click(screen.getByRole('button', { name: 'Wednesday' }))
      expect(h.onWorkHours).toHaveBeenLastCalledWith({ start: 9, end: 17, days: [3] })
    })

    it('can be operated from the keyboard', async () => {
      const user = userEvent.setup()
      const h = setup()
      screen.getByRole('button', { name: 'Friday' }).focus()
      await user.keyboard('{Enter}')
      expect(h.onWorkHours).toHaveBeenLastCalledWith({ start: 9, end: 18, days: [1, 2, 3, 4] })
    })
  })

  it('keeps working hours valid: the end is never before the start', async () => {
    const user = userEvent.setup()
    const h = setup({ workHours: { start: 9, end: 17 } })
    // End choices run from the start hour itself to 23 (a one-hour window is allowed).
    const end = screen.getByLabelText('Working hours end') as HTMLSelectElement
    expect(end.options).toHaveLength(15) // 9…23
    expect(end.options[0].textContent).toBe('9:00 AM')

    // Moving the start past the end pulls the end along with it.
    await user.selectOptions(screen.getByLabelText('Working hours start'), '20')
    expect(h.onWorkHours).toHaveBeenLastCalledWith({ start: 20, end: 20 })

    await user.selectOptions(end, '15')
    expect(h.onWorkHours).toHaveBeenLastCalledWith({ start: 9, end: 15 })
  })

  it('does not offer 24:00 — the last tile of the day starts at 11 PM', () => {
    setup({ workHours: { start: 9, end: 23 } })
    const end = screen.getByLabelText('Working hours end') as HTMLSelectElement
    expect(end.options[end.options.length - 1].textContent).toBe('11:00 PM')
    expect(end).toHaveValue('23')
  })

  it('formats the choices for the chosen clock', () => {
    setup({ workHours: { start: 9, end: 23 }, timeFormat: '24h' })
    const end = screen.getByLabelText('Working hours end') as HTMLSelectElement
    expect(end.options[end.options.length - 1].textContent).toBe('23:00')
  })

  it('only shows the sort button when a handler is supplied', async () => {
    const user = userEvent.setup()
    const h = setup()
    await user.click(screen.getByRole('button', { name: /sort rows/i }))
    expect(h.onSortByOffset).toHaveBeenCalled()
  })
})

describe('PlannerBar', () => {
  const IST: Location = { id: 'ist', label: 'IST', iana: 'Asia/Kolkata', isHome: true }
  const LONDON: Location = { id: 'london', label: 'London', iana: 'Europe/London' }
  const locations = [IST, LONDON]
  // Your working hours are IST 9:00 through the 5 PM tile (9–17 inclusive).
  // Mon 2024-01-15: London local = IST − 5:30, so London is asleep in home columns 4–11
  // and both cities are awake in columns 12–21 → the best shared window is 12–17.
  const work = { start: 9, end: 17 }
  const columns = buildDayTimeline({ year: 2024, month: 1, day: 15 }, [IST.iana, LONDON.iana], IST.iana)
  const summary = summarizePlanner(columns, locations, work)

  function setup(props: Partial<React.ComponentProps<typeof PlannerBar>> = {}) {
    const handlers = {
      onTitle: vi.fn(),
      onSelectRange: vi.fn(),
      onResize: vi.fn(),
      onClear: vi.fn()
    }
    render(
      <PlannerBar
        selection={null}
        columns={columns}
        locations={locations}
        homeZone={IST.iana}
        timeFormat="12h"
        workHours={work}
        summary={summary}
        title=""
        {...handlers}
        {...props}
      />
    )
    return handlers
  }

  afterEach(() => vi.restoreAllMocks())

  // jsdom's Blob has no .text()/.stream(), so read it the old-fashioned way.
  const readBlob = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(blob)
    })

  it('with nothing selected, shows the hint and offers the times that work for everyone', async () => {
    const user = userEvent.setup()
    const h = setup({ hint: 'Tap an hour.' })
    expect(screen.getByText('Tap an hour.')).toBeInTheDocument()
    expect(screen.getByText(/you’re working and nobody’s asleep/)).toBeInTheDocument()
    // Columns 12–17 → 12:00 PM until the end of the 5 PM tile (6:00 PM).
    await user.click(screen.getByRole('button', { name: '12:00 PM – 6:00 PM IST' }))
    expect(h.onSelectRange).toHaveBeenCalledWith(12, 17)
  })

  it('suggests the best compromise when someone is always asleep during your hours', async () => {
    const user = userEvent.setup()
    // Working 9–11 IST: London is asleep (03:30–05:30) for all of it.
    const narrow = summarizePlanner(columns, locations, { start: 9, end: 11 })
    expect(narrow.sharedWindows).toEqual([])
    const h = setup({ summary: narrow, workHours: { start: 9, end: 11 } })
    expect(screen.getByText(/No time works for everyone/)).toBeInTheDocument()
    expect(screen.getByText(/1 of 2 awake/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '9:00 AM – 10:00 AM IST' }))
    expect(h.onSelectRange).toHaveBeenCalledWith(9, 9)
  })

  it('says when the best compromise falls outside your hours (e.g. a weekend)', () => {
    const saturday = buildDayTimeline({ year: 2024, month: 1, day: 20 }, [IST.iana, LONDON.iana], IST.iana)
    setup({ columns: saturday, summary: summarizePlanner(saturday, locations, work) })
    expect(screen.getByText(/2 of 2 awake, outside your hours/)).toBeInTheDocument()
  })

  it('shows nothing to suggest when nobody is ever awake at once', () => {
    const empty = { scores: [], sharedWindows: [], awakeWindows: [], best: null }
    setup({ summary: empty })
    expect(screen.queryByText(/Best times/)).toBeNull()
    expect(screen.queryByText(/No time works/)).toBeNull()
  })

  it('describes the selected meeting in every location', () => {
    setup({ selection: { start: 12, end: 17 } })
    // The home time shows in the header and again in IST's own chip.
    expect(screen.getAllByText(/Mon, Jan 15 · 12:00 PM – 6:00 PM/)).toHaveLength(2)
    expect(screen.getByText('6h')).toBeInTheDocument()
    const people = screen.getByRole('list', { name: /meeting time for each location/i })
    expect(within(people).getAllByRole('listitem')).toHaveLength(2)
    expect(within(people).getByText(/Mon, Jan 15 · 6:30 AM – 12:30 PM/)).toBeInTheDocument() // London
    expect(
      screen.getByText(/Inside your working hours\s*·\s*everyone is awake\./)
    ).toBeInTheDocument()
  })

  const chip = (label: string) =>
    within(screen.getByRole('list', { name: /meeting time for each location/i }))
      .getByText(label)
      .closest('li')!

  it('marks each person: awake in your hours, awake outside them, or asleep', () => {
    // 10:00 IST is inside your hours; London is 04:30 (asleep).
    setup({ selection: { start: 10, end: 10 } })
    expect(chip('IST')).toHaveClass('is-work')
    expect(chip('London')).toHaveClass('is-night')
    expect(within(chip('London')).getByText('asleep')).toBeInTheDocument()
    expect(within(chip('IST')).getByText('awake, and inside your working hours')).toBeInTheDocument()
    expect(screen.getByText(/Inside your working hours\s*·\s*London is asleep\./)).toBeInTheDocument()
  })

  it('outside your hours nobody is "work" — they are simply awake', () => {
    // 21:00 IST: after your 17 end tile; London 15:30 is awake.
    setup({ selection: { start: 21, end: 21 } })
    expect(chip('IST')).toHaveClass('is-awake')
    expect(chip('London')).toHaveClass('is-awake')
    expect(within(chip('IST')).getByText('awake, outside your working hours')).toBeInTheDocument()
    expect(screen.getByText(/Outside your working hours\s*·\s*everyone is awake\./)).toBeInTheDocument()
  })

  it('is "outside your hours" if any part of the selection leaves them', () => {
    // 16:00–19:00 IST spills two tiles past your 5 PM end tile.
    setup({ selection: { start: 16, end: 19 } })
    expect(screen.getByText(/Outside your working hours/)).toBeInTheDocument()
    expect(chip('IST')).toHaveClass('is-awake')
  })

  it('treats a person as asleep if they are asleep at any point of the meeting', () => {
    // 2–4 AM IST: IST is asleep throughout; London is awake at 2–3 but asleep at 4 (22:30).
    setup({ selection: { start: 2, end: 4 } })
    expect(chip('IST')).toHaveClass('is-night')
    expect(chip('London')).toHaveClass('is-night')
    expect(screen.getByText(/IST and London are asleep\./)).toBeInTheDocument()
  })

  it('lists sleepers compactly when there are many', () => {
    const many: Location[] = [
      IST,
      { id: 'a', label: 'A', iana: 'Europe/London' },
      { id: 'b', label: 'B', iana: 'Europe/London' },
      { id: 'c', label: 'C', iana: 'Europe/London' },
      { id: 'd', label: 'D', iana: 'Europe/London' }
    ]
    const cols = buildDayTimeline({ year: 2024, month: 1, day: 15 }, [IST.iana, 'Europe/London'], IST.iana)
    setup({
      locations: many,
      columns: cols,
      summary: summarizePlanner(cols, many, work),
      selection: { start: 10, end: 10 }
    })
    // London (04:30) is asleep for A–D: three named, the rest counted.
    expect(screen.getByText(/A, B, C \+1 more are asleep\./)).toBeInTheDocument()
  })

  it('lets the user resize, clear, and title the meeting', async () => {
    const user = userEvent.setup()
    const h = setup({ selection: { start: 15, end: 16 } })
    await user.click(screen.getByRole('button', { name: /lengthen/i }))
    expect(h.onResize).toHaveBeenCalledWith(1)
    await user.click(screen.getByRole('button', { name: /shorten/i }))
    expect(h.onResize).toHaveBeenCalledWith(-1)
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(h.onClear).toHaveBeenCalled()
    await user.type(screen.getByLabelText('Meeting title'), 'S')
    expect(h.onTitle).toHaveBeenCalledWith('S')
  })

  it('disables shortening at one hour and lengthening at the end of the day', () => {
    setup({ selection: { start: 23, end: 23 } })
    expect(screen.getByRole('button', { name: /shorten/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /lengthen/i })).toBeDisabled()
  })

  it('copies an invite with the meeting title', async () => {
    const user = userEvent.setup()
    setup({ selection: { start: 15, end: 17 }, title: 'Sprint sync' })
    await user.click(screen.getByRole('button', { name: 'Copy details' }))
    // user-event provides an in-memory clipboard for navigator.clipboard.
    const text = await navigator.clipboard.readText()
    expect(text.split('\n')[0]).toBe('Sprint sync')
    expect(text).toContain('IST (home): Mon, Jan 15 · 3:00 PM – 6:00 PM')
    expect(text).toContain('London: Mon, Jan 15 · 9:30 AM – 12:30 PM')
    expect(await screen.findByText('Copied to clipboard')).toBeInTheDocument()
  })

  it('downloads a calendar file named after the meeting', async () => {
    const user = userEvent.setup()
    let filename = ''
    let blob: Blob | null = null
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      blob = b as Blob
      return 'blob:test'
    })
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      filename = this.download
    })

    setup({ selection: { start: 15, end: 17 }, title: 'Sprint Sync!' })
    await user.click(screen.getByRole('button', { name: 'Add to calendar' }))

    expect(filename).toBe('sprint-sync.ics')
    expect(blob).not.toBeNull()
    expect((blob as unknown as Blob).type).toBe('text/calendar;charset=utf-8')
    const ics = await readBlob(blob as unknown as Blob)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('SUMMARY:Sprint Sync!')
    expect(ics).toContain('DTSTART:20240115T093000Z')
    expect(ics).toContain('DTEND:20240115T123000Z')
    expect(await screen.findByText('Calendar file saved')).toBeInTheDocument()
  })

  it('uses the platform share sheet when one is provided', async () => {
    const user = userEvent.setup()
    const onShare = vi.fn()
    setup({ selection: { start: 15, end: 15 }, onShare })
    expect(screen.queryByRole('button', { name: 'Copy details' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Share' }))
    expect(onShare).toHaveBeenCalledWith(
      expect.stringContaining('Meeting\nIST (home)'),
      expect.stringContaining('BEGIN:VCALENDAR'),
      'meeting.ics'
    )
  })

  it('reports a copy failure instead of pretending it worked', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    // The legacy fallback also fails in jsdom (no execCommand), so the UI must say so.
    setup({ selection: { start: 15, end: 15 } })
    await user.click(screen.getByRole('button', { name: 'Copy details' }))
    expect(await screen.findByText('Could not copy')).toBeInTheDocument()
  })
})
