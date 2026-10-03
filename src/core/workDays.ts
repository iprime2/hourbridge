import { DEFAULT_WORK_DAYS } from './timeEngine'

export interface Weekday {
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  iso: number
  short: string
  long: string
}

export const WEEKDAYS: readonly Weekday[] = [
  { iso: 1, short: 'Mon', long: 'Monday' },
  { iso: 2, short: 'Tue', long: 'Tuesday' },
  { iso: 3, short: 'Wed', long: 'Wednesday' },
  { iso: 4, short: 'Thu', long: 'Thursday' },
  { iso: 5, short: 'Fri', long: 'Friday' },
  { iso: 6, short: 'Sat', long: 'Saturday' },
  { iso: 7, short: 'Sun', long: 'Sunday' }
]

/** Working days as ISO weekdays, de-duplicated and sorted; null unless a non-empty list of 1–7. */
export function sanitizeWorkDays(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null
  if (!raw.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) return null
  const days = [...new Set(raw as number[])].sort((a, b) => a - b)
  return days.length > 0 ? days : null
}

export function sameDays(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((d, i) => d === b[i])
}

/**
 * The working days after flipping one weekday. At least one day always stays on, so asking to
 * turn off the last remaining day returns the days unchanged.
 */
export function toggleWorkDay(days: readonly number[] | undefined, weekday: number): number[] {
  const current = sanitizeWorkDays(days) ?? [...DEFAULT_WORK_DAYS]
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return current
  if (!current.includes(weekday)) return [...current, weekday].sort((a, b) => a - b)
  if (current.length === 1) return current
  return current.filter((d) => d !== weekday)
}

/**
 * The week in a few words: "Mon–Fri", "Sat–Wed" (a run may wrap past Sunday), "Mon, Wed, Fri",
 * "Every day". Runs of three or more days are shown as a range.
 */
export function describeWorkDays(days: readonly number[] | undefined): string {
  const set = new Set(sanitizeWorkDays(days) ?? DEFAULT_WORK_DAYS)
  if (set.size === 7) return 'Every day'
  const name = (iso: number): string => WEEKDAYS[iso - 1].short
  const before = (iso: number): number => (iso === 1 ? 7 : iso - 1)
  const after = (iso: number): number => (iso === 7 ? 1 : iso + 1)

  const runs: number[][] = []
  for (const day of [...set].sort((a, b) => a - b)) {
    if (set.has(before(day))) continue // inside a run, not where one starts
    const run = [day]
    for (let next = after(day); set.has(next); next = after(next)) run.push(next)
    runs.push(run)
  }
  return runs
    .map((run) => (run.length >= 3 ? `${name(run[0])}–${name(run[run.length - 1])}` : run.map(name).join(', ')))
    .join(', ')
}
