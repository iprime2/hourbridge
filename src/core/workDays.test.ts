import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import {
  describeWorkDays,
  sameDays,
  sanitizeWorkDays,
  toggleWorkDay,
  WEEKDAYS
} from '@core/workDays'
import { DEFAULT_WORK_DAYS, isWorkDay, isWorkInstant } from '@core/timeEngine'

describe('WEEKDAYS', () => {
  it('lists Monday to Sunday with their ISO numbers', () => {
    expect(WEEKDAYS.map((d) => d.iso)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(WEEKDAYS.map((d) => d.short)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(WEEKDAYS[6].long).toBe('Sunday')
  })
})

describe('sanitizeWorkDays', () => {
  it('sorts and de-duplicates', () => {
    expect(sanitizeWorkDays([7, 1, 3, 3, 6, 2])).toEqual([1, 2, 3, 6, 7])
  })

  it.each([undefined, null, 'mon', 5, {}, [], [0], [8], [1.5], ['1'], [1, 'x'], [NaN]])(
    'rejects %j',
    (bad) => {
      expect(sanitizeWorkDays(bad)).toBeNull()
    }
  )
})

describe('toggleWorkDay', () => {
  it('adds a day, keeping the week in order', () => {
    expect(toggleWorkDay([1, 2, 3, 4, 5], 6)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('removes a day', () => {
    expect(toggleWorkDay([1, 2, 3, 4, 5], 3)).toEqual([1, 2, 4, 5])
  })

  it('treats "no days set" as Monday–Friday', () => {
    expect(toggleWorkDay(undefined, 5)).toEqual([1, 2, 3, 4])
  })

  it('builds a Saturday–Wednesday week one tap at a time', () => {
    let days: number[] = [...DEFAULT_WORK_DAYS]
    for (const tap of [4, 5, 6, 7]) days = toggleWorkDay(days, tap)
    expect(days).toEqual([1, 2, 3, 6, 7])
  })

  it('never turns off the last working day', () => {
    expect(toggleWorkDay([3], 3)).toEqual([3])
  })

  it('ignores a weekday that is not 1–7', () => {
    expect(toggleWorkDay([1, 2], 9)).toEqual([1, 2])
    expect(toggleWorkDay([1, 2], 0)).toEqual([1, 2])
  })
})

describe('describeWorkDays', () => {
  it.each([
    [undefined, 'Mon–Fri'],
    [[1, 2, 3, 4, 5], 'Mon–Fri'],
    [[1, 2, 3, 6, 7], 'Sat–Wed'], // off Thursday and Friday: the run wraps past Sunday
    [[7, 1, 2, 3, 4], 'Sun–Thu'],
    [[1, 3, 5], 'Mon, Wed, Fri'],
    [[6, 7], 'Sat, Sun'],
    [[7, 1], 'Sun, Mon'],
    [[4], 'Thu'],
    [[1, 2, 3, 4, 5, 6, 7], 'Every day'],
    [[1, 2, 4, 5], 'Mon, Tue, Thu, Fri']
  ])('%j reads as "%s"', (days, expected) => {
    expect(describeWorkDays(days)).toBe(expected)
  })

  it('falls back to Mon–Fri for unusable input', () => {
    expect(describeWorkDays([])).toBe('Mon–Fri')
  })
})

describe('sameDays', () => {
  it('compares two ordered lists', () => {
    expect(sameDays([1, 2, 3], [1, 2, 3])).toBe(true)
    expect(sameDays([1, 2, 3], [1, 2])).toBe(false)
    expect(sameDays([1, 2, 3], [1, 2, 4])).toBe(false)
  })
})

describe('isWorkDay / isWorkInstant with a custom week', () => {
  const weekendSchedule = { start: 9, end: 17, days: [1, 2, 3, 6, 7] } // off Thursday and Friday
  const ist = (iso: string) => DateTime.fromISO(iso, { zone: 'Asia/Kolkata' })

  it('defaults to Monday–Friday when days is absent', () => {
    for (const weekday of [1, 2, 3, 4, 5]) expect(isWorkDay(weekday)).toBe(true)
    for (const weekday of [6, 7]) expect(isWorkDay(weekday)).toBe(false)
    expect(isWorkDay(4, { start: 9, end: 17 } as { days?: readonly number[] })).toBe(true)
  })

  it('works Saturday and Sunday and rests Thursday and Friday on the weekend schedule', () => {
    // 2024-01-15 is a Monday.
    const noon = (day: number) => ist(`2024-01-${day}T12:00:00`)
    expect([15, 16, 17].map((d) => isWorkInstant(noon(d), 'Asia/Kolkata', weekendSchedule))).toEqual([true, true, true]) // Mon–Wed
    expect([18, 19].map((d) => isWorkInstant(noon(d), 'Asia/Kolkata', weekendSchedule))).toEqual([false, false]) // Thu, Fri
    expect([20, 21].map((d) => isWorkInstant(noon(d), 'Asia/Kolkata', weekendSchedule))).toEqual([true, true]) // Sat, Sun
  })

  it('still respects the hours on a working day', () => {
    expect(isWorkInstant(ist('2024-01-20T08:59:00'), 'Asia/Kolkata', weekendSchedule)).toBe(false)
    expect(isWorkInstant(ist('2024-01-20T09:00:00'), 'Asia/Kolkata', weekendSchedule)).toBe(true)
    expect(isWorkInstant(ist('2024-01-20T17:59:00'), 'Asia/Kolkata', weekendSchedule)).toBe(true)
    expect(isWorkInstant(ist('2024-01-20T18:00:00'), 'Asia/Kolkata', weekendSchedule)).toBe(false)
  })

  it('judges the day in the home zone, not where the instant happens to be expressed', () => {
    // Saturday 00:30 in Kolkata is still Friday in London.
    const instant = DateTime.fromISO('2024-01-19T19:00:00Z') // Sat 00:30 IST, Fri 19:00 London
    const lateShift = { start: 0, end: 23, days: [6] }
    expect(isWorkInstant(instant, 'Asia/Kolkata', lateShift)).toBe(true)
    expect(isWorkInstant(instant, 'Europe/London', lateShift)).toBe(false)
  })
})
