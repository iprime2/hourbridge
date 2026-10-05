/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DateTime } from 'luxon'
import App from '@renderer/App'
import UpcomingHolidays from '@ui/UpcomingHolidays'
import { setHolidayLoader, type CountryHolidays } from '@core/holidays'
import type { Location } from '@core/timezones'

const IST: Location = { id: 'ist', label: 'IST', iana: 'Asia/Kolkata', isHome: true }
const TOKYO: Location = { id: 'tokyo', label: 'Tokyo', iana: 'Asia/Tokyo' }
const NEW_YORK: Location = { id: 'ny', label: 'New York', iana: 'America/New_York' }
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
  JP: { '2026': [['01-12', 'Coming of Age Day'], ['02-11', 'Foundation Day']] },
  US: { '2026': [['07-04', 'Independence Day']] }
}

// 10:00 on Monday 26 January 2026 in Kolkata; it is still the 25th in New York.
const now = DateTime.fromISO('2026-01-26T10:00:00', { zone: 'Asia/Kolkata' })
const from = { year: 2026, month: 1, day: 26 }

function setup(props: Partial<React.ComponentProps<typeof UpcomingHolidays>> = {}) {
  return render(<UpcomingHolidays locations={[IST, TOKYO, NEW_YORK]} from={from} now={now} {...props} />)
}
const items = () => within(screen.getByRole('list')).getAllByRole('listitem')

describe('UpcomingHolidays', () => {
  beforeEach(() => setHolidayLoader(async (code) => tables[code] ?? null))

  it('lists the next five holiday days of the home country first, with how far away each is', async () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Upcoming holidays in India' })).toBeInTheDocument()
    expect(screen.getByText('from today')).toBeInTheDocument()
    await waitFor(() => expect(items()).toHaveLength(5))
    expect(items().map((li) => li.textContent)).toEqual([
      'Mon, Jan 26Republic Daytoday',
      'Tue, Mar 3Fake Festival · Second Fakein 36 days',
      'Sat, Aug 15Independence Dayin 201 days',
      'Fri, Oct 2Gandhi Jayantiin 249 days',
      'Fri, Dec 25Christmas Dayin 333 days'
    ])
  })

  it('marks the dates for assistive technology and highlights today', async () => {
    setup()
    await waitFor(() => expect(items()).toHaveLength(5))
    expect(items()[0].querySelector('time')).toHaveAttribute('datetime', '2026-01-26')
    expect(items()[0].querySelector('.upcoming-away')).toHaveClass('is-today')
    expect(items()[1].querySelector('.upcoming-away')).not.toHaveClass('is-today')
  })

  it('switches city and lists that city’s country instead', async () => {
    const user = userEvent.setup()
    setup()
    await waitFor(() => expect(items()).toHaveLength(5))
    await user.click(screen.getByRole('button', { name: 'Tokyo' }))
    expect(screen.getByRole('heading', { name: 'Upcoming holidays in Japan' })).toBeInTheDocument()
    await waitFor(() => expect(items()).toHaveLength(1))
    expect(items()[0]).toHaveTextContent('Foundation Day')
    expect(screen.getByRole('button', { name: 'Tokyo' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'IST' })).toHaveAttribute('aria-pressed', 'false')
  })

  it("says how far away a holiday is on the chosen city's own date, not the home date", async () => {
    // From the 25th in New York (still Sunday there) a holiday on the 26th is tomorrow, not today.
    const user = userEvent.setup()
    setHolidayLoader(async () => ({ '2026': [['01-26', 'Some Day']] }))
    setup()
    await waitFor(() => expect(items()[0]).toHaveTextContent('today'))
    await user.click(screen.getByRole('button', { name: 'New York' }))
    await waitFor(() => expect(items()[0]).toHaveTextContent('tomorrow'))
  })

  it('starts from the day the grid shows, and says so when that is not today', async () => {
    setup({ from: { year: 2026, month: 8, day: 1 } })
    expect(screen.getByText('from Sat, Aug 1')).toBeInTheDocument()
    await waitFor(() => expect(items()[0]).toHaveTextContent('Independence Day'))
    expect(items()).toHaveLength(4) // Aug 15, Oct 2, Dec 25, then the 2027 Republic Day
  })

  it('warns that India is partial, under the list, and only for a partial country', async () => {
    const user = userEvent.setup()
    setup()
    expect(await screen.findByText(/Holi, Diwali and Eid/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tokyo' }))
    await waitFor(() => expect(screen.queryByText(/Holi, Diwali and Eid/)).toBeNull())
  })

  it('says there is no data for a country the source does not cover', async () => {
    const user = userEvent.setup()
    setup({ locations: [IST, KATHMANDU] })
    await user.click(screen.getByRole('button', { name: 'Kathmandu' }))
    expect(screen.getByRole('heading', { name: 'Upcoming holidays in Nepal' })).toBeInTheDocument()
    expect(screen.getByText('There is no public holiday data for Nepal yet.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('says a timezone with no country has no public holidays', async () => {
    const user = userEvent.setup()
    setup({ locations: [IST, UTC] })
    await user.click(screen.getByRole('button', { name: 'UTC' }))
    expect(screen.getByRole('heading', { name: 'Upcoming holidays' })).toBeInTheDocument()
    expect(screen.getByText(/UTC is on a timezone that belongs to no country/)).toBeInTheDocument()
  })

  it('shows that it is loading, and then that it could not load, instead of an empty list', async () => {
    setHolidayLoader(async () => {
      throw new Error('offline')
    })
    setup()
    expect(screen.getByText('Loading holidays…')).toBeInTheDocument()
    expect(await screen.findByText(/Could not load the holidays for India/)).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('says so, with the data range, when the data has nothing after the chosen day', async () => {
    setup({ from: { year: 2031, month: 1, day: 1 } })
    expect(await screen.findByText(/No more public holidays after Wed, Jan 1 in the data, which covers 20\d\d–20\d\d\./)).toBeInTheDocument()
  })

  it('has no city picker when there is only one city, and names the country', async () => {
    setup({ locations: [IST] })
    expect(screen.queryByRole('group', { name: 'Show holidays for' })).toBeNull()
    await waitFor(() => expect(items()).toHaveLength(5))
  })

  it('falls back to home when the chosen city is removed', async () => {
    const user = userEvent.setup()
    const view = setup()
    await user.click(screen.getByRole('button', { name: 'Tokyo' }))
    view.rerender(<UpcomingHolidays locations={[IST, NEW_YORK]} from={from} now={now} />)
    expect(screen.getByRole('heading', { name: 'Upcoming holidays in India' })).toBeInTheDocument()
  })
})

describe('the upcoming holidays in the app', () => {
  beforeEach(() => {
    localStorage.clear()
    setHolidayLoader(async (code) => tables[code] ?? null)
  })

  it('sits at the bottom of the desktop layout, for the home country to begin with', async () => {
    render(<App />)
    const panel = screen.getByRole('region', { name: 'Upcoming public holidays' })
    expect(within(panel).getByRole('heading', { name: 'Upcoming holidays in India' })).toBeInTheDocument()
    await waitFor(() => expect(within(panel).getAllByRole('listitem').length).toBeGreaterThan(0))
    // After the planner, before the legend.
    const planner = screen.getByRole('region', { name: 'Meeting planner' })
    const legend = screen.getByRole('contentinfo', { name: 'Legend' })
    expect(planner.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(panel.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
