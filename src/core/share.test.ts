import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import {
  buildIcs,
  buildInviteText,
  escapeIcsText,
  foldIcsLine,
  formatSlot
} from '@core/share'
import type { Location } from '@core/timezones'

// Mon 2024-01-15 15:00 IST = 09:30 UTC = 09:30 London (GMT) = 04:30 New York (EST).
const plan = {
  start: DateTime.fromISO('2024-01-15T15:00:00', { zone: 'Asia/Kolkata' }),
  end: DateTime.fromISO('2024-01-15T16:00:00', { zone: 'Asia/Kolkata' })
}
const locations: Location[] = [
  { id: 'london', label: 'London', iana: 'Europe/London' },
  { id: 'ist', label: 'IST', iana: 'Asia/Kolkata', isHome: true }
]

describe('formatSlot', () => {
  it('formats the slot in each zone and format', () => {
    expect(formatSlot(plan, 'Europe/London', '12h')).toBe('Mon, Jan 15 · 9:30 AM – 10:30 AM')
    expect(formatSlot(plan, 'Asia/Kolkata', '24h')).toBe('Mon, Jan 15 · 15:00 – 16:00')
  })

  it('shows the end weekday when the slot crosses midnight in that zone', () => {
    const late = {
      start: DateTime.fromISO('2024-01-15T23:30:00', { zone: 'UTC' }),
      end: DateTime.fromISO('2024-01-16T00:30:00', { zone: 'UTC' })
    }
    expect(formatSlot(late, 'UTC', '24h')).toBe('Mon, Jan 15 · 23:30 – 00:30 (Tue)')
  })

  it('moves the date for zones on the other side of midnight', () => {
    // Mon 20:00 IST = 14:30 UTC = Tue 03:30 in Auckland (NZDT, UTC+13).
    const evening = {
      start: DateTime.fromISO('2024-01-15T20:00:00', { zone: 'Asia/Kolkata' }),
      end: DateTime.fromISO('2024-01-15T21:00:00', { zone: 'Asia/Kolkata' })
    }
    expect(formatSlot(evening, 'Asia/Kolkata', '12h')).toBe('Mon, Jan 15 · 8:00 PM – 9:00 PM')
    expect(formatSlot(evening, 'Pacific/Auckland', '12h')).toBe('Tue, Jan 16 · 3:30 AM – 4:30 AM')
  })
})

describe('buildInviteText', () => {
  it('lists the home location first and tags it', () => {
    const text = buildInviteText(plan, locations, '12h')
    expect(text.split('\n')).toEqual([
      'Proposed meeting time',
      'IST (home): Mon, Jan 15 · 3:00 PM – 4:00 PM',
      'London: Mon, Jan 15 · 9:30 AM – 10:30 AM'
    ])
  })

  it('accepts a custom title', () => {
    expect(buildInviteText(plan, locations, '24h', 'Sprint sync').startsWith('Sprint sync\n')).toBe(
      true
    )
  })

  it('does not mutate the caller\'s location order', () => {
    const copy = [...locations]
    buildInviteText(plan, locations, '12h')
    expect(locations).toEqual(copy)
  })
})

describe('ICS', () => {
  const now = DateTime.fromISO('2024-01-10T08:00:00Z')

  it('emits a valid single-event calendar in UTC with CRLF endings', () => {
    const ics = buildIcs(plan, { title: 'Sprint sync', now })
    const lines = ics.split('\r\n')
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(lines).toContain('DTSTART:20240115T093000Z')
    expect(lines).toContain('DTEND:20240115T103000Z')
    expect(lines).toContain('DTSTAMP:20240110T080000Z')
    expect(lines).toContain('SUMMARY:Sprint sync')
    expect(lines).toContain('UID:20240115T093000Z@hourbridge.app')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).not.toMatch(/[^\r]\n/)
  })

  it('escapes special characters in text fields', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')
    const ics = buildIcs(plan, { title: 'Plan; review, now', description: 'Line1\nLine2', now })
    expect(ics).toContain('SUMMARY:Plan\\; review\\, now')
    expect(ics).toContain('DESCRIPTION:Line1\\nLine2')
  })

  it('omits DESCRIPTION when none is given', () => {
    expect(buildIcs(plan, { title: 't', now })).not.toContain('DESCRIPTION')
  })

  it('folds long lines at 75 octets and round-trips when unfolded', () => {
    const long = 'x'.repeat(200)
    const folded = foldIcsLine(`SUMMARY:${long}`)
    for (const part of folded.split('\r\n')) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75)
    }
    expect(folded.replace(/\r\n /g, '')).toBe(`SUMMARY:${long}`)
  })

  it('never splits a multi-byte character when folding', () => {
    const text = `SUMMARY:${'日本語'.repeat(30)}`
    const folded = foldIcsLine(text)
    expect(folded.replace(/\r\n /g, '')).toBe(text)
    for (const part of folded.split('\r\n')) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75)
    }
  })

  it('leaves short lines alone', () => {
    expect(foldIcsLine('SUMMARY:short')).toBe('SUMMARY:short')
  })
})
