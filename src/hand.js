/* R/D hand drawing. Trace a detachment's posterior border with a finger, stylus or mouse, then swipe
   toward the detached side (or tap it). A small palette then offers tears, lattice and the other common
   findings: drag one onto the fundus, or tap it and tap the spot. Anything drawn can be dragged to move
   it, a span's ends dragged to resize it, and anything dragged off the chart is removed.
   Geometry lives in core.js (prepareStroke / pickPathSide / rdFromPath); this file is the interaction. */
(function (root) {
'use strict';
root.RDHand = function (api) {
  const RD = root.RD;
  const { G } = RD;
  const el = api.el;
  const $ = (s) => document.querySelector(s);
  const chart = $('#chart'), ink = $('#ink'), stage = $('#stage'), hint = $('#inkHint'), pal = $('#palette'), fab = $('#palFab'), btn = $('#handBtn');

  // breaks first: once a detachment is outlined, finding its break is the next job
  const BREAK_TILES = [
    ['hst', 'Horseshoe tear', 'Tear'], ['hole', 'Atrophic hole', 'Hole'], ['oph', 'Operculated hole', 'Operc. hole'], ['dia', 'Dialysis', 'Dialysis'], ['grt', 'Giant retinal tear', 'Giant tear'],
  ];
  const OTHER_TILES = [
    ['lat', 'Lattice', 'Lattice'], ['tuft', 'Tuft', 'Tuft'], ['pav', 'Paving stone', 'Paving'], ['pvr', 'PVR star fold', 'Star fold'], ['vh', 'Vitreous haemorrhage', 'VH'],
    ['laser', 'Laser', 'Laser'], ['cryo', 'Cryo', 'Cryo'], ['more', 'Other findings', 'More…'],
  ];
  const BREAK_KINDS = new Set(BREAK_TILES.map(t => t[0]));
  const SPAN = { lat: 1, grt: 3, dia: 1.5 };          // default extent in clock hours when tapped rather than dragged
  const SITE_SHORT = { disc: 'disc', ppa: 'peripapillary', fovea: 'fovea', parafovea: 'parafovea', macula: 'macula', pole: 'posterior pole', mid: 'mid-periphery', equator: 'equator', periphery: 'periphery', ora: 'ora', pars_plana: 'pars plana' };

  let on = false;
  let phase = 'idle';   // idle | tracing | side | swiping | armed | placing | spanning | moving | resizing | dragNew
  let pid = null;       // the pointer being followed (a second finger is ignored)
  let stroke = [];
  let prep = null, choice = null, gStart = null;
  let armed = null;     // { kind, label, E, extra }
  let selected = null;
  let drag = null;
  let hover = null;
  let ghost = null;
  let palPlaced = false;
  let ghostKind = null;
  let traceMode = null;     // once a detachment is drawn it is locked: 'redraw' or 'add' unlocks one new trace
  let lockShown = false;

  /* ------------------------------ geometry ------------------------------ */
  const rect = () => chart.getBoundingClientRect();
  const toChart = (e) => { const r = rect(); return [((e.clientX - r.left) / r.width) * G.SIZE - G.SIZE / 2, ((e.clientY - r.top) / r.height) * G.SIZE - G.SIZE / 2]; };
  const unit = () => G.SIZE / (rect().width || G.SIZE);           // chart units per CSS pixel
  const hourOf = (p) => RD.angleToHour(Math.atan2(p[1], p[0]));
  const qh = (h) => RD.normHour(Math.round(h * 4) / 4);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const atR = (r, h) => RD.polar(r, RD.hourToAngle(h));
  const sameChoice = (a, b) => !!a && !!b && a.dir === b.dir && a.inside === b.inside;
  const active = () => on && api.getView() === 'fundus';

  /* --------------------------------- ink -------------------------------- */
  function drawInk() {
    const r = rect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
    if (ink.width !== W || ink.height !== H) { ink.width = W; ink.height = H; }
    const g = ink.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!active()) return;
    const k = (r.width / G.SIZE) * dpr;
    g.setTransform(k, 0, 0, k, (G.SIZE / 2) * k, (G.SIZE / 2) * k);
    const u = unit();
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (phase === 'tracing' && stroke.length > 1) {
      line(g, stroke); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 6 * u; g.stroke();
      line(g, stroke); g.strokeStyle = '#2C66C4'; g.lineWidth = 3.2 * u; g.stroke();
    }
    if ((phase === 'side' || phase === 'swiping') && prep) {
      line(g, prep.pts, prep.closed); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 5.5 * u; g.stroke();
      line(g, prep.pts, prep.closed); g.setLineDash([8 * u, 6 * u]); g.strokeStyle = '#2C66C4'; g.lineWidth = 2.8 * u; g.stroke(); g.setLineDash([]);
      sideArrows(g, u);
    }
    if (placingBreak() && !api.getScene().lincoff) lincoffZone(g, u);
    if (phase === 'lasering' && stroke.length > 1) {
      for (const [x, y] of RD.laserLineSpots(stroke, laserOpt)) {
        if (Math.hypot(x, y) > G.R_ORA - 3) continue;
        g.fillStyle = 'rgba(176,138,96,0.45)'; g.beginPath(); g.arc(x, y, 3.1, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#3A2E28'; g.beginPath(); g.arc(x, y, 1.7, 0, Math.PI * 2); g.fill();
      }
    }
    if (hover && (phase === 'armed' || phase === 'placing' || phase === 'dragNew' || (phase === 'lasering' && stroke.length < 3))) crosshair(g, hover, u);
    if (phase === 'spanning' && drag) spanPreview(g, u);
    if (selected != null && !(drag && drag.off)) handles(g, u);
    if (drag && drag.off && drag.at) offMarker(g, drag.at, u);
  }
  /* while a break is being placed, shade where Lincoff's rules put the primary break */
  function placingBreak() {
    const k = phase === 'dragNew' ? ghostKind : armed ? armed.kind : null;
    return !!k && BREAK_KINDS.has(k);
  }
  function lincoffZone(g, u) {
    const z = RD.lincoff(api.getScene());
    if (!z) return;
    for (const zz of z.zones) {
      const p = new Path2D(), a1 = RD.hourToAngle(zz.from), a2 = a1 + RD.spanHours(zz.from, zz.to) * Math.PI / 6;
      if (zz.kind === 'triangle') { const T = RD.lincoffTriangle(); p.moveTo(T.apex[0], T.apex[1]); p.lineTo(T.a[0], T.a[1]); p.arc(0, 0, T.rb, a1, a2); p.closePath(); }
      else { p.arc(0, 0, G.R_ORA - 2, a1, a2); p.arc(0, 0, G.R_EQ - 40, a2, a1, true); p.closePath(); }
      g.fillStyle = 'rgba(232,160,48,0.16)'; g.fill(p);
      g.save(); g.setLineDash([6 * u, 4 * u]); g.strokeStyle = 'rgba(214,140,30,0.85)'; g.lineWidth = 1.8 * u; g.stroke(p); g.restore();
    }
    const zz = z.zones[0], [lx, ly] = atR(G.R_EQ - 72, zz.kind === 'triangle' ? 12 : RD.midHour(zz.from, zz.to));
    pill(g, lx, ly, 'Lincoff zone', u, '#B5711A');
  }
  function distToLine(p, pts) {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy || 1;
      const t = clamp(((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L, 0, 1);
      best = Math.min(best, Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy));
    }
    return best;
  }
  const inOra = (q) => { const r = Math.hypot(q[0], q[1]), lim = G.R_ORA - 4; const k = r > lim ? lim / r : 1; return [Math.round(q[0] * k * 10) / 10, Math.round(q[1] * k * 10) / 10]; };
  function line(g, pts, closed) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); if (closed) g.closePath(); }
  function pill(g, x, y, text, u, color) {
    g.font = `700 ${12.5 * u}px "Atkinson Hyperlegible", system-ui, sans-serif`;
    const w = g.measureText(text).width + 14 * u, h = 22 * u;
    g.fillStyle = 'rgba(255,253,248,0.96)'; g.strokeStyle = color || '#2C66C4'; g.lineWidth = 1.2 * u;
    g.beginPath(); g.roundRect ? g.roundRect(x - w / 2, y - h / 2, w, h, h / 2) : g.rect(x - w / 2, y - h / 2, w, h); g.fill(); g.stroke();
    g.fillStyle = color || '#123F66'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y + 0.5 * u);
  }
  /* two arrows across the stroke's most posterior point: which side is detached? */
  function sideArrows(g, u) {
    const pts = prep.pts;
    let i = 0, best = Infinity;
    const n = pts.length;
    for (let j = 2; j < n - 2; j++) { const r = Math.hypot(pts[j][0], pts[j][1]); if (r < best) { best = r; i = j; } }
    if (prep.closed) i = 0;
    const a = pts[(i - 2 + n) % n], b = pts[(i + 2) % n], m = pts[i];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;
    const sh = choice ? RD.pathShape(choice) : null;
    for (const s of [1, -1]) {
      const tip = [m[0] + nx * s * 46 * u, m[1] + ny * s * 46 * u], tail = [m[0] + nx * s * 12 * u, m[1] + ny * s * 12 * u];
      const lit = sh ? RD.pathField(tip[0], tip[1], sh).v < 0 : true;
      const col = sh ? (lit ? '#2C66C4' : 'rgba(110,124,138,0.55)') : '#E0763A';
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 3 * u;
      g.beginPath(); g.moveTo(tail[0], tail[1]); g.lineTo(tip[0], tip[1]); g.stroke();
      const hx = nx * s, hy = ny * s;
      g.beginPath(); g.moveTo(tip[0] + hx * 9 * u, tip[1] + hy * 9 * u); g.lineTo(tip[0] - hy * 7 * u, tip[1] + hx * 7 * u); g.lineTo(tip[0] + hy * 7 * u, tip[1] - hx * 7 * u); g.closePath(); g.fill();
    }
  }
  function crosshair(g, p, u) {
    const r = Math.hypot(p[0], p[1]);
    if (r > G.R_CB + 20) return;
    g.strokeStyle = '#E0763A'; g.lineWidth = 2 * u;
    g.beginPath(); g.arc(p[0], p[1], 11 * u, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(p[0] - 16 * u, p[1]); g.lineTo(p[0] - 6 * u, p[1]); g.moveTo(p[0] + 6 * u, p[1]); g.lineTo(p[0] + 16 * u, p[1]);
    g.moveTo(p[0], p[1] - 16 * u); g.lineTo(p[0], p[1] - 6 * u); g.moveTo(p[0], p[1] + 6 * u); g.lineTo(p[0], p[1] + 16 * u); g.stroke();
    const site = RD.siteAt(p, api.getScene().eye);
    pill(g, p[0], p[1] - 30 * u, `${RD.fmtHour(qh(hourOf(p)))} · ${SITE_SHORT[site] || site}`, u, '#9A4E1C');
  }
  function spanArc(d) {
    const s = d.cw ? d.h0 : d.h1, e = d.cw ? d.h1 : d.h0;
    return { s: qh(s), e: qh(e) };
  }
  function spanPreview(g, u) {
    if (!drag.span) return;
    const { s, e } = drag.span;
    const r = drag.rEnd;
    const a1 = RD.hourToAngle(s), a2 = a1 + RD.spanHours(s, e) * 30 * RD.DEG;
    g.strokeStyle = 'rgba(224,118,58,0.85)'; g.lineWidth = 14 * u; g.lineCap = 'round';
    g.beginPath(); g.arc(0, 0, r, a1, a2); g.stroke();
    const m = atR(r - 34 * u, RD.midHour(s, e));
    pill(g, m[0], m[1], `${RD.fmtHour(s)}–${RD.fmtHour(e)}`, u, '#9A4E1C');
  }
  function handles(g, u) {
    const live = drag && drag.pf && drag.id === selected;
    const sc = live ? drag.psc : api.getScene();
    const f = live ? drag.pf : sc.findings.find(x => x.id === selected);
    if (!f) return;
    const H = hitInfo(f, sc);
    if (H && H.tum) {
      const c = H.pts[0], er = RD.ellipseR(H.tum.rx, H.tum.ry, -H.tum.rot), q = [c[0] + er, c[1]];
      g.setLineDash([5 * u, 4 * u]); g.strokeStyle = 'rgba(224,118,58,0.8)'; g.lineWidth = 1.6 * u;
      g.beginPath(); g.ellipse(c[0], c[1], H.tum.rx + 3 * u, H.tum.ry + 3 * u, H.tum.rot, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#FFFFFF'; g.strokeStyle = '#E0763A'; g.lineWidth = 2.2 * u;
      g.beginPath(); g.arc(q[0], q[1], 7 * u, 0, Math.PI * 2); g.fill(); g.stroke();
      if (drag && drag.end === 'rim') { const t = RD.tumorSize(f, true); if (t) pill(g, c[0], c[1] - H.tum.ry - 22 * u, t, u, '#9A4E1C'); }
      else if (!drag) { const t = RD.tumorSize(f, true) || 'drag the edge to size'; pill(g, c[0], c[1] - H.tum.ry - 22 * u, t, u, '#9A4E1C'); }
      return;
    }
    if (H && H.line) {
      g.save(); g.setLineDash([5 * u, 4 * u]); g.strokeStyle = 'rgba(224,118,58,0.85)'; g.lineWidth = 2 * u;
      line(g, H.line); g.stroke(); g.restore();
      const m = H.line[Math.floor(H.line.length / 2)];
      if (!drag) pill(g, m[0], m[1] - 24 * u, 'drag to move · off the chart to remove', u, '#9A4E1C');
      return;
    }
    const L0 = sizeLever(f, sc);
    if (L0) {
      const L = drag && drag.end === 'lever' && drag.lever ? Object.assign({}, drag.lever, { c: L0.c, ext: L0.ext }) : L0;
      root.RDHand.lever = { x: L.x, y0: L.y0, y1: L.y1, min: L.min, max: L.max };       // for the browser checks
      g.setLineDash([5 * u, 4 * u]); g.strokeStyle = 'rgba(224,118,58,0.8)'; g.lineWidth = 1.6 * u;
      g.beginPath(); g.arc(L.c[0], L.c[1], L.ext + 3 * u, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      // the track, filled up to the current size
      const w = 9 * u, ky = leverY(L, f.size || 1), y1 = leverY(L, 1);
      const rr = (x, y, ww, hh, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, ww, hh, r); else g.rect(x, y, ww, hh); };
      g.fillStyle = 'rgba(255,253,248,0.96)'; g.strokeStyle = '#E0763A'; g.lineWidth = 1.6 * u;
      rr(L.x - w / 2, L.y0, w, L.y1 - L.y0, w / 2); g.fill(); g.stroke();
      g.fillStyle = 'rgba(224,118,58,0.35)'; rr(L.x - w / 2 + 1.5 * u, ky, w - 3 * u, L.y1 - ky - 1.5 * u, (w - 3 * u) / 2); g.fill();
      // the usual size, and which way is bigger
      g.strokeStyle = 'rgba(154,78,28,0.75)'; g.lineWidth = 1.4 * u;
      g.beginPath(); g.moveTo(L.x - w, y1); g.lineTo(L.x + w, y1); g.stroke();
      g.fillStyle = '#9A4E1C'; g.font = `700 ${13 * u}px "Atkinson Hyperlegible", system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('+', L.x, L.y0 - 10 * u); g.fillText('−', L.x, L.y1 + 10 * u);
      // the knob
      g.fillStyle = '#FFFFFF'; g.strokeStyle = '#E0763A'; g.lineWidth = 2.4 * u;
      g.beginPath(); g.arc(L.x, ky, 11 * u, 0, Math.PI * 2); g.fill(); g.stroke();
      g.strokeStyle = '#C2571F'; g.lineWidth = 1.5 * u;
      g.beginPath(); for (const dy of [-3, 0, 3]) { g.moveTo(L.x - 5 * u, ky + dy * u); g.lineTo(L.x + 5 * u, ky + dy * u); } g.stroke();
      const tx = L.x;
      if (drag && drag.end === 'lever') pill(g, tx, L.y0 - 30 * u, sizeText(f), u, '#9A4E1C');
      else if (!drag) pill(g, tx, L.y0 - 30 * u, 'size', u, '#9A4E1C');
      return;
    }
    if (!H || !H.span) return;
    for (const h of H.span) {
      const c = atR(H.rEnd, h);
      g.fillStyle = '#FFFFFF'; g.strokeStyle = '#E0763A'; g.lineWidth = 2.2 * u;
      g.beginPath(); g.arc(c[0], c[1], 8 * u, 0, Math.PI * 2); g.fill(); g.stroke();
    }
  }
  function offMarker(g, p, u) {
    g.strokeStyle = '#D8423A'; g.lineWidth = 2.4 * u;
    g.beginPath(); g.arc(p[0], p[1], 14 * u, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(p[0] - 6 * u, p[1] - 6 * u); g.lineTo(p[0] + 6 * u, p[1] + 6 * u); g.moveTo(p[0] + 6 * u, p[1] - 6 * u); g.lineTo(p[0] - 6 * u, p[1] + 6 * u); g.stroke();
    pill(g, clamp(p[0], -G.SIZE / 2 + 80 * u, G.SIZE / 2 - 80 * u), clamp(p[1] - 30 * u, -G.SIZE / 2 + 16 * u, G.SIZE / 2 - 16 * u), 'Release to remove', u, '#B5302A');
  }

  /* -------------------------------- hints ------------------------------- */
  function setHint(text, cancel) {
    hint.hidden = !text;
    hint.querySelector('.t').textContent = text || '';
    hint.querySelector('button').hidden = !cancel;
  }
  function idleHint() {
    if (!active()) { setHint(''); return; }
    const sc = api.getScene(), hasRd = !!RD.mainRd(sc);
    const needBreak = hasRd && !pal.hidden && !sc.findings.some(f => RD.BREAK_TYPES.has(f.type));
    if (traceMode) { setHint(traceMode === 'redraw' ? 'Trace the new border, ora to ora — it replaces the old one' : 'Trace the next detachment’s border, ora to ora', true); return; }
    setHint(needBreak ? `Now add the break${pal.classList.contains('docked') ? ' — pick one below' : ' — pick one in the panel'}` : hasRd ? 'Drag a finding to move it · off the chart to remove' : 'Trace the detachment’s border, ora to ora');
  }
  function cancel() {
    if (traceMode) { traceMode = null; renderRdBar(); }
    if (phase === 'side' || phase === 'swiping') { prep = null; choice = null; api.setPreview(null); }
    if (drag) api.setPreview(null);
    disarm(true);
    phase = 'idle'; drag = null; stroke = []; pid = null;
    idleHint(); drawInk();
  }
  hint.querySelector('button').addEventListener('click', cancel);

  /* ------------------------------ hit testing --------------------------- */
  function hitInfo(f, sc) {
    switch (f.type) {
      case 'hst': case 'hole': case 'oph': case 'tuft': case 'pav': return { pts: [atR(RD.radiusFor(f), f.hour)], r: 18 * Math.max(1, f.size || 1) };
      case 'laser': case 'cryo':
        if (Array.isArray(f.line) && f.line.length > 1) return { line: f.line, r: 12 };
        return f.hour != null && !f.target ? { pts: [atR(f.r != null ? f.r : G.TEAR_R, f.hour)], r: 26 * Math.max(1, f.size || 1) } : null;
      case 'vh': return { pts: [atR(f.r != null ? f.r : (G.R_EQ + G.R_ORA) / 2 - 12, f.hour)], r: 40 * Math.max(1, f.size || 1) };
      case 'pvr': { const pts = Array.isArray(f.pts) ? f.pts : (f.hours || []).map(h => atR(G.R_EQ - 34, h)); return pts.length === 1 ? { pts, r: 18 * Math.max(1, f.size || 1) } : null; }
      case 'lat': { const rL = f.r != null ? f.r : f.radial === 'post' ? G.R_EQ - 12 : G.LATTICE_R; return { span: [f.start, f.end], r0: rL - 18, r1: rL + 18, rEnd: rL }; }
      case 'grt': case 'dia': return { span: [f.start, f.end], r0: G.R_ORA - 52, r1: G.R_ORA + 8, rEnd: G.R_ORA - 22 };
      case 'cat': {
        const P = RD.catPlace(f, sc.eye);
        if (P && P.tum && !(f.count > 1) && !f.multi) return { pts: [[P.x, P.y]], r: Math.max(12, Math.max(P.tum.rx, P.tum.ry)), tum: P.tum };
        if (!P || P.span || (P.site === 'disc' && RD.DISC_RECIPES.has(P.E.r))) return null;
        return { pts: [[P.x, P.y]], r: Math.max(12, 10 * (P.k || 1)) };
      }
    }
    return null;
  }
  /* a finding drawn at one spot can be made larger or smaller with a handle on its edge */
  const SIZE_MIN = 0.5;
  const sizeMax = (f) => f.type === 'cat' ? 3 : f.type === 'vh' ? 2 : 2.5;
  function extentOf(f, H) {
    const s = f.size || 1;
    switch (f.type) {
      case 'hst': return 16 * s;
      case 'hole': return 5 * s + 3;
      case 'oph': return 15 * s;
      case 'tuft': return 6 * s + 2;
      case 'pav': return 13 * s;
      case 'pvr': return 15 * s;
      case 'vh': return 44 * s;
      case 'laser': case 'cryo': return 22 * s;
      case 'cat': return H.r;
    }
    return H.r;
  }
  /* a vertical lever beside the selected finding: push the knob up to enlarge, down to shrink */
  function sizeLever(f, sc) {
    if (!f || f.type === 'rd') return null;
    const H = hitInfo(f, sc);
    if (!H || !H.pts || H.tum || H.pts.length !== 1) return null;
    if (f.type === 'pvr' && (f.grade || 'C') !== 'C') return null;
    const u = unit(), c = H.pts[0], ext = Math.max(extentOf(f, H), 7 * u);
    const half = G.SIZE / 2, len = 124 * u, gx = ext + 30 * u;
    const yc = clamp(c[1], -half + len / 2 + 18 * u, half - len / 2 - 18 * u), y0 = yc - len / 2, y1 = yc + len / 2;
    // beside the finding, on whichever side is clear of the chart's edge and the panel
    const pr = !pal.hidden && !pal.classList.contains('docked') ? palChartRect() : null;
    const blocked = (x) => Math.abs(x) > half - 24 * u || (pr && x > pr[0] - 24 * u && x < pr[2] + 24 * u && y1 > pr[1] - 30 * u && y0 < pr[3] + 30 * u);
    let x = c[0] + gx; if (blocked(x) && !blocked(c[0] - gx)) x = c[0] - gx;
    return { c, ext, x, y0, y1, min: SIZE_MIN, max: sizeMax(f) };
  }
  function palChartRect() {
    const r = rect(), q = pal.getBoundingClientRect(), k = G.SIZE / (r.width || G.SIZE);
    return [(q.left - r.left) * k - G.SIZE / 2, (q.top - r.top) * k - G.SIZE / 2, (q.right - r.left) * k - G.SIZE / 2, (q.bottom - r.top) * k - G.SIZE / 2];
  }
  const leverY = (L, s) => L.y1 - (clamp(s, L.min, L.max) - L.min) / (L.max - L.min) * (L.y1 - L.y0);
  const leverSize = (L, y) => Math.round((L.min + clamp((L.y1 - y) / (L.y1 - L.y0), 0, 1) * (L.max - L.min)) * 20) / 20;
  function sizeText(f) {
    const s = f.size || 1;
    if (['hst', 'hole', 'oph'].includes(f.type)) return s < 0.85 ? 'Small' : s >= 1.25 ? 'Large' : 'Medium';
    return s < 0.85 ? 'Smaller than usual' : s >= 1.25 ? (s >= 1.9 ? 'Much larger' : 'Larger than usual') : 'Usual size';
  }
  function hitTest(p) {
    const sc = api.getScene(), u = unit(), r = Math.hypot(p[0], p[1]), h = hourOf(p);
    let best = null, bs = Infinity;
    // the selected finding's size lever comes first
    if (selected != null) {
      const sf = sc.findings.find(x => x.id === selected), L = sizeLever(sf, sc);
      if (L && Math.abs(p[0] - L.x) < 22 * u && p[1] > L.y0 - 18 * u && p[1] < L.y1 + 18 * u) return { f: sf, end: 'lever', lever: L };
    }
    for (const f of sc.findings) {
      const H = hitInfo(f, sc);
      if (!H) continue;
      if (H.tum) {
        // the edge of a tumour (a ring a finger wide) resizes it; anywhere inside moves it
        const c = H.pts[0], d = dist(p, c), a = Math.atan2(p[1] - c[1], p[0] - c[0]);
        const er = RD.ellipseR(H.tum.rx, H.tum.ry, a - H.tum.rot), band = Math.max(7 * u, Math.min(12 * u, er * 0.35));
        if (er >= 12 * u && Math.abs(d - er) < band && 0.3 < bs) { bs = 0.3; best = { f, end: 'rim' }; }
        else if (d < Math.max(er, 14 * u) && d / Math.max(er, 14 * u) < bs) { bs = d / Math.max(er, 14 * u); best = { f }; }
      } else if (H.pts) {
        for (const c of H.pts) { const rr = Math.max(H.r, 14 * u), d = dist(p, c); if (d < rr && d / rr < bs) { bs = d / rr; best = { f }; } }
      } else if (H.line) {
        const rr = Math.max(H.r, 12 * u), d = distToLine(p, H.line);
        if (d < rr && 0.9 * d / rr < bs) { bs = 0.9 * d / rr; best = { f }; }
      } else {
        for (const [end, hh] of [['start', H.span[0]], ['end', H.span[1]]]) {
          const c = atR(H.rEnd, hh), rr = 13 * u + 4, d = dist(p, c);
          if (d < rr && 0.5 * d / rr < bs) { bs = 0.5 * d / rr; best = { f, end }; }
        }
        if (r >= H.r0 - 4 * u && r <= H.r1 + 4 * u && RD.inSpan(h, H.span[0], H.span[1], 0.05) && 0.95 < bs) { bs = 0.95; best = { f }; }
      }
    }
    return best;
  }
  function select(id) {
    selected = id;
    api.setHighlight(id);
    renderLaserOpts();
  }

  /* ------------------------------ pointer input ------------------------- */
  chart.addEventListener('pointerdown', (ev) => {
    if (!active() || ev.button > 0 || pid != null) return;
    const p = toChart(ev);
    pid = ev.pointerId;
    try { chart.setPointerCapture(pid); } catch (e) { /* older browsers */ }
    ev.preventDefault();
    gStart = p;
    if (phase === 'side') { phase = 'swiping'; updateSwipe(p); return; }
    if (phase === 'armed') {
      if (armed.kind === 'laser') {
        // laser: a tap treats the break under it; a drag traces the laser exactly where it goes
        phase = 'lasering'; stroke = [p]; hover = p;
        setHint('Trace where the laser goes — lift to finish', true);
        drawInk();
        return;
      }
      if (SPAN[armed.kind]) {
        const rEnd = armed.kind === 'lat' ? clamp(Math.hypot(p[0], p[1]), G.R_EQ - 60, G.R_ORA - 16) : G.R_ORA - 22;
        drag = { h0: hourOf(p), h1: hourOf(p), p0: p, moved: 0, rEnd, cw: true, span: null };
        phase = 'spanning'; setHint('Drag along to set its extent', true);
      } else { phase = 'placing'; hover = p; }
      drawInk();
      return;
    }
    const hit = hitTest(p);
    if (hit) {
      select(hit.f.id);
      drag = { id: hit.f.id, end: hit.end || null, p0: p, at: p, orig: RD.clone(hit.f), moved: 0, off: false, lever: hit.lever || null };
      phase = hit.end ? 'resizing' : 'moving';
      setHint(hit.end === 'lever' ? 'Slide up to enlarge, down to shrink' : hit.end === 'rim' ? 'Drag out to enlarge, in to shrink' : hit.end ? 'Drag the end to resize' : 'Drag off the chart to remove');
      if (hit.end === 'lever') moveDrag(p);      // a tap on the lever sets the size there
      drawInk();
      return;
    }
    if (selected != null) select(null);
    if (RD.mainRd(api.getScene()) && !traceMode) {
      // the detachment is locked: a stray drag never starts a new one
      phase = 'locked'; lockShown = false;
      drawInk();
      return;
    }
    phase = 'tracing';
    stroke = [p];
    setHint('Lift when you reach the ora');
    drawInk();
  });
  chart.addEventListener('pointermove', (ev) => {
    if (!active()) return;
    const p = toChart(ev);
    if (pid == null || ev.pointerId !== pid) {
      // hovering with a mouse or pen
      if (phase === 'side' && prep) { const c = RD.pickPathSide(prep, p); if (!sameChoice(c, choice)) { choice = c; previewChoice('Click to draw this side'); } drawInk(); }
      else if (phase === 'armed') { hover = p; drawInk(); }
      else if (phase === 'idle') chart.style.cursor = hitTest(p) ? 'grab' : 'crosshair';
      return;
    }
    ev.preventDefault();
    if (phase === 'tracing') {
      const evs = typeof ev.getCoalescedEvents === 'function' ? ev.getCoalescedEvents() : [];
      for (const e of (evs.length ? evs : [ev])) { const q = toChart(e); if (dist(q, stroke[stroke.length - 1]) > 0.8 * unit()) stroke.push(q); }
      drawInk();
    } else if (phase === 'swiping') updateSwipe(p);
    else if (phase === 'lasering') {
      const evs = typeof ev.getCoalescedEvents === 'function' ? ev.getCoalescedEvents() : [];
      for (const e of (evs.length ? evs : [ev])) { const q = toChart(e); if (dist(q, stroke[stroke.length - 1]) > 0.8 * unit()) stroke.push(q); }
      hover = p; drawInk();
    }
    else if (phase === 'placing') { hover = p; drawInk(); }
    else if (phase === 'spanning') { updateSpan(p); drawInk(); }
    else if (phase === 'moving' || phase === 'resizing') moveDrag(p);
    else if (phase === 'locked' && !lockShown && dist(p, gStart) > 12 * unit()) {
      lockShown = true;
      setHint('The detachment is locked — tap Redraw or Add detachment to draw another');
      flashBar();
    }
  });
  const finish = (ev) => {
    if (pid == null || ev.pointerId !== pid) return;
    const p = toChart(ev);
    pid = null;
    try { chart.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    if (ev.type === 'pointercancel' && phase !== 'swiping') { cancel(); return; }
    if (phase === 'tracing') finishTrace();
    else if (phase === 'swiping') {
      const c = RD.pickPathSide(prep, gStart, p);
      commitRd(c);
    } else if (phase === 'placing') { placeAt(armed, p); }
    else if (phase === 'lasering') finishLaser(p);
    else if (phase === 'spanning') { updateSpan(p); placeSpan(); }
    else if (phase === 'moving' || phase === 'resizing') endDrag(p);
    else if (phase === 'locked') { phase = 'idle'; if (lockShown) setTimeout(() => { if (phase === 'idle') idleHint(); }, 2600); }
  };
  chart.addEventListener('pointerup', finish);
  chart.addEventListener('pointercancel', finish);
  chart.addEventListener('pointerleave', () => { if (pid == null && (phase === 'armed')) { hover = null; drawInk(); } });
  chart.addEventListener('contextmenu', (e) => { if (active()) e.preventDefault(); });

  /* ------------------------------ detachments --------------------------- */
  function finishTrace() {
    const len = stroke.reduce((s, q, i) => i ? s + dist(q, stroke[i - 1]) : 0, 0);
    const res = RD.prepareStroke(stroke);
    stroke = [];
    if (!res.ok) {
      phase = 'idle';
      if (len > 14 * unit()) api.toast(res.reason === 'outside' ? 'Trace inside the ora — the middle circle.' : 'Trace the whole posterior border, from the ora round to the ora.');
      idleHint(); drawInk();
      return;
    }
    prep = res; choice = null; phase = 'side';
    setHint('Swipe or tap toward the detached side', true);
    drawInk();
  }
  function previewChoice(text) {
    if (!choice) { api.setPreview(null); return; }
    const rd = RD.rdFromPath(choice);
    api.setPreview(RD.applyActions(api.getScene(), [{ op: 'add', f: rd }]).scene, text);
  }
  function updateSwipe(p) {
    const c = RD.pickPathSide(prep, gStart, p);
    if (!sameChoice(c, choice)) { choice = c; previewChoice('Lift to draw this side'); }
    drawInk();
  }
  function commitRd(c) {
    const rd = RD.rdFromPath(c);
    let base = api.getScene();
    if (traceMode === 'redraw') { base = RD.clone(base); base.findings = base.findings.filter(f => f.type !== 'rd'); }
    traceMode = null; renderRdBar();
    const out = RD.applyActions(base, [{ op: 'add', f: rd }]);
    api.setPreview(null);
    api.commit(out.scene);
    const f = out.added[0];
    phase = 'idle'; prep = null; choice = null;
    api.announce([RD.describeAction({ op: 'add', f }, out.scene.eye)].filter(Boolean), out.notes);
    openPalette('rd');
    idleHint(); drawInk();
  }

  /* ----------------------------- moving items --------------------------- */
  function applyMove(f, d, p, eye) {
    const o = d.orig;
    if (d.end === 'rim') {
      // resize about the centre, keeping the shape; recorded in DD (or mm if it was given in mm), to 0.25 DD
      const P0 = RD.catPlace(o, eye), c = [P0.x, P0.y];
      const k = Math.max(0.15, Math.min(8, dist(p, c) / Math.max(4, dist(d.p0, c))));
      const DDU = RD.DD_UNITS;
      const cur = Array.isArray(o.base) && o.base.length ? o.base.map(v => RD.toDD(v, o.bu)) : [P0.tum.rx * 2 / DDU, P0.tum.ry * 2 / DDU];
      const q = (v) => Math.max(0.25, Math.round(v * k * 4) / 4);
      let next = cur.map(q);
      if (next.length === 2 && next[0] === next[1] && (!o.base || o.base.length === 1)) next = [next[0]];
      if (o.bu === 'mm') { f.base = next.map(v => Math.max(0.5, Math.round(v * RD.MM_PER_DD * 2) / 2)); f.bu = 'mm'; }
      else { f.base = next; f.bu = 'dd'; }
      return;     // a lesion placed “2 DD from the disc” keeps that margin and grows away from it
    }
    if (d.end === 'lever') {
      const v = leverSize(d.lever, p[1]);
      if (Math.abs(v - 1) < 0.001) delete f.size; else f.size = v;
      return;
    }
    if (d.end) {
      const hh = qh(hourOf(p));
      if (d.end === 'start') f.start = hh; else f.end = hh;
      if (f.start === f.end || RD.spanHours(f.start, f.end) > 11.75) { f.start = o.start; f.end = o.end; }
      return;
    }
    const r = Math.hypot(p[0], p[1]), h = hourOf(p);
    const dh = RD.mod(h - hourOf(d.p0) + 6, 12) - 6;
    switch (f.type) {
      case 'lat': {
        f.start = qh(o.start + dh); f.end = qh(o.end + dh);
        const base = o.r != null ? o.r : o.radial === 'post' ? G.R_EQ - 12 : G.LATTICE_R;
        f.r = Math.round(clamp(base + r - Math.hypot(d.p0[0], d.p0[1]), G.R_EQ - 60, G.R_ORA - 16));
        if (f.r < G.R_EQ - 4) f.radial = 'post'; else delete f.radial;
        break;
      }
      case 'grt': case 'dia': f.start = qh(o.start + dh); f.end = qh(o.end + dh); break;
      case 'pvr': f.pts = [[Math.round(p[0]), Math.round(p[1])]]; f.hours = [qh(h)]; if ((f.grade || 'C') === 'C') f.loc = r > G.R_EQ ? 'A' : 'P'; break;
      case 'laser': case 'cryo':
        if (Array.isArray(o.line)) { const dx = p[0] - d.p0[0], dy = p[1] - d.p0[1]; f.line = o.line.map(q => inOra([q[0] + dx, q[1] + dy])); break; }
        f.hour = +h.toFixed(3); f.r = Math.round(clamp(r, 14, G.R_ORA - 6)); break;
      case 'cat': {
        const E = RD.CAT[f.key];
        if (RD.isTumor(E)) {
          // a tumour keeps the point you grabbed under your finger; its old “2 DD from the disc” no longer applies
          const P0 = RD.catPlace(o, eye), c = [P0.x + p[0] - d.p0[0], P0.y + p[1] - d.p0[1]];
          f.at = [Math.round(c[0]), Math.round(c[1])]; f.hour = +RD.angleToHour(Math.atan2(c[1], c[0])).toFixed(3);
          f.site = RD.siteAt(c, eye);
          delete f.quad; delete f.arc; delete f.start; delete f.end; delete f.dist; delete f.du;
          break;
        }
        f.at = [Math.round(p[0]), Math.round(p[1])]; f.hour = +h.toFixed(3);
        if (!(E && E.site === 'vitreous')) f.site = RD.siteAt(p, eye);
        delete f.quad; delete f.arc;
        break;
      }
      default:
        f.hour = +h.toFixed(3);
        f.r = Math.round(clamp(r, 14, G.R_ORA - 6));
        if (['hst', 'hole', 'oph'].includes(f.type)) { if (f.r < G.R_EQ - 4) f.radial = 'post'; else if (f.r > G.R_ORA - 22) f.radial = 'ora'; else delete f.radial; }
    }
  }
  const outside = (p) => Math.hypot(p[0], p[1]) > G.R_CB + 28 || Math.abs(p[0]) > G.SIZE / 2 - 4 || Math.abs(p[1]) > G.SIZE / 2 - 4;
  function moveDrag(p) {
    drag.moved = Math.max(drag.moved, dist(p, drag.p0));
    if (phase === 'moving' && drag.moved < 4 * unit()) return;
    drag.at = p;
    const sc = RD.clone(api.getScene());
    drag.off = phase === 'moving' && outside(p);
    if (drag.off) {
      sc.findings = sc.findings.filter(x => x.id !== drag.id && x.target !== drag.id);
      api.setPreview(sc, 'Release to remove');
    } else {
      const f = sc.findings.find(x => x.id === drag.id);
      if (!f) return;
      applyMove(f, drag, p, sc.eye);
      drag.pf = f; drag.psc = sc;
      api.setPreview(sc, phase === 'resizing' ? 'Resizing' : 'Moving');
    }
    drawInk();
  }
  function endDrag(p) {
    const d = drag;
    drag = null;
    const was = phase;
    phase = 'idle';
    if (was === 'moving' && d.moved < 4 * unit()) { api.setPreview(null); idleHint(); drawInk(); return; }   // a tap selects
    const sc = RD.clone(api.getScene());
    const f = sc.findings.find(x => x.id === d.id);
    api.setPreview(null);
    if (!f) { idleHint(); drawInk(); return; }
    if (was === 'moving' && outside(p)) {
      sc.findings = sc.findings.filter(x => x.id !== d.id && x.target !== d.id);
      select(null);
      api.commit(sc);
      api.toast(`Removed ${RD.findingTitle(f, sc.eye).split(' · ')[0].toLowerCase()} — Undo brings it back`);
    } else {
      applyMove(f, d, p, sc.eye);
      api.commit(sc);
    }
    idleHint(); drawInk();
  }

  /* ----------------------------- placing items -------------------------- */
  function quadAt(h, eye) {
    const T = RD.temporalHour(eye), m = RD.mod(h, 12);
    const sup = m < 3 || m >= 9;
    const right = m < 6;            // 12→6 clockwise is the chart's right half
    const temporal = (T === 3) === right;
    return (sup ? 's' : 'i') + (temporal ? 't' : 'n');
  }
  function buildFinding(item, p, eye) {
    const r = Math.hypot(p[0], p[1]), h = hourOf(p), hx = +h.toFixed(3);
    const k = item.kind;
    const extra = item.extra || {};
    let f;
    if (k === 'hst' || k === 'hole' || k === 'oph' || k === 'tuft' || k === 'pav') {
      f = { type: k, hour: hx, r: Math.round(clamp(r, 14, G.R_ORA - 6)) };
      if (['hst', 'hole', 'oph'].includes(k)) { if (f.r < G.R_EQ - 4) f.radial = 'post'; else if (f.r > G.R_ORA - 22) f.radial = 'ora'; }
    } else if (k === 'pvr') f = { type: 'pvr', grade: 'C', loc: r > G.R_EQ ? 'A' : 'P', hours: [qh(h)], pts: [[Math.round(p[0]), Math.round(p[1])]] };
    else if (k === 'vh') f = { type: 'vh', hour: hx, r: Math.round(clamp(r, 70, G.R_ORA - 40)), located: true, density: 'moderate' };
    else if (k === 'laser' || k === 'cryo') {
      const sc = api.getScene();
      let tgt = null, bd = 36;
      for (const b of sc.findings) {
        if (b.type === 'hst' || b.type === 'hole' || b.type === 'oph') { const d = dist(p, atR(RD.radiusFor(b), b.hour)); if (d < bd) { bd = d; tgt = b; } }
        else if ((b.type === 'grt' || b.type === 'dia') && r > G.R_ORA - 70 && RD.inSpan(h, b.start, b.end, 0.1) && !tgt) tgt = b;
      }
      f = tgt ? { type: k, target: tgt.id } : { type: k, hour: hx, r: Math.round(clamp(r, 30, G.R_ORA - 20)) };
      if (k === 'laser') Object.assign(f, { rows: laserOpt.rows, gap: laserOpt.gap });
    } else if (k === 'cat') {
      const E = item.E;
      // disc-shaped and whole-fundus findings have one anatomical place; sector findings take the quadrant
      if (E.dq === 'all' || RD.DISC_RECIPES.has(E.r)) f = { type: 'cat', key: E.id };
      else if (RD.QUAD_RECIPES.has(E.r)) { const qd = quadAt(h, eye), Q = RD.quadrant(qd, eye); f = { type: 'cat', key: E.id, quad: qd, hour: Q.c, start: Q.s, end: Q.e }; }
      else {
        f = { type: 'cat', key: E.id, hour: hx, at: [Math.round(p[0]), Math.round(p[1])] };
        f.site = E.site === 'vitreous' ? 'vitreous' : RD.siteAt(p, eye);
      }
    }
    if (f) Object.assign(f, extra);
    return f;
  }
  function addFinding(f) {
    if (!f) return;
    const out = RD.applyActions(api.getScene(), [{ op: 'add', f }]);
    api.commit(out.scene);
    const nf = out.added[0] || null;
    if (nf) {
      // a new laser is not selected, so the panel stays as it was (tap a laser to change its pattern)
      if (nf.type !== 'laser') select(nf.id); else if (selected != null) select(null);
      api.announce([RD.describeAction({ op: 'add', f: nf }, out.scene.eye)].filter(Boolean), out.notes.filter(n => !/typical location/.test(n)));
    }
  }
  function placeAt(item, p) {
    hover = null;
    phase = 'idle';
    if (item && Math.hypot(p[0], p[1]) <= G.R_CB + 20) addFinding(buildFinding(item, p, api.getScene().eye));
    disarm();
    idleHint(); drawInk();
  }
  /* a traced laser line: thinned to points about 3 units apart, kept inside the ora */
  /* laser stays picked after each line or break, so several can be drawn; Done (or Esc) finishes */
  function finishLaser(p) {
    const pts = stroke, item = armed;
    stroke = [];
    const len = pts.reduce((s, q, i) => i ? s + dist(q, pts[i - 1]) : 0, 0);
    hover = null; phase = 'armed';
    if (len < 12 * unit()) {
      if (Math.hypot(p[0], p[1]) <= G.R_CB + 20) addFinding(buildFinding(item, p, api.getScene().eye));
    } else {
      let line = [pts[0]];
      for (const q of pts.slice(1)) if (dist(q, line[line.length - 1]) >= 3) line.push(q);
      if (line.length < 2) line.push(pts[pts.length - 1]);
      if (line.length > 380) { const k = line.length / 380; line = Array.from({ length: 380 }, (_, i) => line[Math.min(line.length - 1, Math.round(i * k))]); }
      addFinding({ type: 'laser', line: line.map(inOra), rows: laserOpt.rows, gap: laserOpt.gap });
    }
    if (selected != null) select(null);
    renderLaserOpts();
    setHint('Trace more laser, or tap a break — Done when finished', true);
    drawInk();
  }
  function updateSpan(p) {
    drag.h1 = hourOf(p);
    drag.moved = Math.max(drag.moved, dist(p, drag.p0));
    const d = RD.mod(drag.h1 - drag.h0 + 6, 12) - 6;
    if (Math.abs(d) >= 0.2) { drag.cw = d > 0; drag.span = spanArc(drag); }
    else drag.span = null;
    hover = p;
  }
  function placeSpan() {
    const d = drag, item = armed;
    drag = null; hover = null; phase = 'idle';
    let s, e;
    if (d.span && RD.spanHours(d.span.s, d.span.e) >= 0.25 && d.span.s !== d.span.e) { s = d.span.s; e = d.span.e; }
    else { const half = SPAN[item.kind] / 2; s = qh(d.h0 - half); e = qh(d.h0 + half); }
    const f = { type: item.kind, start: s, end: e };
    if (item.kind === 'lat') { f.r = Math.round(d.rEnd); if (f.r < G.R_EQ - 4) f.radial = 'post'; }
    Object.assign(f, item.extra || {});
    addFinding(f);
    disarm();
    idleHint(); drawInk();
  }

  /* ------------------------------- palette ------------------------------ */
  function tileIcon(kind, E) {
    if (E) return root.RDCatRender.swatch(el('canvas', { 'aria-hidden': 'true' }), E);
    if (kind === 'more') {
      const s = el('span', { class: 'pal-more-ic', 'aria-hidden': 'true' });
      s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>';
      return s;
    }
    return api.iconFor({ type: kind, grade: 'C' });
  }
  /* drop a traced border that is still waiting for its side */
  function clearSide() {
    if (prep || phase === 'side' || phase === 'swiping') { prep = null; choice = null; api.setPreview(null); if (phase === 'side' || phase === 'swiping') phase = 'idle'; }
  }
  function arm(item, tile) {
    if (armed && armed.tile === tile) { disarm(); idleHint(); drawInk(); return; }
    clearSide();
    disarm(true);
    armed = Object.assign({}, item, { tile });
    if (tile) tile.setAttribute('aria-pressed', 'true');
    phase = 'armed';
    if (!pal.classList.contains('docked')) { pal.classList.add('tucked'); palSub.textContent = `Placing: ${item.label.toLowerCase()}`; }
    if (selected != null) select(null);
    renderLaserOpts();
    setHint(item.kind === 'laser' ? 'Tap a break to laser around it — or drag to trace the laser exactly' : SPAN[item.kind] ? `Tap, or drag along the fundus, to place the ${item.label.toLowerCase()}` : `Tap the fundus to place the ${item.label.toLowerCase()}`, true);
    drawInk();
  }
  function disarm(quiet) {
    if (armed && armed.tile) armed.tile.setAttribute('aria-pressed', 'false');
    armed = null;
    const wasTucked = pal.classList.contains('tucked');
    pal.classList.remove('tucked');
    palSub.textContent = PAL_SUB;
    if (wasTucked) placePalette(false);
    hover = null;
    if (phase === 'armed' || phase === 'placing' || phase === 'spanning' || phase === 'lasering') phase = 'idle';
    renderLaserOpts();
    if (!quiet) drawInk();
  }
  /* a tile can be tapped (arm, then tap the fundus) or dragged straight onto the fundus */
  function wireTile(tile, item) {
    tile.addEventListener('pointerdown', (ev) => {
      if (ev.button > 0) return;
      ev.preventDefault();
      const start = [ev.clientX, ev.clientY];
      let dragging = false;
      try { tile.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      const move = (e) => {
        if (!dragging && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 7) { dragging = true; startGhost(item, e); }
        if (dragging) moveGhost(e);
      };
      const end = (e) => {
        tile.removeEventListener('pointermove', move); tile.removeEventListener('pointerup', end); tile.removeEventListener('pointercancel', end);
        try { tile.releasePointerCapture(e.pointerId); } catch (er) { /* ignore */ }
        if (dragging) dropGhost(item, e);
        else if (e.type === 'pointerup') { if (item.kind === 'more') toggleMore(); else arm(item, tile); }
      };
      tile.addEventListener('pointermove', move);
      tile.addEventListener('pointerup', end);
      tile.addEventListener('pointercancel', end);
    });
    tile.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (item.kind === 'more') toggleMore(); else arm(item, tile); }
    });
  }
  function startGhost(item, e) {
    clearSide();
    disarm(true);
    ghost = el('div', { class: 'pal-ghost', 'aria-hidden': 'true' }, [tileIcon(item.kind, item.E)]);
    ghostKind = item.kind;
    ghost.dataset.touch = e.pointerType === 'touch' ? '1' : '';
    document.body.append(ghost);
    pal.classList.add('fade');
    phase = 'dragNew';
    setHint(`Drop it on the fundus`);
    moveGhost(e);
  }
  function moveGhost(e) {
    if (!ghost) return;
    const lift = ghost.dataset.touch ? 46 : 0;
    ghost.style.transform = `translate(${e.clientX - 20}px, ${e.clientY - 20 - lift}px)`;
    const r = rect();
    const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    hover = over ? toChart(e) : null;
    drawInk();
  }
  function dropGhost(item, e) {
    if (ghost) ghost.remove();
    ghost = null; ghostKind = null;
    pal.classList.remove('fade');
    const p = hover;
    hover = null; phase = 'idle';
    if (p && Math.hypot(p[0], p[1]) <= G.R_CB + 20) {
      if (SPAN[item.kind]) {
        const h = hourOf(p), half = SPAN[item.kind] / 2;
        const f = { type: item.kind, start: qh(h - half), end: qh(h + half) };
        if (item.kind === 'lat') { f.r = Math.round(clamp(Math.hypot(p[0], p[1]), G.R_EQ - 60, G.R_ORA - 16)); if (f.r < G.R_EQ - 4) f.radial = 'post'; }
        Object.assign(f, item.extra || {});
        addFinding(f);
      } else addFinding(buildFinding(item, p, api.getScene().eye));
    }
    idleHint(); drawInk();
  }

  let moreTile = null;
  const tileGrid = (tiles, aria, cls) => {
    const gr = el('div', { class: 'pal-grid' + (cls ? ' ' + cls : ''), role: 'toolbar', 'aria-label': aria });
    for (const [kind, label, short] of tiles) {
      const tile = el('button', { type: 'button', class: 'pal-tile', 'aria-pressed': 'false', 'aria-label': label, title: kind === 'more' ? 'Search the pathology library' : `${label}: drag onto the fundus, or tap then tap the spot` }, [tileIcon(kind), el('span', { text: short, 'aria-hidden': 'true' })]);
      wireTile(tile, { kind, label });
      if (kind === 'more') moreTile = tile;
      gr.append(tile);
    }
    return gr;
  };
  const linHint = el('p', { class: 'pal-lin', hidden: true });
  const grid = el('div', { class: 'pal-tiles' }, [
    el('div', { class: 'pal-sec pal-sec-brk', text: 'Breaks' }), tileGrid(BREAK_TILES, 'Breaks to place', 'pal-breaks'),
    el('div', { class: 'pal-sec', text: 'Other findings' }), tileGrid(OTHER_TILES, 'Other findings to place'),
  ]);
  const moreBox = el('div', { class: 'pal-more', hidden: true });
  const moreIn = el('input', { type: 'search', placeholder: 'Search — nevus, CNV, drusen…', 'aria-label': 'Search the pathology library', autocomplete: 'off', spellcheck: 'false' });
  const moreList = el('ul', { class: 'pal-results' });
  moreBox.append(moreIn, moreList);
  const PAL_KINDS = new Set(['hst', 'hole', 'oph', 'lat', 'grt', 'dia', 'tuft', 'pav', 'vh', 'laser', 'cryo', 'star', 'pvr']);
  function renderMore() {
    moreList.replaceChildren();
    const q = moreIn.value.trim();
    const res = api.libSearch(q).filter(E => !E.map || PAL_KINDS.has(E.map.type)).slice(0, q ? 8 : 6);
    for (const E of res) {
      let item;
      if (E.map) { const extra = Object.assign({}, E.map); delete extra.type; item = { kind: E.map.type === 'star' ? 'pvr' : E.map.type, label: RD.catName(E), extra }; }
      else item = { kind: 'cat', label: RD.catName(E), E };
      const b = el('button', { type: 'button', class: 'pal-res', 'aria-pressed': 'false' }, [tileIcon(item.kind, item.kind === 'cat' ? E : null), el('span', { text: RD.catName(E) })]);
      wireTile(b, item);
      moreList.append(el('li', {}, [b]));
    }
    if (!res.length) moreList.append(el('li', { class: 'empty', text: 'No match' }));
  }
  let moreTimer = 0;
  moreIn.addEventListener('input', () => { clearTimeout(moreTimer); moreTimer = setTimeout(renderMore, 120); });
  function toggleMore() {
    moreBox.hidden = !moreBox.hidden;
    if (moreTile) moreTile.setAttribute('aria-pressed', String(!moreBox.hidden));
    if (!moreBox.hidden) { renderMore(); moreIn.focus(); }
  }

  /* ---------------- laser pattern: rows, confluent or spaced, and the gap in burn widths ---------------- */
  const LASER_DEFAULT = { rows: 3, gap: 0.5 };
  const cleanOpt = (o) => ({ rows: Math.max(1, Math.min(5, Math.round((o && o.rows) || 3))), gap: o && RD.LASER_GAPS.includes(o.gap) ? o.gap : 0.5 });
  let laserOpt = cleanOpt(Object.assign({}, LASER_DEFAULT, api.getPref('laser') || {}));
  let lastSpaced = laserOpt.gap || 0.5;
  const laserBox = el('div', { class: 'pal-laser', hidden: true });
  function selectedLaser() {
    if (selected == null) return null;
    const f = api.getScene().findings.find(x => x.id === selected);
    return f && f.type === 'laser' ? f : null;
  }
  function setLaser(next) {
    next = cleanOpt(next);
    if (next.gap) lastSpaced = next.gap;
    const sel = phase === 'armed' || phase === 'lasering' ? null : selectedLaser();
    laserOpt = next; api.setPref('laser', laserOpt);
    if (sel) {
      // the selected laser takes the new pattern (one Undo step)
      const sc = RD.clone(api.getScene()), f = sc.findings.find(x => x.id === sel.id);
      if (f) { f.rows = next.rows; f.gap = next.gap; api.commit(sc); }
    }
    renderLaserOpts(); drawInk();
  }
  function optRow(label, opts, value, pick, extra) {
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': label });
    for (const [v, t, title] of opts) seg.append(el('button', { type: 'button', 'aria-pressed': String(value === v), title: title || null, text: t, onclick: () => pick(v) }));
    return el('div', { class: 'pal-row' }, [el('span', { class: 'pal-lab', text: label }), seg, extra || null]);
  }
  function drawSwatch(cv, pat) {
    const W = 236, H = 62, dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const D = RD.BURN_D, along = pat.gap === 0 ? D * 0.82 : D * (1 + pat.gap), across = pat.gap === 0 ? D * 0.76 : along * 0.87;
    const k = Math.min(1.9, (H - 12) / ((pat.rows - 1) * across + D));
    const line = [[-W / 2 / k + 4, 0], [W / 2 / k - 4, 0]];
    g.save(); g.translate(W / 2, H / 2); g.scale(k, k);
    for (const [x, y] of RD.laserLineSpots(line, pat)) {
      g.fillStyle = 'rgba(176,138,96,0.62)'; g.beginPath(); g.arc(x, y, 3.1, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3A2E28'; g.beginPath(); g.arc(x, y, 1.7, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
  function renderLaserOpts() {
    const armedLaser = !!armed && armed.kind === 'laser';
    const sel = armedLaser ? null : selectedLaser();
    laserBox.hidden = !(armedLaser || sel);
    // a selected laser turns the panel into its pattern editor until something else is picked
    const wasOnly = pal.classList.contains('laser-only');
    pal.classList.toggle('laser-only', !!sel);
    if (wasOnly && !sel) placePalette(false);
    if (laserBox.hidden) return;
    const pat = sel ? (RD.laserPattern(sel) || cleanOpt(LASER_DEFAULT)) : laserOpt;
    const spaced = pat.gap > 0;
    const sw = el('canvas', { class: 'pal-swatch', 'aria-hidden': 'true' });
    laserBox.replaceChildren(...[
      el('div', { class: 'pal-sec' }, [sel ? 'Laser pattern · selected laser' : 'Laser pattern · as you trace']),
      optRow('Rows', [1, 2, 3, 4, 5].map(n => [n, String(n), `${n} row${n > 1 ? 's' : ''}`]), pat.rows, (v) => setLaser({ rows: v, gap: pat.gap })),
      optRow('Burns', [['c', 'Confluent', 'Burns touching, a continuous band'], ['s', 'Spaced', 'A gap between burns']], spaced ? 's' : 'c', (v) => setLaser({ rows: pat.rows, gap: v === 'c' ? 0 : (pat.gap || lastSpaced || 0.5) })),
      spaced ? optRow('Gap', [[0.5, '½'], [1, '1'], [1.5, '1½'], [2, '2']].map(([v, t]) => [v, t, `${t} burn width${v > 1 ? 's' : ''} between burns`]), pat.gap, (v) => setLaser({ rows: pat.rows, gap: v }), el('span', { class: 'pal-unit', text: 'burns' })) : null,
      sw,
      el('p', { class: 'pal-note', text: `${RD.laserPatternText(pat)} — each dot is one burn.${sel ? ' Changes apply to the selected laser.' : ' Tap a break to laser around it, or drag to trace; keep going for more lines.'}` }),
      el('div', { class: 'pal-done' }, [el('button', { type: 'button', class: 'btn-line', text: 'Done', onclick: () => { if (armedLaser) { disarm(); idleHint(); } else select(null); drawInk(); } })]),
    ].filter(Boolean));
    // the editor has to be seen: open the panel if it was folded away
    if (sel) pal.classList.remove('min');
    drawSwatch(sw, pat);
  }

  const status = el('div', { class: 'pal-status' });
  const PAL_SUB = 'drag onto the fundus · or tap, then tap the spot';
  const palSub = el('span', { class: 'pal-sub', text: PAL_SUB });
  const palTitle = el('strong', { text: 'Add findings' });
  const head = el('div', { class: 'pal-head' }, [
    palTitle,
    palSub,
    el('button', { type: 'button', class: 'pal-btn pal-min', 'aria-label': 'Minimise the palette', title: 'Minimise', text: '–', onclick: () => { pal.classList.toggle('min'); } }),
    el('button', { type: 'button', class: 'pal-btn', 'aria-label': 'Close the palette', title: 'Close', text: '×', onclick: () => closePalette() }),
  ]);
  pal.append(head, laserBox, linHint, grid, moreBox, status);

  function segRow(label, need, opts, value, onPick) {
    const row = el('div', { class: 'pal-row' + (need ? ' need' : '') }, [el('span', { class: 'pal-lab', text: label })]);
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': label });
    for (const [v, t] of opts) seg.append(el('button', { type: 'button', 'aria-pressed': String(value === v), text: t, onclick: () => onPick(value === v ? null : v) }));
    row.append(seg);
    return row;
  }
  function renderStatus() {
    // the palette asks only what the drawing still needs: the PVD (lens status is asked in the repair card)
    const sc = api.getScene();
    // a detachment with no break yet: lead with the breaks, and say where Lincoff's rules look first
    const needBreak = !!RD.mainRd(sc) && !sc.findings.some(f => RD.BREAK_TYPES.has(f.type));
    palTitle.textContent = needBreak ? 'Add the breaks' : 'Add findings';
    pal.classList.toggle('need-break', needBreak);
    const z = needBreak ? RD.lincoff(sc) : null;
    linHint.hidden = !z;
    if (z) linHint.replaceChildren(el('strong', { text: `Lincoff rule ${z.rule}:` }), ` search ${z.zoneText.replace(' o’clock', '')} first`);
    status.replaceChildren();
    status.hidden = !!sc.pvd || !RD.mainRd(sc);
    if (status.hidden) return;
    status.append(segRow('PVD?', true, [['complete', 'Complete'], ['partial', 'Partial'], ['none', 'None']], null, v => api.setMeta({ pvd: v })));
  }
  /* drag the palette by its header (wide screens) */
  head.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('button') || pal.classList.contains('docked')) return;
    ev.preventDefault();
    const sr = stage.getBoundingClientRect(), pr = pal.getBoundingClientRect();
    const off = [ev.clientX - pr.left, ev.clientY - pr.top];
    try { head.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    const mv = (e) => {
      const x = clamp(e.clientX - sr.left - off[0], 0, sr.width - pr.width), y = clamp(e.clientY - sr.top - off[1], 0, sr.height - 40);
      Object.assign(pal.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' });
    };
    const up = () => { head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', up); head.removeEventListener('pointercancel', up); };
    head.addEventListener('pointermove', mv); head.addEventListener('pointerup', up); head.addEventListener('pointercancel', up);
    palPlaced = true;
  });

  /* where things are on the chart, for keeping the palette off them */
  function occupied(sc) {
    const pts = [];
    for (const f of sc.findings) {
      const H = hitInfo(f, sc);
      if (H && H.pts) pts.push(...H.pts);
      else if (H && H.line) pts.push(...H.line.filter((_, i) => i % 6 === 0));
      else if (H && H.span) { pts.push(atR(H.rEnd, H.span[0]), atR(H.rEnd, H.span[1]), atR(H.rEnd, RD.midHour(H.span[0], H.span[1]))); }
    }
    return pts;
  }
  /* the corner where the palette hides the least: least detachment, no drawn findings */
  function palRect(corner) {
    const W = rect().width || G.SIZE, u = G.SIZE / W;
    // the palette's full size, even while it is tucked away during placement
    if (!pal.classList.contains('tucked') && !pal.classList.contains('min') && !pal.classList.contains('laser-only') && pal.offsetHeight > 60) palFull = [pal.offsetWidth, pal.offsetHeight];
    const pw = (palFull ? palFull[0] : pal.offsetWidth) * u, ph = (palFull ? palFull[1] : pal.offsetHeight) * u, m = 8 * u, H = G.SIZE / 2;
    const x0 = corner[0] ? H - m - pw : -H + m, y0 = corner[1] ? H - m - ph : -H + m;
    return [x0, y0, x0 + pw, y0 + ph];
  }
  function cornerScore(corner, sc, F, pts) {
    const [x0, y0, x1, y1] = palRect(corner);
    let sum = 0;
    for (let x = x0 + 8; x < x1; x += 22) for (let y = y0 + 8; y < y1; y += 22) {
      if (Math.hypot(x, y) > G.R_ORA) continue;
      sum += 0.25 + (F && F(x, y) < 0 ? 1 : 0);
    }
    for (const q of pts) if (q[0] > x0 - 10 && q[0] < x1 + 10 && q[1] > y0 - 10 && q[1] < y1 + 10) sum += 40;
    if (!corner[0] && corner[1] && !rdBar.hidden) sum += 30;          // keep clear of the Redraw / Add buttons
    return sum;
  }
  let palCorner = null, palFull = null;
  function placePalette(force) {
    if (pal.hidden || pal.classList.contains('docked') || palPlaced) return;
    const sc = api.getScene();
    const F = RD.rdsOf(sc).length ? RD.makeField(sc, 'rd') : null;
    const pts = occupied(sc);
    if (!force && palCorner && cornerScore(palCorner, sc, null, pts) < 40) return;   // nothing under it: stay put
    let best = null, bs = Infinity;
    for (const c of [[1, 1], [0, 1], [1, 0], [0, 0]]) { const v = cornerScore(c, sc, F, pts); if (v < bs - 0.01) { bs = v; best = c; } }
    palCorner = best;
    Object.assign(pal.style, { left: best[0] ? 'auto' : '8px', right: best[0] ? '8px' : 'auto', top: best[1] ? 'auto' : '8px', bottom: best[1] ? '8px' : 'auto' });
    // every corner holds something: shrink to the header rather than hide a drawn finding
    if (cornerScore(best, sc, null, pts) >= 40) pal.classList.add('min');
  }
  function openPalette(why) {
    renderStatus();
    pal.hidden = false;
    pal.classList.remove('min');
    fab.hidden = true;
    const narrow = stage.clientWidth < 560;
    pal.classList.toggle('docked', narrow);
    if (narrow) Object.assign(pal.style, { left: '', right: '', top: '', bottom: '' });
    else placePalette(true);
    // just outlined a detachment: on a phone the panel sits under the chart, so bring the breaks into view
    if (why === 'rd') {
      if (narrow) requestAnimationFrame(() => { try { pal.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { pal.scrollIntoView(false); } });
      else pal.classList.remove('min');
    }
  }
  function closePalette() {
    pal.hidden = true;
    moreBox.hidden = true;
    disarm(true);
    if (phase === 'armed') phase = 'idle';
    sync();
  }
  fab.addEventListener('click', () => openPalette());

  /* --------------- Redraw / Add detachment: the only ways to trace once one is drawn --------------- */
  const icRedraw = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/></svg>';
  const icAdd = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const btnRedraw = el('button', { type: 'button', class: 'rd-btn', 'aria-pressed': 'false', title: 'Scrap the detachment and trace it again' });
  btnRedraw.innerHTML = icRedraw + '<span>Redraw</span>';
  const btnAdd = el('button', { type: 'button', class: 'rd-btn', 'aria-pressed': 'false', title: 'Trace another, separate detachment' });
  btnAdd.innerHTML = icAdd + '<span>Add detachment</span>';
  const rdBar = el('div', { class: 'rd-bar', role: 'group', 'aria-label': 'Detachment', hidden: true }, [btnRedraw, btnAdd]);
  stage.append(rdBar);
  function setTraceMode(m) {
    if (phase !== 'idle' && phase !== 'armed') cancel();
    disarm(true);
    if (selected != null) select(null);
    traceMode = traceMode === m ? null : m;
    renderRdBar(); idleHint(); drawInk();
  }
  btnRedraw.addEventListener('click', () => setTraceMode('redraw'));
  btnAdd.addEventListener('click', () => setTraceMode('add'));
  function renderRdBar() {
    const show = active() && !!RD.mainRd(api.getScene());
    rdBar.hidden = !show;
    if (!show && traceMode) traceMode = null;
    btnRedraw.setAttribute('aria-pressed', String(traceMode === 'redraw'));
    btnAdd.setAttribute('aria-pressed', String(traceMode === 'add'));
    btnRedraw.querySelector('span').textContent = RD.rdsOf(api.getScene()).length > 1 ? 'Redraw all' : 'Redraw';
  }
  function flashBar() { rdBar.classList.remove('flash'); void rdBar.offsetWidth; rdBar.classList.add('flash'); }

  /* --------------- drawing is off: a tap on the chart offers to turn it on --------------- */
  let askDismissed = false, busyAtDown = false;
  const askBox = el('div', { class: 'draw-ask', role: 'dialog', 'aria-label': 'Draw on the chart?', hidden: true }, [
    el('strong', { text: 'Draw on the chart?' }),
    el('span', { text: 'Trace the detachment and place tears, laser and more with your finger or mouse.' }),
    el('div', { class: 'da-actions' }, [
      el('button', { type: 'button', class: 'glass small', text: 'Yes, start drawing', onclick: () => { askBox.hidden = true; setOn(true); } }),
      el('button', { type: 'button', class: 'btn-line', text: 'Not now', onclick: () => { askBox.hidden = true; askDismissed = true; } }),
    ]),
  ]);
  stage.append(askBox);
  chart.addEventListener('pointerdown', () => { busyAtDown = !!(api.busy && api.busy()); }, { capture: true });
  chart.addEventListener('click', () => {
    if (on || askDismissed || busyAtDown || api.getView() !== 'fundus') return;
    askBox.hidden = false;
  });

  /* ------------------------------- mode -------------------------------- */
  function setOn(v, quiet) {
    on = !!v;
    if (on) askBox.hidden = true;
    btn.setAttribute('aria-pressed', String(on));
    if (!on) { cancel(); pal.hidden = true; select(null); }
    api.setPref('hand', on);
    sync();
    if (on && !quiet) api.toast(RD.mainRd(api.getScene()) ? 'Draw by hand: trace a border, or open the palette to add findings' : 'Trace the detachment’s posterior border from the ora round to the ora');
  }
  btn.addEventListener('click', () => setOn(!on));
  document.addEventListener('keydown', (e) => {
    if (!active()) return;
    const typing = /INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName || '');
    if (e.key === 'Escape' && (phase !== 'idle' || armed)) { e.preventDefault(); cancel(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selected != null && !typing) {
      e.preventDefault();
      const sc = RD.clone(api.getScene());
      const f = sc.findings.find(x => x.id === selected);
      if (!f) return;
      sc.findings = sc.findings.filter(x => x.id !== selected && x.target !== selected);
      select(null);
      api.commit(sc);
      api.toast(`Removed ${RD.findingTitle(f, sc.eye).split(' · ')[0].toLowerCase()} — Undo brings it back`);
    }
  });
  window.addEventListener('resize', () => drawInk());

  /* called after every change to the scene or the view */
  function sync() {
    const act = active();
    btn.disabled = api.getView() !== 'fundus';
    chart.classList.toggle('inking', act);        // touch scrolling works again whenever drawing is off
    if (!act) {
      if (phase !== 'idle' || armed || prep || drag) cancel();
      pal.hidden = true; fab.hidden = true; setHint('');
    }
    else {
      fab.hidden = !pal.hidden;
      if (!pal.hidden) { renderStatus(); renderLaserOpts(); placePalette(false); }
      if (phase === 'idle') idleHint();
    }
    if (selected != null && !api.getScene().findings.some(f => f.id === selected)) select(null);
    renderRdBar();
    drawInk();
  }

  const want = api.getPref('hand');
  setOn(want == null ? !!(window.matchMedia && window.matchMedia('(pointer: fine)').matches) : want, true);
  return { sync, drawInk, setOn, isOn: () => on, openPalette };
};
})(typeof window !== 'undefined' ? window : globalThis);
