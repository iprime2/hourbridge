/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddLocation from '@renderer/components/AddLocation'

describe('AddLocation', () => {
  it('opens search, filters cities, and adds a selection', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()

    render(<AddLocation excludeIds={new Set(['london'])} onAdd={onAdd} />)

    await user.click(screen.getByRole('button', { name: /add location/i }))
    expect(screen.getByRole('dialog', { name: /add a location/i })).toBeInTheDocument()

    await user.type(screen.getByLabelText(/search cities/i), 'Paris')
    const option = screen.getByRole('option', { name: /Paris/i })
    expect(option).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^London/i })).not.toBeInTheDocument()

    await user.click(option)
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'paris', label: 'Paris', iana: 'Europe/Paris' })
    )
    expect(screen.getByRole('button', { name: /add location/i })).toBeInTheDocument()
  })

  it('shows empty state for unmatched query', async () => {
    const user = userEvent.setup()
    render(<AddLocation excludeIds={new Set()} onAdd={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /add location/i }))
    await user.type(screen.getByLabelText(/search cities/i), 'zzzz-not-a-city')
    expect(screen.getByText(/no matching cities/i)).toBeInTheDocument()
  })
})
