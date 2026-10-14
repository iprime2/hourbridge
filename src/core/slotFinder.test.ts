import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import { addDays, findSlots, formatDayLabel, MAX_SEARCH_DAYS } from '@core/slotFinder'
import type { HolidayLookup } from '@core/holidays'
import type { Location } from '@core/timezones'
import type { WorkHours } from '@core/timeEngine'

const IST: Location = { id: 'ist', label: 'IST', iana: 'Asia/Kolkata', isHome: true }
const LONDON: Location = { id: 'london', label: 'London', iana: 'Europe/London' }
const NEPAL: Location = { id: 'ktm', label: 'Kathmandu', iana: 'Asia/Kathmandu' }
const WORK: WorkHours = { start: 9, end: 17 }
const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7]

/** "2024-01-15 12–17" for each slot, so a whole result reads at a glance. */
const show = (slots: ReturnType<typeof findSlots>) =>
  slots.map(({ date, range }) =>
    `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')} ${range.start}–${range.end}`
  )

/** A holiday lookup with a fixed list: `zone|yyyy-m-d`. */
const holidaysOn = (...days: string[]): HolidayLookup => (zone, d) =>
  days.includes(`${zone}|${d.year}-${d.month}-${d.day}`) ? ['Test Day'] : []

describe('findSlots', () => {
  // Monday 15 January 2024. London is on GMT: awake 06:00–21:59 there, 11:30 IST onwards,
  // so with working hours 9 AM – 5 PM (5 PM tile included) the shared run is 12 – 17 every workday.
  const week = { from: { year: 2024, month: 1, day: 15 }, days: 7, locations: [IST, LONDON], homeZone: IST.iana, work: WORK }

  it('lists the good hours of each working day, and none on the weekend', () => {
    expect(show(findSlots(week))).toEqual([
      '2024-01-15 12–17',
      '2024-01-16 12–17',
      '2024-01-17 12–17',
      '2024-01-18 12–17',
      '2024-01-19 12–17'
    ])
  })

  it('follows your own working days (judged at home)', () => {
    const slots = findSlots({ ...week, work: { ...WORK, days: [1, 2, 3, 4, 6] } })
    expect(show(slots).map((s) => s.slice(0, 10))).toEqual(['2024-01-15', '2024-01-16', '2024-01-17', '2024-01-18', '2024-01-20'])
  })

  it('skips a day when another city is on a public holiday then', () => {
    const slots = findSlots({ ...week, holidays: holidaysOn('Europe/London|2024-1-17') })
    expect(show(slots).map((s) => s.slice(0, 10))).not.toContain('2024-01-17')
    expect(slots).toHaveLength(4)
  })

  it('treats a holiday at home as a day off, unless you work through holidays', () => {
    const holidays = holidaysOn('Asia/Kolkata|2024-1-16')
    expect(show(findSlots({ ...week, holidays })).map((s) => s.slice(0, 10))).not.toContain('2024-01-16')
    expect(show(findSlots({ ...week, holidays, work: { ...WORK, holidaysOff: false } }))).toContain('2024-01-16 12–17')
  })

  it('judges a holiday by each city’s own date, also when that date is the day before', () => {
    // Auckland (NZDT, +13) with London (GMT): London is awake for Auckland's 9–10 AM, which is
    // 8–9 PM the evening BEFORE in London. A London holiday on Monday 15th therefore removes
    // Auckland's Tuesday 16th, and leaves Auckland's Monday alone.
    const AUCKLAND: Location = { id: 'akl', label: 'Auckland', iana: 'Pacific/Auckland', isHome: true }
    const slots = findSlots({
      from: { year: 2024, month: 1, day: 15 },
      days: 2,
      locations: [AUCKLAND, LONDON],
      homeZone: AUCKLAND.iana,
      work: WORK,
      holidays: holidaysOn('Europe/London|2024-1-15')
    })
    expect(show(slots)).toEqual(['2024-01-15 9–10'])
  })

  it('leaves out hours that have started, and whole runs that are over', () => {
    // 2:20 PM IST on Monday: the 2 PM hour is under way, so Monday's run starts at 3 PM.
    const notBefore = DateTime.fromISO('2024-01-15T08:50:00Z')
    expect(show(findSlots({ ...week, days: 2, notBefore }))).toEqual(['2024-01-15 15–17', '2024-01-16 12–17'])
    // 5:30 PM IST: Monday is over.
    const late = DateTime.fromISO('2024-01-15T12:00:00Z')
    expect(show(findSlots({ ...week, days: 2, notBefore: late }))).toEqual(['2024-01-16 12–17'])
  })

  it('follows a daylight-saving change in the home zone (northern hemisphere, a different date from London)', () => {
    // New York goes to EDT on Sunday 10 March 2024; London stays on GMT until the 31st. London is
    // awake 06:00–21:59 GMT: 1–4:59 PM EST before the change, 2–5:59 PM EDT after it.
    const NEW_YORK: Location = { id: 'ny', label: 'New York', iana: 'America/New_York', isHome: true }
    const slots = findSlots({
      from: { year: 2024, month: 3, day: 7 },
      days: 6,
      locations: [NEW_YORK, LONDON],
      homeZone: NEW_YORK.iana,
      work: WORK
    })
    expect(show(slots)).toEqual(['2024-03-07 9–16', '2024-03-08 9–16', '2024-03-11 9–17', '2024-03-12 9–17'])
  })

  it('follows a daylight-saving change in the southern hemisphere', () => {
    // Sydney leaves AEDT (+11) for AEST (+10) on Sunday 7 April 2024; London is on BST (+1).
    // London wakes at 05:00 UTC: 4 PM in Sydney before the change, 3 PM after.
    const SYDNEY: Location = { id: 'syd', label: 'Sydney', iana: 'Australia/Sydney', isHome: true }
    const slots = findSlots({
      from: { year: 2024, month: 4, day: 5 },
      days: 4,
      locations: [SYDNEY, LONDON],
      homeZone: SYDNEY.iana,
      work: WORK
    })
    expect(show(slots)).toEqual(['2024-04-05 16–17', '2024-04-08 15–17'])
  })

  it('works with zones a half and three quarters of an hour off UTC, and no daylight saving', () => {
    // Kathmandu is 15 minutes ahead of IST, so it is awake whenever IST is.
    const slots = findSlots({ ...week, days: 1, locations: [IST, NEPAL] })
    expect(show(slots)).toEqual(['2024-01-15 9–17'])
  })

  it('searches whole days from the first one, and never more than the limit', () => {
    expect(findSlots({ ...week, days: 0 })).toEqual([])
    const all = findSlots({ ...week, days: 400, work: { ...WORK, days: EVERY_DAY } })
    expect(all).toHaveLength(MAX_SEARCH_DAYS)
    expect(all.at(-1)!.date).toEqual(addDays(week.from, MAX_SEARCH_DAYS - 1))
  })

  it('finds nothing without cities', () => {
    expect(findSlots({ ...week, locations: [] })).toEqual([])
  })
})

describe('calendar days', () => {
  it('adds days across months, years and a leap day, and back', () => {
    expect(addDays({ year: 2024, month: 2, day: 28 }, 1)).toEqual({ year: 2024, month: 2, day: 29 })
    expect(addDays({ year: 2024, month: 2, day: 28 }, 2)).toEqual({ year: 2024, month: 3, day: 1 })
    expect(addDays({ year: 2023, month: 12, day: 31 }, 1)).toEqual({ year: 2024, month: 1, day: 1 })
    expect(addDays({ year: 2024, month: 1, day: 1 }, -1)).toEqual({ year: 2023, month: 12, day: 31 })
  })

  it('names a day', () => {
    expect(formatDayLabel({ year: 2024, month: 1, day: 17 })).toBe('Wed, Jan 17')
  })
})
