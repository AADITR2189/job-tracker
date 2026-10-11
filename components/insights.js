/* ════════════════════════════════════════════════════════════════════
   Insights — charts and summaries (read-only; loaded after start-up).
     Dashboard: location switch for the whole page, "this week" strip,
                completed-jobs trend, workload per person
     Reports:   charts above the tables, Compare tab, PDF / print
   Nothing here writes job data. Report charts read the numbers straight
   from the report table, so chart and table always agree.
   ════════════════════════════════════════════════════════════════════ */

(() => {
  const DONE = ['complete', 'rework completed'];
  const isOpen = j => !DONE.includes(j.status) && j.status !== 'cancelled';
  const LS = (k, v) => { try { if(v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch(e) { return null; } };
  const fmtInt = n => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 1 });

  /* ───────── Shared tooltip (hover + keyboard focus) ───────── */
  const tip = document.createElement('div');
  tip.className = 'chart-tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
  tip.innerHTML = '<strong></strong><span></span>';
  document.body.appendChild(tip);
  function showTip(el, x, y) {
    tip.querySelector('strong').textContent = el.dataset.tipV || '';
    tip.querySelector('span').textContent = el.dataset.tipL || '';
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    const left = Math.min(innerWidth - r.width - 8, Math.max(8, x - r.width / 2));
    const top = y - r.height - 12 < 8 ? y + 16 : y - r.height - 12;
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }
  document.addEventListener('pointermove', e => {
    const el = e.target.closest && e.target.closest('[data-tip-v]');
    if(el) showTip(el, e.clientX, e.clientY); else tip.hidden = true;
  }, { passive: true });
  document.addEventListener('focusin', e => {
    const el = e.target.closest && e.target.closest('[data-tip-v]');
    if(el) { const r = el.getBoundingClientRect(); showTip(el, r.left + r.width / 2, r.top); } else tip.hidden = true;
  });
  document.addEventListener('scroll', () => { tip.hidden = true; }, { capture: true, passive: true });

  /* ───────── Chart builders (HTML/CSS bars: crisp text at any width) ───────── */
  // Vertical bars, one series. Direct labels only on the highest and the latest bar.
  function vChart(points, { label, unit }) {
    const max = Math.max(1, ...points.map(p => p.v));
    const step = max <= 4 ? 1 : Math.ceil(max / 4);
    const top = Math.ceil(max / step) * step;
    const ticks = []; for(let v = 0; v <= top; v += step) ticks.push(v);
    const iMax = points.reduce((b, p, i) => p.v > points[b].v ? i : b, 0);
    const xEvery = points.length > 8 ? 3 : 1;
    return `<figure class="vchart">
      <div class="vchart-plot" role="img" aria-label="${esc(label)}">
        <div class="vchart-grid" aria-hidden="true">${ticks.map(t => `<span style="--y:${t / top * 100}%"><i>${t}</i></span>`).join('')}</div>
        <div class="vchart-cols">${points.map((p, i) => `<div class="vcol${i === points.length - 1 ? ' is-last' : ''}" data-tip-v="${p.v} ${unit}" data-tip-l="${esc(p.tip || p.label)}">
            ${p.v && (i === iMax || i === points.length - 1) ? `<span class="vlab" style="--h:${p.v / top * 100}%">${p.v}</span>` : ''}
            <span class="vbar" style="--h:${p.v / top * 100}%"></span></div>`).join('')}</div>
      </div>
      <div class="vchart-x" aria-hidden="true">${points.map((p, i) => `<span>${i % xEvery === 0 || i === points.length - 1 ? esc(p.label) : ''}</span>`).join('')}</div>
      <table class="sr-only"><caption>${esc(label)}</caption><tr><th scope="col">Period</th><th scope="col">${esc(unit)}</th></tr>${points.map(p => `<tr><td>${esc(p.tip || p.label)}</td><td>${p.v}</td></tr>`).join('')}</table>
    </figure>`;
  }

  // Horizontal bars. series: [{ key, label, color }]; rows: [{ label, values:{key:n}, onclick? }]
  // stacked=true stacks the series in one bar; otherwise each row shows one thin bar per series.
  function hChart(rows, series, { label, fmt = fmtInt, stacked = false, total }) {
    const sum = r => series.reduce((s, x) => s + (r.values[x.key] || 0), 0);
    const max = Math.max(1, ...rows.map(r => stacked ? sum(r) : Math.max(...series.map(x => r.values[x.key] || 0))));
    const legend = series.length > 1 ? `<div class="chart-legend">${series.map(x => `<span><i style="--c:${x.color}"></i>${esc(x.label)}</span>`).join('')}</div>` : '';
    const name = r => r.onclick ? `<button type="button" class="link-btn hrow-name" onclick="${r.onclick}" title="${esc(r.label)}">${esc(r.label)}</button>` : `<span class="hrow-name" title="${esc(r.label)}">${esc(r.label)}</span>`;
    const body = rows.map(r => {
      const tipL = r.label + ' — ' + series.map(x => `${x.label}: ${fmt(r.values[x.key] || 0)}`).join(' · ');
      const bars = stacked
        ? `<div class="hbar-track"><div class="hbar-stack" style="--w:${sum(r) / max * 100}%">${series.map(x => (r.values[x.key] || 0) ? `<span style="--c:${x.color};flex:${r.values[x.key]}"></span>` : '').join('')}</div></div>`
        : `<div class="hbar-track multi">${series.map(x => `<span class="hbar" style="--c:${x.color};--w:${(r.values[x.key] || 0) / max * 100}%"></span>`).join('')}</div>`;
      const val = stacked ? `<strong>${fmt(total ? total(r) : sum(r))}</strong>` : `<strong>${series.map(x => fmt(r.values[x.key] || 0)).join(' / ')}</strong>`;
      return `<li class="hrow" tabindex="0" data-tip-v="${esc(val.replace(/<[^>]+>/g, ''))}" data-tip-l="${esc(tipL)}">${name(r)}${bars}<span class="hrow-val">${val}</span></li>`;
    }).join('');
    return `<figure class="hchart">${legend}<ul class="hrows" aria-label="${esc(label)}">${body}</ul>
      <table class="sr-only"><caption>${esc(label)}</caption><tr><th scope="col">Name</th>${series.map(x => `<th scope="col">${esc(x.label)}</th>`).join('')}</tr>${rows.map(r => `<tr><td>${esc(r.label)}</td>${series.map(x => `<td>${fmt(r.values[x.key] || 0)}</td>`).join('')}</tr>`).join('')}</table></figure>`;
  }

  /* ───────── Dashboard: location switch for the whole page ───────── */
  const _renderDashboard = renderDashboard;
  renderDashboard = function() {
    const loc = _dashAvailLoc;
    if(!loc) { _renderDashboard(); renderDashMore(JT.jobs, JT.persons); syncDashLoc(); return; }
    const real = JT;
    JT = Object.assign({}, real, { jobs: real.jobs.filter(j => j.location === loc), persons: real.persons.filter(p => p.location === loc) });
    try { _renderDashboard(); renderDashMore(JT.jobs, JT.persons); }
    finally { JT = real; }
    syncDashLoc();
  };
  const _setDashAvailLoc = setDashAvailLoc;
  setDashAvailLoc = function(loc) {
    _setDashAvailLoc(loc);
    LS('jt_dash_loc', loc);
    renderDashboard();
  };
  function syncDashLoc() {
    const loc = _dashAvailLoc;
    [['dashLocAll', ''], ['dashLocHO', 'HO'], ['dashLocCOK', 'COK']].forEach(([id, l]) => {
      const b = document.getElementById(id); if(!b) return;
      b.classList.toggle('active', l === loc); b.setAttribute('aria-pressed', l === loc ? 'true' : 'false');
    });
    const dd = document.getElementById('dashDate');
    if(dd && loc) dd.textContent = dd.textContent.replace(/ · (HO|COK) only$/, '') + ` · ${loc} only`;
  }
  // Cards and links on the dashboard open Jobs with the same location
  const _filterAndGo = filterAndGo;
  filterAndGo = function(tab) {
    _filterAndGo(tab);
    const lf = document.getElementById('jobLocFilter');
    if(lf && lf.value !== _dashAvailLoc) { lf.value = _dashAvailLoc; renderJobsPage(); }
  };

  let trendMode = LS('jt_trend') || 'week';
  let showAllLoad = false;
  function renderDashMore(jobs, persons) {
    const el = document.getElementById('dashMore');
    if(!el) return;
    const t = today();
    // This week (next 7 days) + overdue
    const days = []; for(let i = 0; i < 7; i++) days.push(localDateStr(addDays(new Date(), i)));
    const due = ds => jobs.filter(j => isOpen(j) && j.status !== 'hold' && j.targetDate === ds);
    const over = jobs.filter(isOverdue).sort((a, b) => a.targetDate.localeCompare(b.targetDate));
    const chip = j => `<li><button type="button" class="wk-job${isOverdue(j) ? ' is-over' : ''}" onclick="goToJob(${j.id})" title="${esc(j.vesselName)} · ${esc(j.jobScope)}"><strong>${esc(j.vesselName || '—')}</strong><span>${esc(j.personInCharge || 'Unassigned')} · ${Math.min(100, j.completionPercentage || 0)}%</span></button></li>`;
    const col = (title, sub, list, cls) => `<section class="wk-day ${cls || ''}" aria-label="${esc(title)} ${esc(sub)}: ${list.length} due">
        <h3><span>${esc(title)}</span><small>${esc(sub)}</small><b>${list.length}</b></h3>
        ${list.length ? `<ul>${list.slice(0, 3).map(chip).join('')}</ul>${list.length > 3 ? `<p class="wk-more">+${list.length - 3} more</p>` : ''}` : '<p class="wk-none">Nothing due</p>'}
      </section>`;
    const week = `<div class="section-card wk-card">
      <div class="section-card-title"><h2>${ic('calendar')}This week</h2><button type="button" class="btn btn-sm" onclick="showPage('jobs');clearJobFilters();toggleQuickFilter('week')">See all due this week</button></div>
      <div class="wk-strip">
        ${col('Overdue', 'past target', over, 'is-over')}
        ${days.map((ds, i) => { const d = new Date(ds + 'T00:00'); return col(i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-GB', { weekday: 'short' }), d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), due(ds), i === 0 ? 'is-today' : ''); }).join('')}
      </div></div>`;

    // Completed per week / month
    const doneJobs = jobs.filter(j => DONE.includes(j.status) && j.completionDate);
    const points = [];
    if(trendMode === 'month') {
      const now = new Date();
      for(let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ym = localDateStr(d).slice(0, 7);
        const list = doneJobs.filter(j => j.completionDate.startsWith(ym));
        const onTime = list.filter(j => j.targetDate && j.completionDate <= j.targetDate).length;
        points.push({ label: d.toLocaleDateString('en-GB', { month: 'short' }), v: list.length, tip: `${d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} · ${onTime} on time` });
      }
    } else {
      const ws = weekStart(new Date());
      for(let i = 11; i >= 0; i--) {
        const a = addDays(ws, -7 * i), from = localDateStr(a), to = localDateStr(addDays(a, 6));
        const list = doneJobs.filter(j => j.completionDate >= from && j.completionDate <= to);
        const onTime = list.filter(j => j.targetDate && j.completionDate <= j.targetDate).length;
        points.push({ label: a.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), v: list.length, tip: `Week of ${fmtDL(from)} · ${onTime} on time` });
      }
    }
    const totalDone = points.reduce((s, p) => s + p.v, 0);
    const trend = `<div class="section-card">
      <div class="section-card-title"><h2>${ic('trending')}Jobs completed</h2>
        <div class="seg" role="group" aria-label="Group completed jobs by">
          <button type="button" class="seg-btn${trendMode === 'week' ? ' active' : ''}" aria-pressed="${trendMode === 'week'}" onclick="jtInsights.setTrend('week')">Weekly</button>
          <button type="button" class="seg-btn${trendMode === 'month' ? ' active' : ''}" aria-pressed="${trendMode === 'month'}" onclick="jtInsights.setTrend('month')">Monthly</button>
        </div></div>
      <p class="chart-sub">${totalDone} completed in the last 12 ${trendMode === 'month' ? 'months' : 'weeks'}</p>
      ${vChart(points, { label: `Jobs completed per ${trendMode}, last 12 ${trendMode}s`, unit: 'completed' })}
    </div>`;

    // Workload per person
    const rows = persons.map(p => {
      const mine = jobs.filter(j => j.personInCharge === p.name && isOpen(j));
      const od = mine.filter(isOverdue).length;
      return { label: p.name, values: { ok: mine.length - od, od }, onclick: `filterByPerson(${jsArg(p.name)})` };
    }).filter(r => r.values.ok + r.values.od > 0).sort((a, b) => (b.values.ok + b.values.od) - (a.values.ok + a.values.od) || b.values.od - a.values.od);
    const free = persons.length - rows.length;
    const shown = showAllLoad ? rows : rows.slice(0, 8);
    const load = `<div class="section-card">
      <div class="section-card-title"><h2>${ic('users')}Workload per person</h2></div>
      <p class="chart-sub">Open jobs per person${free ? ` · ${free} ${free === 1 ? 'person has' : 'people have'} no open jobs` : ''}</p>
      ${rows.length ? hChart(shown, [{ key: 'ok', label: 'Open, on track', color: 'var(--chart-1)' }, { key: 'od', label: 'Overdue', color: 'var(--danger)' }], { label: 'Open jobs per person', stacked: true }) : '<p class="form-note">No open jobs.</p>'}
      ${rows.length > 8 ? `<button type="button" class="btn btn-sm" onclick="jtInsights.toggleLoad()">${showAllLoad ? 'Show top 8' : `Show all ${rows.length}`}</button>` : ''}
    </div>`;
    el.innerHTML = week + `<div class="dash-grid">${trend}${load}</div>`;
  }

  /* ───────── Reports: tabs, charts, compare, print ───────── */
  function syncRptTabs() {
    [['rptTabPerson', 'person'], ['rptTabVessel', 'vessel'], ['rptTabCompare', 'compare']].forEach(([id, t]) => {
      const b = document.getElementById(id); if(!b) return;
      b.classList.toggle('active', rptTab === t); b.setAttribute('aria-pressed', rptTab === t ? 'true' : 'false');
    });
  }
  const _renderReports = renderReports;
  renderReports = function() {
    syncRptTabs();
    document.getElementById('page-reports')?.classList.toggle('rpt-compare', rptTab === 'compare');
    if(rptTab === 'compare') { document.getElementById('rptCharts').innerHTML = ''; renderCompare(); return; }
    _renderReports();
    renderReportCharts();
  };

  const num = s => { const n = parseFloat(String(s || '').replace(/[^\d.\-]/g, '')); return isNaN(n) ? 0 : n; };
  function renderReportCharts() {
    const box = document.getElementById('rptCharts');
    if(!box) return;
    const rows = [...document.querySelectorAll('#rptContent tr.rpt-group')].map(tr => {
      const lbl = (tr.querySelector('.rpt-chev')?.getAttribute('aria-label') || '').replace(/^Show scopes for /, '');
      const cell = k => num(tr.querySelector(`td[data-label="${k}"]`)?.textContent);
      return { label: lbl, values: { inv: cell('Invoice'), est: cell('Est. MH'), act: cell('Act. MH') } };
    });
    if(!rows.length) { box.innerHTML = ''; return; }
    const top = (key, n) => [...rows].filter(r => key(r) > 0).sort((a, b) => key(b) - key(a)).slice(0, n);
    const mh = top(r => r.values.est + r.values.act, 10);
    const inv = top(r => r.values.inv, 10);
    const what = rptTab === 'person' ? 'person' : 'job';
    const hrs = v => fmtInt(v) + ' h';
    const rupees = v => '₹' + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    box.innerHTML = `<div class="dash-grid rpt-charts">
      <div class="section-card"><div class="section-card-title"><h2>${ic('clock')}Manhours: estimated vs actual</h2></div>
        <p class="chart-sub">Top ${mh.length} by ${what}</p>
        ${mh.length ? hChart(mh, [{ key: 'est', label: 'Estimated', color: 'var(--chart-1)' }, { key: 'act', label: 'Actual', color: 'var(--chart-2)' }], { label: 'Estimated and actual manhours', fmt: hrs }) : '<p class="form-note">No manhours recorded in this range.</p>'}
      </div>
      <div class="section-card"><div class="section-card-title"><h2>${ic('trending')}Invoice</h2></div>
        <p class="chart-sub">Top ${inv.length} by ${what}</p>
        ${inv.length ? hChart(inv, [{ key: 'inv', label: 'Invoice', color: 'var(--chart-1)' }], { label: 'Invoice amount', fmt: rupees }) : '<p class="form-note">No invoice amounts in this range.</p>'}
      </div></div>`;
  }

  // Compare two people, vessels or months side by side
  const cmp = { type: 'person', a: '', b: '' };
  function cmpOptions() {
    if(cmp.type === 'person') return JT.persons.map(p => ({ v: p.name, t: `${p.name} (${p.location})` }));
    if(cmp.type === 'vessel') return [...new Set(JT.jobs.map(j => j.vesselName).filter(Boolean))].sort((a, b) => a.localeCompare(b)).map(v => ({ v, t: v }));
    return [...new Set(JT.jobs.map(j => (j.completionDate || j.receiptDate || '').slice(0, 7)).filter(Boolean))].sort().reverse()
      .map(v => ({ v, t: new Date(v + '-01T00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) }));
  }
  function cmpJobs(key) {
    const inclRework = document.getElementById('rptIncludeRework')?.checked !== false;
    if(cmp.type === 'month') return JT.jobs.filter(j => (inclRework || !j.isRework) && (j.completionDate || j.receiptDate || '').startsWith(key));
    const base = getReportJobs();
    return cmp.type === 'person' ? base.filter(j => j.personInCharge === key) : base.filter(j => j.vesselName === key);
  }
  function metrics(list) {
    const done = list.filter(j => DONE.includes(j.status));
    const dated = done.filter(j => j.completionDate && j.targetDate);
    const act = done.filter(j => j.actualDaysToComplete > 0);
    const sum = k => list.reduce((s, j) => s + (Number(j[k]) || 0), 0);
    return [
      { k: 'Jobs (scopes)', v: list.length },
      { k: 'Completed', v: done.length },
      { k: 'Open now', v: list.filter(isOpen).length },
      { k: 'Overdue now', v: list.filter(isOverdue).length, lowGood: true },
      { k: 'On-time delivery', v: dated.length ? Math.round(dated.filter(j => j.completionDate <= j.targetDate).length / dated.length * 100) : null, f: v => v + '%' },
      { k: 'Avg. actual days', v: act.length ? +(act.reduce((s, j) => s + j.actualDaysToComplete, 0) / act.length).toFixed(1) : null, lowGood: true },
      { k: 'Est. manhours', v: sum('estimatedManhours'), f: v => fmtMH(v) },
      { k: 'Actual manhours', v: sum('manhoursConsumed'), f: v => fmtMH(v) },
      { k: 'Invoice', v: sum('invoiceAmount'), f: v => fmtCurrency(v) },
      { k: 'Manhour cost', v: sum('manhourCost'), f: v => fmtCurrency(v), lowGood: true },
    ];
  }
  function renderCompare() {
    const el = document.getElementById('rptContent');
    const opts = cmpOptions();
    if(!opts.some(o => o.v === cmp.a)) cmp.a = opts[0]?.v || '';
    if(!opts.some(o => o.v === cmp.b) || cmp.b === cmp.a) cmp.b = (opts.find(o => o.v !== cmp.a) || {}).v || '';
    const sel = (id, val) => `<select class="form-ctrl compact" id="${id}" onchange="jtInsights.setCmp('${id === 'cmpA' ? 'a' : 'b'}', this.value)">${opts.map(o => `<option value="${esc(o.v)}"${o.v === val ? ' selected' : ''}>${esc(o.t)}</option>`).join('')}</select>`;
    const name = v => (opts.find(o => o.v === v) || {}).t || '—';
    const A = metrics(cmpJobs(cmp.a)), B = metrics(cmpJobs(cmp.b));
    const fmt = (m, v) => v === null || v === undefined ? '—' : m.f ? m.f(v) : fmtInt(v);
    const rows = A.map((m, i) => {
      const a = m.v, b = B[i].v, mx = Math.max(a || 0, b || 0) || 1;
      let note = '';
      if(a !== null && b !== null && a !== b) {
        const better = m.lowGood ? (b < a ? 'b' : 'a') : (b > a ? 'b' : 'a');
        note = `<span class="cmp-lead cmp-${better}">${better === 'a' ? 'A' : 'B'} ${m.lowGood ? 'lower' : 'higher'}</span>`;
      }
      return `<tr><th scope="row">${m.k}</th>
        <td><div class="cmp-cell"><strong>${fmt(m, a)}</strong><span class="cmp-bar" style="--c:var(--chart-1);--w:${(a || 0) / mx * 100}%"></span></div></td>
        <td><div class="cmp-cell"><strong>${fmt(m, b)}</strong><span class="cmp-bar" style="--c:var(--chart-2);--w:${(b || 0) / mx * 100}%"></span></div></td>
        <td class="cmp-note">${note}</td></tr>`;
    }).join('');
    const rangeNote = cmp.type === 'month' ? 'Months use each job’s completion date (or receipt date if not completed). The date range above is not used.' : 'Uses the date range and rework setting above. Invoice is counted in full for the person in charge (the By Person tab splits shared jobs).';
    el.innerHTML = `<div class="section-card cmp-card">
      <div class="cmp-controls">
        <div class="cmp-field"><label for="cmpType">Compare</label><select class="form-ctrl compact" id="cmpType" onchange="jtInsights.setCmp('type', this.value)">
          <option value="person"${cmp.type === 'person' ? ' selected' : ''}>Two people</option><option value="vessel"${cmp.type === 'vessel' ? ' selected' : ''}>Two vessels</option><option value="month"${cmp.type === 'month' ? ' selected' : ''}>Two months</option></select></div>
        <div class="cmp-field"><label for="cmpA"><i class="cmp-key" style="--c:var(--chart-1)"></i>A</label>${sel('cmpA', cmp.a)}</div>
        <div class="cmp-field"><label for="cmpB"><i class="cmp-key" style="--c:var(--chart-2)"></i>B</label>${sel('cmpB', cmp.b)}</div>
      </div>
      ${opts.length < 2 ? '<p class="form-note">Need at least two to compare.</p>' : `<div class="rpt-table-wrap"><table class="cmp-table">
        <thead><tr><th scope="col">Measure</th><th scope="col"><i class="cmp-key" style="--c:var(--chart-1)"></i>A · ${esc(name(cmp.a))}</th><th scope="col"><i class="cmp-key" style="--c:var(--chart-2)"></i>B · ${esc(name(cmp.b))}</th><th scope="col"><span class="sr-only">Difference</span></th></tr></thead>
        <tbody>${rows}</tbody></table></div>`}
      <p class="form-note">${rangeNote}</p>
    </div>`;
  }

  function printReport() {
    const hdr = document.getElementById('rptPrintHdr');
    const from = document.getElementById('rptFrom')?.value, to = document.getElementById('rptTo')?.value;
    const view = { person: 'By person', vessel: 'By vessel / job', compare: 'Comparison' }[rptTab];
    const range = from || to ? `${from ? fmtDL(from) : 'start'} – ${to ? fmtDL(to) : 'today'}` : 'All time';
    if(hdr) hdr.innerHTML = `<h1>Job Tracker report — ${esc(view)}</h1><p>${esc(range)} · ${document.getElementById('rptIncludeRework')?.checked === false ? 'Reworks excluded' : 'Reworks included'} · Generated ${esc(new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</p>`;
    const title = document.title, theme = document.documentElement.getAttribute('data-theme');
    document.title = `Job Tracker report - ${view} - ${range}`.replace(/[\/\\:]/g, '-');
    document.documentElement.setAttribute('data-theme', 'light');   // paper is white
    const restore = () => { document.title = title; document.documentElement.setAttribute('data-theme', theme); window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    setTimeout(() => { window.print(); setTimeout(() => { if(document.title !== title) restore(); }, 1000); }, 50);
  }

  window.jtInsights = {
    setTrend(m) { trendMode = m; LS('jt_trend', m); renderDashboard(); },
    toggleLoad() { showAllLoad = !showAllLoad; renderDashboard(); },
    setCmp(k, v) { cmp[k] = v; if(k === 'type') { cmp.a = cmp.b = ''; } renderCompare(); },
    printReport, vChart, hChart,
  };

  // Restore the last dashboard location and draw the new panels
  const saved = LS('jt_dash_loc');
  if(saved === 'HO' || saved === 'COK') setDashAvailLoc(saved); else renderDashboard();
  if(isPageActive('reports')) renderReports();
})();
