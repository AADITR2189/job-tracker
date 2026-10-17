/* ════════════════════════════════════════════════════════════════════
   Drag & drop helper (mouse, pen and touch) — used by the Jobs board and
   the Planning grid. Presentation only: it reports "this item was dropped
   here" and the caller decides what that means for the data.
     • Mouse: drag starts after a small movement.
     • Touch: press and hold briefly, then drag (so normal scrolling still works).
     • Esc cancels. The page scrolls when you drag near its edge.
     • A quick flick counts: the drop point is projected from the release speed.
     • On drop the item flies into its new place (opts.landing), so there is no jump.
   ════════════════════════════════════════════════════════════════════ */

window.jtDrag = function(container, opts) {
  if(!container) return;
  const HOLD = opts.holdMs || 320;
  let s = null;   // current gesture state

  const scrollers = () => [document.getElementById('contentScroll'), ...(opts.scrollers ? opts.scrollers() : [])].filter(Boolean);

  container.addEventListener('pointerdown', e => {
    if(e.button !== 0 || s) return;
    const item = e.target.closest(opts.item);
    if(!item || !container.contains(item)) return;
    if(e.target.closest('input, select, textarea, .no-drag')) return;
    if(opts.enabled && !opts.enabled(item)) return;
    s = { item, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse', dragging: false, over: null, vel: jtVelocity() };
    if(s.touch) s.timer = setTimeout(() => { if(s && !s.dragging) start(); }, HOLD);
  });

  function start() {
    const r = s.item.getBoundingClientRect();
    s.dx = s.x0 - r.left; s.dy = s.y0 - r.top;
    const g = s.item.cloneNode(true);
    g.removeAttribute('id');
    g.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    g.classList.add('drag-ghost');
    g.setAttribute('aria-hidden', 'true');
    g.style.width = r.width + 'px'; g.style.height = r.height + 'px';
    g.style.left = '0px'; g.style.top = '0px';
    document.body.appendChild(g);
    s.ghost = g; s.dragging = true;
    s.item.classList.add('drag-src');
    document.documentElement.classList.add('is-dragging');
    if(s.touch && navigator.vibrate) { try { navigator.vibrate(12); } catch(e) {} }
    place();
    s.raf = requestAnimationFrame(autoScroll);
    if(opts.onStart) opts.onStart(s.item);
  }

  function place() {
    s.ghost.style.transform = `translate3d(${s.x - s.dx}px, ${s.y - s.dy}px, 0) rotate(${s.touch ? 0 : 1.5}deg)`;
    const el = document.elementFromPoint(s.x, s.y);
    let drop = el && el.closest(opts.drop);
    if(drop && opts.canDrop && !opts.canDrop(s.item, drop)) drop = null;
    if(drop !== s.over) {
      if(s.over) s.over.classList.remove('drop-over');
      if(drop) drop.classList.add('drop-over');
      s.over = drop;
    }
  }

  function autoScroll() {
    if(!s || !s.dragging) return;
    const EDGE = 56, MAX = 18;
    scrollers().forEach(sc => {
      const r = sc.getBoundingClientRect();
      if(s.x < r.left || s.x > r.right || s.y < r.top - EDGE || s.y > r.bottom + EDGE) return;
      const v = (d) => Math.round(MAX * Math.min(1, (EDGE - d) / EDGE));
      if(sc.scrollHeight > sc.clientHeight) {
        if(s.y - r.top < EDGE) sc.scrollTop -= v(s.y - r.top);
        else if(r.bottom - s.y < EDGE) sc.scrollTop += v(r.bottom - s.y);
      }
      if(sc.scrollWidth > sc.clientWidth) {
        if(s.x - r.left < EDGE) sc.scrollLeft -= v(s.x - r.left);
        else if(r.right - s.x < EDGE) sc.scrollLeft += v(r.right - s.x);
      }
    });
    place();
    s.raf = requestAnimationFrame(autoScroll);
  }

  function end(drop) {
    if(!s) return;
    clearTimeout(s.timer);
    const st = s; s = null;
    if(!st.dragging) return;
    cancelAnimationFrame(st.raf);
    document.documentElement.classList.remove('is-dragging');
    if(st.over) st.over.classList.remove('drop-over');
    // A click fires after the pointer is released: swallow it so the item is not "opened"
    const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 50);
    const g = st.ghost;
    const finish = () => { g.remove(); st.item.classList.remove('drag-src'); };
    // Flick: no target under the finger, but the throw is heading to one
    if(drop && !st.over) {
      const v = st.vel.get();
      const px = Math.max(2, Math.min(innerWidth - 2, st.x + jtProject(v.x, 0.99)));
      const py = Math.max(2, Math.min(innerHeight - 2, st.y + jtProject(v.y, 0.99)));
      const el = document.elementFromPoint(px, py);
      const t = el && el.closest(opts.drop);
      if(t && (!opts.canDrop || opts.canDrop(st.item, t))) st.over = t;
    }
    if(drop && st.over) {
      jtBuzz(8);
      const key = st.item;
      opts.onDrop(st.item, st.over);
      // Fly the ghost into the item's new place, then reveal it there
      const dest = opts.landing ? opts.landing(key, st.over) : null;
      if(dest && document.contains(dest) && dest !== st.item) {
        const r = dest.getBoundingClientRect();
        dest.style.opacity = '0';
        g.style.transition = 'transform 280ms cubic-bezier(.22,1,.36,1), width 280ms cubic-bezier(.22,1,.36,1), height 280ms cubic-bezier(.22,1,.36,1)';
        g.style.width = r.width + 'px'; g.style.height = r.height + 'px';
        g.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`;
        setTimeout(() => { dest.style.opacity = ''; finish(); }, 280);
      } else {
        // Nothing to fly to (e.g. a dialog opened first): settle back where it came from
        const r = st.item.getBoundingClientRect();
        g.style.transition = 'transform 260ms cubic-bezier(.22,1,.36,1)';
        g.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`;
        setTimeout(finish, 260);
      }
    } else {
      // Glide back to where it came from
      const r = st.item.getBoundingClientRect();
      g.style.transition = 'transform 260ms cubic-bezier(.16,1,.3,1)';
      g.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`;
      setTimeout(finish, 260);
    }
  }

  document.addEventListener('pointermove', e => {
    if(!s || e.pointerId !== s.id) return;
    s.x = e.clientX; s.y = e.clientY;
    s.vel.add(s.x, s.y);
    if(!s.dragging) {
      const moved = Math.hypot(s.x - s.x0, s.y - s.y0);
      if(s.touch) { if(moved > 10) { clearTimeout(s.timer); s = null; } }   // it's a scroll
      else if(moved > 6) start();
      return;
    }
    place();
  }, { passive: true });
  // While dragging on touch, stop the page from scrolling under the finger
  document.addEventListener('touchmove', e => { if(s && s.dragging) e.preventDefault(); }, { passive: false });
  document.addEventListener('pointerup', e => { if(s && e.pointerId === s.id) end(true); });
  document.addEventListener('pointercancel', e => { if(s && e.pointerId === s.id) end(false); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && s && s.dragging) end(false); });
  // Long-press on touch would otherwise open the browser's context menu
  container.addEventListener('contextmenu', e => { if(s) e.preventDefault(); });
};
