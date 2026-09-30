/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WidgetApp from '@renderer/components/WidgetApp'
import { savePersistedBuddyState, WTB_STORAGE_KEY } from '@core/persistence'
import { DEFAULT_LOCATIONS } from '@core/timezones'

describe('WidgetApp', () => {
  beforeEach(() => {
    localStorage.clear()
    savePersistedBuddyState({
      locations: [...DEFAULT_LOCATIONS],
      timeFormat: '12h'
    })
    window.wtb = {
      openWidget: vi.fn(async () => undefined),
      closeWidget: vi.fn(async () => undefined),
      focusMain: vi.fn(async () => undefined),
      setAlwaysOnTop: vi.fn(async (value: boolean) => value),
      getAlwaysOnTop: vi.fn(async () => true)
    }
  })

  it('renders location labels and live times from persisted state', () => {
    render(<WidgetApp />)
    expect(screen.getByRole('heading', { name: /world time buddy/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/current local times/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/IST /i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Tokyo /i)).toBeInTheDocument()
  })

  it('closes via chrome control', async () => {
    const user = userEvent.setup()
    render(<WidgetApp />)
    await user.click(screen.getByRole('button', { name: /close widget/i }))
    expect(window.wtb?.closeWidget).toHaveBeenCalled()
  })

  it('refreshes when storage key changes', async () => {
    render(<WidgetApp />)
    expect(screen.queryByLabelText(/Paris /i)).not.toBeInTheDocument()

    savePersistedBuddyState({
      locations: [
        ...DEFAULT_LOCATIONS,
        { id: 'paris', label: 'Paris', iana: 'Europe/Paris' }
      ],
      timeFormat: '12h'
    })

    // jsdom's StorageEvent often drops init fields; set key explicitly.
    const event = new Event('storage') as StorageEvent
    Object.defineProperty(event, 'key', { value: WTB_STORAGE_KEY })
    window.dispatchEvent(event)

    expect(await screen.findByLabelText(/Paris /i)).toBeInTheDocument()
  })
})
