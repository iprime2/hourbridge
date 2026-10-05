import { describe, expect, it, vi } from 'vitest'
import { DateTime } from 'luxon'
import type { CalendarDay, HolidayLookup } from '@core/holidays'
import { holidaysDuring, summarizePlanner } from '@core/planner'
import { buildDayTimeline, classifyTile, isWorkColumn, isWorkInstant } from '@core/timeEngine'
import { buildTimelineForLocations } from '@core/formatters'
import { buildWidgetRows } from '@core/widgetRows'
import type { WorkHours } from '@core/timeEngine'
import type { Location } from '@core/timezones'

// A made-up calendar, so none of this depends on the bundled data or on today's date:
//   Culture Day in Tokyo on 3 Nov 2026, Republic Day in India on 26 Jan 2026, nothing elsewhere.
const calendar: Record<string, Record<string, string[]>> = {
  'Asia/Tokyo': { '2026-11-3': ['Culture Day'] },
  'Asia/Kolkata': { '2026-1-26': ['Republic Day'] }
}
const holidays: HolidayLookup = (zone, day: CalendarDay) =>
  calendar[zone]?.[`${day.year}-${day.month}-${day.day}`] ?? []

const IST: Location = { id: 'ist', label: 'IST', iana: 'Asia/Kolkata', isHome: true }
const LONDON: Location = { id: 'london', label: 'London', iana: 'Europe/London' }
const TOKYO: Location = { id: 'tokyo', label: 'Tokyo', iana: 'Asia/Tokyo' }
const zones = (locations: Location[]) => locations.map((l) => l.iana)

const CULTURE_DAY = { year: 2026, month: 11, day: 3 } // a Tuesday
const REPUBLIC_DAY = { year: 2026, month: 1, day: 26 } // a Monday
const ORDINARY = { year: 2026, month: 11, day: 10 }
const work = { start: 9, end: 17 }

describe('holidays on the timeline', () => {
  it('adds nothing at all when no lookup is given, or when no day is a holiday', () => {
    const plain = buildDayTimeline(CULTURE_DAY, zones([IST, TOKYO]), IST.iana)
    const none = buildDayTimeline(CULTURE_DAY, zones([IST, TOKYO]), IST.iana, () => [])
    expect(JSON.stringify(none)).toBe(JSON.stringify(plain))
    for (const column of plain) {
      expect(column).not.toHaveProperty('homeHolidays')
      for (const cell of Object.values(column.cells)) expect(cell).not.toHaveProperty('holidays')
    }
  })

  it("follows each city's own calendar date, not the home date", () => {
    // Home is IST. Tokyo is 3½ hours ahead, so Tokyo's 3 Nov runs from 20:30 IST on 2 Nov to 20:30 IST on 3 Nov.
    const on3rd = buildDayTimeline(CULTURE_DAY, zones([IST, TOKYO]), IST.iana, holidays)
    expect(on3rd[0].cells['Asia/Tokyo']).toMatchObject({ day: 3, hour: 3, minute: 30, holidays: ['Culture Day'] })
    expect(on3rd[20].cells['Asia/Tokyo']).toMatchObject({ day: 3, hour: 23, minute: 30, holidays: ['Culture Day'] })
    expect(on3rd[21].cells['Asia/Tokyo']).toMatchObject({ day: 4, hour: 0, minute: 30 })
    expect(on3rd[21].cells['Asia/Tokyo']).not.toHaveProperty('holidays') // already the 4th in Tokyo
    // The evening before in India is already Culture Day in Tokyo.
    const on2nd = buildDayTimeline({ year: 2026, month: 11, day: 2 }, zones([IST, TOKYO]), IST.iana, holidays)
    expect(on2nd[21].cells['Asia/Tokyo']).toMatchObject({ day: 3, holidays: ['Culture Day'] })
    expect(on2nd[20].cells['Asia/Tokyo']).not.toHaveProperty('holidays')
  })

  it('leaves the other cities of the same hour alone', () => {
    const [column] = buildDayTimeline(CULTURE_DAY, zones([IST, TOKYO, LONDON]), IST.iana, holidays)
    expect(column.cells['Asia/Kolkata']).not.toHaveProperty('holidays')
    expect(column.cells['Europe/London']).not.toHaveProperty('holidays')
  })

  it('marks every column of the day when the home country has the holiday', () => {
    const columns = buildDayTimeline(REPUBLIC_DAY, zones([IST, LONDON]), IST.iana, holidays)
    expect(columns).toHaveLength(24)
    for (const column of columns) expect(column.homeHolidays).toEqual(['Republic Day'])
    expect(buildDayTimeline(ORDINARY, zones([IST]), IST.iana, holidays)[9]).not.toHaveProperty('homeHolidays')
  })

  it('looks each city and date up once, not once per column', () => {
    const lookup = vi.fn<HolidayLookup>(() => [])
    buildDayTimeline(ORDINARY, zones([IST, LONDON, TOKYO]), IST.iana, lookup)
    // 3 cities × at most 2 distinct local dates in a day (+ home): far below the 24 × 3 cell visits.
    expect(lookup.mock.calls.length).toBeLessThanOrEqual(7)
  })

  it('is passed through by buildTimelineForLocations', () => {
    const columns = buildTimelineForLocations(CULTURE_DAY, [IST, TOKYO], IST.iana, holidays)
    expect(columns[0].cells['Asia/Tokyo'].holidays).toEqual(['Culture Day'])
    expect(buildTimelineForLocations(CULTURE_DAY, [IST, TOKYO], IST.iana)[0].cells['Asia/Tokyo']).not.toHaveProperty('holidays')
  })

  it('does not look anything up for a repeated or skipped hour differently from the others', () => {
    // 2026-03-08: America/New_York skips 02:00. Home hour 2 is a gap column; it still builds, still 24 columns.
    const columns = buildDayTimeline({ year: 2026, month: 3, day: 8 }, ['America/New_York'], 'America/New_York', () => ['X'])
    expect(columns).toHaveLength(24)
    expect(columns[2].transition).toBe('skipped')
    expect(columns[2].homeHolidays).toEqual(['X'])
  })
})

describe('a public holiday at home is a day off', () => {
  const columns = (day = REPUBLIC_DAY) => buildDayTimeline(day, zones([IST, LONDON]), IST.iana, holidays)

  it('turns the working hours off for the day, by default', () => {
    for (const hour of [9, 12, 17]) expect(isWorkColumn(columns()[hour], work)).toBe(false)
    expect(isWorkColumn(columns(ORDINARY)[12], work)).toBe(true)
  })

  it('keeps them on for someone who works through holidays', () => {
    expect(isWorkColumn(columns()[12], { ...work, holidaysOff: false })).toBe(true)
    expect(isWorkColumn(columns()[12], { ...work, holidaysOff: true })).toBe(false)
  })

  it('shows through to the tile, so it is not green', () => {
    const column = columns()[12]
    expect(classifyTile(column, column.cells['Asia/Kolkata'], work)).toEqual({ phase: 'awake', asleep: false })
    expect(classifyTile(column, column.cells['Asia/Kolkata'], { ...work, holidaysOff: false }).phase).toBe('work')
  })

  it("does not care about a holiday in somebody else's country", () => {
    const tokyoDay = buildDayTimeline(CULTURE_DAY, zones([IST, TOKYO]), IST.iana, holidays)
    expect(isWorkColumn(tokyoDay[12], work)).toBe(true) // Tuesday, a working day for the home user
  })

  it('also applies to a live instant (the widget)', () => {
    const noon = (iso: string) => DateTime.fromISO(iso, { zone: 'Asia/Kolkata' })
    expect(isWorkInstant(noon('2026-01-26T12:00'), IST.iana, work)).toBe(true) // without a calendar
    expect(isWorkInstant(noon('2026-01-26T12:00'), IST.iana, work, holidays)).toBe(false)
    expect(isWorkInstant(noon('2026-01-26T12:00'), IST.iana, { ...work, holidaysOff: false }, holidays)).toBe(true)
    expect(isWorkInstant(noon('2026-01-27T12:00'), IST.iana, work, holidays)).toBe(true)
  })
})

describe('the planner and holidays', () => {
  const two = [IST, TOKYO]
  const summary = (day: typeof CULTURE_DAY, people = two, w: WorkHours = work) =>
    summarizePlanner(buildDayTimeline(day, zones(people), IST.iana, holidays), people, w)

  it('adds no field to a day without a holiday', () => {
    for (const score of summary(ORDINARY).scores) expect(score).not.toHaveProperty('holiday')
  })

  it('counts a city that is awake on its holiday, and says it is not available', () => {
    const s = summary(CULTURE_DAY)
    // 11:00 IST is 14:30 on 3 Nov in Tokyo: awake and on holiday.
    expect(s.scores[11]).toMatchObject({ mine: true, awake: 2, total: 2, holiday: 1 })
  })

  it("does not count a city's holiday while it is asleep (it is already not available)", () => {
    const s = summary(CULTURE_DAY)
    // 19:00 IST is 22:30 on 3 Nov in Tokyo: asleep, so awake is 1 and no holiday is counted on top.
    expect(s.scores[19]).toMatchObject({ awake: 1, total: 2 })
    expect(s.scores[19]).not.toHaveProperty('holiday')
  })

  it('takes the holiday hours out of the best times, and keeps the rest', () => {
    const ordinary = summary(ORDINARY)
    expect(ordinary.sharedWindows.length).toBeGreaterThan(0)
    const onHoliday = summary(CULTURE_DAY)
    // The IST working day 9–17 is inside Tokyo's holiday until 20:30 IST: nothing is shared.
    expect(onHoliday.sharedWindows).toEqual([])
    expect(onHoliday.awakeWindows.every((r) => r.start >= 21 || r.end < 20)).toBe(true)
  })

  it('prefers an hour where nobody is on holiday when it has to compromise', () => {
    // On 3 Nov, 21:00 IST onwards is 4 Nov in Tokyo (no longer a holiday) but past IST's working day.
    const s = summary(CULTURE_DAY)
    expect(s.best?.mine).toBe(true) // still inside your own hours first…
    expect(s.best && s.best.awake - (s.best.holiday ?? 0)).toBeGreaterThanOrEqual(1)
  })

  it('treats a home holiday as no working hours at all (nothing is "mine")', () => {
    const s = summary(REPUBLIC_DAY, [IST, LONDON])
    expect(s.scores.some((score) => score.mine)).toBe(false)
    expect(s.sharedWindows).toEqual([])
    expect(s.scores[14]).toMatchObject({ awake: 2, holiday: 1 }) // you are off: awake, but not available
  })

  it('keeps your own city in the picture when you work through holidays', () => {
    const s = summary(REPUBLIC_DAY, [IST, LONDON], { ...work, holidaysOff: false })
    expect(s.scores[14]).toMatchObject({ mine: true, awake: 2 })
    expect(s.scores[14]).not.toHaveProperty('holiday')
    expect(s.sharedWindows).toEqual([{ start: 12, end: 17 }]) // London is awake from 12:00 IST
  })

  it('still counts a colleague in your own country as off when you work through holidays', () => {
    const delhi: Location = { id: 'delhi', label: 'Delhi', iana: 'Asia/Kolkata' } // two rows, one zone
    const s = summary(REPUBLIC_DAY, [IST, delhi], { ...work, holidaysOff: false })
    expect(s.scores[14]).toMatchObject({ mine: true, awake: 2, holiday: 1 }) // Delhi, not you
    expect(s.sharedWindows).toEqual([])
  })

  it('does not change a single result when no holidays are known', () => {
    const withLookup = summarizePlanner(buildDayTimeline(ORDINARY, zones(two), IST.iana, () => []), two, work)
    const without = summarizePlanner(buildDayTimeline(ORDINARY, zones(two), IST.iana), two, work)
    expect(withLookup).toEqual(without)
  })
})

describe('the widget and holidays', () => {
  const now = DateTime.fromISO('2026-11-03T11:00:00', { zone: 'Asia/Kolkata' }) // 14:30 in Tokyo, a Tuesday

  it('names the holiday of a city that has one today, and only of that city', () => {
    const rows = buildWidgetRows([IST, TOKYO, LONDON], '24h', now, work, holidays)
    expect(rows.find((r) => r.id === 'tokyo')?.holiday).toBe('Culture Day')
    expect(rows.find((r) => r.id === 'ist')).not.toHaveProperty('holiday')
    expect(rows.find((r) => r.id === 'london')).not.toHaveProperty('holiday')
  })

  it('is unchanged without a calendar', () => {
    for (const row of buildWidgetRows([IST, TOKYO], '24h', now, work)) expect(row).not.toHaveProperty('holiday')
  })

  it('shows a home holiday as outside your working hours', () => {
    const holiday = DateTime.fromISO('2026-01-26T14:00:00', { zone: 'Asia/Kolkata' }) // 08:30 in London
    expect(buildWidgetRows([IST, LONDON], '24h', holiday, work, holidays)[1].phase).toBe('awake')
    expect(buildWidgetRows([IST, LONDON], '24h', holiday, work)[1].phase).toBe('work')
  })
})

describe('holidaysDuring', () => {
  const people = [IST, TOKYO, LONDON]
  const columns = buildDayTimeline(CULTURE_DAY, zones(people), IST.iana, holidays)

  it('lists the cities on holiday somewhere in the day, with the holiday', () => {
    expect(holidaysDuring(columns, people, null)).toEqual([{ location: TOKYO, names: ['Culture Day'] }])
  })

  it("narrows to the hours asked about, by each city's own date", () => {
    expect(holidaysDuring(columns, people, { start: 9, end: 17 })).toHaveLength(1)
    // From 21:00 IST Tokyo is on the 4th.
    expect(holidaysDuring(columns, people, { start: 21, end: 23 })).toEqual([])
  })

  it('names a holiday once however many hours it spans, and keeps several in order', () => {
    const two: HolidayLookup = (zone) => (zone === 'Asia/Tokyo' ? ['A', 'B'] : [])
    const both = buildDayTimeline(CULTURE_DAY, zones(people), IST.iana, two)
    expect(holidaysDuring(both, people, null)).toEqual([{ location: TOKYO, names: ['A', 'B'] }])
  })

  it('is empty without holidays, and for no cities', () => {
    expect(holidaysDuring(buildDayTimeline(ORDINARY, zones(people), IST.iana, holidays), people, null)).toEqual([])
    expect(holidaysDuring(columns, [], null)).toEqual([])
  })

  it('reports your own city too, so the planner can say it is a day off', () => {
    const home = buildDayTimeline(REPUBLIC_DAY, zones(people), IST.iana, holidays)
    expect(holidaysDuring(home, people, { start: 9, end: 10 })).toEqual([{ location: IST, names: ['Republic Day'] }])
  })
})
