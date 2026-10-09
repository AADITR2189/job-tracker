/* ════════════════════════════════════════════════════════════════════
   Backward-compatibility test: original v1 app vs redesigned v2 app.
   Loads the SAME backup into both and compares every calculation,
   filter, planning slot, report total and export output.

   Usage:
     npx http-server -p 8080 -s -c-1 .        (in the repo root)
     node tests/compat.test.js path/to/job-tracker-data-YYYY-MM-DD.json
   Requires Playwright (Chromium). Exits non-zero on any difference.
   ════════════════════════════════════════════════════════════════════ */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:8080/';
const file = process.argv[2] || path.join(__dirname, 'fixtures/sample-backup-v1.json');
const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
const input = JSON.parse(raw);

let failures = 0;
const check = (name, a, b) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if(!ok) { failures++; console.log('✗', name); console.log('   v1:', JSON.stringify(a).slice(0, 300)); console.log('   v2:', JSON.stringify(b).slice(0, 300)); }
  else console.log('✓', name);
};

// Runs inside each app: uses only functions that exist in BOTH versions
const probe = async () => {
  const out = {};
  const ids = ['all','active','ongoing','planned','not-planned','rework','hold','complete','cancelled','overdue'];
  out.sidebarCounts = Object.fromEntries(ids.map(i => [i, document.getElementById('sfc-'+i).textContent]));
  out.tabCounts = Object.fromEntries(ids.filter(i=>i!=='overdue').map(i => [i, document.getElementById('tc-'+i).textContent]));
  // Filter logic per tab (default ordering), plus search/location/person/priority filters
  out.tabs = {};
  for(const t of ['all','active','ongoing','planned','not planned','rework','hold','complete','cancelled','overdue']) {
    jobTab = t; out.tabs[t] = getFilteredJobs().map(j=>j.id);
  }
  jobTab = 'all';
  const s = document.getElementById('jobSearch');
  out.search = {};
  for(const q of ['grain','DN1','maersk','akhil','stability']) { s.value = q; out.search[q] = getFilteredJobs().map(j=>j.id); }
  s.value = '';
  document.getElementById('jobLocFilter').value = 'COK'; out.locCOK = getFilteredJobs().map(j=>j.id); document.getElementById('jobLocFilter').value = '';
  document.getElementById('jobPriorityFilter').value = 'urgent'; out.prioUrgent = getFilteredJobs().map(j=>j.id); document.getElementById('jobPriorityFilter').value = '';
  const pf = document.getElementById('jobPersonFilter');
  out.byPerson = {};
  for(const p of JT.persons) { pf.value = p.name; out.byPerson[p.name] = getFilteredJobs().map(j=>j.id); }
  pf.value = '';
  document.getElementById('jobOverdueOnly').checked = true; out.overdueOnly = getFilteredJobs().map(j=>j.id); document.getElementById('jobOverdueOnly').checked = false;
  // Business rules
  out.isOverdue = JT.jobs.filter(isOverdue).map(j=>j.id);
  out.isApproaching = JT.jobs.filter(isApproaching).map(j=>j.id);
  // Planning engine & availability (fresh cache)
  clearJobDateCache();
  out.nextAvail = Object.fromEntries(JT.persons.map(p => { const d = computeNextAvail(p.name); return [p.name, d ? localDateStr(d) : null]; }));
  clearJobDateCache();
  const start = new Date(); start.setDate(start.getDate() - 7);
  out.schedule = {};
  for(const p of JT.persons) for(let i = 0; i < 35; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i); const ds = localDateStr(d);
    const js = getJobsForPersonOnDate(p.name, ds);
    if(js.length) out.schedule[p.name+'|'+ds] = js.map(j => j.id + ':' + getDayNumber(j, ds, p.name) + ':' + getPlanChipColor(j, 0));
    out.schedule['w|'+p.name+'|'+ds] = isWorkingDayForPerson(ds, p.name) + ':' + getDayColumnType(ds, p.name);
  }
  out.nextId = nextId();
  // Reports: totals for both groupings, every quick range, with and without reworks
  out.reports = {};
  const totals = () => {
    const el = document.getElementById('rptContent');
    const foot = el.querySelector('tfoot tr');
    return foot ? Array.from(foot.querySelectorAll('td')).slice(1).map(td => td.textContent.trim().replace(/\s+/g,' ')) : 'empty';
  };
  for(const tab of ['person','vessel']) for(const range of ['all','thisMonth','lastMonth','thisYear']) for(const rw of [true,false]) {
    rptTab = tab; document.getElementById('rptIncludeRework').checked = rw; setRptQuick(range);
    out.reports[`${tab}|${range}|rework=${rw}`] = { jobs: getReportJobs().map(j=>j.id), totals: totals() };
  }
  // Per-person invoice split (detail rows) for All Time
  rptTab = 'person'; document.getElementById('rptIncludeRework').checked = true; setRptQuick('all');
  out.reportPersonRows = Array.from(document.querySelectorAll('#rptContent tbody tr')).filter(r => /prpt_\d+_row|cursor/.test(r.id + (r.getAttribute('style')||''))).length;
  return out;
};

// Capture what exportData() downloads
const captureExport = async () => {
  const captured = [];
  const orig = URL.createObjectURL;
  URL.createObjectURL = b => { captured.push(b); return orig.call(URL, b); };
  HTMLAnchorElement.prototype.click = function(){};
  exportData();
  await new Promise(r => setTimeout(r, 50));
  return await captured[0].text();
};

(async () => {
  const browser = await chromium.launch();
  const load = async (url) => {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    await ctx.addInitScript(d => { if(!sessionStorage.getItem('seeded')) { localStorage.setItem('jt_v2', d); sessionStorage.setItem('seeded','1'); } }, JSON.stringify(input));
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    page.on('dialog', d => d.accept());
    await page.goto(BASE + url);
    await page.waitForFunction(() => typeof JT !== 'undefined' && JT.jobs && JT.jobs.length > 0);
    await page.waitForTimeout(300);
    return { ctx, page, errs };
  };
  const v1 = await load('legacy/index-v1.html');
  const v2 = await load('index.html');

  let r1 = null;
  try { r1 = await v1.page.evaluate(probe); }
  catch(e) {
    // Very early backups (e.g. no "upcomingJobs") crash v1 itself; v2 normalises them.
    console.log('ℹ v1 cannot run with this data (' + e.message.split('\n')[0] + '). Checking v2 alone.');
  }
  const r2 = await v2.page.evaluate(probe);
  if(r1) for(const k of Object.keys(r1)) check('calc: ' + k, r1[k], r2[k]);
  else { check('v2 runs every calculation on this data', !!r2 && r2.tabs.all.length === input.jobs.length, true); await browser.close(); console.log(failures ? `\n${failures} difference(s) found` : '\nAll v2 checks passed (v1 comparison not possible)'); process.exit(failures ? 1 : 0); }

  // Stored data must be untouched by simply opening the app
  const stored2 = await v2.page.evaluate(() => JSON.parse(localStorage.getItem('jt_v2')));
  check('localStorage jt_v2 unchanged after opening v2', input.jobs, stored2.jobs);

  // Export output: identical shape and content (except timestamp)
  const e1 = JSON.parse(await v1.page.evaluate(captureExport));
  const e2text = await v2.page.evaluate(captureExport);
  const e2 = JSON.parse(e2text);
  check('export: same top-level keys in same order', Object.keys(e1), Object.keys(e2));
  delete e1.exportDate; delete e2.exportDate;
  check('export: identical content (v1 vs v2)', e1, e2);
  const inCopy = { ...input }; delete inCopy.exportDate;
  check('export: round-trips the original backup exactly', inCopy, e2);
  check('export: same JSON formatting (2-space indent)', /^\{\n  "jobs": \[/.test(e2text), true);

  // Import: v2 importing the file produces the same stored data as v1 importing it
  const doImport = async (p) => {
    await p.evaluate(() => { localStorage.setItem('jt_v2', JSON.stringify({jobs:[{id:1,vesselName:'x',jobScope:'y',status:'planned'}],persons:[],upcomingJobs:[]})); });
    await p.reload(); await p.waitForTimeout(300);
    await p.setInputFiles('#fileImport', file);
    await p.waitForTimeout(800);
    return p.evaluate(() => JSON.parse(localStorage.getItem('jt_v2')));
  };
  const i1 = await doImport(v1.page);
  const i2 = await doImport(v2.page);
  check('import: stored result identical to v1 import', i1, i2);
  const meta = await v2.page.evaluate(() => jtGetPreImportMeta());
  check('import: safety copy kept before import', !!meta, true);

  // Data written by v2 can be read by v1 (forward/backward compatibility)
  await v2.page.evaluate(() => { const j = JT.jobs.find(x=>x.status==='ongoing'); quickPctChange(j.id, 55); });
  const afterEdit = await v2.page.evaluate(() => localStorage.getItem('jt_v2'));
  const v1b = await load('legacy/index-v1.html');
  await v1b.page.evaluate(d => { localStorage.setItem('jt_v2', d); }, afterEdit);
  await v1b.page.reload(); await v1b.page.waitForTimeout(500);
  const v1reads = await v1b.page.evaluate(() => ({ n: JT.jobs.length, pct: JT.jobs.filter(j=>j.completionPercentage===55).length }));
  check('v1 reads data saved by v2', v1reads.n === input.jobs.length && v1reads.pct >= 1, true);

  check('no runtime errors in v1', v1.errs, []);
  check('no runtime errors in v2', v2.errs, []);
  await browser.close();
  console.log(failures ? `\n${failures} difference(s) found` : '\nAll compatibility checks passed');
  process.exit(failures ? 1 : 0);
})();
