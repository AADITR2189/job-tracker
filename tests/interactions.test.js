/* End-to-end interaction checks for v2 (uses the synthetic fixture).
   Usage: node tests/interactions.test.js   (server on :8080) */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.BASE || 'http://localhost:8080/';
const data = fs.readFileSync(path.join(__dirname, 'fixtures/sample-backup-v1.json'), 'utf8');
let fail = 0; const ok = (n, c, extra) => { console.log(c ? '✓' : '✗', n, extra ?? ''); if(!c) fail++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(d => { if(!sessionStorage.seeded) { localStorage.setItem('jt_v2', d); sessionStorage.seeded = 1; } }, data);
  // Optional: serve ExcelJS from a local copy when the CDN is unreachable (EXCELJS_FILE=/path/exceljs.min.js)
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(BASE); await p.waitForTimeout(800);
  const jobs = () => p.evaluate(() => JSON.parse(localStorage.getItem('jt_v2')).jobs);
  const n0 = (await jobs()).length;

  // Add job: inline validation blocks empty vessel
  await p.click('.topbar .btn-primary');
  await p.waitForSelector('#jobModal:not(.hidden)');
  await p.click('#jobModal .modal-footer .btn-primary');
  ok('validation: empty vessel blocked with inline error', await p.isVisible('#jobModal .field-error') && (await jobs()).length === n0);
  await p.fill('#fVessel', 'Test Vessel'); await p.fill('#fScope', 'Stability booklet'); await p.fill('#fJobNum', 'QA1');
  await p.click('#multiScopeSection .btn'); await p.fill('.ms-scope', 'Second scope');
  await p.click('#jobModal .modal-footer .btn-primary'); await p.waitForTimeout(300);
  const added = (await jobs()).filter(j => j.vesselName === 'Test Vessel');
  ok('add job with extra scope creates 2 jobs', added.length === 2);
  ok('new job has v1 field set', ['jobNumber','status','priorityLevel','invoiceType','sharedJobDetails','reworkHistory','daysElapsed'].every(k => k in added[0]));

  // Complete via status select → completion modal
  await p.evaluate(() => showPage('jobs'));
  await p.fill('#jobSearch', 'Test Vessel'); await p.waitForTimeout(200);
  ok('search highlights matches', (await p.locator('#jobsListWrap mark').count()) > 0);
  const id = added.find(j => j.jobScope === 'Stability booklet').id;
  await p.selectOption(`#st-${id}`, 'complete'); await p.waitForSelector('#completionDateModal:not(.hidden)');
  await p.fill('#completionManhours', '12'); await p.click('#completionDateModal .btn-success'); await p.waitForTimeout(300);
  let j = (await jobs()).find(x => x.id === id);
  ok('complete flow sets status/date/manhours', j.status === 'complete' && j.completionPercentage === 100 && j.manhoursConsumed === 12);

  // Rework
  await p.click(`#jcard-${id} .act-btn.rework`); await p.waitForSelector('#reworkDialogModal:not(.hidden)');
  await p.click('#reworkDialogModal .btn-warn');
  ok('rework requires a target date', await p.isVisible('#reworkDialogModal .field-error'));
  await p.fill('#rwTargetDate', '2030-01-01'); await p.click('#reworkDialogModal .btn-warn'); await p.waitForTimeout(300);
  const rw = (await jobs()).find(x => x.parentJobId === id);
  ok('rework job created with revision & history', rw && rw.isRework && rw.status === 'rework planned' && (await jobs()).find(x=>x.id===id).reworkHistory.length === 1);

  // Hold + share + percentage
  const other = added.find(j => j.jobScope === 'Second scope').id;
  await p.fill('#jobSearch', ''); await p.evaluate(() => { setJobTab('all', null); }); await p.fill('#jobSearch', 'Second scope'); await p.waitForTimeout(200);
  await p.click(`#jcard-${other} .act-btn.hold`); await p.fill('#holdDaysInput', '3'); await p.click('#holdModal .btn-primary'); await p.waitForTimeout(200);
  j = (await jobs()).find(x => x.id === other); ok('hold sets holdStartDate/holdDays', !!j.holdStartDate && j.holdDays === 3);
  await p.fill(`#jcard-${other} .pct-form input`, '40'); await p.press(`#jcard-${other} .pct-form input`, 'Enter'); await p.waitForTimeout(200);
  j = (await jobs()).find(x => x.id === other); ok('quick % change updates progress + status', j.completionPercentage === 40 && j.status === 'ongoing');
  await p.click(`#jcard-${other} .act-btn.share`); await p.waitForSelector('#shareJobModal:not(.hidden)');
  const person = await p.evaluate(() => JT.persons[1].name);
  await p.selectOption('#sharePerson', person); await p.fill('#shareTo', '2030-01-10'); await p.click('#shareJobModal .btn-block'); await p.waitForTimeout(200);
  j = (await jobs()).find(x => x.id === other); ok('share adds sharedJobDetails', j.sharedJobDetails && j.sharedJobDetails[0].personName === person);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok('Esc closes dialog', await p.locator('#shareJobModal.hidden').count() === 1);

  // Expandable details
  await p.click(`#jcard-${other} .jrow-expand`); await p.waitForTimeout(400);
  ok('job details expand', await p.isVisible(`#jdet-${other} .jd-grid`));

  // Planning: day status → holiday
  await p.evaluate(() => showPage('planning')); await p.waitForTimeout(300);
  await p.click('#planTable thead th.pt-day >> nth=2'); await p.waitForSelector('#dayStatusModal:not(.hidden)');
  const hol0 = (await p.evaluate(() => JSON.parse(localStorage.getItem('jt_v2')).holidays.length));
  await p.click('#dsOptions .ds-red >> nth=-1'); await p.waitForTimeout(300);
  const hol1 = (await p.evaluate(() => JSON.parse(localStorage.getItem('jt_v2')).holidays.length));
  ok('planning day status toggles holiday', hol1 === hol0 + 1 || hol1 === hol0 - 1);

  const dl3 = p.waitForEvent('download').catch(() => null);
  await p.evaluate(() => exportData());
  const d3 = await dl3; ok('JSON backup downloads', !!d3 && /^job-tracker-data-\d{4}-\d{2}-\d{2}\.json$/.test(d3.suggestedFilename()));

  // Excel export (ExcelJS loads on demand). Set EXCELJS_FILE=/path/exceljs.min.js to test without CDN access.
  {
    const xctx = await b.newContext({ acceptDownloads: true, serviceWorkers: process.env.EXCELJS_FILE ? 'block' : 'allow' });
    if(process.env.EXCELJS_FILE) await xctx.route('**/exceljs@4.3.0/dist/exceljs.min.js', r => r.fulfill({ path: process.env.EXCELJS_FILE, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }));
    await xctx.addInitScript(d => localStorage.setItem('jt_v2', d), data);
    const xp = await xctx.newPage(); xp.on('pageerror', e => errs.push(e.message));
    await xp.goto(BASE); await xp.waitForTimeout(500);
    for(const [type, re] of [['all', /^job-tracker-all-.*\.xlsx$/], ['overdue', /\.xlsx$/], ['complete', /\.xlsx$/], ['persons', /\.xlsx$/], ['planning', /^Planning_All_Next2Weeks_.*\.xlsx$/]]) {
      const dl = xp.waitForEvent('download', { timeout: 20000 }).catch(() => null);
      await xp.evaluate(t => exportExcel(t), type);
      const d = await dl; ok(`Excel export "${type}" downloads`, !!d && re.test(d.suggestedFilename()), d && d.suggestedFilename());
    }
    for(const fn of ['exportReportExcel', 'exportReportCSV']) {
      await xp.evaluate(() => showPage('reports'));
      const dl = xp.waitForEvent('download', { timeout: 20000 }).catch(() => null);
      await xp.evaluate(f => window[f](), fn);
      const d = await dl; ok(`Report ${fn} downloads`, !!d, d && d.suggestedFilename());
    }
    await xctx.close();
  }

  // Theme
  await p.evaluate(() => setThemePref('dark'));
  await p.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark', null, { timeout: 3000 }).catch(() => {}); // applied inside the reveal animation
  ok('dark theme applies + persists', (await p.getAttribute('html', 'data-theme')) === 'dark' && await p.evaluate(() => localStorage.getItem('jt_theme')) === 'dark');
  await p.reload(); await p.waitForTimeout(300);
  ok('no theme flash: dark set before paint', (await p.getAttribute('html', 'data-theme')) === 'dark');

  // Offline: service worker serves the app shell
  await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
  ok('service worker controls page', await p.evaluate(() => !!navigator.serviceWorker.controller));
  await ctx.setOffline(true);
  await p.reload(); await p.waitForTimeout(800);
  ok('app loads offline with data', await p.evaluate(() => JT.jobs.length > 0 && !!document.querySelector('.stat-card')));
  ok('offline indicator shown', await p.isVisible('#netStatus'));
  await ctx.setOffline(false);

  // Mobile layout: drawer + bottom nav
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await m.addInitScript(d => localStorage.setItem('jt_v2', d), data);
  const mp = await m.newPage(); mp.on('pageerror', e => errs.push(e.message));
  await mp.goto(BASE); await mp.waitForTimeout(600);
  ok('bottom nav visible on phone', await mp.isVisible('#bottomNav'));
  await mp.click('#bottomNav [data-more]'); await mp.waitForTimeout(350);
  ok('drawer opens', await mp.evaluate(() => document.getElementById('sidebar').classList.contains('open')));
  await mp.click('#sidebar .nav-btn[data-page="persons"]'); await mp.waitForTimeout(350);
  ok('drawer nav switches page and closes', await mp.isVisible('#page-persons') && !(await mp.evaluate(() => document.getElementById('sidebar').classList.contains('open'))));
  ok('"More" highlighted for drawer pages', await mp.evaluate(() => document.querySelector('[data-more]').classList.contains('active')));
  const small = await mp.evaluate(() => Array.from(document.querySelectorAll('button, select, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), [role=button]'))
    .filter(e => e.offsetParent && !e.closest('.overlay.hidden') && !e.closest('.sidebar:not(.open)') && !e.classList.contains('link-btn') && !e.classList.contains('jh-sort') && !e.closest('.legend'))
    .map(e => { const r = e.getBoundingClientRect(); return [e.className || e.tagName, Math.round(r.width), Math.round(r.height)]; })
    .filter(([, w, h]) => w > 0 && (w < 44 || h < 44)));
  ok('touch targets ≥ 44px on phone (controls)', small.length === 0, small.slice(0, 6).map(x=>x.join(':')).join(' | '));

  ok('no runtime errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(fail ? `${fail} failure(s)` : 'All interaction checks passed');
  process.exit(fail ? 1 : 0);
})();
