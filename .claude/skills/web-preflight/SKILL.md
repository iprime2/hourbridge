---
name: web-preflight
description: Check the built web app the way Vercel will serve it — real Chromium at desktop and phone sizes against the headers in vercel.json (CSP, service worker, offline reload, manifest, layout switch), with optional light/dark screenshots and a clean-copy rehearsal of Vercel's install and build. Use before merging or deploying anything that touches src/web, the service worker, vercel.json, shared UI or src/core, and to verify a UI change by screenshot.
---

# Web preflight

```bash
npm run build:web && npm run preflight:web          # check dist-web as Vercel would serve it
npm run preflight:web -- --shots out/shots          # also save desktop/phone × light/dark PNGs
npm run preflight:web -- --clean                    # rehearse Vercel: `git archive HEAD`, its install + build, then check
npm run preflight:web -- --serve-only               # just serve dist-web with the Vercel headers
```

It exits 0 only if every check passes and prints `PASS`/`FAIL` per check with the reason for a failure.

## What it checks

- **Headers** (`/`, a hashed asset, `/sw.js`, the manifest, a 404): the six security headers are present; hashed assets are `immutable`; `sw.js` is `no-cache`; the manifest has its own media type. They come from `vercel.json` through `scripts/lib/vercel-headers.mjs`, which merges every matching rule like Vercel does.
- **Per layout** (desktop 1280×800 with a mouse, phone 390×844 touch): the app renders; no console errors, failed requests or CSP violations; the service worker activates, controls the page after a reload, and fills exactly one cache; the manifest is installable (name, standalone, 512 and maskable icons); the right layout class is set; the page reloads and renders **offline**.

## Setup

Playwright is not a project dependency (keep it that way). The Claude cloud sandbox already has one on `NODE_PATH`. Elsewhere:

```bash
npm i --no-save --no-audit --no-fund --prefix "${TMPDIR:-/tmp}/wtb-playwright" playwright-core
```

The script looks in `$WTB_PLAYWRIGHT_DIR`, the repo, then that folder. It uses `$CHROME_PATH`, else a Chromium under `$PLAYWRIGHT_BROWSERS_PATH`, else Playwright's own. As root it adds `--no-sandbox`.

## Using it

- **UI change:** run with `--shots`, then look at the PNGs (the Read tool shows images). The lead-engineer rules require desktop and phone, light and dark.
- **Before a merge or deploy:** `--clean` after committing. It builds the last commit, so uncommitted work is not included, and it needs network for `npm ci` (about 15 s).
- **A `FAIL` on `vercel.json`:** fix the file, not the script. If a new header uses syntax beyond plain paths and `(.*)`, the script refuses it ("Unsupported vercel.json header source"); extend `scripts/lib/vercel-headers.mjs` and its tests rather than loosening the check.

## What it does not prove

- **Real Vercel.** It emulates only the `headers` section of `vercel.json`. Anything Vercel adds itself (HSTS, default page caching) is not covered. After the first deploy compare `curl -I https://<project>.vercel.app/` with a local run.
- **The service-worker update flow** (second deploy, waiting worker, activation after the app is closed). That needs two builds in real Chromium; see the Web / PWA rules in `lead-engineer`.
- **iOS Safari and Android Chrome.** Not testable here; say so in the hand-off.
