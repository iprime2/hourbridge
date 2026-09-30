# World Time Buddy

Timezone planner inspired by [worldtimebuddy.com](https://www.worldtimebuddy.com/). Line up any number of cities, see at a glance who is awake or at work, pick a meeting time, and share it.

Runs on **macOS**, **Windows** and **iOS** from one TypeScript codebase.

| Platform | Shell | Package |
| --- | --- | --- |
| macOS (Apple Silicon + Intel) | Electron | `.dmg`, `.zip` |
| Windows | Electron | NSIS installer, portable `.exe`, Store `.appx` |
| iOS / iPadOS 15+ | Capacitor (WKWebView) | Xcode project in `ios/` → TestFlight / App Store |

> **One app per OS.** The desktop widget is a second window inside the same Electron app, not a separate download.

## Features

**Planning**

- Any number of cities in one 24-hour grid; hover, click, or **drag** across hours to select a meeting window.
- **Your working hours** are set once, in your home timezone (both ends included — 1 PM – 9 PM covers the 1 PM … 9 PM tiles) and shown in *every* city's local time, so the green columns line up down the grid. A small moon on a green tile means that city is asleep then; sand is awake-but-outside-your-hours, dark is night. A bar under green tiles means it isn't conveyed by colour alone.
- **Meeting planner**: shows each person's local time for the selection, whether it is inside your working hours and who would be asleep, the best times (you're working and nobody's asleep) or the best compromise when there are none, a duration stepper, and one-tap **Copy details** / **Add to calendar (.ics)** — or the native **Share sheet** on iOS.
- Live **"Now" line**, half-hour and 45-minute zones handled correctly (IST ↔ US, Nepal), day-change labels on tiles.
- **DST awareness**: a `DST` badge while daylight time is in effect and a dashed `DST soon` badge when a clock change is within ~6 weeks (tooltip has the exact date).

**Cities**

- Full IANA database (~420 zones) with ranked search by city, country, abbreviation (`EST`, `PST`), or **UTC offset** (`+5:30`, `utc-8`), plus a "My location" shortcut.
- Rename, set any city as home (IST by default), sort west → east, and **reorder by dragging** a row's grip handle (a blue line shows where it will land) — or focus the handle and press ↑ / ↓; moves are announced to screen readers.

**Everywhere**

- Light / dark / system themes with checked WCAG-AA contrast; 12 / 24-hour clock; state persisted and versioned.
- Desktop: `⌘K` / `Ctrl+K` to add a city, `T` today, `[` `]` change day, arrows / `Shift`+arrows to move / resize the selection.
- Compact always-on-top **desktop widget** with live times and work/night indicators.

**macOS specifics**

- Native menu (File / Edit / View / Window / Help) with shortcuts, hidden-inset title bar, keeps running after the window closes.
- **Menu-bar clock** showing your home time, with a dropdown of every city (toggle in *File → Show Time in Menu Bar*).
- Widget floats over full-screen apps and follows you across Spaces; optional *Launch at Login*; window position remembered.

## Repository layout

```
src/core/       Platform-free TypeScript: time engine, planner, DST, share/ICS, city search,
                persistence, state hook. Pure and unit-tested. Shared by every app.
src/ui/         Shared React components + design tokens (CityPicker, SettingsPanel, PlannerBar, tokens.css)
src/renderer/   Electron UI (main window + widget)
src/mobile/     iOS UI (touch-first) and the Capacitor adapter (native.ts)
src/main/       Electron main process (windows, menu, menu-bar clock, IPC validation)
src/preload/    Electron preload: the only bridge between renderer and main
ios/            Capacitor-generated Xcode project (Swift Package Manager)
scripts/        Brand/icon generator (no dependencies)
.claude/skills/ Engineering playbook for this repo (architecture rules, checklists)
```

Rules that keep this working: time math lives only in `src/core`; `src/core` never imports from `renderer`/`mobile`; platform features sit behind small adapters (`window.wtb?.` on desktop, `src/mobile/native.ts` on iOS) and degrade to no-ops in a browser and in tests. See [`.claude/skills/wtb-lead-engineer/SKILL.md`](.claude/skills/wtb-lead-engineer/SKILL.md).

## Prerequisites

- Node.js **22+** (Capacitor 8's CLI requires it) and npm
- macOS with Xcode 26+ to build/run the iOS app locally (see [iOS](#ios)); everything else works on Linux/WSL/Windows/macOS

## Setup

```bash
git clone https://github.com/iprime2/world-time-buddy.git
cd world-time-buddy
npm install
```

## Development

```bash
npm run dev          # Electron + Vite with HMR
npm run dev:mobile   # the iOS UI in a browser at http://localhost:5174 (use device emulation)
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
```

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

## macOS signing & notarization

Builds are **unsigned by default** so CI needs no Apple secrets; macOS Gatekeeper will ask users to right-click → **Open** the first time. `electron-builder.cjs` switches on signing automatically when credentials are present:

| Env var / repo secret | Purpose |
| --- | --- |
| `MAC_CSC_LINK` → `CSC_LINK` | Developer ID Application certificate (`.p12`, base64 or path) |
| `MAC_CSC_KEY_PASSWORD` → `CSC_KEY_PASSWORD` | Certificate password |
| `APPLE_ID` | Apple ID used for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for that Apple ID |
| `APPLE_TEAM_ID` | Team ID — its presence also enables notarization |

With `CSC_LINK` set the app is signed with the hardened runtime and `build/entitlements.mac.plist` (only the JIT/executable-memory exceptions Electron's V8 needs). With `APPLE_TEAM_ID` too, it is notarized. Never commit certificates; `.gitignore` blocks `*.p12`, `*.cer`, `*.mobileprovision` and `AuthKey_*.p8`.

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

1. In Xcode → *App* target → *Signing & Capabilities*: choose your team and change the bundle id from the placeholder `com.worldtimebuddy.app` (also update `appId` in `capacitor.config.ts`).
2. Bump *Version* / *Build* (`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`).
3. *Product → Archive → Distribute App → App Store Connect*, then submit the build from TestFlight.

`ITSAppUsesNonExemptEncryption` is already `false` in `Info.plist`, so uploads skip the export-compliance prompt (the app only uses OS-provided HTTPS, and makes no network calls).

**What CI verifies:** the `ios_build` job runs `xcodebuild` for the simulator on `macos-latest` with signing disabled. Building the native project is impossible on Linux/WSL, so the web layer, the state/time logic and the native-adapter boundary are unit-tested locally, and the compile is verified in CI.

## Microsoft Store

Microsoft Store packaging uses electron-builder's **AppX** target (`appx`). In electron-builder **26.15.3**, a dedicated MSIX target is not available in app-builder-lib — use AppX (the Store accepts AppX and re-signs on submission).

### Partner Center setup

1. Create a [Microsoft Partner Center](https://partner.microsoft.com/) developer account (there is typically a one-time registration fee — confirm current pricing on Microsoft's site).
2. Reserve the app name **World Time Buddy**.
3. Open the app's **Product identity** page and copy:
   - **Package/Identity/Name** → `WIN_STORE_IDENTITY_NAME` (e.g. `YourPublisher.WorldTimeBuddy`)
   - **Publisher** (`CN=...`) → `WIN_STORE_PUBLISHER`
   - **Publisher display name** → `WIN_STORE_PUBLISHER_DISPLAY_NAME`
4. Optionally set `WIN_STORE_APPLICATION_ID` and `WIN_STORE_DISPLAY_NAME`.

Identity defaults in `electron-builder.cjs` are safe placeholders for local/CI builds. Replace them (env vars or config) **before** Store submission so they match Partner Center exactly. Optional GitHub Actions secrets with the same names override the placeholders on the Windows release job.

### Build the Store package (Windows only)

AppX packaging requires the Windows SDK / runner; it is not supported on Linux.

```bash
export WIN_STORE_IDENTITY_NAME="YourPublisher.WorldTimeBuddy"
export WIN_STORE_PUBLISHER="CN=Your Certificate Subject"
export WIN_STORE_PUBLISHER_DISPLAY_NAME="Your Publisher"
npm run dist:win:store
```

Output: `release/WorldTimeBuddy-<version>-win-store.appx`. Tile logos in `build/appx/` are generated by `npm run generate:icons`. Electron apps need the `runFullTrust` capability, which is set in config.

### Signing note (GitHub vs Store)

| Channel | Package | Signing |
| --- | --- | --- |
| GitHub Releases (Windows) | NSIS `Setup.exe` + portable `.exe` | **Unsigned** unless you add an Authenticode certificate (`CSC_LINK` / `WIN_CSC_LINK`) |
| GitHub Releases (macOS) | `.dmg` + `.zip` | Unsigned unless the macOS secrets above are set |
| Microsoft Store | AppX | Store re-signs after submission |

## CI / CD

**CI** (`.github/workflows/ci.yml`) on PRs to `main` and pushes to `main`:

- `build` (Linux): `npm ci`, tests, typecheck, desktop build, iOS web-layer build
- `mac_package` (macOS): unsigned `.app` packaging dry run — catches electron-builder / entitlements mistakes before release
- `ios_build` (macOS): `cap sync` + `xcodebuild` for the iOS Simulator (no signing)

**Security** (`security.yml`): build & test, Google **OSV Scanner** on `package-lock.json` (fails on known-vulnerable deps; documented exceptions in `osv-scanner.toml`), and a **Trivy** filesystem scan (fails on CRITICAL, uploads HIGH+CRITICAL SARIF).

**Releases** (`release.yml`): merging to `main` auto-bumps the semver, tags, tests, packages Windows and macOS, and publishes a GitHub Release.

| Commit / merge message contains | Bump |
| --- | --- |
| (nothing) | patch |
| `bump:minor` | minor |
| `bump:major` | major |

The follow-up `chore(release):` commit is skipped (loop guard). Pushing a manual `vX.Y.Z` tag also works.

Expected release assets:

| Asset | Platform |
| --- | --- |
| `WorldTimeBuddy-X.Y.Z-win-x64-Setup.exe` | Windows installer |
| `WorldTimeBuddy-X.Y.Z-win-x64-portable.exe` | Windows portable |
| `WorldTimeBuddy-X.Y.Z-win-store.appx` | Windows Store package |
| `WorldTimeBuddy-X.Y.Z-mac-x64.dmg` / `-mac-arm64.dmg` | macOS (Intel / Apple Silicon) |
| `WorldTimeBuddy-X.Y.Z-mac-x64.zip` / `-mac-arm64.zip` | macOS archives (updaters, Homebrew) |

The iOS app is **not** published by the release workflow: App Store distribution needs your signing identity, so archive and upload from Xcode (or add a signed `fastlane`/`xcodebuild` job with your own secrets).

## Security model (desktop)

- Renderer runs with `sandbox`, `contextIsolation`, no Node integration and a strict CSP; the preload exposes seven typed methods and nothing else.
- Every privileged IPC call validates its sender (packaged `file://…/renderer/index.html` or the dev-server origin) and its payload in the main process.
- Navigation and `window.open` are denied; only `https:` links open externally. All permission requests are denied except clipboard writes.
- Single-instance lock; window bounds are validated against attached displays before restoring.

## Stack

- [electron-vite](https://electron-vite.org/) · Electron 39 · React 19 · TypeScript
- [Capacitor](https://capacitorjs.com/) 8 (iOS, Swift Package Manager)
- [Luxon](https://moment.github.io/luxon/) for all time-zone math
- Vitest + Testing Library

## Private repository notes

This repo is private. `GITHUB_TOKEN` with `contents: write` (set in the release workflow) is enough for Actions to create releases and upload assets. Collaborators need access to download release assets.
