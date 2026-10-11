/* R/D interface: dictation/typing, live interpretation, findings editor,
   clinical note, Lincoff analysis, undo/redo, export. */
(function () {
'use strict';
const RD = window.RD, R = window.RDRender, CR = window.RDCatRender;
const $ = (s) => document.querySelector(s);
const el = (tag, attrs, kids) => {
  const n = document.createElement(tag);
  for (const k in attrs || {}) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'text') n.textContent = attrs[k];
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== false) n.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
  }
  for (const c of [].concat(kids || [])) if (c != null) n.append(c);
  return n;
};
const store = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};

/* ------------------------------ state -------------------------------- */
const prefs = Object.assign({ eye: 'OS', claude: true }, store.get('rdraw.prefs') || {});
let view = 'fundus';          // 'fundus' | 'pole'
let poleHintShown = false;
let scene = store.get('rdraw.scene.v2');
let isExample = false;
if (!scene || !Array.isArray(scene.findings) || scene.v !== 2) { scene = exampleScene(prefs.eye); isExample = true; }
let undoStack = [], redoStack = [];
let previewScene = null, previewText = null, highlight = null;
// a teaching review in progress (resident's original, comments, who/what), kept apart from your own drawing
let review = null, commentArm = false, lastLink = null, draftCase = '';
(function restoreReview() {
  const saved = store.get('rdraw.review.v1');
  if (!saved || typeof saved !== 'object' || !saved.o) return;
  const r = RD.sanitizeReview(Object.assign({}, saved, { v: 1, st: 'reviewed', c: saved.c || saved.o }));
  if (!r) return;
  review = { st: saved.st === 'reviewed' ? 'reviewed' : 'submitted', role: saved.role === 'resident' ? 'resident' : 'reviewer', o: r.o, cm: r.cm, fb: r.fb, case: r.case, author: r.author, reviewer: r.reviewer, t: r.t, rt: r.rt, view: 'changes', stash: saved.stash ? RD.sanitizeScene(saved.stash) : null };
  scene = r.c; isExample = false;
})();
let hand = null;
let sample = null, downloads = null;
const canvas = $('#chart');
const input = $('#cmd');

function exampleScene(eye) {
  let s = RD.emptyScene(eye);
  for (const c of ['fovea splitting RRD from 10 to 5 with a horseshoe tear at 12', 'lattice from 7 to 8']) s = RD.applyActions(s, RD.parse(c, { eye }).actions).scene;
  return s;
}
function save() {
  if (review) store.set('rdraw.review.v1', { v: 1, st: review.st, role: review.role, o: review.o, c: scene, cm: review.cm, fb: review.fb, case: review.case, author: review.author, reviewer: review.reviewer, t: review.t, rt: review.rt, stash: review.stash });
  else if (!isExample) store.set('rdraw.scene.v2', scene);
  store.set('rdraw.prefs', prefs);
}
function commit(next) {
  undoStack.push(scene); if (undoStack.length > 120) undoStack.shift();
  redoStack = [];
  previewScene = null; previewText = null;          // a preview never outlives a change to the record
  scene = next; isExample = false;
  prefs.eye = scene.eye;
  save(); renderAll();
}
function undo() { if (!undoStack.length) return false; redoStack.push(scene); scene = undoStack.pop(); prefs.eye = scene.eye; save(); renderAll(); return true; }
function redo() { if (!redoStack.length) return false; undoStack.push(scene); scene = redoStack.pop(); prefs.eye = scene.eye; save(); renderAll(); return true; }

/* ------------------------------ render ------------------------------- */
let raf = 0;
function draw() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    const w = canvas.clientWidth || 600;
    const textScale = Math.max(1, Math.min(1.9, 560 / w));
    const showOriginal = !previewScene && review && review.view === 'original';
    const shown = previewScene || (showOriginal ? review.o : scene);
    const label = previewScene ? previewText : showOriginal ? (review.role === 'resident' ? 'YOUR ORIGINAL' : 'RESIDENT’S ORIGINAL') : null;
    try { R.render(canvas, shown, { preview: !!previewScene || showOriginal, previewText: label, highlight, textScale, view, review: reviewOverlay(showOriginal) }); }
    catch (e) { console.error(e); }
    if (hand) hand.drawInk();
  });
}
function renderAll() { draw(); renderFindings(); renderNote(); renderLincoff(); renderRepair(); renderEye(); renderTools(); renderKey(); renderReviewBar(); renderReview(); if (hand) hand.sync(); }

function renderEye() {
  document.querySelectorAll('.eye-switch button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.eye === scene.eye)));
}
function renderTools() {
  $('#undo').disabled = !undoStack.length;
  $('#redo').disabled = !redoStack.length;
  $('#clear').disabled = !scene.findings.length;
  $('#lincoffBtn').setAttribute('aria-pressed', String(!!scene.lincoff));
  $('#exampleFlag').hidden = !isExample;
  document.querySelectorAll('.view-switch button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.view === view)));
  $('#poleDot').hidden = !R.hasPosterior(scene) || view === 'pole';
  $('#lincoffBtn').disabled = view === 'pole';
  $('#chartFoot').textContent = view === 'pole'
    ? 'Posterior pole, enlarged: optic disc, macula (dashed circle) and fovea, with the vascular arcades.'
    : 'Clock hours as seen on the chart, 12 = superior. Inner dashed circle: equator · middle: ora serrata · outer band: pars plana.';
}
function setView(v) {
  view = v; highlight = null;
  renderTools(); draw();
  if (hand) hand.sync();
}

/* findings list with inline editing */
const GROUP = { rd: 0, chd: 1, grt: 2, hst: 2, dia: 2, oph: 2, hole: 2, lat: 3, pav: 3, tuft: 3, pvr: 4, vh: 4, laser: 5, cryo: 5, buckle: 5, cat: 6 };
const GROUP_IX = Object.fromEntries(RD.GROUPS.map(([g], i) => [g, i]));
const SITE_OPTS = [['', 'Typical site'], ['fovea', 'Fovea'], ['parafovea', 'Parafovea'], ['macula', 'Macula'], ['pole', 'Posterior pole'], ['arcade', 'Arcade'], ['disc', 'Optic disc'], ['ppa', 'Peripapillary'], ['pmb', 'Papillomacular'], ['mid', 'Mid-periphery'], ['equator', 'Equator'], ['periphery', 'Periphery'], ['ora', 'Ora serrata'], ['pars_plana', 'Pars plana'], ['vitreous', 'Vitreous']];
const catOf = (f) => f.type === 'cat' ? RD.CAT[f.key] : null;
const sortKey = (f) => { const E = catOf(f); return GROUP[f.type] * 1000 + (E ? (GROUP_IX[E.group] || 0) * 100 : 0); };
const STATUS_OPTS = [['', 'Macular status not recorded'], ['on', 'Macula on'], ['thr', 'Macula threatened'], ['offon', 'Macula off, fovea on'], ['fthr', 'Fovea threatened (fovea on)'], ['split', 'Fovea splitting'], ['off', 'Macula off']];
function statusKey(rd) {
  if (rd.fovea === 'split') return 'split';
  if (rd.fovea === 'thr') return 'fthr';
  if (rd.macula === 'off' && rd.fovea === 'on') return 'offon';
  if (rd.macula === 'off' || rd.fovea === 'off') return 'off';
  if (rd.macula === 'thr') return 'thr';
  if (rd.macula === 'on') return 'on';
  return '';
}
const STATUS_SET = { '': [null, null], on: ['on', 'on'], thr: ['thr', 'on'], offon: ['off', 'on'], fthr: ['off', 'thr'], split: ['off', 'split'], off: ['off', 'off'] };

function editScene(id, fn) {
  const next = RD.clone(scene);
  const f = next.findings.find(x => x.id === id);
  if (!f) return;
  fn(f, next);
  commit(next);
}
function hourInput(label, value, onChange) {
  const i = el('input', { type: 'number', min: '0.5', max: '12', step: '0.5', value: String(value) });
  i.addEventListener('change', () => { const v = parseFloat(i.value); if (isFinite(v) && v > 0 && v <= 12.99) onChange(RD.normHour(v)); else i.value = String(value); });
  return el('label', {}, [label, i]);
}
function select(label, opts, value, onChange) {
  const s = el('select', { 'aria-label': label });
  for (const [v, t] of opts) s.append(el('option', { value: v, text: t, selected: v === value }));
  s.addEventListener('change', () => onChange(s.value));
  return s;
}
function findingSub(f) {
  const s = [];
  const E = catOf(f);
  if (E) {
    const P = RD.catPlace(f, scene.eye);
    s.push(CR.codeText(E));
    if (P && P.auto && !P.post && E.site !== 'vitreous') s.push('typical location');
    return s.join(' · ');
  }
  if (f.type === 'rd') {
    if (f.path) s.push('hand-drawn');
    if (f.total) s.push('Total, macula off');
    else s.push(RD.macText(f.macula, f.fovea) || 'macular status not recorded');
    if (f.depth && f.depth !== 'normal') s.push(f.depth);
    if (f.extent && !f.macula) s.push('to ' + ({ arcade: 'the arcades', posteq: 'post-equatorial', eq: 'the equator', anteq: 'pre-equatorial' })[f.extent]);
    if (f.chronic) s.push('demarcation line');
  } else if (f.type === 'hst') {
    s.push(f.radial === 'post' ? 'posterior to the equator' : f.radial === 'ora' ? 'at the ora' : 'at the posterior vitreous base');
    if (f.rolled) s.push('rolled edges');
  } else if (f.type === 'laser' || f.type === 'cryo') {
    const t = f.target && scene.findings.find(x => x.id === f.target);
    if (t) s.push('around ' + RD.LABEL[t.type].toLowerCase() + ' at ' + RD.fmtHour(RD.findingHour(t)));
  } else if (f.type === 'pvr') {
    s.push({ A: 'vitreous haze, pigment clumps', B: 'rolled edges, retinal stiffness', C: 'full-thickness retinal folds' }[f.grade || 'C']);
  } else if (f.type === 'lat') {
    s.push(f.start != null ? RD.fmtSpan(RD.spanHours(f.start, f.end)) : '');
  }
  return s.filter(Boolean).join(' · ');
}
function iconFor(f) {
  if (f.type === 'cat' && RD.CAT[f.key]) return CR.swatch(el('canvas', { 'aria-hidden': 'true' }), RD.CAT[f.key]);
  const c = el('canvas', { width: 56, height: 56, 'aria-hidden': 'true' });
  const g = c.getContext('2d');
  g.scale(2, 2);
  const blue = '#2C66C4', red = '#D8423A';
  g.lineJoin = 'round'; g.lineCap = 'round';
  switch (f.type) {
    case 'rd': g.fillStyle = 'rgba(104,170,232,0.45)'; g.strokeStyle = blue; g.lineWidth = 1.8; g.beginPath(); g.moveTo(3, 6); g.quadraticCurveTo(14, 2, 25, 6); g.lineTo(25, 22); g.quadraticCurveTo(14, 14, 3, 22); g.closePath(); g.fill(); g.stroke(); break;
    case 'chd': g.fillStyle = 'rgba(150,98,52,0.3)'; g.strokeStyle = '#7A5536'; g.lineWidth = 1.6; g.beginPath(); g.arc(14, 16, 9, Math.PI, 0); g.closePath(); g.fill(); g.stroke(); break;
    case 'hst': case 'grt': g.fillStyle = red; g.strokeStyle = blue; g.lineWidth = 1.6; g.beginPath(); g.moveTo(7, 8); g.bezierCurveTo(6, 18, 9, 23, 14, 23); g.bezierCurveTo(19, 23, 22, 18, 21, 8); g.quadraticCurveTo(14, 5, 7, 8); g.fill(); g.stroke(); g.fillStyle = '#F3EEE4'; g.beginPath(); g.moveTo(10, 8); g.bezierCurveTo(10, 15, 12, 17, 14, 17); g.bezierCurveTo(16, 17, 18, 15, 18, 8); g.fill(); break;
    case 'dia': g.fillStyle = red; g.strokeStyle = blue; g.lineWidth = 1.6; g.beginPath(); g.arc(14, 30, 20, 1.15 * Math.PI, 1.85 * Math.PI); g.arc(14, 34, 20, 1.82 * Math.PI, 1.18 * Math.PI, true); g.closePath(); g.fill(); g.stroke(); break;
    case 'oph': case 'hole': g.fillStyle = red; g.strokeStyle = blue; g.lineWidth = 1.6; g.beginPath(); g.arc(14, 15, 6, 0, 7); g.fill(); g.stroke(); if (f.type === 'oph') { g.beginPath(); g.ellipse(21, 7, 3.4, 2.4, 0.4, 0, 7); g.fill(); g.stroke(); } break;
    case 'lat': case 'pav': g.strokeStyle = '#2B2F34'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(14, 14, 11, 5, -0.4, 0, 7); g.stroke(); g.save(); g.clip(); g.lineWidth = 0.8; for (let d = -14; d < 28; d += 3.5) { g.beginPath(); g.moveTo(d, 0); g.lineTo(d + 14, 28); g.stroke(); g.beginPath(); g.moveTo(d + 14, 0); g.lineTo(d, 28); g.stroke(); } g.restore(); break;
    case 'pvr': case 'tuft': g.strokeStyle = '#1D4C9C'; g.lineWidth = 1.5; for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; g.beginPath(); g.moveTo(14, 14); g.lineTo(14 + Math.cos(a) * 10, 14 + Math.sin(a) * 10); g.stroke(); } break;
    case 'vh': g.fillStyle = 'rgba(46,140,80,0.6)'; for (let i = 0; i < 26; i++) { g.beginPath(); g.arc(5 + (i * 37 % 19), 6 + (i * 53 % 17), 1.3, 0, 7); g.fill(); } break;
    case 'laser': g.fillStyle = '#3A2E28'; for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283; g.beginPath(); g.arc(14 + Math.cos(a) * 9, 14 + Math.sin(a) * 9, 1.7, 0, 7); g.fill(); } break;
    case 'cryo': g.fillStyle = 'rgba(70,52,40,0.55)'; for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283; g.beginPath(); g.ellipse(14 + Math.cos(a) * 8.5, 14 + Math.sin(a) * 8.5, 3.4, 2.5, a, 0, 7); g.fill(); } break;
    case 'buckle': g.strokeStyle = '#7A5536'; g.lineWidth = 5; g.globalAlpha = 0.5; g.beginPath(); g.arc(14, 14, 10, 0, 7); g.stroke(); break;
  }
  return c;
}
function renderFindings() {
  const list = $('#findings');
  list.replaceChildren();
  const items = scene.findings.slice().sort((a, b) => (sortKey(a) - sortKey(b)) || (a.id - b.id));
  $('#count').textContent = items.length ? `${items.length} item${items.length > 1 ? 's' : ''}` : '';
  if (!items.length) { list.append(el('li', { class: 'empty', text: 'Nothing drawn yet. Type or dictate a finding.' })); return; }
  for (const f of items) {
    const edit = el('div', { class: 'f-edit' });
    if (f.type === 'rd') {
      if (!f.total) {
        const unpath = (x) => { delete x.path; delete x.ring; delete x.island; delete x.aroundFovea; };
        edit.append(hourInput('From', f.start, v => editScene(f.id, x => { x.start = v; unpath(x); })));
        edit.append(hourInput('to', f.end, v => editScene(f.id, x => { x.end = v; unpath(x); })));
        edit.append(select('Macular status', STATUS_OPTS, statusKey(f), v => editScene(f.id, x => {
          [x.macula, x.fovea] = STATUS_SET[v];
          // the chart must show what the record says: a drawn border that disagrees gives way to the standard outline
          if (x.path && !RD.pathAgrees(x)) { unpath(x); toast('Switched to the standard outline to match the macular status — Undo restores your drawing'); }
        })));
        if (f.path) edit.append(el('button', { type: 'button', class: 'mini', text: 'Use standard shape', title: 'Replace the hand-drawn border with R/D’s standard outline for these clock hours and macular status', onclick: () => editScene(f.id, unpath) }));
      }
      edit.append(select('Height', [['shallow', 'Shallow'], ['normal', 'Standard'], ['bullous', 'Bullous']], f.depth || 'normal', v => editScene(f.id, x => { x.depth = v; })));
      const cb = el('input', { type: 'checkbox', checked: !!f.chronic });
      cb.addEventListener('change', () => editScene(f.id, x => { x.chronic = cb.checked; }));
      edit.append(el('label', {}, [cb, 'Chronic']));
    } else if (f.hour != null) {
      edit.append(hourInput('At', f.hour, v => editScene(f.id, x => { x.hour = v; })));
      if (f.type === 'hst' || f.type === 'oph' || f.type === 'hole') edit.append(select('Size', [['0.72', 'Small'], ['1', 'Medium'], ['1.45', 'Large']], String(f.size || 1), v => editScene(f.id, x => { x.size = parseFloat(v); })));
    } else if (f.start != null && !f.total) {
      edit.append(hourInput('From', f.start, v => editScene(f.id, x => { x.start = v; })));
      edit.append(hourInput('to', f.end, v => editScene(f.id, x => { x.end = v; })));
    }
    if (f.type === 'cat') {
      const P = RD.catPlace(f, scene.eye);
      edit.append(select('Where', SITE_OPTS, f.site || '', v => editScene(f.id, x => { if (v) x.site = v; else delete x.site; })));
      if (f.hour == null && f.start == null && P && !P.span) edit.append(hourInput('Clock', +(P.h || 12).toFixed(2), v => editScene(f.id, x => { x.hour = v; })));
      edit.append(select('Size', [['0.72', 'Small'], ['1', 'Medium'], ['1.45', 'Large']], String(f.size || 1), v => editScene(f.id, x => { x.size = parseFloat(v); })));
      if (P && P.post && view !== 'pole') edit.append(el('button', { type: 'button', class: 'mini', text: 'View enlarged', onclick: () => setView('pole') }));
    }
    if (f.type === 'pvr') edit.append(select('PVR grade', [['A', 'Grade A'], ['B', 'Grade B'], ['C', 'Grade C']], f.grade || 'C', v => editScene(f.id, x => { x.grade = v; })));
    const li = el('li', { class: 'f', tabindex: '0' }, [
      iconFor(f),
      el('div', {}, [el('div', { class: 'f-title', text: RD.findingTitle(f, scene.eye) }), el('div', { class: 'f-sub', text: findingSub(f) }), edit.childNodes.length ? edit : null]),
      el('button', { class: 'del', type: 'button', title: 'Remove', 'aria-label': 'Remove ' + RD.findingTitle(f, scene.eye), text: '×', onclick: () => {
        const next = RD.clone(scene);
        next.findings = next.findings.filter(x => x.id !== f.id && x.target !== f.id);
        commit(next); toast('Removed ' + RD.findingTitle(f, scene.eye).split(' · ')[0].toLowerCase());
      } }),
    ]);
    li.addEventListener('mouseenter', () => { highlight = f.id; draw(); });
    li.addEventListener('mouseleave', () => { highlight = null; draw(); });
    li.addEventListener('focusin', () => { highlight = f.id; draw(); });
    li.addEventListener('focusout', () => { highlight = null; draw(); });
    list.append(li);
  }
}
function renderNote() {
  const t = RD.clinicalNote(scene);
  $('#note').textContent = t;
  canvas.setAttribute('aria-label', 'Fundus chart. ' + t);
}
function renderLincoff() {
  const box = $('#lincoff');
  box.replaceChildren();
  const z = RD.lincoff(scene);
  const m0 = RD.mainRd(scene);
  if (!z && m0 && m0.cause === 'exudative') { box.append(el('p', { class: 'lin-text', text: 'This detachment is recorded as exudative. Lincoff’s rules locate the primary break in rhegmatogenous detachments, so no zone is shown.' })); return; }
  if (!z) { box.append(el('p', { class: 'lin-text', text: 'Draw a detachment and R/D will show where Lincoff’s rules place the primary break.' })); return; }
  const rd = RD.mainRd(scene);
  box.append(el('div', { class: 'lin-rule' }, [el('strong', { text: z.title }), z.pct ? el('span', { class: 'pct', text: z.pct + '% of cases' }) : null]));
  box.append(el('p', { class: 'lin-text', text: z.text }));
  if (!rd.total) {
    const zone = z.zoneText;
    if (z.breaks) box.append(el('p', { class: 'lin-verdict ' + (z.consistent ? 'good' : 'bad'), text: z.consistent ? `The ${z.hits.length > 1 ? 'breaks' : RD.LABEL[z.hits[0].type].toLowerCase()} you drew lie${z.hits.length > 1 ? '' : 's'} in the predicted zone (${zone}).` : `No drawn break lies in the predicted zone (${zone}). Look again there for the primary break.` }));
    if (z.zones[0].kind === 'triangle') box.append(el('p', { class: 'lin-text', text: 'Breaks near the ora need to be close to 12; posterior breaks can sit up to 1½ clock hours away.' }));
    else box.append(el('p', { class: 'lin-verdict', text: `Predicted zone: ${zone}.` }));
  }
  box.append(el('button', { type: 'button', class: 'btn-line', text: scene.lincoff ? 'Hide zone on chart' : 'Show zone on chart', onclick: toggleLincoff }));
}
function toggleLincoff() { const next = RD.clone(scene); next.lincoff = !next.lincoff; commit(next); }

/* --------------------------- interpretation --------------------------- */
function renderLive(parsed, opts) {
  opts = opts || {};
  const live = $('#live');
  live.replaceChildren();
  if (!parsed) return;
  if (opts.heard) live.append(el('div', { class: 'heard', text: '“' + opts.heard + '”' }));
  if (parsed.chips.length) {
    live.append(el('div', { class: 'live-head' }, [opts.committed ? 'Drawn' : 'Understood as', opts.via === 'claude' ? el('span', { class: 'via', text: 'interpreted by Claude' }) : null]));
    const chips = el('div', { class: 'chips' });
    for (const c of parsed.chips) chips.append(el('span', { class: 'chip k-' + c.k, text: c.t }));
    live.append(chips);
  }
  if (parsed.unknown && parsed.unknown.length && !opts.via) {
    const chips = el('div', { class: 'chips' });
    chips.append(el('span', { class: 'chip unknown', text: 'Not recognized: ' + parsed.unknown.slice(0, 6).join(', ') }));
    live.append(chips);
  }
  for (const w of (parsed.warnings || [])) live.append(el('div', { class: 'msg warn', text: w }));
  for (const w of (parsed.info || [])) live.append(el('div', { class: 'msg', text: w }));
  for (const n of (opts.notes || [])) live.append(el('div', { class: 'msg', text: n }));
  if (opts.thinking) live.append(el('div', { class: 'msg', text: 'Asking Claude to interpret this phrasing…' }));
  if (!parsed.chips.length && !opts.thinking && opts.committed) live.append(el('div', { class: 'msg warn', text: 'Nothing to draw from that. Try “RRD from 10 to 2 macula off with a tear at 12”.' }));
  // a detachment is on the chart but the vitreous status is not: ask for it here, where the clinician is working
  if (opts.committed && RD.mainRd(scene) && !scene.pvd && RD.mainRd(scene).cause !== 'exudative') live.append(askRow('Is there a posterior vitreous detachment?', true, PVD_OPTS, null, v => setMeta({ pvd: v }), 'ask'));
}
const PVD_OPTS = [['complete', 'Complete PVD'], ['partial', 'Partial PVD'], ['none', 'No PVD']];
const LENS_OPTS = [['phakic', 'Phakic'], ['pseudo', 'Pseudophakic'], ['aphakic', 'Aphakic']];
function askRow(q, need, opts, value, onPick, cls) {
  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': q });
  for (const [v, t] of opts) seg.append(el('button', { type: 'button', 'aria-pressed': String(value === v), text: t, onclick: () => onPick(value === v ? null : v) }));
  return el('div', { class: (cls || 'rep-q') + (need ? ' need' : '') }, [el('span', { class: 'q', text: q }), seg]);
}
function setMeta(m) {
  const next = RD.applyActions(scene, [Object.assign({ op: 'meta' }, m)]).scene;
  commit(next);
  const live = $('#live .ask');
  if (live && m.pvd !== undefined) live.replaceWith(el('div', { class: 'msg ok', text: m.pvd ? `Recorded: ${RD.PVD_TEXT[m.pvd]}.` : 'PVD status cleared.' }));
}

/* ------------------------------ repair options -------------------------- */
const TIER_TEXT = { favoured: 'Best supported', consider: 'Also reasonable', less: 'Less supported', pending: 'Needs the break located' };
function renderRepair() {
  const box = $('#repair');
  if (!box) return;
  box.replaceChildren();
  const O = RD.repairOptions(scene);
  if (O.state === 'none') { box.append(el('p', { class: 'lin-text', text: 'Draw or describe a detachment to see repair options weighed against the published evidence.' })); return; }
  if (O.state === 'exudative') { box.append(el('p', { class: 'lin-text', text: 'This detachment is recorded as exudative: treatment targets the cause, and the rhegmatogenous repair trials do not apply.' })); return; }
  if (!prefs.hcpAck) {
    // intended for clinicians only: the summary stays closed until the viewer confirms they are one
    box.append(el('div', { class: 'rep-gate' }, [
      el('p', { text: 'This section matches the drawing to published trials and cohorts of retinal detachment repair and shows what they found, with every source. It is for eye-care professionals and trainees, for education. It is not medical advice, not a recommendation for any patient, and not for patients deciding about their own care.' }),
      el('button', { type: 'button', class: 'btn-line', text: 'I’m an eye-care professional or trainee — show the evidence', onclick: () => { prefs.hcpAck = true; save(); renderRepair(); } }),
    ]));
    return;
  }
  box.append(el('div', { class: 'rep-ask' }, [
    askRow(scene.pvd ? 'Posterior vitreous detachment' : 'Is there a posterior vitreous detachment?', O.ask.pvd, PVD_OPTS.map(([v, t]) => [v, t.replace(' PVD', '')]), scene.pvd === 'yes' ? 'complete' : scene.pvd, v => setMeta({ pvd: v })),
    askRow(scene.lens ? 'Lens' : 'Lens status?', O.ask.lens, LENS_OPTS, scene.lens, v => setMeta({ lens: v })),
  ]));
  const facts = el('div', { class: 'chips rep-facts' });
  for (const t of O.facts) facts.append(el('span', { class: 'chip k-status', text: t }));
  box.append(facts);
  if (O.caveat) box.append(el('p', { class: 'msg warn', text: O.caveat }));
  const order = [];
  const num = (k) => { let i = order.indexOf(k); if (i < 0) { order.push(k); i = order.length - 1; } return i + 1; };
  const cite = (refs) => el('span', { class: 'rep-refs' }, refs.map(k => el('a', { href: 'https://doi.org/' + O.refs[k].doi, target: '_blank', rel: 'noopener', title: O.refs[k].cite, text: String(num(k)) })));
  const list = el('ol', { class: 'rep-list' });
  for (const o of O.options) {
    const label = o.excluded && !o.pending ? 'Not a candidate here' : TIER_TEXT[o.tier];
    const li = el('li', { class: 'rep-opt t-' + o.tier }, [el('div', { class: 'rep-h' }, [el('strong', { text: o.name }), el('span', { class: 'rep-tier', text: label })])]);
    if (o.why.length) {
      const w = el('ul', { class: 'rep-why' });
      for (const y of o.why) w.append(el('li', { class: y.sign > 0 ? 'pro' : y.sign < 0 ? 'con' : 'neu' }, [y.t, ' ', cite(y.refs)]));
      li.append(w);
    } else li.append(el('p', { class: 'rep-none', text: scene.lens && scene.pvd ? 'No specific evidence for or against with what is recorded.' : 'Nothing specific yet — record the lens and PVD status above.' }));
    list.append(li);
  }
  box.append(list);
  if (O.timing) box.append(el('p', { class: 'rep-timing' }, [el('strong', { text: 'Timing. ' }), O.timing.t, ' ', cite(O.timing.refs)]));
  const notes = el('details', { class: 'rep-more' }, [el('summary', { text: 'Tamponade and other notes' })]);
  for (const n of O.notes) notes.append(el('p', {}, [n.t, ' ', cite(n.refs)]));
  box.append(notes);
  const refs = el('ol', { class: 'lib-refs rep-reflist' });
  for (const k of order) {
    const r = O.refs[k];
    refs.append(el('li', {}, [r.cite + ' ', el('a', { href: 'https://doi.org/' + r.doi, target: '_blank', rel: 'noopener', text: 'doi:' + r.doi }), r.pmid ? ' · ' : null, r.pmid ? el('a', { href: `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`, target: '_blank', rel: 'noopener', text: 'PMID ' + r.pmid }) : null]));
  }
  box.append(el('details', { class: 'rep-more rep-how' }, [el('summary', { text: 'How this summary works, and its limits' }),
    el('ul', {}, [
      el('li', { text: 'Uses only what is on the chart: the detachment’s extent and macular status, breaks inside it and their clock positions, giant tears, dialyses, PVR grade C, vitreous haemorrhage, lens status and PVD.' }),
      el('li', { text: 'Does not consider age, refraction or axial length, the fellow eye, break size or number beyond their position, chronicity, choroidal detachment, prior surgery, ability to posture, or surgeon experience and resources.' }),
      el('li', { text: 'A fixed set of written rules weighs each cited study; there is no AI, and nothing leaves this device. Several sources are retrospective cohorts, whose results also reflect how surgeons chose procedures. Percentages describe the study populations, not this patient.' }),
      el('li', { text: 'Not designed for time-critical decisions. Read the sources and make the decision on your own examination and judgement.' }),
    ])]));
  box.append(el('details', { class: 'rep-more' }, [el('summary', { text: `Sources (${order.length}, each checked on PubMed)` }), refs]));
  box.append(el('p', { class: 'rep-disc', text: 'For education: what published trials and cohorts found in comparable eyes. Not medical advice and not a recommendation for this patient — the clinician’s examination and judgement decide.' }));
}

function previewActions(actions) { return actions.filter(a => !['undo', 'redo'].includes(a.op)); }
let previewTimer = 0;
function updatePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const text = input.value.trim();
    if (!text) { previewScene = null; renderLive(null); draw(); return; }
    const p = RD.parse(text, { eye: scene.eye });
    renderLive(p);
    const acts = previewActions(p.actions);
    previewScene = acts.length ? RD.applyActions(scene, acts).scene : null;
    previewText = null;
    draw();
  }, 180);
}

function needsClaude(p) {
  if (!sample || !prefs.claude) return false;
  const meaningful = p.unknown.filter(w => w.length > 2);
  return (!p.actions.length && meaningful.length > 0) || meaningful.length >= 2;
}
const CAT_IDS = RD.CATALOG.filter(e => !e.map).map(e => e.id).join(', ');
async function interpretWithClaude(text) {
  const T = RD.temporalHour(scene.eye);
  const summary = scene.findings.length ? scene.findings.map(f => RD.findingTitle(f, scene.eye)).join('; ') : 'empty chart';
  const prompt = [
    'You convert a retina specialist’s dictated or typed command into drawing actions for a retinal detachment chart.',
    `Clock hours 1–12 are as seen on the chart (12 = superior). Eye: ${scene.eye}; temporal retina is at ${T} o’clock, nasal at ${T === 3 ? 9 : 3}. Ranges run clockwise from start to end; use 10.5 for 10:30.`,
    `Current drawing: ${summary}.`,
    `Command: """${text}"""`,
    'Reply with only JSON of the form {"actions":[...]} using these shapes:',
    '{"op":"eye","eye":"OD"|"OS"}',
    '{"op":"add","f":{"type":"rd","start":10,"end":2,"total":false,"depth":"normal"|"bullous"|"shallow","extent":null|"arcade"|"posteq"|"eq"|"anteq","chronic":false}}',
    '{"op":"status","macula":"on"|"thr"|"off"|null,"fovea":"on"|"thr"|"split"|"off"|null}',
    '{"op":"add","f":{"type":"hst","hour":12,"size":1}} (horseshoe tear; size 0.72 small, 1.45 large; "radial":"post" if posterior)',
    '{"op":"add","f":{"type":"grt"|"dia"|"lat"|"chd"|"buckle","start":10,"end":2}} (giant tear, dialysis, lattice, choroidal detachment, segmental buckle)',
    '{"op":"add","f":{"type":"oph"|"hole"|"tuft"|"pav"|"vh","hour":5}} (operculated hole, atrophic hole, tuft, paving stone, vitreous hemorrhage)',
    '{"op":"add","f":{"type":"pvr","grade":"A"|"B"|"C","loc":"P"|"A","hours":[5]}}',
    '{"op":"add","f":{"type":"laser"|"cryo","around":"breaks"}} or with "hour" or "start"/"end"',
    '{"op":"add","f":{"type":"buckle","encircling":true}}',
    '{"op":"add","f":{"type":"rd","start":4,"end":8,"cause":"exudative"|"combined"|"schisis"}} (non-rhegmatogenous or combined detachments)',
    'Any other named finding uses the pathology catalogue: {"op":"add","f":{"type":"cat","key":"<id>","hour":2}} or with "start"/"end" for a span, "quad":"st"|"sn"|"it"|"in"|"s"|"i"|"t"|"n" for a quadrant, "site":"fovea"|"parafovea"|"macula"|"pole"|"arcade"|"disc"|"ppa"|"pmb"|"mid"|"equator"|"periphery"|"ora"|"pars_plana"|"vitreous", and "count":3 for several. Omit the position to use the finding’s typical location.',
    'Catalogue ids: ' + CAT_IDS + '.',
    '{"op":"rdmod","depth":"bullous","chronic":true,"extent":"arcade"}   {"op":"extend","to":6}',
    '{"op":"remove","type":"hst","hour":12}   {"op":"remove","type":"cat","key":"<id>"}   {"op":"remove","last":true}   {"op":"move","type":"hst","from":12,"to":1}',
    '{"op":"clear"}  {"op":"undo"}  {"op":"redo"}  {"op":"lincoff","on":true}',
    'Leave out anything that is not a drawable finding. Example: "mac off RRD 10-2, HST 12" → {"actions":[{"op":"add","f":{"type":"rd","start":10,"end":2}},{"op":"status","macula":"off","fovea":"off"},{"op":"add","f":{"type":"hst","hour":12}}]}',
  ].join('\n');
  try {
    const out = await sample.json(prompt, { modelTier: 'quick' });
    return RD.sanitizeActions(out && out.actions);
  } catch (e) {
    if (e && e.code === 'not_granted') { sample = null; $('#claudeOpt').hidden = true; }
    return null;
  }
}

async function run(text, heard) {
  clearTimeout(previewTimer);
  if (review && review.view === 'original') review.view = 'changes';
  text = (text || '').trim();
  if (!text) return;
  let parsed = RD.parse(text, { eye: scene.eye });
  let via = null;
  if (needsClaude(parsed)) {
    renderLive(parsed, { thinking: true, heard });
    const ai = await interpretWithClaude(text);
    if (ai && ai.length) { parsed = Object.assign({}, parsed, { actions: ai, chips: ai.map(a => RD.describeAction(a, scene.eye)).filter(Boolean), unknown: [], warnings: [] }); via = 'claude'; }
  }
  previewScene = null;
  let notes = [];
  const rest = [];
  for (const a of parsed.actions) {
    if (a.op === 'undo') { if (!undo()) notes.push('Nothing to undo.'); }
    else if (a.op === 'redo') { if (!redo()) notes.push('Nothing to redo.'); }
    else rest.push(a);
  }
  if (rest.length) {
    const out = RD.applyActions(scene, rest); notes = notes.concat(out.notes); commit(out.scene);
    const post = out.added.some(f => { if (f.type !== 'cat') return false; const P = RD.catPlace(f, scene.eye); return P && P.post; });
    if (post && view === 'fundus') notes.push('Drawn in the posterior pole — choose “Posterior pole” above the chart to see it enlarged.');
  }
  else draw();
  renderLive(parsed, { committed: true, via, notes, heard });
  $('#srStatus').textContent = parsed.chips.map(c => c.t).join(', ');
}

/* ------------------------------- voice -------------------------------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false;
function setMic(on) {
  listening = on;
  $('#mic').classList.toggle('listening', on);
  $('#mic').setAttribute('aria-pressed', String(on));
  $('#micLabel').textContent = on ? (voiceLocal ? 'Listening on this device… tap to stop' : 'Listening… tap to stop') : 'Dictate';
}
function scoreText(t) { const p = RD.parse(t, { eye: scene.eye }); return p.actions.length * 3 - p.unknown.length; }
/* keep dictation on the device when the browser can (recent Chrome on a computer): ask for on-device
   recognition, installing the English language pack once if needed; otherwise the browser's own service is used */
let localTried = false;
async function preferOnDevice(r) {
  try {
    if (!SR || typeof SR.available !== 'function') return false;
    const opts = { langs: ['en-US'], processLocally: true };
    let st = await SR.available(opts);
    if ((st === 'downloadable' || st === 'downloading') && typeof SR.install === 'function' && !localTried) {
      localTried = true;
      toast('Setting up on-device dictation — a one-time download');
      if (await SR.install(opts)) st = 'available';
    }
    if (st === 'available') { r.processLocally = true; return true; }
  } catch (e) { /* fall back to the browser's default recognition */ }
  return false;
}
let voiceLocal = false, voiceBusy = false;
async function startVoice() {
  if (!SR) { toast('Voice input needs Chrome, Edge or Safari. You can type instead.'); return; }
  if (voiceBusy) return;
  voiceBusy = true;
  rec = new SR();
  rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 4;
  voiceLocal = await preferOnDevice(rec);
  voiceBusy = false;
  if (!voiceLocal && !window.claude && !prefs.cloudVoiceNoted) {
    prefs.cloudVoiceNoted = true; save();
    toast('This browser may send dictation audio to its speech service to transcribe it — avoid patient identifiers.');
  }
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) {
        const alts = Array.from(res).map(a => a.transcript.trim()).filter(Boolean);
        alts.sort((a, b) => scoreText(b) - scoreText(a));
        const best = alts[0] || '';
        input.value = '';
        run(best, best);
      } else {
        input.value = res[0].transcript;
        updatePreview();
      }
    }
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
      setMic(false);
      toast(window.claude ? 'The microphone is blocked in this view. Open the R/D HTML file in Chrome to dictate — typing works here.' : 'Microphone access is blocked. Allow it for this page in your browser’s site settings.');
    } else if (voiceLocal && e.error === 'language-not-supported') {
      setMic(false); voiceLocal = false;
      toast('On-device dictation isn’t available for this setup — tap Dictate again to use the browser’s speech service.');
    } else if (e.error !== 'no-speech' && e.error !== 'aborted') toast('Voice input stopped: ' + e.error);
  };
  rec.onend = () => { if (listening) { try { rec.start(); } catch (_) { setMic(false); } } };
  try { rec.start(); setMic(true); } catch (e) { setMic(false); }
}
function stopVoice() { setMic(false); try { rec && rec.stop(); } catch (_) { /* already stopped */ } }

/* ------------------------------ export -------------------------------- */
/* the saved image: the fundus chart, plus (when used) the enlarged posterior pole and a key */
function keyItems(sc) {
  const seen = new Map();
  for (const f of sc.findings) {
    const E = f.type === 'cat' ? RD.CAT[f.key] : null;
    const id = E ? E.id : f.type + (f.type === 'chd' && f.hem ? 'h' : '') + (f.type === 'vh' && f.fresh ? 'f' : '');
    if (seen.has(id)) continue;
    seen.set(id, { f, E, name: E ? RD.catName(E) : (CORE_KEY[f.type] || RD.LABEL[f.type] || f.type), code: E ? CR.codeText(E) : (CORE_CODE[f.type] || '') });
  }
  return [...seen.values()];
}
const CORE_KEY = { rd: 'Retinal detachment', hst: 'Horseshoe tear', grt: 'Giant retinal tear', dia: 'Retinal dialysis', oph: 'Operculated hole', hole: 'Atrophic hole', lat: 'Lattice degeneration', pav: 'Paving-stone degeneration', tuft: 'Retinal tuft', pvr: 'PVR', laser: 'Laser retinopexy', cryo: 'Cryopexy', vh: 'Vitreous hemorrhage', buckle: 'Scleral buckle', chd: 'Choroidal detachment' };
const CORE_CODE = { rd: 'blue fill and outline', hst: 'red fill, blue outline', grt: 'red fill, blue outline', dia: 'red fill, blue outline', oph: 'red fill, blue outline', hole: 'red fill, blue outline', lat: 'black (attached) or blue (detached) cross-hatch', pav: 'black outline, red cross-hatch', tuft: 'short blue lines', pvr: 'blue star folds', laser: 'dark spots', cryo: 'dark scars', vh: 'green stipple', buckle: 'brown band', chd: 'brown outline' };

async function exportPNG() {
  const date = new Date();
  const ds = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const S = 820, dpr = 2;
  const main = document.createElement('canvas');
  R.render(main, scene, { dpr, caption: review ? `R/D · ${scene.eye}${review.case ? ' · ' + review.case : ''} · reviewed${review.reviewer ? ' by ' + review.reviewer : ''} · ${ds}` : `R/D · ${scene.eye} · ${ds}`, review: reviewOverlay(false) });
  const items = keyItems(scene);
  const pole = R.hasPosterior(scene);
  const side = items.length || pole;
  const W = side ? S + 420 : S;
  const c = document.createElement('canvas');
  c.width = W * dpr; c.height = S * dpr;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.fillStyle = '#F6F5F2'; g.fillRect(0, 0, W, S);
  g.drawImage(main, 0, 0, S, S);
  if (side) {
    let y = 0;
    if (pole) {
      const pc = document.createElement('canvas');
      R.render(pc, scene, { dpr, view: 'pole', size: 400 });
      g.drawImage(pc, S + 10, 10, 400, 400);
      y = 420;
    }
    g.fillStyle = '#FBFAF6'; roundRectPath(g, S + 10, y + 10, 400, S - y - 20, 18); g.fill();
    g.fillStyle = '#123F66'; g.font = '700 15px "Atkinson Hyperlegible", system-ui, sans-serif'; g.textBaseline = 'alphabetic';
    g.fillText('Key', S + 28, y + 38);
    g.font = '400 12px "Atkinson Hyperlegible", system-ui, sans-serif'; g.fillStyle = '#5B6773';
    g.fillText('Standard fundus colour code (CMS L33567, Appendix A)', S + 64, y + 38);
    let yy = y + 56;
    const room = Math.floor((S - yy - 24) / 34);
    for (const it of items.slice(0, room)) {
      const sw = document.createElement('canvas');
      if (it.E) CR.swatch(sw, it.E, { size: 26, dpr }); else { const ic = iconFor(it.f); sw.width = ic.width; sw.height = ic.height; sw.getContext('2d').drawImage(ic, 0, 0); }
      g.drawImage(sw, S + 26, yy, 26, 26);
      g.fillStyle = '#13324F'; g.font = '700 13px "Atkinson Hyperlegible", system-ui, sans-serif';
      g.fillText(fitText(g, it.name, 330), S + 62, yy + 11);
      g.fillStyle = '#5B6773'; g.font = '400 11.5px "Atkinson Hyperlegible", system-ui, sans-serif';
      g.fillText(fitText(g, it.code, 330), S + 62, yy + 25);
      yy += 34;
    }
    if (items.length > room) { g.fillStyle = '#5B6773'; g.fillText(`+ ${items.length - room} more`, S + 62, yy + 12); }
  }
  const name = `RD-${scene.eye}-${date.toISOString().slice(0, 10)}.png`;
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  if (!blob) { toast('Couldn’t create the image.'); return; }
  if (downloads) {
    try { const r = await downloads.save({ filename: name, data: blob }); if (r.status === 'saved') toast('Saved ' + name); }
    catch (e) { if (e && e.code !== 'declined') toast('Saving isn’t available here.'); }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function roundRectPath(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function fitText(g, t, w) { if (g.measureText(t).width <= w) return t; while (t.length > 3 && g.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; }

/* ---------------------------- teaching review ---------------------------- */
/* A resident sends a drawing to a fellow or attending inside a link — after the #, so it never reaches the
   web server. The reviewer corrects it with the normal tools (every change is tracked against the original),
   pins numbered comments, and sends a link back. Nothing is uploaded anywhere. */
const PUBLIC_URL = 'https://anthonyjohnob.github.io/R-D/';
function b64uEnc(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64uDec(str) { str = str.replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; const bin = atob(str); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
async function packReview(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'function') {
    try { const buf = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer(); return 'z' + b64uEnc(new Uint8Array(buf)); }
    catch (e) { /* send it uncompressed */ }
  }
  return 'j' + b64uEnc(bytes);
}
async function unpackReview(code) {
  try {
    if (!/^[zj][A-Za-z0-9_-]+$/.test(code) || code.length > 500000) return null;
    const bytes = b64uDec(code.slice(1));
    let text;
    if (code[0] === 'z') {
      if (typeof DecompressionStream !== 'function') return null;
      const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const parts = []; let n = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        n += value.length;
        if (n > 4e6) { reader.cancel(); return null; }      // refuse anything that inflates absurdly
        parts.push(value);
      }
      const all = new Uint8Array(n); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
      text = new TextDecoder().decode(all);
    } else text = new TextDecoder().decode(bytes);
    return RD.sanitizeReview(JSON.parse(text));
  } catch (e) { return null; }
}
function shareBase() { return document.querySelector('link[rel="manifest"]') && /^https?:$/.test(location.protocol) ? location.origin + location.pathname : PUBLIC_URL; }
async function makeLink(obj) { return shareBase() + '#r=' + await packReview(obj); }
async function deliverLink(url, who) {
  lastLink = url; renderReview();
  if (navigator.share && window.matchMedia && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title: 'R/D drawing for review', url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); toast(`Link copied — paste it into a message to ${who}`); }
  catch (e) { toast(`Copy the link below and send it to ${who}`); }
}
async function loadFromHash() {
  const m = /^#r=([A-Za-z0-9_-]+)$/.exec(location.hash || '');
  if (!m) return;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
  const r = await unpackReview(m[1]);
  if (!r) { toast('That review link is damaged or incomplete — ask for it to be sent again.'); return; }
  enterReview(r);
}
function enterReview(r) {
  const stash = review ? review.stash : (isExample ? null : RD.clone(scene));
  review = { st: r.st, role: r.st === 'reviewed' ? 'resident' : 'reviewer', o: r.o, cm: r.cm || [], fb: r.fb || '', case: r.case || '', author: r.author || '',
    reviewer: r.reviewer || (r.st === 'reviewed' ? '' : (prefs.myName || '')), t: r.t, rt: r.rt, view: 'changes', stash };
  scene = RD.clone(r.st === 'reviewed' ? r.c : r.o);
  undoStack = []; redoStack = []; previewScene = null; previewText = null; highlight = null; isExample = false;
  prefs.eye = scene.eye; lastLink = null; commentArm = false; view = 'fundus';
  save(); renderAll();
  toast(review.role === 'reviewer' ? 'Reviewing — your corrections are tracked against the original' : 'Review opened — corrections are marked on the chart');
  const card = $('#reviewCard'); if (card && card.scrollIntoView && window.innerWidth < 980) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function exitReview(keep) {
  if (!review) return;
  const next = keep === 'corrected' ? RD.clone(scene) : keep === 'original' ? RD.clone(review.o) : (review.stash || RD.emptyScene(prefs.eye));
  review = null; commentArm = false; lastLink = null;
  try { localStorage.removeItem('rdraw.review.v1'); } catch (e) { /* storage unavailable */ }
  scene = next; undoStack = []; redoStack = []; previewScene = null; previewText = null; isExample = false; prefs.eye = scene.eye;
  save(); renderAll();
}
function reviewOverlay(showOriginal) {
  if (!review || view !== 'fundus') return null;
  const pins = review.cm.map((c, i) => ({ n: i + 1, at: c.at }));
  if (showOriginal) return { pins };
  let diff = RD.diffScenes(review.o, scene);
  const ghost = diff.some(d => d.type === 'rd') && RD.rdsOf(review.o).length ? review.o : null;
  // the dashed ghost already shows how the detachment changed; a ring on it would only crowd the breaks
  if (ghost) diff = diff.filter(d => !(d.type === 'rd' && d.kind === 'changed'));
  return { diff, pins, ghost };
}
function fmtWhen(t) { return t ? new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; }
function linkField(url) {
  const i = el('input', { type: 'text', class: 'rv-link', readonly: true, value: url, 'aria-label': 'Review link' });
  i.addEventListener('focus', () => i.select());
  return el('div', { class: 'rv-linkrow' }, [i, el('span', { class: 'rv-len', text: `${Math.round(url.length / 100) / 10}k characters` })]);
}
function openLinkBox() {
  const inp = el('input', { type: 'text', class: 'rv-in', placeholder: 'Paste a review link', 'aria-label': 'Paste a review link', spellcheck: 'false', autocomplete: 'off' });
  const go = async () => {
    const m = /#r=([A-Za-z0-9_-]+)/.exec(inp.value.trim());
    if (!m) { toast('That isn’t an R/D review link.'); return; }
    const r = await unpackReview(m[1]);
    if (!r) { toast('That review link is damaged or incomplete.'); return; }
    enterReview(r);
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  return el('details', { class: 'rv-open' }, [el('summary', { text: 'Received a review link?' }), el('div', { class: 'rv-fields' }, [inp, el('button', { type: 'button', class: 'btn-line', text: 'Open', onclick: go })])]);
}
const KIND_TEXT = { added: 'Added', removed: 'Removed', changed: 'Changed' };
function renderReviewBar() {
  const bar = $('#reviewBar');
  if (!bar) return;
  bar.hidden = !review;
  bar.replaceChildren();
  if (!review) return;
  const isRev = review.role === 'reviewer';
  const who = isRev ? `Reviewing${review.case ? ' “' + review.case + '”' : ''}${review.author ? ' from ' + review.author : ''}` : `Review${review.reviewer ? ' by ' + review.reviewer : ''}${review.case ? ' · “' + review.case + '”' : ''}`;
  bar.append(el('div', { class: 'rb-who' }, [el('strong', { text: who }), el('span', { text: commentArm ? 'Tap the chart where the comment belongs' : isRev ? 'Your corrections are tracked against the original' : 'Corrections are marked on the chart' })]));
  const seg = el('div', { class: 'seg rb-seg', role: 'group', 'aria-label': 'Which drawing to show' });
  for (const [v, t] of [['changes', 'Corrected'], ['original', isRev ? 'Original' : 'Mine']]) seg.append(el('button', { type: 'button', 'aria-pressed': String(review.view === v), text: t, onclick: () => { review.view = v; commentArm = false; renderAll(); } }));
  bar.append(seg);
  if (isRev) bar.append(el('button', { type: 'button', class: 'mini', 'aria-pressed': String(commentArm), text: commentArm ? 'Cancel comment' : '+ Comment', onclick: () => { commentArm = !commentArm; review.view = 'changes'; if (view !== 'fundus') setView('fundus'); renderAll(); } }));
}
let exitConfirm = 0;
function renderReview() {
  const box = $('#review');
  if (!box) return;
  box.replaceChildren();
  $('#reviewCard').classList.toggle('active', !!review);
  if (!review) {
    $('#revH').textContent = 'Teaching review';
    $('#revCount').textContent = '';
    box.append(el('p', { class: 'rv-intro', text: 'Send this drawing to a fellow or attending. They correct it with the same tools and add comments, and the link they send back shows every change. The drawing travels inside the link — nothing is uploaded.' }));
    const name = el('input', { type: 'text', class: 'rv-in', placeholder: 'Your name or initials (optional)', value: prefs.myName || '', maxlength: '80', 'aria-label': 'Your name or initials' });
    name.addEventListener('input', () => { prefs.myName = name.value; save(); });
    const label = el('input', { type: 'text', class: 'rv-in', placeholder: 'Case label, e.g. “Case 3” — no patient identifiers', value: draftCase, maxlength: '80', 'aria-label': 'Case label' });
    label.addEventListener('input', () => { draftCase = label.value; });
    box.append(el('div', { class: 'rv-fields' }, [name, label]));
    box.append(el('div', { class: 'rv-actions' }, [el('button', { type: 'button', class: 'glass small', disabled: !scene.findings.length, text: 'Send for review', title: scene.findings.length ? 'Copy a link to this drawing' : 'Draw something first', onclick: async () => {
      deliverLink(await makeLink({ v: 1, st: 'submitted', o: RD.sanitizeScene(scene), case: label.value.trim(), author: name.value.trim(), t: Date.now() }), 'your reviewer');
    } })]));
    if (lastLink) box.append(linkField(lastLink));
    box.append(el('p', { class: 'rv-warn', text: 'Don’t put patient names, record numbers or dates of birth in the case label or comments.' }));
    box.append(openLinkBox());
    return;
  }
  const isRev = review.role === 'reviewer';
  const diff = RD.diffScenes(review.o, scene);
  $('#revH').textContent = isRev ? 'Reviewing a drawing' : 'Review of your drawing';
  $('#revCount').textContent = `${diff.length} change${diff.length === 1 ? '' : 's'} · ${review.cm.length} comment${review.cm.length === 1 ? '' : 's'}`;
  const meta = isRev ? [review.case && `“${review.case}”`, review.author && `from ${review.author}`, review.t && `sent ${fmtWhen(review.t)}`] : [review.case && `“${review.case}”`, review.reviewer && `reviewed by ${review.reviewer}`, review.rt && fmtWhen(review.rt)];
  if (meta.some(Boolean)) box.append(el('p', { class: 'rv-meta', text: meta.filter(Boolean).join(' · ') }));
  if (isRev) box.append(el('p', { class: 'rv-intro', text: 'Correct the drawing with any tool — dictation, the findings list or drawing by hand. Every change is listed here and marked on the chart; switch to “Original” to see what was sent.' }));
  else if (review.fb) box.append(el('blockquote', { class: 'rv-fb', text: review.fb }));

  // changes
  box.append(el('h3', { class: 'rv-h', text: 'Changes' }));
  const ul = el('ul', { class: 'rv-list' });
  for (const d of diff) {
    const li = el('li', { class: 'rv-ch k-' + d.kind }, [el('span', { class: 'rv-kind', text: KIND_TEXT[d.kind] }), el('span', { text: d.text })]);
    if (d.id && d.kind !== 'removed') {
      li.addEventListener('mouseenter', () => { highlight = d.id; draw(); });
      li.addEventListener('mouseleave', () => { highlight = null; draw(); });
    }
    ul.append(li);
  }
  if (!diff.length) ul.append(el('li', { class: 'empty', text: isRev ? 'No changes yet.' : 'No changes — the reviewer kept your drawing as it was.' }));
  box.append(ul);

  // comments
  box.append(el('h3', { class: 'rv-h', text: 'Comments' }));
  const cl = el('ol', { class: 'rv-cms' });
  review.cm.forEach((c, i) => {
    const on = c.f != null ? scene.findings.find(f => f.id === c.f) || review.o.findings.find(f => f.id === c.f) : null;
    const head = el('div', { class: 'rv-cm-h' }, [el('span', { class: 'rv-pin', text: String(i + 1) }), el('span', { class: 'rv-on', text: on ? RD.findingTitle(on, scene.eye) : 'On the chart' })]);
    if (isRev) {
      const ta = el('textarea', { rows: '2', placeholder: 'Comment for the resident', maxlength: '1000', 'aria-label': `Comment ${i + 1}` });
      ta.value = c.text || '';
      ta.addEventListener('input', () => { c.text = ta.value; save(); });
      head.append(el('button', { type: 'button', class: 'del', title: 'Delete comment', 'aria-label': `Delete comment ${i + 1}`, text: '×', onclick: () => { review.cm.splice(i, 1); save(); renderAll(); } }));
      cl.append(el('li', { class: 'rv-cm' }, [head, ta]));
    } else cl.append(el('li', { class: 'rv-cm' }, [head, el('p', { text: c.text || '(no text)' })]));
  });
  if (!review.cm.length) cl.append(el('li', { class: 'empty', text: isRev ? 'Tap “+ Comment”, then tap the chart where it belongs.' : 'No comments.' }));
  box.append(cl);
  if (isRev) box.append(el('button', { type: 'button', class: 'btn-line', text: commentArm ? 'Tap the chart where the comment belongs…' : '+ Add a comment on the chart', onclick: () => { commentArm = !commentArm; review.view = 'changes'; if (view !== 'fundus') setView('fundus'); renderAll(); } }));

  // the two notes side by side
  box.append(el('details', { class: 'rv-notes' }, [el('summary', { text: 'Clinical note: original and corrected' }),
    el('p', {}, [el('strong', { text: isRev ? 'Original: ' : 'Yours: ' }), RD.clinicalNote(review.o)]),
    el('p', {}, [el('strong', { text: 'Corrected: ' }), RD.clinicalNote(scene)])]));

  if (isRev) {
    const fb = el('textarea', { class: 'rv-fbin', rows: '3', placeholder: 'Overall feedback for the resident (optional)', maxlength: '4000', 'aria-label': 'Overall feedback' });
    fb.value = review.fb || '';
    fb.addEventListener('input', () => { review.fb = fb.value; save(); });
    const nm = el('input', { type: 'text', class: 'rv-in', placeholder: 'Your name, shown to the resident (optional)', value: review.reviewer || '', maxlength: '80', 'aria-label': 'Your name' });
    nm.addEventListener('input', () => { review.reviewer = nm.value; prefs.myName = nm.value; save(); });
    box.append(el('h3', { class: 'rv-h', text: 'Feedback' }), fb, el('div', { class: 'rv-fields' }, [nm]));
    const exit = el('button', { type: 'button', class: 'btn-line', text: exitConfirm > Date.now() ? 'Exit without sending? Click again' : 'Exit review', onclick: () => {
      if (exitConfirm > Date.now()) { exitConfirm = 0; exitReview(); toast('Review closed — your own drawing is back'); return; }
      exitConfirm = Date.now() + 4000; renderReview(); setTimeout(() => { if (exitConfirm && exitConfirm <= Date.now()) { exitConfirm = 0; renderReview(); } }, 4100);
    } });
    box.append(el('div', { class: 'rv-actions' }, [el('button', { type: 'button', class: 'glass small', text: 'Send back to resident', onclick: async () => {
      const cm = review.cm.filter(c => (c.text || '').trim());
      deliverLink(await makeLink({ v: 1, st: 'reviewed', o: review.o, c: RD.sanitizeScene(scene), cm, fb: (review.fb || '').trim(), case: review.case, author: review.author, reviewer: (review.reviewer || '').trim(), t: review.t, rt: Date.now() }), 'the resident');
      if (cm.length < review.cm.length) toast('Comments without text were left out of the link');
    } }), exit]));
    if (lastLink) box.append(linkField(lastLink));
  } else {
    box.append(el('div', { class: 'rv-actions' }, [
      el('button', { type: 'button', class: 'glass small', text: 'Keep the corrected drawing', onclick: () => { exitReview('corrected'); toast('The corrected drawing is now yours to keep editing'); } }),
      el('button', { type: 'button', class: 'btn-line', text: 'Keep my original', onclick: () => { exitReview('original'); toast('Your original drawing is back'); } }),
    ]));
  }
  box.append(el('p', { class: 'rv-warn', text: 'Links carry the drawing itself. Don’t include patient identifiers in labels or comments.' }));
}

/* ------------------------------ helpers ------------------------------- */
let toastTimer = 0;
function toast(t) { const n = $('#toast'); n.textContent = t; n.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => n.classList.remove('show'), 3200); }
async function copyNote() {
  const t = $('#note').textContent;
  try { await navigator.clipboard.writeText(t); toast('Note copied'); }
  catch (e) { const r = document.createRange(); r.selectNodeContents($('#note')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Note selected — press Ctrl+C to copy'); }
}

/* the standard colour code (CMS L33567 Appendix A), shown in the Colour code card */
const CODE = [
  ['#D8423A', 'Red', 'retinal arteries, haemorrhage, the inside of full-thickness breaks'],
  ['#2C66C4', 'Blue', 'detached retina, veins, outlines of breaks, lattice in detached retina, tufts and meridional folds (short lines)'],
  ['#E0AA10', 'Yellow', 'exudate, retinal oedema and ischaemic whitening, drusen and other deposits'],
  ['#2E9A55', 'Green', 'opacities in the media: vitreous haemorrhage, membranes, foreign bodies; green outline around red = blood in the vitreous'],
  ['#8A5A33', 'Brown', 'choroidal detachment, uveal pigment (naevus, melanoma), RPE changes'],
  ['#25282C', 'Black', 'lattice in attached retina, retinal pigment, the ora next to detached retina, treatment scars'],
  ['#7E4FC0', 'Purple', 'flat neovascularisation (NVE, NVD, CNV)'],
  ['#EE8A22', 'Orange', 'elevated neovascularisation and fibrovascular tissue'],
  ['#DE942A', 'Amber (R/D)', 'Lincoff zone — where the primary break is predicted'],
];
function renderKey() {
  const box = $('#key');
  if (!box) return;
  box.replaceChildren();
  const items = keyItems(scene);
  if (!items.length) { box.append(el('p', { class: 'empty', text: 'Nothing drawn yet — the key fills in as you draw.' })); return; }
  for (const it of items) {
    const sw = it.E ? CR.swatch(el('canvas', { 'aria-hidden': 'true' }), it.E) : iconFor(it.f);
    box.append(el('div', { class: 'key-row' }, [sw, el('div', {}, [el('div', { class: 'key-name', text: it.name }), el('div', { class: 'key-code', text: it.code })])]));
  }
}

/* ---------------------------- pathology library ------------------------- */
const LIB_PAGE = 14;
let libShown = LIB_PAGE;
const libIndex = RD.CATALOG.map(e => ({ E: e, hay: [e.name, e.id.replace(/_/g, ' '), ...(e.syn || [])].join(' | ').toLowerCase() }));
function libSearch(q, group) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  let list = libIndex.filter(x => (!group || x.E.group === group) && terms.every(t => x.hay.includes(t)));
  if (terms.length) {
    const ql = q.toLowerCase().trim();
    const score = (x) => { const n = x.E.name.toLowerCase(); return (n.startsWith(ql) ? 0 : (x.E.syn || []).includes(ql) ? 1 : n.includes(ql) ? 2 : 3); };
    list = list.slice().sort((a, b) => score(a) - score(b));
  } else list = list.slice().sort((a, b) => (GROUP_IX[a.E.group] - GROUP_IX[b.E.group]) || (a.E.ix - b.E.ix));
  return list.map(x => x.E);
}
function phraseFor(E) { return (E.match && E.match[0]) || RD.catName(E).toLowerCase(); }
function drawFromLibrary(E) {
  if (E.map) {
    // engine findings need a position — start the command for the clinician to finish
    input.value = phraseFor(E) + ' ';
    input.focus(); updatePreview();
    toast('Add a clock position, e.g. “at 12” or “from 10 to 2”, then press Enter');
    return;
  }
  const out = RD.applyActions(scene, [{ op: 'add', f: { type: 'cat', key: E.id } }]);
  commit(out.scene);
  const f = out.added[0], P = f && RD.catPlace(f, scene.eye);
  renderLive({ chips: [{ k: 'cat', t: RD.findingTitle(f, scene.eye) }], unknown: [], warnings: [] }, { committed: true, notes: out.notes });
  if (P && P.post && view === 'fundus') setView('pole');
  toast('Drew ' + RD.catName(E).toLowerCase() + ' at its typical location');
}
function libItem(E) {
  const sw = CR.swatch(el('canvas', { 'aria-hidden': 'true' }), E);
  const det = el('div', { class: 'lib-det', hidden: true });
  const head = el('button', { type: 'button', class: 'lib-head', 'aria-expanded': 'false' }, [
    sw, el('span', { class: 'lib-name' }, [RD.catName(E), el('span', { class: 'lib-code', text: CR.codeText(E) })]),
  ]);
  head.addEventListener('click', () => {
    const open = det.hidden;
    det.hidden = !open; head.setAttribute('aria-expanded', String(open));
    if (open && !det.childNodes.length) fillDetails(det, E);
  });
  const auto = E.map && E.map.type === 'auto';
  const actions = el('div', { class: 'lib-actions' }, [
    auto ? el('span', { class: 'lib-auto', text: 'Automatic' })
      : el('button', { type: 'button', class: 'mini', text: E.map ? 'Use phrase' : 'Draw', title: E.map ? 'Start a command with this finding' : 'Draw at its typical location', onclick: () => drawFromLibrary(E) }),
  ]);
  return el('li', { class: 'lib-item' }, [el('div', { class: 'lib-row' }, [head, actions]), det]);
}
function fillDetails(det, E) {
  const P = (t, v) => v ? el('p', {}, [el('strong', { text: t + ' ' }), v]) : null;
  det.append(
    P('', E.def),
    P('Where:', E.where),
    P('How it is drawn:', E.how),
    P('Colour code source:', E.src),
    E.size ? P('Typical size:', E.size) : null,
  );
  const say = (E.match && E.match.length ? E.match : E.syn || []).slice(0, 8);
  if (say.length) det.append(el('p', { class: 'lib-say' }, [el('strong', { text: 'Say: ' }), ...say.flatMap((w, i) => [i ? ' · ' : '', el('code', { text: w })])]));
  if (E.refs && E.refs.length) {
    const ol = el('ol', { class: 'lib-refs' });
    for (const r of E.refs) ol.append(el('li', {}, [
      r.title + (r.year ? ` (${r.year}) ` : ' '),
      el('a', { href: `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`, target: '_blank', rel: 'noopener', text: 'PMID ' + r.pmid }),
      r.doi ? ' · ' : null,
      r.doi ? el('a', { href: 'https://doi.org/' + r.doi, target: '_blank', rel: 'noopener', text: 'doi:' + r.doi }) : null,
    ]));
    det.append(el('p', { class: 'lib-refs-h' }, [el('strong', { text: 'PubMed' })]), ol);
  }
}
function renderLibrary() {
  const q = $('#libSearch').value, g = $('#libGroup').value;
  const list = libSearch(q, g);
  const ul = $('#libList');
  ul.replaceChildren();
  for (const E of list.slice(0, libShown)) ul.append(libItem(E));
  if (!list.length) ul.append(el('li', { class: 'empty', text: 'No match. Try a synonym or abbreviation (e.g. “BRVO”, “CWS”, “ERM”).' }));
  $('#libMore').hidden = list.length <= libShown;
  $('#libMore').textContent = `Show ${Math.min(LIB_PAGE * 2, list.length - libShown)} more of ${list.length - libShown}`;
  $('#libCount').textContent = `${list.length} of ${libIndex.length}`;
}

/* ------------------------------- wiring ------------------------------- */
input.addEventListener('input', updatePreview);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const t = input.value; input.value = ''; run(t); }
  else if (e.key === 'Escape') { input.value = ''; previewScene = null; renderLive(null); draw(); }
});
$('#go').addEventListener('click', () => { const t = input.value; input.value = ''; run(t); input.focus(); });
$('#mic').addEventListener('click', () => (listening ? stopVoice() : startVoice()));
$('#undo').addEventListener('click', undo);
$('#redo').addEventListener('click', redo);
$('#clear').addEventListener('click', () => { commit(RD.emptyScene(scene.eye)); toast('Chart cleared — Undo brings it back'); });
$('#startBlank').addEventListener('click', () => { commit(RD.emptyScene(scene.eye)); input.focus(); });
$('#lincoffBtn').addEventListener('click', toggleLincoff);
$('#export').addEventListener('click', exportPNG);
$('#copy').addEventListener('click', copyNote);
$('#claudeToggle').addEventListener('change', (e) => { prefs.claude = e.target.checked; save(); });
document.querySelectorAll('.eye-switch button').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.eye === scene.eye) return;
  const next = RD.clone(scene); next.eye = b.dataset.eye; commit(next);
}));
document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z' && (document.activeElement !== input || !input.value)) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (e.key === '/' && document.activeElement !== input && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); }
});
const lg = $('#legend');
for (const [c, name, what] of CODE) lg.append(el('div', { class: 'lg' }, [el('span', { class: 'sw', style: `background:${c}` }), el('span', {}, [el('strong', { text: name + ' ' }), what])]));
const lgSel = $('#libGroup');
lgSel.append(el('option', { value: '', text: 'All groups' }));
for (const [g, label] of RD.GROUPS) { const n = libIndex.filter(x => x.E.group === g).length; if (n) lgSel.append(el('option', { value: g, text: `${label} (${n})` })); }
let libTimer = 0;
$('#libSearch').addEventListener('input', () => { clearTimeout(libTimer); libTimer = setTimeout(() => { libShown = LIB_PAGE; renderLibrary(); }, 120); });
lgSel.addEventListener('change', () => { libShown = LIB_PAGE; renderLibrary(); });
$('#libMore').addEventListener('click', () => { libShown += LIB_PAGE * 2; renderLibrary(); });
const nRefs = new Set(RD.CATALOG.flatMap(e => (e.refs || []).map(r => r.pmid))).size;
$('#libIntro').textContent = `${libIndex.length} drawable findings, each with its colour code, definition and PubMed sources (${nRefs} papers in all). Say a name or abbreviation in the command box, or draw one from here.`;
renderLibrary();
document.querySelectorAll('.view-switch button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
$('#claudeToggle').checked = prefs.claude !== false;
if (!SR) $('#micLabel').textContent = 'Dictate';

// capabilities available inside the Claude viewer
if (window.claude && typeof window.claude.use === 'function') {
  window.claude.use('sample').then(s => { if (s) { sample = s; $('#claudeOpt').hidden = false; } }).catch(() => {});
  window.claude.use('downloads').then(d => { downloads = d || null; if (!d) $('#export').hidden = true; }).catch(() => { $('#export').hidden = true; });
}

// compile the pathology phrase matcher while the page is idle, so the first command is instant
(window.requestIdleCallback || ((fn) => setTimeout(fn, 300)))(() => { try { RD.parse('warm up', { eye: scene.eye }); } catch (e) { /* ignore */ } });

// placing a review comment: the next tap on the chart drops a numbered pin
canvas.addEventListener('pointerdown', (e) => {
  if (!commentArm || !review || view !== 'fundus') return;
  e.preventDefault(); e.stopImmediatePropagation();
  const r = canvas.getBoundingClientRect(), G = RD.G;
  const p = [((e.clientX - r.left) / r.width) * G.SIZE - G.SIZE / 2, ((e.clientY - r.top) / r.height) * G.SIZE - G.SIZE / 2];
  let near = null, bd = 34;
  for (const f of scene.findings) { const a = RD.findingAnchor(f, scene); if (!a) continue; const d = Math.hypot(a[0] - p[0], a[1] - p[1]); if (d < bd) { bd = d; near = f; } }
  const c = { at: [Math.round(p[0]), Math.round(p[1])], text: '' };
  if (near) c.f = near.id;
  review.cm.push(c); commentArm = false;
  save(); renderAll();
  const tas = document.querySelectorAll('#review .rv-cm textarea'); if (tas.length) tas[tas.length - 1].focus();
}, { capture: true });

// drawing by hand on the chart (hand.js)
if (window.RDHand) {
  hand = window.RDHand({
    el, iconFor, toast,
    getScene: () => scene, getView: () => (review && review.view === 'original' ? 'original' : view), commit,
    setPreview(s, text) { previewScene = s || null; previewText = s ? (text || null) : null; draw(); },
    setHighlight(id) { highlight = id; draw(); },
    libSearch: (q) => libSearch(q, ''),
    announce(chips, notes) { renderLive({ chips, unknown: [], warnings: [] }, { committed: true, notes }); },
    setMeta,
    getPref: (k) => prefs[k], setPref(k, v) { prefs[k] = v; save(); },
  });
}

// re-render when web fonts arrive so chart labels use them
if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
window.addEventListener('resize', draw);
renderAll();
loadFromHash();
window.addEventListener('hashchange', loadFromHash);
})();
