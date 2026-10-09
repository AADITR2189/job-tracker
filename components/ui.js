/* ════════════════════════════════════════════════════════════════════
   UI helpers — presentation only (no business logic, no data writes)
   • Toast notifications (stacked, slide in / fade out, screen-reader
     announced)
   • Accessible dialogs: focus trap, Esc to close, focus restore,
     background made inert — works for every .overlay automatically
   • Mobile drawer, ripple effect, keyboard activation for role=button
   • Inline form validation
   • Animated counters, lazy ExcelJS loader, safe file downloads
   ════════════════════════════════════════════════════════════════════ */

const prefersReducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const _icon = name => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const _escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ───────────── Screen-reader announcements ───────────── */
function announce(msg, assertive) {
  const el = assertive ? document.getElementById('srAlert') : document.getElementById('toastWrap');
  if(!el || !assertive) return;
  el.textContent = '';
  setTimeout(() => { el.textContent = msg; }, 30);
}

/* ───────────── Toasts ───────────── */
function showToast(msg, type = '') {
  const wrap = document.getElementById('toastWrap');
  if(!wrap) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const ic = type === 'ok' ? 'check' : type === 'err' ? 'alert' : 'info';
  t.innerHTML = `<span class="toast-ic">${_icon(ic)}</span><span class="toast-msg"></span>
    <button type="button" class="toast-close" aria-label="Dismiss notification">${_icon('x')}</button>`;
  t.querySelector('.toast-msg').textContent = msg;
  wrap.appendChild(t);
  if(type === 'err') announce(msg, true);
  while(wrap.children.length > 3) wrap.firstElementChild.remove();
  const remove = () => {
    if(t._gone) return;
    t._gone = true;
    t.classList.add('leaving');
    setTimeout(() => t.remove(), prefersReducedMotion() ? 0 : 260);
  };
  t.querySelector('.toast-close').addEventListener('click', remove);
  let timer = setTimeout(remove, type === 'err' ? 5500 : 3000);
  t.addEventListener('pointerenter', () => clearTimeout(timer));
  t.addEventListener('pointerleave', () => { timer = setTimeout(remove, 1800); });
}

/* ───────────── Dialogs (all .overlay elements) ───────────── */
const _openOverlays = [];
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function _visibleFocusables(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(el => el.offsetParent !== null || el === document.activeElement);
}
function _setBackgroundInert(on) {
  ['app', 'bottomNav'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    if(on) { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); }
    else { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); }
  });
}
function _resetValidation(root) {
  root.querySelectorAll('.form-group.has-error, .form-group.is-valid').forEach(g => {
    g.classList.remove('has-error', 'is-valid');
    const err = g.querySelector('.field-error'); if(err) err.remove();
    g.querySelectorAll('[aria-invalid]').forEach(i => { i.removeAttribute('aria-invalid'); i.removeAttribute('aria-describedby'); });
  });
}
function _onOverlayOpen(ov) {
  if(_openOverlays.includes(ov)) return;
  ov._returnFocus = document.activeElement;
  _openOverlays.push(ov);
  _setBackgroundInert(true);
  _resetValidation(ov);
  const modal = ov.querySelector('.modal');
  if(modal && !modal.hasAttribute('tabindex')) modal.setAttribute('tabindex', '-1');
  const body = ov.querySelector('.modal-body'); if(body) body.scrollTop = 0;
  // On touch devices focus the dialog itself (avoids popping the keyboard);
  // on desktop focus the first field for fast data entry.
  setTimeout(() => {
    if(ov.classList.contains('hidden')) return;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const first = !coarse && Array.from(ov.querySelectorAll('.modal-body ' + FOCUSABLE)).find(el => el.offsetParent !== null && !el.readOnly);
    (first || modal || ov).focus({ preventScroll: true });
  }, 60);
}
function _onOverlayClose(ov) {
  const i = _openOverlays.indexOf(ov);
  if(i < 0) return;
  _openOverlays.splice(i, 1);
  if(!_openOverlays.length) _setBackgroundInert(false);
  const rf = ov._returnFocus;
  if(rf && document.contains(rf) && rf.offsetParent !== null) setTimeout(() => rf.focus({ preventScroll: true }), 10);
}
function _watchOverlays() {
  const mo = new MutationObserver(muts => muts.forEach(m => {
    const ov = m.target;
    if(ov.classList.contains('hidden')) _onOverlayClose(ov); else _onOverlayOpen(ov);
  }));
  document.querySelectorAll('.overlay').forEach(ov => mo.observe(ov, { attributes: true, attributeFilter: ['class'] }));
}

/* ───────────── Mobile drawer ───────────── */
function openDrawer() {
  const sb = document.getElementById('sidebar');
  if(!sb || window.matchMedia('(min-width: 1024px)').matches) return;
  sb._returnFocus = document.activeElement;
  sb.classList.add('open');
  document.getElementById('drawerScrim')?.classList.add('show');
  document.getElementById('menuBtn')?.setAttribute('aria-expanded', 'true');
  sb.setAttribute('role', 'dialog'); sb.setAttribute('aria-modal', 'true');
  ['bottomNav'].forEach(id => document.getElementById(id)?.setAttribute('inert', ''));
  document.querySelector('.main-col')?.setAttribute('inert', '');
  setTimeout(() => (sb.querySelector('.nav-btn.active') || sb.querySelector('.nav-btn'))?.focus({ preventScroll: true }), 60);
}
function closeDrawer() {
  const sb = document.getElementById('sidebar');
  if(!sb || !sb.classList.contains('open')) return;
  sb.classList.remove('open');
  sb.removeAttribute('role'); sb.removeAttribute('aria-modal');
  document.getElementById('drawerScrim')?.classList.remove('show');
  document.getElementById('menuBtn')?.setAttribute('aria-expanded', 'false');
  document.getElementById('bottomNav')?.removeAttribute('inert');
  document.querySelector('.main-col')?.removeAttribute('inert');
  const rf = sb._returnFocus;
  if(rf && sb.contains(document.activeElement) && document.contains(rf) && rf.offsetParent !== null) rf.focus({ preventScroll: true });
}

/* ───────────── Jobs filter panel (mobile) ───────────── */
function toggleFilterPanel(force) {
  const p = document.getElementById('filterPanel'), b = document.getElementById('filterToggle');
  if(!p) return;
  const open = typeof force === 'boolean' ? force : !p.classList.contains('open');
  p.classList.toggle('open', open);
  if(b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
}

/* ───────────── Inline validation ───────────── */
function _setFieldError(g, input, msg) {
  let err = g.querySelector('.field-error');
  if(msg) {
    g.classList.add('has-error'); g.classList.remove('is-valid');
    input.setAttribute('aria-invalid', 'true');
    if(!err) {
      err = document.createElement('div');
      err.className = 'field-error';
      err.id = (input.id || 'f' + Math.random().toString(36).slice(2)) + '-err';
      g.appendChild(err);
    }
    err.innerHTML = _icon('alert') + '<span></span>';
    err.querySelector('span').textContent = msg;
    input.setAttribute('aria-describedby', err.id);
  } else {
    g.classList.remove('has-error');
    input.removeAttribute('aria-invalid');
    if(err) { err.remove(); input.removeAttribute('aria-describedby'); }
    g.classList.toggle('is-valid', !!(input.required && String(input.value).trim()));
  }
}
function validateField(input) {
  const g = input.closest('.form-group');
  if(!g || input.type === 'hidden' || input.readOnly) return true;
  const v = input.validity || {};
  let msg = '';
  if(input.required && !String(input.value).trim()) msg = input.dataset.error || 'This field is required';
  // stepMismatch is intentionally ignored (v1 accepted any decimal)
  else if(v.badInput || v.rangeUnderflow || v.rangeOverflow || v.typeMismatch) msg = input.dataset.error || input.validationMessage || 'Please check this value';
  _setFieldError(g, input, msg);
  return !msg;
}
/** Validate visible fields inside a container. Returns false (and focuses the first problem) if invalid. */
function validateForm(rootId) {
  const root = document.getElementById(rootId);
  if(!root) return true;
  let firstBad = null;
  root.querySelectorAll('.form-ctrl').forEach(i => {
    if(i.offsetParent === null) return;
    if(!validateField(i) && !firstBad) firstBad = i;
  });
  if(firstBad) {
    firstBad.focus();
    announce('Please correct the highlighted field: ' + (firstBad.dataset.error || 'invalid value'), true);
    return false;
  }
  return true;
}

/* ───────────── Animated counters ───────────── */
const _counterMemory = {};
function animateCounters(root) {
  (root || document).querySelectorAll('[data-count]').forEach(el => {
    const to = Number(el.dataset.count) || 0;
    const key = el.dataset.key;
    const from = key && key in _counterMemory ? _counterMemory[key] : 0;
    if(key) _counterMemory[key] = to;
    if(prefersReducedMotion() || from === to) { el.textContent = to; return; }
    const start = performance.now(), dur = 700;
    const step = now => {
      const p = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * e);
      if(p < 1) requestAnimationFrame(step);
    };
    el.textContent = from;
    requestAnimationFrame(step);
  });
}

/* ───────────── ExcelJS: loaded on demand (saves ~1 MB on start-up) ───────────── */
const EXCELJS_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.3.0/dist/exceljs.min.js';
let _excelPromise = null;
function ensureExcelJS() {
  if(typeof ExcelJS !== 'undefined') return Promise.resolve();
  if(_excelPromise) return _excelPromise;
  showToast('Preparing Excel export…');
  _excelPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = EXCELJS_URL;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = () => (typeof ExcelJS !== 'undefined' ? resolve() : reject(new Error('ExcelJS unavailable')));
    s.onerror = () => { _excelPromise = null; s.remove(); reject(new Error('ExcelJS failed to load')); };
    document.head.appendChild(s);
  });
  return _excelPromise;
}

/* ───────────── File downloads (works in browsers and installed apps) ───────────── */
async function downloadBlob(blob, filename) {
  // iOS home-screen apps cannot follow download links reliably: use the share sheet.
  if(navigator.standalone === true && navigator.canShare && typeof File === 'function') {
    try {
      const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
      if(navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return true; }
    } catch(e) {
      if(e && e.name === 'AbortError') return false;
      // otherwise fall through to a normal download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener'; a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in Safari/Firefox
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

/* ───────────── Global listeners ───────────── */
document.addEventListener('DOMContentLoaded', () => {
  _watchOverlays();

  // Ripple feedback on press
  document.addEventListener('pointerdown', e => {
    if(e.button !== 0 || prefersReducedMotion()) return;
    const el = e.target.closest('.btn, .icon-btn, .act-btn, .nav-btn, .bnav-btn, .stat-card, .seg-btn, .sidebar-item, .sidebar-link, .tab-btn, .ds-btn, .menu-item');
    if(!el || el.disabled) return;
    const r = el.getBoundingClientRect();
    const size = Math.max(r.width, r.height);
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    el.appendChild(s);
    setTimeout(() => s.remove(), 600);
  }, { passive: true });

  // Enter / Space activate custom role="button" elements
  document.addEventListener('keydown', e => {
    if((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"]:not(button):not(a), [data-kbd-click]')) {
      e.preventDefault();
      e.target.click();
    }
  });

  // Esc closes the top-most layer; Tab stays inside open dialogs
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape') {
      const menu = document.getElementById('planExportMenu');
      if(menu && menu.style.display === 'block') { menu.style.display = 'none'; document.getElementById('planExportBtn')?.setAttribute('aria-expanded','false'); document.getElementById('planExportBtn')?.focus(); return; }
      const top = _openOverlays[_openOverlays.length - 1];
      if(top) { e.preventDefault(); if(typeof closeModal === 'function') closeModal(top.id); else top.classList.add('hidden'); return; }
      if(document.getElementById('sidebar')?.classList.contains('open')) { closeDrawer(); return; }
    }
    if(e.key === 'Tab') {
      const top = _openOverlays[_openOverlays.length - 1];
      const container = top || (document.getElementById('sidebar')?.classList.contains('open') ? document.getElementById('sidebar') : null);
      if(!container) return;
      const f = _visibleFocusables(container);
      if(!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if(e.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    }
  });

  // Inline validation on blur / live correction while typing
  document.addEventListener('focusout', e => {
    const i = e.target;
    if(i.classList && i.classList.contains('form-ctrl') && i.closest('.overlay') && (i.required || String(i.value) !== '')) validateField(i);
  });
  document.addEventListener('input', e => {
    const i = e.target;
    if(!i.classList || !i.classList.contains('form-ctrl')) return;
    const g = i.closest('.form-group');
    if(g && (g.classList.contains('has-error') || (i.required && g.classList.contains('is-valid')))) validateField(i);
  });

  // Leaving mobile layout closes the drawer (prevents an inert main area)
  const desk = window.matchMedia('(min-width: 1024px)');
  const onDesk = () => { if(desk.matches) closeDrawer(); };
  desk.addEventListener ? desk.addEventListener('change', onDesk) : desk.addListener(onDesk);
});
