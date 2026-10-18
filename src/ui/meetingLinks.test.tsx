/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DateTime } from 'luxon'
import App from '@renderer/App'
import PlannerBar from '@ui/PlannerBar'
import SharedCitiesPrompt, { type MeetingTarget } from '@ui/SharedCitiesPrompt'
import { HB_STORAGE_KEY } from '@core/persistence'
import { summarizePlanner } from '@core/planner'
import { encodeShare, parseShareHash, type SharedLink } from '@core/shareLink'
import { buildDayTimeline } from '@core/timeEngine'
import type { Location } from '@core/timezones'

const IST: Location = { id: 'ist', label: 'IST', iana: 'Asia/Kolkata', isHome: true }
const LONDON: Location = { id: 'london', label: 'London', iana: 'Europe/London' }
const PARIS: Location = { id: 'paris', label: 'Paris', iana: 'Europe/Paris' }
const TOKYO: Location = { id: 'tokyo', label: 'Tokyo', iana: 'Asia/Tokyo' }
const WORK = { start: 9, end: 17 }
const MONDAY = { year: 2024, month: 1, day: 15 }
// 9:30–10:00 AM IST on Monday 15 January 2024.
const START = DateTime.fromISO('2024-01-15T04:00:00Z', { zone: 'utc' })

function plannerBar(props: Partial<React.ComponentProps<typeof PlannerBar>> = {}, date = MONDAY) {
  const people = [IST, LONDON]
  const columns = buildDayTimeline(date, people.map((l) => l.iana), IST.iana)
  render(
    <PlannerBar
      meeting={null}
      columns={columns}
      locations={people}
      homeZone={IST.iana}
      timeFormat="12h"
      workHours={WORK}
      summary={summarizePlanner(columns, people, WORK)}
      title=""
      onTitle={vi.fn()}
      onSelectRange={vi.fn()}
      onResize={vi.fn()}
      onStartMinute={vi.fn()}
      onClear={vi.fn()}
      {...props}
    />
  )
}

describe('Copy link in the planner', () => {
  const meeting = { startMinute: 9 * 60 + 30, minutes: 30 }

  it('copies a link carrying this meeting and the cities, and says what it does', async () => {
    const user = userEvent.setup()
    plannerBar({ meeting, title: 'Design review', shareBase: 'https://hourbridge.example/app/' })
    await user.click(screen.getByRole('button', { name: 'Copy link' }))
    const url = await navigator.clipboard.readText()
    expect(url.startsWith('https://hourbridge.example/app/#share=')).toBe(true)
    const link = parseShareHash(url.slice(url.indexOf('#')))
    expect(link.status).toBe('ready')
    if (link.status !== 'ready') return
    expect(link.cities.map((c) => c.label)).toEqual(['IST', 'London'])
    expect(link.meeting!.start.toMillis()).toBe(START.toMillis())
    expect(link.meeting!.minutes).toBe(30)
    expect(link.meeting!.title).toBe('Design review')
    expect(await screen.findByRole('status')).toHaveTextContent('Link copied')
  })

  it('is offered next to Share in the touch layout too', () => {
    plannerBar({ meeting, onShare: vi.fn(), shareBase: 'https://hourbridge.example/' })
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
  })

  it('is not offered where the page has no address to share (desktop and iOS apps)', () => {
    plannerBar({ meeting })
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull()
  })

  it('is not offered for a meeting a link cannot carry', () => {
    plannerBar({ meeting, shareBase: 'https://hourbridge.example/' }, { year: 2101, month: 1, day: 3 })
    expect(screen.getByRole('button', { name: 'Copy details' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull()
  })
})

describe('the next days in the planner', () => {
  // The grid shows Monday 15 January 2024; London is on GMT, so the good hours are 12–6 PM IST.
  const chips = () =>
    within(screen.getByRole('combobox', { name: 'Days ahead to search' }).closest('.planner-upcoming') as HTMLElement)
      .queryAllByRole('button')
      .map((b) => b.textContent)

  it('lists the good times of the days after the one shown, and none on the weekend', () => {
    plannerBar({ upcoming: { from: MONDAY, now: DateTime.fromISO('2024-01-10T00:00:00Z'), onPick: vi.fn() } })
    expect(chips()).toEqual([
      'Tue, Jan 16 · 12:00 PM – 6:00 PM IST',
      'Wed, Jan 17 · 12:00 PM – 6:00 PM IST',
      'Thu, Jan 18 · 12:00 PM – 6:00 PM IST',
      'Fri, Jan 19 · 12:00 PM – 6:00 PM IST',
      'Mon, Jan 22 · 12:00 PM – 6:00 PM IST'
    ])
    // The accessible name starts with what is on the chip, so voice control finds it.
    expect(screen.getByRole('button', { name: 'Wed, Jan 17 · 12:00 PM – 6:00 PM IST' })).toBeInTheDocument()
  })

  it('opens the day with the slot selected when you pick one', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    plannerBar({ upcoming: { from: MONDAY, now: DateTime.fromISO('2024-01-10T00:00:00Z'), onPick } })
    await user.click(screen.getByRole('button', { name: /^Wed, Jan 17 · / }))
    expect(onPick).toHaveBeenCalledWith({ year: 2024, month: 1, day: 17 }, { start: 12, end: 17 })
  })

  it('looks two weeks ahead on request', async () => {
    const user = userEvent.setup()
    plannerBar({ upcoming: { from: MONDAY, now: DateTime.fromISO('2024-01-10T00:00:00Z'), onPick: vi.fn() } })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Days ahead to search' }), '14')
    expect(chips()).toHaveLength(10)
    expect(chips().at(-1)).toBe('Mon, Jan 29 · 12:00 PM – 6:00 PM IST')
  })

  it('does not offer hours that have already started', () => {
    // 1:10 PM IST on Tuesday the 16th: noon and 1 PM are under way, so Tuesday starts at 2 PM.
    plannerBar({ upcoming: { from: MONDAY, now: DateTime.fromISO('2024-01-16T07:40:00Z'), onPick: vi.fn() } })
    expect(chips()[0]).toBe('Tue, Jan 16 · 2:00 PM – 6:00 PM IST')
  })

  it('says so when nothing works, for instance with a city on holiday all week', () => {
    plannerBar({
      upcoming: {
        from: MONDAY,
        now: DateTime.fromISO('2024-01-10T00:00:00Z'),
        holidays: (zone) => (zone === LONDON.iana ? ['A long holiday'] : []),
        onPick: vi.fn()
      }
    })
    expect(chips()).toEqual([])
    expect(screen.getByText(/^No time in these 7 days works for everyone inside your working hours\. Try 14 days\.$/)).toBeInTheDocument()
  })

  it('is not shown while a meeting is being planned', () => {
    plannerBar({ meeting: { startMinute: 600, minutes: 60 }, upcoming: { from: MONDAY, now: DateTime.now(), onPick: vi.fn() } })
    expect(screen.queryByRole('combobox', { name: 'Days ahead to search' })).toBeNull()
  })
})

describe('a shared meeting in the banner', () => {
  const target = (onOpen = vi.fn()): MeetingTarget => ({ homeZone: IST.iana, homeLabel: 'IST', timeFormat: '12h', onOpen })
  const link = (meeting: Partial<{ start: DateTime; minutes: number; title: string }> = {}): SharedLink => ({
    status: 'ready',
    cities: [
      { label: 'London', iana: LONDON.iana },
      { label: 'Tokyo', iana: TOKYO.iana }
    ],
    meeting: { start: START, minutes: 30, title: 'Design review', ...meeting }
  })
  function setup(shared: SharedLink, meetingTarget: MeetingTarget | null = target()) {
    const h = { onAdd: vi.fn(), onReplace: vi.fn(), onDismiss: vi.fn() }
    render(<SharedCitiesPrompt link={shared} current={[IST, LONDON]} meetingTarget={meetingTarget ?? undefined} {...h} />)
    return h
  }
  const banner = () => screen.getByRole('region', { name: 'Shared meeting' })

  it('shows the meeting in your own time, with whom, and what opening it adds', () => {
    setup(link())
    expect(banner()).toHaveTextContent(
      '“Design review” was shared with you: Mon, Jan 15 · 9:30 AM – 10:00 AM IST, with London, Tokyo. Opening it adds Tokyo to your cities.'
    )
  })

  it('opens it in the planner on its own date', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    setup(link(), target(onOpen))
    await user.click(screen.getByRole('button', { name: 'Open in planner' }))
    expect(onOpen).toHaveBeenCalledWith(
      link().status === 'ready' ? (link() as Extract<SharedLink, { status: 'ready' }>).cities : [],
      { date: MONDAY, meeting: { startMinute: 9 * 60 + 30, minutes: 30 } },
      'Design review'
    )
  })

  it('names two or more new cities with "and"', () => {
    const h = { onAdd: vi.fn(), onReplace: vi.fn(), onDismiss: vi.fn() }
    render(<SharedCitiesPrompt link={link()} current={[IST]} meetingTarget={target()} {...h} />)
    expect(banner()).toHaveTextContent('Opening it adds London and Tokyo to your cities.')
  })

  it('reads plainly without a title, and shows a title as text, never as markup', () => {
    setup(link({ title: undefined }))
    expect(banner()).toHaveTextContent(/^A meeting was shared with you:/)
    cleanup()
    setup(link({ title: '<img src=x onerror=alert(1)>' }))
    expect(banner()).toHaveTextContent('“<img src=x onerror=alert(1)>” was shared with you')
    expect(banner().querySelector('img')).toBeNull()
  })

  it('offers the calendar instead when the planner cannot show it as one block', async () => {
    const user = userEvent.setup()
    let blob: Blob | null = null
    let filename = ''
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      blob = b as Blob
      return 'blob:test'
    })
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      filename = this.download
    })
    // 11:30 PM IST for an hour runs past midnight at home.
    const h = setup(link({ start: DateTime.fromISO('2024-01-15T18:00:00Z', { zone: 'utc' }), minutes: 60 }))
    expect(banner()).toHaveTextContent('Mon, Jan 15 · 11:30 PM – 12:30 AM (Tue) IST')
    expect(banner()).toHaveTextContent('crosses midnight or a clock change where you are')
    expect(screen.queryByRole('button', { name: 'Open in planner' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Add to calendar' }))
    expect(filename).toBe('design-review.ics')
    const ics = await (blob as unknown as Blob).text()
    expect(ics).toContain('DTSTART:20240115T180000Z')
    expect(ics).toContain('DTEND:20240115T190000Z')
    await user.click(screen.getByRole('button', { name: 'Add 1 new city' }))
    expect(h.onAdd).toHaveBeenCalledTimes(1)
  })

  it('falls back to the cities alone where meetings cannot be opened', () => {
    setup(link(), null)
    expect(screen.getByRole('region', { name: 'Shared cities' })).toHaveTextContent('2 cities were shared with you')
  })
})

describe('opening a shared meeting in the app', () => {
  const rows = () => screen.getAllByLabelText(/ timezone row$/).map((el) => el.getAttribute('aria-label')!.replace(' timezone row', ''))

  beforeEach(() => {
    localStorage.removeItem(HB_STORAGE_KEY)
    window.history.replaceState(null, '', '/')
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    window.history.replaceState(null, '', '/')
  })

  it('adds the new city, keeps your home, and shows the meeting on its day; Copy link gives it back', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', `/#share=${encodeShare([PARIS, { ...TOKYO, isHome: true }], { start: START, minutes: 30, title: 'Sync' })}`)
    render(<App />)
    expect(screen.getByRole('region', { name: 'Shared meeting' })).toHaveTextContent(
      '“Sync” was shared with you: Mon, Jan 15 · 9:30 AM – 10:00 AM IST, with Paris, Tokyo. Opening it adds Paris to your cities.'
    )
    await user.click(screen.getByRole('button', { name: 'Open in planner' }))

    expect(screen.queryByRole('region', { name: 'Shared meeting' })).toBeNull()
    expect(window.location.hash).toBe('')
    expect(rows()).toEqual(['Miami', 'IST', 'AEST', 'London', 'Tokyo', 'Paris'])
    expect(within(screen.getByLabelText('IST timezone row')).getByLabelText('Home timezone')).toBeInTheDocument()
    const planner = screen.getByRole('region', { name: 'Meeting planner' })
    expect(within(planner).getByRole('textbox', { name: 'Meeting title' })).toHaveValue('Sync')
    expect(planner).toHaveTextContent('Mon, Jan 15 · 9:30 AM – 10:00 AM IST')
    const people = within(planner).getByRole('list', { name: 'Meeting time for each location' })
    expect(within(people).getByText('Paris').closest('li')).toHaveTextContent('Mon, Jan 15 · 5:00 AM – 5:30 AM')

    await user.click(within(planner).getByRole('button', { name: 'Copy link' }))
    const url = await navigator.clipboard.readText()
    const again = parseShareHash(url.slice(url.indexOf('#')))
    expect(again.status === 'ready' && again.meeting?.start.toMillis()).toBe(START.toMillis())
    expect(again.status === 'ready' && again.meeting?.title).toBe('Sync')
  })
})
