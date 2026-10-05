/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DateTime } from 'luxon'
import App from '@renderer/App'
import TimeGrid from '@renderer/components/TimeGrid'
import MobileGrid from '@mobile/MobileGrid'
import PlannerBar from '@ui/PlannerBar'
import SettingsPanel from '@ui/SettingsPanel'
import { buildTimelineForLocations } from '@core/formatters'
import { setHolidayLoader, type CalendarDay, type HolidayLookup } from '@core/holidays'
import { HB_STORAGE_KEY } from '@core/persistence'
import { meetingFromRange } from '@core/meeting'
import { summarizePlanner } from '@core/planner'
import type { WorkHours } from '@core/timeEngine'
import type { Location } from '@core/timezones'

// A made-up calendar, so nothing here depends on the bundled data or on the day the suite runs.
const calendar: Record<string, Record<string, string[]>> = {
  'Asia/Tokyo': { '2026-11-3': ['Culture Day'], '2026-12-24': ['Edge Day'] },
  'Asia/Kolkata': { '2026-1-26': ['Republic Day'] }
}
const holidays: HolidayLookup = (zone, day: CalendarDay) =>
  calendar[zone]?.[`${day.year}-${day.month}-${day.day}`] ?? []

const IST: Location = { id: 'ist', label: 'IST', iana: 'Asia/Kolkata', isHome: true }
const TOKYO: Location = { id: 'tokyo', label: 'Tokyo', iana: 'Asia/Tokyo' }
const KATHMANDU: Location = { id: 'ktm', label: 'Kathmandu', iana: 'Asia/Kathmandu' }
const work: WorkHours = { start: 9, end: 17 }
const CULTURE_DAY = { year: 2026, month: 11, day: 3 }

describe('PlannerBar and public holidays', () => {
  function setup(
    props: Partial<React.ComponentProps<typeof PlannerBar>> & { date?: typeof CULTURE_DAY; people?: Location[] } = {}
  ) {
    const { date = CULTURE_DAY, people = [IST, TOKYO], workHours = work, ...rest } = props
    const columns = buildTimelineForLocations(date, people, IST.iana, holidays)
    render(
      <PlannerBar
        meeting={null}
        onStartMinute={vi.fn()}
        columns={columns}
        locations={people}
        homeZone={IST.iana}
        timeFormat="12h"
        workHours={workHours}
        summary={summarizePlanner(columns, people, workHours)}
        title=""
        onTitle={vi.fn()}
        onSelectRange={vi.fn()}
        onResize={vi.fn()}
        onClear={vi.fn()}
        {...rest}
      />
    )
  }

  it('says nothing about holidays on an ordinary day', () => {
    setup({ date: { year: 2026, month: 11, day: 10 } })
    expect(screen.queryByText(/public holiday/i)).toBeNull()
    expect(screen.getByText(/you’re working and nobody’s asleep:/)).toBeInTheDocument()
  })

  it('names the cities on holiday, even before anything is selected', () => {
    setup()
    expect(screen.getByText(/Tokyo \(Culture Day\)/)).toBeInTheDocument()
    expect(screen.getByText('Public holidays:')).toHaveClass('sr-only')
  })

  it('explains why there are no best times when the holiday takes them away', () => {
    setup()
    // Tokyo is off all through the working day, so the most anyone can offer is one of two.
    expect(screen.getByText(/No time works for everyone/)).toBeInTheDocument()
    expect(screen.getByText(/1 of 2 available, 1 on holiday/)).toBeInTheDocument()
  })

  it('still suggests best times when the holiday only touches hours outside them', () => {
    // Tokyo's 24 December starts at 20:30 IST on the 23rd: after the working day, while Tokyo sleeps.
    setup({ date: { year: 2026, month: 12, day: 23 } })
    expect(screen.getByText(/Edge Day/)).toBeInTheDocument()
    expect(screen.getByText(/you’re working and nobody’s asleep or on holiday:/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '9:00 AM – 6:00 PM IST' })).toBeInTheDocument()
  })

  it('lists the holiday beside the city in the meeting, and in the summary', () => {
    setup({ meeting: meetingFromRange({ start: 9, end: 10 }) })
    const people = screen.getByRole('list', { name: 'Meeting time for each location' })
    expect(within(people).getByText('Culture Day')).toBeInTheDocument()
    expect(within(people).getAllByText(/Public holiday: Culture Day/)[0]).toHaveClass('sr-only')
    expect(screen.getByText(/Tokyo is on a public holiday \(Culture Day\)\./)).toBeInTheDocument()
    expect(screen.queryByText(/day off/)).toBeNull() // that is Tokyo’s, not yours
  })

  it('says it is your own day off when the holiday is at home, and why there are no working hours', () => {
    const columns = buildTimelineForLocations({ year: 2026, month: 1, day: 26 }, [IST, TOKYO], IST.iana, holidays)
    const props = { columns, meeting: meetingFromRange({ start: 9, end: 10 }) }
    setup({ ...props, date: { year: 2026, month: 1, day: 26 } })
    expect(screen.getByText(/Outside your working hours/)).toBeInTheDocument()
    expect(screen.getByText(/IST is on a public holiday \(Republic Day\)\. At home that is a day off\./)).toBeInTheDocument()
  })

  it('does not call it a day off for someone who works through holidays', () => {
    setup({
      date: { year: 2026, month: 1, day: 26 },
      meeting: meetingFromRange({ start: 9, end: 10 }),
      workHours: { ...work, holidaysOff: false }
    })
    expect(screen.getByText(/Inside your working hours/)).toBeInTheDocument()
    expect(screen.getByText(/IST is on a public holiday \(Republic Day\)\./)).toBeInTheDocument()
    expect(screen.queryByText(/day off/)).toBeNull()
  })

  it('names two cities on holiday in one sentence', () => {
    const both: HolidayLookup = (zone) => (zone === 'Asia/Tokyo' ? ['Culture Day'] : zone === 'Asia/Kolkata' ? ['Local Day'] : [])
    const people = [IST, TOKYO]
    const columns = buildTimelineForLocations(CULTURE_DAY, people, IST.iana, both)
    render(
      <PlannerBar
        meeting={meetingFromRange({ start: 9, end: 9 })}
        onStartMinute={vi.fn()}
        columns={columns}
        locations={people}
        homeZone={IST.iana}
        timeFormat="12h"
        workHours={{ ...work, holidaysOff: false }}
        summary={summarizePlanner(columns, people, { ...work, holidaysOff: false })}
        title=""
        onTitle={vi.fn()}
        onSelectRange={vi.fn()}
        onResize={vi.fn()}
        onClear={vi.fn()}
      />
    )
    expect(screen.getByText(/IST \(Local Day\) and Tokyo \(Culture Day\) are on a public holiday\./)).toBeInTheDocument()
  })
})

describe('SettingsPanel and public holidays', () => {
  function setup(props: Partial<React.ComponentProps<typeof SettingsPanel>> = {}) {
    const onWorkHours = vi.fn()
    render(
      <SettingsPanel
        theme="system"
        timeFormat="12h"
        workHours={work}
        onTheme={vi.fn()}
        onTimeFormat={vi.fn()}
        onWorkHours={onWorkHours}
        {...props}
      />
    )
    return { onWorkHours }
  }
  const toggle = () => screen.getByRole('checkbox', { name: /Public holidays .* are days off/ })

  it('has no holiday section until it is told which cities are on screen', () => {
    setup()
    expect(screen.queryByText('Public holidays')).toBeNull()
  })

  it('names the home country and is on by default', () => {
    setup({ locations: [IST, TOKYO] })
    expect(screen.getByRole('checkbox', { name: 'Public holidays in India are days off' })).toBeChecked()
  })

  it('is off for someone who works through holidays, and reports each change', async () => {
    const user = userEvent.setup()
    const first = setup({ locations: [IST], workHours: { ...work, holidaysOff: false } })
    expect(toggle()).not.toBeChecked()
    await user.click(toggle())
    expect(first.onWorkHours).toHaveBeenCalledWith({ ...work, holidaysOff: true })
  })

  it('turns it off with a click', async () => {
    const user = userEvent.setup()
    const { onWorkHours } = setup({ locations: [IST] })
    await user.click(toggle())
    expect(onWorkHours).toHaveBeenCalledWith({ ...work, holidaysOff: false })
  })

  it('does not name a country when home belongs to none', () => {
    setup({ locations: [{ id: 'utc', label: 'UTC', iana: 'UTC', isHome: true }] })
    expect(screen.getByRole('checkbox', { name: 'Public holidays at home are days off' })).toBeChecked()
  })

  it('says where the data is partial or missing — and nowhere it is complete', () => {
    setup({ locations: [IST, TOKYO, KATHMANDU] })
    expect(screen.getByText('India:')).toBeInTheDocument()
    expect(screen.getByText(/Holi, Diwali and Eid/)).toBeInTheDocument()
    expect(screen.getByText('Nepal:')).toBeInTheDocument()
    expect(screen.getByText(/no public holiday data yet/)).toBeInTheDocument()
    expect(screen.queryByText('Japan:')).toBeNull()
  })

  it('credits the data and says what years it covers', () => {
    setup({ locations: [IST] })
    expect(screen.getByText(/Holidays cover 20\d\d–20\d\d, from date-holidays .* CC BY 3\.0/)).toBeInTheDocument()
  })
})

describe('tiles on a public holiday', () => {
  const now = DateTime.fromISO('2026-11-03T12:00:00', { zone: 'Asia/Kolkata' })
  const tileOf = (city: string, hour: number) =>
    within(screen.getByLabelText(new RegExp(`^${city} timezone row$`))).getByRole('button', {
      name: new RegExp(`home hour ${hour},`)
    })

  it('marks the holiday on the desktop tile with a glyph, a tooltip and an accessible name', () => {
    render(
      <TimeGrid
        locations={[IST, TOKYO]}
        homeZone={IST.iana}
        selectedDate={CULTURE_DAY}
        timeFormat="12h"
        activeHour={null}
        now={now}
        holidays={holidays}
        onSelectHour={vi.fn()}
        onHoverHour={vi.fn()}
        onNudgeHour={vi.fn()}
        onRemove={vi.fn()}
        onSetHome={vi.fn()}
      />
    )
    const tokyo = tileOf('Tokyo', 12)
    expect(tokyo).toHaveClass('has-holiday')
    expect(tokyo).toHaveAccessibleName(/, Public holiday: Culture Day\)$/)
    expect(tokyo).toHaveAttribute('title', 'Public holiday: Culture Day')
    expect(tokyo.querySelector('.tile-holiday svg')).not.toBeNull()
    // The next morning in Tokyo it is the 4th, and the home row is not on holiday at all.
    expect(tileOf('Tokyo', 22)).not.toHaveClass('has-holiday')
    expect(tileOf('IST', 12)).not.toHaveClass('has-holiday')
    expect(tileOf('IST', 12)).not.toHaveAttribute('title')
  })

  it('marks the holiday on the touch tile too', () => {
    const people = [IST, TOKYO]
    const { container } = render(
      <MobileGrid
        locations={people}
        homeZone={IST.iana}
        columns={buildTimelineForLocations(CULTURE_DAY, people, IST.iana, holidays)}
        selectedDate={CULTURE_DAY}
        selection={null}
        workHours={work}
        timeFormat="12h"
        now={now}
        onSelectHour={vi.fn()}
        onOpenCity={vi.fn()}
      />
    )
    const marked = [...container.querySelectorAll('button.m-tile.has-holiday')]
    expect(marked.length).toBe(21) // Tokyo's 3 November runs to 20:30 IST: home hours 0–20
    expect(marked[0]).toHaveAccessibleName(/Tokyo .*, Public holiday: Culture Day\)$/)
    expect(marked[0].querySelector('.tile-holiday svg')).not.toBeNull()
  })
})

describe('the whole app on a public holiday at home', () => {
  // Monday 26 January 2026, 10:00 in Kolkata (home): Republic Day.
  const REPUBLIC_DAY_MORNING = new Date('2026-01-26T04:30:00Z')
  const istTiles = () => screen.getByLabelText(/^IST timezone row$/)
  const workTiles = () => istTiles().querySelectorAll('.hour-tile.is-work').length

  beforeEach(() => {
    localStorage.removeItem(HB_STORAGE_KEY)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(REPUBLIC_DAY_MORNING)
    setHolidayLoader(async (code) => (code === 'IN' ? { '2026': [['01-26', 'Republic Day']] } : null))
  })
  afterEach(() => vi.useRealTimers())

  it('takes the working hours away for the day and says why, once the holiday has loaded', async () => {
    render(<App />)
    expect(workTiles()).toBe(9) // until the file for India arrives, an ordinary Monday
    await waitFor(() => expect(workTiles()).toBe(0))
    expect(istTiles().querySelectorAll('.hour-tile.has-holiday')).toHaveLength(24)
    expect(screen.getByText(/IST \(Republic Day\) — a day off for you/)).toBeInTheDocument()
    // The other cities have no holiday today, and show the same (now empty) working window.
    expect(screen.getByLabelText(/^Tokyo timezone row$/).querySelectorAll('.has-holiday')).toHaveLength(0)
  })

  it('explains the pennant in the legend', () => {
    render(<App />)
    expect(within(screen.getByRole('contentinfo', { name: 'Legend' })).getByText('Public holiday')).toBeInTheDocument()
  })

  it('brings them back, and remembers the choice, when holidays are not days off', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => expect(workTiles()).toBe(0))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('checkbox', { name: 'Public holidays in India are days off' }))
    expect(workTiles()).toBe(9)
    expect(istTiles().querySelectorAll('.hour-tile.has-holiday')).toHaveLength(24) // still marked
    expect(JSON.parse(localStorage.getItem(HB_STORAGE_KEY)!).workHours).toEqual({ start: 9, end: 17, holidaysOff: false })
  })

  it('shows nothing, and does not break, when the holiday data cannot be loaded', async () => {
    setHolidayLoader(async () => {
      throw new Error('offline')
    })
    render(<App />)
    await Promise.resolve()
    expect(workTiles()).toBe(9)
    expect(document.querySelectorAll('.has-holiday')).toHaveLength(0)
  })
})
