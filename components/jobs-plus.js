/* ════════════════════════════════════════════════════════════════════
   Jobs page extras — presentation only (loaded after start-up).
     • Board view: columns by status; drag a card (or use "Move to") to change it
     • Group by job number or vessel, with collapsible groups
     • Compact / comfortable density
     • Swipe a job on a phone: right = complete, left = delete
   All changes go through the existing functions (quickStatusChange,
   deleteJob, openCompletionDate…), so the data rules stay exactly the same.
   ════════════════════════════════════════════════════════════════════ */

(() => {
  const KEY = 'jt_jobs_view';
  let st = { view: 'list', group: '', density: 'comfortable' };
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch(e) {}
  st.view = 'list';   // the Jobs page always opens as the usual list; Board is only shown when chosen
  const store = () => { try { const { view, ...keep } = st; localStorage.setItem(KEY, JSON.stringify(keep)); } catch(e) {} };
  const toggled = new Set();          // groups opened/closed by the user
  const colLimit = {};                // board: how many cards each column shows
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rerender = () => { const w = document.getElementById('jobsListWrap'); if(w) w.dataset.listKey = ''; renderJobsPage(); };

  function syncControls() {
    const list = document.getElementById('viewListBtn'), board = document.getElementById('viewBoardBtn');
    if(list) { list.classList.toggle('active', st.view === 'list'); list.setAttribute('aria-pressed', st.view === 'list'); }
    if(board) { board.classList.toggle('active', st.view === 'board'); board.setAttribute('aria-pressed', st.view === 'board'); }
    const g = document.getElementById('jobGroup'); if(g) { g.value = st.group; g.disabled = st.view === 'board'; }
    const d = document.getElementById('densityBtn'); if(d) d.setAttribute('aria-pressed', st.density === 'compact');
    document.getElementById('page-jobs')?.classList.toggle('jobs-compact', st.density === 'compact');
    document.getElementById('page-jobs')?.classList.toggle('jobs-board', st.view === 'board');
  }

  /* ───────── Grouping ───────── */
  const groupKey = j => st.group === 'jobnum' ? (j.jobNumber || '(no job number)')
    : st.group === 'client' ? ((j.clientName || '').trim() || '(no client)')
    : (j.vesselName || '(no vessel)');
  function renderGroups(wrap, jobs, term, head, card) {
    const groups = new Map();
    // Same name with different capitals/spaces ("ZAKHER MARINE" / "Zakher Marine") is one group,
    // shown with its most common spelling
    const norm = k => k.trim().replace(/\s+/g, ' ').toLowerCase();
    const byNorm = new Map(), spell = new Map();
    jobs.forEach(j => {
      const raw = groupKey(j), n = norm(raw);
      if(!byNorm.has(n)) { byNorm.set(n, []); spell.set(n, new Map()); }
      byNorm.get(n).push(j);
      spell.get(n).set(raw, (spell.get(n).get(raw) || 0) + 1);
    });
    byNorm.forEach((list, n) => {
      const label = [...spell.get(n)].sort((a, b) => b[1] - a[1])[0][0];
      groups.set(spell.get(n).size > 1 ? label + ` (${spell.get(n).size} spellings)` : label, list);
    });
    const defOpen = groups.size <= 25 || !!term;
    let html = `<h2 class="sr-only">Job list, grouped</h2>${head}<div class="jobs-body" id="jobsBody">`;
    let gi = 0;
    groups.forEach((list, k) => {
      const open = defOpen !== toggled.has(k);
      const id = 'jg-' + (gi++);
      const over = list.filter(isOverdue).length;
      const active = list.filter(j => !['complete','rework completed','cancelled'].includes(j.status));
      const avg = active.length ? Math.round(active.reduce((s, j) => s + Math.min(100, j.completionPercentage || 0), 0) / active.length) : 100;
      const vessels = [...new Set(list.map(j => j.vesselName).filter(Boolean))];
      const sub = st.group === 'jobnum' ? (list[0].vesselName || '')
        : st.group === 'client' ? (vessels.length > 2 ? `${vessels.length} vessels: ${vessels.slice(0, 2).join(', ')}…` : vessels.join(', '))
        : (list[0].clientName || '');
      html += `<section class="jgroup${open ? ' open' : ''}" aria-labelledby="${id}-h">
        <button type="button" class="jgroup-hdr" id="${id}-h" aria-expanded="${open}" aria-controls="${id}" onclick="jtJobsPlus.toggleGroup(${jsArg(k)})">
          ${ic('chevron-right')}
          <span class="jgroup-title"><strong>${hl(k, term)}</strong>${sub ? `<span>${esc(sub)}</span>` : ''}</span>
          <span class="jgroup-meta">
            <span>${list.length} job${list.length > 1 ? 's' : ''}</span>
            ${over ? `<span class="badge b-overdue">${over} overdue</span>` : ''}
            <span class="jgroup-bar" aria-label="Average progress of open jobs ${avg}%"><span style="--pct:${avg}%"></span></span>
          </span>
        </button>
        <div class="jgroup-rows" id="${id}">${open ? list.map(card).join('') : ''}</div>
      </section>`;
    });
    wrap.innerHTML = html + '</div>';
  }

  /* ───────── Board ───────── */
  const COLS = [
    { k: 'todo',      label: 'Not started', st: ['not planned', 'planned', 'rework planned'], ic: 'hourglass' },
    { k: 'doing',     label: 'In progress', st: ['ongoing', 'rework ongoing'], ic: 'zap' },
    { k: 'hold',      label: 'On hold',     st: ['hold'], ic: 'pause' },
    { k: 'done',      label: 'Done',        st: ['complete', 'rework completed'], ic: 'check-circle' },
    { k: 'cancelled', label: 'Cancelled',   st: ['cancelled'], ic: 'ban' },
  ];
  const colOf = j => (COLS.find(c => c.st.includes(j.status)) || COLS[0]).k;
  let landed = null;

  function boardCard(j, term) {
    const pct = Math.min(100, j.completionPercentage || 0);
    const over = isOverdue(j);
    const label = `${j.jobNumber || 'Job'} ${j.vesselName || ''}`.trim();
    const here = colOf(j);
    const moves = COLS.filter(c => c.k !== here).map(c => `<option value="${c.k}">${c.label}</option>`).join('');
    return `<article class="bcard${over ? ' overdue' : isApproaching(j) ? ' due-soon' : ''}" data-id="${j.id}" id="bcard-${j.id}" aria-label="${esc(label)}">
      <div class="bcard-top"><span class="badge b-jobnum">${hl(j.jobNumber || '—', term)}</span>${priorityBadge(j.priorityLevel)}${j.isRework ? `<span class="badge b-isrework">RW</span>` : ''}</div>
      <button type="button" class="bcard-title" onclick="openEditJob(${j.id})" title="Edit ${esc(label)}">${hl(j.vesselName || '—', term)}</button>
      <div class="bcard-scope">${hl(j.jobScope || '—', term)}</div>
      <div class="bcard-meta"><span>${ic('users')}${j.personInCharge ? hl(j.personInCharge, term) : '<span class="muted">Unassigned</span>'}</span><span class="${over ? 'is-over' : ''}">${ic('calendar')}${fmtD(j.targetDate)}</span></div>
      <div class="bcard-progress"><div class="mini-progress" role="progressbar" aria-label="Completion" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="--pct:${pct}%;--p:${pct / 100}"></span></div><span class="mini-pct">${pct}%</span></div>
      <div class="bcard-foot">
        <label class="sr-only" for="mv-${j.id}">Move ${esc(label)} to</label>
        <select class="bcard-move" id="mv-${j.id}" onchange="jtJobsPlus.move(${j.id}, this.value); this.value=''"><option value="">Move to…</option>${moves}</select>
        <span class="bcard-grip" aria-hidden="true">${ic('grip')}</span>
      </div>
    </article>`;
  }

  function renderBoard(wrap, jobs, term) {
    const by = Object.fromEntries(COLS.map(c => [c.k, []]));
    jobs.forEach(j => by[colOf(j)].push(j));
    wrap.innerHTML = `<h2 class="sr-only">Job board</h2><div class="board" id="jobBoard">${COLS.map(c => {
      const list = by[c.k], lim = colLimit[c.k] || 40;
      return `<section class="bcol bcol-${c.k}" data-col="${c.k}" aria-labelledby="bh-${c.k}">
        <h3 class="bcol-hdr" id="bh-${c.k}">${ic(c.ic)}<span>${c.label}</span><span class="tab-count">${list.length}</span></h3>
        <div class="bcol-body">${list.length ? list.slice(0, lim).map(j => boardCard(j, term)).join('') : `<p class="bcol-empty">Drop jobs here</p>`}
          ${list.length > lim ? `<button type="button" class="btn btn-sm bcol-more" onclick="jtJobsPlus.more('${c.k}')">Show ${Math.min(40, list.length - lim)} more of ${list.length - lim}</button>` : ''}
        </div>
      </section>`;
    }).join('')}</div>`;
    if(landed) {
      const el = document.getElementById('bcard-' + landed);
      if(el && !reduced()) { el.classList.add('bcard-landed'); setTimeout(() => el.classList.remove('bcard-landed'), 900); }
      landed = null;
    }
  }

  function move(id, k) {
    const j = JT.jobs.find(x => x.id === id);
    if(!j || !k || colOf(j) === k) return;
    if(colOf(j) === 'done') { showToast('Completed jobs are reopened with the Rework button, so their history is kept', 'err'); return; }
    const rw = j.isRework || isReworkStatus(j.status);
    const status = { todo: rw ? 'rework planned' : 'planned', doing: rw ? 'rework ongoing' : 'ongoing', hold: 'hold', done: rw ? 'rework completed' : 'complete', cancelled: 'cancelled' }[k];
    if(status === 'rework ongoing' && !j.startDate) j.startDate = today();
    quickStatusChange(id, status);
  }

  /* ───────── Swipe on touch screens (list view) ─────────
     Follows the finger 1:1, resists past the action point (rubber band), and on release
     uses the flick speed: a quick flick commits even if the finger moved only a little.
     right = complete, left = delete (with Undo). */
  function setupSwipe(wrap) {
    let s = null;
    const threshold = row => Math.min(120, row.offsetWidth * .28);
    const shape = (raw, c) => {
      const th = c.th, w = c.row.offsetWidth;
      if(raw > 0 && !c.canDone) return jtRubberband(raw, w, .3);            // nothing to do this way: resist from the start
      const a = Math.abs(raw);
      return Math.sign(raw) * (a <= th ? a : th + jtRubberband(a - th, w));  // soft past the action point
    };
    const paint = c => {
      c.main.style.transform = `translate3d(${c.dx}px,0,0)`;
      c.bg.classList.toggle('to-done', c.dx > 0);
      const armed = Math.abs(c.dx) >= c.th - 1 && !(c.dx > 0 && !c.canDone);
      if(armed !== c.armed) { c.armed = armed; c.bg.classList.toggle('armed', armed); if(armed) jtBuzz(6); }
    };
    wrap.addEventListener('pointerdown', e => {
      if(e.pointerType !== 'touch' || st.view !== 'list' || _selectMode) return;
      const row = e.target.closest('.jrow');
      if(!row || e.target.closest('input, select, textarea')) return;
      if(s && s.spring) s.spring.stop();
      s = { row, id: Number(row.id.slice(6)), x0: e.clientX, y0: e.clientY, dx: 0, on: false, pid: e.pointerId, vel: jtVelocity() };
      s.vel.add(e.clientX, 0);
    }, { passive: true });
    wrap.addEventListener('pointermove', e => {
      if(!s || e.pointerId !== s.pid) return;
      const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
      if(!s.on) {
        if(Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { s = null; return; }   // vertical scroll
        if(Math.abs(dx) < 10) return;
        s.on = true; s.x0 = e.clientX;       // track 1:1 from here, no jump after the 10px threshold
        const job = JT.jobs.find(x => x.id === s.id);
        s.canDone = job && !['complete', 'rework completed', 'cancelled'].includes(job.status);
        s.th = threshold(s.row);
        s.bg = document.createElement('div');
        s.bg.className = 'swipe-bg';
        s.bg.innerHTML = `<span class="sw-done">${ic('check-circle')}Complete</span><span class="sw-del">${ic('trash')}Delete</span>`;
        s.row.prepend(s.bg);
        s.row.classList.add('swiping');
        s.main = s.row.querySelector('.jrow-main');
        s.raw0 = 0;
      }
      s.vel.add(e.clientX, 0);
      s.raw = e.clientX - s.x0;
      s.dx = shape(s.raw, s);
      paint(s);
    }, { passive: true });
    const done = () => {
      if(!s) return;
      const c = s; s = null;
      if(!c.on) return;
      const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 60);
      const v = c.vel.get().x;
      const projected = (c.raw || 0) + jtProject(v, 0.99);
      const dir = Math.sign(projected);
      const fire = Math.abs(projected) > c.th && dir === Math.sign(c.raw || v) && !(dir > 0 && !c.canDone);
      const finish = () => { c.main.style.transform = ''; c.bg.remove(); c.row.classList.remove('swiping'); };
      const set = x => { c.dx = x; c.main.style.transform = `translate3d(${x}px,0,0)`; };
      if(fire && dir < 0) {
        // Delete: carry the flick off the edge, then remove (Undo is offered)
        jtBuzz(10);
        jtSpring({ from: c.dx, to: -c.row.offsetWidth, velocity: v, damping: 1, response: 0.25, onUpdate: set,
          onDone: () => deleteJob(c.id) });
        return;
      }
      if(fire) {
        jtBuzz(10);
        const j = JT.jobs.find(x => x.id === c.id);
        if(j) openCompletionDate(c.id, (j.isRework || isReworkStatus(j.status)) ? 'rework completed' : 'complete');
      }
      jtSpring({ from: c.dx, to: 0, velocity: v, damping: Math.abs(v) > 400 ? 0.85 : 1, response: 0.3, onUpdate: set, onDone: finish });
    };
    wrap.addEventListener('pointerup', done);
    wrap.addEventListener('pointercancel', () => { if(s && s.on) { s.raw = 0; done(); } else s = null; });
  }

  window.jtJobsPlus = {
    key: () => st.view + '|' + st.group + '|' + [...toggled].join('\u0001'),
    render(wrap, jobs, term, head, card) {
      if(st.view === 'board') { renderBoard(wrap, jobs, term); return true; }
      if(st.group) { renderGroups(wrap, jobs, term, head, card); return true; }
      return false;
    },
    setView(v) { st.view = v; store(); syncControls(); if(v === 'board' && _selectMode) setSelectMode(false); rerender(); },
    setGroup(g) { st.group = g; toggled.clear(); store(); syncControls(); rerender(); },
    toggleDensity() { st.density = st.density === 'compact' ? 'comfortable' : 'compact'; store(); syncControls(); },
    toggleGroup(k) {
      const flip = () => { if(toggled.has(k)) toggled.delete(k); else toggled.add(k); rerender(); };
      // Closing: the rows fold back up the way they came in, then the group shuts
      const sec = [...document.querySelectorAll('.jgroup.open')].find(g => g.querySelector('.jgroup-hdr')?.getAttribute('onclick')?.includes(JSON.stringify(k)));
      const rows = sec && sec.querySelector('.jgroup-rows');
      if(rows && rows.children.length && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
        rows.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px)' }], { duration: 160, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).finished.then(flip, flip);
      } else flip();
    },
    more(k) { colLimit[k] = (colLimit[k] || 40) + 40; rerender(); },
    move,
  };

  const init = () => {
    syncControls();
    const wrap = document.getElementById('jobsListWrap');
    setupSwipe(wrap);
    jtDrag(wrap, {
      item: '.bcard', drop: '.bcol',
      enabled: () => st.view === 'board',
      canDrop: (item, col) => {
        const j = JT.jobs.find(x => x.id === Number(item.dataset.id));
        return !!j && colOf(j) !== col.dataset.col && colOf(j) !== 'done';
      },
      onDrop: (item, col) => move(Number(item.dataset.id), col.dataset.col),
      landing: item => document.getElementById('bcard-' + item.dataset.id),
      scrollers: () => [document.getElementById('jobBoard')],
    });
    if(st.view !== 'list' || st.group) rerender();
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
