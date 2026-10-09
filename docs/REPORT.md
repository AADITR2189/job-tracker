# Job Tracker v2 — Redesign Report

This document covers the deliverables requested for the redesign: migration logic, compatibility proof, accessibility, performance, responsiveness and PWA details.

---

## 1. Compatibility report — old backups and data keep working

### What did not change
| Item | Status |
|---|---|
| localStorage key `jt_v2` | Unchanged |
| Stored JSON shape (`jobs`, `persons`, `upcomingJobs`, `holidays`, `workingDays`, `personHolidays`, `compensationWorkingDays`) | Unchanged |
| Job / person / upcoming record fields | Unchanged; unknown fields are preserved |
| Export JSON file (keys, order, 2-space formatting, filename `job-tracker-data-YYYY-MM-DD.json`) | Byte-for-byte the same shape as v1 |
| Excel / CSV exports (sheets, columns, colours, filenames) | Same generation code |
| Calculations: overdue, due soon, counts, filters, search, sorting, working-day engine, carry-forward planning, next-available dates, rework revisions, actual days, invoice splitting by manhour ratio, lump-sum allocation | Same code |

**81 of v1's functions are carried over byte-for-byte**, including `getFilteredJobs`, `computeNextAvail`, `getJobWorkingDates`, `isWorkingDayForPerson`, `getPlanChipColor`, `getReportJobs`, the hold/rework/completion/reassign/share flows and every modal handler. The 46 changed functions are rendering code, plus a one-line validation check at the start of each save function.

### Automated proof (`tests/compat.test.js`)
The test loads the **same backup into the original v1 app (`legacy/index-v1.html`) and into v2**, then compares:

- sidebar and tab counts
- the job list produced by every status tab, 5 searches, location/priority/person filters and "overdue only"
- overdue and due-soon flags for every job
- next-available date for every person
- the full planning grid: for every person × 35 days, which jobs appear, their day number (D3/5), chip colour, working-day status and day type
- `nextId()`
- report totals for By Person and By Vessel × 4 date ranges × with/without reworks
- the exported JSON (v1 vs v2, and v2 vs the original backup)
- importing the file: v2 stores exactly what v1 stores
- data saved by v2 is read correctly by v1

| Backup tested | Result |
|---|---|
| Your backup `job-tracker-data-2026-10-09.json` (900 jobs, 26 persons) | **All 25 checks identical** |
| Synthetic backup with invoices (lump sum + per scope), shared jobs, manhours, rework chains, holds, leave, comp days, upcoming jobs | **All 25 checks identical** |
| Early-format backup (only `jobs` + `persons`, older fields missing, saved with a byte-order mark) | v1 itself crashes on this data (`nextId` reads the missing `upcomingJobs`); **v2 restores and renders it** (`tests/import-legacy.test.js`) |

### Migration logic (`components/data-compat.js`)
No data migration is required, because the schema is unchanged. To be safe with every older backup:

- **`jtNormalize()`** runs on load and on import. It only adds missing top-level containers (e.g. an early backup without `upcomingJobs` gets `[]`) and drops entries that are not objects at all (those crashed v1). It never renames, rewrites or removes fields.
- **Import validation** (`jtValidateBackup`) uses v1's rule (a `jobs` array is required), so everything that restored before still restores. It then shows a summary before replacing data: backup date, counts, and notes about duplicates, unknown statuses or odd dates. These are informational only and kept as-is.
- **Byte-order mark** in files saved by some editors is stripped (v1 rejected these files).
- **Safety copy:** before an import replaces data, the current data is saved under `jt_v2_pre_import`. *Settings → Undo last import* restores it. If storage gets full, live data always wins and the safety copy is dropped.
- **Unreadable stored data** is preserved under `jt_v2_unreadable_<time>` instead of being silently overwritten (v1 would lose it on the next save).
- **Storage-full errors** now show a message asking for a backup (v1 failed silently).
- **Multiple tabs:** if the app is open in two tabs, changes in one now update the other instead of being overwritten.
- **Old service worker:** v1 registered `sw.js`. That file is now a shim that loads the new worker, so devices running v1 upgrade automatically. Caches never hold user data.

### Behaviour fixes (bugs found in v1)
| v1 behaviour | v2 |
|---|---|
| Sidebar "Overdue Jobs" showed **all** jobs | Opens the Overdue view (same filter the Overdue stat card already used) |
| Excel menu "Planning View — next 14 days" said "No data to export" | Exports the Next 2 Weeks planning workbook |
| Dashboard availability could lag one change behind (planning cache was cleared after the dashboard used it) | Cache cleared first |
| Downloads could be cancelled in Safari/Firefox (link revoked immediately) | Link revoked after 5 seconds; iOS home-screen apps use the share sheet |
| Completion % could be saved above 100, days as 0 | Inline validation (decimal manhours are still accepted) |

### New storage keys (preferences only)
`jt_theme`, `jt_last_export`, `jt_v2_pre_import`, `jt_v2_pre_import_meta`. Older versions ignore them.

---

## 2. Accessibility report (WCAG 2.2 AA)

**Automated audit:** axe-core 4.10 (WCAG 2.0/2.1/2.2 A+AA and best-practice rules) on 7 pages + 3 dialogs, in light and dark, at 1440px and 390px: **0 violations** (40 page states). Lighthouse Accessibility: **100**.

What was done:
- **Semantics:** landmarks (`header`, `nav`, `main`, `aside`), one `h1` per page with ordered headings, real `<button>`s instead of clickable `div`s, a planning table with row/column headers, reports as data tables with `scope`, and `dl` for job details.
- **Keyboard:** everything is reachable and operable. Skip link; visible focus rings; Enter/Space on planning cells and chips; Esc closes dialogs, the drawer and menus; focus is trapped in dialogs and restored on close; the background is made `inert`.
- **Screen readers:** labelled icon-only buttons (e.g. "Edit DU4560 MOU PILI PILI"), `aria-expanded`/`aria-controls` on expandable rows, `aria-pressed` on filters, `aria-current` on navigation, progress bars with values, live result counts, and error toasts announced assertively.
- **Forms:** every field has a programmatic label; required fields are marked; inline errors are linked with `aria-describedby` and `aria-invalid`; focus moves to the first problem.
- **Contrast:** all text ≥ 4.5:1, UI boundaries ≥ 3:1 (input borders `#7C8AA0` = 3.5:1). Some requested brand colours are too light for text on white (`#22C55E` 2.3:1, `#F59E0B` 2.2:1, `#EF4444` 3.8:1, `#14B8A6` 2.5:1). They are used for fills, bars and icons; text uses darker shades of the same hue (e.g. `#15803D`, `#B45309`, `#B91C1C`, `#0F766E`). In dark mode, white text on `#3B82F6` is 3.7:1, so filled primary buttons use `#2563EB` (5.2:1) while `#3B82F6` is kept for accents, focus and charts. Planning chips automatically pick black or white text for best contrast without changing chip colours.
- **Touch & motion:** controls are ≥ 44×44px on mobile (verified automatically); all animation is disabled under `prefers-reduced-motion`.
- **Readability:** body and inputs are 16px (this also stops iOS zoom-on-focus); headings use `clamp()`; line-height is 1.55.

---

## 3. Performance summary

Lighthouse 12 (localhost, simulated throttling):

| | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|
| Mobile | **93** | **100** | **100** | **100** |
| Desktop | **100** | **100** | **100** | **100** |

Mobile: FCP 1.5s, LCP 3.0s, TBT 100ms, CLS 0. Desktop: FCP 0.3s, LCP 0.7s, TBT 0ms, CLS 0.003.

Lighthouse 12 no longer has a separate "PWA" category. The installability requirements it used to check (HTTPS, manifest with name/icons/start_url/display, maskable icon, service worker with offline start page, theme colour, apple-touch-icon, viewport) are all met. Offline start was verified in the interaction test.

Improvements:
- **~2 MB less JavaScript on start-up.** v1 loaded `xlsx` and `FileSaver` (never used) plus ExcelJS on every visit. These were removed; ExcelJS (same version 4.3.0) now loads only on first Excel export and is cached for offline use.
- **Progressive rendering:** the Jobs list paints the first 40 rows immediately and the rest in batches, so 900 jobs no longer block the UI. `content-visibility` skips off-screen rows.
- **Less work per action:** hidden pages (Jobs, Planning, Reports) re-render only when opened instead of after every change.
- **No layout shift:** stable skeletons, and the lower dashboard panels appear only when ready (CLS ≈ 0).
- **Fonts:** Inter loads asynchronously with `display=swap`, falls back to Segoe UI/system fonts, and is cached by the service worker.
- **Instant repeat loads:** the app shell is served from the service-worker cache.
- Closed dialogs are removed from layout (`display:none` with `allow-discrete` transitions, so they still animate).

---

## 4. Responsiveness summary

Mobile-first CSS with breakpoints at 380, 560, 768, 1024, 1500 and 1800px. No horizontal page scroll was verified at 390px and 1440px.

| Screen | Layout |
|---|---|
| Phones (< 768px) | Bottom navigation (Home, Jobs, Planning, Reports, More) + slide-out drawer for other pages, filters and data actions. Job rows become cards with wrapped actions. Filters collapse behind a "Filters" button. Status tabs scroll horizontally. Reports become stacked cards. Dialogs become bottom sheets. Safe-area insets respected (notches, home indicator). |
| Tablets (768–1023px) | Two-column dashboard and settings; inline filters; planning grid with sticky header and person column. |
| Laptops (≥ 1024px) | Permanent sidebar navigation; Jobs as a table with sticky, sortable header; actions on a second row line. |
| Large screens (≥ 1500px) | Job actions inline on one row; up to 8 stat cards per row at ≥ 1800px; content max-width 1600px. |
| Landscape phones | Compact top and bottom bars. |
| Print | Data-only output. |

The planning grid scrolls horizontally inside its own panel on small screens (7 days need ~850px). The page itself never scrolls sideways.

---

## 5. PWA details

| Feature | Implementation |
|---|---|
| Manifest | Name, icons (any + maskable), theme/background colours, `standalone`, shortcuts (Add Job, Jobs, Planning, Reports), screenshots for the richer install UI |
| Offline | App shell pre-cached and served cache-first. Fonts and ExcelJS cached at runtime. Works with no connection after the first visit. |
| Updates | New version installs in the background, then an **"Update now"** banner appears. It reloads only when the user taps it (data is already saved). Checks on open, hourly, and via Periodic Background Sync where supported. |
| Install | Chrome/Edge/Samsung install prompt (sidebar + Settings); iOS/iPadOS "Add to Home Screen" instructions; 16 iOS splash screens; apple-touch-icon |
| Offline indicator | "Offline" pill in the header + toast on change |
| Storage protection | Requests persistent storage (Settings shows status and a "Protect storage" button) |
| Background sync | The app has no server, so there is nothing to sync remotely. Periodic Background Sync is used to check for app updates, and changes sync live between open tabs. |

Browser notes: Android Chrome, Samsung Internet, Windows Chrome/Edge and macOS Chrome/Edge support install prompts. Safari (iPhone/iPad/macOS) installs via Share → Add to Home Screen / Add to Dock; offline caching works the same. Safari may clear website data for sites not opened in 7 days unless they are added to the Home Screen, so installing on iOS is recommended. Export JSON backups regularly on all platforms.

---

## 6. Design system

- **Typography:** Inter → Segoe UI → system → Arial; 16px base; `clamp()` headings.
- **Spacing:** 8px grid (`--s1` 4px … `--s8` 48px).
- **Radius:** 10 / 12 / 14px. **Shadows:** soft, layered.
- **Light theme:** background `#F8FAFC`, cards `#FFFFFF`, primary `#2563EB`, secondary `#1E293B`, accent `#14B8A6`, success `#22C55E`, warning `#F59E0B`, danger `#EF4444`, text `#1E293B`.
- **Dark theme:** background `#0F172A`, surface `#1E293B`, primary `#3B82F6`, accent `#2DD4BF`, success `#22C55E`, warning `#FBBF24`, danger `#F87171`, text `#F8FAFC`, muted `#94A3B8`.
- **Theme:** System / Light / Dark. Applied before first paint (no flash), remembered, follows the OS live in System mode, with a smooth transition when switching.
- **Motion:** 150 / 250 / 400ms; transform/opacity-based. Page fade-up with staggered reveal, skeleton shimmer, card lift, button ripple and press, expanding job rows, fade + scale dialogs, sliding nav indicator, toast slide-in/fade-out, animated counters, progress bars and completion ring.
