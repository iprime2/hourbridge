import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import {
  describeDuration,
  formatDuration,
  meetingColumns,
  meetingFromRange,
  meetingPlan,
  moveMeeting,
  resizeMeeting,
  stepMeetingLength,
  withStartMinute,
  type Meeting
} from '@core/meeting'
import { buildDayTimeline } from '@core/timeEngine'

const at = (hour: number, minute = 0, minutes = 60): Meeting => ({ startMinute: hour * 60 + minute, minutes })

describe('stepMeetingLength: 15, 30, 45, 60, 90, 120, 180, 240 …', () => {
  it('climbs by quarter hours to an hour, half hours to two, then hours', () => {
    const up: number[] = [15]
    for (let i = 0; i < 9; i++) up.push(stepMeetingLength(up[i], 1))
    expect(up).toEqual([15, 30, 45, 60, 90, 120, 180, 240, 300, 360])
  })

  it('walks the same ladder back down, and stops at 15 minutes', () => {
    const down: number[] = [240]
    for (let i = 0; i < 8; i++) down.push(stepMeetingLength(down[i], -1))
    expect(down).toEqual([240, 180, 120, 90, 60, 45, 30, 15, 15])
  })

  it('takes several steps at once', () => {
    expect(stepMeetingLength(60, 2)).toBe(120)
    expect(stepMeetingLength(60, -2)).toBe(30)
    expect(stepMeetingLength(60, -10)).toBe(15)
    expect(stepMeetingLength(60, 0)).toBe(60)
  })

  it('always stays a multiple of 15, whatever it starts from', () => {
    for (const start of [15, 30, 45, 60, 75, 105, 135, 300]) {
      for (const steps of [-3, -1, 1, 3]) expect(stepMeetingLength(start, steps) % 15).toBe(0)
    }
  })
})

describe('resizeMeeting', () => {
  it('shortens an hour meeting to 45, 30 and 15 minutes, and no further', () => {
    let meeting = at(9)
    const seen: number[] = []
    for (let i = 0; i < 5; i++) {
      meeting = resizeMeeting(meeting, -1)
      seen.push(meeting.minutes)
    }
    expect(seen).toEqual([45, 30, 15, 15, 15])
  })

  it('lengthens, but never past midnight', () => {
    expect(resizeMeeting(at(20), 1).minutes).toBe(90)
    expect(resizeMeeting(at(22, 0, 120), 1)).toEqual(at(22, 0, 120)) // already ends at midnight
    expect(resizeMeeting(at(23, 0, 60), 1)).toEqual(at(23, 0, 60))
    expect(resizeMeeting(at(23, 30, 30), 5)).toEqual(at(23, 30, 30))
    expect(resizeMeeting(at(21), 10).minutes).toBe(180) // 21:00 + 3h = midnight, the most that fits
  })

  it('returns the same object when nothing changes (no needless re-render)', () => {
    const meeting = at(23)
    expect(resizeMeeting(meeting, 1)).toBe(meeting)
    expect(resizeMeeting(at(9, 0, 15), -1)).toEqual(at(9, 0, 15))
  })

  it('keeps the start where it is', () => {
    expect(resizeMeeting(at(9, 30), -1)).toEqual(at(9, 30, 45))
  })
})

describe('moveMeeting', () => {
  it('moves by whole hours, keeping the minute past the hour and the length', () => {
    expect(moveMeeting(at(9, 30, 30), 2)).toEqual(at(11, 30, 30))
    expect(moveMeeting(at(9, 15, 45), -1)).toEqual(at(8, 15, 45))
  })

  it('wraps a meeting of an hour or less around midnight, as a single tile always did', () => {
    expect(moveMeeting(at(23), 1)).toEqual(at(0))
    expect(moveMeeting(at(0), -1)).toEqual(at(23))
    expect(moveMeeting(at(22, 30, 30), 2)).toEqual(at(0, 30, 30))
    expect(moveMeeting(at(5, 0, 15), 48)).toEqual(at(5, 0, 15))
  })

  it('never lets a wrapped meeting run past midnight', () => {
    // 23:30 for an hour does not fit, so a 23:00 hour moved by 30 minutes' worth lands where it fits.
    expect(moveMeeting(at(22, 30, 60), 1)).toEqual({ startMinute: 23 * 60, minutes: 60 })
  })

  it('stops a longer meeting at the ends of the day instead of wrapping', () => {
    expect(moveMeeting(at(21, 0, 120), 5)).toEqual(at(22, 0, 120))
    expect(moveMeeting(at(1, 0, 180), -30)).toEqual(at(0, 0, 180))
    expect(moveMeeting(at(10, 0, 180), 1)).toEqual(at(11, 0, 180))
  })
})

describe('withStartMinute', () => {
  it('sets the minute past the start hour and keeps the length', () => {
    expect(withStartMinute(at(9), 30)).toEqual(at(9, 30))
    expect(withStartMinute(at(9, 45, 30), 0)).toEqual(at(9, 0, 30))
    expect(withStartMinute(at(14, 0, 90), 15)).toEqual(at(14, 15, 90))
  })

  it('shortens a meeting that would otherwise run past midnight', () => {
    expect(withStartMinute(at(23), 30)).toEqual(at(23, 30, 30))
    expect(withStartMinute(at(23), 45)).toEqual(at(23, 45, 15))
    expect(withStartMinute(at(22, 0, 120), 30)).toEqual(at(22, 30, 90))
  })
})

describe('meetingColumns and meetingFromRange', () => {
  it('lists the hour columns a meeting touches', () => {
    expect(meetingColumns(at(9))).toEqual({ start: 9, end: 9 })
    expect(meetingColumns(at(9, 30, 30))).toEqual({ start: 9, end: 9 })
    expect(meetingColumns(at(9, 0, 15))).toEqual({ start: 9, end: 9 })
    expect(meetingColumns(at(9, 30, 60))).toEqual({ start: 9, end: 10 })
    expect(meetingColumns(at(9, 45, 90))).toEqual({ start: 9, end: 11 })
    expect(meetingColumns(at(22, 0, 120))).toEqual({ start: 22, end: 23 })
  })

  it('turns a whole-hour range into the meeting that fills it, and back', () => {
    expect(meetingFromRange({ start: 10, end: 14 })).toEqual(at(10, 0, 300))
    for (const range of [{ start: 0, end: 0 }, { start: 10, end: 14 }, { start: 22, end: 23 }]) {
      expect(meetingColumns(meetingFromRange(range))).toEqual(range)
    }
  })
})

describe('meetingPlan: the meeting as instants', () => {
  const IST = 'Asia/Kolkata'
  const columns = buildDayTimeline({ year: 2026, month: 10, day: 5 }, [IST], IST)
  const iso = (dt: DateTime) => dt.setZone(IST).toFormat("HH:mm")

  it('puts a whole-hour meeting exactly where it always was', () => {
    const plan = meetingPlan(at(9), columns)!
    expect([iso(plan.start), iso(plan.end)]).toEqual(['09:00', '10:00'])
    const range = meetingPlan(meetingFromRange({ start: 9, end: 11 }), columns)!
    expect([iso(range.start), iso(range.end)]).toEqual(['09:00', '12:00'])
  })

  it('starts and ends on the quarter hours', () => {
    const cases: Array<[Meeting, string, string]> = [
      [at(9, 30, 30), '09:30', '10:00'],
      [at(9, 0, 15), '09:00', '09:15'],
      [at(9, 45, 15), '09:45', '10:00'],
      [at(9, 30, 60), '09:30', '10:30'],
      [at(9, 15, 90), '09:15', '10:45'],
      [at(23, 30, 30), '23:30', '00:00']
    ]
    for (const [meeting, from, to] of cases) {
      const plan = meetingPlan(meeting, columns)!
      expect([iso(plan.start), iso(plan.end)], JSON.stringify(meeting)).toEqual([from, to])
      expect(plan.end.diff(plan.start, 'minutes').minutes).toBe(meeting.minutes)
    }
  })

  it('has nothing for a column that is not there', () => {
    expect(meetingPlan(at(9), [])).toBeNull()
  })

  it('counts a partial hour from its own column on a daylight-saving day, as a whole hour does', () => {
    // 2026-11-01 in New York: 01:00 happens twice; the column shows the first.
    const NY = 'America/New_York'
    const cols = buildDayTimeline({ year: 2026, month: 11, day: 1 }, [NY], NY)
    const hour = meetingPlan(at(1), cols)!
    expect(hour.end.diff(hour.start, 'minutes').minutes).toBe(60) // one real hour, not two
    const half = meetingPlan(at(1, 30, 30), cols)!
    expect(half.end.diff(half.start, 'minutes').minutes).toBe(30)
    expect(half.start.setZone(NY).toFormat('HH:mm ZZZZ')).toMatch(/^01:30 /)
  })
})

describe('describing a length', () => {
  it('writes it short for the stepper', () => {
    expect([15, 30, 45, 60, 75, 90, 120, 150, 180].map(formatDuration)).toEqual([
      '15m', '30m', '45m', '1h', '1h 15m', '1h 30m', '2h', '2h 30m', '3h'
    ])
  })

  it('writes it in words for a screen reader', () => {
    expect([15, 60, 90, 120].map(describeDuration)).toEqual(['15 minutes', '1 hour', '1 hour 30 minutes', '2 hours'])
  })
})
