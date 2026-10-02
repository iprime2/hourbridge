/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hapticSelection, shareMeeting } from '@mobile/native'

const define = (name: string, value: unknown) =>
  Object.defineProperty(navigator, name, { value, configurable: true, writable: true })
const remove = (name: string) => {
  delete (navigator as unknown as Record<string, unknown>)[name]
}

describe('native adapter in a browser', () => {
  beforeEach(() => {
    remove('share')
    remove('canShare')
    remove('vibrate')
  })
  afterEach(() => vi.restoreAllMocks())

  describe('shareMeeting', () => {
    it('uses the Web Share API and attaches the calendar file when files can be shared', async () => {
      const share = vi.fn(async (_data: ShareData) => undefined)
      define('share', share)
      define('canShare', vi.fn(() => true))

      const message = await shareMeeting('Meeting\nIST: 3 PM', 'BEGIN:VCALENDAR', 'meeting.ics')

      expect(message).toBe('')
      expect(share).toHaveBeenCalledTimes(1)
      const data = share.mock.calls[0][0] as ShareData
      expect(data.text).toBe('Meeting\nIST: 3 PM')
      expect(data.files).toHaveLength(1)
      expect(data.files![0].name).toBe('meeting.ics')
      expect(data.files![0].type).toBe('text/calendar')
    })

    it('shares text only when the browser cannot share files', async () => {
      const share = vi.fn(async (_data: ShareData) => undefined)
      define('share', share)
      define('canShare', vi.fn(() => false))
      await shareMeeting('hello', 'ICS', 'meeting.ics')
      expect((share.mock.calls[0][0] as ShareData).files).toBeUndefined()
    })

    it('shares text only when canShare does not exist', async () => {
      const share = vi.fn(async (_data: ShareData) => undefined)
      define('share', share)
      await shareMeeting('hello', 'ICS', 'meeting.ics')
      expect((share.mock.calls[0][0] as ShareData).files).toBeUndefined()
      expect((share.mock.calls[0][0] as ShareData).text).toBe('hello')
    })

    it('treats dismissing the share sheet as success, not an error', async () => {
      define('share', vi.fn(async () => Promise.reject(new DOMException('cancelled', 'AbortError'))))
      expect(await shareMeeting('hello', 'ICS', 'meeting.ics')).toBe('')
    })

    it('falls back to copying if sharing fails for any other reason', async () => {
      define('share', vi.fn(async () => Promise.reject(new DOMException('blocked', 'NotAllowedError'))))
      const writeText = vi.fn(async () => undefined)
      define('clipboard', { writeText })
      expect(await shareMeeting('copy me', 'ICS', 'meeting.ics')).toBe('Copied to clipboard')
      expect(writeText).toHaveBeenCalledWith('copy me')
    })

    it('copies the text when there is no Web Share API (desktop browsers)', async () => {
      const writeText = vi.fn(async () => undefined)
      define('clipboard', { writeText })
      expect(await shareMeeting('copy me', 'ICS', 'meeting.ics')).toBe('Copied to clipboard')
    })

    it('says so when neither sharing nor copying works', async () => {
      define('clipboard', {
        writeText: vi.fn(async () => Promise.reject(new Error('denied')))
      })
      // jsdom has no document.execCommand, so the legacy fallback fails as well.
      expect(await shareMeeting('x', 'ICS', 'meeting.ics')).toBe('Could not copy')
    })
  })

  describe('hapticSelection', () => {
    it('vibrates briefly where the browser supports it', () => {
      const vibrate = vi.fn(() => true)
      define('vibrate', vibrate)
      hapticSelection()
      expect(vibrate).toHaveBeenCalledWith(8)
    })

    it('does nothing (and does not throw) where vibration is unavailable or blocked', () => {
      expect(() => hapticSelection()).not.toThrow()
      define('vibrate', () => {
        throw new Error('blocked by permissions policy')
      })
      expect(() => hapticSelection()).not.toThrow()
    })
  })
})
