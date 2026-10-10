/* ════════════════════════════════════════════════════════════════════
   PWA integration
   • Service worker registration + "new version" banner (user decides
     when to reload, so nothing is ever interrupted mid-edit)
   • Install prompt (Chrome/Edge/Samsung) and iOS "Add to Home Screen"
     guidance
   • Online/offline indicator
   • Persistent storage request, so the browser does not evict job data
   • Periodic background sync (where supported) to check for updates
   ════════════════════════════════════════════════════════════════════ */

const APP_VERSION = '2.3.1';
let _deferredInstall = null;
let _swReg = null;
let _updateRequested = false;

const _ua = navigator.userAgent || '';
const isIOS = /iphone|ipad|ipod/i.test(_ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isFirefox = /firefox|fxios/i.test(_ua);
const isSamsung = /SamsungBrowser/i.test(_ua);
function isStandalone() {
  return (window.matchMedia && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: minimal-ui)').matches)) || navigator.standalone === true;
}

/* ───────────── Install ───────────── */
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredInstall = e;
  updateInstallUI();
});
window.addEventListener('appinstalled', () => {
  _deferredInstall = null;
  updateInstallUI();
  showToast('Job Tracker installed', 'ok');
});

async function promptInstall() {
  if(_deferredInstall) {
    _deferredInstall.prompt();
    try { await _deferredInstall.userChoice; } catch(e) {}
    _deferredInstall = null;
    updateInstallUI();
  } else if(isIOS) {
    showToast('Tap the Share button, then "Add to Home Screen"');
  } else {
    showToast('Use your browser menu → "Install app" or "Add to Home screen"');
  }
}

function updateInstallUI() {
  const canPrompt = !!_deferredInstall && !isStandalone();
  ['installBtn', 'installBtnSettings'].forEach(id => {
    const b = document.getElementById(id);
    if(b) b.hidden = !(canPrompt || (isIOS && !isStandalone() && id === 'installBtnSettings'));
  });
  const info = document.getElementById('installInfo');
  if(info) {
    if(isStandalone()) info.textContent = 'Job Tracker is installed and running as an app. It works fully offline.';
    else if(isIOS) info.textContent = 'To install on iPhone or iPad: open this page in Safari, tap the Share button, then choose "Add to Home Screen".';
    else if(isSamsung) info.textContent = 'To install in Samsung Internet: tap the menu, then "Add page to" → "Home screen" (or use the install icon in the address bar).';
    else info.textContent = 'Install Job Tracker as an app for quick access from your home screen or taskbar, and full offline use.';
  }
  updatePwaStatus();
}

/* ───────────── Service worker & updates ───────────── */
function showUpdate() {
  const b = document.getElementById('updateBanner');
  if(b) b.hidden = false;
}
function dismissUpdate() {
  const b = document.getElementById('updateBanner');
  if(b) b.hidden = true;
}
function applyUpdate() {
  // All data is saved to localStorage on every change, so reloading is safe.
  _updateRequested = true;
  const w = _swReg && _swReg.waiting;
  if(w) w.postMessage({ type: 'SKIP_WAITING' });
  else location.reload();
}
async function checkForUpdates() {
  if(!_swReg) { showToast('Updates are checked automatically when the app is served over HTTPS'); return; }
  try {
    await _swReg.update();
    if(_swReg.waiting) showUpdate();
    else if(_swReg.installing) showToast('Downloading the latest version…');
    else showToast('You are on the latest version (v' + APP_VERSION + ')', 'ok');
  } catch(e) { showToast('Could not check for updates — you may be offline', 'err'); }
}

if('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      _swReg = await navigator.serviceWorker.register('service-worker.js', { scope: './' });
      if(!_swReg) return;
      if(_swReg.waiting && navigator.serviceWorker.controller) showUpdate();
      _swReg.addEventListener('updatefound', () => {
        const nw = _swReg.installing;
        if(!nw) return;
        nw.addEventListener('statechange', () => {
          if(nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate();
          if(nw.state === 'activated') updatePwaStatus();
        });
      });
      setInterval(() => _swReg.update().catch(() => {}), 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if(document.visibilityState === 'visible') _swReg.update().catch(() => {});
      });
      // Periodic Background Sync (Chromium, installed apps): keeps the app up to date
      if('periodicSync' in _swReg && navigator.permissions) {
        try {
          const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
          if(st.state === 'granted') await _swReg.periodicSync.register('jt-update-check', { minInterval: 24 * 60 * 60 * 1000 });
        } catch(e) {}
      }
    } catch(e) {
      console.warn('Service worker registration failed', e);
    }
    updatePwaStatus();
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(!_updateRequested) { updatePwaStatus(); return; }
    _updateRequested = false;
    location.reload();
  });
}

/* ───────────── Online / offline ───────────── */
function updateNetStatus(notify) {
  const off = navigator.onLine === false;
  const pill = document.getElementById('netStatus');
  if(pill) pill.hidden = !off;
  if(notify) showToast(off ? 'You are offline. Everything keeps working; changes are saved on this device.' : 'Back online', off ? '' : 'ok');
}
window.addEventListener('online', () => updateNetStatus(true));
window.addEventListener('offline', () => updateNetStatus(true));

/* ───────────── Persistent storage ───────────── */
async function requestPersistentStorage(fromUser) {
  if(!navigator.storage || !navigator.storage.persist) { if(fromUser) showToast('This browser does not support storage protection'); return false; }
  try {
    if(await navigator.storage.persisted()) { if(fromUser) showToast('Storage is already protected', 'ok'); updatePwaStatus(); return true; }
    const granted = await navigator.storage.persist();
    if(fromUser) showToast(granted ? 'Storage protected from automatic cleanup' : 'The browser declined. Installing the app usually enables protection.', granted ? 'ok' : '');
    updatePwaStatus();
    return granted;
  } catch(e) { return false; }
}
// Ask once after the first interaction (Firefox shows a prompt, so it is left to the Settings button there).
document.addEventListener('pointerdown', function once() {
  document.removeEventListener('pointerdown', once);
  if(!isFirefox) requestPersistentStorage(false);
}, { passive: true });

/* ───────────── Settings: status list ───────────── */
async function updatePwaStatus() {
  const list = document.getElementById('pwaStatusList');
  if(!list) return;
  const items = [];
  const controlled = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
  items.push(controlled
    ? { cls:'ok', ic:'check-circle', text:'Offline ready: the app loads and works without internet.' }
    : { cls:'info', ic:'info', text:'Offline support activates after the first visit (requires HTTPS).' });
  items.push(isStandalone()
    ? { cls:'ok', ic:'check-circle', text:'Running as an installed app.' }
    : { cls:'info', ic:'install', text:'Not installed yet. Installing adds a home-screen icon and full-screen mode.' });
  let persisted = null;
  try { if(navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted(); } catch(e) {}
  if(persisted === true) items.push({ cls:'ok', ic:'shield', text:'Storage protected: the browser will not clear your job data automatically.' });
  else if(persisted === false) items.push({ cls:'warn', ic:'alert', text:'Storage not protected: the browser may clear data if space runs low. Export backups regularly.', action:'<button type="button" class="link-btn" onclick="requestPersistentStorage(true)">Protect storage</button>' });
  let bytes = 0;
  try { bytes = (localStorage.getItem('jt_v2') || '').length * 2; } catch(e) {}
  items.push({ cls:'info', ic:'database', text:`About ${bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB'} of job data stored on this device. App version ${APP_VERSION}.` });
  list.innerHTML = items.map(i => `<li class="${i.cls}"><svg class="ic" aria-hidden="true"><use href="#i-${i.ic}"/></svg><span>${i.text}${i.action ? ' ' + i.action : ''}</span></li>`).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  updateNetStatus(false);
  updateInstallUI();
});
