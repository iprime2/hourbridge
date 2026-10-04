# World Time Buddy

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
- Platform features sit behind adapters (`window.wtb?.`, `src/mobile/native.ts`) and must degrade to no-ops in a browser and in tests.

## Product rules that are easy to break

- **Working hours** are one window in the *home* timezone, whole hours 0–23, **end hour inclusive** (1 PM–9 PM covers the 1 PM … 9 PM tiles), shown in every city's local time, on the days you work (`workHours.days`: ISO weekdays judged in the home zone; absent means Monday–Friday and is stored only when it differs, so never write a default `days`). `workHours.holidaysOff` is the same kind of optional field: absent means a public holiday at home is a day off, and it is stored only as `false`. Stored state is versioned (`PERSIST_VERSION`, now 5); change its shape only with a migration.
- **Public holidays** come only from the generated files in `src/core/holidayData/` (`npm run generate:holidays`, never edit by hand), loaded per country by dynamic `import()` through `src/core/holidays.ts`; the app never imports `date-holidays`. A city's country comes from its IANA zone (tz `zone.tab`), and a holiday belongs to the city's *own* calendar date at that instant. Coverage is tri-state (`full`, `partial` — India has only fixed-date holidays — `none`, `unknown`) and Settings must say so; never show "no holiday" where the data is missing without that note. A holiday in another city makes it unavailable in the planner; one at home is a day off unless `holidaysOff` is `false`. The shared test setup turns holidays off (`setHolidayLoader(null)`), so a test that needs them installs a loader or calls `setHolidayLoader()`. The data is CC BY 3.0: keep the credit in the README.
- The desktop and touch stylesheets are both loaded on the web. Page-level touch rules are scoped to `html.is-mobile-ui`; keep new global selectors scoped to their layout.
- The web build uses relative URLs (works under a sub-path) and a strict CSP in `vercel.json` and `src/web/index.html`. Don't loosen the CSP or add third-party scripts, fonts or requests without asking.
- Don't claim the iOS app or macOS/Windows packages build or run unless CI did it — they can't be built on Linux. CI jobs `ios_build`, `mac_package`, `win_package` cover them.

## Git, PRs and releases

- **Never merge a PR unless the user explicitly says to.** Merging to `main` triggers an automatic version bump and GitHub release. `bump:minor` / `bump:major` in the merge message changes the bump; the default is a patch.
- Commit as `Sushil Gupta <kalwarsushil2@gmail.com>`, set per command: `git -c user.name="Sushil Gupta" -c user.email="kalwarsushil2@gmail.com" commit …`. Never change git config.
- Commit messages end with the `Co-Authored-By:` trailer for the model in use; PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Conventional-style subjects (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`), small logical commits, tests with every behaviour change. Watch CI after pushing: `gh pr checks <n> --watch`.
- No force-push. Don't delete branches unless asked. Never commit secrets, certificates, `.env` files or provisioning profiles.
- Ask before outward-facing or hard-to-reverse actions: making the repo public, publishing or deploying, changing repository or organisation settings, creating releases or tags.

## Project direction

The owner does not want to pay for Apple Developer, Microsoft Store or code-signing programs. Distribution is the free web app (Vercel Hobby, personal non-commercial use); native builds stay unsigned. Issue #7 (macOS Gatekeeper blocks unsigned builds) needs a paid Apple account for a real fix — don't propose paid-account work as the default. The final app name is undecided: worldtimebuddy.com is an existing product, so don't register domains or publish under a public name without asking.

## Test gotchas

- jsdom has no `DragEvent` (build one with `createEvent` and set `clientY` via `Object.defineProperty`) and no `Blob.stream`.
- In Vitest, type the parameters of `vi.fn(async (a: X) => …)` or it infers zero arguments.
- In user-event, `[[` types a literal `[`.
- `vitest.setup.ts` clears `localStorage['wtb:state']` between tests (guarded for node-environment tests).
