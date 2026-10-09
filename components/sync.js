/* ════════════════════════════════════════════════════════════════════
   Cloud sync — same data on every device (Firebase Auth + Firestore)
   ────────────────────────────────────────────────────────────────────
   • localStorage 'jt_v2' stays the working copy, so the app keeps
     working offline exactly as before. Every save() is pushed to the
     cloud (debounced); changes from other devices arrive live.
   • The cloud copy is the SAME JSON as a backup file (jt_v2 schema),
     split into ≤900 KB chunks: users/{uid} (meta) + users/{uid}/chunks/{n}.
   • Concurrent edits on two devices are merged per record (by id) with a
     3-way merge against the last synced version; nothing is silently lost.
   • Only the signed-in owner can read or write (see firestore.rules).
   • Firebase is loaded only when sync is configured (sync-config.js).
   ════════════════════════════════════════════════════════════════════ */

const FIREBASE_VERSION = '10.14.1';
const FIREBASE_CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
const SYNC_KEYS = ['jobs','persons','upcomingJobs','holidays','workingDays','personHolidays','compensationWorkingDays'];
const CHUNK_SIZE = 900000; // characters per Firestore document (limit is ~1 MiB)

const jtSync = (() => {
  const S = {
    configured: false, fb: null, auth: null, db: null, user: null,
    status: 'off', error: '', lastSynced: null,
    unsub: null, pushing: false, pushAgain: false, timer: null, retry: null,
    changeCounter: 0, linking: false
  };

  /* ── small helpers ── */
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch(e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch(e) {} },
    del: k => { try { localStorage.removeItem(k); } catch(e) {} }
  };
  const deviceId = (() => {
    let id = ls.get('jt_device_id');
    if(!id) { id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); ls.set('jt_device_id', id); }
    return id;
  })();
  const deviceName = (() => {
    const ua = navigator.userAgent || '';
    if(/iPhone/.test(ua)) return 'iPhone';
    if(/iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iPad';
    if(/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
    if(/Windows/.test(ua)) return 'Windows PC';
    if(/Mac/.test(ua)) return 'Mac';
    return 'Computer';
  })();
  const revKey = () => 'jt_sync_rev:' + S.user.uid;
  const dirtyKey = () => 'jt_sync_dirty:' + S.user.uid;
  const getRev = () => Number(ls.get(revKey()) || 0);
  const isDirty = () => ls.get(dirtyKey()) === '1';

  // The synced dataset: exactly the backup/storage schema, fixed key order
  const canon = d => { const o = {}; SYNC_KEYS.forEach(k => { o[k] = d[k]; }); return jtNormalize(o); };
  const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
  const clone = d => JSON.parse(JSON.stringify(d));

  /* ── IndexedDB: last synced copy (the merge base) — kept out of localStorage to save quota ── */
  const idb = (mode, fn) => new Promise((resolve, reject) => {
    const open = indexedDB.open('jt-sync', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('kv', mode);
      const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => { resolve(req && req.result); open.result.close(); };
      tx.onerror = () => reject(tx.error);
    };
  });
  const baseGet = () => idb('readonly', s => s.get('base:' + S.user.uid)).catch(() => null);
  const baseSet = d => idb('readwrite', s => s.put(JSON.stringify(d), 'base:' + S.user.uid)).catch(() => {});

  /* ── 3-way merge (base = last synced, local = this device, remote = cloud) ── */
  function mergeList(base, local, remote) {
    const key = x => x && x.id;
    const B = new Map((base || []).map(x => [key(x), x]));
    const L = new Map((local || []).map(x => [key(x), x]));
    const out = (remote || []).map(x => x);
    const idx = new Map(out.map((x, i) => [key(x), i]));
    const added = [];
    for(const [id, item] of L) {
      if(!B.has(id)) {                                   // added on this device
        if(!idx.has(id)) added.push(item);
        else if(JSON.stringify(out[idx.get(id)]) !== JSON.stringify(item)) added.push({ ...item, __newId: true });
      } else if(JSON.stringify(B.get(id)) !== JSON.stringify(item)) {   // edited on this device
        if(idx.has(id)) out[idx.get(id)] = item; else added.push(item);
      }
    }
    const deleted = new Set([...B.keys()].filter(id => !L.has(id)));   // deleted on this device
    return [...added, ...out.filter(x => !deleted.has(key(x)))];
  }
  function mergeSet(base, local, remote) {
    const B = new Set(base || []), L = new Set(local || []);
    const res = new Set(remote || []);
    L.forEach(v => { if(!B.has(v)) res.add(v); });
    B.forEach(v => { if(!L.has(v)) res.delete(v); });
    return [...res];
  }
  function mergeMap(base, local, remote) {
    const out = {};
    const keys = new Set([...Object.keys(remote || {}), ...Object.keys(local || {}), ...Object.keys(base || {})]);
    keys.forEach(k => {
      const v = mergeSet((base || {})[k], (local || {})[k], (remote || {})[k]);
      if(v.length || (remote && k in remote) || (local && k in local && !(base && k in base))) out[k] = v;
    });
    return out;
  }
  function merge(base, local, remote) {
    if(!base) return canon(remote);                       // no common ancestor: keep the cloud copy
    base = canon(base); local = canon(local); remote = canon(remote);
    const m = {
      jobs: mergeList(base.jobs, local.jobs, remote.jobs),
      persons: mergeList(base.persons, local.persons, remote.persons),
      upcomingJobs: mergeList(base.upcomingJobs, local.upcomingJobs, remote.upcomingJobs),
      holidays: mergeSet(base.holidays, local.holidays, remote.holidays),
      workingDays: mergeSet(base.workingDays, local.workingDays, remote.workingDays),
      personHolidays: mergeMap(base.personHolidays, local.personHolidays, remote.personHolidays),
      compensationWorkingDays: mergeMap(base.compensationWorkingDays, local.compensationWorkingDays, remote.compensationWorkingDays)
    };
    // Two devices created a record with the same id while offline: give the local one a fresh id
    let max = Math.max(0, ...['jobs','persons','upcomingJobs'].flatMap(k => m[k].map(x => Number(x.id) || 0)));
    ['jobs','persons','upcomingJobs'].forEach(k => m[k].forEach(x => { if(x.__newId) { delete x.__newId; x.id = ++max; } }));
    return m;
  }

  /* ── Firestore I/O ── */
  const metaRef = () => S.fb.doc(S.db, 'users', S.user.uid);
  const chunkRef = i => S.fb.doc(S.db, 'users', S.user.uid, 'chunks', String(i));
  const split = s => { const out = []; for(let i = 0; i < s.length; i += CHUNK_SIZE) out.push(s.slice(i, i + CHUNK_SIZE)); return out.length ? out : ['']; };

  async function readRemote(meta, getter) {
    const parts = [];
    for(let i = 0; i < meta.chunks; i++) {
      const snap = await getter(chunkRef(i));
      const c = snap.exists() ? snap.data() : null;
      if(!c || c.rev !== meta.rev) throw new Error('chunk-mismatch');
      parts.push(c.d);
    }
    return canon(JSON.parse(parts.join('')));
  }

  /* ── apply cloud data on this device (never triggers a push) ── */
  function applyLocal(data) {
    JT = jtNormalize(clone(data));
    try { localStorage.setItem('jt_v2', JSON.stringify(JT)); } catch(e) { console.warn(e); }
    if(typeof renderAll === 'function') renderAll();
  }

  /* ── status / UI ── */
  function setStatus(st, err) {
    S.status = st; S.error = err || '';
    if(st === 'synced') { S.lastSynced = new Date(); ls.set('jt_sync_last', S.lastSynced.toISOString()); }
    renderSyncUI();
  }

  /* ── push local changes ── */
  async function push(opts = {}) {
    if(!S.user || S.linking) return;
    if(S.pushing) { S.pushAgain = true; return; }
    if(navigator.onLine === false) { setStatus('offline'); return; }
    S.pushing = true; S.pushAgain = false;
    setStatus('syncing');
    const counterAtStart = S.changeCounter;
    try {
      const base = opts.force ? null : JSON.parse((await baseGet()) || 'null');
      const baseRev = getRev();
      let result = null;
      await S.fb.runTransaction(S.db, async tx => {
        const metaSnap = await tx.get(metaRef());
        const meta = metaSnap.exists() ? metaSnap.data() : null;
        let data = canon(JT);
        let merged = false;
        if(meta && !opts.force && meta.rev !== baseRev) {
          const remote = await readRemote(meta, r => tx.get(r));
          data = merge(base, data, remote);
          merged = true;
        } else if(meta && !opts.force && base && same(data, base)) {
          result = { rev: meta.rev, data, merged: false };   // nothing new to upload
          return;
        }
        const json = JSON.stringify(data);
        const parts = split(json);
        const rev = (meta ? meta.rev : 0) + 1;
        parts.forEach((d, i) => tx.set(chunkRef(i), { d, rev }));
        for(let i = parts.length; i < (meta ? meta.chunks : 0); i++) tx.delete(chunkRef(i));
        tx.set(metaRef(), {
          rev, chunks: parts.length, size: json.length, schema: 'jt_v2',
          jobs: data.jobs.length, persons: data.persons.length,
          device: deviceId, deviceName, updatedAt: S.fb.serverTimestamp()
        });
        result = { rev, data, merged };
      });
      await baseSet(result.data);
      ls.set(revKey(), String(result.rev));
      if(S.changeCounter === counterAtStart) {
        ls.del(dirtyKey());
        if(result.merged && !same(result.data, JT)) applyLocal(result.data);
      } else {
        S.pushAgain = true; // more edits arrived meanwhile: push again (merges cleanly)
      }
      setStatus(isDirty() ? 'pending' : 'synced');
    } catch(e) {
      console.warn('Sync push failed', e);
      const offline = navigator.onLine === false || /unavailable|network|offline/i.test(e.code || e.message || '');
      setStatus(offline ? 'offline' : 'error', offline ? '' : friendlyError(e));
      clearTimeout(S.retry);
      S.retry = setTimeout(() => push(), offline ? 20000 : 30000);
    } finally {
      S.pushing = false;
      if(S.pushAgain) { S.pushAgain = false; setTimeout(() => push(), 50); }
      else if(S.skipped) {
        const m = S.skipped; S.skipped = null;
        if(m.rev > getRev()) { if(isDirty()) push(); else pull(m); }
      }
    }
  }

  /* ── pull changes made on another device ── */
  async function pull(meta, attempt = 0) {
    if(!S.user || S.pushing || S.linking) return;
    const counterAtStart = S.changeCounter;
    setStatus('syncing');
    try {
      const remote = await readRemote(meta, r => S.fb.getDoc(r));
      if(S.changeCounter !== counterAtStart || isDirty()) { push(); return; }  // local edits: merge instead
      await baseSet(remote);
      ls.set(revKey(), String(meta.rev));
      if(!same(remote, JT)) {
        applyLocal(remote);
        if(meta.device !== deviceId) showToast(`Updated with changes from ${meta.deviceName || 'another device'}`, 'ok');
      }
      setStatus('synced');
    } catch(e) {
      if(e.message === 'chunk-mismatch' && attempt < 5) { setTimeout(() => pull(meta, attempt + 1), 600); return; }
      console.warn('Sync pull failed', e);
      setStatus(navigator.onLine === false ? 'offline' : 'error', friendlyError(e));
    }
  }

  function listen() {
    if(S.unsub) S.unsub();
    S.unsub = S.fb.onSnapshot(metaRef(), snap => {
      if(snap.metadata.hasPendingWrites || !snap.exists()) return;
      const meta = snap.data();
      if(S.pushing) { S.skipped = meta; return; }  // an upload is in progress; re-checked when it finishes
      if(meta.rev === getRev()) { if(!isDirty() && S.status !== 'synced' && !S.pushing) setStatus('synced'); return; }
      if(isDirty()) push(); else pull(meta);
    }, err => { console.warn('Sync listener', err); setStatus(navigator.onLine === false ? 'offline' : 'error', friendlyError(err)); });
  }

  /* ── first sign-in on a device: decide which copy wins ── */
  async function linkDevice() {
    S.linking = true;
    setStatus('syncing');
    let meta = null, remote = null;
    try {
      const snap = await S.fb.getDoc(metaRef());
      meta = snap.exists() ? snap.data() : null;
      if(meta) remote = await readRemote(meta, r => S.fb.getDoc(r));
    } catch(e) {
      S.linking = false;
      setStatus(navigator.onLine === false ? 'offline' : 'error', friendlyError(e));
      return;
    }
    if(meta && same(remote, JT)) {               // already identical
      await baseSet(remote); ls.set(revKey(), String(meta.rev));
      S.linking = false; listen(); setStatus('synced');
      return;
    }
    showLinkChoice(meta, remote);
  }

  async function chooseCloud() {
    const meta = S._pendingMeta, remote = S._pendingRemote;
    closeModal('syncLinkModal');
    if(JT.jobs.length || JT.persons.length) jtSnapshotBeforeImport(JT, 'this device before sync');
    applyLocal(remote);
    await baseSet(remote); ls.set(revKey(), String(meta.rev)); ls.del(dirtyKey());
    S.linking = false; listen(); setStatus('synced');
    if(typeof renderSettingsInfo === 'function') renderSettingsInfo();
    showToast(`Loaded ${remote.jobs.length} jobs from your account. Your previous data on this device can be restored from Settings.`, 'ok');
  }
  async function chooseDevice() {
    closeModal('syncLinkModal');
    S.linking = false;
    ls.set(dirtyKey(), '1');
    await push({ force: true });
    listen();
    if(S.status === 'synced') showToast(`Uploaded ${JT.jobs.length} jobs to your account`, 'ok');
  }
  function cancelLink() {
    closeModal('syncLinkModal');
    S.linking = false;
    signOutUser(true);
  }

  function showLinkChoice(meta, remote) {
    S._pendingMeta = meta; S._pendingRemote = remote;
    const n = d => `${d.jobs.length} jobs, ${d.persons.length} persons`;
    const when = meta && meta.updatedAt && meta.updatedAt.toDate ? meta.updatedAt.toDate().toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
    const body = document.getElementById('syncLinkBody');
    const cloudBtn = document.getElementById('syncUseCloud');
    const devBtn = document.getElementById('syncUseDevice');
    if(!meta) {
      body.innerHTML = `<p>Your account has no data yet. Upload this device's data (<strong>${n(JT)}</strong>) to start syncing? Other devices that sign in will then get the same data.</p>`;
      cloudBtn.hidden = true;
      devBtn.innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-export"/></svg>Upload this device's data`;
    } else {
      body.innerHTML = `<p>This device and your account have different data. Which one should be kept?</p>
        <ul class="status-list">
          <li class="info"><svg class="ic" aria-hidden="true"><use href="#i-cloud"/></svg><span><strong>Online:</strong> ${n(remote)}${when ? `, last changed ${when}` : ''}${meta.deviceName ? ` on ${esc(meta.deviceName)}` : ''}</span></li>
          <li class="info"><svg class="ic" aria-hidden="true"><use href="#i-monitor"/></svg><span><strong>This device:</strong> ${n(JT)}</span></li>
        </ul>
        <p class="form-note">Usually choose <strong>Use online data</strong> on a new device. The data you don't keep on this device is saved as a safety copy (Settings → Undo). Tip: export a JSON backup first if unsure.</p>`;
      cloudBtn.hidden = false;
      devBtn.innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-export"/></svg>Replace online data with this device's`;
    }
    openModal('syncLinkModal');
  }

  /* ── auth ── */
  function friendlyError(e) {
    const c = (e && (e.code || e.message)) || '';
    if(/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/.test(c)) return 'Wrong email or password.';
    if(/too-many-requests/.test(c)) return 'Too many attempts. Wait a few minutes and try again.';
    if(/network|unavailable|offline/.test(c)) return 'No connection to the sync service. Check your internet.';
    if(/permission-denied/.test(c)) return 'The sync service refused access. Check the Firestore security rules.';
    if(/user-disabled/.test(c)) return 'This account is disabled.';
    return 'Sync problem: ' + c;
  }

  async function signIn() {
    const email = document.getElementById('syncEmail').value.trim();
    const pass = document.getElementById('syncPassword').value;
    if(!validateForm('syncModal')) return;
    const btn = document.getElementById('syncSignInBtn');
    btn.disabled = true;
    try {
      await init();
      await S.fb.signInWithEmailAndPassword(S.auth, email, pass);
      closeModal('syncModal');
      document.getElementById('syncPassword').value = '';
    } catch(e) {
      const msg = friendlyError(e);
      document.getElementById('syncSignInError').textContent = msg;
      announce(msg, true);
    } finally { btn.disabled = false; }
  }

  async function resetPassword() {
    const email = document.getElementById('syncEmail').value.trim();
    if(!email) { document.getElementById('syncSignInError').textContent = 'Enter your email first, then tap "Forgot password".'; return; }
    try { await init(); await S.fb.sendPasswordResetEmail(S.auth, email); showToast('Password reset email sent', 'ok'); }
    catch(e) { document.getElementById('syncSignInError').textContent = friendlyError(e); }
  }

  async function signOutUser(silent) {
    if(S.unsub) { S.unsub(); S.unsub = null; }
    if(S.auth) await S.fb.signOut(S.auth).catch(() => {});
    if(!silent) showToast('Signed out. Data stays on this device; it will no longer sync.');
  }

  async function onUser(user) {
    S.user = user;
    if(!user) { if(S.unsub) { S.unsub(); S.unsub = null; } setStatus('signed-out'); return; }
    const last = ls.get('jt_sync_last'); if(last) S.lastSynced = new Date(last);
    if(!ls.get(revKey())) { await linkDevice(); return; }
    listen();
    if(isDirty()) push(); else setStatus('synced');
  }

  /* ── boot ── */
  let _initPromise = null;
  function init() {
    if(_initPromise) return _initPromise;
    _initPromise = (async () => {
      const cfg = window.JT_FIREBASE_CONFIG;
      const [app, auth, fs] = await Promise.all([
        import(FIREBASE_CDN + 'firebase-app.js'),
        import(FIREBASE_CDN + 'firebase-auth.js'),
        import(FIREBASE_CDN + 'firebase-firestore.js')
      ]);
      S.fb = { ...app, ...auth, ...fs };
      const fbApp = app.initializeApp(cfg);
      S.auth = auth.initializeAuth(fbApp, { persistence: [auth.indexedDBLocalPersistence, auth.browserLocalPersistence] });
      S.db = fs.getFirestore(fbApp);
      if(cfg.emulator) { // automated tests only
        auth.connectAuthEmulator(S.auth, cfg.emulator.auth, { disableWarnings: true });
        fs.connectFirestoreEmulator(S.db, cfg.emulator.host || '127.0.0.1', cfg.emulator.firestorePort);
      }
      auth.onAuthStateChanged(S.auth, onUser);
    })();
    _initPromise.catch(e => {
      _initPromise = null;
      console.warn('Sync failed to start', e);
      setStatus(navigator.onLine === false ? 'offline' : 'error', 'Could not load the sync service. ' + (navigator.onLine === false ? 'You are offline.' : 'Check your connection.'));
    });
    return _initPromise;
  }

  function start() {
    S.configured = !!(window.JT_FIREBASE_CONFIG && window.JT_FIREBASE_CONFIG.apiKey);
    if(!S.configured) { setStatus('off'); return; }
    setStatus('connecting');
    init();
    window.addEventListener('online', () => { if(!S.user) return; if(isDirty()) push(); else listen(); });
    window.addEventListener('offline', () => { if(S.user) setStatus('offline'); });
    document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible' && S.user && isDirty()) push(); });
  }

  /* ── called by save() in app.js after every local change ── */
  function localChanged() {
    if(!S.user || S.linking) return;
    S.changeCounter++;
    ls.set(dirtyKey(), '1');
    setStatus('pending');
    clearTimeout(S.timer);
    S.timer = setTimeout(() => push(), 1200);
  }

  function syncNow() {
    if(!S.user) { openSyncSignIn(); return; }
    if(isDirty()) push();
    else { setStatus('syncing'); S.fb.getDoc(metaRef()).then(s => { if(s.exists() && s.data().rev !== getRev()) pull(s.data()); else setStatus('synced'); }).catch(e => setStatus('error', friendlyError(e))); }
  }

  return { start, localChanged, signIn, signOut: () => signOutUser(false), resetPassword, syncNow, chooseCloud, chooseDevice, cancelLink, state: S, merge, deviceName };
})();

/* ── UI (topbar button + Settings card) ── */
function openSyncSignIn() {
  if(!jtSync.state.configured) { showPage('settings'); document.getElementById('syncCard')?.scrollIntoView({ block: 'center' }); return; }
  document.getElementById('syncSignInError').textContent = '';
  openModal('syncModal');
}
function onSyncButton() {
  const st = jtSync.state.status;
  if(st === 'signed-out') openSyncSignIn();
  else { showPage('settings'); setTimeout(() => document.getElementById('syncCard')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50); }
}

function renderSyncUI() {
  const S = jtSync.state;
  const labels = {
    off: 'Sync not set up', connecting: 'Connecting…', 'signed-out': 'Sync off — sign in',
    syncing: 'Syncing…', synced: 'Synced', pending: 'Saving…', offline: 'Offline — will sync', error: 'Sync problem'
  };
  const btn = document.getElementById('syncBtn');
  if(btn) {
    btn.hidden = S.status === 'off';
    btn.dataset.state = S.status;
    btn.setAttribute('aria-label', labels[S.status] + (S.lastSynced && S.status === 'synced' ? `, last synced ${S.lastSynced.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}` : '') + '. Sync settings');
    btn.title = labels[S.status];
    const t = btn.querySelector('.sync-label'); if(t) t.textContent = labels[S.status];
  }
  const card = document.getElementById('syncCardBody');
  if(!card) return;
  const time = d => d ? d.toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : 'never';
  if(S.status === 'off') {
    card.innerHTML = `<p class="settings-desc">Sync is not set up yet. Each device currently keeps its own copy. Once the online account is connected (see <strong>docs/SYNC-SETUP.md</strong>), sign in here on your phone and PC to share the same data live.</p>`;
  } else if(!S.user) {
    card.innerHTML = `<p class="settings-desc">Sign in on each device (phone and PC) with the same account to keep the same data everywhere. Changes appear on the other device within seconds, and the app still works offline.</p>
      ${S.error ? `<p class="field-error">${esc(S.error)}</p>` : ''}
      <div class="btn-row"><button type="button" class="btn btn-primary" onclick="openSyncSignIn()"><svg class="ic" aria-hidden="true"><use href="#i-cloud"/></svg>Sign in to sync</button></div>`;
  } else {
    const cls = { synced:'ok', syncing:'info', pending:'info', connecting:'info', offline:'warn', error:'warn' }[S.status] || 'info';
    const icon = cls === 'ok' ? 'check-circle' : cls === 'warn' ? 'alert' : 'cloud';
    card.innerHTML = `<ul class="status-list">
        <li class="${cls}"><svg class="ic" aria-hidden="true"><use href="#i-${icon}"/></svg><span><strong>${labels[S.status]}</strong>${S.error ? ' — ' + esc(S.error) : ''}</span></li>
        <li class="info"><svg class="ic" aria-hidden="true"><use href="#i-users"/></svg><span>Signed in as <strong>${esc(S.user.email || '')}</strong> on this ${esc(jtSync.deviceName)}</span></li>
        <li class="info"><svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg><span>Last synced: ${time(S.lastSynced)}</span></li>
      </ul>
      <div class="btn-row">
        <button type="button" class="btn" onclick="jtSync.syncNow()"><svg class="ic" aria-hidden="true"><use href="#i-rework"/></svg>Sync now</button>
        <button type="button" class="btn btn-ghost" onclick="jtSync.signOut()">Sign out</button>
      </div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => setTimeout(() => jtSync.start(), 0));
