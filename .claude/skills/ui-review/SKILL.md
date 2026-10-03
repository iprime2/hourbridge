---
name: ui-review
description: Review World Time Buddy UI code (React components and CSS in src/ui, src/renderer, src/mobile, src/web) for accessibility, focus, touch, animation, dark mode, safe-area and content-handling problems, using a pinned copy of Vercel's Web Interface Guidelines plus this app's own rules. Use when asked to review or audit UI, when finishing a UI change, or before merging one.
---

# UI review

A review reports problems; it does not fix them unless asked.

1. **Scope.** By default the UI files changed against `main`: `git diff --name-only origin/main...HEAD -- 'src/**/*.tsx' 'src/**/*.css' 'src/**/*.html'`. Otherwise the files or folder you were given.
2. **Read the rules** in [`web-interface-guidelines.md`](web-interface-guidelines.md), then apply the overrides below. Where they disagree, the overrides win.
3. **Read each file and check it.** Optional prefilter (it finds candidates; you still judge each hit):

   ```bash
   grep -rnE "transition:\s*all" src --include=*.css --include=*.tsx
   grep -rnE "outline:\s*(none|0)\b" src --include=*.css        # fine if a :focus-visible replacement follows
   grep -rnE "user-scalable|maximum-scale" src --include=*.html --include=*.tsx
   grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(" src --include=*.css --exclude=tokens.css
   grep -rnE "<(div|span)[^>]*onClick" src --include=*.tsx --exclude=*.test.tsx
   ```
4. **Look at it** for anything visual: `npm run build:web && npm run preflight:web -- --shots out/shots`, then view the four PNGs (desktop and phone × light and dark). See the `web-preflight` skill.
5. **Report** grouped by file, one line per finding as `file:line - issue`, `✓ pass` for clean files, no preamble. Tag each as **blocker** (an accessibility failure, a removed focus indicator with no replacement, a zoom lock, a div with a click handler, meaning carried by colour alone), **should fix**, or **optional**.

## This app's overrides

- **No third-party anything.** Never suggest `preconnect`, CDN links or remote fonts: the CSP is `'self'` only (`vercel.json`, `src/web/index.html`).
- **Times are formatted in `src/core`.** The compact tile style (`9:30p`) is deliberate. Flag a *component* that formats a time itself; do not flag the absence of `Intl.DateTimeFormat`.
- **Not applicable:** *Hydration Safety* (client-only, no SSR); *Images*, video and GIF rules (no content images); virtualization unless a list can pass about 50 rows; URL-as-state (state lives in local storage by design).
- **Copy is sentence case.** Don't flag it for Title Case. The rest of *Content & Copy* applies: specific button labels, and error messages that say what to do next.
- **`aria-live`** only for meaningful announcements (toasts, validation), never the ticking clock.
- **Colour comes from tokens** in `src/ui/tokens.css` (light and dark, contrast at least WCAG AA). No hard-coded colours in component CSS, and never colour alone: working hours and DST also get a glyph or label.
- **Touch layout:** 44 pt targets, `env(safe-area-inset-*)`, nothing that only works on hover. **Desktop:** everything reachable by keyboard with a visible `:focus-visible`.
- **Layout scope:** both stylesheets load on the web, so page-level touch rules stay under `html.is-mobile-ui` and any new global selector must be scoped to its layout.
- **Platform controls** (the Widget button) render only when the platform feature exists.

## About the rules file

`web-interface-guidelines.md` is an unmodified copy of [`vercel-labs/web-interface-guidelines`](https://github.com/vercel-labs/web-interface-guidelines) `command.md` at commit `e3d624b` (2026-08-17), MIT licensed (see `LICENSE`). It is a slash-command file, so ignore its frontmatter and the `$ARGUMENTS` line. It is pinned on purpose: don't make the skill fetch rules from the web at review time. To refresh it, diff against upstream, read every change, then update the file and the commit above together.
