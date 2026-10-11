# Job Tracker — Stability Engineering (PWA)

An installable, offline-first web app for tracking naval & stability engineering jobs: scopes, statuses, progress, day-wise planning, team availability, rework/QC, and financial/manhour reports.

Version 2 is a full visual and PWA redesign of v1. **All business logic, the storage key and the backup format are unchanged.** See [docs/REPORT.md](docs/REPORT.md) for the compatibility proof, accessibility and performance reports.

## Folder structure

```
job-tracker/
├── index.html              App shell: layout, pages, dialogs, icon sprite
├── styles.css              Design system (tokens, light/dark themes, layout, components, motion)
├── app.js                  Application logic (v1 logic carried over unchanged + new rendering)
├── manifest.json           PWA manifest (icons, shortcuts, screenshots)
├── service-worker.js       Offline caching + update flow
├── sw.js                   Shim so devices running the v1 service worker upgrade automatically
├── sync-config.js          Firebase project settings for sync (null = sync off)
├── firestore.rules         Database security rules (owner-only access)
├── components/
│   ├── data-compat.js      Backup validation, normalisation, safety copy / undo import
│   ├── theme.js            Light / dark / system theme
│   ├── ui.js               Toasts, accessible dialogs, drawer, validation, downloads, ExcelJS loader
│   ├── empty-state.js      Illustrated empty states
│   ├── pwa.js              Install prompt, update banner, offline indicator, storage protection
│   ├── sync.js             Optional cloud sync (Firebase): sign-in, live updates, 3-way merge
│   │   — loaded after start-up (keeps the first screen fast) —
│   ├── motion.js           Animations (page entrance, theme reveal, progress glide, celebrations)
│   ├── drag.js             Drag & drop helper (mouse, pen, touch long-press)
│   ├── jobs-plus.js        Jobs: board view, grouping, compact mode, swipe actions
│   ├── planning-plus.js    Planning: drag a job to another day / person
│   ├── insights.js         Dashboard & report charts, dashboard location switch, Compare, PDF
│   └── palette.js          Quick search (Ctrl+K), reminder on open, due-date notifications
├── assets/logo.svg         Master logo (source for all icons)
├── icons/                  App icons, maskable icons, favicons, iOS splash screens, screenshots
├── legacy/index-v1.html    The original v1 app, unchanged (reference + emergency fallback)
├── tests/                  Compatibility & end-to-end tests (Playwright)
├── tools/                  Icon / screenshot generators
└── docs/REPORT.md          Compatibility, accessibility, performance & responsiveness reports
```

## Running it

It is a static site — no build step. Serve the folder over **HTTPS** (GitHub Pages, Netlify, any web server). Service workers and installation need HTTPS (or `localhost`).

```bash
npx http-server -p 8080 -c-1 .     # then open http://localhost:8080
```

**Deploying an update:** bump `CACHE_VERSION` in `service-worker.js` (and `APP_VERSION` in `components/pwa.js`). Installed apps download the new version in the background and show an **"Update now"** banner; nothing reloads without the user's consent.

## Sync across devices (optional)

With a free Firebase project, the same data is available on phone and PC, with live updates and offline support. Concurrent edits are merged per record. Setup: [docs/SYNC-SETUP.md](docs/SYNC-SETUP.md). Config goes in `sync-config.js`; security rules are in `firestore.rules`. Sync is off until configured.

## Features added in v2.4

- **Location follows the person in charge.** Jobs and upcoming jobs always take the location of their assigned person (fixed automatically on open, on reassign and when a person's location changes). Jobs with no person keep their own location.
- **Jobs:** undo after delete / status / % / bulk changes · +10% and 100% buttons · quick filter chips (due this week, overdue, high priority, not started) · copy a job · select many jobs and change status, priority or person, or delete · group by job number or vessel · board view (drag cards between status columns, or use "Move to") · swipe on phone (right = complete, left = delete) · activity history per job · compact view · export only the jobs you see.
- **Dashboard:** All / HO / COK switch for the whole page · this-week strip · jobs completed per week or month · workload per person.
- **Planning:** Week / 2 weeks / Month · drag a job to another day or person · free / booked / overbooked marks and a booked % per person.
- **Persons:** open, done and overdue counts, how booked the next 2 weeks are, upcoming leave.
- **Reports:** charts (manhours estimated vs actual, invoice) · Compare two people, vessels or months · PDF / print.
- **Everywhere:** quick search (Ctrl+K or the search icon) · reminder of jobs due today / overdue when the app opens · optional due-date notifications (Settings → Reminders).

## Your data

- Data is stored only on the device, in `localStorage` under the key **`jt_v2`** (same as v1).
- **Export JSON** produces exactly the same file format as v1; v1 can import it.
- **Import** accepts backups from every earlier version, shows a summary before replacing anything, and keeps a safety copy so you can **Undo last import** (Settings).
- Jobs may carry an optional `activityLog` list (v2.4: when status, %, person, dates, priority or hold changed). Older versions ignore it, so backups stay compatible both ways.
- New keys used only for preferences: `jt_theme`, `jt_last_export`, `jt_v2_pre_import`, `jt_v2_pre_import_meta`, `jt_jobs_view`, `jt_plan_range`, `jt_dash_loc`, `jt_trend`, `jt_notify`, `jt_notified`; with sync: `jt_device_id`, `jt_sync_rev:*`, `jt_sync_dirty:*`, `jt_sync_last`.
- Export a JSON backup regularly. Browsers can clear website storage if the device runs low on space; installing the app and the "Protect storage" option in Settings reduce that risk.

## Tests

```bash
npx http-server -p 8080 -s -c-1 . &
node tests/make-fixtures.js                                   # synthetic backups (no real data)
node tests/compat.test.js path/to/your-backup.json            # v1 vs v2: calculations, filters, planning, reports, import/export
node tests/import-legacy.test.js                              # early-format backup (with BOM) restores
node tests/interactions.test.js                               # forms, rework, hold, share, Excel, theme, offline, mobile
node tests/motion.test.js                                     # animations change nothing about data
node tests/features.test.js                                   # v2.4 features (location rule, undo, bulk, board, planning drag, charts, search)
# two-device sync against the Firebase emulators (see header of tests/sync.test.js)
cd tests/firebase && npx firebase-tools emulators:exec --project demo-jt --only auth,firestore "FIREBASE_LIB_DIR=... node ../sync.test.js"
```

Requires Playwright with Chromium (`npm i -D playwright`). If the CDN is unreachable in your environment, set `EXCELJS_FILE=/path/to/exceljs.min.js` for the Excel tests.

## Icons

| File | Size | Purpose |
|---|---|---|
| `icons/icon-192.png`, `icons/icon-512.png` | 192², 512² | Manifest "any" icons (rounded) |
| `icons/maskable-192.png`, `icons/maskable-512.png` | 192², 512² | Android adaptive icons (full-bleed, artwork inside the 80% safe zone) |
| `icons/apple-touch-icon.png` | 180² | iOS home screen (opaque, iOS rounds corners) |
| `icons/favicon.svg`, `icons/favicon-32.png` | vector, 32² | Browser tab |
| `icons/splash/splash-W×H.png` | 16 sizes | iOS launch screens (iPhone SE → iPhone 16 Pro Max, iPad mini → iPad Pro 12.9") |
| `icons/screenshot-wide.png`, `icons/screenshot-narrow.png` | 1280×800, 390×844 | Richer install dialog (Chrome/Edge) |

Regenerate everything from `assets/logo.svg` with `node tools/generate-icons.js`.
