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
├── components/
│   ├── data-compat.js      Backup validation, normalisation, safety copy / undo import
│   ├── theme.js            Light / dark / system theme
│   ├── ui.js               Toasts, accessible dialogs, drawer, validation, downloads, ExcelJS loader
│   ├── empty-state.js      Illustrated empty states
│   └── pwa.js              Install prompt, update banner, offline indicator, storage protection
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

## Your data

- Data is stored only on the device, in `localStorage` under the key **`jt_v2`** (same as v1).
- **Export JSON** produces exactly the same file format as v1; v1 can import it.
- **Import** accepts backups from every earlier version, shows a summary before replacing anything, and keeps a safety copy so you can **Undo last import** (Settings).
- New keys used only for preferences: `jt_theme`, `jt_last_export`, `jt_v2_pre_import`, `jt_v2_pre_import_meta`.
- Export a JSON backup regularly. Browsers can clear website storage if the device runs low on space; installing the app and the "Protect storage" option in Settings reduce that risk.

## Tests

```bash
npx http-server -p 8080 -s -c-1 . &
node tests/make-fixtures.js                                   # synthetic backups (no real data)
node tests/compat.test.js path/to/your-backup.json            # v1 vs v2: calculations, filters, planning, reports, import/export
node tests/import-legacy.test.js                              # early-format backup (with BOM) restores
node tests/interactions.test.js                               # forms, rework, hold, share, Excel, theme, offline, mobile
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
