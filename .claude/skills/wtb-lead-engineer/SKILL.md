---
name: wtb-lead-engineer
description: Lead-engineer playbook for World Time Buddy — the web app (PWA) + Electron (Windows/macOS) + Capacitor (iOS) timezone app that shares one TypeScript core. Use when changing app architecture, UI/UX, time logic, the web/PWA shell, Electron main/preload code, macOS packaging, the iOS/Capacitor project, or CI for any of them.
---

# World Time Buddy — lead engineer playbook

## Architecture (keep this shape)

```
src/core/       platform-free TypeScript: time engine, formatters, cities, planner,
                ICS/share text, persistence, useTimeBuddyState. NO electron / capacitor / DOM-only APIs.
src/renderer/   Electron UI (main window, widget). May call window.wtb.* (optional-chained).
src/mobile/     Capacitor iOS UI (touch-first). May call Capacitor plugins.
src/web/        PWA shell: chooses the renderer (desktop grid) or mobile (touch) UI, install prompt,
                service worker (public/sw.js), manifest. Built by vite.web.config.ts → dist-web/.
src/main, src/preload/   Electron main + preload only.
```

Rules:
- Time math lives in `src/core` and is **pure and unit-tested**. Never format times or compute offsets in components.
- All UIs import from `@core/*`. `src/core` must never import from `renderer`, `mobile` or `web`.
- Platform features go behind a small adapter (`window.wtb?.` on desktop, Capacitor plugin on mobile) and must degrade to a no-op in a plain browser and in tests. Controls that need a platform feature (the Widget button) render only when it exists.
- All stored state goes through `src/core/persistence` (versioned, validated, try/catch around storage). Bump `version` and add a migration for any shape change.

## Web / PWA rules

- One page, two layouts: desktop grid when `(min-width: 900px) and (pointer: fine)`, touch layout otherwise; switching live must keep state. Both stylesheets load on the web, so page-level touch rules stay scoped to `html.is-mobile-ui` and new global selectors must be scoped to their layout.
- Relative URLs and `base: './'` everywhere (the site must work under a sub-path). No third-party requests: the CSP in `vercel.json` and `src/web/index.html` is `'self'` only — keep the two in step (a test enforces it).
- Service worker: the build (`scripts/lib/sw-build.ts`) stamps a hash of every emitted file into `sw.js`, so each deploy gets its own cache. Keep install all-or-nothing, no `skipWaiting`, old caches deleted on activate, registration production-only. Any change to `sw.js` needs the fake-Cache tests in `src/web/sw.test.ts`, and a check in real Chromium (offline reload, update flow).
- Icons come from `scripts/lib/brand.mjs` via `npm run generate:icons`; the maskable icon keeps its mark inside the 40% safe zone.

## Time-correctness checklist (the product's whole value)

- Convert with luxon from an absolute instant; never add hours to wall-clock numbers.
- Test the awkward cases: half-hour zones (Asia/Kolkata), 45-minute (Asia/Kathmandu), DST gaps/overlaps, dates that cross midnight, zones with no DST vs DST.
- Same IANA zone can appear under several labels — key UI by location `id`, compute by IANA.
- Live clocks must align to the minute boundary, not drift on a fixed `setInterval`.

## Electron rules

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Preload exposes a narrow typed API only.
- Validate every IPC argument in main (`typeof` checks); validate `event.senderFrame` origin for anything mutating.
- Deny all navigation and `window.open`; `shell.openExternal` only for `https:` URLs.
- Deny all permission requests unless a feature needs one.
- Keep the strict CSP in `index.html`; no remote code.
- macOS conventions: native app menu (with Edit roles so ⌘C/⌘V work), `titleBarStyle: 'hiddenInset'`, keep app alive after last window closes, `activate` re-creates a window, menu-bar Tray for at-a-glance time.
- Signing/notarization is driven by env vars/secrets in CI; never commit certs, `.p12`, or Apple IDs.

## iOS / Capacitor rules

- Capacitor wraps the `dist-mobile` Vite build; `ios/` is committed, `ios/App/Pods`, `DerivedData`, and build output are not.
- Use Swift Package Manager (`npx cap add ios --packagemanager SPM`).
- Honor safe areas (`env(safe-area-inset-*)`), 44pt minimum tap targets, `viewport-fit=cover`, no hover-only affordances.
- Persist with `@capacitor/preferences` (WKWebView `localStorage` can be evicted).
- Use haptics sparingly (selection changes), Share sheet for sharing.
- **This machine is Linux/WSL: `xcodebuild` is unavailable.** `cap add/sync ios` work here; compilation and simulator runs are verified in CI on `macos-latest`. Never claim the iOS app "builds" or "runs" from here — say what was and was not verified.

## UI/UX rules

- One set of design tokens (CSS variables); light + dark via `prefers-color-scheme` and an explicit override. No hard-coded hex in component CSS.
- Contrast ≥ WCAG AA for text on day/night tiles; never rely on color alone (add a glyph/label for working-hours and DST).
- Everything reachable by keyboard on desktop; visible `:focus-visible`; `aria-live` only for meaningful announcements (never for a ticking clock).
- Respect `prefers-reduced-motion`.
- Verify UI changes by screenshot (Playwright + cached Chromium), at desktop and phone widths, in light and dark.

## Definition of done for any change

1. `npm test` and `npm run lint` green; new logic has unit tests.
2. `npm run build` succeeds, plus `npm run build:mobile` and `npm run build:web` when touching shared UI/core (the web build also fails if the service-worker placeholders are lost).
3. UI changes checked visually; anything not verifiable on this machine (macOS, iOS) is stated explicitly in the hand-off.
4. README/docs updated when commands, targets, or secrets change.
