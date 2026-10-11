/* R/D — drawing the PubMed pathology catalogue in the fundus colour code.
   Every entry carries its colour code (fill / outline / pattern); generic shapes paint
   that code directly, and purpose-built recipes draw findings whose form matters
   (disc changes, vein occlusions, PRP, gas and oil, macular holes …). */
(function (root) {
'use strict';
const RD = root.RD, RR = root.RDRender;
const { G, DEG, TAU } = RD;
const Hh = RR._h;

/* ------------------------------ colour code ---------------------------- */
const INK = { red: '#D8423A', blue: '#2C66C4', yellow: '#E0AA10', green: '#2E9A55', purple: '#7E4FC0', orange: '#EE8A22', brown: '#8A5A33', black: '#25282C', white: '#FFFFFF' };
const STROKE = Object.assign({}, INK, { yellow: '#C08C00', white: '#8E98A3' });
const ALPHA = { red: 0.85, blue: 0.3, yellow: 0.6, green: 0.5, purple: 0.75, orange: 0.78, brown: 0.75, black: 0.88, white: 1 };
const has = (c) => !!c && c !== 'none';
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function fillOf(c, a) { return has(c) ? hexA(INK[c] || '#888888', a != null ? a : ALPHA[c]) : null; }
function strokeOf(c) { return has(c) ? (STROKE[c] || '#555') : null; }
const COLOR_WORD = { red: 'red', blue: 'blue', yellow: 'yellow', green: 'green', purple: 'purple', orange: 'orange', brown: 'brown', black: 'black', white: 'white' };

function styleOf(E) {
  let fill = E.fill, outline = E.outline, pat = E.pattern || 'none', pcolor = E.pcolor || null;
  if (pat === 'solid' && !has(fill)) fill = pcolor || outline;
  if (pat === 'solid') pat = 'none';
  if (fill === 'white' && !has(outline)) outline = 'white';
  if (pat !== 'none' && !has(pcolor)) pcolor = has(outline) ? outline : fill;
  return { fill, outline, pattern: pat, pcolor };
}
/* human description of an entry's colour code, for the library and the key */
function codeText(E) {
  const st = styleOf(E), bits = [];
  if (has(st.fill)) bits.push(`${COLOR_WORD[st.fill]} fill`);
  if (has(E.outline) && E.outline !== 'none') bits.push(`${COLOR_WORD[E.outline]} outline`);
  if (st.pattern !== 'none') bits.push(`${COLOR_WORD[st.pcolor] || ''} ${st.pattern.replace(/_/g, '-')}`.trim());
  return bits.length ? bits.join(', ') : 'outline only';
}

/* ------------------------------ primitives ----------------------------- */
function rngFor(f, salt) { return RD.mulberry32((((f.seed || f.id || 3) + 1) * 2654435761 + (salt || 0)) >>> 0); }
function blob(x, y, rx, ry, rot, rng, wob) {
  const n = 32, p = new Path2D(), ph = rng() * TAU, ph2 = rng() * TAU;
  for (let i = 0; i <= n; i++) {
    const t = i / n * TAU, k = 1 + (wob || 0) * (0.6 * Math.sin(3 * t + ph) + 0.4 * Math.sin(5 * t + ph2));
    const lx = Math.cos(t) * rx * k, ly = Math.sin(t) * ry * k;
    const px = x + lx * Math.cos(rot) - ly * Math.sin(rot), py = y + lx * Math.sin(rot) + ly * Math.cos(rot);
    if (i) p.lineTo(px, py); else p.moveTo(px, py);
  }
  p.closePath();
  return p;
}
function circle(x, y, r) { const p = new Path2D(); p.arc(x, y, r, 0, TAU); return p; }
function ringPath(r1, r2) { const p = new Path2D(); p.arc(0, 0, r2, 0, TAU); p.moveTo(r1, 0); p.arc(0, 0, r1, TAU, 0, true); return p; }
/* annular band over a clock span; tapered ends like a hand-drawn lattice island */
function bandPath(r1, r2, s, e, taper, rng, wob) {
  if (RD.spanHours(s, e) >= 12) return ringPath(r1, r2);
  const a1 = RD.hourToAngle(s), span = RD.spanHours(s, e) * 30 * DEG, n = Math.max(24, Math.round(span * 40));
  const rc = (r1 + r2) / 2, hw = (r2 - r1) / 2, top = [], bot = [];
  const ph = rng ? rng() * TAU : 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a1 + span * t;
    const w = hw * (taper ? Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.45) : 1);
    const wv = wob ? Math.sin(t * span * 9 + ph) * wob : 0;
    top.push([Math.cos(a) * (rc + w), Math.sin(a) * (rc + w)]);
    bot.push([Math.cos(a) * (rc - w + wv), Math.sin(a) * (rc - w + wv)]);
  }
  const p = new Path2D();
  p.moveTo(top[0][0], top[0][1]); for (const q of top) p.lineTo(q[0], q[1]);
  for (let i = bot.length - 1; i >= 0; i--) p.lineTo(bot[i][0], bot[i][1]);
  p.closePath();
  return p;
}
function polyline(pts) { const p = new Path2D(); pts.forEach((q, i) => (i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1]))); return p; }

function pattern(ctx, kind, color, box, opt) {
  opt = opt || {};
  const c = strokeOf(color) || '#555';
  const u = opt.u || Math.max(1.4, Math.min(4.4, box.r / 4));
  const R = box.r * 1.5 + 2;
  const rng = RD.mulberry32(opt.seed || 5);
  const lw = Math.max(0.45, Math.min(0.95, u / 4));
  ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineCap = 'round';
  const lines = (ang) => {
    const ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux;
    ctx.lineWidth = lw;
    for (let d = -R; d <= R; d += u) { ctx.beginPath(); ctx.moveTo(box.x + vx * d - ux * R, box.y + vy * d - uy * R); ctx.lineTo(box.x + vx * d + ux * R, box.y + vy * d + uy * R); ctx.stroke(); }
  };
  const grid = (g, fn) => { for (let y = -R, row = 0; y <= R; y += g, row++) for (let x = -R; x <= R; x += g) fn(box.x + x + (row % 2) * g / 2, box.y + y); };
  switch (kind) {
    case 'cross_hatch': lines(Math.PI / 4); lines(-Math.PI / 4); break;
    case 'parallel_hatch': lines(opt.hatch != null ? opt.hatch : Math.PI / 4); break;
    case 'stipple': { const n = Math.min(900, Math.round(R * R / (u * u) * 1.1)); for (let i = 0; i < n; i++) { const a = rng() * TAU, r = Math.sqrt(rng()) * R; ctx.beginPath(); ctx.arc(box.x + Math.cos(a) * r, box.y + Math.sin(a) * r, lw * 0.8, 0, TAU); ctx.fill(); } break; }
    case 'dots': grid(u * 1.6, (x, y) => { ctx.beginPath(); ctx.arc(x, y, Math.max(0.6, u * 0.32), 0, TAU); ctx.fill(); }); break;
    case 'x_marks': { const s = u * 0.5; ctx.lineWidth = lw; grid(u * 2.1, (x, y) => { ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke(); }); break; }
    case 'short_lines': { const ang = opt.angle != null ? opt.angle : Math.atan2(box.y, box.x); ctx.lineWidth = lw * 1.3; grid(u * 1.9, (x, y) => { const a = ang + (rng() - 0.5) * 0.5, l = u * 0.75; ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke(); }); break; }
    case 'wavy_lines': {
      const ang = opt.angle || 0, ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux;
      ctx.lineWidth = lw;
      for (let d = -R; d <= R; d += u * 1.35) { ctx.beginPath(); for (let t = -R; t <= R; t += Math.max(0.6, u / 3)) { const w = Math.sin(t / u * 1.5 + d) * u * 0.38; const px = box.x + ux * t + vx * (d + w), py = box.y + uy * t + vy * (d + w); if (t === -R) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.stroke(); }
      break;
    }
    case 'radial_lines': { ctx.lineWidth = lw * 1.2; const n = Math.max(10, Math.round(box.r * 1.4)); for (let i = 0; i < n; i++) { const a = i / n * TAU + rng() * 0.1; ctx.beginPath(); ctx.moveTo(box.x + Math.cos(a) * box.r * 0.22, box.y + Math.sin(a) * box.r * 0.22); ctx.lineTo(box.x + Math.cos(a) * R, box.y + Math.sin(a) * R); ctx.stroke(); } break; }
    case 'ring': case 'scalloped': { ctx.lineWidth = Math.max(0.9, box.r * 0.13); ctx.beginPath(); ctx.arc(box.x, box.y, box.r * 0.55, 0, TAU); ctx.stroke(); break; }
  }
}
function paint(ctx, path, st, box, opt) {
  opt = opt || {};
  if (has(st.fill)) { ctx.fillStyle = fillOf(st.fill, opt.alpha); ctx.fill(path, opt.rule || 'nonzero'); }
  if (st.pattern && st.pattern !== 'none') { ctx.save(); ctx.clip(path, opt.rule || 'nonzero'); pattern(ctx, st.pattern, st.pcolor, box, opt); ctx.restore(); }
  if (has(st.outline)) { ctx.strokeStyle = strokeOf(st.outline); ctx.lineWidth = opt.lw || 1.4; ctx.lineJoin = 'round'; if (opt.dash) ctx.setLineDash(opt.dash); ctx.stroke(path); ctx.setLineDash([]); }
}
function domeShade(ctx, path, x, y, r) {
  ctx.save(); ctx.clip(path);
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r * 1.15);
  g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.5, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(40,30,20,0.22)');
  ctx.fillStyle = g; ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
  ctx.restore();
}

/* ------------------------------ geometry -------------------------------- */
const BAND = { ora: [280, 298], pars_plana: [305, 336], periphery: [236, 266], equator: [204, 228], mid: [140, 182], vitreous: [140, 182] };
function bandRadii(P) {
  const b = BAND[P.site] || (P.post ? [44, 78] : BAND.mid);
  const c = (b[0] + b[1]) / 2, hw = (b[1] - b[0]) / 2 * Math.min(1.8, P.k);
  return [c - hw, Math.min(G.R_CB - 2, c + hw)];
}
function spanOf(P, half) {
  if (P.span) return P.span;
  const h = P.h != null ? P.h : 12;
  return { s: RD.normHour(h - half), e: RD.normHour(h + half), full: false };
}
function radialAngle(P) { return Math.atan2(P.y, P.x || 1e-6); }
const SZ = { point: [3.2, 5.5], patch: [7, 13], dome: [9, 17], cluster: [13, 22], ring: [7, 12], band_radial: [9, 17], line: [11, 18], cloud: [60, 70], vessel_segment: [40, 62], sector_region: [16, 30] };
function sizeOf(P, shape) { const s = SZ[shape] || SZ.patch; return (P.post ? s[0] : s[1]) * P.k; }

function nearestVessel(eye, x, y, win, kinds) {
  const vs = RR.vesselPaths(eye).filter(v => !kinds || kinds.includes(v.k));
  let best = null;
  for (const v of vs) v.pts.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y); if (!best || d < best.d) best = { v, i, d }; });
  if (!best) return [];
  const pts = best.v.pts;
  let a = best.i, b = best.i;
  while (a > 0 && Math.hypot(pts[a - 1][0] - x, pts[a - 1][1] - y) < win) a--;
  while (b < pts.length - 1 && Math.hypot(pts[b + 1][0] - x, pts[b + 1][1] - y) < win) b++;
  return pts.slice(a, b + 1);
}
function offsetLine(pts, d) {
  return pts.map((p, i) => {
    const q0 = pts[Math.max(0, i - 1)], q1 = pts[Math.min(pts.length - 1, i + 1)];
    let tx = q1[0] - q0[0], ty = q1[1] - q0[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    return [p[0] - ty * d, p[1] + tx * d];
  });
}

/* ------------------------------ generic shapes -------------------------- */
const GENERIC = {
  point(ctx, f, P, E, st) {
    const r = sizeOf(P, 'point'), rng = rngFor(f);
    for (const [x, y] of copies(f, P, r * 3.2, rng)) paint(ctx, circle(x, y, r), st, { x, y, r }, { lw: P.post ? 1 : 1.4, seed: f.seed });
  },
  patch(ctx, f, P, E, st) {
    const r = sizeOf(P, 'patch'), rng = rngFor(f, 1);
    for (const [x, y] of copies(f, P, r * 2.4, rng)) { const p = blob(x, y, r, r * 0.78, radialAngle(P) + rng() * 0.6, rng, 0.12); paint(ctx, p, st, { x, y, r }, { lw: P.post ? 1 : 1.4, seed: f.seed, angle: radialAngle(P) }); }
  },
  dome(ctx, f, P, E, st) {
    const r = sizeOf(P, 'dome'), rng = rngFor(f, 2);
    for (const [x, y] of copies(f, P, r * 2.2, rng)) {
      const p = blob(x, y, r, r * 0.86, radialAngle(P), rng, 0.06);
      ctx.save(); ctx.translate(1.2, 1.8); ctx.fillStyle = 'rgba(40,30,20,0.16)'; ctx.fill(p); ctx.restore();
      paint(ctx, p, st, { x, y, r }, { lw: P.post ? 1.2 : 1.7, seed: f.seed });
      domeShade(ctx, p, x, y, r);
    }
  },
  cluster(ctx, f, P, E, st) {
    const rng = rngFor(f, 3);
    const dotFill = has(st.fill) ? st.fill : (st.pcolor || st.outline);
    const dst = { fill: dotFill, outline: has(st.fill) && has(st.outline) ? st.outline : 'none', pattern: 'none' };
    let n = f.count || (P.site === 'macula' && P.x === 0 && P.y === 0 ? 20 : P.post ? 11 : 8);
    if (f.multi) n = Math.round(n * 1.6);
    if (f.density === 'dense') n = Math.round(n * 1.7); else if (f.density === 'mild') n = Math.max(3, Math.round(n * 0.55));
    const base = (P.post ? 1.5 : 2.1) * Math.sqrt(P.k);
    const pts = [];
    const sp = P.span && !P.post ? P.span : null;
    if (P.span && P.span.full && P.post) {
      // “in all four quadrants” of the posterior pole: a ring around the fovea out to the arcades
      n = Math.max(n, 26);
      for (let i = 0; i < n; i++) { const a = rng() * TAU, r = 18 + Math.sqrt(rng()) * 78; pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.85]); }
    } else if (sp) {
      const [r1, r2] = bandRadii(P), span = RD.spanHours(sp.s, sp.e);
      n = Math.max(n, Math.round(span * (f.density === 'dense' ? 9 : 5)));
      for (let i = 0; i < n; i++) { const h = sp.s + span * (i + rng()) / n; const r = r1 + rng() * (r2 - r1); const a = RD.hourToAngle(h); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    } else {
      const spread = (P.site === 'macula' && P.x === 0 && P.y === 0 ? 30 : P.post ? 13 : 22) * Math.sqrt(P.k);
      for (let i = 0, tries = 0; i < n && tries < n * 30; tries++) {
        const a = rng() * TAU, r = Math.sqrt(rng()) * spread;
        const x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r * 0.85;
        if (P.site === 'macula' && Math.hypot(x, y) < 4) continue;
        if (pts.some(q => Math.hypot(q[0] - x, q[1] - y) < base * 1.6)) continue;
        pts.push([x, y]); i++;
      }
    }
    for (const [x, y] of pts) { const r = base * (0.65 + rng() * 0.7); paint(ctx, blob(x, y, r, r * (0.75 + rng() * 0.3), rng() * TAU, rng, 0.1), dst, { x, y, r }, { lw: 0.7 }); }
  },
  ring(ctx, f, P, E, st) {
    const r = sizeOf(P, 'ring'), rng = rngFor(f, 4);
    for (const [x, y] of copies(f, P, r * 2.6, rng)) {
      if (has(st.fill)) { ctx.fillStyle = fillOf(st.fill, 0.5); ctx.fill(circle(x, y, r * 0.4)); }
      if (st.pattern === 'dots') {
        const col = strokeOf(st.pcolor), n = Math.max(10, Math.round(r * TAU / 2.6));
        ctx.fillStyle = col;
        for (let i = 0; i < n; i++) { const a = i / n * TAU + rng() * 0.15, rr = r * (0.9 + rng() * 0.2); ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, P.post ? 0.9 : 1.4, 0, TAU); ctx.fill(); }
      } else {
        ctx.strokeStyle = strokeOf(has(st.outline) ? st.outline : st.pcolor); ctx.lineWidth = P.post ? 1.2 : 1.8;
        ctx.stroke(circle(x, y, r));
        if (st.pattern === 'ring') { ctx.lineWidth = 0.9; ctx.stroke(circle(x, y, r * 0.6)); }
      }
    }
  },
  band_circumferential(ctx, f, P, E, st) {
    const rng = rngFor(f, 5), sp = spanOf(P, 0.75 * P.k), [r1, r2] = bandRadii(P);
    const path = bandPath(r1, r2, sp.s, sp.e, !sp.full, rng, 0);
    const mid = RD.midHour(sp.s, sp.e), [cx, cy] = Hh.at((r1 + r2) / 2, mid);
    paint(ctx, path, st, { x: cx, y: cy, r: Math.max(r2, 60) }, { seed: f.seed, u: 3.6, angle: RD.hourToAngle(mid), lw: 1.3, alpha: has(st.fill) ? Math.min(0.55, ALPHA[st.fill]) : undefined });
  },
  band_radial(ctx, f, P, E, st) {
    const L = sizeOf(P, 'band_radial'), rng = rngFor(f, 6), a = radialAngle(P);
    for (const [x, y] of copies(f, P, L * 0.9, rng)) { const p = blob(x, y, L, L * 0.34, a, rng, 0.05); paint(ctx, p, st, { x, y, r: L }, { seed: f.seed, u: 2.6, angle: a + Math.PI / 2 }); }
  },
  sector_region(ctx, f, P, E, st) {
    const rng = rngFor(f, 7);
    if (P.post || !P.span && P.h == null) {
      const r = sizeOf(P, 'sector_region');
      const p = blob(P.x, P.y, r, r * 0.8, radialAngle(P), rng, 0.16);
      paint(ctx, p, st, { x: P.x, y: P.y, r }, { seed: f.seed, alpha: has(st.fill) ? 0.42 : undefined });
      return;
    }
    const sp = spanOf(P, 1.2 * P.k), rIn = P.site === 'ora' ? 262 : P.site === 'periphery' ? 205 : 150;
    const path = sp.full ? ringPath(rIn, G.R_ORA - 2) : bandPath(rIn, G.R_ORA - 2, sp.s, sp.e, false, rng, 7);
    const mid = RD.midHour(sp.s, sp.e), [cx, cy] = Hh.at((rIn + G.R_ORA) / 2, mid);
    paint(ctx, path, st, { x: cx, y: cy, r: 120 }, { seed: f.seed, u: 4, alpha: has(st.fill) ? 0.38 : undefined });
  },
  line(ctx, f, P, E, st) {
    const col = strokeOf(has(st.outline) ? st.outline : has(st.pcolor) ? st.pcolor : st.fill) || '#555';
    const rng = rngFor(f, 8), L = sizeOf(P, 'line'), lw = P.post ? 1.4 : 2.1;
    const lines = [];
    if (P.span && E.o !== 'radial' && !P.post) {
      const sp = P.span, span = RD.spanHours(sp.s, sp.e), r = Math.hypot(P.x, P.y) || 200, n = Math.max(12, Math.round(span * 20));
      const pts = []; for (let i = 0; i <= n; i++) { const a = RD.hourToAngle(sp.s) + span * 30 * DEG * i / n; const rr = r + Math.sin(i * 0.9) * 1.5; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
      lines.push(pts);
    } else {
      for (const [x, y] of copies(f, P, L * 0.8, rng)) {
        const a = E.o === 'radial' ? radialAngle({ x, y }) : P.post ? rng() * Math.PI : radialAngle({ x, y }) + Math.PI / 2;
        const pts = []; for (let t = -1; t <= 1.0001; t += 0.1) { const w = Math.sin(t * 4 + rng()) * L * 0.05; pts.push([x + Math.cos(a) * L * t - Math.sin(a) * w, y + Math.sin(a) * L * t + Math.cos(a) * w]); }
        lines.push(pts);
      }
    }
    ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const pts of lines) {
      ctx.lineWidth = lw; ctx.stroke(polyline(pts));
      if (st.pattern === 'short_lines' || st.pattern === 'cross_hatch') {
        ctx.lineWidth = lw * 0.6;
        for (let i = 1; i < pts.length - 1; i += 2) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i + 1]; let tx = x1 - x0, ty = y1 - y0; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l; const [x, y] = pts[i], s = lw * 2.2; ctx.beginPath(); ctx.moveTo(x - ty * s, y + tx * s); ctx.lineTo(x + ty * s, y - tx * s); ctx.stroke(); }
      }
    }
  },
  vessel_segment(ctx, f, P, E, st, scene) {
    const kinds = has(E.outline) && E.outline === 'blue' || E.fill === 'blue' ? ['v'] : null;
    const pts = nearestVessel(scene.eye, P.x, P.y, sizeOf(P, 'vessel_segment'), kinds);
    if (pts.length < 2) return;
    const col = strokeOf(has(st.fill) ? st.fill : has(st.outline) ? st.outline : st.pcolor);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    switch (st.pattern) {
      case 'parallel_hatch': for (const d of [-2.4, 2.4]) { ctx.strokeStyle = col; ctx.lineWidth = 0.9; ctx.stroke(polyline(offsetLine(pts, d))); } ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.6; ctx.stroke(polyline(pts)); break;
      case 'wavy_lines': { const w = []; let arc = 0; pts.forEach((p, i) => { if (i) arc += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]); w.push(offsetLine([pts[Math.max(0, i - 1)], p, pts[Math.min(pts.length - 1, i + 1)]], Math.sin(arc / 2.2) * 2.4)[1]); }); ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke(polyline(w)); break; }
      case 'stipple': case 'dots': { ctx.strokeStyle = col; ctx.lineWidth = 2.6; ctx.globalAlpha = 0.55; ctx.stroke(polyline(pts)); ctx.globalAlpha = 1; ctx.fillStyle = col; let arc = 0; pts.forEach((p, i) => { if (i) arc += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]); if (i % 3 === 0) { ctx.beginPath(); ctx.arc(p[0], p[1], 2.1 + Math.sin(arc) * 0.6, 0, TAU); ctx.fill(); } }); break; }
      default: ctx.strokeStyle = col; ctx.lineWidth = E.fill === 'blue' ? 4.2 : 3.2; ctx.stroke(polyline(pts));
        if (E.fill === 'blue') { ctx.fillStyle = col; pts.forEach((p, i) => { if (i % 4 === 2) { ctx.beginPath(); ctx.arc(p[0], p[1], 3.4, 0, TAU); ctx.fill(); } }); }
    }
  },
  cloud(ctx, f, P, E, st) {
    const rng = rngFor(f, 9);
    const col = INK[has(st.fill) ? st.fill : has(st.pcolor) ? st.pcolor : st.outline] || INK.green;
    const center = P.site === 'vitreous' && P.h == null;
    const R = (center ? 118 : sizeOf(P, 'cloud')) * Math.min(1.6, P.k);
    const n = Math.round((f.density === 'dense' ? 620 : f.density === 'mild' ? 160 : 320) * Math.min(1.8, P.k));
    for (let i = 0; i < n; i++) {
      const u = (rng() + rng() + rng() - 1.5) / 1.5, v = (rng() + rng() + rng() - 1.5) / 1.5;
      const x = P.x + u * R, y = P.y + v * R * 0.8;
      if (Math.hypot(x, y) > G.R_ORA - 2) continue;
      ctx.fillStyle = hexA(col, 0.18 + rng() * 0.4);
      ctx.beginPath(); ctx.arc(x, y, (st.pattern === 'dots' ? 1.2 : 0.6) + rng() * 1.1, 0, TAU); ctx.fill();
    }
  },
};
GENERIC.disc_change = function (ctx, f, P, E, st, scene) { // fallback for disc entries without a recipe
  const [dx, dy] = RD.discCenter(scene.eye);
  paint(ctx, circle(dx, dy, G.DISC_R + 2), st, { x: dx, y: dy, r: G.DISC_R }, { alpha: 0.45 });
};
/* several of a point-like finding (“3 cotton-wool spots”), spread around the anchor or across a span */
function copies(f, P, gap, rng) {
  const n = Math.max(1, Math.min(14, f.count || (f.multi ? 4 : 1)));
  if (n === 1) return [[P.x, P.y]];
  const out = [];
  if (f.start != null && !P.post && !f.quad) {
    const span = RD.spanHours(f.start, f.end), r = Math.hypot(P.x, P.y);
    for (let i = 0; i < n; i++) { const a = RD.hourToAngle(f.start + span * (i + 0.5) / n); out.push([Math.cos(a) * r, Math.sin(a) * r]); }
    return out;
  }
  for (let i = 0, tries = 0; i < n && tries < 400; tries++) {
    const a = rng() * TAU, r = gap * (0.4 + Math.sqrt(rng()) * 1.1);
    const x = P.x + Math.cos(a) * r * (i ? 1 : 0), y = P.y + Math.sin(a) * r * (i ? 1 : 0);
    if (out.some(q => Math.hypot(q[0] - x, q[1] - y) < gap * 0.8)) continue;
    out.push([x, y]); i++;
  }
  return out;
}

/* ------------------------------ purpose-built --------------------------- */
const RED = INK.red, BLUE = INK.blue, YEL = INK.yellow, GRN = INK.green, BRN = INK.brown, BLK = INK.black;
function flameAt(ctx, x, y, ang, len, w, col) {
  const p = new Path2D(), ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux;
  p.moveTo(x - ux * len * 0.5, y - uy * len * 0.5);
  p.quadraticCurveTo(x + vx * w * 1.5, y + vy * w * 1.5, x + ux * len * 0.5, y + uy * len * 0.5);
  p.quadraticCurveTo(x - vx * w * 0.9, y - vy * w * 0.9, x - ux * len * 0.5, y - uy * len * 0.5);
  ctx.fillStyle = col; ctx.fill(p);
}
function laserSpot(ctx, x, y, r, col) {
  ctx.fillStyle = 'rgba(176,138,96,0.32)'; ctx.beginPath(); ctx.arc(x, y, r * 1.75, 0, TAU); ctx.fill();
  ctx.fillStyle = col || '#2F2622'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}
function frondAt(ctx, x, y, R, col, rng, outline) {
  const fillC = hexA(col, 0.18);
  ctx.fillStyle = fillC; ctx.fill(blob(x, y, R, R * 0.85, 0, rng, 0.15));
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, R / 12); ctx.lineCap = 'round';
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + rng() * 0.5, l = R * (0.6 + rng() * 0.5), b = (rng() - 0.5) * 1.4;
    const ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + Math.cos(a + b) * l * 0.7, y + Math.sin(a + b) * l * 0.7, ex + Math.cos(a + 1.6) * l * 0.4, ey + Math.sin(a + 1.6) * l * 0.4, ex, ey);
    ctx.bezierCurveTo(ex + Math.cos(a - 1.6) * l * 0.35, ey + Math.sin(a - 1.6) * l * 0.35, x + Math.cos(a - b) * l * 0.5, y + Math.sin(a - b) * l * 0.5, x + Math.cos(a) * l * 0.2, y + Math.sin(a) * l * 0.2);
    ctx.stroke();
  }
  if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = Math.max(0.8, R / 9); ctx.setLineDash([3, 2]); ctx.stroke(blob(x, y, R * 1.08, R * 0.92, 0, rng, 0.12)); ctx.setLineDash([]); }
}
function inSector(x, y, sp) {
  if (!sp || sp.full) return true;
  return RD.inSpan(RD.angleToHour(Math.atan2(y, x)), sp.s, sp.e);
}

const RECIPE = {
  ftmh(ctx, f, P) {
    const r = 4.4 * P.k;
    ctx.fillStyle = 'rgba(104,170,232,0.32)'; ctx.beginPath(); ctx.arc(P.x, P.y, r * 1.9, 0, TAU); ctx.fill();
    ctx.strokeStyle = BLUE; ctx.lineWidth = 0.8; ctx.setLineDash([2, 1.6]); ctx.stroke(circle(P.x, P.y, r * 1.9)); ctx.setLineDash([]);
    paint(ctx, circle(P.x, P.y, r), { fill: 'red', outline: 'blue', pattern: 'none' }, { x: P.x, y: P.y, r }, { lw: 1.1, alpha: 0.95 });
  },
  lmh(ctx, f, P) { const r = 4.4 * P.k; paint(ctx, circle(P.x, P.y, r), { fill: 'none', outline: 'blue', pattern: 'cross_hatch', pcolor: 'red' }, { x: P.x, y: P.y, r }, { lw: 1.1, u: 1.4 }); },
  imh(ctx, f, P) { const r = 4 * P.k; ctx.strokeStyle = STROKE.yellow; ctx.lineWidth = 1.5; ctx.stroke(circle(P.x, P.y, r)); ctx.fillStyle = INK.yellow; ctx.beginPath(); ctx.arc(P.x, P.y, 1.3, 0, TAU); ctx.fill(); },
  pseudohole(ctx, f, P) {
    const r = 3.2 * P.k;
    ctx.fillStyle = hexA(RED, 0.85); ctx.fill(circle(P.x, P.y, r));
    ctx.strokeStyle = GRN; ctx.lineWidth = 1.4; ctx.stroke(circle(P.x, P.y, r * 1.9));
    ctx.save(); ctx.clip(circle(P.x, P.y, r * 5)); pattern(ctx, 'wavy_lines', 'green', { x: P.x, y: P.y, r: r * 4 }, { u: 2.2 }); ctx.restore();
  },
  cuff(ctx, f, P) {
    const [x, y] = Hh.at(G.TEAR_R - 6, P.h), r = 4.6 * P.k;
    ctx.fillStyle = 'rgba(104,170,232,0.34)'; ctx.fill(blob(x, y, r * 2.6, r * 2.2, radialAngle({ x, y }), rngFor(f), 0.08));
    ctx.strokeStyle = BLUE; ctx.lineWidth = 1.1; ctx.stroke(blob(x, y, r * 2.6, r * 2.2, radialAngle({ x, y }), rngFor(f), 0.08));
    paint(ctx, circle(x, y, r), { fill: 'red', outline: 'blue', pattern: 'none' }, { x, y, r }, { lw: 1.4, alpha: 0.95 });
  },
  bridging(ctx, f, P) {
    const [x, y] = Hh.at(G.TEAR_R, P.h), a = radialAngle({ x, y }), r = 9 * P.k;
    paint(ctx, blob(x, y, r * 1.1, r * 0.75, a + Math.PI / 2, rngFor(f), 0.05), { fill: 'red', outline: 'blue', pattern: 'none' }, { x, y, r }, { lw: 1.6, alpha: 0.95 });
    ctx.strokeStyle = '#B9332C'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
    ctx.beginPath(); ctx.moveTo(x - ux * 34 + vx * 3, y - uy * 34 + vy * 3); ctx.quadraticCurveTo(x - vx * 2, y - vy * 2, x + ux * 16 + vx * 4, y + uy * 16 + vy * 4); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.7; ctx.stroke();
  },
  schisis(ctx, f, P, E, st) {
    const sp = spanOf(P, 1.2 * P.k), span = sp.full ? 12 : RD.spanHours(sp.s, sp.e);
    const depth = 58 * P.k, a1 = RD.hourToAngle(sp.s), A = span * 30 * DEG, n = Math.max(30, Math.round(A * 50));
    const p = new Path2D();
    p.arc(0, 0, G.R_ORA - 2, a1, a1 + A);
    for (let i = n; i >= 0; i--) { const t = i / n, a = a1 + A * t, r = G.R_ORA - 2 - depth * (sp.full ? 1 : Math.pow(Math.sin(Math.PI * t), 0.55)); p.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    p.closePath();
    const mid = RD.midHour(sp.s, sp.e), [cx, cy] = Hh.at(G.R_ORA - depth / 2, mid);
    paint(ctx, p, { fill: 'blue', outline: 'blue', pattern: 'cross_hatch', pcolor: 'blue' }, { x: cx, y: cy, r: 140 }, { alpha: 0.12, u: 5, lw: 1.5 });
    domeShade(ctx, p, cx, cy, depth);
  },
  trd(ctx, f, P) {
    const rng = rngFor(f, 11), R = 34 * P.k, n = 6, a0 = radialAngle(P);
    const v = []; for (let i = 0; i < n; i++) { const a = a0 + i / n * TAU + (rng() - 0.5) * 0.3, r = R * (0.85 + rng() * 0.3); v.push([P.x + Math.cos(a) * r, P.y + Math.sin(a) * r * 0.82]); }
    const p = new Path2D(); p.moveTo(v[0][0], v[0][1]);
    for (let i = 0; i < n; i++) { const A = v[i], B = v[(i + 1) % n]; const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2; p.quadraticCurveTo(mx + (P.x - mx) * 0.22, my + (P.y - my) * 0.22, B[0], B[1]); }
    p.closePath();
    paint(ctx, p, { fill: 'blue', outline: 'blue', pattern: 'none' }, { x: P.x, y: P.y, r: R }, { alpha: 0.32, lw: 1.6 });
    const mem = nearestVessel(ctx.__eye || 'OS', P.x, P.y, R * 1.15, ['v']);
    if (mem.length > 1) { ctx.strokeStyle = GRN; ctx.lineWidth = 3.2; ctx.globalAlpha = 0.85; ctx.lineCap = 'round'; ctx.stroke(polyline(offsetLine(mem, 1.5))); ctx.globalAlpha = 1; }
    for (const q of v) { ctx.strokeStyle = GRN; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(q[0] * 0.55 + P.x * 0.45, q[1] * 0.55 + P.y * 0.45); ctx.stroke(); }
  },
  pvd(ctx, f, P, E, st, scene) {
    RECIPE.weiss(ctx, f, P, E, st, scene);
    ctx.strokeStyle = hexA(GRN, 0.7); ctx.lineWidth = 1.3; ctx.setLineDash([7, 5]);
    ctx.stroke(circle(-RD.discCenter(scene.eye)[0] * 0.15, 0, 128)); ctx.setLineDash([]);
  },
  weiss(ctx, f, P, E, st, scene) {
    const [dx, dy] = RD.discCenter(scene.eye), x = dx * 0.86, y = dy - 9;
    ctx.strokeStyle = GRN; ctx.lineWidth = 2.1; ctx.stroke(blob(x, y, 10, 7.5, 0.3, rngFor(f, 12), 0.12));
  },
  boat(ctx, f, P) {
    const r = 15 * P.k, x = P.x, y = P.y, top = y - r * 0.25;
    const p = new Path2D();
    const half = Math.sqrt(r * r - (top - y) * (top - y));
    p.moveTo(x - half, top);
    p.arc(x, y, r, Math.atan2(top - y, -half), Math.atan2(top - y, half), true);
    p.closePath();
    paint(ctx, p, { fill: 'red', outline: 'red', pattern: 'none' }, { x, y, r }, { lw: 1.2, alpha: 0.88 });
    ctx.fillStyle = 'rgba(232,190,90,0.55)'; ctx.fillRect(x - half * 0.94, top, half * 1.88, Math.max(1.4, r * 0.14));
  },
  frond(ctx, f, P, E, st, scene) {
    const rng = rngFor(f, 13);
    if (P.site === 'disc') { const [dx, dy] = RD.discCenter(scene.eye); frondAt(ctx, dx, dy, G.DISC_R * 1.05 * P.k, INK[E.fill] || INK.purple, rng); return; }
    for (const [x, y] of copies(f, P, 26, rng)) frondAt(ctx, x, y, (P.post ? 9 : 14) * P.k, INK[E.fill] || INK.purple, rng, E.outline === 'green' ? GRN : null);
  },
  prp(ctx, f, P, E, st, scene) {
    const sp = P.span || { s: 12, e: 12, full: true }, rng = rngFor(f, 14), [dx] = RD.discCenter(scene.eye);
    for (let r = 108; r <= G.R_ORA - 12; r += 15) {
      const n = Math.round(TAU * r / 15.5);
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + (r % 19) * 0.01 + (rng() - 0.5) * 0.03, x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (!inSector(x, y, sp)) continue;
        if (Math.hypot(x - dx, y) < 70) continue;
        laserSpot(ctx, x + (rng() - 0.5) * 2, y + (rng() - 0.5) * 2, 1.7, '#2A221E');
      }
    }
  },
  grid(ctx, f, P) {
    const rng = rngFor(f, 15);
    for (let r = 9; r <= 34; r += 4.2) { const n = Math.round(TAU * r / 4.4); for (let i = 0; i < n; i++) { const a = i / n * TAU + rng() * 0.2; laserSpot(ctx, Math.cos(a) * r, Math.sin(a) * r, 0.75, '#2A221E'); } }
  },
  gas(ctx, f, P, E) {
    const small = E.id === 'pneumatic_retinopexy';
    const level = small ? -150 : -40, R = G.R_ORA - 6;
    const half = Math.sqrt(R * R - level * level), a1 = Math.atan2(level, -half), a2 = Math.atan2(level, half);
    const p = new Path2D(); p.moveTo(-half, level); p.arc(0, 0, R, a1, a2); p.closePath();
    ctx.fillStyle = 'rgba(46,154,85,0.06)'; ctx.fill(p);
    ctx.strokeStyle = GRN; ctx.lineWidth = 1.5; ctx.setLineDash([8, 5]); ctx.stroke(p); ctx.setLineDash([]);
    ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-half, level); ctx.lineTo(half, level); ctx.stroke();
    ctx.fillStyle = GRN; ctx.font = 'italic 600 13px ' + Hh.FONT_UI; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(small ? 'gas bubble' : 'gas', 0, level - 6);
  },
  oil(ctx, f, P) {
    const R = G.R_ORA - 8;
    ctx.save(); ctx.clip(circle(0, 0, R));
    ctx.strokeStyle = 'rgba(46,154,85,0.16)'; ctx.lineWidth = 1;
    for (let y = -R; y <= R; y += 7) { ctx.beginPath(); ctx.moveTo(-R, y); ctx.lineTo(R, y); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = GRN; ctx.lineWidth = 1.6; ctx.setLineDash([10, 5]); ctx.stroke(circle(0, 0, R)); ctx.setLineDash([]);
    ctx.fillStyle = GRN; ctx.font = 'italic 600 13px ' + Hh.FONT_UI; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('silicone oil', 0, -R + 16);
  },
  flame(ctx, f, P, E, st, scene) {
    const rng = rngFor(f, 16), [dx, dy] = RD.discCenter(scene.eye);
    const all = P.span && P.span.full;
    const n = f.count || (all ? 30 : f.multi || f.density === 'dense' ? 14 : 8), spread = (P.post ? 15 : 24) * P.k;
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, r = all ? 22 + Math.sqrt(rng()) * 80 : Math.sqrt(rng()) * spread;
      const x = (all ? 0 : P.x) + Math.cos(a) * r, y = (all ? 0 : P.y) + Math.sin(a) * r;
      flameAt(ctx, x, y, Math.atan2(y - dy, x - dx), (P.post ? 5.5 : 8) * (0.7 + rng() * 0.6), P.post ? 1.6 : 2.4, hexA(RED, 0.88));
    }
  },
  mstar(ctx, f, P) {
    const rng = rngFor(f, 17);
    ctx.strokeStyle = STROKE.yellow; ctx.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU + (rng() - 0.5) * 0.15;
      for (let r = 6; r < 26; r += 4.5 + rng() * 2) { ctx.lineWidth = 1.1 + rng() * 0.5; ctx.beginPath(); ctx.moveTo(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r); ctx.lineTo(P.x + Math.cos(a) * (r + 2.8), P.y + Math.sin(a) * (r + 2.8)); ctx.stroke(); }
    }
  },
  cme(ctx, f, P) {
    ctx.strokeStyle = STROKE.yellow; ctx.fillStyle = fillOf('yellow', 0.22); ctx.lineWidth = 0.9;
    const c = circle(P.x, P.y, 2.4); ctx.fill(c); ctx.stroke(c);
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, x = P.x + Math.cos(a) * 6, y = P.y + Math.sin(a) * 6; const p = new Path2D(); p.ellipse(x, y, 3.1, 1.8, a, 0, TAU); ctx.fill(p); ctx.stroke(p); }
    ctx.strokeStyle = hexA(INK.yellow, 0.6); ctx.setLineDash([2, 2]); ctx.stroke(circle(P.x, P.y, 11)); ctx.setLineDash([]);
  },
  vo(ctx, f, P, E, st, scene) {
    const rng = rngFor(f, 18), [dx, dy] = RD.discCenter(scene.eye);
    const sp = P.span || (P.h != null ? { s: P.h - 1.5, e: P.h + 1.5 } : { s: 12, e: 12, full: true });
    const full = sp.full || RD.spanHours(sp.s, sp.e) >= 12, span = full ? 12 : RD.spanHours(sp.s, sp.e);
    const n = Math.round(span * (full ? 14 : 18));
    for (let i = 0; i < n; i++) {
      const h = sp.s + span * rng(), r = 22 + Math.pow(rng(), 1.5) * 190, a = RD.hourToAngle(h);
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (Math.hypot(x - dx, y - dy) < G.DISC_R + 4) continue;
      flameAt(ctx, x, y, Math.atan2(y - dy, x - dx), 6 + rng() * 6, 2 + rng() * 1.2, hexA(RED, 0.82));
    }
    // dilated, tortuous veins in the territory
    ctx.strokeStyle = hexA(INK.blue, 0.9); ctx.lineCap = 'round';
    for (const v of RR.vesselPaths(scene.eye).filter(v => v.k === 'v' && v.w === 1)) {
      const seg = v.pts.filter(p => inSector(p[0], p[1], full ? null : sp) && Math.hypot(p[0], p[1]) > 20);
      if (seg.length < 3) continue;
      let arc = 0; const w = seg.map((p, i) => { if (i) arc += Math.hypot(p[0] - seg[i - 1][0], p[1] - seg[i - 1][1]); return offsetLine([seg[Math.max(0, i - 1)], p, seg[Math.min(seg.length - 1, i + 1)]], Math.sin(arc / 6) * 2)[1]; });
      ctx.lineWidth = 3.4; ctx.stroke(polyline(w));
    }
    if (full) { const g = ctx.createRadialGradient(dx, dy, G.DISC_R - 2, dx, dy, G.DISC_R + 8); g.addColorStop(0, 'rgba(224,170,16,0.5)'); g.addColorStop(1, 'rgba(224,170,16,0)'); ctx.fillStyle = g; ctx.fill(circle(dx, dy, G.DISC_R + 8)); }
  },
  ao(ctx, f, P, E, st, scene) {
    const [dx, dy] = RD.discCenter(scene.eye), sp = P.span || { s: P.h - 1.2, e: P.h + 1.2 };
    const a1 = RD.hourToAngle(sp.s), a2 = a1 + RD.spanHours(sp.s, sp.e) * 30 * DEG;
    const p = new Path2D(); p.moveTo(dx * 0.85, dy); p.lineTo(Math.cos(a1) * 150, Math.sin(a1) * 150); p.arc(0, 0, 150, a1, a2); p.closePath();
    paint(ctx, p, { fill: 'yellow', outline: 'yellow', pattern: 'stipple', pcolor: 'yellow' }, { x: Math.cos((a1 + a2) / 2) * 80, y: Math.sin((a1 + a2) / 2) * 80, r: 80 }, { alpha: 0.3, lw: 1.1, dash: [4, 3], u: 3.4 });
    const am = (a1 + a2) / 2, ex = dx * 0.6 + Math.cos(am) * 26, ey = Math.sin(am) * 26;
    ctx.fillStyle = BRN; ctx.beginPath(); ctx.ellipse(ex, ey, 2.4, 1.6, am, 0, TAU); ctx.fill();
  },
  crao(ctx, f, P, E, st, scene) {
    const [dx] = RD.discCenter(scene.eye);
    const p = blob(dx * 0.4, 0, 98, 82, 0, rngFor(f, 19), 0.07);
    ctx.save(); ctx.fillStyle = fillOf('yellow', 0.3); ctx.fill(p); ctx.restore();
    ctx.save(); ctx.clip(p); pattern(ctx, 'stipple', 'yellow', { x: dx * 0.4, y: 0, r: 90 }, { u: 4 }); ctx.restore();
    ctx.strokeStyle = STROKE.yellow; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.stroke(p); ctx.setLineDash([]);
    RECIPE.crs(ctx, f, { x: 0, y: 0, k: 1 });
  },
  cilio(ctx, f, P, E, st, scene) {
    const [dx] = RD.discCenter(scene.eye), x = dx * 0.52;
    const p = blob(x, 0, Math.abs(dx) * 0.42, 11, 0, rngFor(f, 20), 0.08);
    paint(ctx, p, { fill: 'yellow', outline: 'yellow', pattern: 'stipple', pcolor: 'yellow' }, { x, y: 0, r: 30 }, { alpha: 0.45, lw: 1, u: 2.5 });
  },
  crs(ctx, f, P) {
    ctx.fillStyle = fillOf('yellow', 0.35); ctx.fill(circle(P.x, P.y, 11));
    ctx.strokeStyle = STROKE.yellow; ctx.lineWidth = 1; ctx.stroke(circle(P.x, P.y, 11));
    ctx.fillStyle = '#C8231C'; ctx.fill(circle(P.x, P.y, 3.8));
  },
  vmt(ctx, f, P) {
    ctx.strokeStyle = GRN; ctx.lineWidth = 1.3; ctx.stroke(blob(P.x, P.y, 8, 6.5, 0, rngFor(f, 21), 0.08));
    ctx.lineWidth = 1; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; ctx.beginPath(); ctx.moveTo(P.x + Math.cos(a) * 8, P.y + Math.sin(a) * 6.5); ctx.lineTo(P.x + Math.cos(a) * 19, P.y + Math.sin(a) * 15); ctx.stroke(); }
  },
  angioid(ctx, f, P, E, st, scene) {
    const [dx, dy] = RD.discCenter(scene.eye), rng = rngFor(f, 22);
    ctx.strokeStyle = BRN; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = 1.6; ctx.stroke(blob(dx, dy, G.DISC_R + 7, G.DISC_R + 7, 0, rng, 0.08));
    for (let i = 0; i < 7; i++) {
      let a = i / 7 * TAU + rng() * 0.4, x = dx + Math.cos(a) * (G.DISC_R + 7), y = dy + Math.sin(a) * (G.DISC_R + 7);
      const pts = [[x, y]], L = 40 + rng() * 45;
      for (let s = 0; s < L; s += 5) { a += (rng() - 0.5) * 0.6; x += Math.cos(a) * 5; y += Math.sin(a) * 5; pts.push([x, y]); }
      ctx.lineWidth = 2; ctx.stroke(polyline(pts));
    }
  },
  cracks(ctx, f, P) {
    const rng = rngFor(f, 23);
    ctx.strokeStyle = STROKE.yellow; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      let a = rng() * Math.PI, x = P.x + (rng() - 0.5) * 22, y = P.y + (rng() - 0.5) * 18; x -= Math.cos(a) * 14; y -= Math.sin(a) * 14;
      const pts = [[x, y]]; for (let s = 0; s < 30; s += 3.5) { a += (rng() - 0.5) * 0.5; x += Math.cos(a) * 3.5; y += Math.sin(a) * 3.5; pts.push([x, y]); }
      ctx.lineWidth = 1.3; ctx.stroke(polyline(pts));
    }
  },
  staph(ctx, f, P, E, st, scene) {
    const [dx] = RD.discCenter(scene.eye), p = blob(dx * 0.45, 0, 112 * P.k, 92 * P.k, 0, rngFor(f, 24), 0.05);
    ctx.fillStyle = 'rgba(138,90,51,0.06)'; ctx.fill(p);
    ctx.strokeStyle = BRN; ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]); ctx.stroke(p); ctx.setLineDash([]);
  },
  bullseye(ctx, f, P) {
    const p = new Path2D(); p.arc(P.x, P.y, 15, 0, TAU); p.moveTo(P.x + 8, P.y); p.arc(P.x, P.y, 8, TAU, 0, true);
    ctx.fillStyle = fillOf('brown', 0.5); ctx.fill(p);
    ctx.strokeStyle = BRN; ctx.lineWidth = 1; ctx.stroke(circle(P.x, P.y, 15)); ctx.stroke(circle(P.x, P.y, 8));
  },
  cfolds(ctx, f, P, E, st, scene) {
    const [dx] = RD.discCenter(scene.eye), cx = dx * 0.25, R = 62 * P.k;
    ctx.save(); ctx.clip(blob(cx, 0, R, R * 0.66, 0, rngFor(f, 25), 0.06));
    ctx.strokeStyle = hexA(BRN, 0.8); ctx.lineWidth = 1;
    for (let y = -R; y <= R; y += 5) { ctx.beginPath(); for (let x = cx - R; x <= cx + R; x += 2) { const yy = y + Math.sin(x / 9 + y) * 1.2; if (x === cx - R) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); } ctx.stroke(); }
    ctx.restore();
  },
  rupture(ctx, f, P, E, st, scene) {
    const [dx, dy] = RD.discCenter(scene.eye), toward = dx < 0 ? 0 : Math.PI, r = Math.abs(dx) * 0.6;
    const pts = []; for (let a = toward - 0.65; a <= toward + 0.65; a += 0.05) pts.push([dx + Math.cos(a) * r, dy + Math.sin(a) * r]);
    ctx.lineCap = 'round'; ctx.strokeStyle = BRN; ctx.lineWidth = 4.6; ctx.stroke(polyline(pts));
    ctx.strokeStyle = INK.yellow; ctx.lineWidth = 2.8; ctx.stroke(polyline(pts));
  },
  discedema(ctx, f, P, E, st, scene) {
    const [dx, dy] = RD.discCenter(scene.eye), R = G.DISC_R;
    const g = ctx.createRadialGradient(dx, dy, R - 3, dx, dy, R + 9); g.addColorStop(0, 'rgba(224,170,16,0.55)'); g.addColorStop(1, 'rgba(224,170,16,0)');
    ctx.fillStyle = g; ctx.fill(circle(dx, dy, R + 9));
    ctx.strokeStyle = STROKE.yellow; ctx.lineWidth = 0.9;
    for (let i = 0; i < 28; i++) { const a = i / 28 * TAU; ctx.beginPath(); ctx.moveTo(dx + Math.cos(a) * (R - 3), dy + Math.sin(a) * (R - 3)); ctx.lineTo(dx + Math.cos(a) * (R + 8), dy + Math.sin(a) * (R + 8)); ctx.stroke(); }
    ctx.strokeStyle = STROKE.yellow; ctx.lineWidth = 1.2; ctx.setLineDash([2, 2]); ctx.stroke(circle(dx, dy, R + 1)); ctx.setLineDash([]);
  },
  pallor(ctx, f, P, E, st, scene) { const [dx, dy] = RD.discCenter(scene.eye); ctx.fillStyle = 'rgba(255,255,255,0.86)'; ctx.fill(circle(dx, dy, G.DISC_R - 0.5)); ctx.strokeStyle = BLK; ctx.lineWidth = 1.2; ctx.stroke(circle(dx, dy, G.DISC_R)); },
  cupping(ctx, f, P, E, st, scene) {
    const [dx, dy] = RD.discCenter(scene.eye), p = new Path2D(); p.ellipse(dx, dy, G.DISC_R * 0.7, G.DISC_R * 0.86, 0, 0, TAU);
    ctx.fillStyle = '#FFF7E2'; ctx.fill(p); ctx.strokeStyle = BLK; ctx.lineWidth = 1.5; ctx.stroke(p);
  },
  dischem(ctx, f, P, E, st, scene) {
    const [dx, dy] = RD.discCenter(scene.eye), a = RD.hourToAngle(P.h != null ? P.h : 7);
    flameAt(ctx, dx + Math.cos(a) * (G.DISC_R + 1), dy + Math.sin(a) * (G.DISC_R + 1), a, 14, 2.8, hexA(RED, 0.92));
  },
  pit(ctx, f, P, E, st, scene) {
    const [dx, dy] = RD.discCenter(scene.eye), a = RD.hourToAngle(P.h != null ? P.h : RD.temporalHour(scene.eye));
    const p = new Path2D(); p.ellipse(dx + Math.cos(a) * G.DISC_R * 0.62, dy + Math.sin(a) * G.DISC_R * 0.62, 3.2, 2.2, a, 0, TAU);
    ctx.fillStyle = '#5A5F66'; ctx.fill(p); ctx.strokeStyle = BLK; ctx.lineWidth = 0.8; ctx.stroke(p);
  },
  discoloboma(ctx, f, P, E, st, scene) {
    const [dx, dy] = RD.discCenter(scene.eye), p = blob(dx, dy + 5, G.DISC_R * 1.55, G.DISC_R * 1.85, 0, rngFor(f, 26), 0.05);
    ctx.fillStyle = '#FFFFFF'; ctx.fill(p); ctx.strokeStyle = BLK; ctx.lineWidth = 1.4; ctx.stroke(p);
  },
  morningglory(ctx, f, P, E, st, scene) {
    const [dx, dy] = RD.discCenter(scene.eye), R = G.DISC_R;
    ctx.fillStyle = 'rgba(232,150,120,0.55)'; ctx.fill(circle(dx, dy, R * 1.95));
    ctx.strokeStyle = BLK; ctx.lineWidth = 1.2; ctx.setLineDash([2, 2]); ctx.stroke(circle(dx, dy, R * 1.95)); ctx.setLineDash([]);
    ctx.fillStyle = '#FFFFFF'; ctx.fill(circle(dx, dy, R * 0.9));
    ctx.strokeStyle = INK.red; ctx.lineWidth = 1.3;
    for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; ctx.beginPath(); ctx.moveTo(dx + Math.cos(a) * R * 1.9, dy + Math.sin(a) * R * 1.9); ctx.lineTo(dx + Math.cos(a) * R * 3.4, dy + Math.sin(a) * R * 3.4); ctx.stroke(); }
  },
  discdrusen(ctx, f, P, E, st, scene) {
    const [dx, dy] = RD.discCenter(scene.eye), rng = rngFor(f, 27);
    for (let i = 0; i < 9; i++) { const a = rng() * TAU, r = Math.sqrt(rng()) * G.DISC_R * 0.85, x = dx + Math.cos(a) * r, y = dy + Math.sin(a) * r; paint(ctx, circle(x, y, 1.6 + rng() * 1.1), { fill: 'yellow', outline: 'yellow', pattern: 'none' }, { x, y, r: 2 }, { lw: 0.6, alpha: 0.85 }); }
  },
  myelin(ctx, f, P, E, st, scene) {
    const [dx, dy] = RD.discCenter(scene.eye), rng = rngFor(f, 28), h = P.h != null ? P.h : 12;
    const base = RD.hourToAngle(h);
    for (let i = 0; i < 46; i++) {
      const a = base + (rng() - 0.5) * 1.3, r0 = G.DISC_R + 1, L = 20 + rng() * 26;
      const x0 = dx + Math.cos(a) * r0, y0 = dy + Math.sin(a) * r0, b = a + (rng() - 0.5) * 0.3;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(b) * L, y0 + Math.sin(b) * L); ctx.stroke();
      if (i % 3 === 0) { ctx.strokeStyle = 'rgba(37,40,44,0.45)'; ctx.lineWidth = 0.6; ctx.beginPath(); for (let t = 0; t <= L; t += 2) { const w = Math.sin(t / 3 + i) * 0.9; const x = x0 + Math.cos(b) * t - Math.sin(b) * w, y = y0 + Math.sin(b) * t + Math.cos(b) * w; if (!t) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); }
    }
  },
  ppa(ctx, f, P, E, st, scene) {
    const [dx, dy] = RD.discCenter(scene.eye), c = RD.hourToAngle(P.h != null ? P.h : RD.temporalHour(scene.eye)), R1 = G.DISC_R + 0.5, R2 = G.DISC_R + 8;
    const p = new Path2D(); p.arc(dx, dy, R2, c - 1.3, c + 1.3); p.arc(dx, dy, R1, c + 1.3, c - 1.3, true); p.closePath();
    paint(ctx, p, { fill: 'white', outline: 'black', pattern: 'stipple', pcolor: 'black' }, { x: dx + Math.cos(c) * R2, y: dy + Math.sin(c) * R2, r: 8 }, { lw: 1, u: 2.2 });
  },
  tilted(ctx, f, P, E, st, scene) {
    const [dx, dy] = RD.discCenter(scene.eye), na = RD.hourToAngle(RD.nasalHour(scene.eye) === 9 ? 7.5 : 4.5);
    const cr = new Path2D(); cr.arc(dx, dy, G.DISC_R + 6, na - 0.9, na + 0.9); cr.arc(dx, dy, G.DISC_R, na + 0.9, na - 0.9, true); cr.closePath();
    paint(ctx, cr, { fill: 'white', outline: 'black', pattern: 'none' }, { x: dx, y: dy, r: 6 }, { lw: 1 });
    const p = new Path2D(); p.ellipse(dx, dy, G.DISC_R * 0.75, G.DISC_R * 1.1, -0.5, 0, TAU); ctx.strokeStyle = BLK; ctx.lineWidth = 1.3; ctx.stroke(p);
  },
  hypoplasia(ctx, f, P, E, st, scene) {
    const [dx, dy] = RD.discCenter(scene.eye);
    ctx.fillStyle = 'rgba(250,244,230,0.95)'; ctx.fill(circle(dx, dy, G.DISC_R + 1));
    ctx.strokeStyle = BLK; ctx.lineWidth = 1; ctx.stroke(circle(dx, dy, G.DISC_R + 1));
    ctx.fillStyle = '#EDB86A'; ctx.fill(circle(dx, dy, G.DISC_R * 0.55)); ctx.lineWidth = 1.2; ctx.stroke(circle(dx, dy, G.DISC_R * 0.55));
  },
  melanocytoma(ctx, f, P, E, st, scene) {
    const [dx, dy] = RD.discCenter(scene.eye), a = RD.hourToAngle(P.h != null ? P.h : 6);
    const x = dx + Math.cos(a) * G.DISC_R * 0.7, y = dy + Math.sin(a) * G.DISC_R * 0.7;
    paint(ctx, blob(x, y, 7.5, 6, a, rngFor(f, 29), 0.18), { fill: 'brown', outline: 'black', pattern: 'none' }, { x, y, r: 7 }, { lw: 1.1, alpha: 0.95 });
  },
  rch(ctx, f, P) {
    const r = 8 * P.k, a = radialAngle(P);
    ctx.lineCap = 'round';
    for (const [col, off] of [[INK.red, -4], ['#3B5AA5', 4]]) {
      ctx.strokeStyle = col; ctx.lineWidth = 2.6;
      const pts = []; for (let t = 0; t <= 1.0001; t += 0.05) { const rr = Math.hypot(P.x, P.y) * (1 - t * 0.62); const w = Math.sin(t * 18) * 2.2 + off; pts.push([Math.cos(a) * rr - Math.sin(a) * w, Math.sin(a) * rr + Math.cos(a) * w]); }
      ctx.stroke(polyline(pts));
    }
    const p = circle(P.x, P.y, r);
    paint(ctx, p, { fill: 'red', outline: 'red', pattern: 'none' }, { x: P.x, y: P.y, r }, { lw: 1.4, alpha: 0.92 });
    domeShade(ctx, p, P.x, P.y, r);
  },
  coloboma(ctx, f, P, E, st, scene) {
    const [dx, dy] = RD.discCenter(scene.eye), rng = rngFor(f, 30);
    const p = blob(dx * 0.75, dy + 62 * P.k, 38 * P.k, 56 * P.k, 0, rng, 0.07);
    ctx.fillStyle = '#FFFFFF'; ctx.fill(p); ctx.strokeStyle = BLK; ctx.lineWidth = 1.6; ctx.stroke(p);
    ctx.save(); ctx.clip(p); ctx.fillStyle = BLK; for (let i = 0; i < 26; i++) { const a = rng() * TAU; ctx.beginPath(); ctx.arc(dx * 0.75 + Math.cos(a) * 36 * P.k, dy + 62 * P.k + Math.sin(a) * 53 * P.k, 0.8 + rng(), 0, TAU); ctx.fill(); } ctx.restore();
  },
  toxo(ctx, f, P) {
    const rng = rngFor(f, 31), r = 9 * P.k, a = radialAngle(P) + Math.PI / 2;
    const sx = P.x + Math.cos(a) * r * 1.5, sy = P.y + Math.sin(a) * r * 1.5;
    paint(ctx, blob(sx, sy, r * 0.8, r * 0.66, a, rng, 0.12), { fill: 'white', outline: 'black', pattern: 'stipple', pcolor: 'black' }, { x: sx, y: sy, r }, { lw: 1.1, u: 2 });
    for (let i = 0; i < 4; i++) { ctx.fillStyle = fillOf('yellow', 0.32); ctx.fill(blob(P.x + (rng() - 0.5) * 3, P.y + (rng() - 0.5) * 3, r * (1 + i * 0.12), r * (0.85 + i * 0.1), rng(), rng, 0.2)); }
    ctx.strokeStyle = STROKE.yellow; ctx.lineWidth = 1; ctx.setLineDash([2.5, 2]); ctx.stroke(blob(P.x, P.y, r * 1.3, r * 1.1, 0, rng, 0.15)); ctx.setLineDash([]);
  },
  spicules(ctx, f, P, E, st, scene) {
    const rng = rngFor(f, 32), sp = P.span || { s: 12, e: 12, full: true };
    ctx.strokeStyle = BLK; ctx.lineCap = 'round';
    const n = Math.round((sp.full ? 12 : RD.spanHours(sp.s, sp.e)) * 9 * (f.density === 'dense' ? 1.6 : 1));
    for (let i = 0; i < n; i++) {
      const h = sp.s + (sp.full ? 12 : RD.spanHours(sp.s, sp.e)) * rng(), r = 118 + rng() * 110, a = RD.hourToAngle(h);
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      const arms = 3 + Math.floor(rng() * 2);
      for (let k = 0; k < arms; k++) { const b = rng() * TAU, l = 2.2 + rng() * 3; ctx.lineWidth = 1 + rng() * 0.6; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(b + 0.4) * l * 0.6, y + Math.sin(b + 0.4) * l * 0.6, x + Math.cos(b) * l, y + Math.sin(b) * l); ctx.stroke(); }
    }
  },
  flecks(ctx, f, P, E, st, scene) {
    const rng = rngFor(f, 33), [dx, dy] = RD.discCenter(scene.eye);
    for (let i = 0, tries = 0; i < 30 && tries < 400; tries++) {
      const a = rng() * TAU, r = 12 + rng() * 74, x = Math.cos(a) * r, y = Math.sin(a) * r * 0.8;
      if (Math.hypot(x - dx, y - dy) < G.DISC_R + 10) continue;
      const b = rng() * Math.PI, p = new Path2D();
      p.ellipse(x, y, 3 * P.k, 1.1 * P.k, b, 0, TAU);
      p.moveTo(x + Math.cos(b) * 2.6, y + Math.sin(b) * 2.6); p.lineTo(x + Math.cos(b + 0.6) * 5, y + Math.sin(b + 0.6) * 5); p.lineTo(x + Math.cos(b - 0.3) * 4.6, y + Math.sin(b - 0.3) * 4.6); p.closePath();
      ctx.fillStyle = fillOf('yellow', 0.8); ctx.fill(p); ctx.strokeStyle = STROKE.yellow; ctx.lineWidth = 0.4; ctx.stroke(p);
      i++;
    }
  },
};

/* ------------------------------ layers & entry point -------------------- */
const DEEP_GROUPS = new Set(['tumors_pigment', 'dystrophies']);
const DEEP_RECIPES = new Set(['prp', 'grid', 'staph', 'cfolds', 'angioid', 'cracks', 'coloboma', 'rupture', 'spicules', 'flecks', 'schisis']);
const DEEP_IDS = new Set(['geographic_atrophy', 'drusen_hard', 'drusen_soft', 'pigment_epithelial_detachment', 'rpe_tear', 'csc_serous_detachment', 'polypoidal_choroidal_vasculopathy',
  'choroidal_neovascularization', 'disciform_scar', 'myopic_chorioretinal_atrophy', 'fuchs_spot', 'bulls_eye_maculopathy', 'peripheral_chorioretinal_atrophy', 'peripheral_chorioretinal_scar',
  'chorioretinal_scar', 'toxoplasmosis_scar', 'histoplasmosis_spots', 'multifocal_choroiditis', 'punctate_inner_choroidopathy', 'birdshot_chorioretinopathy', 'serpiginous_choroiditis',
  'apmppe', 'mewds', 'dalen_fuchs_nodules', 'choroidal_granuloma_tuberculoma', 'reticular_pigmentary_degeneration', 'peripheral_pigment_clumping', 'peripheral_drusen', 'dark_without_pressure',
  'fresh_laser_burns', 'elschnig_spots_siegrist_streaks', 'sickle_black_sunburst', 'enclosed_oral_bay', 'pars_plana_cyst']);
const RETINAL_TUMORS = new Set(['retinal_capillary_hemangioblastoma', 'astrocytic_hamartoma', 'retinal_cavernous_hemangioma', 'retinoblastoma', 'vasoproliferative_tumour', 'combined_hamartoma']);
function layerOf(E) {
  if (E.r === 'gas' || E.r === 'oil' || E.r === 'pvd' || E.r === 'weiss' || E.group === 'vitreous' || E.site === 'vitreous' || E.id === 'endophthalmitis_vitreous_opacity' || E.id === 'vitreous_snowballs' || E.id === 'retained_pfcl' || E.id === 'emulsified_silicone_oil' || E.id === 'xlrs_vitreous_veil') return 'vitreous';
  if ((DEEP_GROUPS.has(E.group) && !RETINAL_TUMORS.has(E.id)) || DEEP_RECIPES.has(E.r) || DEEP_IDS.has(E.id)) return 'deep';
  return 'retina';
}
function drawFinding(ctx, f, scene, geo) {
  const P = RD.catPlace(f, scene.eye);
  if (!P) return;
  const E = P.E, st = styleOf(E);
  ctx.save();
  ctx.__eye = scene.eye;
  try {
    const fn = RECIPE[E.r] || GENERIC[E.r] || GENERIC[E.shape] || GENERIC.patch;
    fn(ctx, f, P, E, st, scene, geo);
  } finally { ctx.restore(); }
}
/* within a layer, broad areas go down first so dots and small lesions stay visible on top */
const AREA_FIRST = { sector_region: 0, vo: 0, ao: 0, crao: 0, schisis: 0, trd: 0, staph: 0, cfolds: 0, prp: 0, band_circumferential: 1, patch: 2, dome: 2, boat: 2, frond: 3 };
function drawLayer(ctx, scene, geo, layer) {
  const list = scene.findings.filter(f => f.type === 'cat' && RD.CAT[f.key] && layerOf(RD.CAT[f.key]) === layer);
  const rank = (f) => { const E = RD.CAT[f.key]; const r = AREA_FIRST[E.r]; return r == null ? 4 : (E.r === 'patch' && (E.k || 1) * (f.size || 1) < 1.4 ? 3 : r); };
  list.sort((a, b) => rank(a) - rank(b) || a.id - b.id);
  for (const f of list) drawFinding(ctx, f, scene, geo);
}

/* bounding marker for the hover highlight */
function highlightOf(f, scene) {
  const P = RD.catPlace(f, scene.eye);
  if (!P) return null;
  const E = P.E;
  if (['gas', 'oil', 'prp', 'pvd'].includes(E.r) || (P.span && P.span.full)) return { ring: G.R_ORA - 4 };
  if (P.span && !P.post && ['band_circumferential', 'sector_region', 'schisis', 'vo', 'ao', 'cluster', 'spicules', 'line'].includes(E.r)) return { arc: P.span };
  if (E.r === 'vo' || E.r === 'crao' || E.r === 'staph' || E.r === 'flecks') return { x: RD.discCenter(scene.eye)[0] * 0.4, y: 0, r: 100 };
  if (DISC_LIKE.has(E.r) || P.site === 'disc') { const [dx, dy] = RD.discCenter(scene.eye); return { x: dx, y: dy, r: G.DISC_R + 12 }; }
  const r = Math.max(12, (SZ[E.r] || SZ[E.shape] || SZ.patch)[P.post ? 0 : 1] * P.k * 1.6 + 6);
  return { x: P.x, y: P.y, r };
}
const DISC_LIKE = new Set(['discedema', 'pallor', 'cupping', 'dischem', 'pit', 'discoloboma', 'morningglory', 'discdrusen', 'myelin', 'ppa', 'tilted', 'hypoplasia', 'melanocytoma', 'angioid', 'weiss']);

/* small legend swatch showing the entry's colour code */
function swatch(canvas, E, opts) {
  opts = opts || {};
  const S = opts.size || 28, dpr = opts.dpr || 2;
  canvas.width = S * dpr; canvas.height = S * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#FFFDF8'; Hh.roundRect(ctx, 0.5, 0.5, S - 1, S - 1, 6); ctx.fill();
  const st = styleOf(E), c = S / 2, rng = RD.mulberry32(E.ix * 97 + 11);
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const box = (r) => ({ x: c, y: c, r });
  switch (E.shape) {
    case 'point': paint(ctx, circle(c, c, 5), st, box(5), { lw: 1.4, u: 1.6 }); break;
    case 'cluster': { const dst = { fill: has(st.fill) ? st.fill : st.pcolor || st.outline, outline: has(st.fill) ? st.outline : 'none', pattern: 'none' }; for (let i = 0; i < 9; i++) { const a = rng() * TAU, r = 3 + rng() * 7.5; paint(ctx, circle(c + Math.cos(a) * r, c + Math.sin(a) * r, 1.6 + rng()), dst, box(2), { lw: 0.6 }); } break; }
    case 'ring': if (st.pattern === 'dots') { ctx.fillStyle = strokeOf(st.pcolor); for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; ctx.beginPath(); ctx.arc(c + Math.cos(a) * 8, c + Math.sin(a) * 8, 1.3, 0, TAU); ctx.fill(); } } else { if (has(st.fill)) { ctx.fillStyle = fillOf(st.fill); ctx.fill(circle(c, c, 3.5)); } ctx.strokeStyle = strokeOf(has(st.outline) ? st.outline : st.pcolor); ctx.lineWidth = 2; ctx.stroke(circle(c, c, 8)); } break;
    case 'band_circumferential': { const p = new Path2D(); p.arc(c, S * 1.25, S * 0.95, -Math.PI * 0.72, -Math.PI * 0.28); p.arc(c, S * 1.25, S * 0.62, -Math.PI * 0.28, -Math.PI * 0.72, true); p.closePath(); paint(ctx, p, st, box(10), { lw: 1.3, u: 2.4 }); break; }
    case 'band_radial': paint(ctx, blob(c, c, 10, 4, Math.PI / 2, rng, 0.04), st, box(9), { lw: 1.3, u: 2 }); break;
    case 'sector_region': { const p = new Path2D(); p.moveTo(4, S - 4); p.lineTo(S - 4, S - 4); p.lineTo(S - 4, 6); p.quadraticCurveTo(10, 8, 4, S - 4); p.closePath(); paint(ctx, p, st, box(12), { lw: 1.3, u: 2.6, alpha: has(st.fill) ? 0.5 : undefined }); break; }
    case 'line': { ctx.strokeStyle = strokeOf(has(st.outline) ? st.outline : has(st.pcolor) ? st.pcolor : st.fill); ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(5, c + 4); ctx.bezierCurveTo(10, c - 6, 17, c + 8, S - 5, c - 4); ctx.stroke(); break; }
    case 'vessel_segment': { const col = strokeOf(has(st.fill) ? st.fill : has(st.outline) ? st.outline : st.pcolor); ctx.strokeStyle = '#B9C0C7'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(3, S - 6); ctx.quadraticCurveTo(c, 4, S - 3, 8); ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = st.pattern === 'parallel_hatch' ? 1 : 3; ctx.beginPath(); ctx.moveTo(8, S - 12); ctx.quadraticCurveTo(c, 7, S - 8, 9); ctx.stroke(); break; }
    case 'cloud': { const col = INK[has(st.fill) ? st.fill : st.pcolor || st.outline] || INK.green; for (let i = 0; i < 70; i++) { const a = rng() * TAU, r = Math.sqrt(rng()) * 10; ctx.fillStyle = hexA(col, 0.3 + rng() * 0.5); ctx.beginPath(); ctx.arc(c + Math.cos(a) * r, c + Math.sin(a) * r * 0.8, 0.5 + rng() * 0.9, 0, TAU); ctx.fill(); } break; }
    case 'disc_change': { ctx.fillStyle = '#E8B055'; ctx.fill(circle(c, c, 8)); paint(ctx, circle(c, c, 9.5), st, box(8), { lw: 1.6, alpha: 0.55, u: 1.8 }); break; }
    case 'dome': { const p = circle(c, c + 1, 9.5); paint(ctx, p, st, box(9), { lw: 1.5, u: 2.2 }); domeShade(ctx, p, c, c + 1, 9.5); break; }
    default: paint(ctx, blob(c, c, 9.5, 7.5, 0.4, rng, 0.1), st, box(9), { lw: 1.4, u: 2.2 });
  }
  ctx.restore();
  return canvas;
}

root.RDCatRender = { drawLayer, drawFinding, highlightOf, swatch, styleOf, codeText, layerOf, INK };
})(typeof window !== 'undefined' ? window : globalThis);
