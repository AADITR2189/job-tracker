/* ════════════════════════════════════════════════════════════════════
   Planning: drag & drop (loaded after start-up)
   Drag a job (or upcoming job) to another day and/or another person:
     • another day   → its start date moves by the same number of days
     • another person → reassigned, with a reassignment-history entry just
                        like the Reassign dialog (location follows the person)
   A "not planned" job dropped on the plan becomes "planned".
   Jobs shown in a row only because they are shared with that person
   are not draggable there (move them from their owner's row).
   ════════════════════════════════════════════════════════════════════ */

(() => {
  const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00') - new Date(a + 'T00:00')) / 86400000);
  const shift = (ds, n) => ds ? localDateStr(addDays(new Date(ds + 'T00:00'), n)) : ds;
  let landed = null;

  function moveChip(chip, cell) {
    const from = chip.dataset.from, to = cell.dataset.ds;
    const fromPerson = chip.closest('tr')?.querySelector('.plan-person-link')?.textContent || '';
    const toPerson = cell.dataset.person;
    const n = dayDiff(from, to);
    const isUp = !!chip.dataset.up;
    const j = isUp ? JT.upcomingJobs.find(u => u.id === Number(chip.dataset.up)) : JT.jobs.find(x => x.id === Number(chip.dataset.job));
    if(!j || (n === 0 && toPerson === fromPerson)) return;

    if(isUp) {
      j.plannedStartDate = shift(j.plannedStartDate, n);
      if(toPerson !== j.personInCharge) j.personInCharge = toPerson;
      j.updatedAt = new Date().toISOString();
    } else {
      if(n) {
        if(j.startDate) j.startDate = shift(j.startDate, n);
        if(j.plannedStartDate) j.plannedStartDate = shift(j.plannedStartDate, n);
      }
      if(toPerson !== j.personInCharge) {
        if(!j.reassignmentHistory) j.reassignmentHistory = [];
        j.reassignmentHistory.push({ from: j.personInCharge, to: toPerson, reason: 'Moved in Planning', date: today(), pctAtHandover: j.completionPercentage || 0 });
        j.personInCharge = toPerson;
      }
      if(j.status === 'not planned') j.status = 'planned';
    }
    save();
    renderAll();
    const when = new Date(to + 'T00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    toastUndo(`${j.vesselName || 'Job'} moved${n ? ` to start ${n > 0 ? n + ' day' + (n > 1 ? 's' : '') + ' later' : -n + ' day' + (n < -1 ? 's' : '') + ' earlier'}` : ''}${toPerson !== fromPerson ? ` · now ${toPerson}` : ''} (dropped on ${when})`);
  }

  // Highlight the chip that just moved
  const _renderPlanning = renderPlanning;
  renderPlanning = function() {
    _renderPlanning.apply(this, arguments);
    if(!landed) return;
    const sel = landed[0] === 'u' ? `[data-up="${landed.slice(1)}"]` : `[data-job="${landed.slice(1)}"]`;
    landed = null;
    if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.querySelectorAll('#planTable .plan-chip' + sel).forEach(c => { c.classList.add('chip-landed'); setTimeout(() => c.classList.remove('chip-landed'), 800); });
  };

  const init = () => {
    jtDrag(document.getElementById('planTable'), {
      item: '.plan-chip', drop: 'td.pc',
      enabled: chip => !!chip.dataset.up || chip.dataset.own === '1',
      canDrop: (chip, cell) => !(cell.dataset.ds === chip.dataset.from && cell.closest('tr') === chip.closest('tr')),
      onDrop: moveChip,
      landing: (chip, cell) => {
        const sel = chip.dataset.up ? `[data-up="${chip.dataset.up}"]` : `[data-job="${chip.dataset.job}"]`;
        const td = document.querySelector(`#planTable td.pc[data-ds="${cell.dataset.ds}"][data-person="${CSS.escape(cell.dataset.person)}"]`);
        return (td && td.querySelector('.plan-chip' + sel)) || null;
      },
      scrollers: () => [document.querySelector('#page-planning .plan-wrap')],
    });
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.jtPlanPlus = { moveChip };
})();
