/* Checks the animation layer (components/motion.js) and that it changes nothing about data.
   Usage: node tests/motion.test.js   (server on :8080) */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.BASE || 'http://localhost:8080/';
const data = fs.readFileSync(path.join(__dirname, 'fixtures/sample-backup-v1.json'), 'utf8');
let fail = 0; const ok = (n, c, x) => { console.log(c ? '✓' : '✗', n, x ?? ''); if(!c) fail++; };
(async () => {
  const b = await chromium.launch();
  const mk = async (opts = {}) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', ...opts });
    await ctx.addInitScript(d => { if(!sessionStorage.seeded) { localStorage.setItem('jt_v2', d); sessionStorage.seeded = 1; } }, data);
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto(BASE); return { ctx, p };
  };
  const { ctx, p } = await mk();

  // 1 launch
  ok('launch screen shown on open', await p.locator('#launch').count() === 1);
  await p.waitForSelector('#launch', { state: 'detached', timeout: 3000 }).catch(() => {});
  ok('launch screen removed within ~1s', await p.locator('#launch').count() === 0);
  await p.reload(); await p.waitForTimeout(150);
  ok('launch shown only once per session', !(await p.isVisible('#launch')));
  await p.waitForTimeout(400);

  // 2 page transition
  await p.evaluate(() => showPage('jobs')); await p.waitForTimeout(450);
  ok('page transition completes on Jobs', await p.isVisible('#page-jobs') && !(await p.evaluate(() => document.documentElement.classList.contains('vt-page'))));

  // 9 tab indicator follows active tab
  await p.click('#jobsTabBar [data-tab="complete"]'); await p.waitForTimeout(400);
  const pos = await p.evaluate(() => { const a = document.querySelector('#jobsTabBar .tab-btn.active'), i = document.querySelector('.tab-ind'); return [a.offsetLeft, a.offsetWidth, i.style.transform, i.style.width]; });
  ok('tab indicator slides to the selected tab', pos[2].includes(pos[0] + 'px') && pos[3] === pos[1] + 'px', JSON.stringify(pos));
  await p.click('#jobsTabBar [data-tab="all"]'); await p.waitForTimeout(350);

  // 6/7 progress animation + edit glow
  const id = await p.evaluate(() => JT.jobs.find(j => j.status === 'ongoing').id);
  await p.fill('#jobSearch', await p.evaluate(i => JT.jobs.find(j => j.id === i).jobScope, id)); await p.waitForTimeout(300);
  await p.evaluate(i => quickPctChange(i, 63), id); await p.waitForTimeout(120);
  ok('edited row glows', await p.evaluate(i => document.getElementById('jcard-' + i)?.classList.contains('flash'), id));
  ok('progress animates (animation running)', await p.evaluate(i => document.querySelector('#jcard-' + i + ' .mini-progress > span').getAnimations().length > 0, id));
  await p.waitForTimeout(800);
  ok('progress ends at the new value', await p.evaluate(i => document.querySelector('#jcard-' + i + ' .mini-pct').textContent === '63%', id));

  // 7 new row glow
  await p.fill('#jobSearch', 'Motion Test'); await p.waitForTimeout(200);
  await p.evaluate(() => { openAddJob(); document.getElementById('fVessel').value = 'Motion Test'; saveJob(); });
  await p.waitForTimeout(150);
  ok('new row glows', await p.evaluate(() => !!document.querySelector('.jrow.glow-new')));

  // 7 delete fold → job really deleted, same as before
  const newId = await p.evaluate(() => JT.jobs.find(j => j.vesselName === 'Motion Test').id);
  const n0 = await p.evaluate(() => JT.jobs.length);
  await p.evaluate(i => deleteJob(i), newId); await p.waitForTimeout(150);
  ok('row folds away before delete', await p.evaluate(i => !!document.getElementById('jcard-' + i) && document.getElementById('jcard-' + i).getAnimations().length > 0, newId));
  await p.waitForTimeout(500);
  ok('job deleted and saved', await p.evaluate(([i, n]) => JT.jobs.length === n - 1 && !JSON.parse(localStorage.getItem('jt_v2')).jobs.some(j => j.id === i), [newId, n0]));
  let dialogs = 0; p.on('dialog', () => dialogs++);
  const n1 = await p.evaluate(() => JT.jobs.length);
  await p.evaluate(() => { window.confirm = () => false; deleteJob(JT.jobs[0].id); });
  await p.waitForTimeout(500);
  ok('cancelling delete keeps the job', await p.evaluate(n => JT.jobs.length === n, n1));
  await p.evaluate(() => { delete window.confirm; });

  // 5 celebration on completion
  await p.fill('#jobSearch', '');
  const cid = await p.evaluate(() => JT.jobs.find(j => j.status === 'planned').id);
  await p.evaluate(i => openCompletionDate(i, 'complete'), cid); await p.waitForTimeout(150);
  await p.evaluate(() => confirmCompletion()); await p.waitForTimeout(100);
  ok('completion shows celebration', await p.locator('.celebrate').count() === 1);
  ok('completion data saved as before', await p.evaluate(i => { const j = JT.jobs.find(x => x.id === i); return j.status === 'complete' && j.completionPercentage === 100 && !!j.completionDate; }, cid));
  await p.waitForTimeout(1500);
  ok('celebration cleans itself up', await p.locator('.celebrate').count() === 0);

  // 8 planning slide
  await p.evaluate(() => showPage('planning')); await p.waitForTimeout(450);
  await p.evaluate(() => planShift(1)); await p.waitForTimeout(30);
  ok('planning week slides', await p.evaluate(() => document.querySelector('#planTable td.pc').getAnimations().length > 0));
  await p.evaluate(() => planToday()); await p.waitForTimeout(400);
  ok('planning back to this week', await p.evaluate(() => planWeekOffset === 0));

  // 3 theme reveal
  await p.click('#themeToggle'); await p.waitForTimeout(650);
  ok('theme switches with reveal and finishes', await p.evaluate(() => document.documentElement.dataset.theme === 'dark' && !document.documentElement.classList.contains('vt-theme')));

  // 4 sync button markup present (sync states covered by sync.test.js)
  ok('sync button has animated icons', await p.locator('#syncBtn .sync-spin').count() === 1 && await p.locator('#syncBtn .sync-ok').count() === 1);

  ok('no runtime errors', p.errs.length === 0, p.errs.join(' | '));

  // Reduced motion: everything off, behaviour identical
  const r = await mk({ reducedMotion: 'reduce' });
  ok('reduced motion: no launch screen', !(await r.p.isVisible('#launch')));
  await r.p.waitForTimeout(300);
  const rid = await r.p.evaluate(() => JT.jobs.find(j => j.status === 'planned').id);
  await r.p.evaluate(i => { openCompletionDate(i, 'complete'); confirmCompletion(); }, rid); await r.p.waitForTimeout(100);
  ok('reduced motion: no celebration', await r.p.locator('.celebrate').count() === 0);
  const dn = await r.p.evaluate(() => JT.jobs.length);
  await r.p.evaluate(() => deleteJob(JT.jobs[1].id)); await r.p.waitForTimeout(50);
  ok('reduced motion: delete is immediate', await r.p.evaluate(n => JT.jobs.length === n - 1, dn));
  ok('reduced motion: no runtime errors', r.p.errs.length === 0, r.p.errs.join(' | '));
  await b.close();
  console.log(fail ? `${fail} failure(s)` : 'All motion checks passed');
  process.exit(fail ? 1 : 0);
})();
