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

electron-builder is configured in `package.json` under `"build"`. Artifacts land in `release/`.

```bash
# Install deps first, then:
npm run dist          # build + package for current platform
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

### Releases (merge to main + version tags)

The release workflow (`.github/workflows/release.yml`) runs on:

1. **Push / merge to `main`** — publishes a **prerelease** with a unique tag so every merge gets a GitHub Release without colliding with prior ones
2. **Push of a `v*` tag** — publishes using that tag (stable when the tag is pure semver `vX.Y.Z`)

Pipeline shape (unchanged): `quality` → `package` (Windows + macOS matrix) → single `publish` job (no concurrent upload race; release runs are also serialized).

#### Tag / prerelease scheme

| Trigger | Tag name | Prerelease? | Release name |
| --- | --- | --- | --- |
| Merge / push to `main` | `v{package.json-version}-build.{github.run_number}` | **yes** | Includes short commit SHA in the name/body |
| Tag `vX.Y.Z` (semver only) | The pushed tag | **no** (full release) | Same as the tag |
| Other `v*` tags (e.g. with a suffix) | The pushed tag | yes | Same as the tag |

Installer filenames still come from `package.json` `version` via electron-builder (e.g. `WorldTimeBuddy-0.1.0-…`). Main-branch prereleases keep unique **GitHub Release tags** even when that package version is unchanged.

**Stable release flow** (from a clean `main` with the desired version already in `package.json`):

```bash
# Option A — bump package.json version and create an annotated tag
npm version patch   # or minor / major — updates package.json and creates vX.Y.Z
git push origin main --follow-tags

# Option B — tag the current package.json version without bumping
git tag v0.1.0
git push origin v0.1.0
```

Merging a PR to `main` alone is enough for a downloadable prerelease build; push a pure `vX.Y.Z` tag when you want a non-prerelease GitHub Release.

After the workflow finishes, open the GitHub Release for that tag. Expected assets:

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
