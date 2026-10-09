/* ════════════════════════════════════════════════════════════════════
   Theme manager — light / dark / system
   • Initial theme is applied by a tiny inline script in <head> before
     first paint (no flash of the wrong theme).
   • Preference is stored in localStorage 'jt_theme' (new key; does not
     touch any job data). Values: 'light' | 'dark' | 'system'.
   • 'system' follows prefers-color-scheme live.
   ════════════════════════════════════════════════════════════════════ */

const JT_THEME_KEY = 'jt_theme';
const _themeMedia = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function getThemePref() {
  try { return localStorage.getItem(JT_THEME_KEY) || 'system'; } catch(e) { return 'system'; }
}

function resolveTheme(pref) {
  if(pref === 'dark' || pref === 'light') return pref;
  return _themeMedia && _themeMedia.matches ? 'dark' : 'light';
}

function applyTheme(pref, animate) {
  const root = document.documentElement;
  const theme = resolveTheme(pref);
  if(animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('theme-transition');
    clearTimeout(applyTheme._t);
    applyTheme._t = setTimeout(() => root.classList.remove('theme-transition'), 450);
  }
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-theme-pref', pref);

  // Browser/OS chrome colour follows the app header
  const bar = theme === 'dark' ? '#1E293B' : '#FFFFFF';
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', bar));

  // Sync controls
  document.querySelectorAll('[data-theme-opt]').forEach(b => {
    const on = b.dataset.themeOpt === pref;
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.classList.toggle('active', on);
  });
  const t = document.getElementById('themeToggle');
  if(t) t.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
}

function setThemePref(pref) {
  try { localStorage.setItem(JT_THEME_KEY, pref); } catch(e) {}
  applyTheme(pref, true);
}

/** Header button: flip between light and dark (explicit choice). */
function toggleTheme() {
  const current = resolveTheme(getThemePref());
  setThemePref(current === 'dark' ? 'light' : 'dark');
}

if(_themeMedia) {
  const onSystemChange = () => { if(getThemePref() === 'system') applyTheme('system', true); };
  if(_themeMedia.addEventListener) _themeMedia.addEventListener('change', onSystemChange);
  else if(_themeMedia.addListener) _themeMedia.addListener(onSystemChange); // Safari < 14
}

document.addEventListener('DOMContentLoaded', () => applyTheme(getThemePref(), false));
