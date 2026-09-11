# World Time Buddy

Desktop timezone conversion app inspired by [worldtimebuddy.com](https://www.worldtimebuddy.com/). Compare multiple time zones at a glance and align any IST (or home) hour across all rows.

**Stack:** Electron + Vite + React + TypeScript (packages for Windows and macOS).

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

electron-builder is configured in `package.json` under `"build"`.

```bash
# Install deps first, then:
npm run dist          # build + package for current platform
npm run pack          # build unpacked dir only (faster check)
```

Cross-platform notes:

- Package **Windows** installers on Windows (or with appropriate wine/CI).
- Package **macOS** `.dmg` on macOS (Apple signing/notarization needed for distribution).
- Targets: Windows `nsis`, macOS `dmg` (see `package.json` → `build`).

## Stack

- [electron-vite](https://electron-vite.org/) — Electron + Vite
- React 19 + TypeScript
- Vitest for unit tests
