import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import {
  cleanPersonFields,
  cleanPersonName,
  describePersonHours,
  inPersonHours,
  isOutsideHoursDuring,
  ownHours,
  rowName,
  sanitizePersonHours
} from '@core/people'
import { buildDayTimeline } from '@core/timeEngine'
import { availableAt, summarizePlanner } from '@core/planner'
import type { Location } from '@core/timezones'

const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7]
const IST: Location = { id: 'ist', label: 'IST', iana: 'Asia/Kolkata', isHome: true }

/** The local hour a city's tile shows in a home-hour column, and whether it is inside `hours`. */
function tile(columns: ReturnType<typeof buildDayTimeline>, h: number, zone: string) {
  return columns[h].cells[zone]
}

describe('a person and their own hours on a row', () => {
  it('names a row after the person, with the city kept', () => {
    expect(rowName({ label: 'Pune', person: 'Priya' })).toBe('Priya (Pune)')
    expect(rowName({ label: 'Pune' })).toBe('Pune')
  })

  it('cleans a name to one short line', () => {
    expect(cleanPersonName('  Priya \n Sharma ')).toBe('Priya Sharma')
    expect(cleanPersonName('x'.repeat(60))).toHaveLength(40)
    expect(cleanPersonName(42)).toBe('')
  })

  it('keeps valid hours in the stored form and refuses anything else', () => {
    expect(sanitizePersonHours({ start: 7, end: 15 })).toEqual({ start: 7, end: 15 })
    expect(sanitizePersonHours({ start: 7, end: 15, days: [5, 1, 2, 3, 4] })).toEqual({ start: 7, end: 15 })
    expect(sanitizePersonHours({ start: 7, end: 15, days: [6, 7] })).toEqual({ start: 7, end: 15, days: [6, 7] })
    expect(sanitizePersonHours({ start: 15, end: 7 })).toBeNull()
    expect(sanitizePersonHours({ start: 0, end: 24 })).toBeNull()
    expect(sanitizePersonHours({ start: 9.5, end: 17 })).toBeNull()
    expect(sanitizePersonHours({ start: 9, end: 17, days: [] })).toBeNull()
    expect(sanitizePersonHours({ start: 9, end: 17, days: [0] })).toBeNull()
    expect(sanitizePersonHours('9-5')).toBeNull()
  })

  it('drops a bad name or bad hours without losing the city', () => {
    const row = { id: 'x', label: 'Austin', iana: 'America/Chicago', person: 7, hours: { start: 30, end: 2 } }
    expect(cleanPersonFields(row as unknown as Location)).toEqual({ id: 'x', label: 'Austin', iana: 'America/Chicago' })
  })

  it('ignores hours on the home row: yours are the working hours in Settings', () => {
    expect(ownHours({ isHome: true, hours: { start: 7, end: 15 } })).toBeNull()
    expect(ownHours({ hours: { start: 7, end: 15 } })).toEqual({ start: 7, end: 15 })
  })

  it('describes the hours by their first and last tiles, as Settings does for yours', () => {
    expect(describePersonHours({ start: 9, end: 16 }, '24h')).toBe('09:00 … 16:00, Mon–Fri')
    expect(describePersonHours({ start: 7, end: 14, days: [6, 7] }, '12h')).toMatch(/^7:00\sAM … 2:00\sPM, Sat, Sun$/)
  })
})

describe('own hours are judged in the person’s own zone', () => {
  // Mon 2024-01-15. Home IST (+5:30, half-hour zone); London on GMT, 5:30 behind.
  it('in a half-hour home zone, the first tile inside London 9–5 is the one where it is 9:30 there', () => {
    const cols = buildDayTimeline({ year: 2024, month: 1, day: 15 }, ['Asia/Kolkata', 'Europe/London'], 'Asia/Kolkata')
    const hours = { start: 9, end: 17 }
    expect(tile(cols, 14, 'Europe/London')).toMatchObject({ hour: 8, minute: 30 })
    expect(inPersonHours(tile(cols, 14, 'Europe/London'), hours)).toBe(false)
    expect(inPersonHours(tile(cols, 15, 'Europe/London'), hours)).toBe(true)
    expect(inPersonHours(tile(cols, 23, 'Europe/London'), hours)).toBe(true) // 17:30 there
  })

  it('in a 45-minute zone, a meeting must not start before their first hour', () => {
    const hours = { start: 10, end: 13 }
    const at = (iso: string, minutes: number) => {
      const start = DateTime.fromISO(iso, { zone: 'utc' })
      return { start, end: start.plus({ minutes }) }
    }
    // Kathmandu is UTC+5:45: 04:15Z is 10:00 there, 04:00Z is 09:45.
    expect(isOutsideHoursDuring(at('2024-01-15T04:15:00Z', 30), 'Asia/Kathmandu', hours)).toBe(false)
    expect(isOutsideHoursDuring(at('2024-01-15T04:00:00Z', 30), 'Asia/Kathmandu', hours)).toBe(true)
    // 13:00–14:00 there is the last hour (end inclusive); 14:00–14:15 is past it.
    expect(isOutsideHoursDuring(at('2024-01-15T07:15:00Z', 60), 'Asia/Kathmandu', hours)).toBe(false)
    expect(isOutsideHoursDuring(at('2024-01-15T07:15:00Z', 75), 'Asia/Kathmandu', hours)).toBe(true)
  })

  it('on New York’s spring-forward day, uses the new offset (EDT) once clocks have changed', () => {
    // Sun 2025-03-09: New York is EDT (UTC−4) from 02:00 local. 9:00 EDT is 18:30 IST.
    const cols = buildDayTimeline({ year: 2025, month: 3, day: 9 }, ['Asia/Kolkata', 'America/New_York'], 'Asia/Kolkata')
    const hours = { start: 9, end: 17, days: EVERY_DAY }
    expect(inPersonHours(tile(cols, 18, 'America/New_York'), hours)).toBe(false) // 08:30 EDT
    expect(inPersonHours(tile(cols, 19, 'America/New_York'), hours)).toBe(true) // 09:30 EDT (EST would say 08:30)
  })

  it('on Sydney’s fall-back day, uses the new offset (AEST) once clocks have changed', () => {
    // Sun 2025-04-06: Sydney is AEST (UTC+10) from 03:00 local. 9:00 AEST is 04:30 IST.
    const cols = buildDayTimeline({ year: 2025, month: 4, day: 6 }, ['Asia/Kolkata', 'Australia/Sydney'], 'Asia/Kolkata')
    const hours = { start: 9, end: 17, days: EVERY_DAY }
    expect(inPersonHours(tile(cols, 4, 'Australia/Sydney'), hours)).toBe(false) // 08:30
    expect(inPersonHours(tile(cols, 5, 'Australia/Sydney'), hours)).toBe(true) // 09:30
    expect(inPersonHours(tile(cols, 13, 'Australia/Sydney'), hours)).toBe(true) // 17:30
    expect(inPersonHours(tile(cols, 14, 'Australia/Sydney'), hours)).toBe(false) // 18:30
  })

  it('across midnight, the weekday is theirs: Tokyo’s Friday ends during London’s Friday', () => {
    // Fri 2024-01-19 in London (GMT). Tokyo (UTC+9, no DST) reaches Saturday at London 15:00.
    const cols = buildDayTimeline({ year: 2024, month: 1, day: 19 }, ['Europe/London', 'Asia/Tokyo'], 'Europe/London')
    const hours = { start: 0, end: 23 } // all day, Monday–Friday
    expect(inPersonHours(tile(cols, 14, 'Asia/Tokyo'), hours)).toBe(true) // Fri 23:00 there
    expect(inPersonHours(tile(cols, 15, 'Asia/Tokyo'), hours)).toBe(false) // Sat 00:00 there
  })
})

describe('the planner with people’s own hours', () => {
  const MONDAY = { year: 2024, month: 1, day: 15 }
  const work = { start: 9, end: 17 }
  const london: Location = { id: 'london', label: 'London', iana: 'Europe/London' }
  const cols = buildDayTimeline(MONDAY, ['Asia/Kolkata', 'Europe/London'], 'Asia/Kolkata')

  it('without own hours, someone awake counts as available', () => {
    const s = summarizePlanner(cols, [IST, london], work)
    expect(s.sharedWindows).toEqual([{ start: 12, end: 17 }]) // London awake from 06:30
  })

  it('with own hours, only their hours count, and the others are reported as outside them', () => {
    const tom = { ...london, person: 'Tom', hours: { start: 9, end: 17 } }
    const s = summarizePlanner(cols, [IST, tom], work)
    expect(s.sharedWindows).toEqual([{ start: 15, end: 17 }]) // London 09:30 onwards
    expect(s.scores[14]).toEqual({ homeHour: 14, mine: true, awake: 2, total: 2, offHours: 1 })
    expect(availableAt(s.scores[14])).toBe(1)
    expect(s.scores[15]).toEqual({ homeHour: 15, mine: true, awake: 2, total: 2 })
  })

  it('someone who works early is available in their hours even when it would be night', () => {
    // Tokyo (UTC+9) 05:00 is IST 01:30: night by the clock, but inside 5 AM – 1 PM.
    const cols2 = buildDayTimeline(MONDAY, ['Asia/Kolkata', 'Asia/Tokyo'], 'Asia/Kolkata')
    const early: Location = { id: 'tokyo', label: 'Tokyo', iana: 'Asia/Tokyo', person: 'Aiko', hours: { start: 5, end: 13 } }
    const s = summarizePlanner(cols2, [early], work)
    expect(s.scores[2]).toEqual({ homeHour: 2, mine: false, awake: 1, total: 1 }) // 05:30 there
    expect(s.scores[1]).toEqual({ homeHour: 1, mine: false, awake: 0, total: 1 }) // 04:30 there: asleep
  })

  it('own hours on the home row change nothing: your hours are the working hours', () => {
    const me = { ...IST, hours: { start: 0, end: 1 } }
    expect(summarizePlanner(cols, [me, london], work).sharedWindows).toEqual([{ start: 12, end: 17 }])
  })
})
