/* R/D simple layout (modelled on C/D 2.0): the chart fills the top of the screen; a strip under it sums up the
   eye; a dock at the bottom holds one big action and the everyday tools; everything else opens in panels that
   slide up (beside the chart on a computer). It rearranges the classic page's own elements, so every feature keeps
   working, and the guide carries on by itself: trace → break → PVD → lens → repair options.
   ?classic (or the ⋯ menu) brings back the classic layout. */
(function (root) {
'use strict';
root.RDShell = function (X, H) {
  const { el, $, RD, hand } = X;
  const $$ = (s) => [...document.querySelectorAll(s)];
  document.body.classList.add('simple');
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>'),
    share: svg('<path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>'),
    more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>',
    trace: svg('<path d="M3 20c3-1 4.5-3.5 7-3.5 2 0 2 2 4 2s3.5-1.5 4.5-3"/><path d="m14.5 4.5 3 3L9 16l-4 1 1-4Z"/>'),
    redraw: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    go: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>'),
    dl: svg('<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>'),
    copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
    redo: svg('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
    find: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    pole: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v2M12 18.5v2"/>'),
    layout: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>'),
    review: svg('<path d="M4 5h16v11H8l-4 4Z"/><path d="M8 9h8M8 12h5"/>'),
    scale: svg('<path d="M12 4v16M8 20h8M5 7h14M12 4l0 3"/><path d="M5 7 2.5 13a2.6 2.6 0 0 0 5 0Z"/><path d="M19 7l-2.5 6a2.6 2.6 0 0 0 5 0Z"/>'),
    ring: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><path d="M12 3.5v3M12 17.5v3"/>'),
  };
  const iconBtn = (id, label, ic, cls) => { const b = el('button', { type: 'button', class: 's-icon' + (cls ? ' ' + cls : ''), id, 'aria-label': label, title: label }); b.innerHTML = ic; return b; };
  const scene = () => X.getScene();

  /* ------------------------------ header ------------------------------ */
  const app = $('.app'), top = $('.top'), layout = $('.layout'), card = $('.chart-card'), stage = $('#stage'), consoleCol = $('.console');
  const sApp = el('div', { id: 'sApp' });
  app.append(sApp);
  const sTop = el('header', { id: 'sTop' });
  const logo = top.querySelector('.brand svg'); if (logo) logo.classList.add('s-logo');
  const eye = top.querySelector('.eye-switch');
  const clearBtn = iconBtn('sClearBtn', 'Clear the drawing', IC.trash, 's-clear');
  const shareBtn = iconBtn('sShareBtn', 'Save, copy or send for review', IC.share);
  const menuBtn = iconBtn('sMenuBtn', 'More', IC.more);
  sTop.append(logo || el('strong', { text: 'R/D' }), el('span', { class: 's-gap' }), eye, clearBtn, shareBtn, menuBtn);

  /* -------------------- main: chart, summary strip, describe line -------------------- */
  const sMain = el('main', { id: 'sMain' });
  sApp.append(sTop, sMain);            // in the document straight away, so the elements moved into it can still be found
  const undoBtn = $('#undo'); undoBtn.classList.add('s-fab'); stage.append(undoBtn);
  const empty = el('div', { id: 'sEmpty', hidden: true }); empty.innerHTML = '<b>Trace the detachment</b> to begin, or describe it below.';
  stage.append(empty);
  const strip = el('div', { id: 'sStrip', role: 'group', 'aria-label': 'Summary of the eye' });
  const cmdCard = $('.command'), cmd = $('#cmd'), mic = $('#mic'), go = $('#go');
  cmd.setAttribute('rows', '1'); cmd.setAttribute('placeholder', 'Describe: RRD 10–2, HST at 12');
  // the describe line grows with what is typed and shrinks back when it is sent
  const fitCmd = () => { cmd.style.height = ''; if (cmd.value) cmd.style.height = Math.min(140, cmd.scrollHeight + 2) + 'px'; };
  cmd.addEventListener('input', () => { fitCmd(); syncDock(); });
  cmd.addEventListener('keydown', () => setTimeout(fitCmd, 0));
  go.addEventListener('click', () => setTimeout(fitCmd, 0));
  const micLabel = $('#micLabel');
  mic.innerHTML = IC.mic; if (micLabel) { micLabel.classList.add('sr'); mic.append(micLabel); }
  mic.setAttribute('aria-label', 'Dictate');
  go.innerHTML = IC.go; go.setAttribute('aria-label', 'Draw it');
  cmdCard.prepend(el('div', { class: 's-cmd' }, [cmd, mic, go]));
  sMain.append(card, strip, cmdCard);

  /* when the drawing is done: the surgical options, the buckle guide, the PNG and the review link, big and in reach.
     Under the summary on a phone; in the top bar on a computer. */
  const acts = el('section', { id: 'sActs', 'aria-label': 'Next steps', hidden: true });
  const actsHead = el('p', { class: 's-acts-h', text: 'Drawing done — next' });
  const actsGrid = el('div', { class: 's-acts-g' });
  const actBtn = (k, ic, label, sub, fn) => { const b = el('button', { type: 'button', class: 's-act a-' + k, 'data-k': k }); b.innerHTML = `<span class="sa-ic">${ic}</span><span class="sa-t"><b>${label}</b><small>${sub}</small></span>`; b.addEventListener('click', fn); return b; };
  const toCard = (id, cardSel) => { showSheet(id); const c = $(cardSel); if (c) setTimeout(() => c.scrollIntoView({ block: 'start', behavior: 'smooth' }), 280); };
  const aSurg = actBtn('surg', IC.scale, 'Surgical options', 'Where the evidence leans', () => showSheet('shRepair'));
  const aBuckle = actBtn('buckle', IC.ring, 'Buckle guide', 'Elements and placement', () => showSheet('shBuckle'));
  const aPng = actBtn('png', IC.dl, 'Save PNG', 'Download the drawing', () => X.exportPNG());
  const aRev = actBtn('rev', IC.review, 'Send for review', 'A link for a fellow or attending', () => toCard('shShare', '#reviewCard'));
  actsGrid.append(aSurg, aBuckle, aPng, aRev);
  acts.append(actsHead, actsGrid);
  sMain.insertBefore(acts, cmdCard);

  /* ------------------------------ the dock ------------------------------ */
  const dock = el('nav', { id: 'sDock', 'aria-label': 'Draw' });
  const laserSlot = el('div', { class: 's-laser' });
  const hintEl = $('#inkHint');
  const primary = el('div', { class: 's-primary' });
  const traceBtn = el('button', { type: 'button', class: 's-trace', id: 'sTrace' }); traceBtn.innerHTML = IC.trace + '<span>Trace the detachment</span>';
  const redrawBtn = el('button', { type: 'button', class: 's-trace s-half', id: 'sRedraw' }); redrawBtn.innerHTML = IC.redraw + '<span>Redraw</span>';
  const addRdBtn = el('button', { type: 'button', class: 's-trace s-half s-alt', id: 'sAddRd' }); addRdBtn.innerHTML = IC.plus + '<span>Add detachment</span>';
  const backBtn = el('button', { type: 'button', class: 's-trace s-alt', id: 'sBack', hidden: true }); backBtn.innerHTML = svg('<path d="M19 12H5M11 6l-6 6 6 6"/>') + '<span>Back to the fundus</span>';
  backBtn.addEventListener('click', () => X.setView('fundus'));
  primary.append(traceBtn, redrawBtn, addRdBtn, backBtn);
  const tools = el('div', { class: 's-tools' });
  const TOOLS = [['hst', 'Tear'], ['hole', 'Hole'], ['lat', 'Lattice'], ['laser', 'Laser']];
  for (const [k, name] of TOOLS) {
    const b = el('button', { type: 'button', 'data-k': k, 'aria-pressed': 'false', title: name }, [X.iconFor({ type: k, grade: 'C' }), el('span', { text: name })]);
    b.addEventListener('click', () => { if (hand.armedKind() === k) hand.stop(); else { showSheet(null); hand.armKind(k); } });
    tools.append(b);
  }
  const moreBtn = el('button', { type: 'button', class: 's-more', 'aria-label': 'All findings' }); moreBtn.innerHTML = IC.plus + '<span>More</span>';
  tools.append(moreBtn);
  dock.append(laserSlot, hintEl, primary, tools);
  traceBtn.addEventListener('click', () => { showSheet(null); hand.setTraceMode('add'); });
  redrawBtn.addEventListener('click', () => { showSheet(null); hand.setTraceMode('redraw'); });
  addRdBtn.addEventListener('click', () => { showSheet(null); hand.setTraceMode('add'); });

  /* ------------------------------ panels ------------------------------ */
  const sheet = (id, title, kids, opts) => {
    const s = el('section', { class: 'sheet' + (opts && opts.below ? ' below' : ''), id, 'aria-label': title || 'Panel' });
    s.append(el('div', { class: 'sh-grab', 'aria-hidden': 'true' }));
    if (title) {
      const h = el('div', { class: 'sh-head' }, [el('h3', { text: title }), el('button', { type: 'button', class: 'sh-close', text: 'Done', onclick: () => closeSheet() })]);
      s.append(h);
    }
    for (const k of kids) if (k) s.append(k);
    return s;
  };
  // the guide and the editor sit below the chart, so the chart is never covered
  const guideBody = el('div', { class: 's-guide' });
  const shGuide = sheet('shGuide', '', [guideBody], { below: true });
  const editBody = el('div', { class: 's-edit' });
  const shEdit = sheet('shEdit', '', [editBody], { below: true });
  // every finding, and the library search
  const parts = hand.parts;
  const moreBody = el('div', { class: 's-more-body' }, [parts.grid, parts.moreBox]);
  parts.moreBox.hidden = false;
  const shMore = sheet('shMore', 'Add a finding', [moreBody]);
  const detachBody = el('div', { class: 's-detach' });
  const shDetach = sheet('shDetach', 'Detachment', [detachBody]);
  const askBody = el('div', { class: 's-ask' });
  const shAsk = sheet('shAsk', 'PVD and lens', [askBody]);
  const shLincoff = sheet('shLincoff', 'Where is the primary break?', [$('#lincoffCard')]);
  const shRepair = sheet('shRepair', 'Surgical options', [$('#repairCard')]);
  const shBuckle = sheet('shBuckle', 'Scleral buckle guide', [$('#buckleCard')]);
  const shareGrid = el('div', { class: 's-grid3' });
  const gridBtn = (ic, label, fn, id) => { const b = el('button', { type: 'button', id: id || null }); b.innerHTML = ic + `<span>${label}</span>`; b.addEventListener('click', fn); return b; };
  shareGrid.append(
    gridBtn(IC.dl, 'Save PNG', () => { X.exportPNG(); }, 'sSavePng'),
    gridBtn(IC.copy, 'Copy note', (e) => { X.copyNote(); const s = e.currentTarget.querySelector('span'); s.textContent = 'Copied'; setTimeout(() => { s.textContent = 'Copy note'; }, 1400); }),
  );
  const shShare = sheet('shShare', 'Save and share', [shareGrid, $('#reviewCard')]);
  const menuGrid = el('div', { class: 's-grid3 s-menu' });
  const lincoffToggle = gridBtn(IC.find, 'Lincoff zone', () => { X.toggleLincoff(); }, 'sLincoffBtn');
  const poleToggle = gridBtn(IC.pole, 'Posterior pole', () => { X.setView(X.getView() === 'pole' ? 'fundus' : 'pole'); closeSheet(); }, 'sPoleBtn');
  menuGrid.append(
    gridBtn(IC.redo, 'Redo', () => { X.redo(); }, 'sRedoBtn'),
    lincoffToggle, poleToggle,
    gridBtn(IC.layout, 'Classic layout', () => { X.prefs.layout = 'classic'; X.save(); location.reload(); }),
  );
  const noteCard = $('#note').closest('.card'), findCard = $('#findings').closest('.card');
  const menuKids = [menuGrid, noteCard, findCard, ...[...consoleCol.children].filter(n => n !== cmdCard && n !== noteCard && n !== findCard), $('#chartFoot'), $('#intended')];
  const shMenu = sheet('shMenu', 'More', menuKids);
  const ver = $('#verLink'); if (ver) shMenu.querySelector('.sh-head h3').append(' ', ver);

  /* clear: one tap from the header, confirmed on a red card */
  const clearCard = el('div', { class: 's-confirm', id: 'sClearCard', role: 'alertdialog', 'aria-labelledby': 'sClearH', hidden: true }, [
    el('div', { class: 'cc-text' }, [el('b', { id: 'sClearH', text: 'Clear the drawing?' }), el('span', { text: 'Everything on the chart is removed. Undo brings it back.' })]),
    el('div', { class: 'acts' }, [
      el('button', { type: 'button', class: 'cc-yes', text: 'Clear', onclick: () => { clearCard.hidden = true; clearScrim.hidden = true; $('#clear').click(); } }),
      el('button', { type: 'button', class: 'cc-no', text: 'Keep', onclick: () => { clearCard.hidden = true; clearScrim.hidden = true; } }),
    ]),
  ]);
  const scrim = el('div', { id: 'sScrim', hidden: true });
  const clearScrim = el('div', { id: 'sClearScrim', hidden: true });
  clearScrim.addEventListener('click', () => { clearCard.hidden = true; clearScrim.hidden = true; });
  clearBtn.addEventListener('click', () => { showSheet(null); clearCard.hidden = false; clearScrim.hidden = false; setTimeout(() => clearCard.querySelector('.cc-no').focus({ preventScroll: true }), 30); });
  sApp.append(sTop, sMain, dock, scrim, clearScrim, clearCard, shGuide, shEdit, shMore, shDetach, shAsk, shLincoff, shRepair, shBuckle, shShare, shMenu);
  top.hidden = true; layout.hidden = true;
  const wn = $('#whatsNew'); if (wn) sApp.append(wn);

  /* ------------------------------ panel manager ------------------------------ */
  let openId = null;
  const desk = () => matchMedia('(min-width: 1000px)').matches;
  const isBelow = (id) => id === 'shGuide' || id === 'shEdit';
  function placeBelow() {
    const s = openId && isBelow(openId) ? $('#' + openId) : null;
    if (!s) return;
    if (desk()) { s.style.top = ''; return; }
    const r = stage.getBoundingClientRect();
    s.style.top = Math.round(Math.max(r.bottom, 160) + 6) + 'px';
  }
  new ResizeObserver(() => placeBelow()).observe(stage);
  window.addEventListener('scroll', () => { if (openId && isBelow(openId) && !desk() && window.scrollY) window.scrollTo(0, 0); }, { passive: true });
  function showSheet(id) {
    openId = id || null;
    if (id && isBelow(id)) { window.scrollTo(0, 0); }
    for (const s of $$('#sApp .sheet')) s.classList.toggle('open', s.id === id);
    document.body.classList.toggle('sheet-open', !!id);
    document.body.classList.toggle('below-open', !!id && isBelow(id));
    scrim.hidden = !id || isBelow(id) || desk();
    if (id && !isBelow(id)) $('#' + id).scrollTop = 0;
    if (id && isBelow(id)) { placeBelow(); requestAnimationFrame(placeBelow); }
    placeLaser();
  }
  function closeSheet() {
    const was = openId;
    if (was === 'shEdit' && hand.selectedId() != null) { hand.select(null); return; }      // onSelect closes it
    showSheet(null);
    syncGuide();
  }
  scrim.addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!clearCard.hidden) { clearCard.hidden = true; clearScrim.hidden = true; return; }
    if (openId && !isBelow(openId)) closeSheet();
  });
  shareBtn.addEventListener('click', () => showSheet(openId === 'shShare' ? null : 'shShare'));
  menuBtn.addEventListener('click', () => showSheet(openId === 'shMenu' ? null : 'shMenu'));
  moreBtn.addEventListener('click', () => { hand.stop(); showSheet('shMore'); });
  // picking a finding in the panel hands control back to the chart
  parts.grid.addEventListener('click', (e) => { const t = e.target.closest('.pal-tile'); if (t && t.getAttribute('aria-label') !== 'Other findings') setTimeout(() => showSheet(null), 0); });
  parts.moreBox.addEventListener('click', (e) => { if (e.target.closest('.pal-res')) setTimeout(() => showSheet(null), 0); });
  findCard.addEventListener('click', (e) => { if (e.target.closest('.f-title')) setTimeout(closeSheet, 0); });
  // the version chip and "All updates" open the update list in the menu
  const toUpdates = () => { showSheet('shMenu'); const u = $('#updates'); if (u) { u.open = true; setTimeout(() => u.scrollIntoView({ block: 'start', behavior: 'smooth' }), 280); } };
  if (ver) ver.addEventListener('click', (e) => { e.preventDefault(); toUpdates(); });
  if (wn) wn.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && /All updates/.test(b.textContent)) setTimeout(toUpdates, 0); });

  /* the laser pattern lives in the dock while laser is picked, and in the editor when a laser is selected.
     In the dock it folds to one line as soon as the chart is touched, so the whole fundus stays in view. */
  const laserSum = el('button', { type: 'button', class: 's-laser-sum', 'aria-expanded': 'true' });
  laserSlot.append(laserSum);
  laserSum.addEventListener('click', () => { laserSlot.classList.toggle('folded'); syncLaserSum(); });
  stage.addEventListener('pointerdown', () => { if (hand.armedKind() === 'laser') { laserSlot.classList.add('folded'); syncLaserSum(); } }, true);
  function syncLaserSum() {
    const p = hand.laserPattern ? hand.laserPattern() : null;
    const folded = laserSlot.classList.contains('folded');
    laserSum.setAttribute('aria-expanded', String(!folded));
    laserSum.innerHTML = `<span class="ls-k">Laser</span><span class="ls-v">${p ? RD.laserPatternText(p) : ''}</span><span class="ls-c">${folded ? 'Change' : 'Fold'}</span>`;
    laserSum.hidden = hand.armedKind() !== 'laser';
  }
  function placeLaser() {
    const box = parts.laserBox;
    const editingLaser = openId === 'shEdit' && (() => { const f = scene().findings.find(x => x.id === hand.selectedId()); return f && f.type === 'laser'; })();
    const target = editingLaser ? editBody.querySelector('.s-laser-edit') : laserSlot;
    if (target && box.parentNode !== target) target.append(box);
    syncLaserSum();
  }
  parts.laserBox.addEventListener('click', () => setTimeout(syncLaserSum, 0));

  /* ------------------------------ the dock's state ------------------------------ */
  function needBreak() {
    const sc = scene(), rd = RD.mainRd(sc);
    return !!rd && rd.cause !== 'exudative' && !sc.findings.some(f => RD.BREAK_TYPES.has(f.type));
  }
  function syncDock() {
    const sc = scene(), hasRd = !!RD.mainRd(sc), armed = hand.armedKind(), tm = hand.traceMode(), pole = X.getView() !== 'fundus';
    traceBtn.hidden = hasRd || pole; redrawBtn.hidden = !hasRd || pole; addRdBtn.hidden = !hasRd || pole; backBtn.hidden = !pole;
    redrawBtn.querySelector('span').textContent = RD.rdsOf(sc).length > 1 ? 'Redraw all' : 'Redraw';
    traceBtn.classList.toggle('glow', !hasRd && !tm && !armed);
    const nb = needBreak() && !armed && !tm;
    for (const b of tools.querySelectorAll('[data-k]')) {
      b.setAttribute('aria-pressed', String(armed === b.dataset.k));
      b.classList.toggle('glow', nb && (b.dataset.k === 'hst' || b.dataset.k === 'hole'));
      b.disabled = pole;
    }
    traceBtn.disabled = redrawBtn.disabled = addRdBtn.disabled = moreBtn.disabled = pole;
    dock.classList.toggle('pole', pole);
    empty.hidden = !!sc.findings.length || !!armed || !!tm || pole || !hintEl.hidden || !!cmd.value.trim();
  }

  /* ------------------------------ the summary strip ------------------------------ */
  const PVD_SHORT = { complete: 'PVD complete', partial: 'PVD partial', none: 'No PVD', yes: 'PVD' };
  const LENS_SHORT = { phakic: 'Phakic', pseudo: 'Pseudophakic', aphakic: 'Aphakic' };
  function chip(text, cls, onClick, title) { const b = el('button', { type: 'button', class: 's-chip' + (cls ? ' ' + cls : ''), title: title || null, text }); b.addEventListener('click', onClick); strip.append(b); return b; }
  function renderStrip() {
    strip.replaceChildren();
    const sc = scene(), rd = RD.mainRd(sc), rv = X.getReview();
    if (rv) chip('Teaching review', 'accent', () => showSheet('shShare'));
    if (rd) {
      const n = RD.rdsOf(sc).length;
      const mac = rd.total ? 'macula off' : (RD.macText(rd.macula, rd.fovea) || 'macula ?');
      chip(`${n > 1 ? n + ' detachments' : rd.total ? 'Total RD' : 'RD ' + RD.fmtHour(rd.start) + '–' + RD.fmtHour(rd.end)} · ${mac}`, /\?/.test(mac) ? 'quiet' : '', openDetach);
      if (rd.cause !== 'exudative') {
        const both = !!(sc.pvd && sc.lens);
        chip(`${sc.pvd ? PVD_SHORT[sc.pvd] || 'PVD' : 'PVD ?'} · ${sc.lens ? LENS_SHORT[sc.lens] : 'lens ?'}`, both ? '' : 'quiet', openAsk);
        const z = RD.lincoff(sc);
        if (z) chip(`Lincoff ${z.rule} · ${z.zones.map(q => RD.fmtHour(q.from) + '–' + RD.fmtHour(q.to)).join(', ')}`, z.breaks ? (z.consistent ? 'ok' : 'warn') : '', () => showSheet('shLincoff'), z.title);
      }
    }
    const pc = chip(X.getView() === 'pole' ? '← Fundus' : 'Posterior pole', 'quiet', () => X.setView(X.getView() === 'pole' ? 'fundus' : 'pole'));
    if (X.getView() === 'pole') { strip.prepend(pc); strip.scrollLeft = 0; }
  }

  /* ------------------------------ PVD and lens ------------------------------ */
  function openAsk() { renderAsk(); showSheet('shAsk'); }
  function renderAsk() {
    const sc = scene();
    askBody.replaceChildren(
      bigChoice('Is there a posterior vitreous detachment?', X.PVD_OPTS.map(([v, t]) => [v, t.replace(' PVD', '')]), sc.pvd === 'yes' ? 'complete' : sc.pvd, v => X.setMeta({ pvd: v })),
      bigChoice('Lens status', X.LENS_OPTS, sc.lens, v => X.setMeta({ lens: v })),
    );
  }
  function bigChoice(q, opts, value, pick) {
    const row = el('div', { class: 'flow-opts' });
    for (const [v, t] of opts) row.append(el('button', { type: 'button', class: 'word', 'aria-pressed': String(value === v), text: t, onclick: () => pick(value === v ? null : v) }));
    return el('div', { class: 's-q' }, [el('p', { class: 's-ql', text: q }), row]);
  }

  /* ------------------------------ the detachment ------------------------------ */
  function openDetach() { renderDetach(); showSheet('shDetach'); }
  function renderDetach() {
    const sc = scene();
    const rds = RD.rdsOf(sc);
    const kids = [];
    for (const rd of rds) kids.push(el('div', { class: 's-rd' }, [el('div', { class: 's-rd-h' }, [X.iconFor(rd), el('div', {}, [el('strong', { text: RD.findingTitle(rd, sc.eye) }), el('div', { class: 's-sub', text: X.findingSub(rd) })])]), X.buildEditor(rd)]));
    kids.push(el('div', { class: 's-acts' }, [
      el('button', { type: 'button', class: 'btn-line', text: rds.length > 1 ? 'Redraw all' : 'Redraw by hand', onclick: () => { showSheet(null); hand.setTraceMode('redraw'); } }),
      el('button', { type: 'button', class: 'btn-line', text: 'Add a detachment', onclick: () => { showSheet(null); hand.setTraceMode('add'); } }),
    ]));
    detachBody.replaceChildren(...kids);
  }

  /* ------------------------------ editing one finding ------------------------------ */
  const SIZEABLE = new Set(['hst', 'hole', 'oph', 'tuft', 'pav', 'vh']);
  function sizeable(f) {
    if (SIZEABLE.has(f.type)) return true;
    if (f.type === 'pvr') return (f.grade || 'C') === 'C' && ((f.pts && f.pts.length === 1) || (f.hours && f.hours.length === 1));
    if (f.type === 'laser' || f.type === 'cryo') return f.hour != null && !f.target && !f.line;
    if (f.type === 'cat') { const P = RD.catPlace(f, scene().eye); return !!P && !P.tum && !P.span && !(f.count > 1); }
    return false;
  }
  const sizeWord = (f) => { const s = f.size || 1; return ['hst', 'hole', 'oph'].includes(f.type) ? (s < 0.85 ? 'Small' : s >= 1.25 ? 'Large' : 'Medium') : (s < 0.85 ? 'Smaller' : s >= 1.25 ? 'Larger' : 'Usual size'); };
  function setSize(f, d) {
    const max = f.type === 'cat' ? 3 : f.type === 'vh' ? 2 : 2.5;
    const v = Math.round(Math.max(0.5, Math.min(max, (f.size || 1) + d)) * 20) / 20;
    X.editScene(f.id, (x) => { if (Math.abs(v - 1) < 0.001) delete x.size; else x.size = v; });
  }
  function renderEdit() {
    const sc = scene(), id = hand.selectedId(), f = sc.findings.find(x => x.id === id);
    if (!f) return;
    const act = document.activeElement;
    if (act && editBody.contains(act) && /INPUT|SELECT|TEXTAREA/.test(act.tagName)) return;     // never re-render under the cursor
    const kids = [];
    const [tName, ...tRest] = RD.findingTitle(f, sc.eye).split(' · ');
    kids.push(el('div', { class: 's-ed-h' }, [X.iconFor(f), el('div', { class: 's-ed-t' }, [el('strong', { text: tName }), el('div', { class: 's-sub', text: [tRest.join(' · '), X.findingSub(f)].filter(Boolean).join(' · ') })]),
      el('button', { type: 'button', class: 'mini danger', text: 'Delete', onclick: () => {
        const next = RD.clone(scene()); next.findings = next.findings.filter(x => x.id !== f.id && x.target !== f.id);
        hand.select(null); X.commit(next); X.toast(`Removed ${RD.findingTitle(f, sc.eye).split(' · ')[0].toLowerCase()} — Undo brings it back`);
      } }),
      el('button', { type: 'button', class: 'mini', text: 'Done', onclick: () => hand.select(null) })]));
    if (sizeable(f)) {
      kids.push(el('div', { class: 's-size' }, [el('span', { class: 's-ql', text: 'Size' }),
        el('div', { class: 'bs-row' }, [
          el('button', { type: 'button', 'aria-label': 'Smaller', text: '−', onclick: () => setSize(f, -0.1) }),
          el('output', { text: sizeWord(f) + ((f.size || 1) !== 1 ? ` · ${Math.round((f.size || 1) * 100)}%` : '') }),
          el('button', { type: 'button', 'aria-label': 'Larger', text: '+', onclick: () => setSize(f, 0.1) }),
        ])]));
    }
    if (f.type === 'laser') kids.push(el('div', { class: 's-laser-edit' }));
    const ed = X.buildEditor(f, { noSize: true });
    if (ed.childNodes.length) kids.push(ed);
    kids.push(el('p', { class: 's-tip', text: f.type === 'lat' || f.type === 'grt' || f.type === 'dia' ? 'On the chart: drag it to move, drag an end to resize, drag it off to remove.' : sizeable(f) ? 'On the chart: drag it to move, slide the lever beside it to resize, drag it off to remove.' : 'On the chart: drag it to move, or off the chart to remove.' }));
    editBody.replaceChildren(...kids);
    placeLaser();
  }

  /* ------------------------------ the guide ------------------------------ */
  // skipped steps belong to the drawing: Redraw keeps them, Undo after Clear brings them back with the detachment,
  // and a new drawing on a cleared chart starts the guide afresh
  const skips = new Map();
  let skipKey = null, skipCur = new Set(), emptied = false;
  const skip = { has: (k) => skipSet().has(k), add: (k) => skipSet().add(k) };
  function skipSet() {
    const rd = RD.mainRd(scene());
    if (rd && rd.id !== skipKey) { if (emptied) skipCur = skips.get(rd.id) || new Set(); skips.set(rd.id, skipCur); skipKey = rd.id; }
    if (rd) emptied = false;
    return skipCur;
  }
  function guideStep() {
    const sc = scene(), rd = RD.mainRd(sc);
    if (X.getReview() || !rd || rd.cause === 'exudative') return null;
    if (!sc.findings.some(f => RD.BREAK_TYPES.has(f.type))) return null;          // step 2 is the dock's hint
    if (!sc.pvd && !skip.has('pvd')) return 'pvd';
    if (!sc.lens && !skip.has('lens')) return 'lens';
    return null;
  }
  function renderGuide(step) {
    const sc = scene();
    const head = (n, title) => el('div', { class: 'flow-head' }, [el('div', {}, [el('div', { class: 'flow-step', text: `Step ${n} of 4` }), el('h3', { text: title })])]);
    const later = el('button', { type: 'button', class: 'flow-skip', text: 'Later', onclick: () => { skip.add('pvd'); skip.add('lens'); showSheet(null); syncActs(); } });
    let kids;
    if (step === 'pvd') kids = [head(3, 'Is there a posterior vitreous detachment?'), el('p', { text: 'It changes which repairs the evidence favours.' }),
      el('div', { class: 'flow-opts' }, X.PVD_OPTS.map(([v, t]) => el('button', { type: 'button', class: 'word', text: t.replace(' PVD', ''), onclick: () => X.setMeta({ pvd: v }) }))),
      el('div', { class: 'flow-acts' }, [el('button', { type: 'button', class: 'flow-skip', text: 'Not known — skip', onclick: () => { skip.add('pvd'); syncGuide(true); } }), later])];
    else if (step === 'lens') kids = [head(4, 'Lens status?'), el('p', { text: 'Phakic and pseudophakic eyes did differently in the repair trials.' }),
      el('div', { class: 'flow-opts' }, X.LENS_OPTS.map(([v, t]) => el('button', { type: 'button', class: 'word', text: t, onclick: () => X.setMeta({ lens: v }) }))),
      el('div', { class: 'flow-acts' }, [el('button', { type: 'button', class: 'flow-skip', text: 'Skip', onclick: () => { skip.add('lens'); syncGuide(true); } }), later])];
    guideBody.replaceChildren(el('div', { class: 'flow' }, kids));
  }
  let guideShown = null;
  function syncGuide(force) {
    const busy = hand.armedKind() || hand.traceMode() || hand.selectedId() != null || (openId && openId !== 'shGuide') || X.getView() !== 'fundus' || !clearCard.hidden;
    const st = busy ? null : guideStep();
    if (st) { if (force || st !== guideShown || openId !== 'shGuide') renderGuide(st); guideShown = st; if (openId !== 'shGuide') showSheet('shGuide'); }
    else { guideShown = null; if (openId === 'shGuide') showSheet(null); }
  }

  /* ------------------------------ hooks from hand.js ------------------------------ */
  H.onHint = () => syncDock();
  H.onArm = () => { if (hand.armedKind() !== 'laser') laserSlot.classList.remove('folded'); syncDock(); if ((hand.armedKind() || hand.traceMode()) && openId) showSheet(null); placeLaser(); if (!hand.armedKind() && !hand.traceMode()) syncGuide(); };
  H.onSelect = (id) => {
    if (id != null) { renderEdit(); showSheet('shEdit'); }
    else if (openId === 'shEdit') { showSheet(null); syncGuide(); }
  };
  H.onRd = () => syncDock();
  let lockT = 0;
  H.onLock = () => { for (const b of [redrawBtn, addRdBtn]) b.classList.add('glow'); clearTimeout(lockT); lockT = setTimeout(() => { for (const b of [redrawBtn, addRdBtn]) b.classList.remove('glow'); }, 3200); };

  /* everything is drawn by hand on the fundus: no switch to look for */
  hand.setOn(true, true);

  /* the actions: shown once the drawing is done, and lit up for a moment when it gets there */
  function drawingDone() {
    const sc = scene();
    if (!sc.findings.length) return false;
    const rd = RD.mainRd(sc);
    return !rd || rd.cause === 'exudative' || sc.findings.some(f => RD.BREAK_TYPES.has(f.type));
  }
  let wasDone = false, glowT = 0;
  function syncActs() {
    const sc = scene(), done = drawingDone(), rv = X.getReview();
    acts.hidden = !done && !rv;
    const O = RD.repairOptions(sc);
    aSurg.hidden = O.state !== 'ok';
    const BK = root.RDBuckle, P = BK ? BK.plan(sc) : null;
    aBuckle.hidden = !(sc.findings.some(f => f.type === 'buckle') || (P && P.state === 'ok' && (P.cand.sb || P.cand.ppvsb)));
    const reviewer = rv && rv.role === 'reviewer';
    aRev.querySelector('b').textContent = reviewer ? 'Send back' : rv ? 'Review' : 'Send for review';
    aRev.querySelector('small').textContent = reviewer ? 'Your corrections, as a link' : rv ? 'Changes and comments' : 'A link for a fellow or attending';
    actsGrid.dataset.n = String([aSurg, aBuckle, aPng, aRev].filter(b => !b.hidden).length);
    // lit when the drawing is done and the guide has finished asking
    const ready = done && openId !== 'shGuide';
    if (ready && !wasDone) { acts.classList.add('lit'); clearTimeout(glowT); glowT = setTimeout(() => acts.classList.remove('lit'), 5200); }
    if (!done) acts.classList.remove('lit');
    wasDone = ready || (done && wasDone);
    if (!done) wasDone = false;
  }
  function placeActs() {
    const want = desk() ? sTop : sMain;
    if (acts.parentNode === want) return;
    if (want === sTop) sTop.insertBefore(acts, sTop.querySelector('.s-gap')); else sMain.insertBefore(acts, cmdCard);
  }
  matchMedia('(min-width: 1000px)').addEventListener('change', placeActs);

  function sync() {
    if (!scene().findings.length) emptied = true;
    renderStrip();
    syncDock();
    const sc = scene();
    clearBtn.disabled = !sc.findings.length && !sc.pvd && !sc.lens;
    lincoffToggle.setAttribute('aria-pressed', String(!!sc.lincoff));
    poleToggle.querySelector('span').textContent = X.getView() === 'pole' ? 'Fundus view' : 'Posterior pole';
    if (openId === 'shEdit') { if (hand.selectedId() == null || !sc.findings.some(f => f.id === hand.selectedId())) showSheet(null); else renderEdit(); }
    if (openId === 'shAsk') renderAsk();
    if (openId === 'shDetach') { if (RD.rdsOf(sc).length) renderDetach(); else showSheet(null); }
    syncGuide();
    syncActs();
    placeLaser();
  }
  window.addEventListener('resize', () => { scrim.hidden = !openId || isBelow(openId) || desk(); placeBelow(); });
  placeActs();
  sync();
  return { sync, showSheet };
};
})(typeof window !== 'undefined' ? window : globalThis);
