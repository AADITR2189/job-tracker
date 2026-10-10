/* ════════════════════════════════════════════════════════════════════
   JOB TRACKER — application logic
   ────────────────────────────────────────────────────────────────────
   Business logic (filters, counts, planning engine, availability,
   rework, completion, reports, imports/exports) is carried over from
   v1 unchanged. Changes in v2 are limited to:
     • rendering markup (responsive, accessible, themeable)
     • safer storage handling (normalise on load, quota errors,
       cross-tab sync, safety copy before import)
     • lazy-loaded ExcelJS and robust downloads
   Storage key 'jt_v2' and the backup/export schema are unchanged.
   ════════════════════════════════════════════════════════════════════ */

// ===================== STATE =====================
if(typeof window.S !== "undefined" && !window.JT.jobs) { try { delete window.S; } catch(e) {} }
let JT = { jobs:[], persons:[], upcomingJobs:[], holidays:[], workingDays:[], personHolidays:{}, compensationWorkingDays:{} };
let editJobId = null, editPersonId = null, actionJobId = null;
let currentJobTab = 'all';
let currentSideFilter = 'all', currentSideLocFilter = '';
let _dashAvailLoc = '';
let planWeekOffset = 0;

// ===================== BOOT =====================
function boot() {
  let saved = null;
  try { saved = localStorage.getItem('jt_v2'); } catch(e) { console.error(e); }
  if(saved) {
    try { JT = jtNormalize(JSON.parse(saved)); }
    catch(e) {
      // v1 silently ignored unreadable data and would overwrite it on the next save.
      // Keep the raw text under a separate key so it can be recovered.
      const k = jtPreserveCorrupt(saved);
      JT = jtNormalize(JT);
      setTimeout(() => showToast(`Stored data could not be read. A raw copy was kept${k?' ('+k+')':''}. Import a backup to restore.`, 'err'), 400);
    }
  }
  else loadSample();
  renderAll();
  initScrollTop();
  handleLaunchParams();
  renderSettingsInfo();
  document.documentElement.classList.add('app-ready');
  finishLaunch();
}

// Fade out the launch animation (shown once per session) as soon as the app is ready
function finishLaunch() {
  const el = document.getElementById('launch');
  if(!el) return;
  const quick = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => {
    el.classList.add('launch-done');
    try { sessionStorage.setItem('jt_launched', '1'); } catch(e) {}
    setTimeout(() => el.remove(), quick ? 0 : 380);
  }, quick ? 0 : Math.max(0, 700 - performance.now()));
}
// Scripts are deferred, so DOMContentLoaded always fires after this file has fully loaded.
document.addEventListener('DOMContentLoaded', boot);

// Animations (components/motion.js) load after the page is shown, so they never delay start-up
window.addEventListener('load', () => {
  const s = document.createElement('script');
  s.src = 'components/motion.js';
  document.body.appendChild(s);
});

function save() {
  const data = JSON.stringify(JT);
  try { localStorage.setItem('jt_v2', data); if(typeof jtSync !== 'undefined') jtSync.localChanged(); }
  catch(e) {
    // Live data always wins over the optional pre-import safety copy
    if(jtGetPreImportMeta()) {
      jtClearPreImport();
      try { localStorage.setItem('jt_v2', data); if(typeof jtSync !== 'undefined') jtSync.localChanged(); showToast('Storage was full: the old pre-import safety copy was removed to save your changes.'); return; }
      catch(e2) {}
    }
    console.error('Save failed', e);
    showToast('Could not save: device storage is full. Export a JSON backup now to keep your changes.', 'err');
  }
}

// Keep several open tabs/windows in sync (prevents one tab overwriting another's changes)
window.addEventListener('storage', e => {
  if(e.key !== 'jt_v2' || e.newValue === null) return;
  try {
    JT = jtNormalize(JSON.parse(e.newValue));
    renderAll();
    showToast('Data updated from another window', 'ok');
  } catch(err) { console.warn(err); }
});

// Manifest shortcuts: ?page=planning, ?action=add-job
function handleLaunchParams() {
  let p;
  try { p = new URLSearchParams(location.search); } catch(e) { return; }
  const page = p.get('page');
  if(page && document.getElementById('page-'+page)) showPage(page);
  if(p.get('action') === 'add-job') setTimeout(openAddJob, 150);
  if(page || p.get('action')) {
    try { history.replaceState(null, '', location.pathname); } catch(e) {}
  }
}

function loadSample() {
  JT.persons = [
    {id:6,name:"Aarian K",location:"COK",position:"NA"},{id:3,name:"Adith R",location:"COK",position:"MANAGER"},
    {id:7,name:"Afrin M",location:"COK",position:"NA"},{id:8,name:"Agna C",location:"COK",position:"NA"},
    {id:10,name:"Akash P",location:"COK",position:"MODELLER"},{id:11,name:"Akhil M",location:"COK",position:"ESTIMATOR"},
    {id:12,name:"Ambareesh M",location:"COK",position:"NA"},{id:30,name:"Anbarasan D",location:"COK",position:"NA"},
    {id:13,name:"Arun M",location:"COK",position:"NA"},{id:25,name:"David C",location:"HO",position:"NA"},
    {id:29,name:"Dushan D",location:"HO",position:"NA"},{id:27,name:"Gokul A",location:"HO",position:"NA"},
    {id:24,name:"Gunaseelan R",location:"HO",position:"NA"},{id:20,name:"Hareesh B",location:"HO",position:"MANAGER"},
    {id:26,name:"Kunjachan T",location:"HO",position:"NA"},{id:14,name:"Lakshmi H",location:"COK",position:"NA"},
    {id:17,name:"Manaf A",location:"COK",position:"NA"},{id:28,name:"Nidhin N",location:"HO",position:"NA"},
    {id:23,name:"Pranav P",location:"HO",position:"NA"},{id:15,name:"Rajesh E",location:"COK",position:"ESTIMATOR"},
    {id:18,name:"Shejeer N",location:"COK",position:"MODELLER"},{id:19,name:"Sreelakhsmi K",location:"COK",position:"NA"}
  ];
  const t = new Date(), fmt = d=>localDateStr(d), ad = (d,n)=>{let x=new Date(d);x.setDate(x.getDate()+n);return x};
  JT.jobs = [
    {id:330,jobNumber:"DU4560",clientName:"Zakher Marine Intl Inc",vesselName:"MOU PILI PILI",jobScope:"Lightship weight estimation",receiptDate:fmt(t),targetDate:fmt(ad(t,4)),plannedStartDate:fmt(ad(t,3)),daysRequired:1,personInCharge:"Akhil M",location:"COK",status:"not planned",priorityLevel:"urgent",completionPercentage:0,qcDone:false,qcDoneBy:null,remark:null,isRework:false,parentJobId:null,revisionNumber:null},
    {id:326,jobNumber:"DG3348",clientName:"PT. ASL SHIPYARD INDONESIA",vesselName:"ASL BULAN",jobScope:"Stability update for conversion",receiptDate:fmt(ad(t,-1)),targetDate:fmt(ad(t,3)),plannedStartDate:fmt(t),daysRequired:2,personInCharge:"Aarian K",location:"COK",status:"rework ongoing",priorityLevel:"urgent",completionPercentage:80,startDate:fmt(t),qcDone:false,qcDoneBy:null,remark:null,isRework:true,parentJobId:55,revisionNumber:"2"},
    {id:325,jobNumber:"DN14791",clientName:"Dulam International Ltd.",vesselName:"Azuma",jobScope:"HULL AND TANK MODELLING",receiptDate:fmt(ad(t,-1)),targetDate:fmt(ad(t,6)),plannedStartDate:fmt(ad(t,-1)),daysRequired:5,personInCharge:"Akash P",location:"COK",status:"ongoing",priorityLevel:"urgent",completionPercentage:10,startDate:fmt(t),qcDone:false,qcDoneBy:null,remark:null,isRework:false,parentJobId:null,revisionNumber:null},
    {id:324,jobNumber:"DU5036",clientName:"ZMI HOLDING",vesselName:"DIXIE PATRIOT",jobScope:"ADDENDUM TO STABILITY",receiptDate:fmt(ad(t,-1)),targetDate:fmt(ad(t,2)),plannedStartDate:fmt(ad(t,2)),daysRequired:2,personInCharge:"Manaf A",location:"COK",status:"planned",priorityLevel:"urgent",completionPercentage:0,qcDone:false,qcDoneBy:null,remark:null,isRework:false,parentJobId:null,revisionNumber:null},
    {id:322,jobNumber:"DG3200",clientName:"Maersk",vesselName:"Maersk Phuket",jobScope:"Final Intact and Damage, Freeboard Calculation",receiptDate:fmt(ad(t,-3)),targetDate:fmt(ad(t,6)),plannedStartDate:fmt(ad(t,2)),daysRequired:5,personInCharge:"David C",location:"HO",status:"planned",priorityLevel:"urgent",completionPercentage:0,qcDone:false,qcDoneBy:null,remark:null,isRework:false,parentJobId:null,revisionNumber:null},
    {id:323,jobNumber:"DN14124",clientName:"PREMIRE MARINE",vesselName:"AL DANAH",jobScope:"Equipment number",receiptDate:fmt(ad(t,-1)),targetDate:fmt(ad(t,-1)),plannedStartDate:fmt(ad(t,-1)),daysRequired:1,personInCharge:"David C",location:"HO",status:"complete",priorityLevel:"medium",completionPercentage:100,qcDone:true,qcDoneBy:"David C",completionDate:fmt(ad(t,-1)),remark:null,isRework:false,parentJobId:null,revisionNumber:null},
    {id:319,jobNumber:"DS6535",clientName:"ClearWin",vesselName:"Barge Mylo",jobScope:"Stability analysis review",receiptDate:fmt(ad(t,-3)),targetDate:fmt(ad(t,-1)),plannedStartDate:fmt(ad(t,2)),daysRequired:1,personInCharge:"Kunjachan T",location:"HO",status:"planned",priorityLevel:"medium",completionPercentage:0,qcDone:false,qcDoneBy:null,remark:null,isRework:false,parentJobId:null,revisionNumber:null},
    {id:317,jobNumber:"DN14804",clientName:"Shipworkz Marine Services LLC",vesselName:"MAG ARES",jobScope:"HULL AND TANK MODELLING",receiptDate:fmt(ad(t,-12)),targetDate:fmt(ad(t,-1)),plannedStartDate:fmt(ad(t,-4)),daysRequired:3,personInCharge:"Akash P",location:"COK",status:"ongoing",priorityLevel:"medium",completionPercentage:0,qcDone:false,qcDoneBy:null,remark:null,isRework:false,parentJobId:null,revisionNumber:null},
    {id:255,jobNumber:"DN14804",clientName:"Shipworkz Marine Services LLC",vesselName:"MAG ARES",jobScope:"Addendum to Intact Stability Booklet",receiptDate:fmt(ad(t,-17)),targetDate:fmt(ad(t,-1)),plannedStartDate:fmt(ad(t,-2)),daysRequired:4,personInCharge:"Aarian K",location:"COK",status:"hold",priorityLevel:"medium",completionPercentage:0,holdStartDate:fmt(ad(t,-2)),qcDone:false,qcDoneBy:null,remark:"Awaiting client documents",isRework:false,parentJobId:null,revisionNumber:null},
    {id:314,jobNumber:"DU5352",clientName:"BLUE GULF SHIP BUILDERS",vesselName:"Astro Achernar",jobScope:"Addendum to stability booklet",receiptDate:fmt(ad(t,-4)),targetDate:fmt(ad(t,4)),plannedStartDate:fmt(ad(t,-2)),daysRequired:5,personInCharge:"Nidhin N",location:"HO",status:"cancelled",priorityLevel:"medium",completionPercentage:0,qcDone:false,qcDoneBy:null,remark:null,isRework:false,parentJobId:null,revisionNumber:null},
    {id:300,jobNumber:"DG3648",clientName:"Maersk A/S",vesselName:"Maersk Cunene",jobScope:"Inclining Experiment Procedure",receiptDate:fmt(ad(t,-4)),targetDate:fmt(ad(t,3)),plannedStartDate:fmt(t),daysRequired:3,personInCharge:"Aarian K",location:"COK",status:"ongoing",priorityLevel:"medium",completionPercentage:0,qcDone:false,qcDoneBy:null,remark:null,isRework:false,parentJobId:null,revisionNumber:null},
    {id:299,jobNumber:"DB2438",clientName:"Al Hassanain Co W.L.L",vesselName:"Fatah barge",jobScope:"Addendum to Stability Booklet",receiptDate:fmt(ad(t,-2)),targetDate:fmt(ad(t,1)),plannedStartDate:fmt(t),daysRequired:3,personInCharge:"Afrin M",location:"COK",status:"ongoing",priorityLevel:"urgent",completionPercentage:0,qcDone:false,qcDoneBy:null,remark:null,isRework:false,parentJobId:null,revisionNumber:null},
    {id:303,jobNumber:"DG3249",clientName:"Berge Bulk",vesselName:"Berge meru",jobScope:"Final Intact Stability",receiptDate:fmt(ad(t,-1)),targetDate:fmt(ad(t,3)),plannedStartDate:fmt(t),daysRequired:3,personInCharge:"Gunaseelan R",location:"HO",status:"not planned",priorityLevel:"urgent",completionPercentage:0,qcDone:false,qcDoneBy:null,remark:null,isRework:false,parentJobId:null,revisionNumber:null}
  ];
  JT.upcomingJobs = [{id:9,vesselName:"Stanford Bravo",jobScope:"Addendum to Anchor Handling",receiptDate:fmt(ad(t,-5)),targetDate:fmt(ad(t,3)),plannedStartDate:fmt(ad(t,3)),daysRequired:5,personInCharge:"Manaf A",location:"COK",status:"planned",priorityLevel:"top urgent",notes:null}];
  save();
}

// ===================== UTILS =====================
const today = () => {
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
};
const localDateStr = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const fmtD = d => { if(!d) return '—'; return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}); };
const fmtDL = d => { if(!d) return '—'; return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); };
const addDays = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
const isWeekday = d => { const day=new Date(d).getDay(); return day!==0&&day!==6; };
function weekStart(d) { const x=new Date(d); x.setHours(0,0,0,0); const day=x.getDay(); x.setDate(x.getDate()-(day===0?6:day-1)); return x; }
const isOverdue = j => !['complete','cancelled','hold','rework completed'].includes(j.status) && j.targetDate && j.targetDate < today();
const isApproaching = j => { if(['complete','cancelled','hold'].includes(j.status)||!j.targetDate) return false; const diff=Math.ceil((new Date(j.targetDate)-new Date())/86400000); return diff>=0&&diff<=3; };
const initials = n => n.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
const nextId = () => { const ids=[...JT.jobs.map(j=>j.id),...JT.persons.map(p=>p.id),...JT.upcomingJobs.map(u=>u.id||0)]; return (Math.max(0,...ids)||0)+1; };

// ── Rendering helpers (presentation only) ──
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// A JS string literal that is safe inside an HTML attribute, e.g. onclick="fn(${jsArg(name)})"
const jsArg = s => esc(JSON.stringify(String(s ?? '')));
const ic = name => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;
// Escape text and wrap matches of the current search term in <mark>
function hl(text, term) {
  const s = String(text ?? '');
  if(!term) return esc(s);
  const lower = s.toLowerCase();
  let out = '', i = 0, idx;
  while((idx = lower.indexOf(term, i)) !== -1) {
    out += esc(s.slice(i, idx)) + '<mark>' + esc(s.slice(idx, idx + term.length)) + '</mark>';
    i = idx + term.length;
  }
  return out + esc(s.slice(i));
}
const isPageActive = name => !!document.getElementById('page-'+name)?.classList.contains('active');
const PAGE_TITLES = { dashboard:'Dashboard', jobs:'Jobs', planning:'Planning', upcoming:'Upcoming', persons:'Persons', settings:'Settings & Data', reports:'Reports' };

function statusBadge(s) {
  const map={
    'ongoing':'b-ongoing','planned':'b-planned','not planned':'b-not-planned',
    'complete':'b-complete','rework ongoing':'b-rework-ongoing','rework planned':'b-rework-planned',
    'rework completed':'b-rework-completed','hold':'b-hold','cancelled':'b-cancelled'
  };
  return `<span class="badge ${map[s]||'b-not-planned'}">${esc(s||'—')}</span>`;
}
function priorityBadge(p) {
  const map={'top urgent':'b-top-urgent','urgent':'b-urgent','medium':'b-medium','low':'b-low'};
  return `<span class="badge ${map[p]||'b-low'}">${esc(p||'—')}</span>`;
}
function isReworkStatus(s) { return s&&s.startsWith('rework'); }

// Status options for dropdowns
const REGULAR_STATUSES = ['not planned','planned','ongoing','hold','complete','cancelled'];
const REWORK_STATUSES = ['rework planned','rework ongoing','rework completed'];
const ALL_STATUSES = [...REGULAR_STATUSES,'rework ongoing','rework planned','rework completed'];

// ===================== RENDER ALL =====================
function renderAll() {
  // v1 cleared the planning date cache only inside renderPlanning(), after the
  // dashboard had already used it — so availability could lag one change behind.
  clearJobDateCache();
  updateSidebarCounts();
  renderDashboard();
  // Heavy pages are rebuilt only when visible; showPage() rebuilds them on open.
  if(isPageActive('jobs')) renderJobsPage();
  if(isPageActive('planning')) renderPlanning();
  renderUpcoming();
  renderPersons();
  populatePersonDropdowns();
  populatePersonFilter();
  populatePlanPersonFilter();
  if(isPageActive('reports')) renderReports();
}

// ===================== SIDEBAR =====================
function updateSidebarCounts() {
  const jobs = JT.jobs;
  const reworkJobs = jobs.filter(j=>isReworkStatus(j.status));
  document.getElementById('sfc-all').textContent = jobs.length;
  document.getElementById('sfc-active').textContent = jobs.filter(j=>['ongoing','planned'].includes(j.status)).length;
  document.getElementById('sfc-ongoing').textContent = jobs.filter(j=>j.status==='ongoing').length;
  document.getElementById('sfc-planned').textContent = jobs.filter(j=>j.status==='planned').length;
  document.getElementById('sfc-not-planned').textContent = jobs.filter(j=>j.status==='not planned').length;
  document.getElementById('sfc-rework').textContent = reworkJobs.length;
  document.getElementById('sfc-hold').textContent = jobs.filter(j=>j.status==='hold').length;
  document.getElementById('sfc-complete').textContent = jobs.filter(j=>j.status==='complete').length;
  document.getElementById('sfc-cancelled').textContent = jobs.filter(j=>j.status==='cancelled').length;
  document.getElementById('sfc-overdue').textContent = jobs.filter(j=>isOverdue(j)).length;
  // tab counts
  ['all','active','ongoing','planned','not planned','rework','hold','complete','cancelled'].forEach(tab => {
    const el = document.getElementById('tc-'+tab.replace(' ','-'));
    if(!el) return;
    let count;
    if(tab==='all') count = jobs.length;
    else if(tab==='active') count = jobs.filter(j=>['ongoing','planned'].includes(j.status)).length;
    else if(tab==='rework') count = reworkJobs.length;
    else count = jobs.filter(j=>j.status===tab).length;
    el.textContent = count;
  });
  const tco = document.getElementById('tc-overdue');
  if(tco) tco.textContent = document.getElementById('sfc-overdue').textContent;
  const navc = document.getElementById('navc-jobs');
  if(navc) navc.textContent = jobs.length;
}

function setSideFilter(f, el) {
  currentSideFilter = f;
  document.querySelectorAll('.sidebar-item').forEach(i=>i.classList.remove('active'));
  el.classList.add('active');
  showPage('jobs', document.querySelector('.nav-btn:nth-child(2)'));
  // v1 passed 'all' for the Overdue item, so it showed every job; it now opens the Overdue view.
  setJobTab(f, null);
  renderJobsPage();
  if(typeof updateClearBtn==='function') updateClearBtn();
}
function setSideLocFilter(loc, el) {
  currentSideLocFilter = loc;
  document.querySelectorAll('[id^="sl-"]').forEach(i=>i.classList.remove('active'));
  el.classList.add('active');
  if(document.getElementById('jobLocFilter')) document.getElementById('jobLocFilter').value = loc;
  renderJobsPage();
  if(typeof updateClearBtn==='function') updateClearBtn();
}

// ===================== PAGE NAV =====================
function showPage(name, btn) {
  const wasActive = isPageActive(name);
  document.querySelectorAll('.page').forEach(p=>{ p.classList.remove('active','page-enter'); p.style.display='none'; });
  const pg = document.getElementById('page-'+name);
  if(pg) {
    pg.classList.add('active'); pg.style.display='';
    if(!wasActive) { void pg.offsetWidth; pg.classList.add('page-enter'); setTimeout(()=>pg.classList.remove('page-enter'), 700); }
  }
  // Highlight every navigation control for this page (sidebar + bottom nav), whichever was clicked
  const bottomPages = ['dashboard','jobs','planning','reports'];
  document.querySelectorAll('.nav-btn, .bnav-btn').forEach(b => {
    const on = b.dataset.page ? b.dataset.page === name : (b.dataset.more && !bottomPages.includes(name));
    b.classList.toggle('active', !!on);
    if(on && b.dataset.page) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
  });
  const title = PAGE_TITLES[name] || 'Job Tracker';
  const tt = document.getElementById('topbarTitle'); if(tt) tt.textContent = title;
  document.title = `${title} · Job Tracker – Stability`;
  if(typeof closeDrawer === 'function') closeDrawer();
  const stBtn = document.getElementById('rptScrollTop');
  if(stBtn) stBtn.style.display = 'none';
  const content = document.getElementById('contentScroll');
  if(content) content.scrollTop = 0;
  if(name==='jobs') renderJobsPage();
  if(name==='planning') renderPlanning();
  if(name==='upcoming') renderUpcoming();
  if(name==='persons') renderPersons();
  if(name==='reports') renderReports();
  if(name==='settings') renderSettingsInfo();
}

// ===================== DASHBOARD =====================

function setDashAvailLoc(loc) {
  _dashAvailLoc = loc;
  const activeId = loc===''?'dashAvailAll':loc==='HO'?'dashAvailHO':'dashAvailCOK';
  ['dashAvailAll','dashAvailHO','dashAvailCOK'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    el.classList.toggle('active', id===activeId);
    el.setAttribute('aria-pressed', id===activeId ? 'true' : 'false');
  });
  renderAvailability(loc);
}

function renderDashboard() {
  const jobs = JT.jobs;
  const overdueJobs = jobs.filter(isOverdue);
  const activeJobs = jobs.filter(j=>['ongoing','planned','rework ongoing','rework planned'].includes(j.status));
  const reworkJobs = jobs.filter(j=>isReworkStatus(j.status));

  // Alert banner
  const urgentCount = overdueJobs.length + jobs.filter(isApproaching).length;
  if(urgentCount > 0) {
    document.getElementById('dashAlert').style.display = 'flex';
    document.getElementById('dashAlertTitle').textContent = 'Urgent: Target Dates Approaching';
    document.getElementById('dashAlertBody').textContent = `${urgentCount} job${urgentCount>1?'s':''} need immediate attention — go to Jobs page to view`;
  } else {
    document.getElementById('dashAlert').style.display = 'none';
  }

  // Stat cards (same counts as v1)
  const total = jobs.length;
  const cards = [
    { cls:'s-total',      tab:'all',         label:'Total Jobs',  val:total,                                             icon:'briefcase' },
    { cls:'s-active',     tab:'active',      label:'Active',      val:activeJobs.length,                                 icon:'zap' },
    { cls:'s-notplanned', tab:'not planned', label:'Not Planned', val:jobs.filter(j=>j.status==='not planned').length,   icon:'hourglass' },
    { cls:'s-overdue',    tab:'overdue',     label:'Overdue',     val:overdueJobs.length,                                icon:'alert' },
    { cls:'s-hold',       tab:'hold',        label:'On Hold',     val:jobs.filter(j=>j.status==='hold').length,          icon:'pause' },
    { cls:'s-rework',     tab:'rework',      label:'Rework',      val:reworkJobs.length,                                 icon:'rework' },
    { cls:'s-complete',   tab:'complete',    label:'Complete',    val:jobs.filter(j=>j.status==='complete').length,      icon:'check-circle' },
    { cls:'s-cancelled',  tab:'cancelled',   label:'Cancelled',   val:jobs.filter(j=>j.status==='cancelled').length,     icon:'ban' },
  ];
  const statRow = document.getElementById('statRow');
  statRow.innerHTML = cards.map(c => {
    const share = total ? Math.round(c.val / total * 100) : 0;
    return `<button type="button" class="stat-card ${c.cls}" onclick="filterAndGo('${c.tab}')" aria-label="${c.label}: ${c.val} (${share}% of all jobs). Show these jobs">
      <span class="stat-label">${c.label}</span>
      <span class="stat-icon">${ic(c.icon)}</span>
      <span class="stat-val" data-count="${c.val}" data-key="stat-${c.tab}" aria-hidden="true">${c.val}</span>
      <span class="stat-bar" aria-hidden="true"><span style="--pct:${c.tab==='all'?100:share}%"></span></span>
      <span class="stat-foot" aria-hidden="true">${c.tab==='all' ? `${jobs.filter(isApproaching).length} due in the next 3 days` : `${share}% of all jobs`}</span>
    </button>`;
  }).join('');
  if(typeof animateCounters === 'function') animateCounters(statRow);

  renderDashInsights(jobs, activeJobs, overdueJobs);

  const dd = document.getElementById('dashDate');
  if(dd) dd.textContent = new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  // Full-width availability panel
  renderAvailability(_dashAvailLoc);
}

// ── Dashboard insights (new, read-only summaries; they do not change any stored data) ──
function renderDashInsights(jobs, activeJobs, overdueJobs) {
  const el = document.getElementById('dashInsights');
  if(!el) return;
  const t = today();
  const doneStatuses = ['complete','rework completed'];
  const done = jobs.filter(j => doneStatuses.includes(j.status));
  const cancelled = jobs.filter(j => j.status === 'cancelled').length;
  const base = jobs.length - cancelled;
  const completionRate = base ? Math.round(done.length / base * 100) : 0;
  const avgActive = activeJobs.length ? Math.round(activeJobs.reduce((s,j)=>s+(j.completionPercentage||0),0) / activeJobs.length) : 0;
  const withDates = done.filter(j => j.completionDate && j.targetDate);
  const onTime = withDates.length ? Math.round(withDates.filter(j => j.completionDate <= j.targetDate).length / withDates.length * 100) : null;
  const pending = jobs.filter(j => ['not planned','planned','rework planned'].includes(j.status)).length;
  const ym = t.slice(0,7);
  const doneThisMonth = done.filter(j => (j.completionDate||'').startsWith(ym)).length;

  // Status distribution
  const groups = [
    { label:'Ongoing',     tab:'ongoing',     c:'var(--success)',    n: jobs.filter(j=>j.status==='ongoing').length },
    { label:'Planned',     tab:'planned',     c:'var(--primary)',    n: jobs.filter(j=>j.status==='planned').length },
    { label:'Not planned', tab:'not planned', c:'var(--gray-dot)',   n: jobs.filter(j=>j.status==='not planned').length },
    { label:'Rework',      tab:'rework',      c:'var(--warning)',    n: jobs.filter(j=>isReworkStatus(j.status)).length },
    { label:'On hold',     tab:'hold',        c:'var(--purple-dot)', n: jobs.filter(j=>j.status==='hold').length },
    { label:'Complete',    tab:'complete',    c:'var(--accent)',     n: jobs.filter(j=>j.status==='complete').length },
    { label:'Cancelled',   tab:'cancelled',   c:'var(--border2)',    n: cancelled },
  ];
  const R = 46, C = 2 * Math.PI * R;

  // Due in the next 7 days (not finished)
  const in7 = localDateStr(addDays(new Date(), 7));
  const dueSoon = jobs.filter(j => !['complete','cancelled','hold','rework completed'].includes(j.status) && j.targetDate && j.targetDate >= t && j.targetDate <= in7)
    .sort((a,b) => a.targetDate.localeCompare(b.targetDate));

  // Smart summary
  const insights = [];
  if(overdueJobs.length) {
    const worst = [...overdueJobs].sort((a,b) => a.targetDate.localeCompare(b.targetDate))[0];
    const late = Math.round((new Date(t) - new Date(worst.targetDate)) / 86400000);
    insights.push({ icon:'alert', c:'var(--red)', html:`<strong>${overdueJobs.length} job${overdueJobs.length>1?'s are':' is'} overdue.</strong> Most overdue: <button type="button" class="link-btn" onclick="goToJob(${worst.id})">${esc(worst.vesselName||'—')}</button> (${late} day${late!==1?'s':''} late).` });
  } else {
    insights.push({ icon:'check-circle', c:'var(--green)', html:`<strong>No overdue jobs.</strong> Every active job is within its target date.` });
  }
  insights.push({ icon:'layers', c:'var(--primary-text)', html:`<strong>${pending} pending scope${pending!==1?'s':''}</strong> waiting to start (not planned, planned or rework planned). <button type="button" class="link-btn" onclick="filterAndGo('not planned')">View not planned</button>` });
  const load = {};
  activeJobs.forEach(j => { if(j.personInCharge) load[j.personInCharge] = (load[j.personInCharge]||0) + 1; });
  const busiest = Object.entries(load).sort((a,b) => b[1]-a[1])[0];
  const freeNow = JT.persons.filter(p => !JT.jobs.some(j => !['complete','rework completed','cancelled'].includes(j.status) && (j.personInCharge===p.name || j.sharedJobDetails?.some(s=>s.personName===p.name)))).length;
  if(busiest) insights.push({ icon:'users', c:'var(--purple)', html:`<strong>${esc(busiest[0])}</strong> has the most active jobs (${busiest[1]}). <strong>${freeNow}</strong> of ${JT.persons.length} people are free now.` });
  insights.push({ icon:'trending', c:'var(--accent-text)', html:`<strong>${doneThisMonth}</strong> job${doneThisMonth!==1?'s':''} completed this month${onTime!==null?`; <strong>${onTime}%</strong> of completed jobs were delivered on or before target`:''}.` });

  el.innerHTML = `
    <div class="section-card">
      <div class="section-card-title"><h2>${ic('trending')}Progress statistics</h2></div>
      <div class="progress-stats">
        <div class="ring" role="img" aria-label="Completion rate ${completionRate}% (completed jobs out of all non-cancelled jobs)">
          <svg viewBox="0 0 112 112" aria-hidden="true"><circle class="ring-track" cx="56" cy="56" r="${R}"/><circle class="ring-val" cx="56" cy="56" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}" data-offset="${(C*(1-completionRate/100)).toFixed(1)}"/></svg>
          <div class="ring-label"><strong>${completionRate}%</strong><span>completed</span></div>
        </div>
        <div class="kv-list">
          <div class="kv"><div class="kv-top"><span>Average progress of active jobs</span><strong>${avgActive}%</strong></div><div class="bar" role="progressbar" aria-label="Average progress of active jobs" aria-valuenow="${avgActive}" aria-valuemin="0" aria-valuemax="100"><span style="--pct:${avgActive}%;--c:var(--success)"></span></div></div>
          <div class="kv"><div class="kv-top"><span>On-time delivery</span><strong>${onTime===null?'—':onTime+'%'}</strong></div><div class="bar" role="progressbar" aria-label="On-time delivery" aria-valuenow="${onTime||0}" aria-valuemin="0" aria-valuemax="100"><span style="--pct:${onTime||0}%;--c:var(--accent)"></span></div></div>
          <div class="kv"><div class="kv-top"><span>Pending scopes</span><strong>${pending}</strong></div><div class="bar" aria-hidden="true"><span style="--pct:${jobs.length?Math.round(pending/jobs.length*100):0}%;--c:var(--primary)"></span></div></div>
        </div>
      </div>
      <div class="dist-bar" role="img" aria-label="Status distribution: ${groups.map(g=>`${g.label} ${g.n}`).join(', ')}">
        ${groups.filter(g=>g.n).map(g=>`<span style="--w:${g.n};--c:${g.c}" title="${g.label}: ${g.n}"></span>`).join('')}
      </div>
      <div class="legend">${groups.map(g=>`<button type="button" onclick="filterAndGo('${g.tab}')"><i style="--c:${g.c}"></i>${g.label} <b>${g.n}</b></button>`).join('')}</div>
    </div>
    <div class="section-card">
      <div class="section-card-title"><h2>${ic('sparkles')}Smart summary</h2></div>
      <ul class="insights">${insights.map(i=>`<li class="insight"><span class="insight-ic" style="--ct:${i.c}">${ic(i.icon)}</span><div class="insight-body">${i.html}</div></li>`).join('')}</ul>
      <h3 class="ds-kicker" style="margin-top:var(--s4)">Due in the next 7 days (${dueSoon.length})</h3>
      ${dueSoon.length ? `<ul class="due-list">${dueSoon.slice(0,5).map(j=>`<li><button type="button" class="due-item" onclick="goToJob(${j.id})">
          <span class="due-date ${j.targetDate===t?'is-today':''}">${j.targetDate===t?'Today':fmtD(j.targetDate)}</span>
          <span class="due-main"><strong>${esc(j.vesselName||'—')}</strong><span>${esc(j.jobScope||'—')} · ${esc(j.personInCharge||'Unassigned')}</span></span>
          <span class="due-pct">${j.completionPercentage||0}%</span></button></li>`).join('')}</ul>`
        : `<p class="form-note">Nothing due in the next 7 days.</p>`}
    </div>`;
  // Animate the ring after paint
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const ring = el.querySelector('.ring-val');
    if(ring) ring.style.strokeDashoffset = ring.dataset.offset;
  }));
}

function goToJob(id) {
  openJobChipPopup({ stopPropagation(){} }, id);
}

function filterAndGo(tab) {
  showPage('jobs', document.querySelectorAll('.nav-btn')[1]);
  setJobTab(tab, null);
  renderJobsPage();
}

// ===================== JOB CARD =====================
// Expanded job rows survive re-renders
const _expandedJobs = new Set();

function renderJobCard(j, term) {
  const over = isOverdue(j);
  const approaching = isApproaching(j);
  const pct = j.completionPercentage || 0;
  const statusOpts = (j.isRework ? ['rework planned','rework ongoing','rework completed']
    : ['not planned','planned','ongoing','hold','complete','cancelled'])
    .map(s=>`<option value="${s}"${j.status===s?' selected':''}>${s}</option>`).join('');
  const vessel = j.vesselName || '';
  const person = j.personInCharge || '';
  const label = `${j.jobNumber||'Job'} ${vessel}`.trim();
  const reworkRefs = j.status==='complete' && j.reworkHistory ? j.reworkHistory.filter(r=>r.reworkJobId).length : 0;
  const expanded = _expandedJobs.has(j.id);
  const flags = over ? `<span class="badge b-overdue">${ic('alert')}Overdue</span>` : approaching ? `<span class="badge b-due-soon">${ic('clock')}Due soon</span>` : '';
  const statusBadges = `${statusBadge(j.status)}${j.isRework?`<span class="badge b-isrework">RW Rev.${esc(j.revisionNumber||'1')}</span>`:''}${reworkRefs?`<span class="badge b-isrework">${ic('rework')}${reworkRefs} Rework${reworkRefs>1?'s':''}</span>`:''}`;

  // Context-dependent actions (same handlers as v1)
  const ctx = j.status==='complete'
    ? `<button type="button" class="act-btn rework" onclick="openReworkDialog(${j.id})" title="Reopen as Rework" aria-label="Reopen ${esc(label)} as rework">${ic('rework')}<span class="lbl">Rework</span></button>
       <button type="button" class="act-btn qc" onclick="openChangeQC(${j.id})" title="Change QC" aria-label="Change QC for ${esc(label)}">${ic('check')}<span class="lbl">QC</span></button>`
    : j.status==='hold'
      ? `<button type="button" class="act-btn resume" onclick="resumeJob(${j.id})" title="Resume" aria-label="Resume ${esc(label)}">${ic('play')}<span class="lbl">Resume</span></button>`
      : `<button type="button" class="act-btn hold${j.holdStartDate?' is-on':''}" onclick="openHold(${j.id})" title="${j.holdStartDate?'Manage Hold':'Hold Job'}" aria-label="${j.holdStartDate?'Manage hold for':'Hold'} ${esc(label)}">${ic('pause')}<span class="lbl">${j.holdStartDate?'Manage hold':'Hold'}</span></button>`;

  return `<article class="jrow ${over?'overdue':approaching?'due-soon':''}${expanded?' expanded':''}" id="jcard-${j.id}" aria-label="${esc(label)}">
    <div class="jrow-progress" style="--pct:${Math.min(100,pct)}%" aria-hidden="true"></div>
    <div class="jrow-main">
      <button type="button" class="jrow-expand" onclick="toggleJobDetails(${j.id},this)" aria-expanded="${expanded}" aria-controls="jdet-${j.id}" aria-label="Details for ${esc(label)}">${ic('chevron-down')}</button>
      <div class="jc jc-num">
        <span class="badge b-jobnum">${hl(j.jobNumber||'—', term)}</span>
        ${flags}
        <span class="jc-mobile-badges">${statusBadges}${priorityBadge(j.priorityLevel)}</span>
      </div>
      <div class="jc jc-vessel">
        <button type="button" class="link-btn jrow-title" onclick="filterByVessel(${jsArg(vessel)})" title="Show all jobs for ${esc(vessel)}">${hl(vessel||'—', term)}</button>
        <div class="jrow-sub" title="${esc(j.clientName)}">${hl(j.clientName||'—', term)}</div>
      </div>
      <div class="jc jc-scope">
        <div class="jrow-scope" title="${esc(j.jobScope)}">${hl(j.jobScope||'—', term)}</div>
        ${j.remark?`<div class="jrow-remark" title="${esc(j.remark)}">${esc(j.remark)}</div>`:''}
      </div>
      <div class="jc jc-person">
        ${person?`<button type="button" class="link-btn" onclick="filterByPerson(${jsArg(person)})" title="Show jobs for ${esc(person)}">${hl(person, term)}</button>`:'<span class="muted">Unassigned</span>'}
        <span class="jrow-sub">${esc(j.location)}</span>
      </div>
      <div class="jc jc-status">${statusBadges}</div>
      <div class="jc jc-priority">${priorityBadge(j.priorityLevel)}</div>
      <div class="jc jc-meta">
        <span class="meta-item">${ic('users')}${person?`<button type="button" class="link-btn" onclick="filterByPerson(${jsArg(person)})">${hl(person, term)}</button>`:'<span class="muted">Unassigned</span>'}</span>
        <span class="meta-item">${ic('map-pin')}${esc(j.location||'—')}</span>
      </div>
      <div class="jc jc-target">
        <div class="jrow-date ${over?'is-over':''}"><small>Target</small>${fmtD(j.targetDate)}</div>
        <div class="mini-progress" role="progressbar" aria-label="Completion" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="--pct:${Math.min(100,pct)}%"></span></div>
        <span class="mini-pct">${pct}%</span>
      </div>
      <div class="jc jc-actions">
        <label class="sr-only" for="st-${j.id}">Status for ${esc(label)}</label>
        <select id="st-${j.id}" class="status-select" onchange="quickStatusChange(${j.id},this.value)" title="Status">${statusOpts}</select>
        <form class="pct-form" onsubmit="quickPctChange(${j.id},this.pct.value);return false;">
          <input name="pct" type="number" inputmode="numeric" min="0" max="100" value="${pct}" title="Completion %" aria-label="Completion percent for ${esc(label)}"
            onfocus="this.select()"
            onblur="if(this.value!==String(${pct}))quickPctChange(${j.id},this.value)">
          <span aria-hidden="true">%</span>
        </form>
        <div class="act-group" role="group" aria-label="Actions for ${esc(label)}">
          <button type="button" class="act-btn edit" onclick="openEditJob(${j.id})" title="Edit" aria-label="Edit ${esc(label)}">${ic('edit')}<span class="lbl">Edit</span></button>
          <button type="button" class="act-btn reassign" onclick="openReassign(${j.id})" title="Reassign" aria-label="Reassign ${esc(label)}">${ic('reassign')}<span class="lbl">Reassign</span></button>
          <button type="button" class="act-btn shift" onclick="openShiftDate(${j.id})" title="Shift Date" aria-label="Shift target date of ${esc(label)}">${ic('cal-shift')}<span class="lbl">Date</span></button>
          <button type="button" class="act-btn priority" onclick="openPriority(${j.id})" title="Priority" aria-label="Change priority of ${esc(label)}">${ic('flag')}<span class="lbl">Priority</span></button>
          ${ctx}
          <button type="button" class="act-btn share" onclick="openShareJob(${j.id})" title="Share job with another person" aria-label="Share ${esc(label)} with another person">${ic('share')}<span class="lbl">Share</span></button>
          <button type="button" class="act-btn del" onclick="deleteJob(${j.id})" title="Delete" aria-label="Delete ${esc(label)}">${ic('trash')}<span class="lbl">Delete</span></button>
        </div>
      </div>
    </div>
    <div class="jrow-details${expanded?' open':''}" id="jdet-${j.id}"${expanded?'':' hidden'}><div class="jd-inner">${expanded?jobDetailsHTML(j):''}</div></div>
  </article>`;
}

// Expand / collapse the details panel of a job row
function toggleJobDetails(id, btn) {
  const panel = document.getElementById('jdet-'+id);
  const j = JT.jobs.find(x=>x.id===id);
  if(!panel || !j) return;
  const open = btn.getAttribute('aria-expanded') !== 'true';
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn.closest('.jrow')?.classList.toggle('expanded', open);
  if(open) {
    _expandedJobs.add(id);
    panel.querySelector('.jd-inner').innerHTML = jobDetailsHTML(j);
    panel.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('open')));
  } else {
    _expandedJobs.delete(id);
    panel.classList.remove('open');
    const done = () => { if(!panel.classList.contains('open')) panel.hidden = true; };
    panel.addEventListener('transitionend', done, { once:true });
    setTimeout(done, 400);
  }
}

function jobDetailsHTML(j) {
  const item = (label, val) => `<div class="jd-item"><dt>${label}</dt><dd>${val}</dd></div>`;
  const v = x => (x===null||x===undefined||x==='') ? '<span class="muted">—</span>' : esc(x);
  const rows = [
    item('Receipt date', fmtDL(j.receiptDate)),
    item('Target date', fmtDL(j.targetDate)),
    item('Planned start', fmtDL(j.plannedStartDate)),
    item('Start date', fmtDL(j.startDate)),
    item('Days required', v(j.daysRequired)),
    item('Completion', `${j.completionPercentage||0}%`),
    item('Completion date', fmtDL(j.completionDate)),
    item('Actual days', v(j.actualDaysToComplete)),
    item('QC', j.qcDone ? `Done${j.qcDoneBy?' by '+esc(j.qcDoneBy):''}` : (j.qcDoneBy ? `QC by ${esc(j.qcDoneBy)} (pending)` : '<span class="muted">Pending</span>')),
    item('Est. manhours', j.estimatedManhours ? fmtMH(j.estimatedManhours) : v(null)),
    item('Manhours used', j.manhoursConsumed ? fmtMH(j.manhoursConsumed) : v(null)),
    item('Manhour cost', j.manhourCost ? fmtCurrency(j.manhourCost) : v(null)),
    item('Invoice', j.invoiceAmount ? `${fmtCurrency(j.invoiceAmount)} <span class="muted">(${j.invoiceType==='per'?'per scope':'lump sum'})</span>` : v(null)),
    item('Job ID', esc(j.id)),
  ];
  if(j.isRework) rows.push(item('Rework', `Rev. ${esc(j.revisionNumber||'1')} · parent #${esc(j.parentJobId||'—')}`));
  if(j.holdStartDate) rows.push(item('On hold', `Since ${fmtD(j.holdStartDate)}${j.holdDays?` for ${esc(j.holdDays)} day(s)`:' (until resumed)'}${j.holdReason?` · ${esc(j.holdReason)}`:''}`));

  const sections = [];
  if(j.remark) sections.push(`<div class="jd-section"><h3>${ic('note')}Remark</h3><p>${esc(j.remark)}</p></div>`);
  if(j.sharedJobDetails && j.sharedJobDetails.length) sections.push(`<div class="jd-section"><h3>${ic('share')}Shared with</h3><ul>${j.sharedJobDetails.map(s=>`<li><strong>${esc(s.personName)}</strong> · ${fmtD(s.startDate)} → ${fmtD(s.endDate)}</li>`).join('')}</ul></div>`);
  if(j.reassignmentHistory && j.reassignmentHistory.length) sections.push(`<div class="jd-section"><h3>${ic('reassign')}Reassignment history</h3><ul>${j.reassignmentHistory.map(r=>`<li>${fmtD(r.date)}: <strong>${esc(r.from||'?')}</strong> → <strong>${esc(r.to||'?')}</strong>${r.pctAtHandover!=null?` at ${esc(r.pctAtHandover)}%`:''}${r.reason?` · ${esc(r.reason)}`:''}</li>`).join('')}</ul></div>`);
  if(j.reworkHistory && j.reworkHistory.length) sections.push(`<div class="jd-section"><h3>${ic('rework')}Rework history</h3><ul>${j.reworkHistory.map(r=> r.reworkJobId
      ? `<li>Revision ${esc(r.revisionNumber||'?')} created ${fmtD(r.createdDate)} (job #${esc(r.reworkJobId)}) · ${esc(r.personInCharge||'')}</li>`
      : `<li>Reopened from job #${esc(r.originalJobId)} · originally completed ${fmtD(r.completedDate)} by ${esc(r.personInCharge||'?')}${r.actualDays?` in ${esc(r.actualDays)} day(s)`:''}</li>`).join('')}</ul></div>`);

  return `<div class="jd-content">
    <dl class="jd-grid">${rows.join('')}</dl>
    ${sections.join('')}
    <div class="jd-actions">
      <button type="button" class="btn btn-sm" onclick="openRemarkModal(${j.id})">${ic('note')}${j.remark?'Edit remark':'Add remark'}</button>
      <button type="button" class="btn btn-sm" onclick="openEditJob(${j.id})">${ic('edit')}Edit all details</button>
    </div>
  </div>`;
}

function getPriorityColor(p, s) {
  if(isReworkStatus(s)) return '#a05a00';
  const m={'top urgent':'#b01c1c','urgent':'#c05a00','medium':'#a05a00','low':'#1553a0'};
  return m[p]||'#555';
}

// ===================== AVAILABILITY =====================
function renderAvailability(locFilter='') {
  const persons = JT.persons.filter(p => !locFilter || p.location === locFilter);
  const hoPersons = persons.filter(p => p.location==='HO');
  const cokPersons = persons.filter(p => p.location==='COK');

  function personRow(p) {
    // All jobs assigned to this person (primary or shared) that are NOT yet done
    const activeJobs = JT.jobs.filter(j => {
      if(['complete','rework completed','cancelled'].includes(j.status)) return false;
      if(j.personInCharge === p.name) return true;
      // Include shared jobs
      return j.sharedJobDetails?.some(s => s.personName === p.name);
    });


    const nextAvail = computeNextAvail(p.name);
    // isAvailNow replaced by statusLabel logic below

    const vessels = activeJobs.map(j=>
      `<button type="button" class="avail-chip" onclick="filterByVessel(${jsArg(j.vesselName)});filterByPerson(${jsArg(p.name)});" title="${esc(j.jobScope)}">${esc(j.vesselName||'—')}</button>`
    ).join('');

    // Status label — just show next available date, nothing else
    let statusLabel = '';
    if(activeJobs.length === 0) {
      statusLabel = '<span class="avail-status free">Free now</span>';
    } else if(nextAvail) {
      statusLabel = `<span class="avail-status">Free: <strong>${fmtD(nextAvail)}</strong></span>`;
    } else {
      statusLabel = '<span class="avail-status muted">Scheduled</span>';
    }

    return `<li class="avail-row">
      <div class="avail-who">
        <button type="button" class="link-btn" onclick="filterByPerson(${jsArg(p.name)});">${esc(p.name)}</button>
        <span class="badge b-loc">${esc(p.location)}</span>
      </div>
      <div class="avail-jobs">${vessels || '<span class="avail-free">Free now</span>'}</div>
      ${statusLabel}
    </li>`;
  }

  let html = '';
  if(!locFilter || locFilter==='HO') {
    html += `<h3 class="avail-group-title"><span>HO Office</span><span>${hoPersons.length}</span></h3>`;
    html += `<ul class="avail-list">${hoPersons.map(personRow).join('')}</ul>`;
  }
  if(!locFilter || locFilter==='COK') {
    html += `<h3 class="avail-group-title"><span>COK Office</span><span>${cokPersons.length}</span></h3>`;
    html += `<ul class="avail-list">${cokPersons.map(personRow).join('')}</ul>`;
  }
  if(!persons.length) html = emptyState('persons', 'No persons yet', 'Add team members to see who is free and when.', `<button type="button" class="btn btn-primary" onclick="openAddPerson()">${ic('plus')}Add Person</button>`);

  html += `<p class="avail-note">Next available dates exclude weekends, holidays and personal leave. Select a vessel to view its job.</p>`;
  document.getElementById('availPanel').innerHTML = html;
}

function computeNextAvail(personName) {
  // Build the full set of dates this person is BUSY
  const busyDates = new Set();

  JT.jobs.forEach(job => {
    if(['complete','rework completed','cancelled'].includes(job.status)) return;

    // ── Primary person ──
    if(job.personInCharge === personName) {
      if(job.startDate || job.plannedStartDate) {
        getJobWorkingDates(job, personName).forEach(d => busyDates.add(d));
      } else if(job.targetDate) {
        busyDates.add(job.targetDate); // unscheduled — use target as last busy day
      }
    }

    // ── Shared person ── check sharedJobDetails for this person
    if(job.sharedJobDetails && job.sharedJobDetails.length > 0) {
      const share = job.sharedJobDetails.find(s => s.personName === personName);
      if(share && share.startDate && share.endDate) {
        // Add every working day in the shared date range
        const sp = share.startDate.split('-');
        let d = new Date(parseInt(sp[0]), parseInt(sp[1])-1, parseInt(sp[2]));
        d.setHours(0,0,0,0);
        const ep = share.endDate.split('-');
        const end = new Date(parseInt(ep[0]), parseInt(ep[1])-1, parseInt(ep[2]));
        end.setHours(0,0,0,0);
        for(let i = 0; i < 365 && d <= end; i++) {
          const ds = localDateStr(d);
          if(isWorkingDayForPerson(ds, personName)) busyDates.add(ds);
          d.setDate(d.getDate() + 1);
        }
      }
    }
  });

  if(!busyDates.size) return null; // no busy dates at all — free now

  // Walk forward from TODAY — first working day NOT busy = next available
  const tp = today().split('-');
  let d = new Date(parseInt(tp[0]), parseInt(tp[1])-1, parseInt(tp[2]));
  d.setHours(0,0,0,0);

  for(let i = 0; i < 365; i++) {
    const ds = localDateStr(d);
    if(isWorkingDayForPerson(ds, personName) && !busyDates.has(ds)) {
      return d;
    }
    d.setDate(d.getDate() + 1);
  }
  return null;
}

// ===================== JOBS PAGE =====================
let jobTab = 'all';
function setJobTab(tab, btn) {
  jobTab = tab;
  // Keep the tab bar in sync even when called without a button (dashboard cards, sidebar, planning)
  document.querySelectorAll('#jobsTabBar .tab-btn').forEach(b => {
    const on = btn ? b === btn : b.dataset.tab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const activeTab = document.querySelector('#jobsTabBar .tab-btn.active');
  if(activeTab && activeTab.scrollIntoView && document.getElementById('page-jobs')?.classList.contains('active')) {
    try { activeTab.scrollIntoView({ block:'nearest', inline:'nearest' }); } catch(e) {}
  }
  renderJobsPage();
}

// ── Optional sorting (default '' keeps v1 order: overdue first, then priority) ──
let jobSortKey = '', jobSortDir = 'asc';
function setJobSort(value) {
  const [k, d] = (value || '').split(':');
  jobSortKey = k || ''; jobSortDir = d || 'asc';
  const sel = document.getElementById('jobSort');
  if(sel && sel.value !== (value||'')) sel.value = value || '';
  renderJobsPage();
}
function sortByColumn(key) {
  const defaultDir = (key === 'progress' || key === 'receipt') ? 'desc' : 'asc';
  if(jobSortKey !== key) setJobSort(key + ':' + defaultDir);
  else if(jobSortDir === defaultDir) setJobSort(key + ':' + (defaultDir === 'asc' ? 'desc' : 'asc'));
  else setJobSort('');
}
function applyJobSort(jobs) {
  if(!jobSortKey) return jobs;
  const dir = jobSortDir === 'desc' ? -1 : 1;
  const val = {
    target:   j => j.targetDate || '9999',
    receipt:  j => j.receiptDate || '',
    jobnum:   j => (j.jobNumber || '').toLowerCase(),
    vessel:   j => (j.vesselName || '').toLowerCase(),
    person:   j => (j.personInCharge || '').toLowerCase(),
    progress: j => j.completionPercentage || 0,
    status:   j => j.status || '',
    priority: j => ({'top urgent':0,'urgent':1,'medium':2,'low':3})[j.priorityLevel] ?? 4,
  }[jobSortKey];
  if(!val) return jobs;
  return [...jobs].sort((a, b) => {
    const x = val(a), y = val(b);
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
}

function getFilteredJobs() {
  const search = (document.getElementById('jobSearch')?.value||'').toLowerCase().trim();
  const loc = document.getElementById('jobLocFilter')?.value||'';
  const person = document.getElementById('jobPersonFilter')?.value||'';
  const priority = document.getElementById('jobPriorityFilter')?.value||'';
  const overdueOnly = document.getElementById('jobOverdueOnly')?.checked||false;

  let jobs = [...JT.jobs];
  // Tab filter
  if(jobTab==='active') jobs=jobs.filter(j=>['ongoing','planned'].includes(j.status));
  else if(jobTab==='rework') jobs=jobs.filter(j=>isReworkStatus(j.status));
  else if(jobTab==='overdue') jobs=jobs.filter(isOverdue);
  else if(jobTab!=='all') jobs=jobs.filter(j=>j.status===jobTab);

  if(search) jobs=jobs.filter(j=>(j.jobNumber+j.vesselName+j.clientName+j.jobScope+(j.personInCharge||'')).toLowerCase().includes(search));
  if(loc) jobs=jobs.filter(j=>j.location===loc);
  if(person) jobs=jobs.filter(j=>j.personInCharge===person);
  if(priority) jobs=jobs.filter(j=>j.priorityLevel===priority);
  if(overdueOnly) jobs=jobs.filter(isOverdue);

  const prioMap={'top urgent':0,'urgent':1,'medium':2,'low':3};
  jobs.sort((a,b)=>{
    const ao=isOverdue(a)?0:1,bo=isOverdue(b)?0:1;
    if(ao!==bo) return ao-bo;
    return (prioMap[a.priorityLevel]||3)-(prioMap[b.priorityLevel]||3);
  });
  return jobs;
}

let _jobRenderToken = 0, _jobRenderFlush = null;
function renderJobsPage() {
  updateSidebarCounts();
  const jobs = applyJobSort(getFilteredJobs());
  document.getElementById('jobsSubtitle').textContent = `${jobs.length} job${jobs.length!==1?'s':''} found`;
  if(typeof updateClearBtn==='function') updateClearBtn();
  updateFilterCount();
  const wrap = document.getElementById('jobsListWrap');
  const term = (document.getElementById('jobSearch')?.value||'').toLowerCase().trim();
  const token = ++_jobRenderToken;
  _jobRenderFlush = null;

  if(jobs.length===0) {
    const filtered = JT.jobs.length > 0;
    wrap.innerHTML = filtered
      ? emptyState('search', 'No jobs match your filters', term ? `Nothing found for “${term}”. Try another search or clear the filters.` : 'Try another status tab or clear the filters.', `<button type="button" class="btn" onclick="clearJobFilters()">${ic('x')}Clear filters</button><button type="button" class="btn btn-primary" onclick="openAddJob()">${ic('plus')}Add Job</button>`)
      : emptyState('jobs', 'No jobs yet', 'Add your first job, or import a JSON backup from Settings.', `<button type="button" class="btn btn-primary" onclick="openAddJob()">${ic('plus')}Add Job</button><button type="button" class="btn" onclick="triggerImport()">${ic('import')}Import backup</button>`);
    return;
  }

  const sortAttr = key => jobSortKey === key ? (jobSortDir === 'desc' ? 'descending' : 'ascending') : 'none';
  const th = (key, label) => `<button type="button" class="jh-sort" onclick="sortByColumn('${key}')" data-sort="${sortAttr(key)}" aria-label="Sort by ${label}${sortAttr(key)!=='none'?', currently '+sortAttr(key):''}">${label}${ic('arrow-up')}</button>`;
  const head = `<div class="jobs-head" role="group" aria-label="Sort jobs by column">
      <span></span>${th('jobnum','Job #')}${th('vessel','Vessel / Client')}<span>Scope</span>${th('person','Person')}${th('status','Status')}${th('priority','Priority')}${th('target','Target · Progress')}<span class="jh-actions">Actions</span>
    </div>`;

  // Progressive rendering: first rows immediately, the rest in small batches
  const FIRST = 40, CHUNK = 120;
  wrap.innerHTML = `<h2 class="sr-only">Job list</h2>` + head + `<div class="jobs-body" id="jobsBody">${jobs.slice(0, FIRST).map(j=>renderJobCard(j, term)).join('')}</div>`;
  let i = FIRST;
  const body = document.getElementById('jobsBody');
  const appendChunk = n => {
    if(token !== _jobRenderToken || i >= jobs.length) return;
    body.insertAdjacentHTML('beforeend', jobs.slice(i, i + n).map(j=>renderJobCard(j, term)).join(''));
    i += n;
  };
  _jobRenderFlush = () => { while(token === _jobRenderToken && i < jobs.length) appendChunk(CHUNK); };
  const pump = () => {
    if(token !== _jobRenderToken || i >= jobs.length) return;
    appendChunk(CHUNK);
    (window.requestAnimationFrame || setTimeout)(pump);
  };
  if(i < jobs.length) (window.requestAnimationFrame || setTimeout)(pump);
}
// Make sure every row exists (e.g. before scrolling to a specific job)
function flushJobRender() { if(typeof _jobRenderFlush === 'function') _jobRenderFlush(); }

function updateFilterCount() {
  const n = ['jobLocFilter','jobPersonFilter','jobPriorityFilter','jobSort'].filter(id => (document.getElementById(id)?.value||'') !== '').length
    + (document.getElementById('jobOverdueOnly')?.checked ? 1 : 0);
  const el = document.getElementById('filterCount');
  if(el) { el.textContent = n; el.hidden = !n; }
}

// ===================== PLANNING V3 - COMPLETE REWRITE =====================
// 2-week view, correct job display logic, day status dialog, job chip popup


// ===================== PLANNING ENGINE - WORKING DAY AWARE =====================
// Rules:
// - Sat/Sun = off by default
// - workingDays[] = mandatory working days for ALL (overrides weekend)  
// - holidays[] = global holiday, everyone off (overrides workingDays)
// - personHolidays[name][] = specific person off (overrides everything except compensationWorkingDays)
// - compensationWorkingDays[name][] = specific person works this day (overrides all off rules)
// Job occupies exactly daysRequired WORKING days starting from plannedStartDate/startDate

function getPlanDates() {
  const t = new Date(); t.setHours(0,0,0,0);
  const dayOfWeek = t.getDay();
  const monday = new Date(t);
  monday.setDate(t.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + (planWeekOffset * 7));
  monday.setHours(0,0,0,0);
  const dates = [];
  for(let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function planShift(n) { planWeekOffset += n; renderPlanning(); }
function planToday() { planWeekOffset = 0; renderPlanning(); }

// Is this date a working day for this person?
function isWorkingDayForPerson(dateStr, personName) {
  const p = dateStr.split('-');
  const date = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]));
  const day = date.getDay(); // 0=Sun, 6=Sat
  const isSat = day === 6;
  const isSun = day === 0;
  const isWeekend = isSat || isSun;

  // 1. Compensation working day for this person? Always works (highest priority)
  if(JT.compensationWorkingDays?.[personName]?.includes(dateStr)) return true;

  // 2. Global holiday? Nobody works
  if(JT.holidays?.includes(dateStr)) return false;

  // 3. Person-specific holiday? This person is off
  if(JT.personHolidays?.[personName]?.includes(dateStr)) return false;

  // 4. Mandatory working day for all (e.g. compulsory Saturday)?
  if(JT.workingDays?.includes(dateStr)) return true;

  // 5. Regular weekend? Off
  if(isWeekend) return false;

  // 6. Regular weekday
  return true;
}

// Is this date a working day for ALL persons (used for column header display)
function isWorkingDayGlobal(dateStr) {
  const date = new Date(dateStr);
  const day = date.getDay();
  const isWeekend = day === 0 || day === 6;
  if(JT.holidays?.includes(dateStr)) return false;
  if(JT.workingDays?.includes(dateStr)) return true;
  return !isWeekend;
}

// Cache for getJobWorkingDates — reset each renderPlanning call
let _jobDateCache = {};
function clearJobDateCache() { _jobDateCache = {}; }

// Get the actual working dates a job occupies for a specific person
// Returns a Set of date strings the job is active on
function getJobWorkingDates(job, personName) {
  const cacheKey = job.id + '|' + personName;
  if(_jobDateCache[cacheKey]) return _jobDateCache[cacheKey];
  const start = job.startDate || job.plannedStartDate;
  if(!start || !job.daysRequired) return new Set();

  // Carry-forward: remaining days based on completion %
  const pct = job.completionPercentage || 0;
  const perDayPct = 100 / job.daysRequired;
  let daysElapsed = 0;
  const todayStr = today();
  const sp2 = start.split('-');
  let dd = new Date(+sp2[0],+sp2[1]-1,+sp2[2]); dd.setHours(0,0,0,0);
  const tp = todayStr.split('-');
  const todayD = new Date(+tp[0],+tp[1]-1,+tp[2]); todayD.setHours(0,0,0,0);
  while(dd <= todayD) { if(isWorkingDayForPerson(localDateStr(dd), personName)) daysElapsed++; dd.setDate(dd.getDate()+1); }
  daysElapsed = Math.min(daysElapsed, job.daysRequired);
  const effectiveDays = daysElapsed + Math.ceil((100 - pct) / perDayPct);

  const workDates = [];
  const sp = start.split('-');
  let d = new Date(parseInt(sp[0]), parseInt(sp[1])-1, parseInt(sp[2]));
  d.setHours(0,0,0,0);
  let safety = 0;
  while(workDates.length < effectiveDays && safety < 365) {
    const ds = localDateStr(d);
    // Skip held dates — planning resumes after hold period
    let isHeld = false;
    if(job.holdStartDate && ds >= job.holdStartDate) {
      if(!job.holdDays) { isHeld = true; }
      else {
        const hp=job.holdStartDate.split('-');
        const hEnd=new Date(+hp[0],+hp[1]-1,+hp[2]); hEnd.setDate(hEnd.getDate()+job.holdDays);
        if(ds <= localDateStr(hEnd)) isHeld = true;
      }
    }
    if(isWorkingDayForPerson(ds, personName) && !isHeld) workDates.push(ds);
    d.setDate(d.getDate() + 1);
    safety++;
  }
  const result = new Set(workDates);
  _jobDateCache[cacheKey] = result;
  return result;
}

// Get jobs for a person on a specific date (working-day-aware)
// Get working dates for an upcoming job (simple, no carry-forward)
function getUpcomingWorkingDates(u, personName) {
  const start = u.plannedStartDate;
  if(!start || !u.daysRequired) return new Set();
  const sp = start.split('-');
  let d = new Date(+sp[0],+sp[1]-1,+sp[2]); d.setHours(0,0,0,0);
  const dates = []; let safety = 0;
  while(dates.length < u.daysRequired && safety < 365) {
    const ds = localDateStr(d);
    if(isWorkingDayForPerson(ds, personName)) dates.push(ds);
    d.setDate(d.getDate()+1); safety++;
  }
  return new Set(dates);
}

function getJobsForPersonOnDate(personName, dateStr) {
  if(!isWorkingDayForPerson(dateStr, personName)) return [];

  const results = [];

  // Regular jobs
  JT.jobs.forEach(j => {
    if(['complete','rework completed','cancelled'].includes(j.status)) return;
    if(j.personInCharge === personName) {
      const start = j.startDate || j.plannedStartDate;
      if(!start) return;
      if(getJobWorkingDates(j, personName).has(dateStr)) results.push(j);
      return;
    }
    // Shared
    if(j.sharedJobDetails && j.sharedJobDetails.length > 0) {
      const share = j.sharedJobDetails.find(s => s.personName === personName);
      if(share && share.startDate && share.endDate &&
         dateStr >= share.startDate && dateStr <= share.endDate) {
        results.push(j);
      }
    }
  });

  // Upcoming jobs — show in planning if assigned + plannedStartDate + days set
  if(JT.upcomingJobs) {
    JT.upcomingJobs.forEach(u => {
      if(u.personInCharge !== personName) return;
      if(!u.plannedStartDate || !u.daysRequired) return;
      if(getUpcomingWorkingDates(u, personName).has(dateStr))
        results.push({...u, _isUpcoming:true});
    });
  }

  return results;
}

// Get day number for chip display (e.g. D3/5)
function getDayNumber(job, dateStr, personName) {
  const workDates = Array.from(getJobWorkingDates(job, personName)).sort();
  const idx = workDates.indexOf(dateStr);
  return idx >= 0 ? idx + 1 : 1;
}

// Get column header type for visual display
function getDayColumnType(dateStr, personName) {
  const p = dateStr.split('-');
  const date = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]));
  const day = date.getDay();
  const isSun = day === 0;
  const isSat = day === 6;
  const isGlobalHoliday = JT.holidays?.includes(dateStr);
  const isMandatoryWorking = JT.workingDays?.includes(dateStr);
  const isPersonHoliday = personName && JT.personHolidays?.[personName]?.includes(dateStr);
  const isCompDay = personName && JT.compensationWorkingDays?.[personName]?.includes(dateStr);

  if(isCompDay) return 'comp-working';
  if(isGlobalHoliday) return 'holiday';
  if(isPersonHoliday) return 'person-holiday';
  if(isSun) return 'sunday';
  if(isSat && !isMandatoryWorking) return 'saturday';
  if(isMandatoryWorking) return 'mandatory-working';
  return 'working';
}

// 16-colour palette — each person gets a distinct hue across the team
const PERSON_PALETTE = [
  '#1164A3', // Slack Blue
  '#2BAC76', // Slack Green
  '#D97706', // Amber
  '#7C3085', // Slack Purple
  '#0F7B6C', // Teal
  '#C2410C', // Deep Orange
  '#0369A1', // Deep Sky
  '#059669', // Emerald
  '#7C3AED', // Violet
  '#B45309', // Dark Amber
  '#0E7490', // Cyan
  '#BE185D', // Pink
  '#1D4ED8', // Royal Blue
  '#15803D', // Forest Green
  '#B91C1C', // Crimson
  '#6D28D9', // Indigo
];

function getPersonBaseColor(personName) {
  // Polynomial rolling hash — distributes names more evenly across palette
  const name = (personName||'');
  let h = 0;
  for(let i=0; i<name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0; // unsigned 32-bit
  }
  return PERSON_PALETTE[h % PERSON_PALETTE.length];
}

// Blend a hex colour toward white by `amount` (0=original, 1=white)
function lightenColor(hex, amount) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  const lr = Math.round(r + (255-r)*amount);
  const lg = Math.round(g + (255-g)*amount);
  const lb = Math.round(b + (255-b)*amount);
  return '#'+[lr,lg,lb].map(v=>v.toString(16).padStart(2,'0')).join('');
}

// Pick black or white text, whichever reads better on a chip colour (WCAG contrast)
function readableTextOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if(!m) return '#fff';
  const lin = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
  const n = parseInt(m[1], 16);
  const L = .2126 * lin(n >> 16 & 255) + .7152 * lin(n >> 8 & 255) + .0722 * lin(n & 255);
  return (1.05 / (L + .05)) >= ((L + .05) / .05) ? '#fff' : '#0B1222';
}

function getPlanChipColor(job, shadeIndex) {
  // shadeIndex: 0=base (first job), 1=lighter (second), 2=lightest (third+)
  const shade = shadeIndex || 0;

  // Overdue always red regardless of person
  if(isOverdue(job)) {
    const redShades = ['#E01E5A','#F05A85','#F59AB5'];
    return redShades[Math.min(shade, redShades.length-1)];
  }

  // Rework always purple-family
  if(job.status==='rework ongoing'||job.status==='rework planned'||job.status==='rework completed') {
    const purpleShades = ['#7C3085','#9F5CA8','#C49ECC'];
    return purpleShades[Math.min(shade, purpleShades.length-1)];
  }

  // Not planned — greyed out, still person-tinted
  if(job.status==='not planned') {
    const base = getPersonBaseColor(job.personInCharge);
    return lightenColor(base, 0.55 + shade*0.12); // very light tint
  }

  // All other statuses: use person base colour with shade variation
  const base = getPersonBaseColor(job.personInCharge);
  const lightAmount = shade === 0 ? 0 : shade === 1 ? 0.28 : 0.48;
  return lightenColor(base, lightAmount);
}

function renderPlanning() {
  if(typeof clearJobDateCache === 'function') clearJobDateCache();
  const dates = getPlanDates();
  const locF = document.getElementById('planLocFilter')?.value || '';
  const personF = document.getElementById('planPersonFilter')?.value || '';
  const t = today();

  document.getElementById('planLabel').textContent =
    `${dates[0].toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})} — ${dates[6].toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}`;

  const persons = JT.persons.filter(p =>
    (!locF || p.location === locF) &&
    (!personF || p.name === personF)
  );

  const DAY_ABB = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  if(!persons.length) {
    document.getElementById('planTable').innerHTML = `<tbody><tr><td>${emptyState('calendar', JT.persons.length ? 'No one matches these filters' : 'No team members yet', JT.persons.length ? 'Change the location or person filter to see the schedule.' : 'Add persons to start planning their week.', JT.persons.length ? '' : `<button type="button" class="btn btn-primary" onclick="openAddPerson()">${ic('plus')}Add Person</button>`)}</td></tr></tbody>`;
    return;
  }

  // ── HEADER ROW ──
  let html = `<colgroup><col class="pc-col-person"><col span="7"></colgroup><thead><tr>
    <th scope="col" class="pt-corner">Schedule</th>`;

  dates.forEach(d => {
    const ds = localDateStr(d);
    const isToday = ds === t;
    const dayType = getDayColumnType(ds, null);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const isHoliday = dayType === 'holiday';
    const isMandatory = dayType === 'mandatory-working';
    const longLabel = d.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'});

    let badgePill = '<span class="pd-pill pill-space" aria-hidden="true">·</span>';
    if(isHoliday)        badgePill = '<span class="pd-pill pill-holiday">Holiday</span>';
    else if(isMandatory) badgePill = '<span class="pd-pill pill-work">Work Day</span>';
    else if(isToday)     badgePill = '<span class="pd-pill pill-today">Today</span>';

    html += `<th scope="col" class="pt-day${isWeekend?' is-weekend':''}${isToday?' is-today':''}" onclick="openDayStatusFromHeader('${ds}',null)"
      role="button" tabindex="0" title="Set day status — ${longLabel}" aria-label="${longLabel}${isHoliday?', public holiday':isMandatory?', mandatory working day':''}${isToday?', today':''}. Set day status for everyone">
      <div class="plan-day-hdr">
        <span class="pd-dow">${DAY_ABB[d.getDay()]}</span>
        <span class="pd-num">${d.getDate()}</span>
        <span class="pd-mon">${d.toLocaleDateString('en-GB',{month:'short'})}</span>
        ${badgePill}
      </div>
    </th>`;
  });
  html += '</tr></thead><tbody>';

  // ── PERSON ROWS ──
  persons.forEach(person => {
    const overdueCount = JT.jobs.filter(j =>
      j.personInCharge === person.name &&
      !['complete','rework completed','cancelled','hold'].includes(j.status) &&
      isOverdue(j)
    ).length;

    html += `<tr>
      <th scope="row" class="plan-person-cell">
        <div class="plan-person-inner">
          <button type="button" class="plan-person-link" onclick="filterByPerson(${jsArg(person.name)})" title="Show jobs for ${esc(person.name)}">${esc(person.name)}</button>
          <div class="plan-person-tags">
            <span class="pp-tag loc-${esc(person.location)}">${esc(person.location)}</span>
            ${overdueCount>0?`<span class="pp-tag over" title="${overdueCount} overdue">⚠ ${overdueCount}</span>`:''}
          </div>
        </div>
      </th>`;

    dates.forEach(d => {
      const ds = localDateStr(d);
      const isToday = ds === t;
      const dayTypeForPerson = getDayColumnType(ds, person.name);
      const isPersonWorking = isWorkingDayForPerson(ds, person.name);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;

      let cellCls = '';
      if(isToday)                                   cellCls = 'pc-today';
      else if(dayTypeForPerson==='holiday')         cellCls = 'pc-holiday';
      else if(dayTypeForPerson==='person-holiday')  cellCls = 'pc-leave';
      else if(dayTypeForPerson==='saturday'||dayTypeForPerson==='sunday') cellCls = 'pc-weekend';
      else if(dayTypeForPerson==='comp-working')    cellCls = 'pc-comp';

      const jobsOnDay = getJobsForPersonOnDate(person.name, ds);
      const cellLabel = `${person.name}, ${d.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'})}: ${!isPersonWorking ? (dayTypeForPerson==='holiday'?'holiday':dayTypeForPerson==='person-holiday'?'on leave':'off') : jobsOnDay.length ? jobsOnDay.length+' job'+(jobsOnDay.length>1?'s':'') : 'free'}. Set day status`;

      html += `<td class="pc ${cellCls}" onclick="handleDayCellClick(event,'${ds}',${jsArg(person.name)})" tabindex="0" data-kbd-click aria-label="${esc(cellLabel)}">`;

      if(!isPersonWorking) {
        if(dayTypeForPerson==='holiday')
          html += `<div class="pc-off pc-off-holiday">Holiday</div>`;
        else if(dayTypeForPerson==='person-holiday')
          html += `<div class="pc-off pc-off-leave">Leave</div>`;
      }

      jobsOnDay.forEach((j, jobIndex) => {
        const chipColor = getPlanChipColor(j, jobIndex); // jobIndex = shade: 0=darkest, 1=lighter, 2=lightest
        const dayNum = getDayNumber(j, ds, person.name);
        const totalDays = j.daysRequired;
        const pct = j.completionPercentage || 0;
        const isLastDay = dayNum === totalDays;
        const scope = j.jobScope || '', vessel = j.vesselName || '';

        if(j._isUpcoming) {
          html += `<div class="plan-chip upcoming" role="button" tabindex="0"
            onclick="event.stopPropagation();openUpcomingChipPopup(event,${j.id})"
            title="UPCOMING · ${esc(vessel)} · ${esc(scope)}" aria-label="Upcoming: ${esc(vessel)}, ${esc(scope)}, day ${dayNum} of ${totalDays}">
            <div class="chip-t">${esc(scope.substring(0,14))}${scope.length>14?'…':''}</div>
            <div class="chip-s">${esc(vessel.substring(0,12))}${vessel.length>12?'…':''}</div>
            <div class="chip-f"><span>D${dayNum}/${totalDays}</span><span>Upcoming</span></div>
          </div>`;
        } else {
          const notPlanned = j.status==='not planned';
          html += `<div class="plan-chip" role="button" tabindex="0"
            onclick="event.stopPropagation();openJobChipPopup(event,${j.id})"
            style="background:${chipColor};color:${readableTextOn(chipColor)};box-shadow:0 1px 3px rgba(0,0,0,.15)${isLastDay?',inset -3px 0 0 rgba(255,255,255,.25)':''}"
            title="${esc(vessel)} · ${esc(scope)} · ${pct}% (D${dayNum}/${totalDays})" aria-label="${esc(vessel)}, ${esc(scope)}, ${j.status}, ${pct}% complete, day ${dayNum} of ${totalDays}${isOverdue(j)?', overdue':''}. Open job">
            <div class="chip-t">${esc(scope.substring(0,14))}${scope.length>14?'…':''}</div>
            <div class="chip-s">${esc(vessel.substring(0,12))}${vessel.length>12?'…':''}</div>
            <div class="chip-f"><span>D${dayNum}/${totalDays}</span><span>${pct}%</span></div>
            <div class="chip-fill" aria-hidden="true" style="--done:${pct}%;--rest:${Math.max(0,100-pct)}%"><div class="done"></div><div class="rest"></div></div>
          </div>`;
        }
      });

      html += '</td>';
    });
    html += '</tr>';
  });

  html += '</tbody>';
  document.getElementById('planTable').innerHTML = html;
}

// ---- Day Cell Click ----
function handleDayCellClick(evt, ds, personName) {

  if(evt.target.closest('[onclick*="openJobChipPopup"]')) return;
  openDayStatusDialog(ds, personName);
}

function openDayStatusFromHeader(ds, personName) {
  openDayStatusDialog(ds, personName);
}

// Current day status action state
let _dayStatusDs = null, _dayStatusPerson = null;

function openDayStatusDialog(ds, personName) {
  _dayStatusDs = ds;
  _dayStatusPerson = personName;
  // Parse date parts directly to avoid timezone issues
  const parts = ds.split('-');
  const date = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
  const day = date.getDay();

  const isSat = day === 6;
  const isSun = day === 0;
  const isWeekend = isSat || isSun;
  const isWorkingDay = JT.workingDays?.includes(ds);
  const isHoliday = JT.holidays?.includes(ds);
  const isPersonHoliday = personName && JT.personHolidays?.[personName]?.includes(ds);
  const isCompDay = personName && JT.compensationWorkingDays?.[personName]?.includes(ds);

  const dateLabel = date.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  let currentStatus = isCompDay ? `${personName}: Compensation Working Day` :
                      isHoliday ? '🏖 Public Holiday (Everyone Off)' :
                      isPersonHoliday ? `🏠 ${personName}: On Leave` :
                      isWorkingDay ? '⚡ Mandatory Working Day (All Staff)' :
                      isSun ? '🔴 Sunday — Weekend (Off)' :
                      isSat ? '🔴 Saturday — Weekend (Off)' :
                      '✅ Regular Working Day';

  let opts = '';

  // For weekends: show "Make Working Day" FIRST as primary action
  if(isWeekend) {
    if(isWorkingDay) {
      opts += `<button class="ds-btn ds-amber" onclick="dsDayAction('remove-working-day')">✗ ${ds} — Remove Mandatory Working Day (revert to Weekend)</button>`;
    } else {
      opts += `<button class="ds-btn ds-green" onclick="dsDayAction('add-working-day')">🗓 ${ds} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]}) — Mark as Working Day for All</button>`;
    }
  }

  if(personName && isWeekend) {
    if(isCompDay) {
      opts += `<button class="ds-btn ds-amber" onclick="dsDayAction('remove-comp-day')">✗ Remove Compensation Day for ${esc(personName)}</button>`;
    } else {
      opts += `<button class="ds-btn ds-amber" onclick="dsDayAction('add-comp-day')">⚡ Compensation Working Day for <strong>${esc(personName)}</strong> only</button>`;
    }
  }

  // Weekday-only options
  if(!isWeekend || isWorkingDay) {
    if(personName) {
      if(isPersonHoliday) {
        opts += `<button class="ds-btn ds-green" onclick="dsDayAction('remove-person-holiday')">✓ Remove Leave — ${esc(personName)} works this day</button>`;
      } else if(!isHoliday) {
        opts += `<button class="ds-btn ds-red" onclick="dsDayAction('add-person-holiday')">🏠 ${ds} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]}) — Mark as Leave for ${esc(personName)}</button>`;
      }
    }

    if(isHoliday) {
      opts += `<button class="ds-btn ds-green" onclick="dsDayAction('remove-global-holiday')">✓ Remove Global Holiday — everyone works</button>`;
    } else {
      opts += `<button class="ds-btn ds-red" onclick="dsDayAction('add-global-holiday')">🏖 ${ds} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]}) — Mark as Public Holiday for All</button>`;
    }
  }

  document.getElementById('dsDate').textContent = dateLabel;
  document.getElementById('dsCurrentStatus').textContent = currentStatus;
  
  document.getElementById('dsOptions').innerHTML = opts;
  document.getElementById('dayStatusModal').classList.remove('hidden');
}

function dsDayAction(action) {
  const ds = _dayStatusDs;
  const person = _dayStatusPerson;
  if(!JT.holidays) JT.holidays = [];
  if(!JT.workingDays) JT.workingDays = [];
  if(!JT.personHolidays) JT.personHolidays = {};
  if(!JT.compensationWorkingDays) JT.compensationWorkingDays = {};

  if(action === 'add-person-holiday') {
    if(!JT.personHolidays[person]) JT.personHolidays[person] = [];
    if(!JT.personHolidays[person].includes(ds)) JT.personHolidays[person].push(ds);
    showToast(`${person} marked on leave for ${ds}`,'ok');
  } else if(action === 'remove-person-holiday') {
    JT.personHolidays[person] = (JT.personHolidays[person]||[]).filter(d=>d!==ds);
    showToast(`Leave removed for ${person}`,'ok');
  } else if(action === 'add-comp-day') {
    if(!JT.compensationWorkingDays[person]) JT.compensationWorkingDays[person] = [];
    if(!JT.compensationWorkingDays[person].includes(ds)) JT.compensationWorkingDays[person].push(ds);
    showToast(`${person} will work on ${ds}`,'ok');
  } else if(action === 'remove-comp-day') {
    JT.compensationWorkingDays[person] = (JT.compensationWorkingDays[person]||[]).filter(d=>d!==ds);
    showToast(`Compensation day removed for ${person}`,'ok');
  } else if(action === 'add-global-holiday') {
    if(!JT.holidays.includes(ds)) JT.holidays.push(ds);
    showToast(`${ds} marked as global holiday`,'ok');
  } else if(action === 'remove-global-holiday') {
    JT.holidays = JT.holidays.filter(d=>d!==ds);
    showToast(`Global holiday removed`,'ok');
  } else if(action === 'add-working-day') {
    if(!JT.workingDays.includes(ds)) JT.workingDays.push(ds);
    showToast(`${ds} marked as mandatory working day`,'ok');
  } else if(action === 'remove-working-day') {
    JT.workingDays = JT.workingDays.filter(d=>d!==ds);
    showToast(`Mandatory working day removed`,'ok');
  }

  save();
  closeModal('dayStatusModal');
  const tbl = document.getElementById('planTable');
  if(tbl) tbl.innerHTML = '<tbody><tr><td colspan="8" class="plan-updating">Updating calendar…</td></tr></tbody>';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    updateSidebarCounts();
    renderPlanning();
    renderAvailability(_dashAvailLoc);
  }));
}

// ---- Job Chip Popup ----
function openJobChipPopup(evt, jobId) {
  evt.stopPropagation();
  const j = JT.jobs.find(x=>x.id===jobId);
  if(!j) return;

  // Navigate directly to this job in the Jobs page
  // Set the correct tab first (active, complete, rework etc.)
  let tab = 'all';
  if(['complete','rework completed'].includes(j.status)) tab = 'complete';
  else if(j.status === 'cancelled') tab = 'cancelled';
  else if(j.status === 'hold') tab = 'hold';
  else if(j.isRework || j.status.startsWith('rework')) tab = 'rework';
  else tab = 'active';

  // Switch to jobs page and correct tab
  showPage('jobs', document.querySelectorAll('.nav-btn')[1]);
  setJobTab(tab, null);

  // Scroll the job card into view and highlight it
  setTimeout(() => {
    flushJobRender(); // rows are rendered progressively; make sure this one exists
    const card = document.getElementById('jcard-' + jobId);
    if(card) {
      card.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
      // Flash highlight
      card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
      setTimeout(() => card.classList.remove('flash'), 2500);
      const exp = card.querySelector('.jrow-expand');
      if(exp) exp.focus({ preventScroll: true });
    }
  }, 150);
}

function chipQuickStatus() {
  const j = JT.jobs.find(x=>x.id===actionJobId);
  if(!j) return;
  const newStatus = document.getElementById('chipStatusSel').value;
  if(newStatus === 'complete' || newStatus === 'rework completed') {
    closeModal('jobChipModal');
    openCompletionDate(actionJobId, newStatus, null);
    return;
  }
  j.status = newStatus;
  if(j.status==='ongoing'&&!j.startDate)j.startDate=today();
  save(); closeModal('jobChipModal');
  setTimeout(()=>renderAll(), 30);
  showToast('Status updated','ok');
}

// ===================== EXCEL EXPORTS =====================



// ===== TOAST =====





// ===================== UPCOMING =====================
function renderUpcoming() {
  const ul=JT.upcomingJobs;
  if(!ul.length){
    document.getElementById('upcomingList').innerHTML = emptyState('upcoming', 'No upcoming jobs registered', 'Pre-register jobs you expect to receive. They appear as dashed chips in Planning and can be moved to tracking in one tap.', `<button type="button" class="btn btn-primary" onclick="openAddUpcoming()">${ic('plus')}Add Upcoming</button>`);
    return;
  }
  const rows = ul.map(j=>{
    const over = j.targetDate && j.targetDate < today();
    const label = `${j.jobNumber||''} ${j.vesselName||''}`.trim() || 'upcoming job';
    return `<article class="up-card ${over?'overdue':''}" aria-label="${esc(label)}">
      <div class="up-head">
        <span class="badge b-jobnum">${esc(j.jobNumber||'—')}</span>
        ${statusBadge(j.status||'planned')}
        ${priorityBadge(j.priorityLevel||'medium')}
      </div>
      <div class="up-main">
        <div class="up-title">${esc(j.vesselName||'—')}</div>
        <div class="up-sub">${esc(j.clientName||'—')}</div>
        <div class="up-scope">${esc(j.jobScope||'—')}</div>
        ${j.notes?`<div class="up-notes">${esc(j.notes)}</div>`:''}
      </div>
      <div class="up-meta">
        <span>${ic('users')}${j.personInCharge?esc(j.personInCharge):'<span class="muted">Unassigned</span>'}</span>
        <span>${ic('map-pin')}${esc(j.location||'—')}</span>
        <span class="${over?'is-over':''}">${ic('calendar')}Target ${fmtD(j.targetDate)}</span>
        ${j.plannedStartDate?`<span>${ic('clock')}Starts ${fmtD(j.plannedStartDate)} · ${esc(j.daysRequired||1)} day(s)</span>`:''}
      </div>
      <div class="up-actions">
        <button type="button" class="btn btn-primary btn-sm" onclick="moveToTracking(${j.id})">${ic('chevron-right')}Move to tracking</button>
        <button type="button" class="act-btn edit" onclick="openEditUpcoming(${j.id})" title="Edit" aria-label="Edit ${esc(label)}">${ic('edit')}<span class="lbl">Edit</span></button>
        <button type="button" class="act-btn del" onclick="deleteUpcoming(${j.id})" title="Remove" aria-label="Remove ${esc(label)}">${ic('trash')}<span class="lbl">Remove</span></button>
      </div>
    </article>`;
  }).join('');
  document.getElementById('upcomingList').innerHTML = '<div class="up-list">' + rows + '</div>';
}

function moveToTracking(id) {
  const j = JT.upcomingJobs.find(x=>x.id===id);
  if(!j) return;
  if(!confirm(`Move "${j.jobScope}" (${j.vesselName}) to the main job list?`)) return;
  // Create a new job from the upcoming job data
  const newJob = {
    id: nextId(),
    jobNumber: j.jobNumber||'',
    clientName: j.clientName||'',
    vesselName: j.vesselName||'',
    jobScope: j.jobScope||'',
    receiptDate: j.receiptDate||today(),
    targetDate: j.targetDate||'',
    plannedStartDate: j.plannedStartDate||null,
    daysRequired: j.daysRequired||1,
    personInCharge: j.personInCharge||'',
    location: j.location||'HO',
    status: 'planned',
    priorityLevel: j.priorityLevel||'medium',
    completionPercentage: 0,
    daysElapsed: 0,
    startDate: null,
    actualDaysToComplete: null,
    completionDate: null,
    holdStartDate: null,
    holdDays: null,
    qcDone: false,
    qcDoneBy: null,
    reworkHistory: null,
    reworkCycles: null,
    reassignmentHistory: null,
    sharedWith: null,
    sharedJobDetails: null,
    remark: j.notes||null,
    isRework: false,
    parentJobId: null,
    revisionNumber: null
  };
  JT.jobs.unshift(newJob);
  // Remove from upcoming
  JT.upcomingJobs = JT.upcomingJobs.filter(u=>u.id!==id);
  save();
  renderAll();
  showToast(`"${j.jobScope}" moved to job tracker as Planned`,'ok');
}

// ===================== PERSONS =====================
function renderPersons() {
  const colors=['#1a6b4a','#1553a0','#6b35b8','#a05a00','#b01c1c','#0e7490','#b06000','#2e7d32'];
  const grid = document.getElementById('personsGrid');
  if(!JT.persons.length) {
    grid.innerHTML = emptyState('persons', 'No team members yet', 'Add the people who work on jobs to assign work and plan their schedule.', `<button type="button" class="btn btn-primary" onclick="openAddPerson()">${ic('plus')}Add Person</button>`);
    return;
  }
  grid.innerHTML=JT.persons.map((p,i)=>{
    const active=JT.jobs.filter(j=>j.personInCharge===p.name&&['ongoing','planned','rework ongoing','rework planned'].includes(j.status)).length;
    const total=JT.jobs.filter(j=>j.personInCharge===p.name).length;
    return `<article class="person-card" aria-label="${esc(p.name)}">
      <div class="person-top">
        <div class="person-avatar" style="--av:${colors[i%colors.length]}" aria-hidden="true">${esc(initials(p.name))}</div>
        <div>
          <button type="button" class="person-name-link" onclick="filterByPerson(${jsArg(p.name)})" title="Show jobs for ${esc(p.name)}">${esc(p.name)}</button>
          <div class="person-meta">${esc(p.location)} · ${esc(p.position||'NA')}</div>
        </div>
      </div>
      <div class="person-stats">
        <span class="person-stat ${active?'is-active':''}">${active} active</span>
        <span class="person-stat">${total} total</span>
      </div>
      <div class="person-actions">
        <button type="button" class="act-btn edit" onclick="openEditPerson(${p.id})" aria-label="Edit ${esc(p.name)}">${ic('edit')}<span class="lbl">Edit</span></button>
        <button type="button" class="act-btn del" onclick="deletePerson(${p.id})" aria-label="Remove ${esc(p.name)}">${ic('trash')}<span class="lbl">Remove</span></button>
      </div>
    </article>`;
  }).join('');
}

// ===================== DROPDOWNS =====================
function populatePersonDropdowns() {
  const opts=`<option value="">— Unassigned —</option>`+JT.persons.map(p=>`<option value="${p.name}">${p.name} (${p.location})</option>`).join('');
  ['fPerson','fQcBy','fuPerson','rAssignPerson','rwPerson','qcBySelect','sharePerson'].forEach(id=>{const e=document.getElementById(id);if(e)e.innerHTML=opts;});
  const pf=document.getElementById('jobPersonFilter');
  if(pf) pf.innerHTML=`<option value="">All Persons</option>`+JT.persons.map(p=>`<option value="${p.name}">${p.name}</option>`).join('');
}

function populatePersonFilter() {
  const el = document.getElementById('jobPersonFilter');
  if(!el) return;
  el.innerHTML = `<option value="">All Persons</option>` + JT.persons.map(p=>`<option value="${p.name}">${p.name}</option>`).join('');
}

function populatePlanPersonFilter() {
  const el = document.getElementById('planPersonFilter');
  if(!el) return;
  el.innerHTML = `<option value="">All Persons</option>` + JT.persons.map(p=>`<option value="${p.name}">${p.name}</option>`).join('');
}


// ===================== MODALS =====================
function openModal(id){document.getElementById(id).classList.remove('hidden');}
function closeModal(id){
  // Reset chip actions if closing chipModal
  if(id==='jobChipModal' && window._chipIsUpcoming) {
    const actionsEl=document.getElementById('chipActions');
    if(actionsEl) actionsEl.innerHTML=`
      <button class="btn btn-sm" onclick="closeModal('jobChipModal');openEditJob(actionJobId)" style="font-size:11px">✏ Edit</button>
      <button class="btn btn-sm" onclick="closeModal('jobChipModal');openReassign(actionJobId)" style="font-size:11px">👤 Reassign</button>
      <button class="btn btn-sm" onclick="closeModal('jobChipModal');openShiftDate(actionJobId)" style="font-size:11px">📅 Shift</button>
      <button class="btn btn-sm" onclick="closeModal('jobChipModal');openChangePriority(actionJobId)" style="font-size:11px">🔺 Priority</button>
      <button class="btn btn-sm hold" onclick="closeModal('jobChipModal');openHold(actionJobId)" style="font-size:11px">⏸ Hold</button>
      <button class="btn btn-sm" onclick="closeModal('jobChipModal');deleteJob(actionJobId)" style="font-size:11px;border-color:var(--red-border);color:var(--red)">🗑 Delete</button>`;
    window._chipIsUpcoming=false;
  }document.getElementById(id).classList.add('hidden');editJobId=null;editPersonId=null;actionJobId=null;}
document.querySelectorAll('.overlay').forEach(el=>el.addEventListener('click',e=>{if(e.target===el)el.classList.add('hidden');}));

function openAddJob() {
  editJobId=null;
  document.getElementById('jobModalTitle').textContent='Add Job';
  ['fJobNum','fClient','fVessel','fScope','fRemark'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('fLoc').value='HO';
  document.getElementById('fStatus').value='not planned';
  document.getElementById('fPriority').value='medium';
  document.getElementById('fDays').value=1;
  document.getElementById('fCompletion').value=0;
  document.getElementById('fReceipt').value=today();
  document.getElementById('fTarget').value='';
  document.getElementById('fPlanStart').value='';
  document.getElementById('fIsRework').value='false';
  document.getElementById('fParentId').value='';
  document.getElementById('fRevision').value='';
  const fEst=document.getElementById('fEstManhours'); if(fEst) fEst.value='';
  const fInv=document.getElementById('fInvoiceAmount'); if(fInv) fInv.value='';
  const fInvPer=document.getElementById('fInvoiceAmountPer'); if(fInvPer) fInvPer.value='';
  // Reset invoice type to lump sum
  const fInvLump=document.getElementById('fInvLump'); if(fInvLump) fInvLump.checked=true;
  handleInvoiceTypeChange();
  handleStatusChange();
  populatePersonDropdowns();
  const _ms=document.getElementById('multiScopeSection');
  if(_ms){_ms.style.display='block';document.getElementById('multiScopeList').innerHTML='';}
  openModal('jobModal');
}

function openEditJob(id) {
  editJobId=id;
  const j=JT.jobs.find(x=>x.id===id); if(!j) return;
  document.getElementById('jobModalTitle').textContent = j.isRework
    ? `Edit Rework Job (Rev. ${j.revisionNumber||'1'})`
    : 'Edit Job';
  const ms=document.getElementById('multiScopeSection');
  if(ms) ms.style.display='none';
  document.getElementById('fJobNum').value=j.jobNumber||'';
  document.getElementById('fClient').value=j.clientName||'';
  document.getElementById('fVessel').value=j.vesselName||'';
  document.getElementById('fScope').value=j.jobScope||'';
  document.getElementById('fLoc').value=j.location||'HO';
  document.getElementById('fReceipt').value=j.receiptDate||'';
  document.getElementById('fTarget').value=j.targetDate||'';
  document.getElementById('fPlanStart').value=j.plannedStartDate||'';
  document.getElementById('fDays').value=j.daysRequired||1;
  document.getElementById('fStatus').value=j.status||'not planned';
  document.getElementById('fPriority').value=j.priorityLevel||'medium';
  document.getElementById('fCompletion').value=j.completionPercentage||0;
  document.getElementById('fRemark').value=j.remark||'';
  const fEst2=document.getElementById('fEstManhours'); if(fEst2) fEst2.value=j.estimatedManhours||'';
  const fInv2=document.getElementById('fInvoiceAmount'); if(fInv2) fInv2.value=j.invoiceAmount||'';
  const fInvPer2=document.getElementById('fInvoiceAmountPer'); if(fInvPer2) fInvPer2.value='';
  // Restore invoice type
  const isPerSc = j.invoiceType==='per';
  const fInvLump2=document.getElementById('fInvLump'); if(fInvLump2) fInvLump2.checked=!isPerSc;
  const fInvPer2b=document.getElementById('fInvPer'); if(fInvPer2b) fInvPer2b.checked=isPerSc;
  if(isPerSc && fInvPer2) fInvPer2.value=j.invoiceAmount||'';
  handleInvoiceTypeChange();
  // Store isRework in hidden field for saveJob to read
  const fIsRework = document.getElementById('fIsRework');
  if(fIsRework) fIsRework.value = j.isRework ? 'true' : 'false';
  document.getElementById('fParentId').value=j.parentJobId||'';
  document.getElementById('fRevision').value=j.revisionNumber||'';
  handleStatusChange();
  populatePersonDropdowns();
  setTimeout(()=>{document.getElementById('fPerson').value=j.personInCharge||'';document.getElementById('fQcBy').value=j.qcDoneBy||'';},50);
  openModal('jobModal');
}

function handleStatusChange() {
  const s = document.getElementById('fStatus').value;
  const isRw = isReworkStatus(s) || (document.getElementById('fIsRework') && document.getElementById('fIsRework').value === 'true');
  // Show rework info panel only if this is already a rework job
  const reworkSec = document.getElementById('reworkSection');
  if(reworkSec) reworkSec.style.display = isRw ? 'block' : 'none';
}

function saveJob() {
  if(!validateForm('jobModal')) return;
  const vessel=document.getElementById('fVessel').value.trim();
  if(!vessel){showToast('Vessel name required','err');return;}
  const isRw=document.getElementById('fIsRework').value==='true';
  // Auto-derive location from person if person is selected
  const selectedPerson = document.getElementById('fPerson').value;
  let loc = document.getElementById('fLoc').value;
  if(selectedPerson) {
    const personObj = JT.persons.find(p=>p.name===selectedPerson);
    if(personObj) loc = personObj.location;
  }
  const d={
    jobNumber:document.getElementById('fJobNum').value.trim(),
    clientName:document.getElementById('fClient').value.trim(),
    vesselName:vessel,
    jobScope:document.getElementById('fScope').value.trim(),
    location:loc,
    receiptDate:document.getElementById('fReceipt').value,
    targetDate:document.getElementById('fTarget').value,
    plannedStartDate:document.getElementById('fPlanStart').value||null,
    daysRequired:parseInt(document.getElementById('fDays').value)||1,
    personInCharge:selectedPerson,
    status:document.getElementById('fStatus').value,
    priorityLevel:document.getElementById('fPriority').value,
    completionPercentage:parseInt(document.getElementById('fCompletion').value)||0,
    qcDone:false,qcDoneBy:document.getElementById('fQcBy').value||null,
    remark:document.getElementById('fRemark').value||null,
    estimatedManhours:parseFloat(document.getElementById('fEstManhours')?.value)||null,
    invoiceAmount:null,  // set below based on type
    invoiceType: document.getElementById('fInvPer')?.checked ? 'per' : 'lump',
    isRework:isRw,
    parentJobId:isRw?(parseInt(document.getElementById('fParentId').value)||null):null,
    revisionNumber:isRw?(document.getElementById('fRevision').value||null):null,
    reworkHistory:null,reworkCycles:null,reassignmentHistory:null,sharedWith:null,sharedJobDetails:null,
    startDate:document.getElementById('fPlanStart').value||null,
    actualDaysToComplete:null,completionDate:null,holdStartDate:null,holdDays:null,daysElapsed:0
  };
  if(d.status==='complete'){d.completionPercentage=100;d.completionDate=d.completionDate||today();}

  // Resolve invoice amounts
  const isPerScope = d.invoiceType === 'per';
  if(isPerScope) {
    // Primary scope gets its own field value
    d.invoiceAmount = parseFloat(document.getElementById('fInvoiceAmountPer')?.value)||null;
  } else {
    // Lump sum — store on primary scope; report engine will split by manhour ratio
    d.invoiceAmount = parseFloat(document.getElementById('fInvoiceAmount')?.value)||null;
  }

  if(editJobId){
    const idx=JT.jobs.findIndex(j=>j.id===editJobId);
    if(idx>=0) JT.jobs[idx]={...JT.jobs[idx],...d};
    showToast('Job updated','ok');
    save();closeModal('jobModal');renderAll();
  } else {
    // Primary job
    d.id=nextId(); JT.jobs.unshift(d);
    // Additional scopes — same Job#/Client/Vessel/Receipt, each becomes its own job
    const extras=getMultiScopeData();
    extras.forEach(sc=>{
      // Auto-derive location for each scope
      let scLoc = sc.location;
      if(sc.person) { const po=JT.persons.find(p=>p.name===sc.person); if(po) scLoc=po.location; }
      JT.jobs.unshift({
        id:nextId(),
        jobNumber:d.jobNumber, clientName:d.clientName,
        vesselName:d.vesselName, receiptDate:d.receiptDate,
        jobScope:sc.scope, targetDate:sc.targetDate,
        plannedStartDate:sc.plannedStart||null,
        daysRequired:sc.days,
        personInCharge:sc.person, location:scLoc,
        status:sc.status||'not planned',
        priorityLevel:sc.priority,
        completionPercentage:sc.pct||0,
        estimatedManhours:sc.estManhours||null,
        invoiceAmount: isPerScope ? (sc.invoiceAmount||null) : null,
        invoiceType: d.invoiceType,
        daysElapsed:0, startDate:null,
        actualDaysToComplete:null, completionDate:null,
        holdStartDate:null, holdDays:null,
        qcDone:sc.qcDoneBy?true:false,
        qcDoneBy:sc.qcDoneBy||null,
        reworkHistory:null, reworkCycles:null, reassignmentHistory:null,
        sharedWith:null, sharedJobDetails:null, remark:null,
        isRework:false, parentJobId:null, revisionNumber:null
      });
    });
    save();closeModal('jobModal');renderAll();
    showToast(`${1+extras.length} job(s) added`,'ok');
  }
}

function deleteJob(id){
  if(!confirm('Delete this job?'))return;
  JT.jobs=JT.jobs.filter(j=>j.id!==id);save();renderAll();showToast('Job deleted');
}

// ===== ACTION MODALS =====
function openReassign(id){
  actionJobId=id;populatePersonDropdowns();
  const j=JT.jobs.find(x=>x.id===id);
  setTimeout(()=>{if(j)document.getElementById('rAssignPerson').value=j.personInCharge||'';},50);
  document.getElementById('rAssignReason').value='';
  openModal('reassignModal');
}
function doReassign(){
  const j=JT.jobs.find(x=>x.id===actionJobId); if(!j) return;
  const newPerson=document.getElementById('rAssignPerson').value;
  const reason=document.getElementById('rAssignReason').value;
  const reassignDate=document.getElementById('rAssignDate')?.value||today();
  const pctAtHandover=parseInt(document.getElementById('rAssignPct')?.value)||j.completionPercentage||0;
  if(!j.reassignmentHistory)j.reassignmentHistory=[];
  j.reassignmentHistory.push({from:j.personInCharge,to:newPerson,reason,date:reassignDate,pctAtHandover});
  const prev=j.personInCharge;
  j.personInCharge=newPerson;
  j.completionPercentage=pctAtHandover;
  j.startDate=reassignDate;
  if(!['ongoing','rework ongoing'].includes(j.status)) j.status='planned';
  save();closeModal('reassignModal');
  setTimeout(()=>renderAll(),30);
  showToast(`Reassigned to ${newPerson||'?'} (${pctAtHandover}% done by ${prev||'?'})`,'ok');
}

function openShiftDate(id){
  actionJobId=id;
  const j=JT.jobs.find(x=>x.id===id);
  document.getElementById('shiftDate').value=j?.targetDate||'';
  document.getElementById('shiftOldDate').textContent=j?`Current target: ${fmtDL(j.targetDate)}`:'';
  openModal('shiftModal');
}
function doShiftDate(){
  if(!validateForm('shiftModal')) return;
  const j=JT.jobs.find(x=>x.id===actionJobId);if(!j)return;
  const nd=document.getElementById('shiftDate').value;
  if(!nd){showToast('Please select a date','err');return;}
  j.targetDate=nd;save();closeModal('shiftModal');renderAll();showToast('Target date updated','ok');
}

function openPriority(id){
  actionJobId=id;
  const j=JT.jobs.find(x=>x.id===id);
  document.getElementById('newPriority').value=j?.priorityLevel||'medium';
  openModal('priorityModal');
}
function doPriority(){
  const j=JT.jobs.find(x=>x.id===actionJobId);if(!j)return;
  j.priorityLevel=document.getElementById('newPriority').value;
  save();closeModal('priorityModal');renderAll();showToast('Priority updated','ok');
}

function isHoldActive(j){
  if(!j.holdStartDate) return false;
  if(!j.holdDays) return true; // indefinite
  const p=j.holdStartDate.split('-');
  const hEnd=new Date(+p[0],+p[1]-1,+p[2]); hEnd.setDate(hEnd.getDate()+j.holdDays);
  return localDateStr(hEnd)>=today();
}
function openHold(id){
  actionJobId=id;
  const j=JT.jobs.find(x=>x.id===id); if(!j) return;
  if(isHoldActive(j)){
    document.getElementById('holdModalTitle').textContent='⏸ Job is On Hold';
    const until=j.holdDays?fmtD(addDays(j.holdStartDate,j.holdDays)):'Until manually unholded';
    document.getElementById('holdModalBody').innerHTML=`
      <div style="background:var(--amber-bg);border:1px solid var(--amber-border);border-radius:var(--r);padding:10px;margin-bottom:12px;font-size:12px">
        <div><strong>On hold since:</strong> ${fmtD(j.holdStartDate)}</div>
        <div><strong>Hold until:</strong> ${until}</div>
        ${j.holdReason?`<div style="color:var(--text2);margin-top:4px">Reason: ${j.holdReason}</div>`:''}
      </div>
      <div class="form-group"><label class="form-label">Extend hold by (days)</label>
        <input class="form-ctrl" type="number" id="holdExtendDays" min="1" placeholder="e.g. 3"></div>`;
    document.getElementById('holdModalFooter').innerHTML=`
      <button class="btn" onclick="closeModal('holdModal')">Cancel</button>
      <button class="btn" style="border-color:var(--green-border);color:var(--green);background:var(--green-bg)" onclick="doUnhold()">▶ Unhold Now</button>
      <button class="btn btn-primary" onclick="doExtendHold()">+ Extend Hold</button>`;
  } else {
    document.getElementById('holdModalTitle').textContent='⏸ Hold Job';
    document.getElementById('holdModalBody').innerHTML=`
      <div style="font-size:11px;color:var(--text2);margin-bottom:10px">Job stays in Active list. Planning skips held days and resumes automatically if duration is set.</div>
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Hold Start Date</label><input class="form-ctrl" type="date" id="holdDate" value="${today()}"></div>
        <div class="form-group"><label class="form-label">Duration (days) — optional</label>
          <input class="form-ctrl" type="number" id="holdDaysInput" min="1" placeholder="Blank = hold until manual unhold"></div>
        <div class="form-group full"><label class="form-label">Reason</label><input class="form-ctrl" id="holdReason" placeholder="Reason for hold"></div>
      </div>`;
    document.getElementById('holdModalFooter').innerHTML=`
      <button class="btn" onclick="closeModal('holdModal')">Cancel</button>
      <button class="btn btn-primary" onclick="doHold()">⏸ Confirm Hold</button>`;
  }
  openModal('holdModal');
}
function doHold(){
  const j=JT.jobs.find(x=>x.id===actionJobId); if(!j) return;
  j.holdStartDate=document.getElementById('holdDate')?.value||today();
  j.holdDays=parseInt(document.getElementById('holdDaysInput')?.value)||null;
  j.holdReason=document.getElementById('holdReason')?.value||'';
  // Keep status unchanged — job stays in active list
  save();closeModal('holdModal');setTimeout(()=>renderAll(),30);
  showToast(j.holdDays?`Job held for ${j.holdDays} day(s)`:'Job held (indefinitely)','ok');
}
function doUnhold(){
  const j=JT.jobs.find(x=>x.id===actionJobId); if(!j) return;
  j.holdStartDate=null;j.holdDays=null;j.holdReason=null;
  save();closeModal('holdModal');setTimeout(()=>renderAll(),30);
  showToast('Job unholded — back in planning','ok');
}
function doExtendHold(){
  const j=JT.jobs.find(x=>x.id===actionJobId); if(!j) return;
  const extra=parseInt(document.getElementById('holdExtendDays')?.value)||0;
  if(!extra){showToast('Enter days to extend','err');return;}
  j.holdDays=(j.holdDays||0)+extra;
  save();closeModal('holdModal');setTimeout(()=>renderAll(),30);
  showToast(`Hold extended by ${extra} day(s)`,'ok');
}
function resumeJob(id){
  const j=JT.jobs.find(x=>x.id===id);if(!j)return;
  j.status=j.isRework?'rework ongoing':'ongoing';j.holdStartDate=null;
  save();renderAll();showToast('Job resumed','ok');
}

// ===== PERSONS =====
function openAddPerson(){editPersonId=null;document.getElementById('personModalTitle').textContent='Add Person';['fPName'].forEach(id=>document.getElementById(id).value='');document.getElementById('fPLoc').value='HO';document.getElementById('fPPos').value='NA';openModal('personModal');}
function openEditPerson(id){
  editPersonId=id;const p=JT.persons.find(x=>x.id===id);if(!p)return;
  document.getElementById('personModalTitle').textContent='Edit Person';
  document.getElementById('fPName').value=p.name;document.getElementById('fPLoc').value=p.location||'HO';document.getElementById('fPPos').value=p.position||'NA';
  openModal('personModal');
}
function savePerson(){
  if(!validateForm('personModal')) return;
  const name=document.getElementById('fPName').value.trim();
  if(!name){showToast('Name required','err');return;}
  const d={name,location:document.getElementById('fPLoc').value,position:document.getElementById('fPPos').value};
  if(editPersonId){const idx=JT.persons.findIndex(p=>p.id===editPersonId);if(idx>=0)JT.persons[idx]={...JT.persons[idx],...d};showToast('Person updated','ok');}
  else{d.id=nextId();JT.persons.push(d);showToast('Person added','ok');}
  save();closeModal('personModal');renderAll();
}
function deletePerson(id){if(!confirm('Remove person?'))return;JT.persons=JT.persons.filter(p=>p.id!==id);save();renderAll();showToast('Person removed');}

// ===== UPCOMING =====
function openAddUpcoming(){
  editUpcomingId = null;
  ['fuVessel','fuScope','fuNotes','fuJobNum','fuClient'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  document.getElementById('fuTarget').value='';
  if(document.getElementById('fuPlanStart')) document.getElementById('fuPlanStart').value='';
  document.getElementById('fuDays').value=1;
  document.getElementById('fuLoc').value='HO';
  document.getElementById('fuPriority').value='medium';
  document.getElementById('upcomingModalTitle').textContent='Add Upcoming Job';
  populatePersonDropdowns();
  openModal('upcomingModal');
}
function openEditUpcoming(id){
  editUpcomingId=id;
  const j=JT.upcomingJobs.find(x=>x.id===id);
  if(!j){showToast('Job not found','err');return;}
  document.getElementById('upcomingModalTitle').textContent='Edit Upcoming Job';
  const sv=(elId,val)=>{const el=document.getElementById(elId);if(el)el.value=val||'';};
  sv('fuVessel',j.vesselName); sv('fuJobNum',j.jobNumber); sv('fuClient',j.clientName);
  sv('fuScope',j.jobScope); sv('fuTarget',j.targetDate); sv('fuPlanStart',j.plannedStartDate);
  sv('fuDays',j.daysRequired||1); sv('fuLoc',j.location||'HO');
  sv('fuPriority',j.priorityLevel||'medium'); sv('fuNotes',j.notes);
  populatePersonDropdowns();
  setTimeout(()=>sv('fuPerson',j.personInCharge),60);
  openModal('upcomingModal');
}

function saveUpcoming(){
  if(!validateForm('upcomingModal')) return;
  const v=document.getElementById('fuVessel').value.trim();
  if(!v){showToast('Vessel required','err');return;}
  const data={
    vesselName:v,
    jobNumber:document.getElementById('fuJobNum')?.value.trim()||'',
    clientName:document.getElementById('fuClient')?.value.trim()||'',
    jobScope:document.getElementById('fuScope').value,
    receiptDate:today(),
    targetDate:document.getElementById('fuTarget').value,
    plannedStartDate:document.getElementById('fuPlanStart')?.value||null,
    daysRequired:parseInt(document.getElementById('fuDays').value)||1,
    personInCharge:document.getElementById('fuPerson').value||'',
    location:document.getElementById('fuLoc').value,
    status:'planned',
    priorityLevel:document.getElementById('fuPriority').value,
    notes:document.getElementById('fuNotes').value||null,
    updatedAt:new Date().toISOString()
  };
  if(editUpcomingId) {
    const idx=JT.upcomingJobs.findIndex(u=>u.id===editUpcomingId);
    if(idx>=0) JT.upcomingJobs[idx]={...JT.upcomingJobs[idx],...data};
    showToast('Upcoming job updated','ok');
    editUpcomingId=null;
  } else {
    JT.upcomingJobs.push({id:nextId(),...data,createdAt:new Date().toISOString()});
    showToast('Upcoming job added','ok');
  }
  save();closeModal('upcomingModal');renderUpcoming();
}
function deleteUpcoming(id){if(!confirm('Remove?'))return;JT.upcomingJobs=JT.upcomingJobs.filter(u=>u.id!==id);save();renderUpcoming();showToast('Removed');}

// ===== IMPORT / EXPORT =====

function quickPctChange(jobId, val) {
  const pct = Math.min(100, Math.max(0, parseInt(val)||0));
  const j = JT.jobs.find(x=>x.id===jobId);
  if(!j) return;
  j.completionPercentage = pct;
  if(pct===100) {
    // Pass the correct target status to openCompletionDate
    const targetStatus = j.isRework ? 'rework completed' : 'complete';
    openCompletionDate(jobId, targetStatus);
  } else if(pct > 0) {
    // Rework status auto-change
    if(j.isRework || isReworkStatus(j.status)) {
      if(j.status==='rework planned' || j.status==='rework completed') {
        j.status = 'rework ongoing';
      }
    } else {
      if(j.status==='not planned'||j.status==='planned') {
        j.status = 'ongoing';
      }
    }
    save(); renderJobsPage(); renderPlanning();
    showToast(`${j.jobNumber||'Job'}: ${pct}%`,'ok');
  } else {
    save(); renderJobsPage(); renderPlanning();
    showToast(`${j.jobNumber||'Job'}: ${pct}%`,'ok');
  }
}

function openRemarkModal(id) {
  actionJobId = id;
  const j = JT.jobs.find(x=>x.id===id);
  if(!j) return;
  document.getElementById('remarkModalTitle').textContent = 'Remark — ' + (j.jobNumber||'Job');
  document.getElementById('remarkJobInfo').textContent = j.vesselName + ' · ' + j.jobScope.substring(0,50);
  document.getElementById('remarkText').value = j.remark||'';
  openModal('remarkModal');
}

function saveRemarkFromModal() {
  const j = JT.jobs.find(x=>x.id===actionJobId);
  if(!j) return;
  j.remark = document.getElementById('remarkText').value.trim()||null;
  save();
  closeModal('remarkModal');
  renderAll();
  showToast('Remark saved','ok');
}


// ===================== REWORK LOGIC =====================
let _reworkSourceId = null;

function openReworkDialog(id) {
  _reworkSourceId = id;
  const j = JT.jobs.find(x => x.id === id);
  if(!j) return;

  // Calculate next revision number
  const existingReworks = JT.jobs.filter(x => x.parentJobId === id || (x.isRework && x.jobNumber === j.jobNumber && x.vesselName === j.vesselName && x.jobScope === j.jobScope));
  const nextRev = (existingReworks.length + 1).toString();

  document.getElementById('reworkSourceInfo').textContent = `${j.vesselName} — ${j.jobScope} (Job #${j.jobNumber||'—'})`;
  document.getElementById('rwRevisionInput').value = nextRev;
  document.getElementById('rwParentIdPreview').textContent = id;
  document.getElementById('rwTargetDate').value = '';
  document.getElementById('rwDays').value = j.daysRequired || 1;
  document.getElementById('rwPriority').value = j.priorityLevel || 'urgent';
  document.getElementById('rwReason').value = '';

  // Populate person dropdown
  populatePersonDropdowns();
  setTimeout(() => {
    document.getElementById('rwPerson').value = j.personInCharge || '';
  }, 50);

  openModal('reworkDialogModal');
}

function confirmReopen() {
  if(!validateForm('reworkDialogModal')) return;
  const j = JT.jobs.find(x => x.id === _reworkSourceId);
  if(!j) return;

  const targetDate = document.getElementById('rwTargetDate').value;
  if(!targetDate) { showToast('Please set a target date', 'err'); return; }

  // Calculate revision number
  const existingReworks = JT.jobs.filter(x => x.parentJobId === _reworkSourceId || (x.isRework && x.jobNumber === j.jobNumber && x.vesselName === j.vesselName && x.jobScope === j.jobScope));
  const nextRev = document.getElementById('rwRevisionInput')?.value.trim() || (existingReworks.length + 1).toString();

  // Create new rework job — duplicate of original
  const reworkJob = {
    id: nextId(),
    jobNumber: j.jobNumber || '',
    clientName: j.clientName || '',
    vesselName: j.vesselName || '',
    jobScope: j.jobScope || '',
    receiptDate: today(),
    targetDate: targetDate,
    plannedStartDate: null,
    daysRequired: parseInt(document.getElementById('rwDays').value) || j.daysRequired || 1,
    personInCharge: document.getElementById('rwPerson').value || j.personInCharge || '',
    location: j.location || 'HO',
    status: 'rework planned',
    priorityLevel: document.getElementById('rwPriority').value || 'urgent',
    completionPercentage: 0,
    daysElapsed: 0,
    startDate: null,
    actualDaysToComplete: null,
    completionDate: null,
    holdStartDate: null,
    holdDays: null,
    qcDone: false,
    qcDoneBy: null,
    reworkHistory: [{
      originalJobId: _reworkSourceId,
      completedDate: j.completionDate || j.targetDate,
      daysRequired: j.daysRequired,
      actualDays: j.actualDaysToComplete,
      personInCharge: j.personInCharge
    }],
    reworkCycles: null,
    reassignmentHistory: null,
    sharedWith: null,
    sharedJobDetails: null,
    remark: document.getElementById('rwReason').value || null,
    isRework: true,
    parentJobId: _reworkSourceId,
    revisionNumber: nextRev
  };

  // Original job stays COMPLETE — just add rework reference to it
  const origIdx = JT.jobs.findIndex(x => x.id === _reworkSourceId);
  if(origIdx >= 0) {
    if(!JT.jobs[origIdx].reworkHistory) JT.jobs[origIdx].reworkHistory = [];
    JT.jobs[origIdx].reworkHistory.push({
      reworkJobId: reworkJob.id,
      revisionNumber: nextRev,
      createdDate: today(),
      personInCharge: reworkJob.personInCharge
    });
  }

  // Add new rework job to top of list
  JT.jobs.unshift(reworkJob);
  save();
  closeModal('reworkDialogModal');
  renderAll();

  // Switch to rework tab to show the new job
  setJobTab('rework', null);
  showPage('jobs', document.querySelectorAll('.nav-btn')[1]);
  showToast(`Rework job created — Revision ${nextRev}`, 'ok');
}

// ===================== QC CHANGE =====================
function openChangeQC(id) {
  actionJobId = id;
  const j = JT.jobs.find(x => x.id === id);
  if(!j) return;
  document.getElementById('qcJobInfo').textContent = `${j.vesselName} — ${j.jobScope}`;
  document.getElementById('qcDoneSelect').value = j.qcDone ? 'true' : 'false';
  populatePersonDropdowns();
  setTimeout(() => {
    document.getElementById('qcBySelect').value = j.qcDoneBy || '';
  }, 50);
  openModal('changeQCModal');
}

function saveQCChange() {
  const j = JT.jobs.find(x => x.id === actionJobId);
  if(!j) return;
  j.qcDone = document.getElementById('qcDoneSelect').value === 'true';
  j.qcDoneBy = document.getElementById('qcBySelect').value || null;
  save();
  closeModal('changeQCModal');
  renderAll();
  showToast('QC status updated', 'ok');
}

// ===================== EXCEL EXPORTS =====================
function showExportMenu() {
  document.getElementById('exportMenuModal').classList.remove('hidden');
}

async function exportExcel(type) {
  closeModal('exportMenuModal');
  // The menu's "Planning View — next 14 days" option had no sheet in v1 ("No data to export");
  // it now produces the same file as Planning → Export Excel → Next 2 Weeks.
  if(type==='planning') { setPlanExportLoc(''); return exportPlanningExcel(2); }
  try { await ensureExcelJS(); } catch(e) { showToast('Excel export needs an internet connection the first time. Please try again online.','err'); return; }

  // ── Slack colour palette (ARGB for ExcelJS) ──
  const COL = {
    headerBg:      'FF3F0E40', headerText:   'FFFFFFFF',
    subHeaderBg:   'FF522653', subHeaderText:'FFFCFCFC',
    // Status colours
    ongoing:       'FFFFF8E1', ongoingText:  'FF92400E', ongoingBorder:'FFECB22E',
    planned:       'FFE8F4FD', plannedText:  'FF1164A3', plannedBorder:'FF1164A3',
    notPlanned:    'FFF8F8F8', notPlText:    'FF616061', notPlBorder:  'FFDDDDDD',
    complete:      'FFE8F5EE', compText:     'FF1A7A4A', compBorder:   'FF2BAC76',
    rework:        'FFF3E5F5', reworkText:   'FF7C3085', reworkBorder: 'FF7C3085',
    overdue:       'FFFFEBEE', overdueText:  'FFC0392B', overdueBorder:'FFE01E5A',
    hold:          'FFFFF3E0', holdText:     'FFB45309', holdBorder:   'FFECB22E',
    cancelled:     'FFF5F5F5', cancelText:   'FF999999', cancelBorder: 'FFDDDDDD',
    // Priority colours
    topUrgent:     'FFFDECEC', topUrgentText:'FFC0392B',
    urgent:        'FFFFF3E0', urgentText:   'FFB45309',
    medium:        'FFF0F7FF', mediumText:   'FF1164A3',
    low:           'FFF0FDF4', lowText:      'FF1A7A4A',
    // Location
    hoBg:          'FFD9E8F5', hoText:       'FF1164A3',
    cokBg:         'FFD4EDDA', cokText:      'FF1A7A4A',
    // Variance
    varPos:        'FFFDECEC', varPosText:   'FFC0392B',  // late (positive variance)
    varNeg:        'FFE8F5EE', varNegText:   'FF1A7A4A',  // early (negative variance)
    varZero:       'FFF8F8F8', varZeroText:  'FF616061',
    // Misc
    altRow:        'FFFAFAFA',
    white:         'FFFFFFFF',
    border:        'FFDDDDDD',
    borderMed:     'FF7C3085',
    qcYes:         'FFE8F5EE', qcYesText: 'FF1A7A4A',
    qcNo:          'FFFFF8F8', qcNoText:  'FF999999',
  };

  // ── Helper: cell style setters ──
  const setHeader = (cell, txt, bgArgb) => {
    cell.value = txt;
    cell.fill  = {type:'pattern',pattern:'solid',fgColor:{argb:bgArgb||COL.headerBg}};
    cell.font  = {bold:true,color:{argb:COL.headerText},size:10,name:'Calibri'};
    cell.alignment = {horizontal:'center',vertical:'middle',wrapText:false};
    cell.border = {bottom:{style:'medium',color:{argb:COL.borderMed}},right:{style:'thin',color:{argb:COL.border}}};
  };

  const setCell = (cell, val, bgArgb, textArgb, bold=false, align='left') => {
    cell.value = val===null||val===undefined ? '' : val;
    cell.fill  = {type:'pattern',pattern:'solid',fgColor:{argb:bgArgb||COL.white}};
    cell.font  = {bold,color:{argb:textArgb||'FF1D1C1D'},size:9,name:'Calibri'};
    cell.alignment = {horizontal:align,vertical:'middle',wrapText:false};
    cell.border = {right:{style:'thin',color:{argb:COL.border}},bottom:{style:'thin',color:{argb:'FFEEEEEE'}}};
  };

  // ── Status → colours ──
  const statusColor = (status) => {
    const m = {
      'ongoing':          [COL.ongoing,   COL.ongoingText],
      'planned':          [COL.planned,   COL.plannedText],
      'not planned':      [COL.notPlanned,COL.notPlText],
      'complete':         [COL.complete,  COL.compText],
      'rework ongoing':   [COL.rework,    COL.reworkText],
      'rework planned':   [COL.rework,    COL.reworkText],
      'rework completed': [COL.complete,  COL.compText],
      'hold':             [COL.hold,      COL.holdText],
      'cancelled':        [COL.cancelled, COL.cancelText],
    };
    return m[status] || [COL.white,'FF1D1C1D'];
  };

  // ── Priority → colours ──
  const priorityColor = (p) => {
    const m = {
      'top urgent': [COL.topUrgent, COL.topUrgentText],
      'urgent':     [COL.urgent,    COL.urgentText],
      'medium':     [COL.medium,    COL.mediumText],
      'low':        [COL.low,       COL.lowText],
    };
    return m[(p||'').toLowerCase()] || [COL.white,'FF1D1C1D'];
  };

  const locColor = (loc) => loc==='HO' ? [COL.hoBg,COL.hoText] : [COL.cokBg,COL.cokText];

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Job Tracker';
  wb.created = new Date();

  // ══════════════════════════════════════════════════
  // ── SHEET BUILDER HELPER ──
  // ══════════════════════════════════════════════════
  const buildJobSheet = (ws, jobs, cols) => {
    ws.views = [{state:'frozen',xSplit:0,ySplit:1}];
    ws.columns = cols.map(c=>({width:c.w||16}));

    // Header row
    const hdr = ws.addRow(cols.map(c=>c.label));
    hdr.height = 22;
    hdr.eachCell(cell => setHeader(cell, cell.value));

    // Data rows
    jobs.forEach((j, ri) => {
      const rowBg = ri%2===0 ? COL.white : COL.altRow;
      const isOverdueJob = isOverdue(j);
      const row = ws.addRow(cols.map(c => c.val(j)));
      row.height = 18;

      row.eachCell({includeEmpty:true}, (cell, ci) => {
        const colDef = cols[ci-1];
        if(!colDef) return;
        let bg = rowBg, fg = 'FF1D1C1D', bold = false;

        // Column-specific colouring
        if(colDef.id==='status') {
          [bg,fg] = statusColor(j.status);
          bold = ['ongoing','rework ongoing'].includes(j.status);
          if(isOverdueJob) { bg=COL.overdue; fg=COL.overdueText; }
        } else if(colDef.id==='priority') {
          [bg,fg] = priorityColor(j.priorityLevel);
          bold = j.priorityLevel==='top urgent';
        } else if(colDef.id==='location') {
          [bg,fg] = locColor(j.location);
          bold = true;
        } else if(colDef.id==='variance') {
          const v = Number(cell.value);
          if(v > 0)      { bg=COL.varPos; fg=COL.varPosText; bold=true; }
          else if(v < 0) { bg=COL.varNeg; fg=COL.varNegText; }
          else           { bg=COL.varZero; fg=COL.varZeroText; }
        } else if(colDef.id==='pct') {
          const p = Number(cell.value)||0;
          bg = p===100 ? COL.complete : p>=75 ? 'FFE8F4FD' : p>=50 ? 'FFFFF8E1' : p>0 ? 'FFFFF3E0' : COL.white;
          fg = p===100 ? COL.compText : 'FF1D1C1D';
          bold = p===100;
        } else if(colDef.id==='qc') {
          [bg,fg] = cell.value==='Yes' ? [COL.qcYes,COL.qcYesText] : [COL.qcNo,COL.qcNoText];
        } else if(colDef.id==='jobnum') {
          bg = isOverdueJob ? COL.overdue : rowBg;
          fg = isOverdueJob ? COL.overdueText : 'FF1164A3';
          bold = true;
        } else if(colDef.id==='rework') {
          [bg,fg] = cell.value==='Yes' ? [COL.rework,COL.reworkText] : [rowBg,'FF616061'];
        } else if(colDef.id==='person') {
          bold = true;
        } else if(colDef.id==='overdueDays') {
          const v = Number(cell.value)||0;
          bg = v>14 ? COL.overdue : v>7 ? COL.urgent : COL.hold;
          fg = v>14 ? COL.overdueText : COL.urgentText;
          bold = v>7;
        }

        setCell(cell, cell.value, bg, fg, bold, colDef.align||'left');
      });
    });
  };

  // ══════════════════════════════════════════════════
  // ── SHEET: ALL JOBS / ACTIVE JOBS ──
  // ══════════════════════════════════════════════════
  if(type==='all'||type==='active') {
    const jobs = type==='all' ? JT.jobs
      : JT.jobs.filter(j=>['ongoing','planned','rework ongoing','rework planned'].includes(j.status));
    const ws = wb.addWorksheet(type==='all'?'All Jobs':'Active Jobs');
    const cols = [
      {id:'jobnum',   label:'Job #',            w:10, val:j=>j.jobNumber||''},
      {id:'client',   label:'Client',            w:20, val:j=>j.clientName||''},
      {id:'vessel',   label:'Vessel',            w:20, val:j=>j.vesselName||''},
      {id:'scope',    label:'Scope',             w:30, val:j=>j.jobScope||''},
      {id:'location', label:'Location',          w:8,  val:j=>j.location||'', align:'center'},
      {id:'status',   label:'Status',            w:14, val:j=>j.status||'', align:'center'},
      {id:'priority', label:'Priority',          w:12, val:j=>j.priorityLevel||'', align:'center'},
      {id:'person',   label:'Person In Charge',  w:16, val:j=>j.personInCharge||''},
      {id:'receipt',  label:'Receipt Date',      w:12, val:j=>j.receiptDate||'', align:'center'},
      {id:'target',   label:'Target Date',       w:12, val:j=>j.targetDate||'', align:'center'},
      {id:'planstart',label:'Planned Start',     w:12, val:j=>j.plannedStartDate||'', align:'center'},
      {id:'start',    label:'Start Date',        w:12, val:j=>j.startDate||'', align:'center'},
      {id:'compdate', label:'Completion Date',   w:14, val:j=>j.completionDate||'', align:'center'},
      {id:'days',     label:'Days Required',     w:12, val:j=>j.daysRequired||'', align:'center'},
      {id:'actual',   label:'Actual Days',       w:10, val:j=>j.actualDaysToComplete||'', align:'center'},
      {id:'variance', label:'Variance (days)',   w:12, val:j=>j.actualDaysToComplete&&j.daysRequired?(j.actualDaysToComplete-j.daysRequired):'', align:'center'},
      {id:'pct',      label:'Completion %',      w:12, val:j=>j.completionPercentage||0, align:'center'},
      {id:'hold',     label:'Hold Start',        w:12, val:j=>j.holdStartDate||'', align:'center'},
      {id:'holddays', label:'Hold Days',         w:9,  val:j=>j.holdDays||'', align:'center'},
      {id:'qc',       label:'QC Done',           w:8,  val:j=>j.qcDone?'Yes':'No', align:'center'},
      {id:'qcby',     label:'QC Done By',        w:14, val:j=>j.qcDoneBy||''},
      {id:'rework',   label:'Is Rework',         w:9,  val:j=>j.isRework?'Yes':'No', align:'center'},
      {id:'rev',      label:'Revision',          w:8,  val:j=>j.revisionNumber||'', align:'center'},
      {id:'remark',   label:'Remark',            w:24, val:j=>j.remark||''},
    ];
    buildJobSheet(ws, jobs, cols);
  }

  // ══════════════════════════════════════════════════
  // ── SHEET: OVERDUE JOBS ──
  // ══════════════════════════════════════════════════
  if(type==='overdue') {
    const jobs = JT.jobs.filter(j=>isOverdue(j));
    const ws = wb.addWorksheet('Overdue Jobs');
    const cols = [
      {id:'jobnum',      label:'Job #',          w:10, val:j=>j.jobNumber||''},
      {id:'client',      label:'Client',         w:20, val:j=>j.clientName||''},
      {id:'vessel',      label:'Vessel',         w:20, val:j=>j.vesselName||''},
      {id:'scope',       label:'Scope',          w:30, val:j=>j.jobScope||''},
      {id:'status',      label:'Status',         w:14, val:j=>j.status||'', align:'center'},
      {id:'priority',    label:'Priority',       w:12, val:j=>j.priorityLevel||'', align:'center'},
      {id:'person',      label:'Person',         w:16, val:j=>j.personInCharge||''},
      {id:'location',    label:'Location',       w:8,  val:j=>j.location||'', align:'center'},
      {id:'receipt',     label:'Receipt Date',   w:12, val:j=>j.receiptDate||'', align:'center'},
      {id:'target',      label:'Target Date',    w:12, val:j=>j.targetDate||'', align:'center'},
      {id:'overdueDays', label:'Days Overdue',   w:12, val:j=>Math.ceil((new Date()-new Date(j.targetDate))/86400000), align:'center'},
      {id:'days',        label:'Days Required',  w:12, val:j=>j.daysRequired||'', align:'center'},
      {id:'pct',         label:'Completion %',   w:12, val:j=>j.completionPercentage||0, align:'center'},
      {id:'remark',      label:'Remark',         w:24, val:j=>j.remark||''},
    ];
    buildJobSheet(ws, jobs, cols);
  }

  // ══════════════════════════════════════════════════
  // ── SHEET: COMPLETED JOBS ──
  // ══════════════════════════════════════════════════
  if(type==='complete') {
    const jobs = JT.jobs.filter(j=>['complete','rework completed'].includes(j.status));
    const ws = wb.addWorksheet('Completed Jobs');
    const cols = [
      {id:'jobnum',   label:'Job #',           w:10, val:j=>j.jobNumber||''},
      {id:'client',   label:'Client',          w:20, val:j=>j.clientName||''},
      {id:'vessel',   label:'Vessel',          w:20, val:j=>j.vesselName||''},
      {id:'scope',    label:'Scope',           w:30, val:j=>j.jobScope||''},
      {id:'person',   label:'Person',          w:16, val:j=>j.personInCharge||''},
      {id:'location', label:'Location',        w:8,  val:j=>j.location||'', align:'center'},
      {id:'status',   label:'Status',          w:16, val:j=>j.status||'', align:'center'},
      {id:'priority', label:'Priority',        w:12, val:j=>j.priorityLevel||'', align:'center'},
      {id:'receipt',  label:'Receipt Date',    w:12, val:j=>j.receiptDate||'', align:'center'},
      {id:'target',   label:'Target Date',     w:12, val:j=>j.targetDate||'', align:'center'},
      {id:'planstart',label:'Planned Start',   w:12, val:j=>j.plannedStartDate||'', align:'center'},
      {id:'start',    label:'Start Date',      w:12, val:j=>j.startDate||'', align:'center'},
      {id:'compdate', label:'Completion Date', w:14, val:j=>j.completionDate||'', align:'center'},
      {id:'days',     label:'Days Required',   w:12, val:j=>j.daysRequired||'', align:'center'},
      {id:'actual',   label:'Actual Days',     w:10, val:j=>j.actualDaysToComplete||'', align:'center'},
      {id:'variance', label:'Variance (days)', w:12, val:j=>j.actualDaysToComplete&&j.daysRequired?(j.actualDaysToComplete-j.daysRequired):'', align:'center'},
      {id:'qc',       label:'QC Done',         w:8,  val:j=>j.qcDone?'Yes':'No', align:'center'},
      {id:'qcby',     label:'QC Done By',      w:14, val:j=>j.qcDoneBy||''},
      {id:'rework',   label:'Is Rework',       w:9,  val:j=>j.isRework?'Yes':'No', align:'center'},
      {id:'rev',      label:'Revision',        w:8,  val:j=>j.revisionNumber||'', align:'center'},
      {id:'remark',   label:'Remark',          w:24, val:j=>j.remark||''},
    ];
    buildJobSheet(ws, jobs, cols);
  }

  // ══════════════════════════════════════════════════
  // ── SHEET: PERSONS ──
  // ══════════════════════════════════════════════════
  if(type==='persons') {
    const ws = wb.addWorksheet('Persons');
    ws.views = [{state:'frozen',xSplit:0,ySplit:1}];
    ws.columns = [
      {width:18},{width:10},{width:14},{width:12},{width:12},{width:10},{width:14}
    ];
    const hdr = ws.addRow(['Name','Location','Position','Active Jobs','Total Jobs','Completed','Next Free Date']);
    hdr.height = 22;
    hdr.eachCell(cell => setHeader(cell, cell.value));

    JT.persons.forEach((p, ri) => {
      const rowBg = ri%2===0 ? COL.white : COL.altRow;
      const active   = JT.jobs.filter(j=>j.personInCharge===p.name&&['ongoing','planned','rework ongoing','rework planned'].includes(j.status)).length;
      const total    = JT.jobs.filter(j=>j.personInCharge===p.name).length;
      const complete = JT.jobs.filter(j=>j.personInCharge===p.name&&j.status==='complete').length;
      const nextFree = typeof computeNextAvail==='function' ? computeNextAvail(p.name) : '';
      const row = ws.addRow([p.name, p.location, p.position||'—', active, total, complete, nextFree]);
      row.height = 18;
      const [locBg, locFg] = locColor(p.location);
      row.eachCell({includeEmpty:true}, (cell,ci) => {
        let bg=rowBg,fg='FF1D1C1D',bold=false;
        if(ci===1){bold=true;}
        if(ci===2){bg=locBg;fg=locFg;bold=true;}
        if(ci===4){bg=active>0?COL.ongoing:COL.complete;fg=active>0?COL.ongoingText:COL.compText;bold=active>0;}
        if(ci===6){bg=COL.complete;fg=COL.compText;}
        setCell(cell,cell.value,bg,fg,bold,ci>=4?'center':'left');
      });
    });
  }

  if(wb.worksheets.length===0){ showToast('No data to export','err'); return; }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  await downloadBlob(blob, `job-tracker-${type}-${today()}.xlsx`);
  showToast('Excel exported: '+type,'ok');
}

function exportData(){
  const d={jobs:JT.jobs,persons:JT.persons,upcomingJobs:JT.upcomingJobs,
    holidays:JT.holidays||[],workingDays:JT.workingDays||[],
    personHolidays:JT.personHolidays||{},compensationWorkingDays:JT.compensationWorkingDays||{},
    exportDate:new Date().toISOString()};
  const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});
  downloadBlob(blob, `job-tracker-data-${today()}.json`);
  jtMarkExported(); renderSettingsInfo();
  showToast('Data exported','ok');
}
function triggerImport(){document.getElementById('fileImport').click();}
function doImport(evt){
  const f=evt.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=e=>{
    try{
      let d;
      try { d=JSON.parse(jtStripBom(e.target.result)); }
      catch(parseErr) { throw new Error('the file is not valid JSON (is it a Job Tracker backup?)'); }
      // Same acceptance rule as v1 (a "jobs" array is required); everything else is optional.
      const check = jtValidateBackup(d);
      if(!check.ok) throw new Error(check.errors.join(' '));
      const sm = check.summary;
      const when = sm.exportDate ? new Date(sm.exportDate) : null;
      const lines = [
        `Import ${d.jobs.length} jobs and ${(d.persons||[]).length} persons?`,
        '',
        `File: ${f.name}`,
        when && !isNaN(when) ? `Backup date: ${when.toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}` : 'Backup date: not recorded (older version)',
        `Contains: ${sm.upcoming} upcoming · ${sm.holidays} holidays · ${sm.workingDays} working days · ${sm.personLeaveDays} leave days`,
      ];
      if(check.warnings.length) lines.push('', 'Notes:', ...check.warnings.map(w=>'• '+w));
      lines.push('', 'This will REPLACE all current data.', 'A safety copy of your current data is kept — you can undo this from Settings.');
      if(!confirm(lines.join('\n')))return;

      if(JT.jobs.length || JT.persons.length) {
        if(!jtSnapshotBeforeImport(JT, f.name) && !confirm('There is not enough space to keep a safety copy of your current data.\n\nExport a backup first if you may need it. Continue with the import anyway?')) return;
      }

      JT = {jobs:d.jobs||[],persons:d.persons||[],upcomingJobs:d.upcomingJobs||[],
        holidays:d.holidays||[],workingDays:d.workingDays||[],
        personHolidays:d.personHolidays||{},compensationWorkingDays:d.compensationWorkingDays||{}};
      jtNormalize(JT); // only fills containers that are missing or the wrong type
      save();renderAll();renderSettingsInfo();
      showToast(`Imported ${JT.jobs.length} jobs, ${JT.persons.length} persons`,'ok');
    }catch(err){showToast('Import failed: '+err.message,'err');}
  };
  r.onerror=()=>showToast('Import failed: the file could not be read','err');
  r.readAsText(f);evt.target.value='';
}

// Restore the data that was in the app right before the last import
function undoLastImport() {
  const meta = jtGetPreImportMeta();
  const prev = jtReadPreImport();
  if(!meta || !prev) { showToast('There is no import to undo','err'); renderSettingsInfo(); return; }
  if(!confirm(`Restore the data from before the last import?\n\nIt has ${meta.jobs} jobs and ${meta.persons} persons (saved ${new Date(meta.at).toLocaleString('en-GB')}).\n\nThe currently loaded data will be replaced.`)) return;
  JT = {jobs:prev.jobs,persons:prev.persons,upcomingJobs:prev.upcomingJobs,
    holidays:prev.holidays,workingDays:prev.workingDays,
    personHolidays:prev.personHolidays,compensationWorkingDays:prev.compensationWorkingDays};
  save(); jtClearPreImport(); renderAll(); renderSettingsInfo();
  showToast(`Restored ${JT.jobs.length} jobs, ${JT.persons.length} persons`,'ok');
}

// Settings page: last backup + undo-import information
function renderSettingsInfo() {
  const lb = document.getElementById('lastBackupInfo');
  if(lb) {
    const last = jtLastExport();
    if(last) {
      const days = Math.floor((Date.now() - new Date(last)) / 86400000);
      lb.textContent = `Last JSON backup from this device: ${new Date(last).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}${days>=7?` (${days} days ago — consider a fresh backup)`:''}.`;
    } else lb.textContent = 'No JSON backup has been exported from this device yet.';
  }
  const box = document.getElementById('undoImportBox');
  const meta = jtGetPreImportMeta();
  if(box) {
    box.hidden = !meta;
    if(meta) document.getElementById('undoImportInfo').textContent = `Safety copy from ${new Date(meta.at).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}: ${meta.jobs} jobs, ${meta.persons} persons${meta.file?` (before importing ${meta.file})`:''}.`;
  }
  if(typeof updatePwaStatus === 'function') updatePwaStatus();
}
function dropOver(e){e.preventDefault();document.getElementById('fileDrop').classList.add('over');}
function dropLeave(){document.getElementById('fileDrop').classList.remove('over');}
function dropFile(e){
  e.preventDefault();document.getElementById('fileDrop').classList.remove('over');
  const f=e.dataTransfer.files[0];if(!f||!f.name.toLowerCase().endsWith('.json')){showToast('Please drop a .json file','err');return;}
  doImport({target:{files:[f],value:''}});
}

// ===== TOAST =====

function filterByVessel(vessel) {
  showPage('jobs', document.querySelectorAll('.nav-btn')[1]);
  document.getElementById('jobSearch').value = vessel;
  renderJobsPage();
}

function filterByPerson(person) {
  if(!person) return;
  showPage('jobs', document.querySelectorAll('.nav-btn')[1]);
  const pf = document.getElementById('jobPersonFilter');
  if(pf) pf.value = person;
  renderJobsPage();
}

function quickStatusChange(id, newStatus) {
  const j = JT.jobs.find(x=>x.id===id);
  if(!j) return;
  // Intercept complete/rework completed — ask for date first
  if(newStatus === 'complete' || newStatus === 'rework completed') {
    openCompletionDate(id, newStatus, null);
    return;
  }
  j.status = newStatus;
  if(newStatus==='ongoing' && !j.startDate) j.startDate = today();
  save();
  setTimeout(()=>renderAll(), 30);
  showToast(`Status updated to "${newStatus}"`, 'ok');
}


function updateClearBtn() {
  const active =
    (document.getElementById('jobSearch')?.value || '') !== '' ||
    (document.getElementById('jobLocFilter')?.value || '') !== '' ||
    (document.getElementById('jobPersonFilter')?.value || '') !== '' ||
    (document.getElementById('jobPriorityFilter')?.value || '') !== '' ||
    !!document.getElementById('jobOverdueOnly')?.checked ||
    currentSideFilter !== 'all' ||
    currentSideLocFilter !== '' ||
    (typeof jobTab !== 'undefined' && jobTab !== 'all');
  const btn = document.getElementById('clearFiltersBtn');
  if(btn) btn.style.display = active ? 'inline-flex' : 'none';
}

function clearJobFilters() {
  // Clear all text/select/checkbox filters
  ['jobSearch','jobLocFilter','jobPersonFilter','jobPriorityFilter'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
  const ov = document.getElementById('jobOverdueOnly');
  if(ov) ov.checked = false;

  // Reset all state variables
  currentSideFilter = 'all';
  currentSideLocFilter = '';
  jobTab = 'all';

  // Reset sidebar item highlights
  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  const firstSideItem = document.querySelector('.sidebar-item');
  if(firstSideItem) firstSideItem.classList.add('active');

  // Reset sidebar location highlights
  document.querySelectorAll('[id^="sl-"]').forEach(el => el.classList.remove('active'));
  const slAll = document.querySelector('[id^="sl-"]');
  if(slAll) slAll.classList.add('active');

  // Reset jobs tab bar - click the All tab
  const allTabBtn = document.querySelector('#jobsTabBar .tab-btn');
  if(allTabBtn) { 
    document.querySelectorAll('#jobsTabBar .tab-btn').forEach(b=>{ b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
    allTabBtn.classList.add('active'); allTabBtn.setAttribute('aria-pressed','true');
  }

  // Re-render  
  renderJobsPage();
  const btn = document.getElementById('clearFiltersBtn');
  if(btn) btn.style.display = 'none';
  showToast('Filters cleared', 'ok');
}



// ===================== COMPLETION DATE FLOW =====================
let _completionJobId = null;
let _completionNewStatus = null;
let _completionCallback = null;

function openCompletionDate(jobId, newStatus, callback) {
  _completionJobId = jobId;
  _completionNewStatus = newStatus;
  _completionCallback = callback;

  const j = JT.jobs.find(x => x.id === jobId);
  if(!j) return;

  const isRework = newStatus === 'rework completed';
  document.getElementById('completionDateTitle').textContent = isRework ? '🔄 Mark Rework as Complete' : '✅ Mark as Complete';
  document.getElementById('completionDateJobInfo').textContent = (j.jobNumber||'') + ' · ' + j.vesselName + ' — ' + j.jobScope.substring(0,40);
  document.getElementById('completionDateInput').value = today();

  // Populate QC dropdown
  populatePersonDropdowns();
  const qcSel = document.getElementById('completionQcBy');
  if(qcSel) {
    qcSel.innerHTML = '<option value="">— Select (optional) —</option>' +
      JT.persons.map(p => `<option value="${p.name}"${j.qcDoneBy===p.name?' selected':''}>${p.name}</option>`).join('');
  }
  // Pre-fill manhour fields if previously saved
  const mhEl = document.getElementById('completionManhours');
  const mcEl = document.getElementById('completionManhourCost');
  if(mhEl) mhEl.value = j.manhoursConsumed || '';
  if(mcEl) mcEl.value = j.manhourCost || '';

  openModal('completionDateModal');
}

function confirmCompletion() {
  if(!validateForm('completionDateModal')) return;
  const completionDate = document.getElementById('completionDateInput').value;
  if(!completionDate) { showToast('Please select a completion date', 'err'); return; }

  const j = JT.jobs.find(x => x.id === _completionJobId);
  if(!j) return;

  j.status = _completionNewStatus;
  j.completionPercentage = 100;
  j.completionDate = completionDate;
  j.qcDoneBy = document.getElementById('completionQcBy').value || j.qcDoneBy || null;
  const mh = parseFloat(document.getElementById('completionManhours')?.value);
  const mc = parseFloat(document.getElementById('completionManhourCost')?.value);
  if(!isNaN(mh) && mh>0) j.manhoursConsumed = mh;
  if(!isNaN(mc) && mc>0) j.manhourCost = mc;

  // Calculate actual days if startDate is known
  if(j.startDate) {
    const start = new Date(j.startDate);
    const end = new Date(completionDate);
    let workDays = 0;
    let d = new Date(start);
    while(d <= end) {
      const day = d.getDay();
      if(day !== 0 && day !== 6) workDays++;
      d.setDate(d.getDate()+1);
    }
    j.actualDaysToComplete = workDays;
  }

  save();
  closeModal('completionDateModal');
  if(typeof _completionCallback === 'function') _completionCallback();
  setTimeout(() => renderAll(), 30);
  showToast('Job marked complete — ' + completionDate, 'ok');
}


// ===================== JOB SHARING =====================

// ── UPCOMING JOB CHIP POPUP ──────────────────────────────────────────────
function openUpcomingChipPopup(evt, upcomingId) {
  evt.stopPropagation();
  // Navigate directly to Upcoming page and highlight the job
  showPage('upcoming', document.querySelectorAll('.nav-btn')[3]);
  setTimeout(() => {
    // Find the upcoming job row and scroll + flash it
    const rows = document.querySelectorAll('#upcomingList .up-card');
    let found = false;
    rows.forEach(row => {
      // Each row has an edit button with onclick="openEditUpcoming(ID)"
      const editBtn = row.querySelector('[onclick*="openEditUpcoming(' + upcomingId + ')"]');
      if(editBtn) {
        row.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block:'center' });
        row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
        setTimeout(() => row.classList.remove('flash'), 2500);
        found = true;
      }
    });
    if(!found) {
      // Fallback: just show the upcoming page
      showToast('Upcoming job found on this page', 'ok');
    }
  }, 150);
}

function openShareJob(id) {
  actionJobId = id;
  const j = JT.jobs.find(x=>x.id===id);
  if(!j) return;
  document.getElementById('shareJobInfo').textContent = j.vesselName + ' — ' + j.jobScope.substring(0,40);
  document.getElementById('shareFrom').value = j.startDate || j.plannedStartDate || today();
  document.getElementById('shareTo').value = j.targetDate || '';
  populatePersonDropdowns();
  setTimeout(() => {
    const sel = document.getElementById('sharePerson');
    if(sel) Array.from(sel.options).forEach(o => { o.disabled = (o.value === j.personInCharge); });
  }, 50);
  renderExistingShares(j);
  openModal('shareJobModal');
}

function renderExistingShares(j) {
  const shares = j.sharedJobDetails || [];
  const el = document.getElementById('existingShares');
  if(!el) return;
  if(!shares.length) {
    el.innerHTML = '<div style="font-size:11px;color:var(--text3)">No shares yet</div>';
    return;
  }
  el.innerHTML = '<div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:6px">Currently shared with:</div>' +
    shares.map((s,i) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:var(--blue-bg);border:1px solid var(--blue-border);border-radius:var(--r);margin-bottom:4px;font-size:12px">
      <span><strong>${s.personName}</strong> &nbsp;${fmtD(s.startDate)} → ${fmtD(s.endDate)}</span>
      <button class="act-btn del btn-sm" onclick="removeJobShare(${actionJobId},${i})">✕</button>
    </div>`).join('');
}

function addJobShare() {
  const j = JT.jobs.find(x=>x.id===actionJobId);
  if(!j) return;
  const person = document.getElementById('sharePerson').value;
  const from   = document.getElementById('shareFrom').value;
  const to     = document.getElementById('shareTo').value;
  if(!person) { showToast('Select a person','err'); return; }
  if(!from||!to) { showToast('Set date range','err'); return; }
  if(from>to) { showToast('From must be before To','err'); return; }
  if(!j.sharedJobDetails) j.sharedJobDetails = [];
  if(!j.sharedWith) j.sharedWith = [];
  j.sharedJobDetails = j.sharedJobDetails.filter(s=>s.personName!==person);
  j.sharedJobDetails.push({personName:person, startDate:from, endDate:to});
  if(!j.sharedWith.includes(person)) j.sharedWith.push(person);
  save(); renderExistingShares(j); renderAll();
  showToast('Job shared with '+person,'ok');
}

function removeJobShare(jobId, idx) {
  const j = JT.jobs.find(x=>x.id===jobId);
  if(!j||!j.sharedJobDetails) return;
  const removed = j.sharedJobDetails.splice(idx,1)[0];
  if(removed&&j.sharedWith) j.sharedWith = j.sharedWith.filter(n=>n!==removed.personName);
  save(); renderExistingShares(j); renderAll();
  showToast('Share removed','ok');
}


function updateReassignCalc(){
  const j=JT.jobs.find(x=>x.id===actionJobId); if(!j) return;
  const pct=parseInt(document.getElementById('rAssignPct')?.value)||0;
  const perDay=j.daysRequired?100/j.daysRequired:20;
  const remaining=Math.ceil((100-pct)/perDay);
  const newPerson=document.getElementById('rAssignPerson')?.value||'new person';
  const el=document.getElementById('rAssignCalc');
  if(el){el.style.display='block';el.textContent=`${newPerson||'New person'} will need ${remaining} working day(s) for the remaining ${100-pct}% of work.`;}
}

function addMultiScope(){
  const personOpts='<option value="">Unassigned</option>'+JT.persons.map(p=>`<option value="${p.name}">${p.name}</option>`).join('');
  const isPerScope = document.getElementById('fInvPer')?.checked;
  const div=document.createElement('div');
  div.className='ms-row';
  const n = document.querySelectorAll('#multiScopeList .ms-row').length + 1;
  const u = 'ms' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  div.innerHTML=`<span class="ms-row-title">Scope ${n + 1}</span>
    <button type="button" class="ms-remove" onclick="this.parentNode.remove()" aria-label="Remove this scope">${ic('x')}</button>
    <div class="form-grid three">
      <div class="form-group fl full"><input class="form-ctrl ms-scope" id="${u}-scope" placeholder=" "><label class="form-label" for="${u}-scope">Scope description</label></div>
      <div class="form-group"><label class="form-label" for="${u}-person">Person</label><select class="form-ctrl ms-person" id="${u}-person" onchange="msSyncLoc(this)">${personOpts}</select></div>
      <div class="form-group"><label class="form-label" for="${u}-loc">Location</label><select class="form-ctrl ms-loc" id="${u}-loc"><option>HO</option><option>COK</option></select></div>
      <div class="form-group"><label class="form-label" for="${u}-target">Target Date</label><input class="form-ctrl ms-target" id="${u}-target" type="date"></div>
      <div class="form-group"><label class="form-label" for="${u}-ps">Planned Start Date</label><input class="form-ctrl ms-planstart" id="${u}-ps" type="date"></div>
      <div class="form-group fl"><input class="form-ctrl ms-days" id="${u}-days" type="number" inputmode="numeric" value="1" min="1" placeholder=" " data-error="Enter at least 1 day"><label class="form-label" for="${u}-days">Days Required</label></div>
      <div class="form-group fl"><input class="form-ctrl ms-estmh" id="${u}-mh" type="number" inputmode="decimal" min="0" step="0.5" placeholder=" " data-error="Enter 0 or more"><label class="form-label" for="${u}-mh">Est. Manhours</label></div>
      <div class="form-group fl ms-invoice-field" style="${isPerScope?'':'display:none'}">
        <input class="form-ctrl ms-invoice" id="${u}-inv" type="number" inputmode="decimal" min="0" step="0.01" placeholder=" " data-error="Enter 0 or more">
        <label class="form-label" for="${u}-inv">Invoice Amount (₹)</label>
      </div>
      <div class="form-group"><label class="form-label" for="${u}-prio">Priority</label><select class="form-ctrl ms-priority" id="${u}-prio"><option value="top urgent">Top Urgent</option><option value="urgent">Urgent</option><option value="medium" selected>Medium</option><option value="low">Low</option></select></div>
      <div class="form-group"><label class="form-label" for="${u}-st">Status</label><select class="form-ctrl ms-status" id="${u}-st"><option value="not planned">Not Planned</option><option value="planned">Planned</option><option value="ongoing">Ongoing</option></select></div>
      <div class="form-group fl"><input class="form-ctrl ms-pct" id="${u}-pct" type="number" inputmode="numeric" value="0" min="0" max="100" placeholder=" " data-error="Enter a value from 0 to 100"><label class="form-label" for="${u}-pct">Completion %</label></div>
      <div class="form-group"><label class="form-label" for="${u}-qc">QC Done By</label><select class="form-ctrl ms-qcby" id="${u}-qc"><option value="">— None —</option>${personOpts}</select></div>
    </div>`;
  document.getElementById('multiScopeList').appendChild(div);
}

function msSyncLoc(sel) {
  const row = sel.closest('.ms-row');
  if(!row) return;
  const person = JT.persons.find(p=>p.name===sel.value);
  if(person) { const loc = row.querySelector('.ms-loc'); if(loc) loc.value=person.location; }
}

function handleInvoiceTypeChange() {
  const isPerScope = document.getElementById('fInvPer')?.checked;
  document.getElementById('invoiceLumpArea').style.display = isPerScope ? 'none' : 'block';
  document.getElementById('invoicePerArea').style.display  = isPerScope ? 'block' : 'none';
  // Show/hide invoice field on all existing ms-rows
  document.querySelectorAll('.ms-invoice-field').forEach(el => {
    el.style.display = isPerScope ? '' : 'none';
  });
}

function getMultiScopeData(){
  return Array.from(document.querySelectorAll('.ms-row')).map(row=>({
    scope:        row.querySelector('.ms-scope')?.value.trim()||'',
    person:       row.querySelector('.ms-person')?.value||'',
    location:     row.querySelector('.ms-loc')?.value||'HO',
    targetDate:   row.querySelector('.ms-target')?.value||'',
    plannedStart: row.querySelector('.ms-planstart')?.value||null,
    days:         parseInt(row.querySelector('.ms-days')?.value)||1,
    estManhours:  parseFloat(row.querySelector('.ms-estmh')?.value)||null,
    invoiceAmount:parseFloat(row.querySelector('.ms-invoice')?.value)||null,
    priority:     row.querySelector('.ms-priority')?.value||'medium',
    status:       row.querySelector('.ms-status')?.value||'not planned',
    pct:          parseInt(row.querySelector('.ms-pct')?.value)||0,
    qcDoneBy:     row.querySelector('.ms-qcby')?.value||null
  })).filter(s=>s.scope);
}


// ===================== PLANNING EXCEL EXPORT =====================
let _planExportLoc = ''; // '' = All, 'HO', 'COK'

function togglePlanExportMenu() {
  const m = document.getElementById('planExportMenu');
  if(!m) return;
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
  const btn = document.getElementById('planExportBtn');
  if(btn) btn.setAttribute('aria-expanded', m.style.display === 'block' ? 'true' : 'false');
  // Close on outside click
  if(m.style.display === 'block') {
    setTimeout(() => {
      const close = e => { if(!m.contains(e.target) && !e.target.closest('#planExportBtn')) { m.style.display='none'; if(btn) btn.setAttribute('aria-expanded','false'); document.removeEventListener('click',close); } };
      document.addEventListener('click', close);
    }, 10);
  }
}

function setPlanExportLoc(loc) {
  _planExportLoc = loc;
  const activeId = loc===''?'pex-all':loc==='HO'?'pex-ho':'pex-cok';
  ['pex-all','pex-ho','pex-cok'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    el.classList.toggle('active', id===activeId);
    el.setAttribute('aria-pressed', id===activeId ? 'true' : 'false');
  });
}

async function exportPlanningExcel(weeks) {
  document.getElementById('planExportMenu').style.display = 'none';

  try { await ensureExcelJS(); } catch(e) { showToast('Excel export needs an internet connection the first time. Please try again online.','err'); return; }

  // ── Build date range ──
  const t = new Date(); t.setHours(0,0,0,0);
  const dow = t.getDay();
  const monday = new Date(t);
  monday.setDate(t.getDate() - (dow===0?6:dow-1));

  const allDates = [];
  for(let w=0; w<weeks; w++) {
    for(let i=0; i<7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + w*7 + i);
      allDates.push(d);
    }
  }

  const persons = JT.persons.filter(p => !_planExportLoc || p.location === _planExportLoc);
  const todayStr = today();

  // ── Colours (ARGB format for ExcelJS) ──
  const C = {
    headerBg:    'FF3F0E40', // Slack aubergine
    headerToday: 'FF1164A3', // Slack blue
    headerWknd:  'FF522653', // lighter aubergine
    personBg:    'FFF5EFF5', // light aubergine tint
    personText:  'FF3F0E40',
    hoBg:        'FFD9E8F5', hoText: 'FF1164A3',
    cokBg:       'FFD4EDDA', cokText:'FF1A7A4A',
    free:        'FFF0FDF4', freeText:'FF1A7A4A',
    weekend:     'FFF5F4F2', weekendText:'FF999999',
    holiday:     'FFFDEAEA', holidayText:'FFC0392B',
    leave:       'FFFFF5F8', leaveText:  'FFA0235A',
    upcoming:    'FFEFF6FF', upcomingText:'FF1164A3',
    overdue:     'FFFFEBEE', overdueText: 'FFC0392B',
    rework:      'FFF3E5F5', reworkText:  'FF7C3085',
    ongoing:     'FFFFF8E1', ongoingText: 'FF92400E',
    planned:     'FFE8F4FD', plannedText: 'FF1164A3',
    todayCell:   'FFEDF5FC',
    white:       'FFFFFFFF',
    border:      'FFDDDDDD',
    borderDark:  'FF7C3085',
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Job Tracker';
  wb.created = new Date();

  const ws = wb.addWorksheet('Planning', {
    views: [{state:'frozen', xSplit:2, ySplit:1}]
  });

  // ── Column widths ──
  ws.columns = [
    {width:18}, // Person
    {width:8},  // Location
    ...allDates.map(d => {
      const isWknd = d.getDay()===0||d.getDay()===6;
      return {width: isWknd ? 10 : 28};
    })
  ];

  // ── Helper: make a border style ──
  const border = (style='thin', color=C.border) => ({
    top:{style,color:{argb:color}},
    left:{style,color:{argb:color}},
    bottom:{style,color:{argb:color}},
    right:{style,color:{argb:color}}
  });
  const borderMedium = () => border('medium', C.borderDark);

  // ── HEADER ROW ──
  const headerValues = ['Person','Location', ...allDates.map(d => {
    const DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
    return DAY + ' ' + d.getDate() + '/' + (d.getMonth()+1);
  })];

  const headerRow = ws.addRow(headerValues);
  headerRow.height = 28;
  headerRow.eachCell((cell, colNum) => {
    const d = colNum > 2 ? allDates[colNum-3] : null;
    const isWknd  = d && (d.getDay()===0||d.getDay()===6);
    const isToday = d && localDateStr(d)===todayStr;
    cell.fill = {type:'pattern',pattern:'solid',fgColor:{argb: isToday?C.headerToday:isWknd?C.headerWknd:C.headerBg}};
    cell.font = {bold:true, color:{argb:'FFFFFFFF'}, size:10, name:'Calibri'};
    cell.alignment = {horizontal:'center', vertical:'middle', wrapText:false};
    cell.border = border('thin', 'FF522653');
    if(isToday) {
      cell.border = {
        bottom:{style:'medium',color:{argb:'FF36C5F0'}},
        right:{style:'thin',color:{argb:'FF522653'}},
        top:{style:'thin',color:{argb:'FF522653'}},
        left:{style:'thin',color:{argb:'FF522653'}}
      };
    }
  });

  // ── DATA ROWS ──
  // Each person can have MULTIPLE rows (one per max job count that day)
  // Person name + location are merged vertically across all their rows

  let currentExcelRow = 2; // 1-indexed, header is row 1

  persons.forEach(person => {
    // Find max jobs for this person on any single day
    const dayJobs = allDates.map(d => {
      const ds = localDateStr(d);
      if(!isWorkingDayForPerson(ds, person.name)) return [];
      return getJobsForPersonOnDate(person.name, ds);
    });

    const maxJobs = Math.max(1, ...dayJobs.map(j=>j.length));
    const startRow = currentExcelRow;
    const endRow   = currentExcelRow + maxJobs - 1;

    // Build the rows for this person
    for(let rowIdx = 0; rowIdx < maxJobs; rowIdx++) {
      const rowData = [];

      // Person name (only in first row — will be merged)
      rowData.push(rowIdx===0 ? person.name : null);
      // Location (only in first row — will be merged)
      rowData.push(rowIdx===0 ? person.location : null);

      // Day cells
      allDates.forEach((d, di) => {
        const ds = localDateStr(d);
        const isWknd   = d.getDay()===0||d.getDay()===6;
        const isToday  = ds===todayStr;
        const working  = isWorkingDayForPerson(ds, person.name);
        const jobs     = dayJobs[di];

        if(!working) {
          // Off day — only put text in first row, null in others
          if(rowIdx===0) {
            const dt = getDayColumnType(ds, person.name);
            rowData.push(dt==='holiday'?'Holiday':dt==='person-holiday'?'Leave':isWknd?'Weekend':'Off');
          } else {
            rowData.push(null);
          }
        } else if(jobs.length===0) {
          rowData.push(rowIdx===0 ? 'Free' : null);
        } else {
          const j = jobs[rowIdx];
          if(!j) {
            rowData.push(null);
          } else {
            const dayNum = getDayNumber(j, ds, person.name);
            const total  = j.daysRequired || 1;
            const pct    = j.completionPercentage || 0;
            let prefix='';
            if(j._isUpcoming)                                                   prefix='[Upcoming] ';
            else if(isOverdue(j))                                               prefix='[OVERDUE] ';
            else if(j.status==='rework ongoing'||j.status==='rework planned')  prefix='[Rework] ';
            else if(j.status==='ongoing')                                       prefix='[Ongoing] ';
            else if(j.status==='planned')                                       prefix='[Planned] ';
            rowData.push(`${prefix}${j.jobScope||''}
${j.vesselName||''}
D${dayNum}/${total} · ${pct}%`);
          }
        }
      });

      const excelRow = ws.addRow(rowData);
      excelRow.height = maxJobs > 1 ? 48 : 40;

      // Style each cell
      excelRow.eachCell({includeEmpty:true}, (cell, colNum) => {
        const d = colNum > 2 ? allDates[colNum-3] : null;
        const isWknd  = d && (d.getDay()===0||d.getDay()===6);
        const isToday = d && localDateStr(d)===todayStr;
        const val = cell.value ? String(cell.value) : '';
        const isPersonCol = colNum===1;
        const isLocCol    = colNum===2;
        const isHO        = person.location==='HO';

        if(isPersonCol) {
          cell.fill   = {type:'pattern',pattern:'solid',fgColor:{argb:C.personBg}};
          cell.font   = {bold:rowIdx===0,size:11,color:{argb:C.personText},name:'Calibri'};
          cell.alignment = {horizontal:'left',vertical:'middle',wrapText:false};
          cell.border = {right:{style:'medium',color:{argb:C.borderDark}},bottom:{style:'thin',color:{argb:'FFE0D8E0'}}};
        } else if(isLocCol) {
          cell.fill   = {type:'pattern',pattern:'solid',fgColor:{argb:isHO?C.hoBg:C.cokBg}};
          cell.font   = {bold:true,size:10,color:{argb:isHO?C.hoText:C.cokText},name:'Calibri'};
          cell.alignment = {horizontal:'center',vertical:'middle'};
          cell.border = {right:{style:'thin',color:{argb:C.border}},bottom:{style:'thin',color:{argb:C.border}}};
        } else {
          // Day cell colour
          let bg=C.white, ft='FF1D1C1D', bold=false;
          if(val==='Weekend')          {bg=C.weekend;  ft=C.weekendText;}
          else if(val==='Holiday')     {bg=C.holiday;  ft=C.holidayText;}
          else if(val==='Leave')       {bg=C.leave;    ft=C.leaveText;}
          else if(val==='Free')        {bg=C.free;     ft=C.freeText;}
          else if(val==='Off')         {bg=C.weekend;  ft=C.weekendText;}
          else if(val.includes('[OVERDUE]'))   {bg=C.overdue;  ft=C.overdueText;  bold=true;}
          else if(val.includes('[Upcoming]'))  {bg=C.upcoming; ft=C.upcomingText;}
          else if(val.includes('[Rework]'))    {bg=C.rework;   ft=C.reworkText;}
          else if(val.includes('[Ongoing]'))   {bg=C.ongoing;  ft=C.ongoingText;  bold=true;}
          else if(val.includes('[Planned]'))   {bg=C.planned;  ft=C.plannedText;}
          else if(val)                         {bg=C.planned;  ft='FF1D1C1D';}

          if(isToday && val) bg=C.todayCell;
          if(isWknd && !val) bg=C.weekend;

          // Alternate row shading for empty/null cells
          if(!val && !isWknd && !isToday) bg='FFFAFAFA';

          cell.fill   = {type:'pattern',pattern:'solid',fgColor:{argb:bg}};
          cell.font   = {bold,size:9,color:{argb:ft},name:'Calibri'};
          cell.alignment = {horizontal:'left',vertical:'top',wrapText:true};
          const topBorderColor = isToday ? 'FF1164A3' : val.includes('[OVERDUE]') ? 'FFE01E5A' : C.border;
          const topBorderStyle = (isToday||val.includes('[OVERDUE]')) ? 'medium' : 'thin';
          cell.border = {
            top:   {style:topBorderStyle,color:{argb:topBorderColor}},
            right: {style:'thin',color:{argb:isWknd?'FFDDDDDD':C.border}},
            bottom:{style:'thin',color:{argb:'FFEEEEEE'}}
          };
        }
      });
    }

    // ── Merge person name and location cells vertically ──
    if(maxJobs > 1) {
      // Merge Person column (col 1)
      ws.mergeCells(startRow, 1, endRow, 1);
      // Merge Location column (col 2)
      ws.mergeCells(startRow, 2, endRow, 2);
      // Also merge off-day and free cells across all rows
      allDates.forEach((d, di) => {
        const ds = localDateStr(d);
        const working = isWorkingDayForPerson(ds, person.name);
        const jobs = dayJobs[di];
        if(!working || jobs.length===0) {
          ws.mergeCells(startRow, di+3, endRow, di+3);
        }
      });
      // Re-style merged person cell
      const mergedPersonCell = ws.getCell(startRow, 1);
      mergedPersonCell.alignment = {horizontal:'left',vertical:'middle',wrapText:false};
      const mergedLocCell = ws.getCell(startRow, 2);
      mergedLocCell.alignment = {horizontal:'center',vertical:'middle'};
    }

    currentExcelRow = endRow + 1;
  });

  // ── Write and download ──
  const locLabel  = _planExportLoc || 'All';
  const weekLabel = weeks===1 ? 'ThisWeek' : 'Next2Weeks';
  const dateLabel = monday.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}).replace(/ /g,'');
  const fileName  = `Planning_${locLabel}_${weekLabel}_${dateLabel}.xlsx`;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  await downloadBlob(blob, fileName);
  showToast('Exported: ' + fileName, 'ok');
}

// showToast() lives in components/ui.js (stacked, animated, screen-reader friendly)

// ===================== AUTO-FILL LOCATION FROM PERSON =====================
function autoFillLocation() {
  const personName = document.getElementById('fPerson').value;
  if(!personName) return;
  const person = JT.persons.find(p=>p.name===personName);
  if(person) document.getElementById('fLoc').value = person.location;
}

// ===================== REPORTS =====================
let rptTab = 'person';

// Scroll-to-top button visibility
// Scroll-to-top button — attach after DOM is ready via window.onload
function initScrollTop() {
  const content = document.getElementById('contentScroll');
  if(!content) return;
  content.addEventListener('scroll', () => {
    const btn = document.getElementById('rptScrollTop');
    if(!btn) return;
    // v1 showed this on Reports only; long lists (Jobs, Planning) benefit too
    const onReports = document.getElementById('page-reports')?.classList.contains('active');
    btn.style.display = (content.scrollTop > (onReports ? 200 : 600)) ? 'grid' : 'none';
  });
}

function setRptTab(tab) {
  rptTab = tab;
  const pBtn = document.getElementById('rptTabPerson');
  const vBtn = document.getElementById('rptTabVessel');
  if(pBtn) { pBtn.classList.toggle('active', tab==='person'); pBtn.setAttribute('aria-pressed', tab==='person'?'true':'false'); }
  if(vBtn) { vBtn.classList.toggle('active', tab==='vessel'); vBtn.setAttribute('aria-pressed', tab==='vessel'?'true':'false'); }
  renderReports();
}

function setRptQuick(range) {
  const now = new Date();
  let from, to;
  if(range==='thisMonth')  { from=new Date(now.getFullYear(),now.getMonth(),1);    to=new Date(now.getFullYear(),now.getMonth()+1,0); }
  else if(range==='lastMonth') { from=new Date(now.getFullYear(),now.getMonth()-1,1); to=new Date(now.getFullYear(),now.getMonth(),0); }
  else if(range==='thisYear')  { from=new Date(now.getFullYear(),0,1);               to=new Date(now.getFullYear(),11,31); }
  else { document.getElementById('rptFrom').value=''; document.getElementById('rptTo').value=''; renderReports(); return; }
  document.getElementById('rptFrom').value = localDateStr(from);
  document.getElementById('rptTo').value   = localDateStr(to);
  renderReports();
}

function getReportJobs() {
  const fromStr = document.getElementById('rptFrom')?.value || '';
  const toStr   = document.getElementById('rptTo')?.value   || '';
  const inclRework = document.getElementById('rptIncludeRework')?.checked !== false;
  return JT.jobs.filter(j => {
    if(!inclRework && j.isRework) return false;
    const ref = j.completionDate || j.receiptDate || '';
    if(fromStr && ref < fromStr) return false;
    if(toStr   && ref > toStr)   return false;
    return true;
  });
}

function fmtCurrency(v) {
  if(v===null||v===undefined||v==='') return '—';
  return '₹' + Number(v).toLocaleString('en-IN', {minimumFractionDigits:0, maximumFractionDigits:2});
}
function fmtMH(v) {
  if(!v && v!==0) return '—';
  return Number(v).toFixed(1) + ' hrs';
}
function fmtNum(v) { return (v||0).toFixed(1); }

function renderReports() {
  const el = document.getElementById('rptContent');
  if(!el) return;
  const jobs = getReportJobs();
  if(rptTab === 'person') renderPersonReport(el, jobs);
  else renderVesselReport(el, jobs);
}

// ── helpers ──────────────────────────────────────────────────────────────────
function summaryCard(label, value, color, icon, textColor) {
  return `<div class="sum-card" style="--c:${color};--ct:${textColor||color}">
    <div class="sum-label">${icon?ic(icon):''}${label}</div>
    <div class="sum-val">${value}</div>
  </div>`;
}

// ── Table helpers ─────────────────────────────────────────────────────────────
function rptTableStart(label1) {
  return `<table class="rpt-table">
  <colgroup><col class="c-chev"><col><col class="c-num"><col class="c-num"><col class="c-num"><col class="c-num"></colgroup>
  <thead><tr>
    <th scope="col"><span class="sr-only">Expand</span></th>
    <th scope="col">${label1}</th>
    <th scope="col">Invoice (₹)</th>
    <th scope="col">Est. MH</th>
    <th scope="col">Act. MH</th>
    <th scope="col">MH Cost (₹)</th>
  </tr></thead><tbody>`;
}
function rptNums(inv, est, act, cost, rowLevel) {
  const cell = (cls, label, has, text) => `<td class="rpt-num ${has?cls:'is-empty'}" data-label="${label}">${text}</td>`;
  if(rowLevel) return cell('c-inv','Invoice',true,fmtCurrency(inv)) + cell('c-mh','Est. MH',true,fmtMH(est)) + cell('c-mh','Act. MH',true,fmtMH(act)) + cell('c-cost','MH cost',true,fmtCurrency(cost));
  return cell('c-inv','Invoice',!!inv,inv?fmtCurrency(inv):'—') + cell('c-mh','Est. MH',!!est,est?fmtMH(est):'—') + cell('c-mh','Act. MH',!!act,act?fmtMH(act):'—') + cell('c-cost','MH cost',!!cost,cost?fmtCurrency(cost):'—');
}
function rptTableEnd(col1Label, gInv, gEst, gAct, gCost) {
  return `</tbody>
  <tfoot><tr class="rpt-total">
    <td aria-hidden="true"></td>
    <td class="rt-label">${col1Label}</td>
    <td class="rpt-num" data-label="Invoice">${fmtCurrency(gInv)}</td>
    <td class="rpt-num" data-label="Est. MH">${fmtMH(gEst)}</td>
    <td class="rpt-num" data-label="Act. MH">${fmtMH(gAct)}</td>
    <td class="rpt-num" data-label="MH cost">${fmtCurrency(gCost)}</td>
  </tr></tfoot>
  </table>`;
}
function rptGroupRow(rid, title, sub, label, nums) {
  return `<tr class="rpt-group" id="${rid}_row" onclick="toggleRptRow('${rid}')">
      <td class="rpt-chev-cell"><button type="button" class="rpt-chev" aria-expanded="false" aria-controls="${rid}" aria-label="Show scopes for ${esc(label)}">${ic('chevron-right')}</button></td>
      <td class="rpt-name"><div class="rn-title">${title}</div><div class="rn-sub">${sub}</div></td>
      ${nums}
    </tr>`;
}
const rptEmpty = () => emptyState('reports', 'No jobs in this date range', 'Pick another range, or choose “All Time” to include every job.', `<button type="button" class="btn" onclick="setRptQuick('all')">${ic('calendar')}All Time</button>`);

// ── BY PERSON ─────────────────────────────────────────────────────────────────
function renderPersonReport(el, jobs) {
  const pmap = {};
  function ep(name) { if(!pmap[name]) pmap[name]={invoice:0,estMH:0,actMH:0,mhCost:0,scopes:[]}; }

  jobs.forEach(j => {
    const person = j.personInCharge; if(!person) return;
    ep(person);
    const shares = j.sharedJobDetails || [];
    const estMH = j.estimatedManhours||0, actMH = j.manhoursConsumed||0, mhCost = j.manhourCost||0;
    pmap[person].estMH+=estMH; pmap[person].actMH+=actMH; pmap[person].mhCost+=mhCost;
    let personInvoice = 0;
    if(j.invoiceAmount) {
      if(!shares.length) { personInvoice=j.invoiceAmount; }
      else {
        const primMH=estMH||1; let totalMH=primMH; const shMH={};
        shares.forEach(s=>{ const sj=JT.jobs.find(x=>x.personInCharge===s.personName&&x.jobNumber===j.jobNumber&&x.vesselName===j.vesselName&&x.jobScope===j.jobScope); const v=(sj&&(sj.estimatedManhours||sj.manhoursConsumed))||1; shMH[s.personName]=v; totalMH+=v; });
        personInvoice=j.invoiceAmount*(primMH/totalMH);
        shares.forEach(s=>{ ep(s.personName); pmap[s.personName].invoice+=j.invoiceAmount*(shMH[s.personName]||1)/totalMH; });
      }
    }
    pmap[person].invoice+=personInvoice;
    pmap[person].scopes.push({jobNumber:j.jobNumber||'—',vessel:j.vesselName||'—',scope:j.jobScope||'—',status:j.status||'',isRework:j.isRework||false,invoice:personInvoice,estMH,actMH,mhCost});
  });

  const persons = JT.persons.filter(p=>pmap[p.name]);
  if(!persons.length){ el.innerHTML=rptEmpty(); return; }

  const gInv=persons.reduce((s,p)=>s+(pmap[p.name].invoice||0),0);
  const gEst=persons.reduce((s,p)=>s+(pmap[p.name].estMH||0),0);
  const gAct=persons.reduce((s,p)=>s+(pmap[p.name].actMH||0),0);
  const gCost=persons.reduce((s,p)=>s+(pmap[p.name].mhCost||0),0);
  const gJobs=persons.reduce((s,p)=>s+(pmap[p.name].scopes.length||0),0);

  let html=`<div class="rpt-summary">
    ${summaryCard('Persons',persons.length,'var(--primary)','users','var(--primary-text)')}
    ${summaryCard('Total Scopes',gJobs,'var(--gray-dot)','layers','var(--text2)')}
    ${summaryCard('Total Invoice',fmtCurrency(gInv),'var(--success)','trending','var(--green)')}
    ${summaryCard('Est. Manhours',fmtMH(gEst),'var(--warning)','clock','var(--amber)')}
    ${summaryCard('MH Cost',fmtCurrency(gCost),'var(--purple-dot)','database','var(--purple)')}
  </div>
  <div class="rpt-table-wrap">
  ${rptTableStart('Person / Job Scope')}`;

  persons.forEach((p,pi)=>{
    const d=pmap[p.name], rid='prpt_'+pi;
    html+=rptGroupRow(rid,
      `${esc(p.name)} <span class="rpt-tag t-loc-${esc(p.location)}">${esc(p.location)}</span>`,
      `${d.scopes.length} scope${d.scopes.length!==1?'s':''}`,
      p.name, rptNums(d.invoice,d.estMH,d.actMH,d.mhCost,true));
    html+=`<tr class="rpt-detail" id="${rid}"><td colspan="6">
      <table class="rpt-subtable"><colgroup><col class="c-chev"><col><col class="c-num"><col class="c-num"><col class="c-num"><col class="c-num"></colgroup><tbody>`;
    d.scopes.forEach(sc=>{
      const rwTag=sc.isRework?`<span class="rpt-tag t-rework">Rework</span>`:'';
      html+=`<tr class="rpt-scope">
        <td aria-hidden="true"></td>
        <td class="rpt-scope-name">
          <div class="rs-title">${esc(sc.scope)}${rwTag}</div>
          <div class="rs-sub">${esc(sc.jobNumber)} · ${esc(sc.vessel)}</div>
        </td>
        ${rptNums(sc.invoice,sc.estMH,sc.actMH,sc.mhCost,false)}
      </tr>`;
    });
    html+=`</tbody></table></td></tr>`;
  });

  html+=rptTableEnd(`TOTAL — ${persons.length} person${persons.length!==1?'s':''}`,gInv,gEst,gAct,gCost)+'</div>';
  el.innerHTML=html;
}

// ── BY VESSEL / JOB ───────────────────────────────────────────────────────────
function renderVesselReport(el, jobs) {
  const jmap = {};
  jobs.forEach(j=>{
    const jn=j.jobNumber||'(no job#)';
    if(!jmap[jn]) jmap[jn]={jobNumber:jn,vesselName:j.vesselName||'—',clientName:j.clientName||'',isLumpSum:false,lumpSumAmount:null,scopes:[],invoice:0,estMH:0,actMH:0,mhCost:0};
    const e=jmap[jn];
    const estMH=j.estimatedManhours||0, actMH=j.manhoursConsumed||0, mhCost=j.manhourCost||0;
    e.estMH+=estMH; e.actMH+=actMH; e.mhCost+=mhCost;
    e.scopes.push({scopeId:j.id,scope:j.jobScope||'—',person:j.personInCharge||'',status:j.status||'',isRework:j.isRework||false,estMH,actMH,mhCost,invoiceRaw:j.invoiceAmount||0,invoiceAlloc:0});
  });

  Object.values(jmap).forEach(jb=>{
    const scopesWithInvoice=jb.scopes.filter(sc=>sc.invoiceRaw>0);
    const totalScopeInvoice=jb.scopes.reduce((s,sc)=>s+sc.invoiceRaw,0);
    if(scopesWithInvoice.length===1&&jb.scopes.length>1){
      const lumpAmt=scopesWithInvoice[0].invoiceRaw; jb.isLumpSum=true; jb.lumpSumAmount=lumpAmt;
      const totalEstMH=jb.scopes.reduce((s,sc)=>s+sc.estMH,0)||jb.scopes.length;
      jb.scopes.forEach(sc=>{ sc.invoiceAlloc=lumpAmt*((sc.estMH||1)/totalEstMH); }); jb.invoice=lumpAmt;
    } else { jb.scopes.forEach(sc=>{ sc.invoiceAlloc=sc.invoiceRaw; }); jb.invoice=totalScopeInvoice; }
  });

  const jobNums=Object.keys(jmap).sort();
  if(!jobNums.length){ el.innerHTML=rptEmpty(); return; }

  const gInv=jobNums.reduce((s,k)=>s+(jmap[k].invoice||0),0);
  const gEst=jobNums.reduce((s,k)=>s+(jmap[k].estMH||0),0);
  const gAct=jobNums.reduce((s,k)=>s+(jmap[k].actMH||0),0);
  const gCost=jobNums.reduce((s,k)=>s+(jmap[k].mhCost||0),0);
  const gScopes=jobNums.reduce((s,k)=>s+jmap[k].scopes.length,0);

  let html=`<div class="rpt-summary">
    ${summaryCard('Jobs',jobNums.length,'var(--primary)','anchor','var(--primary-text)')}
    ${summaryCard('Total Scopes',gScopes,'var(--gray-dot)','layers','var(--text2)')}
    ${summaryCard('Total Invoice',fmtCurrency(gInv),'var(--success)','trending','var(--green)')}
    ${summaryCard('Est. Manhours',fmtMH(gEst),'var(--warning)','clock','var(--amber)')}
    ${summaryCard('MH Cost',fmtCurrency(gCost),'var(--purple-dot)','database','var(--purple)')}
  </div>
  <div class="rpt-table-wrap">
  ${rptTableStart('Job # / Vessel / Scope')}`;

  jobNums.forEach((jn,ji)=>{
    const d=jmap[jn], rid='vrpt_'+ji;
    const lsTag=d.isLumpSum?`<span class="rpt-tag t-lump">Lump sum ÷ ${d.scopes.length}</span>`:'';
    const reworkCount=d.scopes.filter(sc=>sc.isRework).length;
    const rwTag=reworkCount?`<span class="rpt-tag t-rework">${reworkCount} rework${reworkCount>1?'s':''}</span>`:'';
    html+=rptGroupRow(rid,
      `<span style="color:var(--primary-text)">${esc(d.jobNumber)}</span> ${esc(d.vesselName)} ${lsTag}${rwTag}`,
      `${esc(d.clientName)} · ${d.scopes.length} scope${d.scopes.length!==1?'s':''}`,
      `${d.jobNumber} ${d.vesselName}`, rptNums(d.invoice,d.estMH,d.actMH,d.mhCost,true));
    html+=`<tr class="rpt-detail" id="${rid}"><td colspan="6">
      <table class="rpt-subtable"><colgroup><col class="c-chev"><col><col class="c-num"><col class="c-num"><col class="c-num"><col class="c-num"></colgroup><tbody>`;
    const sortedScopes=[...d.scopes].sort((a,b)=>(a.isRework?1:0)-(b.isRework?1:0));
    sortedScopes.forEach(sc=>{
      const rwBadge=sc.isRework?`<span class="rpt-tag t-rework">Rework</span>`:'';
      const stBadge=`<span class="rpt-tag t-status">${esc(sc.status)}</span>`;
      html+=`<tr class="rpt-scope">
        <td aria-hidden="true"></td>
        <td class="rpt-scope-name">
          <div class="rs-title">${esc(sc.scope)}${rwBadge}${stBadge}</div>
          <div class="rs-sub">${esc(sc.person)}${d.isLumpSum&&sc.invoiceAlloc?' · allocated by MH ratio':''}</div>
        </td>
        ${rptNums(sc.invoiceAlloc,sc.estMH,sc.actMH,sc.mhCost,false)}
      </tr>`;
    });
    html+=`</tbody></table></td></tr>`;
  });

  html+=rptTableEnd(`TOTAL — ${jobNums.length} job${jobNums.length!==1?'s':''}, ${gScopes} scope${gScopes!==1?'s':''}`,gInv,gEst,gAct,gCost)+'</div>';
  el.innerHTML=html;
}

// ── Toggle expand/collapse row ────────────────────────────────────────────────
function toggleRptRow(id) {
  const el = document.getElementById(id);
  if(!el) return;
  const open = !el.classList.contains('open');
  el.classList.toggle('open', open);
  const row = document.getElementById(id+'_row');
  if(row) {
    row.classList.toggle('open', open);
    const b = row.querySelector('.rpt-chev');
    if(b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
}

// ── CSV Export ────────────────────────────────────────────────────────────────
function exportReportCSV() {
  const jobs = getReportJobs();
  const rows = [['Job#','Vessel','Client','Scope','Person','Status','Is Rework','Invoice(₹)','Est Manhours','Act Manhours','MH Cost(₹)','Receipt Date','Completion Date']];
  jobs.forEach(j => {
    rows.push([
      j.jobNumber||'', j.vesselName||'', j.clientName||'', j.jobScope||'',
      j.personInCharge||'', j.status||'', j.isRework?'Yes':'No',
      j.invoiceAmount||'', j.estimatedManhours||'', j.manhoursConsumed||'', j.manhourCost||'',
      j.receiptDate||'', j.completionDate||''
    ]);
  });
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  downloadBlob(blob, `report-${rptTab}-${today()}.csv`);
  showToast('CSV exported','ok');
}

// ── Excel Export ──────────────────────────────────────────────────────────────
async function exportReportExcel() {
  try { await ensureExcelJS(); } catch(e) { showToast('Excel export needs an internet connection the first time. Please try again online.','err'); return; }
  const jobs = getReportJobs();
  const wb = new ExcelJS.Workbook(); wb.creator='Job Tracker';
  const ws = wb.addWorksheet(rptTab==='person'?'By Person':'By Vessel');
  ws.views=[{state:'frozen',xSplit:0,ySplit:1}];

  const HDR_FILL={type:'pattern',pattern:'solid',fgColor:{argb:'FF350D36'}};
  const HDR_FONT={bold:true,color:{argb:'FFFFFFFF'},size:10,name:'Calibri'};
  const BORDER={style:'thin',color:{argb:'FFDDDDDD'}};
  const allBorder={top:BORDER,left:BORDER,bottom:BORDER,right:BORDER};

  const cols = ['Job#','Vessel','Client','Scope','Person','Status','Is Rework','Invoice (₹)','Est MH','Act MH','MH Cost (₹)','Receipt Date','Completion Date'];
  ws.columns = cols.map((h,i)=>({width:[10,20,20,30,16,14,10,14,10,10,14,12,14][i]||14}));
  const hrow = ws.addRow(cols);
  hrow.height=20; hrow.eachCell(c=>{c.fill=HDR_FILL;c.font=HDR_FONT;c.border=allBorder;c.alignment={horizontal:'center',vertical:'middle'};});

  jobs.forEach((j,ri)=>{
    const bg = ri%2===0?'FFFFFFFF':'FFF9F9F9';
    const row = ws.addRow([j.jobNumber||'',j.vesselName||'',j.clientName||'',j.jobScope||'',j.personInCharge||'',j.status||'',j.isRework?'Yes':'No',j.invoiceAmount||'',j.estimatedManhours||'',j.manhoursConsumed||'',j.manhourCost||'',j.receiptDate||'',j.completionDate||'']);
    row.height=16;
    row.eachCell({includeEmpty:true},c=>{
      c.fill={type:'pattern',pattern:'solid',fgColor:{argb:bg}};
      c.font={size:9,name:'Calibri'};
      c.border=allBorder;
      c.alignment={vertical:'middle'};
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  await downloadBlob(blob, `report-${rptTab}-${today()}.xlsx`);
  showToast('Excel exported','ok');
}
