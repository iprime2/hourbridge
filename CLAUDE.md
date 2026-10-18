# Hourbridge

A timezone planner: one TypeScript codebase shipped as a **web app / PWA** (the main way to distribute), **Electron** desktop apps (macOS, Windows) and an **iOS** app (Capacitor). Architecture, per-platform rules and the definition of done are in [`.claude/skills/lead-engineer/SKILL.md`](.claude/skills/lead-engineer/SKILL.md) — read it before changing structure, time logic or UI. The README covers setup, packaging, CI and hosting.

## Commands

```bash
npm ci                      # add ELECTRON_SKIP_BINARY_DOWNLOAD=1 where you don't need to run Electron (CI, cloud, Vercel)
npm test                    # Vitest (jsdom); includes scripts/ and the service-worker tests
npm run lint                # typecheck (web + node projects)
npm run build               # Electron bundles → out/
npm run build:mobile        # iOS web layer → dist-mobile/
npm run build:web           # website → dist-web/ (also stamps the service worker)
npm run preflight:web       # check dist-web/ in real Chromium with vercel.json's headers — see the web-preflight skill
npm run generate:holidays   # regenerate src/core/holidayData/ (only when the data or its year range must change)
npm run dev:web             # web app on :5175 (desktop grid ≥ 900 px wide with a mouse, touch UI otherwise)
```

Before pushing: `npm test && npm run lint && npm run build && npm run build:mobile && npm run build:web`.

## Code map

- `src/core` platform-free logic (Luxon time math, planner, DST, public holidays, persistence, share/ICS). **All time math lives here**; it never imports from `renderer`, `mobile` or `web`.
- `src/ui` shared components + design tokens. `src/renderer` Electron UI. `src/mobile` touch UI + Capacitor adapter. `src/web` PWA shell (layout switch, install prompt, service worker, manifest). `src/main`, `src/preload` Electron only.
- Platform features sit behind adapters (`window.hb?.`, `src/mobile/native.ts`) and must degrade to no-ops in a browser and in tests.

## Product rules that are easy to break

- **Working hours** are one window in the *home* timezone, whole hours 0–23, **end hour inclusive** (1 PM–9 PM covers the 1 PM … 9 PM tiles), shown in every city's local time, on the days you work (`workHours.days`: ISO weekdays judged in the home zone; absent means Monday–Friday and is stored only when it differs, so never write a default `days`). `workHours.holidaysOff` is the same kind of optional field: absent means a public holiday at home is a day off, and it is stored only as `false`. Stored state is versioned (`PERSIST_VERSION`, now 6); change its shape only with a migration.
- **People and boards** (`src/core/people.ts`, v6). A row may name a `person` and carry their own `hours`: whole hours 0–23, end inclusive, in *that row's* local time, on their own `days` judged in their zone (absent means Monday–Friday, stored only when it differs). Hours on the home row are kept but ignored (`ownHours`): yours are `workHours`. In the planner someone with own hours is available only inside them (and counts as awake there even at night); `HourScore.offHours` counts the rest. Saved boards: `locations` is always the board on screen, so older readers see it; `boards` / `activeBoard` are stored only when there is more than the one default board. Share links carry cities only, never people's names or hours.
- **Public holidays** come only from the generated files in `src/core/holidayData/` (`npm run generate:holidays`, never edit by hand), loaded per country by dynamic `import()` through `src/core/holidays.ts`; the app never imports `date-holidays`. A city's country comes from its IANA zone (tz `zone.tab`), and a holiday belongs to the city's *own* calendar date at that instant. Coverage is tri-state (`full`, `partial` — India has only fixed-date holidays — `none`, `unknown`) and Settings must say so; never show "no holiday" where the data is missing without that note. A holiday in another city makes it unavailable in the planner; one at home is a day off unless `holidaysOff` is `false`. The shared test setup turns holidays off (`setHolidayLoader(null)`), so a test that needs them installs a loader or calls `setHolidayLoader()`. The "Upcoming holidays" panel (`src/ui/UpcomingHolidays.tsx`, whole-country tables via `useCountryHolidays`) must always say why a list is empty, for the same reason. The data is CC BY 3.0: keep the credit in the README.
- **Settings files and share links are untrusted input.** An imported `.json` (`src/core/settingsFile.ts`) and a `#share=` link (`src/core/shareLink.ts`) must go through `parseSettingsFile` / `parseShareHash` and, for files, `parsePersistedState` — never straight into state, `localStorage` or the DOM. Imports are previewed and confirmed before they replace anything; a share link only ever adds or replaces *cities*, may propose one meeting (`m`: an absolute start, a length and a title, all checked by `parseShareHash`; a bad `m` makes the whole link invalid, and the receiver's planner places it with `placeMeeting`, which refuses anything that would not round-trip on their home day), and never changes the home city or settings. The link rides in the URL fragment so it is never sent to a server; keep it there. The calendar links (`src/core/calendarLinks.ts`) are plain anchors with `rel="noopener noreferrer"` and no API calls; they are hidden in the native iOS app. The staged plan for anything with a backend is `docs/roadmap.md` — don't start a stage past 0 without the owner's decisions listed there.
- The desktop and touch stylesheets are both loaded on the web. Page-level touch rules are scoped to `html.is-mobile-ui`; keep new global selectors scoped to their layout.
- The web build uses relative URLs (works under a sub-path) and a strict CSP in `vercel.json` and `src/web/index.html`. Don't loosen the CSP or add third-party scripts, fonts or requests without asking.
- Don't claim the iOS app or macOS/Windows packages build or run unless CI did it — they can't be built on Linux. CI jobs `ios_build`, `mac_package`, `win_package` cover them.

## Git, PRs and releases

- **Never merge a PR unless the user explicitly says to.** Releases are **paused** (the desktop apps are not in use): `.github/workflows/release.yml` only runs when started by hand, so merging to `main` does not bump the version, tag, package or publish; the web app is deployed from `main` by Vercel, not by that workflow. To resume, restore the push triggers noted at the top of the file; the `bump:minor` / `bump:major` merge-message rule in the README then applies again.
- Commit as `Sushil Gupta <kalwarsushil2@gmail.com>`, set per command: `git -c user.name="Sushil Gupta" -c user.email="kalwarsushil2@gmail.com" commit …`. Never change git config.
- Commit messages end with the `Co-Authored-By:` trailer for the model in use; PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Conventional-style subjects (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`), small logical commits, tests with every behaviour change. Watch CI after pushing: `gh pr checks <n> --watch`.
- No force-push. Don't delete branches unless asked. Never commit secrets, certificates, `.env` files or provisioning profiles.
- Ask before outward-facing or hard-to-reverse actions: making the repo public, publishing or deploying, changing repository or organisation settings, creating releases or tags.

## Project direction

The owner does not want to pay for Apple Developer, Microsoft Store or code-signing programs. Distribution is the free web app (Vercel Hobby, personal non-commercial use); native builds stay unsigned. Issue #7 (macOS Gatekeeper blocks unsigned builds) needs a paid Apple account for a real fix — don't propose paid-account work as the default. The app is named Hourbridge (the owner's choice). The name's availability as a domain, in the App Store / Microsoft Store and as a trademark has not been checked, and nothing is registered or published under it: don't register domains or publish under a public name (stores, a custom domain) without asking.

## Test gotchas

- jsdom has no `DragEvent` (build one with `createEvent` and set `clientY` via `Object.defineProperty`) and no `Blob.stream`.
- In Vitest, type the parameters of `vi.fn(async (a: X) => …)` or it infers zero arguments.
- In user-event, `[[` types a literal `[`.
- `vitest.setup.ts` clears `localStorage['hb:state']` between tests (guarded for node-environment tests).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
