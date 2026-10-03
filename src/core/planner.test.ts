import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import {
  buildDayTimeline,
  classifyTile,
  isWorkColumn,
  isWorkInstant
} from '@core/timeEngine'
import {
  isAsleepAt,
  normalizeRange,
  phaseAt,
  rangeContains,
  summarizePlanner
} from '@core/planner'
import type { Location } from '@core/timezones'

const IST: Location = { id: 'ist', label: 'IST', iana: 'Asia/Kolkata', isHome: true }
const LONDON: Location = { id: 'london', label: 'London', iana: 'Europe/London' }
const TOKYO: Location = { id: 'tokyo', label: 'Tokyo', iana: 'Asia/Tokyo' }

// Mon 2024-01-15: London is on GMT (UTC+0), IST is UTC+5:30, so London local = IST − 5:30.
//   IST is awake (06:00–21:59) in home columns 6–21.
//   London is asleep (22:00–05:59) in home columns 4–11, awake in 0–3 and 12–23.
const MONDAY = { year: 2024, month: 1, day: 15 }
const SATURDAY = { year: 2024, month: 1, day: 20 }
const work = { start: 9, end: 17 } // IST 9:00 through the 5 PM tile (ends 5:59 PM)

const timeline = (date = MONDAY, zones = [IST, LONDON]) =>
  buildDayTimeline(date, zones.map((z) => z.iana), IST.iana)

describe('working hours are defined in the HOME zone, inclusive at both ends', () => {
  it('marks the start and end hour tiles, and nothing outside them', () => {
    const cols = timeline()
    expect(isWorkColumn(cols[8], work)).toBe(false)
    expect(isWorkColumn(cols[9], work)).toBe(true)
    expect(isWorkColumn(cols[17], work)).toBe(true) // the end hour's own tile is included
    expect(isWorkColumn(cols[18], work)).toBe(false)
  })

  it('makes "1 PM – 9 PM" cover the 9 PM tile too (nine tiles, 13…21)', () => {
    const cols = timeline()
    const green = cols.filter((c) => isWorkColumn(c, { start: 13, end: 21 })).map((c) => c.homeHour)
    expect(green).toEqual([13, 14, 15, 16, 17, 18, 19, 20, 21])
  })

  it('supports a one-hour window (start = end) and the full day', () => {
    const cols = timeline()
    expect(cols.filter((c) => isWorkColumn(c, { start: 10, end: 10 })).map((c) => c.homeHour)).toEqual([10])
    expect(cols.filter((c) => isWorkColumn(c, { start: 0, end: 23 }))).toHaveLength(24)
  })

  it('never counts weekends', () => {
    const cols = timeline(SATURDAY)
    expect(cols.some((c) => isWorkColumn(c, { start: 0, end: 23 }))).toBe(false)
  })

  it('judges the weekday in the home zone, not in each city', () => {
    const cols = timeline()
    // Home column 3 is Monday 03:00 IST — but it is still Sunday evening in London.
    expect(cols[3].cells[LONDON.iana].weekday).toBe(7)
    expect(isWorkColumn(cols[3], { start: 0, end: 23 })).toBe(true)
  })

  it('lines up: every city gets the same green columns', () => {
    const cols = timeline(MONDAY, [IST, LONDON, TOKYO])
    for (const zone of [IST, LONDON, TOKYO]) {
      const green = cols
        .filter((c) => classifyTile(c, c.cells[zone.iana], work).phase === 'work')
        .map((c) => c.homeHour)
      expect(green).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17])
    }
  })
})

describe('classifyTile', () => {
  it('reports a green tile as asleep when that city is at night', () => {
    const cols = timeline()
    // Column 10 = IST 10:00 = London 04:30 (asleep), but it is inside your hours.
    expect(classifyTile(cols[10], cols[10].cells[LONDON.iana], work)).toEqual({
      phase: 'work',
      asleep: true
    })
    expect(classifyTile(cols[10], cols[10].cells[IST.iana], work)).toEqual({
      phase: 'work',
      asleep: false
    })
  })

  it('outside your hours a tile is simply awake or night for that city', () => {
    const cols = timeline()
    // Column 3 = IST 03:00 (asleep) / London 21:30 (awake), both outside 9–17.
    expect(classifyTile(cols[3], cols[3].cells[IST.iana], work)).toEqual({ phase: 'night', asleep: true })
    expect(classifyTile(cols[3], cols[3].cells[LONDON.iana], work)).toEqual({ phase: 'awake', asleep: false })
  })

  it('treats 22:00–05:59 local as night, 06:00–21:59 as awake', () => {
    const cols = timeline()
    const nightHours = cols
      .filter((c) => isAsleepAt(c, IST))
      .map((c) => c.homeHour)
    expect(nightHours).toEqual([0, 1, 2, 3, 4, 5, 22, 23])
  })
})

describe('isWorkInstant', () => {
  const home = 'Asia/Kolkata'
  it('is true across the whole inclusive window on a weekday', () => {
    // 2024-01-15 is a Monday.
    expect(isWorkInstant(DateTime.fromISO('2024-01-15T09:00:00', { zone: home }), home, work)).toBe(true)
    expect(isWorkInstant(DateTime.fromISO('2024-01-15T17:59:00', { zone: home }), home, work)).toBe(true)
    expect(isWorkInstant(DateTime.fromISO('2024-01-15T18:00:00', { zone: home }), home, work)).toBe(false)
    expect(isWorkInstant(DateTime.fromISO('2024-01-15T08:59:00', { zone: home }), home, work)).toBe(false)
  })

  it('reads the instant in the home zone whatever zone it carries', () => {
    // 04:30 UTC is 10:00 in IST.
    expect(isWorkInstant(DateTime.fromISO('2024-01-15T04:30:00Z'), home, work)).toBe(true)
  })

  it('is false on weekends', () => {
    expect(isWorkInstant(DateTime.fromISO('2024-01-20T11:00:00', { zone: home }), home, work)).toBe(false)
  })
})

describe('summarizePlanner', () => {
  it('finds when you are working AND nobody is asleep', () => {
    const summary = summarizePlanner(timeline(), [IST, LONDON], work)
    // Both awake in columns 12–21; you work 9–17 → the overlap is 12–17.
    expect(summary.sharedWindows).toEqual([{ start: 12, end: 17 }])
    expect(summary.best).toEqual({ homeHour: 12, mine: true, awake: 2, total: 2 })
  })

  it('reports the windows where everyone is awake, working or not', () => {
    const summary = summarizePlanner(timeline(), [IST, LONDON], work)
    expect(summary.awakeWindows).toEqual([{ start: 12, end: 21 }])
  })

  it('picks the best compromise when someone is always asleep during your hours', () => {
    // Working 9–11 IST means London is asleep (03:30–05:30) for all of it.
    const summary = summarizePlanner(timeline(), [IST, LONDON], { start: 9, end: 11 })
    expect(summary.sharedWindows).toEqual([])
    expect(summary.best).toEqual({ homeHour: 9, mine: true, awake: 1, total: 2 })
  })

  it('prefers a time inside your hours over a better time outside them', () => {
    const summary = summarizePlanner(timeline(), [IST, LONDON], { start: 9, end: 11 })
    // Column 12 has both awake, but it is outside 9–11; the in-hours column still wins.
    expect(summary.best?.mine).toBe(true)
    expect(summary.scores[12]).toEqual({ homeHour: 12, mine: false, awake: 2, total: 2 })
  })

  it('falls back to the best time outside your hours on a weekend', () => {
    const summary = summarizePlanner(timeline(SATURDAY), [IST, LONDON], work)
    expect(summary.sharedWindows).toEqual([])
    expect(summary.scores.every((s) => !s.mine)).toBe(true)
    expect(summary.best).toMatchObject({ mine: false, awake: 2 })
  })

  it('scores every column and copes with no locations', () => {
    expect(summarizePlanner(timeline(), [IST], work).scores).toHaveLength(24)
    const empty = summarizePlanner(timeline(), [], work)
    expect(empty.sharedWindows).toEqual([])
    expect(empty.awakeWindows).toEqual([])
  })

  it('counts each city, even when two share a timezone', () => {
    const miami: Location = { id: 'miami', label: 'Miami', iana: 'America/New_York' }
    const nyc: Location = { id: 'nyc', label: 'New York', iana: 'America/New_York' }
    const cols = buildDayTimeline(MONDAY, [IST.iana, miami.iana], IST.iana)
    const summary = summarizePlanner(cols, [IST, miami, nyc], work)
    expect(summary.scores.every((s) => s.total === 3)).toBe(true)
    // IST counts once; the two New York rows share a clock, so they are awake together and count twice.
    cols.forEach((col, h) => {
      const expected = (isAsleepAt(col, IST) ? 0 : 1) + (isAsleepAt(col, miami) ? 0 : 2)
      expect(summary.scores[h].awake).toBe(expected)
    })
    // IST and New York are ~10.5h apart, so someone is always awake: 0 never occurs.
    expect(new Set(summary.scores.map((s) => s.awake))).toEqual(new Set([1, 2, 3]))
  })

  it('exposes per-city phase for a column', () => {
    const cols = timeline()
    expect(phaseAt(cols[16], IST, work)).toBe('work')
    expect(phaseAt(cols[3], LONDON, work)).toBe('awake') // 21:30 London, outside your hours
    expect(phaseAt(cols[5], LONDON, work)).toBe('night') // 23:30 London
  })
})

describe('range helpers', () => {
  it('normalizes order and clamps to 0–23', () => {
    expect(normalizeRange(9, 4)).toEqual({ start: 4, end: 9 })
    expect(normalizeRange(-3, 40)).toEqual({ start: 0, end: 23 })
  })

  it('tests membership inclusively', () => {
    const r = { start: 3, end: 5 }
    expect(rangeContains(r, 3)).toBe(true)
    expect(rangeContains(r, 5)).toBe(true)
    expect(rangeContains(r, 6)).toBe(false)
    expect(rangeContains(null, 3)).toBe(false)
  })
})

describe('summarizePlanner when the home zone skips an hour (daylight-saving gap)', () => {
  const skip = (hour: number) =>
    timeline().map((c) => (c.homeHour === hour ? { ...c, transition: 'skipped' as const } : c))

  it('never recommends the hour that does not exist, even if it would otherwise be best', () => {
    expect(summarizePlanner(timeline(), [IST, LONDON], work).best?.homeHour).toBe(12)
    const summary = summarizePlanner(skip(12), [IST, LONDON], work)
    expect(summary.best?.homeHour).toBe(13)
    expect(summary.scores[12]).toEqual({ homeHour: 12, mine: false, awake: 0, total: 2, skipped: true })
  })

  it('breaks a run of good hours at the missing hour', () => {
    const summary = summarizePlanner(skip(15), [IST, LONDON], work)
    expect(summary.sharedWindows).toEqual([
      { start: 12, end: 14 },
      { start: 16, end: 17 }
    ])
    expect(summary.awakeWindows).toEqual([
      { start: 12, end: 14 },
      { start: 16, end: 21 }
    ])
  })

  it('has no best hour when every hour is skipped, instead of picking one', () => {
    const all = timeline().map((c) => ({ ...c, transition: 'skipped' as const }))
    const summary = summarizePlanner(all, [IST, LONDON], work)
    expect(summary.best).toBeNull()
    expect(summary.sharedWindows).toEqual([])
  })
})
