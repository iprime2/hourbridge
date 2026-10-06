# Roadmap

Hourbridge today is a local-first planner with **no backend**: cities and settings live on the device, public holidays are bundled, and the app makes no network requests of its own. This page is the plan for what comes next and — more important — the decisions that have to be made before each step. It is a plan, not a promise; a stage is "done" only when it says so here.

The order is chosen so that every stage is useful on its own and nothing is built on an unmade decision.

| Stage | What | Backend? | Status |
| --- | --- | --- | --- |
| 0 | Export/import settings, calendar links, share link | No | Done |
| 1 | Decisions and groundwork | No | Next |
| 2 | Accounts and sync (web only) | Yes | Blocked on decisions 1–5 |
| 3 | Sync in the desktop and iOS apps | Yes | After 2 |
| 4 | Workspaces | Yes | After 2 |
| 5 | Calendars (Google, then others) | Yes | After 2 and 4 |
| 6 | Meetings inside workspaces | Yes | After 4 and 5 |

## Stage 0 — no backend (done)

Features that needed no account, no server and no new third party.

- **Export / import settings** (*Settings → Your data*). A `.json` file with a `kind`, a `version` and the same state the app stores. Import checks the file (size, JSON, kind, version, city count, then the stored-state validator), shows what it contains and only replaces your settings after you confirm. A file from a newer version of the app is refused rather than half-read.
- **Share link**. Your cities go in the URL *fragment* (`#share=…`), which browsers never send to a server. Opening one shows a banner — *Add N new cities* (skips zones you already have), *Replace my cities*, *Dismiss*. Your home city and settings are never changed by a link. Limits: 30 cities, 40-character labels, zones must exist.
- **Add to Google Calendar / Outlook** from the planner, as links to each calendar's own "new event" page. No API, no sign-in, no permissions. Shown on the web and desktop; the iOS app keeps the Share sheet and `.ics`.

Not verified here: the Google and Outlook link formats come from their public documentation and were not clicked through with real accounts (in particular, Outlook work/school accounts may behave differently from outlook.live.com); the iOS and Electron runtimes can't be exercised on Linux, only the adapter contract is tested.

## Stage 1 — decisions and groundwork (no backend yet)

Cheap to do now, expensive to retrofit.

- A **privacy page** that says what is and isn't stored, ready to be changed when Stage 2 changes the answer.
- An **API contract**: the one route, its payload, versioning and error shapes, written down and reviewed before any server code.
- A **staging** environment separate from production, so a bad migration is never discovered by users.
- **Sync rule**: *newest write wins*, per whole state document, using a server-assigned `updated_at`. No field-level merge in v1; the app tells you when another device's newer copy replaced yours.

## Decisions needed before Stage 2

These are the owner's to make; none can be settled by code.

1. **Hosting terms.** Vercel's Hobby plan is for personal, non-commercial use. A product with accounts and workspaces is likely beyond it, which conflicts with "don't pay". Either stay personal-scale (and accept the limit), or budget for a paid plan or another host.
2. **Auth provider.** A hosted provider (Clerk) is the fast path but is a third party and means loosening the strict CSP (`'self'` only) for its scripts and requests. Our own auth keeps the CSP strict at the cost of building and securing login ourselves.
3. **A registered domain.** Needed for the provider's production mode, for Google's OAuth verification (Stage 5) and for email that reaches inboxes. The name Hourbridge has **not** been checked as a domain, in the App Store / Microsoft Store or as a trademark; nothing is registered or published under it.
4. **Privacy wording.** "Nothing leaves the device" stops being true when sync exists. The README, the in-app text and the privacy page change together, and sync is **opt-in**.
5. **Accounts and secrets.** The owner creates the provider and database accounts and puts the keys into the host's environment settings. Keys are never given to, or committed by, the assistant.

## Stage 2 — accounts and sync, web only

Local-first stays the rule: the app works fully signed out, and signing in only adds sync.

- Sign-in (per decision 2), one `/api/state` route, one table: `user_state(user_id, version, data jsonb, updated_at)`.
- Client hooks into the existing persistence layer (`subscribePersist`); the server **re-validates** every payload with the same rules as `parsePersistedState` and never trusts the client.
- The service worker must **never cache `/api`**.
- The CSP is loosened only as far as decision 2 requires, and the change is made in `vercel.json` and `src/web/index.html` together.

Free-tier figures from third-party pages disagree and change often (Clerk's free monthly-active-user allowance is quoted from 10,000 to 50,000; Neon's free tier is ~0.5 GB with scale-to-zero; Vercel Hobby limits functions to 12 per deployment and 10 s). Re-check them when decision 1 is made.

## Stage 3 — sync in the desktop and iOS apps

- The packaged apps call the API by absolute URL, and sign in through the system browser.
- Whether the provider's Electron and iOS SDKs work the way their docs say is **unverified**, and cannot be tested on Linux; CI only proves the apps build.

## Stage 4 — workspaces

- Organisations with members and a shared board of cities and meeting windows, using the same planner.
- Invitation emails need a sender domain (decision 3).
- Probably commercial in practice, so decision 1 matters more here.

## Stage 5 — calendars

- **5a. Google, read-only free/busy**, to show when people are actually free.
- **5b. Google, create events** from a chosen time.
- Google's sensitive-scope verification needs a privacy policy, a homepage on the verified domain and a demo video; expect roughly 3–6 weeks. Until verified, an app is limited to under 100 test users and shows a warning screen.
- **Apple** has no REST calendar API. The options are CalDAV with a manually created app-specific password (no push), or EventKit on iPhone and Mac only.
- **Outlook** has not been assessed.

## Stage 6 — meetings inside workspaces

- Propose, respond and confirm; notifications by email (needs a sender, as in Stage 4).
- Builds on 4 and 5; designed after they exist, not before.

## Principles that hold at every stage

- Local-first: the app is fully usable with no account and no network.
- All time math stays in `src/core`; the server stores state and never computes times.
- Anything that arrives from outside — a settings file, a share link, a sync payload — is untrusted and is validated before it touches state.
- No third-party script, font or request is added without asking, and the CSP is not loosened without asking.
- Nothing is registered, published or paid for without the owner's say-so.
