import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import {
  cleanIsoDate,
  daysOffAt,
  daysOffOn,
  describeDayOffDates,
  MAX_DAYS_OFF,
  sanitizeDaysOff,
  upcomingDaysOff
} from '@core/daysOff'
import { buildTimelineForLocations } from '@core/formatters'
import { daysOffDuring, summarizePlanner } from '@core/planner'
import { isWorkColumn } from '@core/timeEngine'
import { buildWidgetRows } from '@core/widgetRows'
import type { Location } from '@core/timezones'

const IST: Location = { id: 'ist', label: 'IST', iana: 'Asia/Kolkata', isHome: true }
const LONDON: Location = { id: 'london', label: 'London', iana: 'Europe/London' }
const MONDAY = { year: 2024, month: 1, day: 15 }
const WORK = { start: 9, end: 17 }

describe('days off as stored', () => {
  it('accepts only real dates between 2000 and 2100', () => {
    expect(cleanIsoDate('2025-11-01')).toBe('2025-11-01')
    expect(cleanIsoDate('2025-02-30')).toBeNull()
    expect(cleanIsoDate('2025-2-3')).toBeNull()
    expect(cleanIsoDate('1999-12-31')).toBeNull()
    expect(cleanIsoDate('2100-01-01')).toBeNull()
    expect(cleanIsoDate(20251101)).toBeNull()
  })

  it('cleans a list: drops bad entries one by one, names blanks, sorts, and keeps one-day entries short', () => {
    expect(
      sanitizeDaysOff([
        { from: '2025-11-03', to: '2025-11-01', name: 'Backwards' },
        { from: '2025-10-20', to: '2025-10-24', name: '  Diwali \n break ' },
        { from: '2025-01-01', to: '2026-01-03', name: 'Too long' },
        { from: '2025-03-14', to: '2025-03-14', name: '' },
        { from: '2025-03-14', name: 'Day off' }, // the same entry again
        { from: 'soon', name: 'Not a date' },
        'garbage'
      ])
    ).toEqual([
      { from: '2025-03-14', name: 'Day off' },
      { from: '2025-10-20', to: '2025-10-24', name: 'Diwali break' }
    ])
    expect(sanitizeDaysOff([])).toBeNull()
    expect(sanitizeDaysOff('2025-01-01')).toBeNull()
  })

  it('keeps at most 50 entries', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ from: DateTime.utc(2025, 1, 1).plus({ days: i }).toISODate(), name: `D${i}` }))
    expect(sanitizeDaysOff(many)).toHaveLength(MAX_DAYS_OFF)
  })

  it('covers both ends of a range', () => {
    const row = { daysOff: [{ from: '2025-10-20', to: '2025-10-22', name: 'Leave' }] }
    expect(daysOffOn(row, { year: 2025, month: 10, day: 19 })).toEqual([])
    expect(daysOffOn(row, { year: 2025, month: 10, day: 20 })).toEqual(['Leave'])
    expect(daysOffOn(row, { year: 2025, month: 10, day: 22 })).toEqual(['Leave'])
    expect(daysOffOn(row, { year: 2025, month: 10, day: 23 })).toEqual([])
  })

  it('lists what is still to come, soonest first, and says the dates plainly', () => {
    const row = {
      daysOff: [
        { from: '2025-01-01', name: 'Past' },
        { from: '2025-10-18', to: '2025-10-21', name: 'Running' },
        { from: '2025-12-25', name: 'Later' }
      ]
    }
    expect(upcomingDaysOff(row, { year: 2025, month: 10, day: 20 }).map((d) => d.name)).toEqual(['Running', 'Later'])
    expect(describeDayOffDates(row.daysOff[1])).toMatch(/^Sat, Oct 18 – Tue, Oct 21$/)
  })
})

describe('a day off belongs to the row’s own calendar date', () => {
  const offOn = (location: Location, from: string): Location => ({ ...location, daysOff: [{ from, name: 'Off' }] })
  const offHours = (columns: ReturnType<typeof buildTimelineForLocations>, location: Location) =>
    columns.filter((c) => daysOffAt(c, location).length > 0).map((c) => c.homeHour)

  it('in a half-hour home zone, London’s Monday starts at 6 AM IST', () => {
    const london = offOn(LONDON, '2024-01-15')
    const cols = buildTimelineForLocations(MONDAY, [IST, london], IST.iana)
    expect(offHours(cols, london)[0]).toBe(6) // 00:30 Monday in London; 05:00 IST is 23:30 Sunday there
  })

  it('without daylight saving, Tokyo’s Tuesday starts at 3 PM in London', () => {
    const tokyo = offOn({ id: 'tokyo', label: 'Tokyo', iana: 'Asia/Tokyo' }, '2024-01-16')
    const home = { ...LONDON, isHome: true }
    const cols = buildTimelineForLocations(MONDAY, [home, tokyo], LONDON.iana)
    expect(offHours(cols, tokyo)).toEqual([15, 16, 17, 18, 19, 20, 21, 22, 23])
  })

  it('on New York’s spring-forward day, the date there starts on EST', () => {
    // Sun 2025-03-09 begins in New York at 05:00Z (still EST), which is 10:30 IST.
    const ny = offOn({ id: 'ny', label: 'New York', iana: 'America/New_York' }, '2025-03-09')
    const cols = buildTimelineForLocations({ year: 2025, month: 3, day: 9 }, [IST, ny], IST.iana)
    expect(offHours(cols, ny)[0]).toBe(11)
    expect(offHours(cols, ny)).toHaveLength(13) // to the end of the IST day
  })

  it('on Sydney’s fall-back day, the date there ends on AEST', () => {
    // Sun 2025-04-06 ends in Sydney at 14:00Z (AEST, UTC+10), which is 3 PM in London (BST).
    const sydney = offOn({ id: 'syd', label: 'Sydney', iana: 'Australia/Sydney' }, '2025-04-06')
    const home = { ...LONDON, isHome: true }
    const cols = buildTimelineForLocations({ year: 2025, month: 4, day: 6 }, [home, sydney], LONDON.iana)
    expect(offHours(cols, sydney)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
  })
})

describe('days off in the planner', () => {
  it('your own day off takes your working hours away, even if you work through public holidays', () => {
    const me = { ...IST, daysOff: [{ from: '2024-01-15', name: 'Leave' }] }
    const cols = buildTimelineForLocations(MONDAY, [me, LONDON], IST.iana)
    expect(cols.every((c) => c.homeDaysOff?.[0] === 'Leave')).toBe(true)
    expect(isWorkColumn(cols[12], { ...WORK, holidaysOff: false })).toBe(false)
    expect(summarizePlanner(cols, [me, LONDON], WORK).sharedWindows).toEqual([])
  })

  it('a day off on the day before or after changes nothing', () => {
    const me = { ...IST, daysOff: [{ from: '2024-01-14', name: 'Sunday' }, { from: '2024-01-16', name: 'Tuesday' }] }
    const cols = buildTimelineForLocations(MONDAY, [me, LONDON], IST.iana)
    expect(cols[12].homeDaysOff).toBeUndefined()
    expect(summarizePlanner(cols, [me, LONDON], WORK).sharedWindows).toEqual([{ start: 12, end: 17 }])
  })

  it('someone else’s day off makes them unavailable while it is that date where they are', () => {
    const tom = { ...LONDON, person: 'Tom', daysOff: [{ from: '2024-01-15', name: 'Leave' }] }
    const cols = buildTimelineForLocations(MONDAY, [IST, tom], IST.iana)
    const s = summarizePlanner(cols, [IST, tom], WORK)
    expect(s.sharedWindows).toEqual([])
    expect(s.scores[12]).toEqual({ homeHour: 12, mine: true, awake: 2, total: 2, holiday: 1 })
    expect(daysOffDuring(cols, [IST, tom], { start: 12, end: 13 })).toEqual([{ location: tom, names: ['Leave'] }])
    expect(daysOffDuring(cols, [IST, tom], { start: 0, end: 5 })).toEqual([]) // still Sunday in London
  })

  it('two people in the same city keep their own days off', () => {
    const tom = { ...LONDON, person: 'Tom', daysOff: [{ from: '2024-01-15', name: 'Leave' }] }
    const ana: Location = { id: 'london-2', label: 'London', iana: 'Europe/London', person: 'Ana' }
    const cols = buildTimelineForLocations(MONDAY, [IST, tom, ana], IST.iana)
    expect(daysOffAt(cols[12], tom)).toEqual(['Leave'])
    expect(daysOffAt(cols[12], ana)).toEqual([])
    expect(summarizePlanner(cols, [IST, tom, ana], WORK).scores[12].holiday).toBe(1)
  })
})

describe('days off in the widget', () => {
  // Monday 15 January 2024, 12:00 IST.
  const now = DateTime.fromISO('2024-01-15T06:30:00Z')

  it('shows the row’s own day off, and your day off takes your hours away', () => {
    const me = { ...IST, daysOff: [{ from: '2024-01-15', name: 'Leave' }] }
    const tom = { ...LONDON, daysOff: [{ from: '2024-01-15', name: 'Conference' }] }
    const rows = buildWidgetRows([me, tom], '12h', now, WORK)
    expect(rows.map((r) => r.holiday)).toEqual(['Leave', 'Conference'])
    expect(rows[0].phase).toBe('awake')
    expect(buildWidgetRows([IST, LONDON], '12h', now, WORK)[0].phase).toBe('work')
  })
})
