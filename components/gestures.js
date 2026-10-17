/* ════════════════════════════════════════════════════════════════════
   Direct-manipulation gestures (loaded after start-up), Apple-style:
     • Phone pop-up sheets: drag the top bar down to close — the sheet
       follows the finger 1:1, resists when pulled up, and on release
       uses the flick speed to decide close vs. snap back.
     • Side menu (phone/tablet): swipe it left to close, same rules.
   Motion uses jtSpring (components/ui.js): it starts from where the
   element is and how fast the finger moved, so there is no seam.
   ════════════════════════════════════════════════════════════════════ */

(() => {
  const isSheetLayout = () => window.matchMedia('(max-width: 559px)').matches;
  const isDrawerLayout = () => window.matchMedia('(max-width: 1023px)').matches;

  /* ───────── Bottom sheets: drag down to dismiss ───────── */
  let sh = null;
  document.addEventListener('pointerdown', e => {
    if(!isSheetLayout() || e.button !== 0) return;
    const hdr = e.target.closest('.overlay:not(.hidden):not(.palette-overlay) .modal-hdr');
    if(!hdr || e.target.closest('button, a, input, select, textarea')) return;
    const modal = hdr.closest('.modal'), ov = hdr.closest('.overlay');
    if(sh && sh.spring) sh.spring.stop();
    const start = sh && sh.modal === modal ? sh.y : 0;   // grab it again mid-flight
    sh = { modal, ov, id: e.pointerId, y0: e.clientY - start, y: start, vel: jtVelocity(), h: modal.offsetHeight };
    modal.style.transition = 'none';
    try { hdr.setPointerCapture(e.pointerId); } catch(err) {}
    sh.vel.add(0, e.clientY);
  });
  document.addEventListener('pointermove', e => {
    if(!sh || e.pointerId !== sh.id || sh.done) return;
    const raw = e.clientY - sh.y0;
    sh.y = raw < 0 ? -jtRubberband(-raw, sh.h) : raw;   // resists when pulled up
    sh.vel.add(0, e.clientY);
    sh.modal.style.transform = `translateY(${sh.y}px)`;
  });
  const sheetEnd = e => {
    if(!sh || e.pointerId !== sh.id || sh.done) return;
    const c = sh; c.done = true;
    const v = c.vel.get().y;
    const projected = c.y + jtProject(v, 0.99);
    const close = c.y > 0 && (projected > c.h * 0.45 || v > 1000);
    const tidy = () => { c.modal.style.transform = ''; c.modal.style.transition = ''; if(sh === c) sh = null; };
    if(close) {
      jtBuzz(8);
      c.spring = jtSpring({ from: c.y, to: c.h + 40, velocity: v, damping: 1, response: 0.3,
        onUpdate: y => { c.y = y; c.modal.style.transform = `translateY(${y}px)`; },
        onDone: () => {
          if(typeof closeModal === 'function') closeModal(c.ov.id); else c.ov.classList.add('hidden');
          setTimeout(tidy, 320);
        } });
    } else {
      c.spring = jtSpring({ from: c.y, to: 0, velocity: v, damping: Math.abs(v) > 300 ? 0.85 : 1, response: 0.3,
        onUpdate: y => { c.y = y; c.modal.style.transform = `translateY(${y}px)`; },
        onDone: tidy });
      c.done = false; c.id = null;   // can be grabbed again while it settles
    }
  };
  document.addEventListener('pointerup', sheetEnd);
  document.addEventListener('pointercancel', sheetEnd);

  /* ───────── Side menu: swipe left to close ───────── */
  const sb = document.getElementById('sidebar'), scrim = document.getElementById('drawerScrim');
  let dr = null;
  sb && sb.addEventListener('pointerdown', e => {
    if(!isDrawerLayout() || !sb.classList.contains('open') || e.button !== 0) return;
    dr = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: 0, on: false, vel: jtVelocity(), w: sb.offsetWidth };
    dr.vel.add(e.clientX, 0);
  });
  sb && sb.addEventListener('pointermove', e => {
    if(!dr || e.pointerId !== dr.id) return;
    const dx = e.clientX - dr.x0, dy = e.clientY - dr.y0;
    if(!dr.on) {
      if(Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { dr = null; return; }   // it's a scroll
      if(Math.abs(dx) < 10) return;
      dr.on = true; dr.x0 = e.clientX;   // start 1:1 from here (no jump after the threshold)
      sb.style.transition = 'none'; if(scrim) scrim.style.transition = 'none';
      try { sb.setPointerCapture(e.pointerId); } catch(err) {}
    }
    const raw = e.clientX - dr.x0;
    dr.x = raw > 0 ? jtRubberband(raw, dr.w) : raw;
    dr.vel.add(e.clientX, 0);
    sb.style.transform = `translateX(${dr.x}px)`;
    if(scrim) scrim.style.opacity = String(Math.max(0, 1 + Math.min(0, dr.x) / dr.w));
  });
  const drawerEnd = e => {
    if(!dr || e.pointerId !== dr.id) return;
    const c = dr; dr = null;
    if(!c.on) return;
    // A tap that follows a swipe should not open a menu item
    const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 50);
    const v = c.vel.get().x;
    const close = c.x + jtProject(v, 0.99) < -c.w * 0.4 || v < -700;
    const set = x => { sb.style.transform = `translateX(${x}px)`; if(scrim) scrim.style.opacity = String(Math.max(0, 1 + Math.min(0, x) / c.w)); };
    const tidy = () => { sb.style.transform = ''; sb.style.transition = ''; if(scrim) { scrim.style.opacity = ''; scrim.style.transition = ''; } };
    jtSpring({ from: c.x, to: close ? -c.w - 8 : 0, velocity: v, damping: 1, response: 0.3, onUpdate: set,
      onDone: () => {
        if(close) { jtBuzz(8); if(typeof closeDrawer === 'function') closeDrawer(); void sb.offsetWidth; }
        tidy();
      } });
  };
  sb && sb.addEventListener('pointerup', drawerEnd);
  sb && sb.addEventListener('pointercancel', drawerEnd);

  window.jtGestures = { ready: true };
})();
