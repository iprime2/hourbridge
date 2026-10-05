/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { DateTime } from 'luxon'
import App from '@renderer/App'
import UpcomingHolidays from '@ui/UpcomingHolidays'
import { setHolidayLoader, type CountryHolidays } from '@core/holidays'
import type { Location } from '@core/timezones'

const IST: Location = { id: 'ist', label: 'IST', iana: 'Asia/Kolkata', isHome: true }
const TOKYO: Location = { id: 'tokyo', label: 'Tokyo', iana: 'Asia/Tokyo' }
const MIAMI: Location = { id: 'miami', label: 'Miami', iana: 'America/New_York' }
const LA: Location = { id: 'la', label: 'Los Angeles', iana: 'America/Los_Angeles' }
const KATHMANDU: Location = { id: 'ktm', label: 'Kathmandu', iana: 'Asia/Kathmandu' }
const UTC: Location = { id: 'utc', label: 'UTC', iana: 'UTC' }

// Made-up calendars, so nothing here depends on the bundled data or on the day the suite runs.
const tables: Record<string, CountryHolidays> = {
  IN: {
    '2026': [
      ['01-26', 'Republic Day'],
      ['03-03', 'Fake Festival'],
      ['03-03', 'Second Fake'],
      ['08-15', 'Independence Day'],
      ['10-02', 'Gandhi Jayanti'],
      ['12-25', 'Christmas Day']
    ],
    '2027': [['01-26', 'Republic Day']]
  },
  JP: {
    '2026': [
      ['01-12', 'Coming of Age Day'],
      ['02-11', 'Foundation Day']
    ]
  },
  US: { '2026': [['07-04', 'Independence Day']] }
}

// 10:00 on Monday 26 January 2026 in Kolkata; it is still the 25th in New York.
const now = DateTime.fromISO('2026-01-26T10:00:00', { zone: 'Asia/Kolkata' })
const from = { year: 2026, month: 1, day: 26 }

function setup(props: Partial<React.ComponentProps<typeof UpcomingHolidays>> = {}) {
  return render(<UpcomingHolidays locations={[IST, TOKYO, MIAMI]} from={from} now={now} {...props} />)
}
/** The row for a country, by the name in its left-hand column. */
const row = (country: string) => screen.getByText(country, { selector: '.upcoming-country' }).closest('li') as HTMLElement
const pills = (country: string) => within(row(country)).queryAllByRole('listitem').map((li) => li.textContent)

describe('UpcomingHolidays — every country at once', () => {
  beforeEach(() => setHolidayLoader(async (code) => tables[code] ?? null))

  it('lists each country on screen in the same panel, with no picker to switch between them', async () => {
    setup()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getAllByText(/./, { selector: '.upcoming-country' }).map((e) => e.textContent)).toEqual([
      'India',
      'Japan',
      'United States'
    ])
    // They all load without anyone choosing anything.
    await waitFor(() => expect(pills('India')).toHaveLength(3))
    await waitFor(() => expect(pills('Japan')).toHaveLength(1))
    await waitFor(() => expect(pills('United States')).toHaveLength(1))
  })

  it('shows each country’s next holidays with weekday, date, name and how far away', async () => {
    setup()
    await waitFor(() => expect(pills('India')).toHaveLength(3))
    expect(pills('India')).toEqual([
      'Mon, Jan 26Republic Daytoday',
      'Tue, Mar 3Fake Festival · Second Fakein 36 days',
      'Sat, Aug 15Independence Dayin 201 days'
    ])
    await waitFor(() => expect(pills('Japan')).toEqual(['Wed, Feb 11Foundation Dayin 16 days'])) // Jan 12 is behind us
  })

  it('names the cities of each country, and puts two cities of one country in one row', async () => {
    setup({ locations: [IST, MIAMI, TOKYO, LA] })
    expect(within(row('United States')).getByText('Miami, Los Angeles')).toBeInTheDocument()
    expect(screen.getAllByText(/./, { selector: '.upcoming-country' })).toHaveLength(3)
    await waitFor(() => expect(pills('United States')).toHaveLength(1))
  })

  it("counts days away on each country's own date, side by side", async () => {
    // The same holiday on 26 January: today in Kolkata, but tomorrow in New York (still the 25th there).
    setHolidayLoader(async () => ({ '2026': [['01-26', 'Some Day']] }))
    setup({ locations: [IST, MIAMI] })
    await waitFor(() => expect(pills('India')).toEqual(['Mon, Jan 26Some Daytoday']))
    await waitFor(() => expect(pills('United States')).toEqual(['Mon, Jan 26Some Daytomorrow']))
  })

  it('highlights a holiday that is today, only today’s', async () => {
    setup()
    await waitFor(() => expect(pills('India')).toHaveLength(3))
    const away = within(row('India')).getAllByText(/today|in \d+ days/, { selector: '.upcoming-away' })
    expect(away.map((e) => e.classList.contains('is-today'))).toEqual([true, false, false])
  })

  it('marks the dates for assistive technology', async () => {
    setup()
    await waitFor(() => expect(pills('India')).toHaveLength(3))
    expect(within(row('India')).getAllByText(/./, { selector: 'time' })[0]).toHaveAttribute('datetime', '2026-01-26')
    expect(within(row('India')).getByRole('list', { name: 'Next public holidays in India' })).toBeInTheDocument()
  })

  it('starts from the day the grid shows, and says so when that is not today', async () => {
    setup({ from: { year: 2026, month: 8, day: 1 } })
    expect(screen.getByText('from Sat, Aug 1')).toBeInTheDocument()
    await waitFor(() => expect(pills('India')).toHaveLength(3)) // Aug 15, Oct 2, Dec 25
    expect(pills('India')[0]).toContain('Independence Day')
  })

  it('says "from today" when the grid shows today', () => {
    setup()
    expect(screen.getByText('from today')).toBeInTheDocument()
  })

  it('warns that India is partial, in India’s row only', async () => {
    setup()
    expect(await screen.findByText(/Holi, Diwali and Eid/)).toBeInTheDocument()
    expect(within(row('India')).getByText(/Holi, Diwali and Eid/)).toBeInTheDocument()
    expect(within(row('Japan')).queryByText(/Holi, Diwali and Eid/)).toBeNull()
  })

  it('says, in its own row, that a country has no data — while the others still list theirs', async () => {
    setup({ locations: [IST, KATHMANDU, TOKYO] })
    expect(within(row('Nepal')).getByText('No public holiday data for Nepal yet.')).toBeInTheDocument()
    expect(within(row('Nepal')).queryByRole('list')).toBeNull()
    await waitFor(() => expect(pills('India')).toHaveLength(3))
  })

  it('keeps a timezone with no country in the list, and says it has no public holidays', () => {
    setup({ locations: [IST, UTC] })
    const utc = screen.getByText('UTC', { selector: '.upcoming-country' }).closest('li') as HTMLElement
    expect(within(utc).getByText(/belongs to no country, so it has no public holidays/)).toBeInTheDocument()
  })

  it('shows loading, then a failure only for the country whose file did not load', async () => {
    setHolidayLoader(async (code) => {
      if (code === 'IN') throw new Error('offline')
      return tables[code] ?? null
    })
    setup({ locations: [IST, TOKYO] })
    expect(within(row('India')).getByText('Loading holidays…')).toBeInTheDocument()
    expect(await within(row('India')).findByText(/Could not load the holidays for India/)).toBeInTheDocument()
    await waitFor(() => expect(pills('Japan')).toEqual(['Wed, Feb 11Foundation Dayin 16 days']))
  })

  it('says so, with the data range, when the data has nothing after the chosen day', async () => {
    setup({ from: { year: 2031, month: 1, day: 1 }, locations: [IST, TOKYO] })
    expect(await within(row('India')).findByText(/No more public holidays after Wed, Jan 1 in the data, which covers 20\d\d–20\d\d\./)).toBeInTheDocument()
    expect(await within(row('Japan')).findByText(/No more public holidays after/)).toBeInTheDocument()
  })

  it('works with a single city', async () => {
    setup({ locations: [IST] })
    expect(screen.getAllByText(/./, { selector: '.upcoming-country' })).toHaveLength(1)
    await waitFor(() => expect(pills('India')).toHaveLength(3))
  })

  it('lists as many days per country as it is asked for', async () => {
    setup({ locations: [IST], count: 5 })
    await waitFor(() => expect(pills('India')).toHaveLength(5))
  })

  it('follows the cities: a country appears when its city is added and goes when it is removed', async () => {
    const view = setup({ locations: [IST] })
    view.rerender(<UpcomingHolidays locations={[IST, TOKYO]} from={from} now={now} />)
    expect(row('Japan')).toBeInTheDocument()
    view.rerender(<UpcomingHolidays locations={[IST]} from={from} now={now} />)
    expect(screen.queryByText('Japan', { selector: '.upcoming-country' })).toBeNull()
  })
})

describe('the upcoming holidays in the app', () => {
  beforeEach(() => {
    localStorage.clear()
    setHolidayLoader(async (code) => tables[code] ?? null)
  })

  it('sits at the bottom of the desktop layout, after the planner and before the legend, with every default country', async () => {
    render(<App />)
    const panel = screen.getByRole('region', { name: 'Upcoming public holidays' })
    const countries = within(panel).getAllByText(/./, { selector: '.upcoming-country' }).map((e) => e.textContent)
    // In the order of the default cities (Miami, IST, AEST, London, Tokyo); names are the tz database's.
    expect(countries).toEqual(['United States', 'India', 'Australia', 'Britain (UK)', 'Japan'])
    await waitFor(() => expect(within(panel).getAllByRole('listitem').length).toBeGreaterThan(countries.length))
    const planner = screen.getByRole('region', { name: 'Meeting planner' })
    const legend = screen.getByRole('contentinfo', { name: 'Legend' })
    expect(planner.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(panel.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
