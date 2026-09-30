/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '@renderer/App'
import { WTB_STORAGE_KEY } from '@core/persistence'

describe('App World Time Buddy UI', () => {
  beforeEach(() => {
    localStorage.removeItem(WTB_STORAGE_KEY)
  })

  it('renders default locations with IST as home', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: /world time buddy/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/IST timezone row/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Miami timezone row/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/AEST timezone row/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/London timezone row/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Tokyo timezone row/i)).toBeInTheDocument()

    const istRow = screen.getByLabelText(/IST timezone row/i)
    expect(within(istRow).getByLabelText(/home timezone/i)).toBeInTheDocument()
  })

  it('exposes an Open widget control in the toolbar', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /open widget/i })).toBeInTheDocument()
  })

  it('highlights a home-hour column across rows when a tile is clicked', async () => {
    const user = userEvent.setup()
    render(<App />)

    const miamiTiles = within(screen.getByLabelText(/Miami timezone row/i)).getAllByRole('button', {
      name: /Miami .* \(home hour/i
    })
    // Click home-hour 12 column on Miami row
    const noonTile = miamiTiles.find((btn) => btn.getAttribute('aria-label')?.includes('home hour 12'))
    expect(noonTile).toBeTruthy()
    await user.click(noonTile!)

    const rows = [
      screen.getByLabelText(/Miami timezone row/i),
      screen.getByLabelText(/IST timezone row/i),
      screen.getByLabelText(/Tokyo timezone row/i)
    ]

    for (const row of rows) {
      const active = within(row)
        .getAllByRole('button')
        .filter((b) => b.classList.contains('is-active'))
      expect(active.length).toBeGreaterThanOrEqual(1)
      expect(active.some((b) => b.getAttribute('aria-label')?.includes('home hour 12'))).toBe(true)
    }
  })

  it('toggles between 12h and 24h formats', async () => {
    const user = userEvent.setup()
    render(<App />)

    const toggle = screen.getByRole('button', { name: /switch to 24-hour format/i })
    await user.click(toggle)
    expect(screen.getByRole('button', { name: /switch to 12-hour format/i })).toBeInTheDocument()
  })

  it('shifts the comparison date via the date strip', async () => {
    const user = userEvent.setup()
    render(<App />)

    const dateGroup = screen.getByRole('group', { name: /comparison date/i })
    const selectedBefore = within(dateGroup).getByRole('button', { pressed: true })
    const labelBefore = selectedBefore.getAttribute('aria-label')

    await user.click(within(dateGroup).getByRole('button', { name: /next day/i }))

    const selectedAfter = within(dateGroup).getByRole('button', { pressed: true })
    expect(selectedAfter.getAttribute('aria-label')).not.toBe(labelBefore)

    await user.click(within(dateGroup).getByRole('button', { name: /go to today/i }))
    const selectedToday = within(dateGroup).getByRole('button', { pressed: true })
    expect(selectedToday.classList.contains('is-today')).toBe(true)
  })

  it('can add a location from the curated list', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /add location/i }))
    await user.type(screen.getByLabelText(/search cities/i), 'Paris')
    await user.click(screen.getByRole('option', { name: /Paris/i }))

    expect(screen.getByLabelText(/Paris timezone row/i)).toBeInTheDocument()
  })

  it('can set another location as home and remove a non-home row', async () => {
    const user = userEvent.setup()
    render(<App />)

    const london = screen.getByLabelText(/London timezone row/i)
    await user.click(within(london).getByRole('button', { name: /set London as home/i }))

    expect(within(london).getByLabelText(/home timezone/i)).toBeInTheDocument()
    expect(within(screen.getByLabelText(/IST timezone row/i)).queryByLabelText(/home timezone/i)).toBeNull()

    await user.click(
      within(screen.getByLabelText(/Tokyo timezone row/i)).getByRole('button', {
        name: /remove Tokyo/i
      })
    )
    expect(screen.queryByLabelText(/Tokyo timezone row/i)).toBeNull()
  })
})
