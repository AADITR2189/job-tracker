/* ════════════════════════════════════════════════════════════════════
   Quick search (Ctrl+K), reminder on open, and due-date notifications.
   Loaded after start-up. Read-only towards job data.
   ════════════════════════════════════════════════════════════════════ */

(() => {
  const ov = document.getElementById('paletteModal');
  const input = document.getElementById('paletteInput');
  const list = document.getElementById('paletteList');
  let items = [], sel = 0;
  const DONE = ['complete', 'rework completed', 'cancelled'];

  /* ───────── Quick search ───────── */
  const PAGES = [
    ['dashboard', 'Dashboard', 'dashboard'], ['jobs', 'Jobs', 'briefcase'], ['planning', 'Planning', 'calendar'],
    ['upcoming', 'Upcoming', 'clock'], ['persons', 'Persons', 'users'], ['reports', 'Reports', 'chart'], ['settings', 'Settings & Data', 'settings'],
  ];
  const ACTIONS = [
    { t: 'Add a job', ic: 'plus', run: () => openAddJob() },
    { t: 'Overdue jobs', ic: 'alert', run: () => filterAndGo('overdue') },
    { t: 'Jobs due this week', ic: 'calendar', run: () => { showPage('jobs'); clearJobFilters(); toggleQuickFilter('week'); } },
    { t: 'Export a JSON backup', ic: 'export', run: () => exportData() },
    { t: 'Switch light / dark theme', ic: 'moon', run: () => toggleTheme() },
  ];
  function build(q) {
    q = q.trim().toLowerCase();
    const out = [];
    if(q) {
      const words = q.split(/\s+/);
      const hay = j => `${j.jobNumber || ''} ${j.vesselName || ''} ${j.clientName || ''} ${j.jobScope || ''} ${j.personInCharge || ''}`.toLowerCase();
      const jobs = JT.jobs.filter(j => { const h = hay(j); return words.every(w => h.includes(w)); })
        // Whole phrase matches first, then open jobs, then overdue
        .sort((a, b) => (hay(a).includes(q) ? 0 : 1) - (hay(b).includes(q) ? 0 : 1) || (DONE.includes(a.status) ? 1 : 0) - (DONE.includes(b.status) ? 1 : 0) || (isOverdue(b) ? 1 : 0) - (isOverdue(a) ? 1 : 0));
      jobs.slice(0, 8).forEach(j => out.push({ kind: 'Job', ic: 'briefcase',
        t: `${j.jobNumber ? j.jobNumber + ' · ' : ''}${j.vesselName || '—'}`,
        s: `${j.jobScope || '—'} · ${j.personInCharge || 'Unassigned'} · ${j.status} · ${Math.min(100, j.completionPercentage || 0)}%`,
        over: isOverdue(j), run: () => goToJob(j.id) }));
      if(jobs.length > 8) out.push({ kind: 'More', ic: 'search', t: `Show all ${jobs.length} matching jobs`, s: 'Opens the Jobs page with this search', run: () => {
        showPage('jobs'); clearJobFilters(); document.getElementById('jobSearch').value = q; renderJobsPage(); updateClearBtn(); } });
      JT.persons.filter(p => p.name.toLowerCase().includes(q)).slice(0, 3).forEach(p => out.push({ kind: 'Person', ic: 'users', t: p.name, s: `${p.location} · ${p.position || 'NA'} · show their jobs`, run: () => filterByPerson(p.name) }));
      PAGES.filter(([, n]) => n.toLowerCase().includes(q)).forEach(([id, n, i]) => out.push({ kind: 'Page', ic: i, t: n, s: 'Go to page', run: () => showPage(id) }));
      ACTIONS.filter(a => a.t.toLowerCase().includes(q)).forEach(a => out.push({ kind: 'Action', ic: a.ic, t: a.t, run: a.run }));
    } else {
      ACTIONS.forEach(a => out.push({ kind: 'Action', ic: a.ic, t: a.t, run: a.run }));
      PAGES.forEach(([id, n, i]) => out.push({ kind: 'Page', ic: i, t: n, s: 'Go to page', run: () => showPage(id) }));
    }
    return out;
  }
  function draw() {
    const q = input.value;
    items = build(q);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    const term = q.trim().toLowerCase();
    list.innerHTML = items.length ? items.map((it, i) => `<li id="pal-${i}" role="option" aria-selected="${i === sel}" class="pal-item${it.over ? ' is-over' : ''}" data-i="${i}">
        <span class="pal-ic">${ic(it.ic)}</span>
        <span class="pal-main"><strong>${hl(it.t, term.split(/\s+/)[0])}</strong>${it.s ? `<small>${esc(it.s)}</small>` : ''}</span>
        <span class="pal-kind">${it.over ? 'Overdue' : it.kind}</span></li>`).join('')
      : `<li class="pal-empty" role="option" aria-disabled="true" aria-selected="false">Nothing found for “${esc(q)}”</li>`;
    input.setAttribute('aria-activedescendant', items.length ? 'pal-' + sel : '');
  }
  function move(d) {
    if(!items.length) return;
    sel = (sel + d + items.length) % items.length;
    list.querySelectorAll('.pal-item').forEach((li, i) => li.setAttribute('aria-selected', i === sel));
    input.setAttribute('aria-activedescendant', 'pal-' + sel);
    document.getElementById('pal-' + sel)?.scrollIntoView({ block: 'nearest' });
  }
  function choose(i) {
    const it = items[i]; if(!it) return;
    close();
    setTimeout(() => it.run(), 30);
  }
  function open() {
    if(!ov.classList.contains('hidden')) return;
    input.value = ''; sel = 0; draw();
    ov.classList.remove('hidden');
    setTimeout(() => input.focus({ preventScroll: true }), 80);
  }
  function close() { ov.classList.add('hidden'); }

  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', e => {
    if(e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if(e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if(e.key === 'Enter') { e.preventDefault(); choose(sel); }
    else if(e.key === 'Escape') { e.preventDefault(); close(); }
  });
  list.addEventListener('click', e => { const li = e.target.closest('.pal-item'); if(li) choose(Number(li.dataset.i)); });
  list.addEventListener('pointermove', e => {
    const li = e.target.closest('.pal-item'); if(!li) return;
    const i = Number(li.dataset.i); if(i !== sel) { sel = i; move(0); }
  });
  ov.addEventListener('click', e => { if(e.target === ov) close(); });
  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); ov.classList.contains('hidden') ? open() : close(); }
    else if(e.key === '/' && !typing && !document.querySelector('.overlay:not(.hidden)')) { e.preventDefault(); open(); }
  });

  /* ───────── Reminder when the app opens ───────── */
  function dueSummary(offset) {
    const ds = localDateStr(addDays(new Date(), offset));
    return JT.jobs.filter(j => !DONE.includes(j.status) && j.status !== 'hold' && j.targetDate === ds);
  }
  function remindOnOpen() {
    try { if(sessionStorage.getItem('jt_reminded')) return; sessionStorage.setItem('jt_reminded', '1'); } catch(e) {}
    const dueToday = dueSummary(0).length, overdue = JT.jobs.filter(isOverdue).length;
    if(!dueToday && !overdue) return;
    const parts = [];
    if(dueToday) parts.push(`${dueToday} job${dueToday > 1 ? 's' : ''} due today`);
    if(overdue) parts.push(`${overdue} overdue`);
    showToast(parts.join(' · '), overdue ? 'err' : '', { action: 'View', onAction: () => {
      showPage('jobs'); clearJobFilters();
      if(overdue) toggleQuickFilter('overdue'); else toggleQuickFilter('week');
    } });
  }

  /* ───────── Notifications (due today / tomorrow) ───────── */
  const NKEY = 'jt_notify';
  const supported = () => 'Notification' in window && 'serviceWorker' in navigator;
  const enabled = () => { try { return localStorage.getItem(NKEY) === '1' && Notification.permission === 'granted'; } catch(e) { return false; } };
  function digest() {
    const pick = list => list.slice(0, 4).map(j => j.vesselName || j.jobNumber || 'Job');
    const today = dueSummary(0), tomorrow = dueSummary(1);
    return { date: localDateStr(new Date()), today: today.length, tomorrow: tomorrow.length, todayNames: pick(today), tomorrowNames: pick(tomorrow), overdue: JT.jobs.filter(isOverdue).length };
  }
  const bodyOf = d => [
    d.today ? `Due today (${d.today}): ${d.todayNames.join(', ')}${d.today > d.todayNames.length ? '…' : ''}` : '',
    d.tomorrow ? `Due tomorrow (${d.tomorrow}): ${d.tomorrowNames.join(', ')}${d.tomorrow > d.tomorrowNames.length ? '…' : ''}` : '',
    d.overdue ? `${d.overdue} overdue` : '',
  ].filter(Boolean).join('\n');
  // The service worker reads this copy for background reminders (it cannot read localStorage)
  async function storeDigest() {
    if(!('caches' in window)) return;
    try { const c = await caches.open('jt-notify'); await c.put('due.json', new Response(JSON.stringify(digest()), { headers: { 'Content-Type': 'application/json' } })); } catch(e) {}
  }
  async function notifyNow(force) {
    if(!enabled() && !force) return;
    const d = digest();
    if(!force) {
      if(!d.today && !d.tomorrow) return;
      try { if(localStorage.getItem('jt_notified') === d.date) return; localStorage.setItem('jt_notified', d.date); } catch(e) {}
      try { const c = await caches.open('jt-notify'); await c.put('shown.txt', new Response(d.date)); } catch(e) {}
    }
    const reg = await navigator.serviceWorker?.getRegistration?.();
    const title = force ? 'Job Tracker reminders are on' : 'Job Tracker: jobs due soon';
    const opts = { body: force ? (bodyOf(d) || 'You will be reminded about jobs due today and tomorrow.') : bodyOf(d), tag: 'jt-due', icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png', data: { url: './?page=jobs' } };
    try { if(reg) await reg.showNotification(title, opts); else new Notification(title, opts); } catch(e) { showToast('This browser could not show a notification', 'err'); }
  }
  async function registerBackground() {
    try {
      const reg = await navigator.serviceWorker?.ready;
      if(reg && 'periodicSync' in reg) {
        const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
        if(st.state === 'granted') await reg.periodicSync.register('jt-due-check', { minInterval: 12 * 60 * 60 * 1000 });
      }
    } catch(e) {}
  }
  function renderNotifyUI() {
    const info = document.getElementById('notifyInfo'), btn = document.getElementById('notifyBtn'), test = document.getElementById('notifyTestBtn');
    if(!info || !btn) return;
    if(!supported()) { info.textContent = 'This browser does not support notifications. On iPhone, add the app to the Home Screen first (iOS 16.4 or later).'; btn.hidden = true; return; }
    if(Notification.permission === 'denied') { info.textContent = 'Notifications are blocked for this site. Allow them in your browser’s site settings, then try again.'; btn.hidden = true; test.hidden = true; return; }
    const on = enabled();
    btn.hidden = false;
    btn.innerHTML = `${ic('bell')}${on ? 'Turn off notifications' : 'Turn on notifications'}`;
    btn.classList.toggle('btn-primary', !on);
    test.hidden = !on;
    info.textContent = on
      ? 'On for this device. You get one reminder a day when jobs are due today or tomorrow: when you open the app, and in the background where the browser allows it (installed app on Android or desktop Chrome/Edge).'
      : 'Off on this device. Turn it on separately on each phone or computer.';
  }
  async function toggleNotify() {
    if(enabled()) { try { localStorage.removeItem(NKEY); } catch(e) {} renderNotifyUI(); showToast('Notifications turned off', 'ok'); return; }
    let p = Notification.permission;
    if(p === 'default') { try { p = await Notification.requestPermission(); } catch(e) {} }
    if(p !== 'granted') { renderNotifyUI(); showToast('Notifications were not allowed', 'err'); return; }
    try { localStorage.setItem(NKEY, '1'); } catch(e) {}
    renderNotifyUI();
    await storeDigest(); registerBackground();
    notifyNow(true);
  }

  // Keep the background copy fresh after every change, and check when the app comes back
  const _save = save;
  let digestTimer = null;
  save = function() { _save.apply(this, arguments); if(enabled()) { clearTimeout(digestTimer); digestTimer = setTimeout(storeDigest, 1500); } };
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') notifyNow(false); });
  const _showPage = showPage;
  showPage = function(name) { const r = _showPage.apply(this, arguments); if(name === 'settings') renderNotifyUI(); return r; };

  window.jtPalette = { open, close, toggleNotify, testNotify: () => notifyNow(true) };

  renderNotifyUI();
  if(enabled()) { storeDigest(); registerBackground(); notifyNow(false); }
  setTimeout(remindOnOpen, 1200);
})();
