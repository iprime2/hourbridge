---
name: time-correctness
description: Rules, an awkward-zone checklist and test recipes for World Time Buddy's time logic in src/core (timeEngine, dst, planner, useNow). Use when adding or changing anything that converts, formats, compares or ticks time — timezones, DST, half-hour zones, working hours, day/night, the live clock — or when writing tests for it.
---

# Time correctness

Time math is the product. It lives only in `src/core` and is pure: `timeEngine.ts` (conversion, day timeline, working hours), `dst.ts` (next transition), `planner.ts` (best meeting time), `useNow.ts` (clock tick). Components never compute offsets.

## Rules the engine already follows — keep them

- Start from an absolute `DateTime` instant and go through `setZone`. Never add hours to wall-clock numbers or subtract two `.hour` values. An offset is `instant.setZone(zone).offset` in minutes, divided by 60, so +5:45 is `5.75` — never rounded.
- Wall time → instant happens in one place, `resolveWallTime` (`instantFromHomeDateTime` wraps it), which throws on invalid input (`assertValid`). Don't call luxon's `DateTime.fromObject` for a wall time that must be stable in a DST zone: for a time that repeats on fall-back it picks a copy using the zone's offset *today*. `getDstInfo` instead degrades to `{ inDst: false, nextChange: null }` for an unknown zone. Pick the behaviour on purpose.
- Working hours are whole hours 0–23 in the *home* zone, **both ends inclusive**, on the days you work, and the weekday is judged in the home zone, not in each city. The days are `WorkHours.days` (ISO 1–7; absent means Monday–Friday), read only through `isWorkDay`; `workDays.ts` has the toggle, sanitizer and summary. Night is local hours 0–5 and 22–23 (`classifyDayNight`).
- Key UI by location `id`, compute by IANA zone: two cities can share a zone. Legacy names (`Asia/Calcutta`, `Asia/Katmandu`, `Europe/Kiev`) are valid to luxon; don't reject them.
- The clock ticks on the wall-clock boundary: `useNow` waits `msUntilNextTick` (+5 ms), never a fixed `setInterval`.

## Awkward cases (checked with luxon 3.7 on Node 22)

| Case | What actually happens |
| --- | --- |
| Half / quarter-hour zones | Kolkata +5:30, Kathmandu +5:45, St. John's −3:30 (winter) / −2:30 (summer) |
| 30-minute DST | Lord Howe goes forward 30 min on 2025-10-05 and back 30 min on 2026-04-05; `describeDstChange` prints `30m` |
| Wall time inside a spring-forward gap | New York 2025-03-09 02:30 becomes 03:30 EDT (07:30 UTC) |
| Wall time repeated on fall-back | New York 2025-11-02 01:30 is EDT (05:30 UTC) or EST (06:30 UTC). Plain luxon picks one using the zone's offset **today**, so the answer flips with the season (Sydney flips the other way); `resolveWallTime` always takes the first |
| 23- and 25-hour days | New York 2025-03-09 is 23 h and 2025-11-02 is 25 h; Lord Howe 2025-10-05 is 23.5 h |
| Skipped calendar day | `Pacific/Apia` has no 2011-12-30. luxon returns a *valid* 2011-12-31, so `isValid` does not prove you got the date you asked for |
| Elapsed vs calendar | `plus({ hours: 24 })` and `plus({ days: 1 })` differ across DST (13:00 vs 12:00 on 2025-03-09 in New York) |
| No DST | `Asia/Kolkata`, `Asia/Tokyo`: `nextChange` is `null` |

## Home zones that change their clocks

The home zone is user-configurable, and `buildDayTimeline` always returns 24 columns indexed by home hour: the grids (`homeHour` as key and `columns[h]`), the selection, the NOW marker and the planner all rely on that, so never make it 23 or 25. On a transition day the affected column carries `transition`:

- **`'skipped'`** — the hour does not exist (New York 02:00 on 2025-03-09, London 01:00 on 2025-03-30, Havana 00:00, every hour of Samoa's missing 2011-12-30). Its `instant` only repeats the next hour, so the column is an empty slot: the grids draw a dash and make it unselectable, and `summarizePlanner` never counts it (not best, and it breaks a run of good hours).
- **`'repeated'`** — the hour happens twice (New York 01:00 on 2025-11-02). The column shows the first occurrence, never the second, and its tiles say so in their accessible label.

Any new UI that reads columns must handle `transition === 'skipped'` before it shows or selects one. Limit: only whole-hour starts are checked, so Lord Howe's 30-minute gap marks the whole 02:00 hour skipped although 02:30–03:00 exists, and its 30-minute repeat is not flagged.

## Writing tests

- Pin instants with `DateTime.fromISO('2025-03-09T07:30:00Z')`. Never assert against `DateTime.now()`, and never depend on the machine's `TZ`.
- Assert exact UTC strings for transitions (`.toUTC().toISO()`), as `dst.test.ts` does.
- Use past dates or rules already published; tzdata for far-future dates can change.
- Every new time feature gets: a half-hour zone, a DST zone in each hemisphere, a no-DST zone, a date that crosses midnight, and a DST transition day.
- Ticking code uses fake timers (see `useNow.test.ts`).
- Tests are Vitest in `src/core/*.test.ts` and import through the `@core/*` alias.

## Before you finish

`npm test && npm run lint`. If you touched `src/core`, also run `npm run build:web` and `npm run build:mobile`, since both UIs import it.
