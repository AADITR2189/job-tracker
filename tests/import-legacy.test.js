/* Imports an early-format backup (only jobs + persons, missing newer fields,
   saved with a UTF-8 BOM) into v2 through the real file picker and checks that
   it restores, renders every page without errors, and exports the same jobs.
   Usage: node tests/import-legacy.test.js [file]   (server on :8080) */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.BASE || 'http://localhost:8080/';
const file = process.argv[2] || path.join(__dirname, 'fixtures/early-format-backup.json');
const input = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
let fail = 0; const ok = (n, c) => { console.log(c ? '✓' : '✗', n); if(!c) fail++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(BASE); await p.waitForTimeout(500);
  await p.setInputFiles('#fileImport', file); await p.waitForTimeout(800);
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('jt_v2')));
  ok('all jobs restored', st.jobs.length === input.jobs.length);
  ok('job records stored unchanged', JSON.stringify(st.jobs) === JSON.stringify(input.jobs));
  ok('persons restored unchanged', JSON.stringify(st.persons) === JSON.stringify(input.persons));
  ok('missing sections default to empty', Array.isArray(st.upcomingJobs) && Array.isArray(st.holidays) && typeof st.personHolidays === 'object');
  for(const pg of ['dashboard','jobs','planning','upcoming','persons','reports','settings']) { await p.evaluate(x => showPage(x), pg); await p.waitForTimeout(250); }
  await p.evaluate(() => { const b = document.querySelector('.jrow-expand'); showPage('jobs'); document.querySelector('.jrow-expand').click(); });
  ok('every page renders without errors', errs.length === 0);
  if(errs.length) console.log(errs);
  await b.close();
  console.log(fail ? `${fail} failure(s)` : 'Legacy import checks passed');
  process.exit(fail ? 1 : 0);
})();
