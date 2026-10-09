/* Two-device cloud sync test against the Firebase emulators.
   Usage (from repo root, server on :8080):
     cd tests/firebase && npx firebase-tools emulators:exec --project demo-jt --only auth,firestore \
       "FIREBASE_LIB_DIR=/path/to/node_modules/firebase node ../sync.test.js"
   FIREBASE_LIB_DIR: folder containing firebase-app.js, firebase-auth.js, firebase-firestore.js
   (from the npm "firebase@10.14.1" package) so the test does not need the CDN. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.BASE || 'http://localhost:8080/';
const LIB = process.env.FIREBASE_LIB_DIR;
const EMAIL = 'owner@example.com', PASS = 'test-pass-123';
const data = fs.readFileSync(process.env.SYNC_DATA || path.join(__dirname, 'fixtures/sample-backup-v1.json'), 'utf8').replace(/^\uFEFF/, '');
const CFG = { apiKey: 'demo-key', authDomain: 'demo-jt.firebaseapp.com', projectId: 'demo-jt', appId: 'demo', emulator: { auth: 'http://127.0.0.1:9099', firestorePort: 8085 } };
let fail = 0; const ok = (n, c, x) => { console.log(c ? '✓' : '✗', n, x ?? ''); if(!c) fail++; };
const until = async (p, fn, arg, ms = 15000) => { try { await p.waitForFunction(fn, arg, { timeout: ms }); return true; } catch(e) { return false; } };

(async () => {
  await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASS, returnSecureToken: true }) });
  await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'stranger@example.com', password: PASS, returnSecureToken: true }) });
  const b = await chromium.launch();
  const device = async (name, viewport, seed) => {
    const ctx = await b.newContext({ viewport, serviceWorkers: 'block' });
    await ctx.route('https://www.gstatic.com/firebasejs/10.14.1/*', r => r.fulfill({ path: path.join(LIB, path.basename(new URL(r.request().url()).pathname)), contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }));
    await ctx.addInitScript(([cfg, seed]) => {
      window.JT_FIREBASE_CONFIG = cfg;
      if(seed && !sessionStorage.seeded) { localStorage.setItem('jt_v2', seed); sessionStorage.seeded = 1; }
    }, [CFG, seed]);
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto(BASE); await p.waitForTimeout(800);
    return { ctx, p, name };
  };
  const signIn = async (p, email = EMAIL) => {
    await p.click('#syncBtn'); await p.waitForSelector('#syncModal:not(.hidden)');
    await p.fill('#syncEmail', email); await p.fill('#syncPassword', PASS); await p.click('#syncSignInBtn');
  };
  const jobs = p => p.evaluate(() => JT.jobs);
  const state = p => p.evaluate(() => jtSync.state.status);

  // PC with real data, phone with sample data
  const pc = await device('pc', { width: 1440, height: 900 }, data);
  const ph = await device('phone', { width: 390, height: 844 }, null);
  ok('sync button visible (signed out)', await pc.p.isVisible('#syncBtn') && await state(pc.p) === 'signed-out');

  // Wrong password message
  await pc.p.click('#syncBtn'); await pc.p.fill('#syncEmail', EMAIL); await pc.p.fill('#syncPassword', 'nope-nope'); await pc.p.click('#syncSignInBtn');
  ok('wrong password shows error', await until(pc.p, () => /Wrong email or password/.test(document.getElementById('syncSignInError').textContent)));
  await pc.p.evaluate(() => closeModal('syncModal'));

  // 1) PC signs in first → account empty → upload
  await signIn(pc.p);
  ok('PC: first sign-in offers upload', await until(pc.p, () => !document.getElementById('syncLinkModal').classList.contains('hidden') && document.getElementById('syncUseCloud').hidden));
  await pc.p.click('#syncUseDevice');
  ok('PC: uploaded, status synced', await until(pc.p, () => jtSync.state.status === 'synced'));
  const pcJobs = await jobs(pc.p);

  // 2) Phone signs in → choose online data → same data as PC
  await signIn(ph.p);
  ok('phone: asked which data to keep', await until(ph.p, () => !document.getElementById('syncLinkModal').classList.contains('hidden') && !document.getElementById('syncUseCloud').hidden));
  await ph.p.click('#syncUseCloud');
  ok('phone: synced', await until(ph.p, () => jtSync.state.status === 'synced'));
  ok('phone has exactly the PC data', JSON.stringify(await ph.p.evaluate(() => ({ j: JT.jobs, p: JT.persons, h: JT.holidays, ph: JT.personHolidays }))) === JSON.stringify(await pc.p.evaluate(() => ({ j: JT.jobs, p: JT.persons, h: JT.holidays, ph: JT.personHolidays }))));
  ok('phone kept a safety copy of its old data', await ph.p.evaluate(() => !!jtGetPreImportMeta()));
  ok('stored copy (jt_v2) on phone matches', await ph.p.evaluate(() => JSON.parse(localStorage.getItem('jt_v2')).jobs.length === JT.jobs.length));

  // 3) Live: edit on PC → appears on phone
  const target = pcJobs.find(j => j.status === 'ongoing').id;
  await pc.p.evaluate(id => quickPctChange(id, 77), target);
  ok('live update PC → phone', await until(ph.p, id => JT.jobs.find(j => j.id === id).completionPercentage === 77, target));
  // phone → PC: add a job
  await ph.p.evaluate(() => { openAddJob(); document.getElementById('fVessel').value = 'Phone Vessel'; document.getElementById('fScope').value = 'From phone'; saveJob(); });
  ok('live update phone → PC (new job)', await until(pc.p, () => JT.jobs.some(j => j.vesselName === 'Phone Vessel')));

  // 4) Simultaneous offline edits merge
  await ph.ctx.setOffline(true);
  const [a, c] = pcJobs.filter(j => j.status === 'planned' || j.status === 'not planned').map(j => j.id);
  await ph.p.evaluate(id => { const j = JT.jobs.find(x => x.id === id); j.remark = 'edited on phone'; save(); }, a);
  await ph.p.evaluate(() => { const d = '2031-01-02'; JT.holidays.push(d); save(); });
  await pc.p.evaluate(id => { const j = JT.jobs.find(x => x.id === id); j.remark = 'edited on PC'; save(); }, c);
  await pc.p.evaluate(() => { JT.persons.push({ id: 5000, name: 'New PC Person', location: 'HO', position: 'NA' }); save(); });
  ok('phone shows offline status', await until(ph.p, () => ['offline','pending'].includes(jtSync.state.status)));
  await until(pc.p, () => jtSync.state.status === 'synced');
  await ph.ctx.setOffline(false);
  await ph.p.evaluate(() => window.dispatchEvent(new Event('online')));
  const merged = await until(pc.p, ([a, c]) => JT.jobs.find(j => j.id === a).remark === 'edited on phone' && JT.jobs.find(j => j.id === c).remark === 'edited on PC' && JT.holidays.includes('2031-01-02') && JT.persons.some(p => p.id === 5000), [a, c], 25000);
  ok('offline edits on both devices merged on PC', merged);
  ok('…and on phone', await until(ph.p, ([a, c]) => JT.jobs.find(j => j.id === a).remark === 'edited on phone' && JT.jobs.find(j => j.id === c).remark === 'edited on PC' && JT.persons.some(p => p.id === 5000), [a, c], 25000));

  // 5) Delete on phone → removed on PC
  await ph.p.evaluate(id => { JT.jobs = JT.jobs.filter(j => j.id !== id); save(); }, c);
  ok('delete syncs', await until(pc.p, id => !JT.jobs.some(j => j.id === id), c));

  // 6) Identical datasets after everything
  await until(pc.p, () => jtSync.state.status === 'synced'); await until(ph.p, () => jtSync.state.status === 'synced');
  const canonOf = p => p.evaluate(() => JSON.stringify(['jobs','persons','upcomingJobs','holidays','workingDays','personHolidays','compensationWorkingDays'].map(k => JT[k])));
  ok('both devices end with identical data', await canonOf(pc.p) === await canonOf(ph.p));

  // 7) Reload: stays signed in, no prompt again, data intact
  await ph.p.reload(); await ph.p.waitForTimeout(500);
  ok('after reload: signed in & synced without asking again', await until(ph.p, () => jtSync.state.status === 'synced') && await ph.p.evaluate(() => document.getElementById('syncLinkModal').classList.contains('hidden')));
  ok('export format unchanged with sync on', await ph.p.evaluate(() => { let t; const o = URL.createObjectURL; URL.createObjectURL = b => { t = b; return o.call(URL, b); }; HTMLAnchorElement.prototype.click = function(){}; exportData(); return t.text(); }).then(txt => Object.keys(JSON.parse(txt)).join() === 'jobs,persons,upcomingJobs,holidays,workingDays,personHolidays,compensationWorkingDays,exportDate'));

  // 8) Security: another account cannot read the owner's data
  const st = await device('stranger', { width: 1200, height: 800 }, null);
  await signIn(st.p, 'stranger@example.com');
  await until(st.p, () => !document.getElementById('syncLinkModal').classList.contains('hidden'));
  const peek = await st.p.evaluate(async uid => { try { const s = await jtSync.state.fb.getDoc(jtSync.state.fb.doc(jtSync.state.db, 'users', uid)); return 'read:' + s.exists(); } catch(e) { return e.code; } }, await pc.p.evaluate(() => jtSync.state.user.uid));
  ok('other accounts are denied access', peek === 'permission-denied', peek);

  // 9) Sign out keeps local data
  const before = (await jobs(pc.p)).length;
  await pc.p.evaluate(() => jtSync.signOut()); await pc.p.waitForTimeout(400);
  ok('sign out keeps data on device', (await jobs(pc.p)).length === before && await state(pc.p) === 'signed-out');

  ok('no runtime errors', [...pc.p.errs, ...ph.p.errs, ...st.p.errs].length === 0, [...pc.p.errs, ...ph.p.errs].join(' | '));
  await b.close();
  console.log(fail ? `${fail} failure(s)` : 'All sync checks passed');
  process.exit(fail ? 1 : 0);
})();
