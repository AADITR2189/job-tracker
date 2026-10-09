/* ════════════════════════════════════════════════════════════════════
   Empty states — friendly inline illustrations (theme-aware via CSS
   classes and currentColor) with a message and quick actions.
   ════════════════════════════════════════════════════════════════════ */

const _EMPTY_ART = {
  jobs: `<rect class="ea-card" x="44" y="18" width="52" height="68" rx="8" stroke-width="2"/>
         <rect x="58" y="12" width="24" height="12" rx="4" fill="currentColor"/>
         <path class="ea-line" d="M56 40h28M56 52h28M56 64h18" stroke-width="4" stroke-linecap="round"/>
         <circle class="ea-accent" cx="94" cy="80" r="12"/><path d="m89 80 3.5 3.5L99 77" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  search: `<rect class="ea-card" x="30" y="24" width="64" height="60" rx="8" stroke-width="2"/>
         <path class="ea-line" d="M42 42h40M42 54h30M42 66h22" stroke-width="4" stroke-linecap="round"/>
         <circle cx="92" cy="64" r="16" fill="none" stroke="currentColor" stroke-width="5"/>
         <path d="m104 76 12 12" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>`,
  calendar: `<rect class="ea-card" x="34" y="22" width="72" height="64" rx="8" stroke-width="2"/>
         <rect x="34" y="22" width="72" height="16" rx="8" fill="currentColor"/><rect x="34" y="30" width="72" height="8" fill="currentColor"/>
         <path class="ea-line" d="M48 52h8M66 52h8M84 52h8M48 68h8M66 68h8" stroke-width="5" stroke-linecap="round"/>
         <circle class="ea-accent" cx="88" cy="68" r="6"/>`,
  persons: `<circle class="ea-card" cx="56" cy="44" r="16" stroke-width="2"/><circle class="ea-card" cx="88" cy="48" r="13" stroke-width="2"/>
         <path class="ea-card" d="M30 92c2-16 13-24 26-24s24 8 26 24z" stroke-width="2"/>
         <path d="M70 92c2-13 9-20 18-20s16 7 18 20z" fill="currentColor"/>`,
  reports: `<rect class="ea-card" x="28" y="20" width="84" height="70" rx="8" stroke-width="2"/>
         <rect x="42" y="56" width="10" height="22" rx="3" fill="currentColor" opacity=".5"/>
         <rect x="60" y="44" width="10" height="34" rx="3" fill="currentColor"/>
         <rect x="78" y="34" width="10" height="44" rx="3" class="ea-accent"/>
         <path class="ea-line" d="M40 82h60" stroke-width="2"/>`,
  upcoming: `<circle class="ea-card" cx="70" cy="54" r="32" stroke-width="2"/>
         <path d="M70 34v20l13 8" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
         <circle class="ea-accent" cx="98" cy="30" r="8"/>`,
  done: `<circle class="ea-card" cx="70" cy="54" r="32" stroke-width="2"/>
         <path d="m56 55 10 10 19-21" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
};

/**
 * Build an empty-state block.
 * @param {string} kind  one of the keys above
 * @param {string} title short heading (plain text)
 * @param {string} text  supporting sentence (plain text)
 * @param {string} actionsHtml optional trusted HTML for buttons
 */
function emptyState(kind, title, text, actionsHtml = '') {
  const art = _EMPTY_ART[kind] || _EMPTY_ART.jobs;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<div class="empty">
    <svg class="empty-art" viewBox="0 0 140 110" aria-hidden="true"><ellipse class="ea-soft" cx="70" cy="56" rx="62" ry="48"/>${art}</svg>
    <h3>${esc(title)}</h3>
    <p>${esc(text)}</p>
    ${actionsHtml ? `<div class="empty-actions">${actionsHtml}</div>` : ''}
  </div>`;
}
