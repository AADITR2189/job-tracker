/* Checks the v2.4 features: location follows the person, undo, activity log,
   quick filters, bulk edit, copy, grouping, board, planning ranges & drag,
   dashboard/report charts, compare, search palette and reminders.
   Usage: node tests/features.test.js   (server on :8080) */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.BASE || 'http://localhost:8080/';
const data = fs.readFileSync(path.join(__dirname, 'fixtures/sample-backup-v1.json'), 'utf8');
let fail = 0; const ok = (n, c, x) => { console.log(c ? '✓' : '✗', n, x ?? ''); if(!c) fail++; };
const SHOTS = process.env.SHOTS;   // optional folder for screenshots

(async () => {
  const b = await chromium.launch();
  const mk = async (opts = {}, seed = data) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', ...opts });
    // jt_reminded: skip the "due today" reminder toast so it can't be mistaken for an Undo toast
    await ctx.addInitScript(d => { if(!sessionStorage.seeded) { localStorage.setItem('jt_v2', d); sessionStorage.seeded = 1; sessionStorage.setItem('jt_reminded', '1'); } }, seed);
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto(BASE);
    await p.waitForFunction(() => window.jtJobsPlus && window.jtPlanPlus && window.jtInsights && window.jtPalette, null, { timeout: 8000 });
    await p.waitForTimeout(300);
    return { ctx, p };
  };
  const shot = async (p, name) => { if(SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png') }); };
  const { ctx, p } = await mk();

  /* ── Location follows the person ── */
  const loc = await p.evaluate(() => {
    const map = Object.fromEntries(JT.persons.map(x => [x.name, x.location]));
    const bad = JT.jobs.filter(j => j.personInCharge && map[j.personInCharge] && map[j.personInCharge] !== j.location).length;
    const j = JT.jobs.find(x => x.personInCharge && map[x.personInCharge] === 'COK');
    const ho = JT.persons.find(x => x.location === 'HO');
    actionJobId = j.id; populatePersonDropdowns();
    document.getElementById('rAssignPerson').value = ho.name;
    doReassign();
    const stored = JSON.parse(localStorage.getItem('jt_v2')).jobs.find(x => x.id === j.id);
    return { bad, after: stored.location, stored: JSON.parse(localStorage.getItem('jt_v2')).jobs.filter(x => x.personInCharge && map[x.personInCharge] && map[x.personInCharge] !== x.location).length };
  });
  ok('every assigned job shows its person’s location after load', loc.bad === 0, loc);
  ok('reassigning COK job to HO person moves it to HO (saved)', loc.after === 'HO' && loc.stored === 0, loc);
  const form = await p.evaluate(async () => {
    openAddJob();
    const ho = JT.persons.find(x => x.location === 'HO'), cok = JT.persons.find(x => x.location === 'COK');
    const ps = document.getElementById('fPerson'); ps.value = cok.name; ps.dispatchEvent(new Event('change'));
    const r = { loc: document.getElementById('fLoc').value, locked: document.getElementById('fLoc').disabled };
    ps.value = ''; ps.dispatchEvent(new Event('change'));
    r.unlocked = !document.getElementById('fLoc').disabled;
    closeModal('jobModal');
    return r;
  });
  ok('Add Job: location filled from person and locked', form.loc === 'COK' && form.locked && form.unlocked, form);

  /* ── Undo + activity log ── */
  const undo = await p.evaluate(async () => {
    showPage('jobs');
    document.getElementById('toastWrap').innerHTML = '';
    const j = JT.jobs.find(x => x.status === 'ongoing');
    const before = j.completionPercentage || 0;
    quickPctChange(j.id, before === 50 ? 60 : 50);
    const log = JT.jobs.find(x => x.id === j.id).activityLog || [];
    const btn = [...document.querySelectorAll('.toast-action')].pop();
    const hasBtn = !!btn;
    btn && btn.click();
    return { id: j.id, before, logged: log.some(e => e.f === 'completionPercentage'), hasBtn, after: JT.jobs.find(x => x.id === j.id).completionPercentage || 0 };
  });
  ok('% change is written to the job’s activity log', undo.logged, undo);
  ok('Undo button restores the previous %', undo.hasBtn && undo.after === undo.before, undo);
  const del = await p.evaluate(async () => {
    const n = JT.jobs.length, id = JT.jobs[3].id;
    window.confirm = () => true;
    document.getElementById('toastWrap').innerHTML = '';
    deleteJob(id);
    const t0 = performance.now();
    while(JT.jobs.some(j => j.id === id) && performance.now() - t0 < 3000) await new Promise(r => setTimeout(r, 50));
    const gone = !JT.jobs.some(j => j.id === id);
    [...document.querySelectorAll('.toast-action')].pop()?.click();
    return { gone, back: JT.jobs.some(j => j.id === id), n2: JT.jobs.length, n };
  });
  ok('deleted job comes back with Undo', del.gone && del.back && del.n2 === del.n, del);
  const actUi = await p.evaluate(() => {
    const j = JT.jobs.find(x => Array.isArray(x.activityLog) && x.activityLog.length);
    if(!j) return false;
    return /Progress|Person|Status/.test(jobDetailsHTML(j));
  });
  ok('job details show the Activity section', actUi);

  /* ── Quick chips ── */
  const chips = await p.evaluate(() => {
    clearJobFilters();
    const all = getFilteredJobs().length;
    toggleQuickFilter('overdue');
    const od = getFilteredJobs();
    const okOd = od.every(isOverdue) && od.length === JT.jobs.filter(isOverdue).length;
    toggleQuickFilter('high');
    const both = getFilteredJobs().every(j => isOverdue(j) && ['top urgent','urgent'].includes(j.priorityLevel));
    const pressed = document.querySelectorAll('#quickChips [aria-pressed="true"]').length;
    clearJobFilters();
    return { all, okOd, both, pressed, cleared: getFilteredJobs().length === all };
  });
  ok('quick filter chips filter and combine, Clear resets', chips.okOd && chips.both && chips.pressed === 2 && chips.cleared, chips);

  /* ── Bulk ── */
  const bulk = await p.evaluate(async () => {
    setSelectMode(true);
    const ids = [...document.querySelectorAll('#jobsBody .jrow')].slice(0, 3).map(r => Number(r.id.slice(6)));
    ids.forEach(id => document.querySelector(`#jcard-${id} .jrow-check input`).click());
    const count = document.getElementById('bulkCount').textContent;
    bulkApply('priority', 'low');
    const pr = ids.every(id => JT.jobs.find(j => j.id === id).priorityLevel === 'low');
    const ho = JT.persons.find(x => x.location === 'HO');
    bulkApply('person', ho.name);
    const ps = ids.every(id => { const j = JT.jobs.find(x => x.id === id); return j.personInCharge === ho.name && j.location === 'HO'; });
    // Job number / vessel / client for all selected; empty box keeps the old value
    const clients = ids.map(id => JT.jobs.find(j => j.id === id).clientName);
    openBulkEdit();
    const hint = document.getElementById('beVesselNow').textContent;
    document.getElementById('beJobNum').value = 'NEW-123';
    document.getElementById('beVessel').value = 'New Vessel';
    saveBulkEdit();
    const txt = ids.every((id, i) => { const j = JT.jobs.find(x => x.id === id); return j.jobNumber === 'NEW-123' && j.vesselName === 'New Vessel' && j.clientName === clients[i]; });
    const closed = document.getElementById('bulkEditModal').classList.contains('hidden');
    const savedTxt = JSON.parse(localStorage.getItem('jt_v2')).jobs.filter(j => ids.includes(j.id)).every(j => j.jobNumber === 'NEW-123');
    setSelectMode(false);
    return { count, pr, ps, txt, closed, savedTxt, hint, barHidden: document.getElementById('bulkBar').hidden };
  });
  ok('bulk select: priority and person applied to 3 jobs (location follows)', bulk.count === '3 selected' && bulk.pr && bulk.ps && bulk.barHidden, bulk);
  ok('bulk edit: job number and vessel changed on all 3, client kept, saved', bulk.txt && bulk.closed && bulk.savedTxt && /^Now:/.test(bulk.hint), bulk);

  /* ── Copy ── */
  const copy = await p.evaluate(() => {
    const j = JT.jobs.find(x => x.vesselName && x.jobScope);
    duplicateJob(j.id);
    const r = { title: document.getElementById('jobModalTitle').textContent, vessel: document.getElementById('fVessel').value === j.vesselName };
    closeModal('jobModal'); return r;
  });
  ok('Copy opens a pre-filled Add Job form', copy.title === 'Copy Job' && copy.vessel, copy);

  /* ── Group / board / density ── */
  await p.evaluate(() => { showPage('jobs'); jtJobsPlus.setGroup('vessel'); });
  await p.waitForTimeout(200);
  const grp = await p.evaluate(() => ({ groups: document.querySelectorAll('.jgroup').length, vessels: new Set(getFilteredJobs().map(j => j.vesselName || '(no vessel)')).size }));
  ok('group by vessel: one group per vessel', grp.groups > 0 && grp.groups === grp.vessels, grp);
  await shot(p, 'jobs-grouped');
  await p.evaluate(() => jtJobsPlus.setGroup(''));
  await p.evaluate(() => jtJobsPlus.setView('board'));
  await p.waitForTimeout(200);
  const board = await p.evaluate(() => ({ cols: document.querySelectorAll('.bcol').length, cards: document.querySelectorAll('.bcard').length }));
  ok('board view shows 5 columns with cards', board.cols === 5 && board.cards > 0, board);
  await shot(p, 'jobs-board');
  // Drag a "Not started" card into "In progress" with the mouse
  const src = await p.evaluate(() => { const c = document.querySelector('.bcol-todo .bcard'); return c ? Number(c.dataset.id) : null; });
  if(src) {
    const a = await p.locator(`#bcard-${src} .bcard-scope`).boundingBox();
    const t = await p.locator('.bcol-doing').boundingBox();
    await p.mouse.move(a.x + 20, a.y + 5); await p.mouse.down();
    await p.mouse.move(a.x + 60, a.y + 30, { steps: 4 });
    await p.mouse.move(t.x + 60, t.y + 120, { steps: 10 });
    await p.mouse.up();
    await p.waitForTimeout(300);
    const st = await p.evaluate(id => JT.jobs.find(j => j.id === id).status, src);
    ok('dragging a card to “In progress” makes it ongoing', /ongoing/.test(st), st);
  } else ok('board has a not-started card to drag', false);
  await p.evaluate(() => jtJobsPlus.setView('list'));
  await p.evaluate(() => jtJobsPlus.toggleDensity());
  ok('compact density toggles a class', await p.evaluate(() => document.getElementById('page-jobs').classList.contains('jobs-compact')));
  await p.evaluate(() => jtJobsPlus.toggleDensity());

  /* ── % steps ── */
  const step = await p.evaluate(() => {
    clearJobFilters(); setJobTab('ongoing');
    const row = document.querySelector('#jobsBody .jrow'); const id = Number(row.id.slice(6));
    const before = JT.jobs.find(j => j.id === id).completionPercentage || 0;
    row.querySelector('.pct-step').click();
    return { before, after: JT.jobs.find(j => j.id === id).completionPercentage };
  });
  ok('+10% button adds 10%', step.after === Math.min(100, step.before + 10), step);
  await p.evaluate(() => setJobTab('all'));

  /* ── Planning: ranges, capacity, drag ── */
  const ranges = await p.evaluate(async () => {
    showPage('planning');
    const r = {};
    for(const k of ['week', '2week', 'month']) { setPlanRange(k); r[k] = document.querySelectorAll('#planTable thead th.pt-day').length; }
    setPlanRange('month'); planShift(1);
    r.next = document.getElementById('planLabel').textContent;
    setPlanRange('week');
    r.cap = document.querySelectorAll('#planTable td.cap-free, #planTable td.cap-booked, #planTable td.cap-over').length > 0;
    r.util = document.querySelectorAll('.pp-util').length;
    return r;
  });
  const dim = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  ok('planning shows 7 / 14 / whole-month columns', ranges.week === 7 && ranges['2week'] === 14 && ranges.month === dim, ranges);
  ok('planning shows busy level per cell and per person', ranges.cap && ranges.util > 0, ranges);
  await p.waitForTimeout(400);
  const chipInfo = await p.evaluate(() => {
    const c = [...document.querySelectorAll('#planTable .plan-chip[data-own="1"]')].find(c => { const td = c.closest('td'); return td.nextElementSibling && td.nextElementSibling.matches('td.pc'); });
    if(!c) return null;
    c.scrollIntoView({ block: 'center', inline: 'center' });
    const j = JT.jobs.find(x => x.id === Number(c.dataset.job));
    return { id: j.id, start: j.startDate || j.plannedStartDate, person: j.personInCharge, from: c.dataset.from };
  });
  if(chipInfo) {
    await p.waitForTimeout(300);
    const { a, next } = await p.evaluate(i => {
      const c = document.querySelector(`#planTable .plan-chip[data-job="${i.id}"][data-from="${i.from}"]`);
      const r = c.getBoundingClientRect(), td = c.closest('td').nextElementSibling, r2 = td.getBoundingClientRect();
      return { a: { x: r.left, y: r.top }, next: { x: r2.left + r2.width / 2, y: r2.top + r2.height / 2, ds: td.dataset.ds } };
    }, chipInfo);
    await p.mouse.move(a.x + 10, a.y + 10); await p.mouse.down();
    await p.mouse.move(a.x + 30, a.y + 14, { steps: 3 });
    await p.mouse.move(next.x, next.y, { steps: 10 });
    await p.mouse.up();
    await p.waitForTimeout(300);
    const after = await p.evaluate(id => { const j = JT.jobs.find(x => x.id === id); return { start: j.startDate || j.plannedStartDate, person: j.personInCharge }; }, chipInfo.id);
    const exp = await p.evaluate(s => localDateStr(addDays(new Date(s + 'T00:00'), 1)), chipInfo.start);
    ok('dragging a planning chip one day later moves its start by one day', after.start === exp && after.person === chipInfo.person, { before: chipInfo, after, exp });
  } else ok('planning has a draggable chip', false);

  /* ── Dashboard ── */
  const dash = await p.evaluate(async () => {
    showPage('dashboard');
    setDashAvailLoc('HO');
    const total = Number(document.querySelector('.stat-card.s-total .stat-val').dataset.count);
    const hoJobs = JT.jobs.filter(j => j.location === 'HO').length;
    const people = [...document.querySelectorAll('#dashMore .hrow-name')].map(e => e.textContent);
    const hoNames = JT.persons.filter(p => p.location === 'HO').map(p => p.name);
    setDashAvailLoc('');
    return { total, hoJobs, onlyHo: people.every(n => hoNames.includes(n)), week: document.querySelectorAll('.wk-day').length, bars: document.querySelectorAll('.vcol').length,
      allTotal: Number(document.querySelector('.stat-card.s-total .stat-val').dataset.count), all: JT.jobs.length };
  });
  ok('dashboard location switch filters stats and workload', dash.total === dash.hoJobs && dash.onlyHo && dash.allTotal === dash.all, dash);
  ok('dashboard shows this-week strip (8 columns) and 12-bar trend', dash.week === 8 && dash.bars === 12, dash);
  await shot(p, 'dashboard');

  /* ── Reports ── */
  const rpt = await p.evaluate(() => {
    showPage('reports'); setRptTab('person'); setRptQuick('all');
    const rows = document.querySelectorAll('#rptCharts .hrow').length;
    setRptTab('compare');
    const cmpRows = document.querySelectorAll('.cmp-table tbody tr').length;
    jtInsights.setCmp('type', 'month');
    const months = document.querySelectorAll('#cmpA option').length;
    setRptTab('person');
    return { rows, cmpRows, months, foot: !!document.querySelector('#rptContent tfoot') };
  });
  ok('reports show charts, compare table, and still the totals table', rpt.rows > 0 && rpt.cmpRows === 10 && rpt.months > 0 && rpt.foot, rpt);

  /* ── Quick search ── */
  await p.keyboard.press('Control+K');
  await p.waitForTimeout(150);
  const q = await p.evaluate(() => JT.jobs.find(j => j.vesselName).vesselName);
  await p.keyboard.type(q);
  const pal = await p.evaluate(() => ({ open: !document.getElementById('paletteModal').classList.contains('hidden'), items: document.querySelectorAll('.pal-item').length, first: document.querySelector('.pal-item strong')?.textContent }));
  ok('Ctrl+K opens search and finds the vessel', pal.open && pal.items > 0 && pal.first.includes(q), pal);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(500);
  ok('Enter opens the job on the Jobs page', await p.evaluate(() => isPageActive('jobs') && document.getElementById('paletteModal').classList.contains('hidden')));

  /* ── Typing a % and pressing Enter saves once (one Undo, and Undo restores the old value) ── */
  await p.evaluate(() => { clearJobFilters(); setJobTab('ongoing'); document.getElementById('toastWrap').innerHTML = ''; });
  await p.waitForTimeout(300);
  const prow = p.locator('#jobsBody .jrow').nth(0);
  const pid = await prow.evaluate(r => Number(r.id.slice(6)));
  const pBefore = await p.evaluate(id => JT.jobs.find(j => j.id === id).completionPercentage || 0, pid);
  const newPct = pBefore === 37 ? 38 : 37;
  await prow.locator('input[name=pct]').fill(String(newPct));
  await prow.locator('input[name=pct]').press('Enter');
  await p.waitForTimeout(600);
  const undoToasts = await p.evaluate(() => document.querySelectorAll('#toastWrap .toast-action').length);
  await p.locator('#toastWrap .toast-action').last().click();
  await p.waitForTimeout(300);
  const pAfter = await p.evaluate(id => JT.jobs.find(j => j.id === id).completionPercentage || 0, pid);
  ok('% + Enter shows one Undo, and Undo restores the old %', undoToasts === 1 && pAfter === pBefore, { undoToasts, pBefore, pAfter });
  await p.evaluate(() => setJobTab('all'));

  ok('no page errors', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
  await b.close();
  console.log(fail ? `\n${fail} FAILED` : '\nAll feature checks passed');
  process.exit(fail ? 1 : 0);
})();
