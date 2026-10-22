/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '@renderer/App'
import PlannerBar from '@ui/PlannerBar'
import SettingsPanel from '@ui/SettingsPanel'
import SharedCitiesPrompt from '@ui/SharedCitiesPrompt'
import { HB_STORAGE_KEY } from '@core/persistence'
import { summarizePlanner } from '@core/planner'
import { buildSettingsFile, MAX_SETTINGS_FILE_CHARS, parseSettingsFile, type SettingsSnapshot } from '@core/settingsFile'
import { encodeShare, parseShareHash, type SharedLink } from '@core/shareLink'
import { buildDayTimeline } from '@core/timeEngine'
import { DEFAULT_LOCATIONS, type Location } from '@core/timezones'

const IST: Location = { id: 'ist', label: 'IST', iana: 'Asia/Kolkata', isHome: true }
const LONDON: Location = { id: 'london', label: 'London', iana: 'Europe/London' }
const PARIS: Location = { id: 'paris', label: 'Paris', iana: 'Europe/Paris' }
const TOKYO: Location = { id: 'tokyo', label: 'Tokyo', iana: 'Asia/Tokyo' }

describe('calendar links in the planner', () => {
  const people = [IST, LONDON]
  const work = { start: 9, end: 17 }
  // Monday 15 January 2024. 9:30–10:00 IST is 04:00–04:30 UTC.
  const columns = buildDayTimeline({ year: 2024, month: 1, day: 15 }, people.map((l) => l.iana), IST.iana)
  const meeting = { startMinute: 9 * 60 + 30, minutes: 30 }

  function setup(props: Partial<React.ComponentProps<typeof PlannerBar>> = {}) {
    render(
      <PlannerBar
        meeting={meeting}
        columns={columns}
        locations={people}
        homeZone={IST.iana}
        timeFormat="12h"
        workHours={work}
        summary={summarizePlanner(columns, people, work)}
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
  const google = () => screen.getByRole('link', { name: /Add to Google Calendar/ })
  const outlook = () => screen.getByRole('link', { name: /Add to Outlook/ })

  it('offers Google Calendar and Outlook, each opening in a new tab without handing over the page', () => {
    setup()
    for (const link of [google(), outlook()]) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(link).toHaveAccessibleName(/\(opens in a new tab\)$/)
    }
    expect(google()).toHaveTextContent('Google Calendar')
    expect(outlook()).toHaveTextContent('Outlook')
  })

  it('links to the meeting as planned: its title, real start and end, and the invite text', () => {
    setup({ title: 'Stand-up' })
    const g = new URL(google().getAttribute('href')!)
    expect(g.origin).toBe('https://calendar.google.com')
    expect(g.searchParams.get('text')).toBe('Stand-up')
    expect(g.searchParams.get('dates')).toBe('20240115T040000Z/20240115T043000Z')
    expect(g.searchParams.get('details')).toContain('IST (home): Mon, Jan 15 · 9:30 AM – 10:00 AM')
    expect(g.searchParams.get('details')).toContain('London: Mon, Jan 15 · 4:00 AM – 4:30 AM')
    const o = new URL(outlook().getAttribute('href')!)
    expect(o.origin).toBe('https://outlook.live.com')
    expect(o.searchParams.get('subject')).toBe('Stand-up')
    expect(o.searchParams.get('startdt')).toBe('2024-01-15T04:00:00+00:00')
    expect(o.searchParams.get('enddt')).toBe('2024-01-15T04:30:00+00:00')
  })

  it('calls a meeting with no title "Meeting"', () => {
    setup({ title: '   ' })
    expect(new URL(google().getAttribute('href')!).searchParams.get('text')).toBe('Meeting')
  })

  it('follows a title with awkward characters without breaking the link', () => {
    setup({ title: 'Q&A #2 — café' })
    expect(new URL(google().getAttribute('href')!).searchParams.get('text')).toBe('Q&A #2 — café')
  })

  it('can be switched off (the iOS app has its share sheet)', () => {
    setup({ calendarLinks: false })
    expect(screen.queryByRole('link', { name: /Add to/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Add to calendar' })).toBeInTheDocument() // the .ics file stays
  })

  it('offers nothing before a meeting is chosen', () => {
    setup({ meeting: null })
    expect(screen.queryByRole('link', { name: /Add to/ })).toBeNull()
  })
})

describe('Your data in Settings', () => {
  const current: SettingsSnapshot = {
    locations: DEFAULT_LOCATIONS.map((l) => ({ ...l })),
    timeFormat: '12h',
    theme: 'system',
    workHours: { start: 9, end: 17 }
  }
  function setup(props: Partial<React.ComponentProps<typeof SettingsPanel>> = {}) {
    const handlers = { onTheme: vi.fn(), onTimeFormat: vi.fn(), onWorkHours: vi.fn(), onImportSettings: vi.fn() }
    render(<SettingsPanel {...current} {...handlers} locations={current.locations} {...props} />)
    return handlers
  }
  const fileInput = () => screen.getByLabelText('Choose a settings file to import') as HTMLInputElement
  const upload = (user: ReturnType<typeof userEvent.setup>, text: string, name = 'settings.json') =>
    user.upload(fileInput(), new File([text], name, { type: 'application/json' }))
  const other: SettingsSnapshot = {
    locations: [
      { id: 'a', label: 'Paris', iana: 'Europe/Paris', isHome: true },
      { id: 'b', label: 'Tokyo', iana: 'Asia/Tokyo' },
      { id: 'c', label: 'Lima', iana: 'America/Lima' }
    ],
    timeFormat: '24h',
    theme: 'dark',
    workHours: { start: 8, end: 20, days: [1, 2, 3, 4], holidaysOff: false }
  }

  it('is left out when there is nothing to hand an import to', () => {
    render(<SettingsPanel {...current} onTheme={vi.fn()} onTimeFormat={vi.fn()} onWorkHours={vi.fn()} locations={current.locations} />)
    expect(screen.queryByText('Your data')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Export settings' })).toBeNull()
  })

  it('exports a file named for the day, holding exactly what is on screen', async () => {
    const user = userEvent.setup()
    const onExportFile = vi.fn()
    setup({ onExportFile })
    await user.click(screen.getByRole('button', { name: 'Export settings' }))
    expect(onExportFile).toHaveBeenCalledTimes(1)
    const [name, text] = onExportFile.mock.calls[0] as [string, string]
    expect(name).toMatch(/^hourbridge-settings-\d{4}-\d{2}-\d{2}\.json$/)
    const read = parseSettingsFile(text)
    expect(read.ok && read.state).toMatchObject(current)
    expect(await screen.findByRole('status')).toHaveTextContent(`Saved ${name}.`)
  })

  it('downloads the file as JSON in a browser', async () => {
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
    setup()
    await user.click(screen.getByRole('button', { name: 'Export settings' }))
    expect(filename).toMatch(/^hourbridge-settings-.*\.json$/)
    expect((blob as unknown as Blob).type).toBe('application/json')
  })

  it('says so when the file could not be saved', async () => {
    const user = userEvent.setup()
    setup({ onExportFile: async () => Promise.reject(new Error('no space')) })
    await user.click(screen.getByRole('button', { name: 'Export settings' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the file.')
  })

  it('shows what is in a file and changes nothing until you say so', async () => {
    const user = userEvent.setup()
    const h = setup()
    await upload(user, buildSettingsFile(other))
    const preview = await screen.findByRole('group', { name: 'Import settings' })
    expect(preview).toHaveTextContent('Replace your cities, boards and settings with the ones in this file?')
    expect(preview).toHaveTextContent('3 cities (home: Paris), 24-hour time and the dark theme.')
    expect(h.onImportSettings).not.toHaveBeenCalled()
  })

  it('replaces the settings when you confirm, with exactly the file’s settings', async () => {
    const user = userEvent.setup()
    const h = setup()
    await upload(user, buildSettingsFile(other))
    await user.click(await screen.findByRole('button', { name: 'Replace my settings' }))
    expect(h.onImportSettings).toHaveBeenCalledTimes(1)
    expect(h.onImportSettings.mock.calls[0][0]).toMatchObject(other)
    expect(screen.queryByRole('group', { name: 'Import settings' })).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Settings imported.')
  })

  it('changes nothing when you cancel', async () => {
    const user = userEvent.setup()
    const h = setup()
    await upload(user, buildSettingsFile(other))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(h.onImportSettings).not.toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: 'Import settings' })).toBeNull()
  })

  it.each([
    ['text that is not JSON', 'hello', 'This file is not valid JSON.'],
    ['JSON that is not a settings file', '{"a":1}', 'This is not a Hourbridge settings file.'],
    ['an empty file', '', 'This file is not valid JSON.']
  ])('explains %s, and offers nothing to apply', async (_name, text, message) => {
    const user = userEvent.setup()
    const h = setup()
    await upload(user, text)
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByRole('group', { name: 'Import settings' })).toBeNull()
    expect(h.onImportSettings).not.toHaveBeenCalled()
  })

  it('refuses a file that is far too large without reading it', async () => {
    const user = userEvent.setup()
    const read = vi.spyOn(FileReader.prototype, 'readAsText')
    const h = setup()
    await upload(user, 'x'.repeat(MAX_SETTINGS_FILE_CHARS * 4 + 1))
    expect(await screen.findByRole('alert')).toHaveTextContent('too large')
    expect(read).not.toHaveBeenCalled()
    expect(h.onImportSettings).not.toHaveBeenCalled()
  })

  it('drops an earlier preview when the next file is bad, so a bad file can never apply the old one', async () => {
    const user = userEvent.setup()
    const h = setup()
    await upload(user, buildSettingsFile(other))
    await screen.findByRole('group', { name: 'Import settings' })
    await upload(user, 'nope', 'second.json')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Replace my settings' })).toBeNull()
    expect(h.onImportSettings).not.toHaveBeenCalled()
  })

  it('lets you pick the same file twice', async () => {
    const user = userEvent.setup()
    setup()
    await upload(user, buildSettingsFile(other))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    await upload(user, buildSettingsFile(other))
    expect(await screen.findByRole('group', { name: 'Import settings' })).toBeInTheDocument()
  })

  it('copies a link that carries the cities and nothing else, and says so', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'Copy share link' }))
    const link = await navigator.clipboard.readText()
    expect(link.startsWith(`${window.location.origin}${window.location.pathname}#share=`)).toBe(true)
    const shared = parseShareHash(link.slice(link.indexOf('#')))
    expect(shared.status === 'ready' && shared.cities.map((c) => c.label)).toEqual(['Miami', 'IST', 'AEST', 'London', 'Tokyo'])
    expect(await screen.findByRole('status')).toHaveTextContent('Link copied.')
  })
})

describe('SharedCitiesPrompt', () => {
  const mine: Location[] = [IST, LONDON]
  const ready = (...labels: Array<[string, string]>): SharedLink => ({
    status: 'ready',
    cities: labels.map(([label, iana]) => ({ label, iana }))
  })
  function setup(link: SharedLink, current: Location[] = mine) {
    const h = { onAdd: vi.fn(), onReplace: vi.fn(), onDismiss: vi.fn() }
    render(<SharedCitiesPrompt link={link} current={current} {...h} />)
    return h
  }

  it('shows nothing when there is no link', () => {
    setup({ status: 'none' })
    expect(screen.queryByRole('region', { name: 'Shared cities' })).toBeNull()
  })

  it('lists the shared cities and offers to add the new ones, replace yours, or leave it', async () => {
    const user = userEvent.setup()
    const link = ready(['London', 'Europe/London'], ['Paris', 'Europe/Paris'], ['Tokyo', 'Asia/Tokyo'])
    const h = setup(link)
    const region = screen.getByRole('region', { name: 'Shared cities' })
    expect(region).toHaveTextContent('3 cities were shared with you: London, Paris, Tokyo.')
    await user.click(screen.getByRole('button', { name: 'Add 2 new cities' })) // London is already there
    expect(h.onAdd).toHaveBeenCalledWith(link.status === 'ready' ? link.cities : [])
    await user.click(screen.getByRole('button', { name: 'Replace my cities' }))
    expect(h.onReplace).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(h.onDismiss).toHaveBeenCalledTimes(1)
  })

  it('says "1 city was shared" and "Add 1 new city" in the singular', () => {
    setup(ready(['Paris', 'Europe/Paris']))
    expect(screen.getByRole('region')).toHaveTextContent('1 city was shared with you: Paris.')
    expect(screen.getByRole('button', { name: 'Add 1 new city' })).toBeInTheDocument()
  })

  it('does not offer to add what you already have, and says so', () => {
    setup(ready(['Delhi', 'Asia/Kolkata'], ['London', 'Europe/London']))
    expect(screen.queryByRole('button', { name: /^Add / })).toBeNull()
    expect(screen.getByRole('region')).toHaveTextContent('You already have all of them.')
    expect(screen.getByRole('button', { name: 'Replace my cities' })).toBeInTheDocument()
  })

  it('names the first few cities of a long list and counts the rest', () => {
    const many = Array.from({ length: 9 }, (_, i): [string, string] => [`City ${i + 1}`, 'Europe/Paris'])
    setup(ready(...many))
    expect(screen.getByRole('region')).toHaveTextContent('City 1, City 2, City 3, City 4, City 5, City 6 and 3 more.')
  })

  it('says plainly when the link could not be read, and offers only to dismiss it', async () => {
    const user = userEvent.setup()
    const h = setup({ status: 'invalid' })
    expect(screen.getByRole('region')).toHaveTextContent('This link’s list of cities could not be read.')
    expect(screen.queryByRole('button', { name: /Add|Replace/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(h.onDismiss).toHaveBeenCalled()
  })

  it('shows a city name as text, never as markup', () => {
    setup(ready(['<img src=x onerror=alert(1)>', 'Europe/Paris']))
    const region = screen.getByRole('region')
    expect(region).toHaveTextContent('<img src=x onerror=alert(1)>')
    expect(region.querySelector('img')).toBeNull()
  })
})

describe('opening a shared link in the app', () => {
  const rows = () => screen.getAllByLabelText(/ timezone row$/).map((el) => el.getAttribute('aria-label')!.replace(' timezone row', ''))
  const open = (cities: Location[]) => window.history.replaceState(null, '', `/#share=${encodeShare(cities)}`)

  beforeEach(() => {
    localStorage.removeItem(HB_STORAGE_KEY)
    window.history.replaceState(null, '', '/')
  })
  afterEach(() => {
    cleanup()
    window.history.replaceState(null, '', '/')
  })

  it('shows nothing extra without a link', () => {
    render(<App />)
    expect(screen.queryByRole('region', { name: 'Shared cities' })).toBeNull()
    expect(rows()).toEqual(['Miami', 'IST', 'AEST', 'London', 'Tokyo'])
  })

  it('asks first, and leaves your cities alone until you choose', () => {
    open([PARIS, { ...TOKYO, isHome: true }])
    render(<App />)
    expect(screen.getByRole('region', { name: 'Shared cities' })).toHaveTextContent('2 cities were shared with you: Paris, Tokyo.')
    expect(rows()).toEqual(['Miami', 'IST', 'AEST', 'London', 'Tokyo'])
  })

  it('adds only the new cities after yours, keeps your home, clears the link and remembers the result', async () => {
    const user = userEvent.setup()
    open([PARIS, TOKYO, { id: 'x', label: 'Lima', iana: 'America/Lima', isHome: true }])
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Add 2 new cities' })) // Tokyo is already there
    expect(rows()).toEqual(['Miami', 'IST', 'AEST', 'London', 'Tokyo', 'Paris', 'Lima'])
    expect(within(screen.getByLabelText('IST timezone row')).getByLabelText('Home timezone')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Shared cities' })).toBeNull()
    expect(window.location.hash).toBe('')
    await waitFor(() => expect(JSON.parse(localStorage.getItem(HB_STORAGE_KEY)!).locations.map((l: Location) => l.label)).toContain('Lima'))
  })

  it('replaces your cities with the shared ones, home from the link, and keeps your other settings', async () => {
    const user = userEvent.setup()
    localStorage.setItem(HB_STORAGE_KEY, JSON.stringify({ version: 5, locations: DEFAULT_LOCATIONS, timeFormat: '24h', theme: 'dark', workHours: { start: 10, end: 18 } }))
    open([PARIS, { ...TOKYO, isHome: true }])
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Replace my cities' }))
    expect(rows()).toEqual(['Paris', 'Tokyo'])
    expect(within(screen.getByLabelText('Tokyo timezone row')).getByLabelText('Home timezone')).toBeInTheDocument()
    expect(window.location.hash).toBe('')
    const stored = JSON.parse(localStorage.getItem(HB_STORAGE_KEY)!)
    expect(stored).toMatchObject({ timeFormat: '24h', theme: 'dark', workHours: { start: 10, end: 18 } })
  })

  it('changes nothing when dismissed, and does not ask again after a reload', async () => {
    const user = userEvent.setup()
    open([PARIS])
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(rows()).toEqual(['Miami', 'IST', 'AEST', 'London', 'Tokyo'])
    expect(window.location.hash).toBe('')
    cleanup()
    render(<App />)
    expect(screen.queryByRole('region', { name: 'Shared cities' })).toBeNull()
  })

  it('says when the link cannot be read, and leaves everything as it was', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/#share=not-a-real-link')
    render(<App />)
    expect(screen.getByRole('region', { name: 'Shared cities' })).toHaveTextContent('could not be read')
    expect(rows()).toEqual(['Miami', 'IST', 'AEST', 'London', 'Tokyo'])
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('region', { name: 'Shared cities' })).toBeNull()
  })

  it('ignores the widget view address', () => {
    window.history.replaceState(null, '', '/#widget')
    render(<App />)
    expect(screen.queryByRole('region', { name: 'Shared cities' })).toBeNull()
  })
})
