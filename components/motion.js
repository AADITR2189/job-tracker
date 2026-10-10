/* ════════════════════════════════════════════════════════════════════
   Motion layer — presentation only. Loaded by app.js after window load.
   Wraps existing UI functions to add animation around them; it never
   changes what they do to data. Everything is skipped when the user
   prefers reduced motion. Loaded after app.js.
     1  Launch animation              7  Job list: new/edited glow, delete fold
     2  Page transitions              8  Planning week slide
     3  Theme circular reveal         9  Sliding status-tab indicator
     4  Sync button states (CSS)     10  Overdue alert shake (CSS)
     5  Completion celebration       11  Empty-state illustration motion (CSS)
     6  Smooth progress changes
   ════════════════════════════════════════════════════════════════════ */

(() => {
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canVT = () => typeof document.startViewTransition === 'function' && !reduced();
  const EASE = 'cubic-bezier(.16, 1, .3, 1)';
  // Loaded after the page is ready (see app.js), but safe either way
  const onReady = fn => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn());

  /* ── 1. Launch animation: markup + CSS; removed by finishLaunch() in app.js boot() ── */

  /* ── 2. Page transitions (View Transitions API, directional) ─────── */
  const ORDER = ['dashboard','jobs','planning','upcoming','persons','reports','settings'];
  const currentPage = () => (document.querySelector('.page.active') || {}).id?.replace('page-','');
  const _showPage = showPage;
  showPage = function(name, btn) {
    const from = currentPage();
    if(!canVT() || !from || from === name || document.getElementById('launch')) return _showPage(name, btn);
    const root = document.documentElement;
    root.dataset.navDir = ORDER.indexOf(name) >= ORDER.indexOf(from) ? 'fwd' : 'back';
    root.classList.add('vt-page');
    let t;
    try { t = document.startViewTransition(() => _showPage(name, btn)); }
    catch(e) { root.classList.remove('vt-page'); return _showPage(name, btn); }
    t.finished.finally(() => root.classList.remove('vt-page'));
  };

  /* ── 3. Theme switch: circular reveal from the button ────────────── */
  let lastPoint = null;
  document.addEventListener('pointerdown', e => {
    if(e.target.closest && e.target.closest('#themeToggle, [data-theme-opt]')) lastPoint = { x: e.clientX, y: e.clientY };
  }, { passive: true, capture: true });
  const _applyTheme = applyTheme;
  applyTheme = function(pref, animate) {
    const next = resolveTheme(pref);
    const changing = next !== document.documentElement.getAttribute('data-theme');
    if(!animate || !changing || !canVT()) return _applyTheme(pref, animate);
    const p = lastPoint || (() => {
      const b = document.getElementById('themeToggle')?.getBoundingClientRect();
      return b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : { x: innerWidth - 40, y: 30 };
    })();
    lastPoint = null;
    const r = Math.hypot(Math.max(p.x, innerWidth - p.x), Math.max(p.y, innerHeight - p.y));
    const root = document.documentElement;
    root.classList.add('vt-theme');
    const t = document.startViewTransition(() => _applyTheme(pref, false));
    t.ready.then(() => {
      root.animate({ clipPath: [`circle(0px at ${p.x}px ${p.y}px)`, `circle(${r}px at ${p.x}px ${p.y}px)`] },
        { duration: 480, easing: 'cubic-bezier(.4, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' });
    }).catch(() => {});
    t.finished.finally(() => root.classList.remove('vt-theme'));
  };

  /* ── 5. Completion celebration ───────────────────────────────────── */
  function celebrate() {
    if(reduced()) return;
    const layer = document.createElement('div');
    layer.className = 'celebrate';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = `<div class="celebrate-check"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></div>`;
    document.body.appendChild(layer);
    const colors = ['#2E3D28', '#A9B887', '#F59E0B', '#22C55E', '#6F8A55', '#E8E9DF'];
    const cx = innerWidth / 2, cy = innerHeight / 2;
    for(let i = 0; i < 28; i++) {
      const s = document.createElement('i');
      s.style.background = colors[i % colors.length];
      s.style.left = cx + 'px'; s.style.top = cy + 'px';
      if(i % 3 === 0) s.style.borderRadius = '50%';
      layer.appendChild(s);
      const ang = (Math.PI * 2 * i) / 28 + Math.random() * .4;
      const dist = 90 + Math.random() * 130;
      const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist;
      s.animate([
        { transform: 'translate(-50%,-50%) scale(.4) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(${Math.random() * 360}deg)`, opacity: 1, offset: .6 },
        { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy + 70}px)) scale(.8) rotate(${Math.random() * 540}deg)`, opacity: 0 }
      ], { duration: 900 + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
    }
    setTimeout(() => layer.remove(), 1400);
  }
  const _confirmCompletion = confirmCompletion;
  confirmCompletion = function() {
    const id = _completionJobId;
    const before = JT.jobs.find(j => j.id === id);
    const was = before && before.status;
    _confirmCompletion.apply(this, arguments);
    const after = JT.jobs.find(j => j.id === id);
    if(after && was !== after.status && ['complete', 'rework completed'].includes(after.status)) celebrate();
  };

  /* ── 6 & 7. Job list: smooth progress, glow for new / edited rows ── */
  const pctMem = new Map(), sigMem = new Map();
  let knownIds = null;
  const pctOf = j => Math.min(100, j.completionPercentage || 0);
  function processRow(row) {
    const id = Number(row.id.slice(6));
    const job = JT.jobs.find(j => j.id === id);
    if(!job) return;
    const sig = JSON.stringify(job);
    const pct = pctOf(job);
    if(!reduced()) {
      const oldPct = pctMem.get(id);
      if(oldPct !== undefined && oldPct !== pct) {
        const opts = { duration: 900, easing: 'cubic-bezier(.45, 0, .2, 1)' };  // gentle ease-in-out glide
        const barAnim = row.querySelector('.mini-progress > span')?.animate([{ width: oldPct + '%' }, { width: pct + '%' }], opts);
        row.querySelector('.jrow-progress')?.animate([{ width: oldPct + '%' }, { width: pct + '%' }], opts);
        const label = row.querySelector('.mini-pct');
        if(label && barAnim) {
          // The number follows the bar exactly (same easing, same clock)
          const step = () => {
            const t = barAnim.effect.getComputedTiming().progress;
            const done = t === null || barAnim.playState === 'finished';
            label.textContent = Math.round(done ? pct : oldPct + (pct - oldPct) * t) + '%';
            if(!done && label.isConnected) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      }
      const isNew = knownIds && !knownIds.has(id);
      const isEdited = sigMem.has(id) && sigMem.get(id) !== sig;
      if(isNew || isEdited) {
        row.classList.remove('flash', 'glow-new');
        void row.offsetWidth;
        row.classList.add(isNew ? 'glow-new' : 'flash');
        setTimeout(() => row.classList.remove('flash', 'glow-new'), 2500);
      }
    }
    pctMem.set(id, pct); sigMem.set(id, sig);
  }
  function refreshKnown() {
    const ids = new Set(JT.jobs.map(j => j.id));
    if(knownIds) {
      let added = 0; ids.forEach(i => { if(!knownIds.has(i)) added++; });
      if(added > 10) { pctMem.clear(); sigMem.clear(); } // bulk change (import / first sync): no fireworks
    }
    return ids;
  }
  function watchJobs() {
    const wrap = document.getElementById('jobsListWrap');
    if(!wrap) return;
    new MutationObserver(muts => {
      if(typeof JT === 'undefined') return;
      const next = refreshKnown();
      if(!knownIds) { knownIds = next; JT.jobs.forEach(j => { pctMem.set(j.id, pctOf(j)); sigMem.set(j.id, JSON.stringify(j)); }); }
      muts.forEach(m => m.addedNodes.forEach(n => {
        if(n.nodeType !== 1) return;
        if(n.classList.contains('jrow')) processRow(n);
        else n.querySelectorAll && n.querySelectorAll('.jrow').forEach(processRow);
      }));
      knownIds = next;
    }).observe(wrap, { childList: true, subtree: true });
  }

  // Delete: fold the row away, then run the original delete
  const _deleteJob = deleteJob;
  deleteJob = function(id) {
    if(!confirm('Delete this job?')) return;
    const run = () => {
      const c = window.confirm;
      window.confirm = () => true;   // already confirmed above; keep the original function untouched
      try { _deleteJob(id); } finally { window.confirm = c; }
    };
    const row = document.getElementById('jcard-' + id);
    if(!row || reduced()) return run();
    const h = row.offsetHeight;
    row.style.overflow = 'hidden';
    row.animate([
      { opacity: 1, transform: 'translateX(0)', height: h + 'px' },
      { opacity: 0, transform: 'translateX(-24px)', height: h + 'px', offset: .55 },
      { opacity: 0, transform: 'translateX(-24px)', height: '0px', paddingTop: '0', paddingBottom: '0', marginTop: '0', marginBottom: '0', borderWidth: '0' }
    ], { duration: 380, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' }).finished.then(run, run);
  };

  /* ── 8. Planning: slide the week ─────────────────────────────────── */
  function slideWeek(dir) {
    if(reduced()) return;
    const cells = document.querySelectorAll('#planTable td.pc, #planTable th.pt-day');
    const dx = dir > 0 ? 28 : dir < 0 ? -28 : 0;
    cells.forEach(c => c.animate([{ transform: `translateX(${dx}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 320, easing: EASE }));
  }
  const _planShift = planShift;
  planShift = function(n) { _planShift(n); slideWeek(n); };
  const _planToday = planToday;
  planToday = function() { const was = planWeekOffset; _planToday(); if(was !== 0) slideWeek(was > 0 ? -1 : 1); };

  /* ── 9. Sliding indicator for the status tabs ────────────────────── */
  function setupTabIndicator() {
    const bar = document.getElementById('jobsTabBar');
    if(!bar) return;
    const ind = document.createElement('span');
    ind.className = 'tab-ind';
    ind.setAttribute('aria-hidden', 'true');
    bar.prepend(ind);
    bar.classList.add('has-ind');
    let first = true;
    const place = () => {
      const a = bar.querySelector('.tab-btn.active');
      if(!a || !a.offsetParent) return;
      ind.classList.toggle('is-danger', a.classList.contains('tab-danger'));
      ind.style.transition = first || reduced() ? 'none' : '';
      ind.style.width = a.offsetWidth + 'px';
      ind.style.height = a.offsetHeight + 'px';
      ind.style.transform = `translate(${a.offsetLeft}px, ${a.offsetTop}px)`;
      first = false;
    };
    new MutationObserver(place).observe(bar, { attributes: true, subtree: true, attributeFilter: ['class'] });
    window.addEventListener('resize', () => { first = true; place(); });
    new MutationObserver(() => { if(document.getElementById('page-jobs').classList.contains('active')) { first = true; requestAnimationFrame(place); } })
      .observe(document.getElementById('page-jobs'), { attributes: true, attributeFilter: ['class'] });
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(() => { first = true; place(); });
    place();
  }

  onReady(() => { watchJobs(); setupTabIndicator(); });

  window.jtMotion = { celebrate };
})();
