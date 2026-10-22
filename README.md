# Hourbridge

**Hourbridge** is a timezone planner. Line up any number of cities, see at a glance who is awake, at work or on a public holiday, pick a meeting time, and share it.

Runs in **any modern browser** (installable, works offline) and as native apps on **macOS**, **Windows** and **iOS** — all from one TypeScript codebase. The web app is the easiest way to use it: nothing to download, nothing to sign, free to host (see [Web app](#web-app)).

| Platform | Shell | Package |
| --- | --- | --- |
| Web (any browser, phone or desktop) | Static site + service worker | Deploy `dist-web/` to any static host — [Vercel](#deploy-on-vercel-free) config included |
| macOS (Apple Silicon + Intel) | Electron | `.dmg`, `.zip` |
| Windows | Electron | NSIS installer, portable `.exe`, Store `.appx` (once Partner Center secrets are set) |
| iOS / iPadOS 15+ | Capacitor (WKWebView) | Xcode project in `ios/` → TestFlight / App Store |

> **One app per OS.** The desktop widget is a second window inside the same Electron app, not a separate download.

## Features

**Planning**

- Any number of cities in one 24-hour grid; hover, click, or **drag** across hours to select a meeting window.
- **Your working hours** are set once, in your home timezone (both ends included — 1 PM – 9 PM covers the 1 PM … 9 PM tiles) and shown in *every* city's local time, so the green columns line up down the grid. **Your working days** default to Monday–Friday; turn any day on or off in Settings (for example off Thursday and Friday, working Saturday and Sunday) and the green tiles, the planner and the widget follow. A small moon on a green tile means that city is asleep then; sand is awake-but-outside-your-hours, dark is night. A bar under green tiles means it isn't conveyed by colour alone.
- **Public holidays** for every city on screen, offline: a small pennant marks each tile that falls on a public holiday in that city's country (judged on the city's own calendar date, so the tile after midnight in Tokyo is not marked for the day before), the tooltip and screen-reader label name the holiday, and the planner lists them. A holiday in another city takes that city out of the "best times"; a holiday where *you* are is a day off by default (Settings → *Public holidays in … are days off*; turn it off if you work through them). Data covers 205 countries for 2025–2030 — see [Public-holiday data](#public-holiday-data) for what is and isn't in it. The app tells you in Settings when a country's data is partial or missing instead of silently showing no holidays. An **Upcoming holidays** panel at the bottom of both layouts lists the next three holiday dates (with how far away each is, on that country's own date) for every country on screen at once, starting from the day the grid shows; cities in the same country share a row, and when it has nothing to list it says why (no data for that country, a timezone with no country, a file that did not load, the end of the data).
- **Meeting planner**: shows each person's local time for the selection, whether it is inside your working hours and who would be asleep, the best times (you're working and nobody's asleep) or the best compromise when there are none, **meetings from 15 minutes**: click a tile for the hour (or drag across several), then shorten or lengthen with the stepper (15, 30, 45 minutes, 1 h, 1.5 h, 2 h, then hourly; Shift + ← → on the keyboard) and pick a start of :00, :15, :30 or :45, with each city's real start and end, the invite and the `.ics` following; and one-tap **Copy details** / **Add to calendar (.ics)** — or the native **Share sheet** on iOS. On the web and desktop, **Google Calendar** and **Outlook** links open each calendar's own "new event" page with the title, time and details filled in (nothing is sent to them until you click, and you sign in there as usual; the iOS app uses the Share sheet and `.ics` instead).
- **People and boards**: name the person on a row ("Tom" in London) and, if you like, give them their own working hours and days in their city's time. Their hours get a bar along the top of their tiles, and the planner only counts them as free inside those hours, so "best times" respects everyone's day, not just yours. Keep several **boards** (a team, a client, family), each with its own list of cities: make, rename and delete them in Settings, and switch with the board menu that appears once you have two. Exported settings files carry every board; share links carry only the cities.
- **Your own days off**: add days off to any row, as one day or a range with a name: a festival the holiday data lacks (India's data has only fixed-date holidays, so Diwali, Holi and Eid are yours to add), a company holiday, someone's leave. They use that city's own dates, get the holiday pennant on its tiles, count in the planner and the days-ahead search, and are listed in the Upcoming holidays panel. A day off on your home row takes your working hours away. Edit them in the row's person dialog on desktop, or in the city sheet on the phone.
- **Good times in the days ahead**: with nothing selected, the planner also lists the best times of the next 7 or 14 days after the one on screen (your working days and hours, holidays at home and in the other cities, and nothing that has already started), as chips; click one to open that day with the slot selected.
- **Share a meeting**: on the web, **Copy link** in the planner puts your cities *and* the planned meeting (its start as an absolute time, its length and title) in a share link. Whoever opens it sees the meeting in their own timezone and can *Open in planner*, which adds the cities they are missing and selects the meeting on their own calendar day, ready for the calendar buttons. When it would cross midnight or a clock change where they are, the planner can't show it as one block, so they are offered *Add to calendar* instead. Their home city and settings are never touched.
- Live **"Now" line**, half-hour and 45-minute zones handled correctly (IST ↔ US, Nepal), day-change labels on tiles.
- **DST awareness**: a `DST` badge while daylight time is in effect and a dashed `DST soon` badge when a clock change is within ~6 weeks (tooltip has the exact date).

**Cities**

- Full IANA database (~420 zones) with ranked search by city, country, abbreviation (`EST`, `PST`), or **UTC offset** (`+5:30`, `utc-8`), plus a "My location" shortcut.
- Rename, set any city as home (IST by default), sort west → east, and **reorder by dragging** a row's grip handle (a blue line shows where it will land) — or focus the handle and press ↑ / ↓; moves are announced to screen readers.

**Everywhere**

- Light / dark / system themes with checked WCAG-AA contrast; 12 / 24-hour clock; state persisted and versioned.
- **Take it with you**, without an account: *Settings → Your data* exports your cities and settings as a `.json` file and imports one back (the file is checked and previewed before it replaces anything), and **Copy share link** puts your cities in a link's `#fragment` — the part of a URL that is never sent to a server — so a teammate who opens it is offered *Add N new cities* or *Replace my cities* (their home city and settings are never touched); the planner's **Copy link** does the same with a meeting in it. Both are untrusted input and go through the same validation as stored state.
- **Web:** installable from the browser (Chrome/Edge/Android: *Install*; iPhone/iPad: *Share → Add to Home Screen*), works fully offline after the first visit, and picks the desktop grid or the touch layout to suit the screen.
- Desktop: `⌘K` / `Ctrl+K` to add a city, `T` today, `[` `]` change day, arrows / `Shift`+arrows to move / resize the selection.
- Compact always-on-top **desktop widget** with live times and work/night indicators.

**macOS specifics**

- Native menu (File / Edit / View / Window / Help) with shortcuts, hidden-inset title bar, keeps running after the window closes.
- **Menu-bar clock** showing your home time, with a dropdown of every city (toggle in *File → Show Time in Menu Bar*).
- Widget floats over full-screen apps and follows you across Spaces; optional *Launch at Login*; window position remembered.

## Roadmap

Where the app is going — accounts and sync, workspaces, calendar integration — and what has to be decided first is in [`docs/roadmap.md`](docs/roadmap.md). Nothing past the first stage exists yet; today the app has no backend.

## Repository layout

```
src/core/       Platform-free TypeScript: time engine, planner, DST, share/ICS, city search,
                persistence, state hook. Pure and unit-tested. Shared by every app.
src/ui/         Shared React components + design tokens (CityPicker, SettingsPanel, PlannerBar, tokens.css)
src/renderer/   Electron UI (main window + widget)
src/mobile/     iOS UI (touch-first) and the Capacitor adapter (native.ts)
src/web/        Web shell: picks the desktop or touch UI, install prompt, service worker, manifest
src/main/       Electron main process (windows, menu, menu-bar clock, IPC validation)
src/preload/    Electron preload: the only bridge between renderer and main
ios/            Capacitor-generated Xcode project (Swift Package Manager)
scripts/        Brand/icon generator (no dependencies), the service-worker build step and the public-holiday data generator
vercel.json     Hosting config for the web app (headers, CSP, build)
.claude/skills/ Engineering playbook for this repo (architecture rules, checklists)
```

Rules that keep this working: time math lives only in `src/core`; `src/core` never imports from `renderer`/`mobile`; platform features sit behind small adapters (`window.hb?.` on desktop, `src/mobile/native.ts` on iOS) and degrade to no-ops in a browser and in tests. See [`.claude/skills/lead-engineer/SKILL.md`](.claude/skills/lead-engineer/SKILL.md).

## Prerequisites

- Node.js **22+** (Capacitor 8's CLI requires it) and npm
- macOS with Xcode 26+ to build/run the iOS app locally (see [iOS](#ios)); everything else works on Linux/WSL/Windows/macOS

## Setup

```bash
git clone https://github.com/iprime2/hourbridge.git
cd hourbridge
npm install
```

## Development

```bash
npm run dev          # Electron + Vite with HMR
npm run dev:mobile   # the iOS UI in a browser at http://localhost:5174 (use device emulation)
npm run dev:web      # the web app at http://localhost:5175 (desktop grid ≥ 900 px wide, touch UI below)
npm test             # Vitest
npm run lint         # TypeScript typecheck (web + node projects)
```

`npm run dev` starts Vite and Electron together. On WSL without a GUI, use WSLg or `xvfb-run`; hardware acceleration is disabled on Linux to improve WSL compatibility.

### Desktop widget

Click **Widget** in the toolbar (or *View → Show Widget*, `⇧⌘W`). It shows live times for the same cities. **Pinned** toggles always-on-top, **Main** focuses the main window, **×** closes it.

## Build

```bash
npm run build          # desktop bundles → out/
npm run build:mobile   # iOS web layer → dist-mobile/
npm run build:web      # the website → dist-web/ (also stamps the service worker's cache list)
npm run preview:web    # serve dist-web/ at http://localhost:4175 to try the installed/offline behaviour
npm run preflight:web  # check dist-web/ in real Chromium with vercel.json's headers (needs Playwright, see below)
```

`preflight:web` serves the built site with the exact headers from `vercel.json`, then checks it at desktop and phone sizes: no CSP violations or console errors, the service worker activates, the manifest is installable, the right layout is chosen, the app reloads offline, and — with the clock fixed on a public holiday — a country's holiday file loads under the CSP, is kept by the service worker and still shows offline. It exits non-zero if anything fails. Options: `--shots <dir>` saves light/dark screenshots, `--clean` rehearses Vercel's own install and build from the last commit, `--serve-only` only serves. Playwright is not a project dependency; install it outside the repo with `npm i --no-save --prefix "${TMPDIR:-/tmp}/hb-playwright" playwright-core` (details in `.claude/skills/web-preflight/SKILL.md`).

### Public-holiday data

The app ships generated, per-country files in `src/core/holidayData/` (one small JSON file per country, plus `zones.json`, the timezone → country table, and `meta.json`). Each country's file is loaded by a dynamic `import()` the first time a city in that country is on screen, so the holiday library itself is never part of the app and nothing is fetched from a third party. On the web the files are emitted to `assets/holidays/` and are cached by the service worker when first used rather than at install (there are ~200 of them and a visitor needs a handful).

```bash
npm run generate:holidays                          # years 2025–2030, tz files from /usr/share/zoneinfo
npm run generate:holidays -- --from 2026 --to 2031 # move the window (do this before the last year runs out)
```

The generator (`scripts/generate-holidays.mjs`) reads rules from the `date-holidays` devDependency and the timezone → country mapping from the system tz database (`zone.tab`, `tzdata.zi`, `iso3166.tab`; set `TZDIR` to use another copy). Only public holidays, in English where the source has it. The output is deterministic and committed; builds, CI and Vercel never run the generator. Run it again when `date-holidays` or tzdata moves, and edit nothing in `holidayData/` by hand (`holidayData.test.ts` checks the files' shape, ranges and a few holidays everyone knows, so a bad regeneration fails before it ships).

Known gaps, shown in Settings rather than hidden:

- **India is partial.** Only the fixed-date national holidays (Republic Day, Independence Day, Gandhi Jayanti, …) are in the data. Festival holidays such as Holi, Diwali and Eid move every year and differ by state, and the source does not have them yet.
- **42 countries have no data** in the source (for example Nepal). They show no holidays, and Settings says so.
- UTC and `Etc/*` zones belong to no country and never show holidays.
- Outside the generated years nothing is shown.

## Packaging

electron-builder is configured in `electron-builder.cjs`. Artifacts land in `release/`. Every `dist*` script passes `--publish never`; CI publishes with `softprops/action-gh-release`.

```bash
npm run pack            # unpacked app for the current OS (fast check)
npm run dist            # installer for the current OS
npm run dist:win        # Windows NSIS + portable   (run on Windows / CI)
npm run dist:win:store  # Windows Store AppX        (run on Windows / CI)
npm run dist:mac        # macOS dmg + zip, x64 + arm64 (run on macOS / CI)
```

Package Windows targets on Windows and macOS targets on macOS. Only the Electron main/preload/renderer bundles and `luxon` ship inside the app; React and Capacitor are bundled at build time.

### Icons and brand assets

All raster assets come from one definition in `scripts/lib/brand.mjs`:

```bash
npm run generate:icons
```

Writes `build/icon.png`, `build/icon-mac.png` (inset for the macOS icon grid), the Windows Store tiles in `build/appx/`, the App Store icon (1024², **no alpha**, as Apple requires) and light/dark launch images in `ios/`. Keep the mark in sync with `src/ui/Logo.tsx`.

## Web app

The same planner as a website and installable app (PWA). There is one build, `dist-web/`, and one page:

- On a wide screen with a mouse or trackpad (`min-width: 900px` and `pointer: fine`) it shows the **desktop grid**; on phones and touch-first tablets it shows the **touch layout**. Resizing the window switches live and keeps your cities and settings.
- It is **offline-first**: a service worker caches the whole site on the first visit (the per-country public-holiday files are kept the first time a country is used, so a country you have never opened has no holidays offline). Each deploy gets its own cache (named by a hash of every file), the new version installs in the background and takes over the next time the app is opened — an open tab is never swapped mid-use — and the old cache is deleted.
- **Installable**: Chromium browsers offer an *Install* button (the app shows its own prompt, remembered for 30 days if dismissed); iOS Safari has no install API, so the app explains *Share → Add to Home Screen*.
- Nothing leaves the device: there is no backend, no analytics and no third-party requests. Your cities and settings live in the browser's local storage. (Opening a link you copied with *Copy share link* or *Copy link*, or one of the calendar buttons, is something you do — the app itself makes no request.)
- Browser differences: there is no desktop widget or menu-bar clock (they need Electron); **Share** uses the browser's share sheet when it has one (with the `.ics` attached where supported) and otherwise copies the details to the clipboard.

### Deploy on Vercel (free)

`vercel.json` already contains everything Vercel needs.

1. Sign in at [vercel.com](https://vercel.com) with GitHub → **Add New… → Project** → import `iprime2/hourbridge` (Vercel can read private repositories you grant it).
2. Keep **Root Directory** as `./`. When imported, Vercel's form showed Vite's placeholder defaults (`vite build`, `dist`, `yarn install`…) instead of the values in `vercel.json`, so enter them by hand: **Application Preset** *Other*, **Install Command** `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci`, **Build Command** `npm run build:web`, **Output Directory** `dist-web`. They match `vercel.json`. No environment variables are needed.
3. **Deploy.** Every push to `main` then redeploys production, and every pull request gets its own preview URL.

Things to know:

- **Free tier terms:** Vercel's Hobby plan is free but restricted to personal, non-commercial use. If the site earns money or is run for a business, use another host or the Pro plan.
- **Any static host works** (Netlify, Cloudflare Pages, GitHub Pages, S3…): run `npm run build:web` and serve `dist-web/`. The build uses relative URLs, so it also works under a sub-path such as `https://user.github.io/hourbridge/`. Copy the headers from `vercel.json` if the host lets you set them: a strict Content-Security-Policy (no third-party scripts, styles, fonts or connections), `nosniff`, no framing, no referrer, and `Cache-Control: no-cache` on `sw.js` so updates are noticed.
- **`ELECTRON_SKIP_BINARY_DOWNLOAD=1`** in the install command stops the build from downloading Electron's ~100 MB binary, which a website build never runs.
- **Name:** the app is called **Hourbridge**. The name is only used inside the code and the apps; no domain is registered and nothing is published under it yet, so check the domain, the App Store / Microsoft Store names and trademarks before you publish under a public name (the displayed name is in `src/web/public/manifest.webmanifest`, `src/web/index.html` and the app header).

## macOS signing & notarization

Builds are **unsigned by default** so CI needs no Apple secrets, and macOS Gatekeeper blocks freshly downloaded unsigned apps ([#7](https://github.com/iprime2/hourbridge/issues/7)). Signing and notarizing needs a paid Apple Developer Program membership; until then, use the [web app](#web-app) or follow *First launch on macOS* below. `electron-builder.cjs` switches on signing automatically when credentials are present:

| Env var / repo secret | Purpose |
| --- | --- |
| `MAC_CSC_LINK` → `CSC_LINK` | Developer ID Application certificate (`.p12`, base64 or path) |
| `MAC_CSC_KEY_PASSWORD` → `CSC_KEY_PASSWORD` | Certificate password |
| `APPLE_ID` | Apple ID used for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for that Apple ID |
| `APPLE_TEAM_ID` | Team ID — its presence also enables notarization |

With `CSC_LINK` set the app is signed with the hardened runtime and `build/entitlements.mac.plist` (only the JIT/executable-memory exceptions Electron's V8 needs). With `APPLE_TEAM_ID` too, it is notarized. Never commit certificates; `.gitignore` blocks `*.p12`, `*.cer`, `*.mobileprovision` and `AuthKey_*.p8`.

### First launch on macOS (unsigned builds)

Downloaded builds show *"Apple could not verify 'Hourbridge' is free of malware…"* with only **Done** / **Move to Bin**. That is Gatekeeper reacting to the missing signature, not a broken app. To open it once:

**macOS 15 Sequoia and later** (the Control-click → Open shortcut was removed):

1. Open the app, then click **Done** (not *Move to Bin*).
2. Go to **System Settings → Privacy & Security** and scroll to *Security*.
3. Next to *"Hourbridge" was blocked…*, click **Open Anyway**, authenticate, then **Open**.

Or, from Terminal (removes the download quarantine flag):

```bash
xattr -dr com.apple.quarantine "/Applications/Hourbridge.app"
```

**macOS 14 and earlier:** Control-click the app → **Open** → **Open**.

Not included yet: auto-update. It needs a signed build plus a publish target (`electron-updater`); the `zip` target is already produced for it.

## iOS

The iOS app is the same React code in a Capacitor WKWebView, with a touch-first UI (`src/mobile/`): a spreadsheet-style scrolling timeline with sticky headers, bottom sheets for adding cities / settings / per-city actions, 44 pt tap targets, safe-area handling, haptics on selection, the native share sheet (text + `.ics` attachment), and state mirrored into native Preferences so it survives WebView storage eviction.

```bash
npm run ios:sync    # build the web layer and copy it into ios/
npm run ios:open    # sync, then open in Xcode
```

**Requirements** (macOS only): Xcode 26+, an Apple Developer account for devices/TestFlight. `ios/` targets iOS 15+, uses Swift Package Manager (no CocoaPods), and resolves the plugins from `node_modules` — run `npm ci` first.

**Run it:** `npm run ios:open`, pick a simulator (or your device with a signing team), press ▶.

**Ship it:**

1. In Xcode → *App* target → *Signing & Capabilities*: choose your team and change the bundle id from the placeholder `com.hourbridge.app` (also update `appId` in `capacitor.config.ts`).
2. Bump *Version* / *Build* (`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`).
3. *Product → Archive → Distribute App → App Store Connect*, then submit the build from TestFlight.

`ITSAppUsesNonExemptEncryption` is already `false` in `Info.plist`, so uploads skip the export-compliance prompt (the app only uses OS-provided HTTPS, and makes no network calls).

**What CI verifies:** the `ios_build` job runs `xcodebuild` for the simulator on `macos-latest` with signing disabled. Building the native project is impossible on Linux/WSL, so the web layer, the state/time logic and the native-adapter boundary are unit-tested locally, and the compile is verified in CI.

## Microsoft Store

Microsoft Store packaging uses electron-builder's **AppX** target (`appx`). In electron-builder **26.15.3**, a dedicated MSIX target is not available in app-builder-lib — use AppX (the Store accepts AppX and re-signs on submission).

### Partner Center setup

1. Create a [Microsoft Partner Center](https://partner.microsoft.com/) developer account (individual registration is currently free — confirm current terms on Microsoft's site).
2. Reserve the app name **Hourbridge**.
3. Open the app's **Product identity** page and copy:
   - **Package/Identity/Name** → `WIN_STORE_IDENTITY_NAME` (e.g. `YourPublisher.Hourbridge`)
   - **Publisher** (`CN=...`) → `WIN_STORE_PUBLISHER`
   - **Publisher display name** → `WIN_STORE_PUBLISHER_DISPLAY_NAME`
4. Optionally set `WIN_STORE_APPLICATION_ID` and `WIN_STORE_DISPLAY_NAME`.

Identity defaults in `electron-builder.cjs` are placeholders (publisher `CN=ms`, identity `YourPublisher.Hourbridge`) that exist so the build can run anywhere. A package built with them is **unsigned and cannot be installed or submitted**, so the release workflow does not build one: it builds and attaches the `.appx` **only when these three repository secrets are set** — `WIN_STORE_IDENTITY_NAME`, `WIN_STORE_PUBLISHER` and `WIN_STORE_PUBLISHER_DISPLAY_NAME` (plus optionally `WIN_STORE_APPLICATION_ID` / `WIN_STORE_DISPLAY_NAME`). Without them the Windows job skips the step and says so in the run summary. Pull requests still build a placeholder package on Windows (`win_package`) and inspect it, so the config, tiles and SDK tooling keep working.

### Build the Store package (Windows only)

AppX packaging requires the Windows SDK / runner; it is not supported on Linux.

```bash
export WIN_STORE_IDENTITY_NAME="YourPublisher.Hourbridge"
export WIN_STORE_PUBLISHER="CN=Your Certificate Subject"
export WIN_STORE_PUBLISHER_DISPLAY_NAME="Your Publisher"
npm run dist:win:store
```

Output: `release/Hourbridge-<version>-win-store.appx`.

**Tiles:** `build/appx/` holds 30 images generated by `npm run generate:icons` — every display scale (100/125/150/200/400 %) of the four tiles, plus the taskbar target sizes (16–256 px, plated and unplated). Only qualified names (`*.scale-*`, `*.targetsize-*`) are kept: electron-builder indexes them with `makepri` into `resources.pri`, and a bare-named file would compete with its `scale-100` sibling. Don't hand-add unqualified tiles.

**Capability:** Electron apps need `runFullTrust`; electron-builder always adds it. Partner Center will ask you to justify this restricted capability when you submit (the app is a desktop app packaged for the Store, not a sandboxed UWP app).

### Signing note (GitHub vs Store)

| Channel | Package | Signing |
| --- | --- | --- |
| GitHub Releases (Windows) | NSIS `Setup.exe` + portable `.exe` | **Unsigned** unless you add an Authenticode certificate (`CSC_LINK` / `WIN_CSC_LINK`) |
| GitHub Releases (macOS) | `.dmg` + `.zip` | Unsigned unless the macOS secrets above are set |
| Microsoft Store | AppX | Store re-signs after submission |

## CI / CD

**CI** (`.github/workflows/ci.yml`) on PRs to `main` and pushes to `main`:

- `build` (Linux): `npm ci`, tests, typecheck, desktop build, iOS web-layer build, web build
- `mac_package` (macOS): unsigned `.app` packaging dry run — catches electron-builder / entitlements mistakes before release
- `win_package` (Windows): builds the Store `.appx` with placeholder identity and asserts it contains the resource index and the full tile set
- `ios_build` (macOS): `cap sync` + `xcodebuild` for the iOS Simulator (no signing)

**Security** (`security.yml`): build & test, Google **OSV Scanner** on `package-lock.json` (fails on known-vulnerable deps; documented exceptions in `osv-scanner.toml`), and a **Trivy** filesystem scan (fails on CRITICAL, uploads HIGH+CRITICAL SARIF).

**Releases** (`release.yml`) — **paused** while the desktop apps are not in use: the workflow only runs when started by hand, so merging to `main` does not bump the version, tag, package or publish (the web app is deployed by Vercel). To resume, restore the push triggers noted at the top of the file. When active, merging to `main` auto-bumps the semver, tags, tests, packages Windows and macOS, and publishes a GitHub Release:

| Commit / merge message contains | Bump |
| --- | --- |
| (nothing) | patch |
| `bump:minor` | minor |
| `bump:major` | major |

The follow-up `chore(release):` commit is skipped (loop guard). Pushing a manual `vX.Y.Z` tag also works.

Expected release assets:

| Asset | Platform |
| --- | --- |
| `Hourbridge-X.Y.Z-win-x64-Setup.exe` | Windows installer |
| `Hourbridge-X.Y.Z-win-x64-portable.exe` | Windows portable |
| `Hourbridge-X.Y.Z-win-store.appx` | Windows Store package (only when the `WIN_STORE_*` secrets are set) |
| `Hourbridge-X.Y.Z-mac-x64.dmg` / `-mac-arm64.dmg` | macOS (Intel / Apple Silicon) |
| `Hourbridge-X.Y.Z-mac-x64.zip` / `-mac-arm64.zip` | macOS archives (updaters, Homebrew) |

The iOS app is **not** published by the release workflow: App Store distribution needs your signing identity, so archive and upload from Xcode (or add a signed `fastlane`/`xcodebuild` job with your own secrets).

## Security model (desktop)

- Renderer runs with `sandbox`, `contextIsolation`, no Node integration and a strict CSP; the preload exposes seven typed methods and nothing else.
- Every privileged IPC call validates its sender (packaged `file://…/renderer/index.html` or the dev-server origin) and its payload in the main process.
- Navigation and `window.open` are denied; only `https:` links open externally. All permission requests are denied except clipboard writes.
- Single-instance lock; window bounds are validated against attached displays before restoring.

## Stack

- [electron-vite](https://electron-vite.org/) · Electron 41 · React 19 · TypeScript
- [Vite](https://vite.dev/) static build + a small hand-written service worker for the web app
- [Capacitor](https://capacitorjs.com/) 8 (iOS, Swift Package Manager)
- [Luxon](https://moment.github.io/luxon/) for all time-zone math
- Public-holiday data generated from [date-holidays](https://github.com/commenthol/date-holidays) (code ISC; holiday data [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) © the date-holidays contributors) and the IANA tz database (public domain). This is the attribution CC BY asks for; keep it if you redistribute the data.
- Vitest + Testing Library

## Private repository notes

This repo is private. `GITHUB_TOKEN` with `contents: write` (set in the release workflow) is enough for Actions to create releases and upload assets. Collaborators need access to download release assets.
