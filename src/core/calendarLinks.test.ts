import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import { googleCalendarUrl, outlookCalendarUrl } from '@core/calendarLinks'

// 9:30–10:00 in Kolkata is 04:00–04:30 UTC.
const plan = {
  start: DateTime.fromISO('2024-01-15T09:30:00', { zone: 'Asia/Kolkata' }),
  end: DateTime.fromISO('2024-01-15T10:00:00', { zone: 'Asia/Kolkata' })
}

describe('googleCalendarUrl', () => {
  it('opens the new-event page with the title and the times in UTC', () => {
    const url = new URL(googleCalendarUrl(plan, { title: 'Stand-up' }))
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
    expect(url.searchParams.get('text')).toBe('Stand-up')
    expect(url.searchParams.get('dates')).toBe('20240115T040000Z/20240115T043000Z')
  })

  it('leaves the slash between the two times as it is, not percent-encoded', () => {
    expect(googleCalendarUrl(plan, { title: 'x' })).toContain('dates=20240115T040000Z/20240115T043000Z')
  })

  it('carries a title and details with awkward characters through intact', () => {
    const title = 'Q&A: plan #2 — café ☕ + 100%'
    const details = 'IST (home): Mon, Jan 15 · 9:30 AM – 10:00 AM\nLondon: 4:00 AM – 4:30 AM\n?a=b&c=d'
    const url = new URL(googleCalendarUrl(plan, { title, details }))
    expect(url.searchParams.get('text')).toBe(title)
    expect(url.searchParams.get('details')).toBe(details)
    expect([...url.searchParams.keys()]).toEqual(['action', 'text', 'dates', 'details']) // nothing injected
  })

  it('shortens very long details, so the link still opens', () => {
    const url = new URL(googleCalendarUrl(plan, { title: 'x', details: 'y'.repeat(5000) }))
    const details = url.searchParams.get('details')!
    expect(details.length).toBe(1500)
    expect(details.endsWith('…')).toBe(true)
  })

  it('uses an empty description when there are no details', () => {
    expect(new URL(googleCalendarUrl(plan, { title: 'x' })).searchParams.get('details')).toBe('')
  })

  it('is the same for any zone the plan is expressed in', () => {
    const inNewYork = { start: plan.start.setZone('America/New_York'), end: plan.end.setZone('America/New_York') }
    expect(googleCalendarUrl(inNewYork, { title: 'x' })).toBe(googleCalendarUrl(plan, { title: 'x' }))
  })
})

describe('outlookCalendarUrl', () => {
  it('opens the compose page in add-event mode with the title, times and body', () => {
    const url = new URL(outlookCalendarUrl(plan, { title: 'Stand-up', details: 'notes' }))
    expect(url.origin + url.pathname).toBe('https://outlook.live.com/calendar/0/deeplink/compose')
    expect(url.searchParams.get('path')).toBe('/calendar/action/compose')
    expect(url.searchParams.get('rru')).toBe('addevent')
    expect(url.searchParams.get('subject')).toBe('Stand-up')
    expect(url.searchParams.get('startdt')).toBe('2024-01-15T04:00:00+00:00')
    expect(url.searchParams.get('enddt')).toBe('2024-01-15T04:30:00+00:00')
    expect(url.searchParams.get('body')).toBe('notes')
  })

  it('encodes the plus of the UTC offset, which would otherwise read as a space', () => {
    const raw = outlookCalendarUrl(plan, { title: 'x' })
    expect(raw).toContain('startdt=2024-01-15T04%3A00%3A00%2B00%3A00')
    expect(raw).not.toMatch(/startdt=[^&]*\+/)
  })

  it('carries awkward characters through intact and shortens very long details', () => {
    const title = 'A&B #1 — café'
    const url = new URL(outlookCalendarUrl(plan, { title, details: 'z'.repeat(4000) }))
    expect(url.searchParams.get('subject')).toBe(title)
    expect(url.searchParams.get('body')!.length).toBe(1500)
  })
})
