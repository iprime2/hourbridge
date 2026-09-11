# World Time Buddy

Desktop timezone conversion app inspired by [worldtimebuddy.com](https://www.worldtimebuddy.com/). Compare multiple time zones at a glance and align any IST (or home) hour across all rows.

**Stack:** Electron + Vite + React + TypeScript (packages for Windows and macOS).

> **One app, one download per OS.** The desktop widget is a second Electron window inside the same application — not a separate binary or installer. Each Windows installer / macOS DMG includes both the main UI and the widget.

## Features

- Multiple zones in one grid (default: Miami, **IST home**, AEST, London, Tokyo)
- Hover/click an hour column to compare that instant across every row
- Add/remove cities, set home zone, date strip, 12h / 24h toggle
- Day/night tile coloring; half-hour offsets (IST ↔ US) shown correctly
- Compact **desktop widget** (always-on-top) with live local times for your locations

## Prerequisites

- Node.js 20+ and npm

## Setup

```bash
cd /home/iprime2/projects/world-time-buddy
npm install
```

## Development

```bash
npm run dev
```

Starts Vite and Electron together. On WSL without a GUI/display, Electron may still fail to open a window — use Windows/macOS desktop or WSLg. Hardware acceleration is disabled on Linux to improve WSL compatibility.

### Open the desktop widget

1. Start the app with `npm run dev`.
2. In the main window toolbar, click **Widget**.
3. A small always-on-top window opens with live times for the same locations (synced via `localStorage` key `wtb:state`).
4. In the widget: **Pinned** toggles always-on-top, **Main** focuses the main window, **×** closes the widget.

Re-opening **Widget** focuses the existing widget window if it is already open.

## Build

```bash
npm run build
```

Outputs main/preload/renderer bundles to `out/`.

## Test

```bash
npm test
```

## Typecheck

```bash
npm run lint
```

## Packaging (Windows / macOS)

electron-builder is configured in `package.json` under `"build"`. Artifacts land in `release/`. All `dist*` / `pack` scripts pass `--publish never` so packaging never uploads to GitHub — CI publishes via `softprops/action-gh-release` instead.

```bash
# Install deps first, then:
npm run dist          # build + package for current platform (--publish never)
npm run pack          # build unpacked dir only (faster check)
npm run dist:win      # Windows NSIS + portable (run on Windows / CI)
npm run dist:mac      # macOS DMG for x64 + arm64 (run on macOS / CI)
```

Cross-platform notes:

- Package **Windows** installers on Windows (or with CI `windows-latest`).
- Package **macOS** `.dmg` on macOS (CI `macos-latest`).
- Targets: Windows `nsis` + `portable`, macOS `dmg` (see `package.json` → `build`).
- Each package includes the main window **and** the widget window — there is no separate widget installer.

## CI / CD

### Continuous integration

On pull requests targeting `main` and on pushes to `main`, GitHub Actions (`.github/workflows/ci.yml`) runs:

- `npm ci`
- `npm test`
- `npm run lint` (TypeScript)
- `npm run build` (electron-vite smoke build, no packaging)

### Security / PR scans

On pull requests to `main` (and pushes to `main`), `.github/workflows/security.yml` runs three jobs in parallel:

| Job | What it does |
| --- | --- |
| `build` | Node 20, `npm ci`, `npm test`, `npm run build` |
| `osv_scan` | Google OSV Scanner against `package-lock.json` (fails on known vulnerable deps) |
| `trivy_scan` | Trivy filesystem scan (`vuln` + `secret` + `misconfig`); **fails on CRITICAL** vulns; uploads HIGH+CRITICAL SARIF to GitHub Code Scanning |

### Releases (auto-semver on merge to main)

Merging a PR into `main` **automatically** bumps the app version and publishes a **full** GitHub Release (not a prerelease). Each release includes the main app **and** the desktop widget in every installer/DMG.

#### How it works

1. **Merge / push to `main`** (excluding `chore(release):` commits) → `version` job runs `npm version` (default **patch**), commits `chore(release): X.Y.Z`, tags `vX.Y.Z`, and pushes to `main` with `--follow-tags`.
2. **`quality` → `package` → `publish`** run against that tag: tests, Win/mac packaging with `--publish never`, then `softprops/action-gh-release` creates the Release with installers attached (`generate_release_notes: true`, `make_latest: true`).
3. The follow-up `chore(release):` push is **skipped** (loop guard) so the bump commit does not start another release.

#### Controlling the bump

| Commit / merge message contains | Semver bump |
| --- | --- |
| (default — no keyword) | **patch** (`0.1.0` → `0.1.1`) |
| `bump:minor` | minor (`0.1.0` → `0.2.0`) |
| `bump:major` | major (`0.1.0` → `1.0.0`) |

Put `bump:minor` or `bump:major` in the **merge commit message** (or the tip commit on `main`) when you need more than a patch.

#### Manual `v*` tags

Pushing a `vX.Y.Z` tag still works for force/retag edge cases: the workflow skips the version bump and packages/publishes that tag. Tags created by the auto `chore(release):` commit are not packaged again (avoids a double release after `--follow-tags`).

#### Release assets

After the workflow finishes, open the GitHub Release for `vX.Y.Z`. Expected assets:

| Asset | Platform |
| --- | --- |
| `WorldTimeBuddy-X.Y.Z-win-x64-Setup.exe` | Windows NSIS installer (includes app + widget) |
| `WorldTimeBuddy-X.Y.Z-win-x64-portable.exe` | Windows portable (includes app + widget) |
| `WorldTimeBuddy-X.Y.Z-mac-x64.dmg` | macOS Intel (includes app + widget) |
| `WorldTimeBuddy-X.Y.Z-mac-arm64.dmg` | macOS Apple Silicon (includes app + widget) |

### Unsigned macOS (Gatekeeper)

Release builds are **unsigned by default** so CI does not need Apple Developer certificates. On first open, macOS may block the app (Gatekeeper). Users can right-click → **Open**, or allow it under **System Settings → Privacy & Security**.

Optional signing / notarization (future): set repository secrets such as `CSC_LINK`, `CSC_KEY_PASSWORD`, and Apple ID notarization credentials, then remove `CSC_IDENTITY_AUTO_DISCOVERY=false` / `mac.identity: null` from the release job. Do not commit certificate files.

### Private repository notes

This repo is private. `GITHUB_TOKEN` with `contents: write` (set in the release workflow) is enough for Actions to create releases and upload assets. Collaborators need access to download release assets.

## Stack

- [electron-vite](https://electron-vite.org/) — Electron + Vite
- React 19 + TypeScript
- Vitest for unit tests
