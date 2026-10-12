/* R/D renderer — draws a scene onto a canvas in the standard retinal
   drawing colour code (CMS LCD L33567 Appendix A): detached retina blue,
   arteries red, veins blue, full-thickness breaks red outlined in blue,
   lattice black (attached) or blue (detached) cross-hatch, vitreous
   haemorrhage green, choroidal findings brown. */
(function (root) {
'use strict';
const RD = root.RD;
const { G, DEG, TAU } = RD;

const C = {
  paper: '#FFFDF8', band: '#F3EFE7', ring: '#A7AFB7', eq: '#B9C0C7', ora: '#97A0AA', meridian: 'rgba(120,128,138,0.16)',
  num: '#4E5965', artery: '#C8463C', vein: '#3B5AA5', blue: '#2C66C4', blueInk: '#2152A6', red: '#D8423A', black: '#25282C',
  brown: '#7A5536', green: '#34915A', amber: '#DE942A', disc: '#E8B055', discRim: '#B7822F', cup: '#FBEBC4', macula: '#7C8691',
};
const FONT_NUM = '600 15px "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const FONT_UI = '"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif';

/* ---- vessel tree in the left-eye frame (temporal = +x); mirrored for OD ---- */
const V = {
  main: [
    // [kind, points] arteries 'a', veins 'v'
    ['a', [[-76, -2], [-68, -15], [-52, -35], [-30, -52], [-2, -61], [30, -65], [62, -61], [96, -57], [132, -64], [168, -82], [204, -108], [238, -140], [262, -172]]],
    ['v', [[-76, -4], [-71, -19], [-59, -41], [-37, -60], [-7, -72], [25, -77], [60, -75], [98, -71], [136, -80], [171, -100], [205, -127], [232, -161], [250, -196]]],
    ['a', [[-76, -3], [-86, -17], [-104, -35], [-128, -52], [-158, -67], [-195, -85], [-232, -106], [-264, -128]]],
    ['v', [[-77, -5], [-90, -23], [-111, -43], [-137, -62], [-169, -79], [-205, -99], [-241, -122], [-268, -148]]],
  ],
  branches: [
    ['a', [[30, -65], [36, -50], [40, -38]]], ['v', [[60, -75], [70, -55], [78, -42]]],
    ['a', [[96, -57], [128, -38], [166, -28], [210, -22], [262, -18]]], ['v', [[98, -71], [134, -52], [176, -44], [222, -40], [270, -40]]],
    ['a', [[-30, -52], [-24, -86], [-30, -126], [-44, -170], [-58, -214], [-66, -262]]],
    ['v', [[-37, -60], [-12, -98], [4, -140], [10, -188], [14, -236], [16, -280]]],
    ['a', [[168, -82], [176, -128], [180, -176], [178, -222]]], ['v', [[171, -100], [196, -150], [210, -196]]],
    ['a', [[-158, -67], [-174, -110], [-196, -156], [-212, -200]]], ['v', [[-169, -79], [-198, -126], [-224, -170]]],
  ],
};
function vesselPaths(eye) {
  const sx = eye === 'OD' ? -1 : 1;
  const out = [];
  const add = (list, w) => {
    for (const [k, pts] of list) {
      out.push({ k, w, pts: pts.map(([x, y]) => [x * sx, y]) });
      out.push({ k, w, pts: pts.map(([x, y]) => [x * sx, -y]) }); // inferior mirror
    }
  };
  add(V.main, 1);
  add(V.branches, 0.62);
  return out.map(v => ({ ...v, pts: spline(v.pts, 6) }));
}
function spline(pts, seg) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < seg; k++) {
      const t = k / seg, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function strokeTapered(ctx, pts, w0, w1, color, wobble) {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  let arc = 0;
  const P = pts.map((p, i) => {
    if (i) arc += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    if (!wobble) return p;
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const d = wobble * Math.sin(arc / 7.5) * Math.min(1, arc / 20);
    return [p[0] - ty * d, p[1] + tx * d];
  });
  for (let i = 0; i < P.length - 1; i++) {
    const t = i / (P.length - 1);
    ctx.lineWidth = w0 + (w1 - w0) * t;
    ctx.beginPath(); ctx.moveTo(P[i][0], P[i][1]); ctx.lineTo(P[i + 1][0], P[i + 1][1]); ctx.stroke();
  }
}

function pathFromLoops(loops) {
  const p = new Path2D();
  for (const L of loops) { p.moveTo(L[0][0], L[0][1]); for (let i = 1; i < L.length; i++) p.lineTo(L[i][0], L[i][1]); p.closePath(); }
  return p;
}
function pathFromPolyline(pts) { const p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); return p; }
function at(r, h) { const a = RD.hourToAngle(h); return [r * Math.cos(a), r * Math.sin(a)]; }
function arcPath(r1, r2, h1, h2) {
  const a1 = RD.hourToAngle(h1), span = RD.spanHours(h1, h2) * 30 * DEG;
  const p = new Path2D();
  p.arc(0, 0, r2, a1, a1 + span);
  p.arc(0, 0, r1, a1 + span, a1, true);
  p.closePath();
  return p;
}

/* ------------------------------ the chart ----------------------------- */
function drawChart(ctx, scene, ts) {
  ts = ts || 1;
  // paper disc
  ctx.save();
  ctx.shadowColor = 'rgba(40,60,90,0.12)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 4;
  ctx.fillStyle = C.paper; ctx.beginPath(); ctx.arc(0, 0, G.R_CB + 2, 0, TAU); ctx.fill();
  ctx.restore();
  // pars plana band
  ctx.fillStyle = C.band; ctx.beginPath(); ctx.arc(0, 0, G.R_CB, 0, TAU); ctx.arc(0, 0, G.R_ORA, 0, TAU, true); ctx.fill();
  ctx.strokeStyle = C.ring; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, G.R_CB, 0, TAU); ctx.stroke();
  // ciliary processes as faint radial ticks in the band
  ctx.strokeStyle = 'rgba(150,140,125,0.22)'; ctx.lineWidth = 1;
  for (let k = 0; k < 144; k++) { const a = k / 144 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (G.R_CB - 9), Math.sin(a) * (G.R_CB - 9)); ctx.lineTo(Math.cos(a) * (G.R_CB - 2), Math.sin(a) * (G.R_CB - 2)); ctx.stroke(); }
  // clock meridians
  ctx.strokeStyle = C.meridian; ctx.lineWidth = 1; ctx.setLineDash([2, 5]);
  for (let h = 1; h <= 12; h++) { const a = RD.hourToAngle(h); ctx.beginPath(); ctx.moveTo(Math.cos(a) * 58, Math.sin(a) * 58); ctx.lineTo(Math.cos(a) * G.R_ORA, Math.sin(a) * G.R_ORA); ctx.stroke(); }
  ctx.setLineDash([]);
  // equator
  ctx.strokeStyle = C.eq; ctx.lineWidth = 1.1; ctx.setLineDash([7, 6]);
  ctx.beginPath(); ctx.arc(0, 0, G.R_EQ, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  // ora serrata — dentate processes, more prominent nasally
  drawOra(ctx, scene.eye, C.ora, 1.1, null);
  // hour ticks + numerals
  ctx.strokeStyle = C.num; ctx.fillStyle = C.num;
  for (let k = 0; k < 24; k++) {
    const h = k / 2, a = RD.hourToAngle(h), len = k % 2 ? 4 : 8;
    ctx.lineWidth = k % 2 ? 0.8 : 1.3;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * G.R_CB, Math.sin(a) * G.R_CB); ctx.lineTo(Math.cos(a) * (G.R_CB + len), Math.sin(a) * (G.R_CB + len)); ctx.stroke();
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let h = 1; h <= 12; h++) {
    const big = h % 3 === 0;
    ctx.font = (big ? '700 ' + Math.round(17 * ts) : '600 ' + Math.round(15 * ts)) + 'px "IBM Plex Mono", ui-monospace, Menlo, monospace';
    const [x, y] = at(G.R_CB + 22 + 6 * (ts - 1), h);
    ctx.fillText(String(h), x, y + 1);
  }
}

function drawOra(ctx, eye, color, width, arcs) {
  const nasalA = RD.hourToAngle(RD.nasalHour(eye));
  const teeth = 120;
  const path = new Path2D();
  const segs = arcs || [[-Math.PI / 2, -Math.PI / 2 + TAU]];
  for (const [a0, a1] of segs) {
    const n = Math.max(8, Math.round((a1 - a0) / TAU * 900));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      const nasal = 0.5 + 0.5 * Math.cos(a - nasalA);
      const tooth = Math.pow(Math.abs(Math.sin(a * teeth / 2)), 3);
      const r = G.R_ORA + (1.2 + 2.6 * nasal) * tooth;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
    }
  }
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round';
  ctx.stroke(path);
}

function drawLandmarks(ctx, eye) {
  // vortex vein ampullae just posterior to the equator in the oblique meridians
  ctx.save();
  for (const h of [1.5, 4.5, 7.5, 10.5]) {
    const a = RD.hourToAngle(h);
    const [cx, cy] = at(G.R_EQ - 8, h);
    ctx.strokeStyle = 'rgba(140,105,80,0.42)'; ctx.lineWidth = 1;
    for (let k = -3; k <= 3; k++) {
      const b = a + Math.PI + k * 0.33;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(cx + Math.cos(b) * 10 + Math.cos(b + 0.6) * 4, cy + Math.sin(b) * 10 + Math.sin(b + 0.6) * 4, cx + Math.cos(b) * 19, cy + Math.sin(b) * 19);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(132,96,70,0.55)'; ctx.beginPath(); ctx.ellipse(cx, cy, 4, 2.6, a, 0, TAU); ctx.fill();
  }
  // long posterior ciliary nerves at 3 and 9 o'clock
  ctx.strokeStyle = 'rgba(196,160,96,0.55)'; ctx.lineWidth = 1.1;
  for (const h of [3, 9]) {
    const dir = Math.cos(RD.hourToAngle(h));
    for (const off of [-2.2, 2.2]) {
      ctx.beginPath();
      for (let r = G.R_EQ * 0.62; r <= G.R_ORA - 6; r += 4) { const y = off + Math.sin(r / 13) * 0.8; if (r === G.R_EQ * 0.62) ctx.moveTo(dir * r, y); else ctx.lineTo(dir * r, y); }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawVessels(ctx, eye, excludePath, wavy) {
  const vs = vesselPaths(eye);
  ctx.save();
  if (excludePath) {
    const clip = new Path2D();
    clip.rect(-G.SIZE, -G.SIZE, 2 * G.SIZE, 2 * G.SIZE);
    clip.addPath(excludePath);
    ctx.clip(clip, 'evenodd');
  }
  for (const v of vs.filter(v => v.k === 'v')) strokeTapered(ctx, v.pts, 2.5 * v.w, 0.9 * v.w, wavy ? '#24418A' : C.vein, wavy ? 1.9 : 0);
  for (const v of vs.filter(v => v.k === 'a')) strokeTapered(ctx, v.pts, 1.9 * v.w, 0.7 * v.w, wavy ? '#9A2E28' : C.artery, wavy ? 1.9 : 0);
  ctx.restore();
}

/* --------------------------- detachment ------------------------------ */
function drawDetachment(ctx, scene, geo) {
  const path = pathFromLoops(geo.loops);
  const rds = RD.rdsOf(scene);
  const rng = RD.mulberry32((rds[0].seed || 11) ^ 0x9e3779b9);
  const bullous = rds.some(r => r.depth === 'bullous');
  const shallow = rds.every(r => r.depth === 'shallow');
  ctx.save();
  // soft, layered colour-pencil fill
  for (let k = 0; k < 3; k++) {
    ctx.save();
    ctx.translate((rng() - 0.5) * 1.6, (rng() - 0.5) * 1.6);
    ctx.fillStyle = k === 0 ? 'rgba(112,176,236,0.20)' : 'rgba(96,160,228,0.11)';
    ctx.fill(path, 'evenodd');
    ctx.restore();
  }
  ctx.clip(path, 'evenodd');
  // elevated retina: lighter crest mid-detachment, darker where it rises from the attached edge
  const crest = ctx.createRadialGradient(0, 0, G.R_EQ * 0.5, 0, 0, G.R_ORA);
  crest.addColorStop(0, 'rgba(255,255,255,0)'); crest.addColorStop(0.62, 'rgba(255,255,255,0.16)'); crest.addColorStop(1, 'rgba(70,130,210,0.10)');
  ctx.fillStyle = crest; ctx.fillRect(-G.R_ORA, -G.R_ORA, 2 * G.R_ORA, 2 * G.R_ORA);

  // colour-pencil grain
  const n = shallow ? 900 : 1500;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(rng()) * G.R_ORA, a = rng() * TAU;
    const x = r * Math.cos(a), y = r * Math.sin(a);
    if (geo.F(x, y) > -1.5) continue;
    const dir = a + (rng() - 0.5) * 0.7;
    const len = 4 + rng() * 7;
    ctx.strokeStyle = `rgba(40,96,190,${0.05 + rng() * 0.09})`;
    ctx.lineWidth = 0.6 + rng() * 0.6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(dir) * len, y + Math.sin(dir) * len); ctx.stroke();
  }

  // detached vessels: darker and undulating over the elevated retina
  drawVessels(ctx, scene.eye, null, true);

  // corrugations echoing the posterior border
  const rows = bullous ? 4 : shallow ? 2 : 3;
  for (const b of geo.borders) {
    for (let k = 1; k <= rows; k++) {
      const off = k * (bullous ? 12 : 11);
      const alpha = (shallow ? 0.18 : 0.30) - k * 0.05;
      let seg = [];
      const flush = () => {
        if (seg.length > 3) {
          ctx.strokeStyle = `rgba(30,82,168,${alpha})`; ctx.lineWidth = 1.05; ctx.stroke(pathFromPolyline(seg));
          ctx.strokeStyle = `rgba(255,255,255,${alpha + 0.12})`; ctx.lineWidth = 0.8;
          ctx.save(); ctx.translate(1.1, 1.3); ctx.stroke(pathFromPolyline(seg)); ctx.restore();
        }
        seg = [];
      };
      let arc = 0;
      for (let i = 0; i < b.pts.length; i++) {
        const p = b.pts[i];
        if (i) arc += Math.hypot(p[0] - b.pts[i - 1][0], p[1] - b.pts[i - 1][1]);
        const w = p[2] == null ? 1 : p[2];
        if (w < 0.35) { flush(); continue; }
        const wave = Math.sin(arc / (9 + k * 2) + k * 1.7) * (2.2 + k * 0.6);
        const d = off + wave;
        seg.push([p[0] - p[3] * d, p[1] - p[4] * d]);
      }
      flush();
    }
  }

  // radial folds (the original drawing's "wrinkles"), now embossed
  for (const it of geo.shapes) {
    const f = it.f;
    const span = f.total ? 12 : RD.spanHours(f.start, f.end);
    const count = Math.max(4, Math.round(span * (bullous ? 1.7 : 1.3)));
    const r2 = RD.mulberry32(f.seed || 5);
    for (let j = 0; j < count; j++) {
      const h = f.total ? (j + r2() * 0.6) * 12 / count : f.start + span * (0.08 + 0.84 * (j + 0.5) / count) + (r2() - 0.5) * 0.25;
      const a = RD.hourToAngle(h);
      let r0 = 24;
      while (r0 < G.R_ORA - 30 && geo.F(Math.cos(a) * r0, Math.sin(a) * r0) > -4) r0 += 3;
      if (r0 >= G.R_ORA - 30) continue;
      r0 += 6 + r2() * 10;
      const pts = [];
      for (let r = r0; r <= G.R_ORA - 6; r += 6) {
        const t = (r - r0) / (G.R_ORA - r0);
        const da = Math.sin(r / 23 + j) * 0.035 + Math.sin(r / 9 + j * 2) * 0.012 * (1 - t);
        pts.push([Math.cos(a + da) * r, Math.sin(a + da) * r]);
      }
      if (pts.length < 3) continue;
      ctx.strokeStyle = `rgba(28,78,165,${shallow ? 0.22 : 0.38})`; ctx.lineWidth = 0.9; ctx.stroke(pathFromPolyline(pts));
      ctx.save(); ctx.translate(1.2, 1); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.7; ctx.stroke(pathFromPolyline(pts)); ctx.restore();
      // small branching creases
      for (let q = 2; q < pts.length - 2; q += 3) {
        if (r2() < 0.45) continue;
        const p = pts[q], dir = a + (r2() - 0.5) * 1.3, len = 8 + r2() * 12;
        ctx.strokeStyle = 'rgba(28,78,165,0.26)'; ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.quadraticCurveTo(p[0] + Math.cos(dir) * len * 0.6 + 2, p[1] + Math.sin(dir) * len * 0.6, p[0] + Math.cos(dir) * len, p[1] + Math.sin(dir) * len); ctx.stroke();
      }
    }
  }

  // rim shading just inside the border: the retina rising off the RPE
  for (const b of geo.borders) {
    const bp = pathFromPolyline(b.pts);
    for (const [w, a] of [[30, 0.045], [17, 0.06], [8, 0.085]]) { ctx.strokeStyle = `rgba(24,74,160,${a})`; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.stroke(bp); }
  }
  ctx.restore();

  // the bold border — the same outline as the fill
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const b of geo.borders) {
    const bp = pathFromPolyline(b.pts);
    ctx.strokeStyle = C.blue; ctx.lineWidth = 2.6; ctx.stroke(bp);
    const jr = RD.mulberry32(b.pts.length * 13 + 7);
    const j = b.pts.map(p => [p[0] + (jr() - 0.5) * 1.3, p[1] + (jr() - 0.5) * 1.3]);
    ctx.strokeStyle = 'rgba(33,82,166,0.45)'; ctx.lineWidth = 0.9; ctx.stroke(pathFromPolyline(j));
  }
  ctx.restore();
  // ora next to detached retina: black scalloped line
  drawOra(ctx, scene.eye, C.black, 1.5, geo.oraArcs.map(([a0, a1]) => [a0 + 0.004, a1 - 0.004]));
  // pigmented demarcation line for chronic detachments (in attached retina, just outside the border)
  if (rds.some(r => r.chronic)) {
    ctx.save();
    ctx.strokeStyle = 'rgba(62,46,34,0.85)'; ctx.lineWidth = 2.4; ctx.setLineDash([6, 3.5]); ctx.lineCap = 'round';
    for (const b of geo.borders) {
      const pts = b.pts.filter(p => (p[2] == null || p[2] > 0.2)).map(p => [p[0] + p[3] * 6, p[1] + p[4] * 6]);
      if (pts.length > 3) ctx.stroke(pathFromPolyline(pts));
    }
    ctx.restore();
  }
}

function drawChoroidals(ctx, scene) {
  if (!scene.findings.some(f => f.type === 'chd')) return;
  const F = RD.makeField(scene, 'chd');
  const loops = RD.contour(F, 4).map(l => RD.chaikin(l, 2));
  const path = pathFromLoops(loops);
  const hem = scene.findings.some(f => f.type === 'chd' && f.hem);
  ctx.save();
  ctx.fillStyle = hem ? 'rgba(178,58,44,0.30)' : 'rgba(150,98,52,0.17)'; ctx.fill(path, 'evenodd');
  ctx.clip(path, 'evenodd');
  ctx.strokeStyle = 'rgba(122,85,54,0.28)'; ctx.lineWidth = 0.8;
  for (let k = 0; k < 240; k++) { const a = k / 240 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (G.R_EQ - 10), Math.sin(a) * (G.R_EQ - 10)); ctx.lineTo(Math.cos(a) * G.R_ORA, Math.sin(a) * G.R_ORA); ctx.stroke(); }
  ctx.restore();
  ctx.save(); ctx.clip(circlePath(G.R_ORA - 1.5));
  ctx.strokeStyle = C.brown; ctx.lineWidth = 1.7; ctx.stroke(path); ctx.restore();
}
function circlePath(r) { const p = new Path2D(); p.arc(0, 0, r, 0, TAU); return p; }

/* Scleral buckle elements. The element itself is a light brown hatched zone under the retina; its edge is
   drawn on top, brown beneath detached retina and black beneath attached retina (the standard colour code). */
function bucklePath(f, band) {
  if (f.radial) {
    // a radial element: from just behind the ora back past the break it supports
    // wider than the tear it carries (a horseshoe tear is drawn 23 × size units across) and reaching behind it
    const s = f.size || 1, rIn = Math.max(G.R_EQ - 70, (f.r || G.TEAR_R) - 14.5 * s - 12), rOut = G.R_ORA - 6, w = 11.5 * s + 5;
    const a = RD.hourToAngle(f.hour), ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
    const p = new Path2D();
    p.moveTo(ux * rOut + vx * w, uy * rOut + vy * w);
    p.lineTo(ux * rIn + vx * w * 0.9, uy * rIn + vy * w * 0.9);
    p.quadraticCurveTo(ux * (rIn - 14), uy * (rIn - 14), ux * rIn - vx * w * 0.9, uy * rIn - vy * w * 0.9);
    p.lineTo(ux * rOut - vx * w, uy * rOut - vy * w);
    p.closePath();
    return { p, r1: rIn, r2: rOut };
  }
  if (f.encircling) {
    const r1 = G.R_ORA - 34, r2 = G.R_ORA - 18, p = new Path2D();
    p.arc(0, 0, r2, 0, TAU); p.arc(0, 0, r1, 0, TAU, true);
    return { p, r1, r2 };
  }
  // a segment on its own, or a tire under a band (broader than the band); one for a dialysis sits right at the ora
  const r1 = G.R_ORA - (f.ant ? 34 : f.onBand || band ? 46 : 40), r2 = G.R_ORA - (f.ant ? 1 : f.onBand || band ? 6 : 12);
  return { p: arcPath(r1, r2, f.start, f.end), r1, r2 };
}
function buckleList(scene) {
  const B = scene.findings.filter(x => x.type === 'buckle');
  const band = B.some(x => x.encircling);
  const order = (f) => f.radial ? 2 : f.encircling ? 1 : 0;      // broad elements first, the band over them, radial on top
  return B.slice().sort((a, b) => order(a) - order(b)).map(f => Object.assign({ f }, bucklePath(f, band)));
}
function drawBuckles(ctx, scene) {
  for (const { f, p, r1, r2 } of buckleList(scene)) {
    ctx.save();
    ctx.fillStyle = f.encircling ? 'rgba(122,85,54,0.16)' : 'rgba(122,85,54,0.12)'; ctx.fill(p, 'evenodd');
    ctx.clip(p, 'evenodd');
    ctx.strokeStyle = 'rgba(122,85,54,0.34)'; ctx.lineWidth = 0.8;
    if (f.radial) {
      const a = RD.hourToAngle(f.hour), sx = Math.sin(a), cx = Math.cos(a);
      for (let d = r1 - 16; d < r2 + 4; d += 3.2) { const x = cx * d, y = Math.sin(a) * d; ctx.beginPath(); ctx.moveTo(x - sx * 30, y + cx * 30); ctx.lineTo(x + sx * 30, y - cx * 30); ctx.stroke(); }
    } else for (let k = 0; k < 220; k++) { const a = k / 220 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.lineTo(Math.cos(a + 0.03) * r2, Math.sin(a + 0.03) * r2); ctx.stroke(); }
    ctx.restore();
  }
}
function drawBuckleEdges(ctx, scene, regionPath) {
  const L = buckleList(scene);
  if (!L.length) return;
  const stroke = (color) => { for (const { f, p } of L) { ctx.strokeStyle = color; ctx.lineWidth = f.encircling ? 1.6 : 1.4; ctx.stroke(p); } };
  if (regionPath) {
    ctx.save(); ctx.clip(regionPath, 'evenodd'); stroke(C.brown); ctx.restore();
    const outside = new Path2D(); outside.rect(-G.SIZE, -G.SIZE, 2 * G.SIZE, 2 * G.SIZE); outside.addPath(regionPath);
    ctx.save(); ctx.clip(outside, 'evenodd'); stroke('#2A2A2A'); ctx.restore();
  } else stroke('#2A2A2A');
}
/* element names (240 band, 287 tire, 511 …) in the pars plana band, beside each element */
function drawBuckleLabels(ctx, scene, ts) {
  const L = scene.findings.filter(x => x.type === 'buckle' && RD.BUCKLE_EL && RD.BUCKLE_EL[x.el]);
  if (!L.length) return;
  const used = [];
  ctx.save();
  ctx.font = `700 ${10.5 * ts}px ${FONT_UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of L) {
    let h = f.radial ? f.hour : f.encircling ? null : RD.midHour(f.start, f.end);
    if (h == null) { h = 7.5; for (const c of [7.5, 4.5, 10.5, 1.5, 6, 9, 3, 12]) if (!used.some(u => RD.hourDist(u, c) < 1.2)) { h = c; break; } }
    used.push(h);
    const [x, y] = at(G.R_CB - 11, h);
    const t = RD.BUCKLE_EL[f.el];
    // along the ring, kept upright; level near 3 and 9 o'clock where the ring runs vertically
    let rot = 0;
    if (RD.hourDist(h, 3) > 1 && RD.hourDist(h, 9) > 1) { rot = RD.hourToAngle(h) + Math.PI / 2; if (Math.cos(rot) < 0) rot += Math.PI; }
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.lineWidth = 3.2 * ts; ctx.strokeStyle = 'rgba(244,240,232,0.95)'; ctx.strokeText(t, 0, 0);
    ctx.fillStyle = '#6E4A2A'; ctx.fillText(t, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

/* ------------------------------ breaks -------------------------------- */
function local(ctx, r, h) {
  const a = RD.hourToAngle(h);
  ctx.translate(Math.cos(a) * r, Math.sin(a) * r);
  ctx.rotate(a - Math.PI / 2); // local +y points to the ora, −y to the posterior pole
}
function isDetached(geo, x, y) { return !!geo && geo.F(x, y) < 0; }

function drawHST(ctx, f, geo) {
  const s = f.size || 1, r = RD.radiusFor(f);
  const [px, py] = at(r, f.hour);
  const det = isDetached(geo, px, py);
  const w = 11.5 * s, h = 14.5 * s;
  ctx.save();
  local(ctx, r, f.hour);
  if (f.cuff) drawCuff(ctx, w * 2.1, h * 1.6);
  const outer = new Path2D();
  outer.moveTo(-w, 0.5 * h);
  outer.bezierCurveTo(-w * 1.12, -0.3 * h, -0.62 * w, -h, 0, -h);
  outer.bezierCurveTo(0.62 * w, -h, w * 1.12, -0.3 * h, w, 0.5 * h);
  outer.quadraticCurveTo(0, 0.8 * h, -w, 0.5 * h);
  outer.closePath();
  ctx.fillStyle = C.red; ctx.fill(outer);
  // flap: the tongue of retina still attached anteriorly
  const flap = new Path2D();
  flap.moveTo(-0.66 * w, 0.5 * h);
  flap.bezierCurveTo(-0.72 * w, -0.05 * h, -0.36 * w, -0.44 * h, 0, -0.44 * h);
  flap.bezierCurveTo(0.36 * w, -0.44 * h, 0.72 * w, -0.05 * h, 0.66 * w, 0.5 * h);
  flap.quadraticCurveTo(0, 0.72 * h, -0.66 * w, 0.5 * h);
  flap.closePath();
  ctx.save(); ctx.translate(0.8, 1.2); ctx.fillStyle = 'rgba(80,20,10,0.25)'; ctx.fill(flap); ctx.restore();
  ctx.fillStyle = det ? '#B9D6F2' : '#F3EEE4'; ctx.fill(flap);
  ctx.strokeStyle = C.blue; ctx.lineWidth = 1.2; ctx.stroke(flap);
  // blue outline of the break (the U)
  const u = new Path2D();
  u.moveTo(-w, 0.5 * h);
  u.bezierCurveTo(-w * 1.12, -0.3 * h, -0.62 * w, -h, 0, -h);
  u.bezierCurveTo(0.62 * w, -h, w * 1.12, -0.3 * h, w, 0.5 * h);
  ctx.strokeStyle = C.blue; ctx.lineWidth = f.rolled ? 3 : 1.8; ctx.lineCap = 'round'; ctx.stroke(u);
  if (f.rolled) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.8; ctx.stroke(u); }
  ctx.restore();
}
/* a cuff of subretinal fluid around a break: pale blue, outlined in blue (detached retina) */
function drawCuff(ctx, rx, ry) {
  ctx.save();
  ctx.fillStyle = 'rgba(104,170,232,0.32)'; ctx.strokeStyle = C.blue; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(0, -ry * 0.12, rx, ry, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function drawHole(ctx, f, geo, operculated) {
  const s = f.size || 1, r = RD.radiusFor(f);
  ctx.save();
  local(ctx, r, f.hour);
  if (f.cuff) drawCuff(ctx, 12 * s, 10 * s);
  ctx.beginPath(); ctx.arc(0, 0, (operculated ? 5.6 : 4.6) * s, 0, TAU);
  ctx.fillStyle = C.red; ctx.fill(); ctx.strokeStyle = C.blue; ctx.lineWidth = 1.6; ctx.stroke();
  if (operculated) {
    // the free operculum floats in the vitreous just in front of the hole
    ctx.beginPath(); ctx.ellipse(5 * s, -15 * s, 3.8 * s, 2.7 * s, 0.4, 0, TAU);
    ctx.fillStyle = C.red; ctx.fill(); ctx.strokeStyle = C.blue; ctx.lineWidth = 1.1; ctx.stroke();
  }
  ctx.restore();
}
function drawGRT(ctx, f) {
  const span = RD.spanHours(f.start, f.end);
  const a1 = RD.hourToAngle(f.start), a2 = a1 + span * 30 * DEG;
  const R2 = G.R_ORA - 16, R1 = G.R_ORA - 44;
  const n = Math.max(24, Math.round(span * 22));
  const post = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a1 + (a2 - a1) * t;
    const taper = Math.pow(Math.sin(Math.PI * t), 0.5);
    const r = R2 - (R2 - R1) * taper + Math.sin(t * span * 5) * 2.2 * taper;
    post.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const p = new Path2D();
  p.arc(0, 0, R2, a1, a2);
  for (let i = post.length - 1; i >= 0; i--) p.lineTo(post[i][0], post[i][1]);
  p.closePath();
  ctx.fillStyle = C.red; ctx.fill(p);
  ctx.strokeStyle = C.blue; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.stroke(p);
  // the free posterior flap, rolled
  const flap = post.map(([x, y]) => { const r = Math.hypot(x, y), a = Math.atan2(y, x); return [Math.cos(a) * (r - 5), Math.sin(a) * (r - 5)]; }).slice(2, -2);
  ctx.strokeStyle = C.blueInk; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.stroke(pathFromPolyline(flap));
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.9; ctx.stroke(pathFromPolyline(flap));
}
function drawDialysis(ctx, f) {
  const span = RD.spanHours(f.start, f.end);
  const a1 = RD.hourToAngle(f.start), a2 = a1 + span * 30 * DEG;
  const p = new Path2D();
  p.arc(0, 0, G.R_ORA - 1, a1, a2);
  const n = 40;
  for (let i = n; i >= 0; i--) { const t = i / n, a = a1 + (a2 - a1) * t, r = G.R_ORA - 1 - 15 * Math.pow(Math.sin(Math.PI * t), 0.7); p.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  p.closePath();
  ctx.fillStyle = C.red; ctx.fill(p); ctx.strokeStyle = C.blue; ctx.lineWidth = 1.7; ctx.stroke(p);
}

/* ---------------------------- degenerations --------------------------- */
function drawLattice(ctx, f, geo) {
  const span = RD.spanHours(f.start, f.end);
  const islands = Math.max(1, Math.ceil(span / 1.5));
  const rr = RD.mulberry32(f.seed || 3);
  const rL = f.r != null ? f.r : f.radial === 'post' ? G.R_EQ - 12 : G.LATTICE_R;
  for (let k = 0; k < islands; k++) {
    const gap = islands > 1 ? 0.08 : 0;
    const h1 = f.start + span * (k / islands + gap), h2 = f.start + span * ((k + 1) / islands - gap);
    const a1 = RD.hourToAngle(h1), a2 = a1 + RD.spanHours(h1, h2) * 30 * DEG;
    const rOff = (rr() - 0.5) * 8;
    const n = 30, top = [], bot = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = a1 + (a2 - a1) * t, w = 7.5 * Math.pow(Math.sin(Math.PI * t), 0.6);
      top.push([Math.cos(a) * (rL + rOff + w), Math.sin(a) * (rL + rOff + w)]);
      bot.push([Math.cos(a) * (rL + rOff - w), Math.sin(a) * (rL + rOff - w)]);
    }
    const p = new Path2D();
    p.moveTo(top[0][0], top[0][1]); top.forEach(q => p.lineTo(q[0], q[1])); for (let i = bot.length - 1; i >= 0; i--) p.lineTo(bot[i][0], bot[i][1]); p.closePath();
    const mid = at(rL + rOff, (h1 + RD.spanHours(h1, h2) / 2));
    const det = isDetached(geo, mid[0], mid[1]);
    const ink = det ? C.blue : C.black;
    ctx.save();
    ctx.fillStyle = det ? 'rgba(44,102,196,0.10)' : 'rgba(30,30,30,0.05)'; ctx.fill(p);
    ctx.clip(p);
    ctx.strokeStyle = ink; ctx.globalAlpha = 0.75; ctx.lineWidth = 0.8;
    const am = (a1 + a2) / 2;
    for (const sgn of [1, -1]) {
      const dir = am + Math.PI / 2 + sgn * 0.8;
      const ux = Math.cos(dir), uy = Math.sin(dir), vx = -uy, vy = ux;
      for (let d = -120; d <= 120; d += 4.2) {
        ctx.beginPath(); ctx.moveTo(mid[0] + vx * d - ux * 140, mid[1] + vy * d - uy * 140); ctx.lineTo(mid[0] + vx * d + ux * 140, mid[1] + vy * d + uy * 140); ctx.stroke();
      }
    }
    ctx.restore();
    ctx.strokeStyle = ink; ctx.lineWidth = 1.3; ctx.stroke(p);
    if (f.pigmented) {
      ctx.fillStyle = C.black;
      for (let i = 0; i < 9; i++) { const t = 0.1 + rr() * 0.8, a = a1 + (a2 - a1) * t, r = rL + rOff + (rr() - 0.5) * 8 * Math.sin(Math.PI * t); ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 0.9 + rr() * 1.1, 0, TAU); ctx.fill(); }
    }
    if (f.tear && k === islands - 1) drawHST(ctx, { hour: RD.normHour(h2 - 0.12), size: 0.8, radial: f.radial === 'post' ? 'post' : null }, geo);
    if (f.holes) {
      for (let i = 0; i < 2; i++) { const t = 0.3 + i * 0.4, a = a1 + (a2 - a1) * t, r = rL + rOff; ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 2.6, 0, TAU); ctx.fillStyle = C.red; ctx.fill(); ctx.strokeStyle = C.blue; ctx.lineWidth = 1; ctx.stroke(); }
    }
  }
}
function drawPaving(ctx, f, geo) {
  const r = RD.radiusFor(f);
  const [cx, cy] = at(r, f.hour);
  const det = isDetached(geo, cx, cy);
  const rr = RD.mulberry32(f.seed || 9), s = f.size || 1, L = 8 * s;
  for (let i = 0; i < 4; i++) {
    const x = cx + (rr() - 0.5) * 22 * s, y = cy + (rr() - 0.5) * 14 * s, rad = (3.5 + rr() * 2.8) * s;
    const p = new Path2D(); p.arc(x, y, rad, 0, TAU);
    ctx.save(); ctx.clip(p); ctx.strokeStyle = C.red; ctx.lineWidth = 0.7;
    for (let d = -L; d <= L; d += 2.4) { ctx.beginPath(); ctx.moveTo(x + d - L, y - L); ctx.lineTo(x + d + L, y + L); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + d + L, y - L); ctx.lineTo(x + d - L, y + L); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = det ? C.brown : C.black; ctx.lineWidth = 1.1; ctx.stroke(p);
  }
}
function drawTuft(ctx, f) {
  const s = f.size || 1;
  ctx.save(); local(ctx, RD.radiusFor(f), f.hour);
  ctx.strokeStyle = C.blue; ctx.lineWidth = 1.6 * Math.sqrt(s); ctx.lineCap = 'round';
  for (const dx of [-3, 0, 3]) { ctx.beginPath(); ctx.moveTo(dx * s, -4 * s); ctx.lineTo(dx * 0.6 * s, 4 * s); ctx.stroke(); }
  ctx.restore();
}

/* --------------------------------- PVR -------------------------------- */
function pvrCenters(f, geo, scene) {
  if (Array.isArray(f.pts) && f.pts.length) return f.pts.map(p => [p[0], p[1]]);
  if (f.hours && f.hours.length) return f.hours.map(h => {
    // place on the detachment, posterior to the equator unless anterior PVR
    const rPref = f.loc === 'A' ? G.R_EQ + 30 : G.R_EQ - 34;
    for (let d = 0; d < 120; d += 6) for (const s of [1, -1]) { const p = at(rPref + s * d, h); if (!geo || geo.F(p[0], p[1]) < -10) return p; }
    return at(rPref, h);
  });
  if (!geo) return [];
  const count = f.count || (f.extent ? Math.max(1, Math.min(6, Math.round(f.extent / 2))) : 3);
  const rr = RD.mulberry32(f.seed || 21);
  const out = [];
  const lo = f.loc === 'A' ? G.R_EQ + 8 : G.R_MAC + 30, hi = f.loc === 'A' ? G.R_ORA - 22 : G.R_EQ;
  for (let tries = 0; tries < 900 && out.length < count; tries++) {
    const r = lo + rr() * (hi - lo), a = rr() * TAU;
    const p = [Math.cos(a) * r, Math.sin(a) * r];
    if (geo.F(p[0], p[1]) > -14) continue;
    if (out.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 46)) continue;
    out.push(p);
  }
  return out;
}
function drawPVR(ctx, f, geo, scene) {
  const grade = f.grade || 'C';
  if (grade === 'A') {
    // vitreous haze / pigment clumps, inferiorly
    const rr = RD.mulberry32(f.seed || 4);
    ctx.fillStyle = 'rgba(96,70,50,0.7)';
    for (let i = 0; i < 22; i++) { const h = 4.5 + rr() * 3, r = G.R_EQ + rr() * (G.R_ORA - G.R_EQ - 10); const [x, y] = at(r, h); ctx.beginPath(); ctx.arc(x, y, 0.9 + rr() * 1.2, 0, TAU); ctx.fill(); }
    return;
  }
  if (grade === 'B') return; // rolled edges and stiffness are shown on the breaks
  const rr = RD.mulberry32((f.seed || 8) + 3);
  for (const [cx, cy] of pvrCenters(f, geo, scene)) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(f.size || 1, f.size || 1);
    const rays = 7 + Math.floor(rr() * 3);
    ctx.strokeStyle = '#1D4C9C'; ctx.lineCap = 'round';
    for (let i = 0; i < rays; i++) {
      const a = i / rays * TAU + rr() * 0.4, len = 8 + rr() * 8, bend = (rr() - 0.5) * 6;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 2, Math.sin(a) * 2);
      ctx.quadraticCurveTo(Math.cos(a) * len * 0.55 - Math.sin(a) * bend, Math.sin(a) * len * 0.55 + Math.cos(a) * bend, Math.cos(a) * len, Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.fillStyle = '#1D4C9C'; ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

/* --------------------------- treatments ------------------------------- */
function treatmentAround(ctx, f, scene, kind) {
  const target = scene.findings.find(x => x.id === f.target);
  const spot = (x, y, s) => {
    if (Math.hypot(x, y) > G.R_ORA - 3) return;
    if (kind === 'laser') {
      ctx.fillStyle = 'rgba(176,138,96,0.35)'; ctx.beginPath(); ctx.arc(x, y, 3.1 * s, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3A2E28'; ctx.beginPath(); ctx.arc(x, y, 1.7 * s, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(70,52,40,0.45)'; ctx.beginPath(); ctx.ellipse(x, y, 4.2 * s, 3 * s, x * 0.03, 0, TAU); ctx.fill();
    }
  };
  // laser traced by hand: rows of burns along the drawn line, in the pattern chosen (rows, confluent or spaced)
  const pat = kind === 'laser' ? RD.laserPattern(f) : null;
  if (Array.isArray(f.line) && f.line.length > 1) { for (const [x, y] of RD.laserLineSpots(f.line, pat)) spot(x, y, 1); return; }
  if (target && target.hour != null) {
    const s = target.size || 1;
    const [cx, cy] = at(RD.radiusFor(target), target.hour);
    if (pat) { for (const [x, y] of RD.laserRings(15 * s + 4, pat)) spot(cx + x, cy + y, 1); return; }
    const rows = kind === 'laser' ? [15 * s + 4, 21 * s + 5] : [16 * s + 4];
    for (const rad of rows) { const n = Math.round(rad * TAU / (kind === 'laser' ? 6.5 : 11)); for (let i = 0; i < n; i++) { const a = i / n * TAU; spot(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, 1); } }
    return;
  }
  let s, e;
  if (target && target.start != null) { s = target.start - 0.25; e = target.end + 0.25; }
  else if (f.start != null) { s = f.start; e = f.end; }
  else if (f.hour != null && pat) { const [cx, cy] = at(f.r != null ? f.r : G.TEAR_R, f.hour); for (const [x, y] of RD.laserRings(14 * (f.size || 1), pat)) spot(cx + x, cy + y, 1); return; }
  else if (f.hour != null) { const [cx, cy] = at(f.r != null ? f.r : G.TEAR_R, f.hour), sz = f.size || 1; for (const rad of [14 * sz, 20 * sz]) { const n = Math.round(rad * TAU / 6.5); for (let i = 0; i < n; i++) { const a = i / n * TAU; spot(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, 1); } } return; }
  else return;
  const span = RD.spanHours(s, e);
  const base = target ? G.R_ORA - 58 : G.R_ORA - 44;
  for (const r of [base, base - 8, base - 16]) {
    const n = Math.round(span * 30 * DEG * r / 6.6);
    for (let i = 0; i <= n; i++) { const a = RD.hourToAngle(s) + span * 30 * DEG * i / n; spot(Math.cos(a) * r, Math.sin(a) * r, 1); }
  }
}

function drawVH(ctx, f) {
  const rr = RD.mulberry32(f.seed || 13);
  const s = f.size || 1;
  const n = Math.round((f.density === 'dense' ? 640 : f.density === 'mild' ? 160 : 340) * Math.min(2.2, Math.max(0.6, s)));
  const center = RD.hourToAngle(f.hour);
  const rc = f.r != null ? f.r : (G.R_EQ + G.R_ORA) / 2 - 12;
  for (let i = 0; i < n; i++) {
    const u = (rr() + rr() + rr() - 1.5) / 1.5, v = (rr() + rr() + rr() - 1.5) / 1.5;
    const a = center + u * 0.85 * s, r = rc + v * 78 * s;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (Math.hypot(x, y) > G.R_ORA - 2) continue;
    ctx.fillStyle = f.fresh ? `rgba(206,52,44,${0.25 + rr() * 0.45})` : `rgba(46,140,80,${0.22 + rr() * 0.4})`;
    ctx.beginPath(); ctx.arc(x, y, 0.7 + rr() * 1.3, 0, TAU); ctx.fill();
  }
  for (let i = 0; i < (f.density === 'dense' ? 7 : 3); i++) {
    const a = center + (rr() - 0.5) * 0.9 * s, r = rc + (rr() - 0.5) * 70 * s;
    ctx.fillStyle = f.fresh ? 'rgba(190,40,36,0.32)' : 'rgba(40,120,70,0.28)'; ctx.beginPath(); ctx.ellipse(Math.cos(a) * r, Math.sin(a) * r, 7 + rr() * 6, 4 + rr() * 3, a, 0, TAU); ctx.fill();
    if (f.fresh) { ctx.strokeStyle = 'rgba(46,140,80,0.7)'; ctx.lineWidth = 0.8; ctx.stroke(); }
  }
}

/* --------------------------- disc and macula --------------------------- */
function drawDisc(ctx, eye) {
  const [dx, dy] = RD.discCenter(eye);
  const R = G.DISC_R;
  const g = ctx.createRadialGradient(dx, dy, 2, dx, dy, R);
  g.addColorStop(0, '#F9DB98'); g.addColorStop(0.7, C.disc); g.addColorStop(1, '#D79A45');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(dx, dy, R, 0, TAU); ctx.fill();
  ctx.strokeStyle = C.discRim; ctx.lineWidth = 1.3; ctx.stroke();
  const tx = eye === 'OD' ? -1 : 1;
  ctx.fillStyle = C.cup; ctx.beginPath(); ctx.ellipse(dx + tx * 2.6, dy, R * 0.44, R * 0.47, 0, 0, TAU); ctx.fill();
  // The central artery and vein appear at the nasal edge of the cup, each divides into a superior and an
  // inferior trunk, and every trunk runs to the rim exactly where its retinal vessel leaves the disc,
  // meeting it in the same direction.
  const base = dx - tx * R * 0.12;
  ctx.save(); ctx.beginPath(); ctx.arc(dx, dy, R + 1.2, 0, TAU); ctx.clip();
  ctx.lineCap = 'round';
  for (const kind of ['v', 'a']) {
    const ox = base + tx * (kind === 'v' ? 0.75 : -0.75), w = kind === 'a' ? 1.9 : 2.5;
    ctx.strokeStyle = kind === 'a' ? C.artery : C.vein; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(ox, dy - 1.5); ctx.lineTo(ox, dy + 1.5); ctx.stroke();     // the central trunk, end-on
    for (const v of discExits(eye).filter(e => e.k === kind)) {
      const sy = Math.sign(v.e[1] - dy) || 1, oy = dy + sy * 1.5;
      const L = Math.hypot(v.e[0] - ox, v.e[1] - oy);
      const end = [v.e[0] + v.u[0] * 1.6, v.e[1] + v.u[1] * 1.6];
      ctx.beginPath(); ctx.moveTo(ox, oy);
      ctx.bezierCurveTo(ox, oy + sy * L * 0.42, v.e[0] - v.u[0] * L * 0.38, v.e[1] - v.u[1] * L * 0.38, end[0], end[1]);
      ctx.stroke();
    }
  }
  ctx.restore();
}
/* where each main retinal vessel crosses the disc margin, and its direction there */
const exitCache = {};
function discExits(eye) {
  if (exitCache[eye]) return exitCache[eye];
  const [dx, dy] = RD.discCenter(eye), R = G.DISC_R, out = [];
  for (const v of vesselPaths(eye).filter(v => v.w === 1)) {
    const P = v.pts, i = P.findIndex(p => Math.hypot(p[0] - dx, p[1] - dy) >= R);
    if (i < 1) continue;
    const a = P[i - 1], b = P[i], ra = Math.hypot(a[0] - dx, a[1] - dy), rb = Math.hypot(b[0] - dx, b[1] - dy);
    const t = (R - ra) / ((rb - ra) || 1), e = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const c = P[Math.min(P.length - 1, i + 2)];
    let ux = c[0] - e[0], uy = c[1] - e[1]; const l = Math.hypot(ux, uy) || 1;
    out.push({ k: v.k, e, u: [ux / l, uy / l] });
  }
  return (exitCache[eye] = out);
}
function drawMacula(ctx, geo) {
  ctx.save();
  ctx.strokeStyle = C.macula; ctx.lineWidth = 1; ctx.setLineDash([3.5, 3]);
  ctx.beginPath(); ctx.arc(0, 0, G.R_MAC, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = '#4C5763'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, 0, G.R_FOV, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#4C5763'; ctx.beginPath(); ctx.arc(0, 0, 1.5, 0, TAU); ctx.fill();
  ctx.restore();
}

/* ------------------------------- Lincoff ------------------------------- */
function drawLincoff(ctx, scene) {
  const z = RD.lincoff(scene);
  if (!z) return;
  for (const zz of z.zones) {
    let p;
    if (zz.kind === 'triangle') {
      const T = RD.lincoffTriangle();
      p = new Path2D();
      p.moveTo(T.apex[0], T.apex[1]);
      p.lineTo(T.a[0], T.a[1]);
      const a1 = RD.hourToAngle(zz.from), a2 = a1 + RD.spanHours(zz.from, zz.to) * 30 * DEG;
      p.arc(0, 0, T.rb, a1, a2);
      p.closePath();
    } else {
      p = arcPath(G.R_EQ - 40, G.R_ORA - 2, zz.from, zz.to);
    }
    ctx.save();
    ctx.fillStyle = 'rgba(232,160,48,0.17)'; ctx.fill(p);
    ctx.clip(p);
    ctx.strokeStyle = 'rgba(214,140,30,0.38)'; ctx.lineWidth = 1;
    for (let d = -G.R_ORA; d <= G.R_ORA; d += 7) { ctx.beginPath(); ctx.moveTo(d - G.R_ORA, -G.R_ORA); ctx.lineTo(d + G.R_ORA, G.R_ORA); ctx.stroke(); }
    ctx.restore();
    ctx.save(); ctx.strokeStyle = C.amber; ctx.lineWidth = 1.8; ctx.setLineDash([6, 4]); ctx.stroke(p); ctx.restore();
  }
  // one label, on the first zone
  const zz = z.zones[0];
  const mid = zz.kind === 'triangle' ? 12 : RD.midHour(zz.from, zz.to);
  const [lx, ly] = at(G.R_EQ - 72, mid);
  const text = `Lincoff rule ${z.rule}${z.pct ? ' · ' + z.pct + '%' : ''}`;
  ctx.font = '700 12.5px ' + FONT_UI;
  const tw = ctx.measureText(text).width + 16;
  ctx.fillStyle = 'rgba(255,250,240,0.95)'; ctx.strokeStyle = C.amber; ctx.lineWidth = 1.2;
  roundRect(ctx, lx - tw / 2, ly - 11, tw, 22, 11); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#8A5612'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, lx, ly + 0.5);
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

/* ----------------------------- highlight ------------------------------ */
function drawHighlight(ctx, scene, id, scale) {
  const f = scene.findings.find(x => x.id === id);
  if (!f) return;
  const k = scale || 1;
  ctx.save();
  ctx.strokeStyle = 'rgba(240,127,99,0.9)'; ctx.lineWidth = 3 / k; ctx.setLineDash([5 / k, 4 / k]);
  const CR = root.RDCatRender;
  if (f.type === 'cat') {
    const h = CR && CR.highlightOf(f, scene);
    if (h && h.ring) { ctx.beginPath(); ctx.arc(0, 0, h.ring + 10, 0, TAU); ctx.stroke(); }
    else if (h && h.arc) ctx.stroke(arcPath(130, G.R_ORA + 6, h.arc.s - 0.1, h.arc.e + 0.1));
    else if (h) { ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.stroke(); }
  } else if (f.type === 'rd' || f.type === 'chd') {
    if (f.total) { ctx.beginPath(); ctx.arc(0, 0, G.R_ORA + 8, 0, TAU); ctx.stroke(); }
    else { const a1 = RD.hourToAngle(f.start), a2 = a1 + RD.spanHours(f.start, f.end) * 30 * DEG; ctx.beginPath(); ctx.arc(0, 0, G.R_ORA + 9, a1, a2); ctx.stroke(); }
  } else if (f.start != null) {
    const rL = f.type === 'lat' && f.r != null ? f.r : null;
    ctx.stroke(rL ? arcPath(rL - 18, rL + 18, f.start - 0.1, f.end + 0.1) : arcPath(G.R_ORA - 60, G.R_ORA + 6, f.start - 0.1, f.end + 0.1));
  } else if (Array.isArray(f.line) && f.line.length > 1) {
    ctx.lineWidth = 3 / k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(f.line[0][0], f.line[0][1]); for (const q of f.line.slice(1)) ctx.lineTo(q[0], q[1]);
    ctx.save(); ctx.strokeStyle = 'rgba(240,127,99,0.25)'; ctx.lineWidth = 26 / k; ctx.setLineDash([]); ctx.stroke(); ctx.restore();
  } else {
    const h = RD.findingHour(f.target ? scene.findings.find(x => x.id === f.target) || f : f);
    const pts = f.type === 'pvr' && Array.isArray(f.pts) ? f.pts : null;
    if (pts) for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x, y, 22 * Math.max(1, f.size || 1), 0, TAU); ctx.stroke(); }
    else if (h != null) { const [x, y] = at(f.type === 'pvr' ? G.R_EQ - 34 : f.type === 'vh' ? (f.r != null ? f.r : (G.R_EQ + G.R_ORA) / 2 - 12) : RD.radiusFor(f), h); ctx.beginPath(); ctx.arc(x, y, (f.type === 'vh' ? 48 : 22) * Math.max(1, f.size || 1), 0, TAU); ctx.stroke(); }
    else if (f.encircling) { ctx.beginPath(); ctx.arc(0, 0, G.R_ORA - 26, 0, TAU); ctx.stroke(); }
  }
  ctx.restore();
}

/* --------------------------- teaching review ----------------------------- */
/* corrections over the chart: the resident's detachment border as a dashed ghost, a ring on every
   change (green added, red removed, amber changed, with an arrow when something moved) and numbered
   comment pins. Drawn in chart coordinates, in the reviewer's colours rather than the fundus code. */
const REV = { added: '#2F8A4E', removed: '#C8382F', changed: '#C77A12', ghost: 'rgba(104,78,160,0.9)', pin: '#E0603F' };
function drawReview(ctx, rv) {
  if (rv.ghost) {
    const g = geometryFor(rv.ghost);
    if (g) {
      ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4.5; for (const b of g.borders) ctx.stroke(pathFromPolyline(b.pts));
      ctx.setLineDash([7, 5]); ctx.strokeStyle = REV.ghost; ctx.lineWidth = 2.2; for (const b of g.borders) ctx.stroke(pathFromPolyline(b.pts));
      ctx.restore();
    }
  }
  for (const d of rv.diff || []) {
    if (!d.at) continue;
    const col = REV[d.kind] || REV.changed;
    const [x, y] = d.at;
    ctx.save();
    if (d.kind === 'changed' && d.from && Math.hypot(d.from[0] - x, d.from[1] - y) > 8) {
      const [fx, fy] = d.from, a = Math.atan2(y - fy, x - fx), len = Math.hypot(x - fx, y - fy);
      const ex = x - Math.cos(a) * 19, ey = y - Math.sin(a) * 19;
      ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(fx + Math.cos(a) * 6, fy + Math.sin(a) * 6); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
      if (len > 26) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(a - 0.45) * 8, ey - Math.sin(a - 0.45) * 8); ctx.lineTo(ex - Math.cos(a + 0.45) * 8, ey - Math.sin(a + 0.45) * 8); ctx.closePath(); ctx.fill(); }
      ctx.beginPath(); ctx.arc(fx, fy, 4, 0, TAU); ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, 18, 0, TAU); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 2.4;
    if (d.kind === 'removed') ctx.setLineDash([5, 3.5]);
    ctx.beginPath(); ctx.arc(x, y, 18, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    // badge: + added, − removed, ✎ changed
    const bx = x + 13, by = y - 13;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(bx, by, 7.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.beginPath();
    if (d.kind === 'added') { ctx.moveTo(bx - 3.6, by); ctx.lineTo(bx + 3.6, by); ctx.moveTo(bx, by - 3.6); ctx.lineTo(bx, by + 3.6); }
    else if (d.kind === 'removed') { ctx.moveTo(bx - 3.6, by); ctx.lineTo(bx + 3.6, by); }
    else { ctx.moveTo(bx - 3, by + 3); ctx.lineTo(bx + 3, by - 3); }
    ctx.stroke();
    ctx.restore();
  }
  for (const p of rv.pins || []) {
    const [x, y] = p.at;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
    ctx.fillStyle = REV.pin;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y - 12); ctx.lineTo(x + 6, y - 12); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y - 22, 12, 0, TAU); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '700 13px ' + FONT_UI; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(p.n), x, y - 21.5);
    ctx.restore();
  }
}

/* --------------------------------- main -------------------------------- */
let geoLast = { scene: null, geo: null };
const geoCache = new Map();          // a few recent outlines: flipping between previews reuses them
function geometryFor(scene) {
  if (geoLast.scene === scene) return geoLast.geo;
  // the outline depends only on the detachments and the eye, so dragging other findings reuses it
  const key = scene.eye + '|' + JSON.stringify(scene.findings.filter(f => f.type === 'rd'));
  let geo = geoCache.get(key);
  if (geo === undefined) {
    geo = RD.rdGeometry(scene);
    geoCache.set(key, geo);
    if (geoCache.size > 6) geoCache.delete(geoCache.keys().next().value);
  }
  geoLast = { scene, geo };
  return geo;
}

/* PVD recorded for the eye (scene.pvd), drawn in the vitreous green: the detached posterior hyaloid as a dashed
   line in front of the posterior pole and, when complete, a Weiss ring just in front of the disc; when partial, the
   hyaloid still adheres at the disc, shown by its ends running to the disc margin. u scales strokes for the pole view. */
const GRN = '#2E9A55';
function drawPVD(ctx, scene, u) {
  const pvd = scene.pvd;
  if (pvd !== 'complete' && pvd !== 'yes' && pvd !== 'partial') return;
  // a PVD or Weiss ring placed from the library is already drawn by its own recipe
  if (scene.findings.some(f => f.type === 'cat' && (f.key === 'posterior_vitreous_detachment' || f.key === 'weiss_ring'))) return;
  u = u || 1;
  const [dx] = RD.discCenter(scene.eye), cx = -dx * 0.15, R = 128, toDisc = dx > 0 ? 0 : Math.PI;
  ctx.save();
  ctx.strokeStyle = 'rgba(46,154,85,0.85)'; ctx.lineWidth = 1.7 * u; ctx.lineCap = 'round';
  ctx.setLineDash([7 * u, 5 * u]);
  ctx.beginPath();
  if (pvd === 'partial') {
    // the same outline, pinched in to the disc margin where the hyaloid still holds on
    const gap = 38 * DEG, m = G.DISC_R + 1.5, sg = dx > 0 ? 1 : -1;
    const end = (s) => { const a = toDisc + s * gap; return [cx + R * Math.cos(a), R * Math.sin(a), a]; };
    const [x0, y0, a0] = end(-1), [x1, y1, a1] = end(1);
    const tan = (a, s) => [-Math.sin(a) * s, Math.cos(a) * s];       // along the circle, towards the disc side
    ctx.moveTo(dx, -m);
    { const t = tan(a0, 1); ctx.bezierCurveTo(dx - sg * 4, -m - 34, x0 + t[0] * 38, y0 + t[1] * 38, x0, y0); }
    ctx.arc(cx, 0, R, a0, a1 + (a1 < a0 ? TAU : 0), true);
    { const t = tan(a1, -1); ctx.bezierCurveTo(x1 + t[0] * 38, y1 + t[1] * 38, dx - sg * 4, m + 34, dx, m); }
    ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = GRN;
    for (const y of [-m, m]) { ctx.beginPath(); ctx.arc(dx, y, 2.4 * u, 0, TAU); ctx.fill(); }
  } else {
    ctx.arc(cx, 0, R, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    // the Weiss ring: an irregular, slightly open ring just in front of the disc
    const x = dx * 0.86, y = -9;
    ctx.strokeStyle = GRN; ctx.lineWidth = 2.5 * u;
    ctx.beginPath(); ctx.ellipse(x, y, 12, 9, 0.3, 0.35, TAU - 0.25); ctx.stroke();
    ctx.lineWidth = 1.5 * u; ctx.beginPath(); ctx.ellipse(x + 0.6, y + 0.4, 8.6, 6.1, 0.45, 1.2, 4.2); ctx.stroke();
  }
  ctx.restore();
}

/* magnified posterior pole: disc, macula and arcades at ~2.2× the main chart */
const POLE_HALF = 110;
function poleCenter(eye) { return [RD.discCenter(eye)[0] * 0.24, 0]; }
function hasPosterior(scene) {
  for (const f of scene.findings) {
    if (f.type === 'cat') { const P = RD.catPlace(f, scene.eye); if (P && (P.post || ['vo', 'crao', 'staph', 'cfolds', 'flecks', 'ao'].includes(P.E.r))) return true; }
    if (f.type === 'rd' && (f.total || (f.macula && f.macula !== 'on'))) return true;
  }
  return false;
}
function renderPole(canvas, scene, opts) {
  const dpr = opts.dpr || (typeof window !== 'undefined' ? Math.min(3, window.devicePixelRatio || 1) : 1);
  const S = opts.size || G.SIZE;
  if (canvas.width !== Math.round(S * dpr)) { canvas.width = Math.round(S * dpr); canvas.height = Math.round(S * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#FBFAF6'; roundRect(ctx, 0, 0, S, S, 22 * S / G.SIZE); ctx.fill();
  ctx.save();
  roundRect(ctx, 8, 8, S - 16, S - 16, 18 * S / G.SIZE); ctx.clip();
  ctx.fillStyle = C.paper; ctx.fillRect(0, 0, S, S);
  const k = S / (2 * POLE_HALF), [cx, cy] = poleCenter(scene.eye);
  ctx.translate(S / 2, S / 2); ctx.scale(k, k); ctx.translate(-cx, -cy);
  const geo = geometryFor(scene);
  const CR = root.RDCatRender;
  if (CR) CR.drawLayer(ctx, scene, geo, 'deep');
  drawVessels(ctx, scene.eye, null, false);
  if (geo) {
    const path = pathFromLoops(geo.loops);
    ctx.fillStyle = 'rgba(104,170,232,0.30)'; ctx.fill(path, 'evenodd');
    ctx.save(); ctx.clip(path, 'evenodd'); drawVessels(ctx, scene.eye, null, true); ctx.restore();
    ctx.strokeStyle = C.blue; ctx.lineWidth = 3.2 / k * (S / 420); ctx.lineJoin = 'round';
    for (const b of geo.borders) ctx.stroke(pathFromPolyline(b.pts));
  }
  drawDisc(ctx, scene.eye);
  if (CR) {
    CR.drawLayer(ctx, scene, geo, 'retina');
    const vit = { ...scene, findings: scene.findings.filter(f => f.type === 'cat' && !['gas', 'oil', 'pvd'].includes((RD.CAT[f.key] || {}).r)) };
    CR.drawLayer(ctx, vit, geo, 'vitreous');
  }
  drawPVD(ctx, scene, (S / 420) / k);
  ctx.save();
  ctx.strokeStyle = C.macula; ctx.lineWidth = 0.6; ctx.setLineDash([2.5, 2]);
  ctx.beginPath(); ctx.arc(0, 0, G.R_MAC, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = '#4C5763'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(0, 0, G.R_FOV, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#4C5763'; ctx.beginPath(); ctx.arc(0, 0, 0.9, 0, TAU); ctx.fill();
  ctx.restore();
  if (CR && CR.drawTumorLabels) CR.drawTumorLabels(ctx, scene, 13 * (opts.textScale || 1) * (S / G.SIZE) / k);
  if (opts.highlight) drawHighlight(ctx, scene, opts.highlight, k * 420 / S);
  ctx.restore();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const ts = (opts.textScale || 1) * S / G.SIZE;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(251,250,246,0.86)'; roundRect(ctx, 14 * S / G.SIZE, 14 * S / G.SIZE, 250 * ts, 66 * ts, 12 * ts); ctx.fill();
  ctx.fillStyle = '#123F66'; ctx.font = '700 ' + Math.round(30 * ts) + 'px ' + FONT_UI; ctx.fillText(scene.eye, 24 * S / G.SIZE, 18 * S / G.SIZE + 28 * ts);
  ctx.font = '700 ' + Math.round(15 * ts) + 'px ' + FONT_UI; ctx.fillText('Posterior pole', 24 * S / G.SIZE + 58 * ts, 18 * S / G.SIZE + 20 * ts);
  ctx.fillStyle = '#5B6773'; ctx.font = '400 ' + Math.round(12.5 * ts) + 'px ' + FONT_UI; ctx.fillText('enlarged · disc, macula, arcades', 24 * S / G.SIZE + 58 * ts, 18 * S / G.SIZE + 38 * ts);
  if (opts.preview) {
    ctx.font = '700 ' + Math.round(12 * ts) + 'px ' + FONT_UI;
    const t = 'PREVIEW', w = ctx.measureText(t).width + 20 * ts, hh = 26 * ts;
    ctx.fillStyle = 'rgba(240,127,99,0.12)'; ctx.strokeStyle = 'rgba(224,96,72,0.8)'; ctx.lineWidth = 1.2;
    roundRect(ctx, S - w - 18, 22, w, hh, hh / 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#B5432E'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, S - w / 2 - 18, 22 + hh / 2 + 0.5);
  }
  return geo;
}

function render(canvas, scene, opts) {
  opts = opts || {};
  if (opts.view === 'pole') return renderPole(canvas, scene, opts);
  const dpr = opts.dpr || (typeof window !== 'undefined' ? Math.min(3, window.devicePixelRatio || 1) : 1);
  const S = G.SIZE;
  if (canvas.width !== Math.round(S * dpr)) { canvas.width = Math.round(S * dpr); canvas.height = Math.round(S * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, S, S);
  // the chart is a sheet of paper in either theme
  ctx.fillStyle = '#FBFAF6'; roundRect(ctx, 0, 0, S, S, 22); ctx.fill();
  ctx.translate(S / 2, S / 2);
  const geo = geometryFor(scene);
  const ts = opts.textScale || 1;
  const CR = root.RDCatRender;
  drawChart(ctx, scene, ts);
  drawLandmarks(ctx, scene.eye);
  drawChoroidals(ctx, scene);
  drawBuckles(ctx, scene);
  if (CR) CR.drawLayer(ctx, scene, geo, 'deep');
  const regionPath = geo ? pathFromLoops(geo.loops) : null;
  drawVessels(ctx, scene.eye, regionPath, false);
  if (geo) drawDetachment(ctx, scene, geo);
  drawBuckleEdges(ctx, scene, regionPath);
  drawDisc(ctx, scene.eye);
  if (CR) CR.drawLayer(ctx, scene, geo, 'retina');
  const F = scene.findings;
  for (const f of F) if (f.type === 'lat') drawLattice(ctx, f, geo);
  for (const f of F) if (f.type === 'pav') drawPaving(ctx, f, geo);
  for (const f of F) if (f.type === 'laser' || f.type === 'cryo') treatmentAround(ctx, f, scene, f.type);
  for (const f of F) if (f.type === 'tuft') drawTuft(ctx, f);
  for (const f of F) if (f.type === 'dia') drawDialysis(ctx, f);
  for (const f of F) if (f.type === 'grt') drawGRT(ctx, f);
  const rolledAll = F.some(f => f.type === 'pvr' && f.grade === 'B');
  for (const f of F) if (f.type === 'hst') drawHST(ctx, rolledAll ? { ...f, rolled: true } : f, geo);
  for (const f of F) if (f.type === 'oph') drawHole(ctx, f, geo, true);
  for (const f of F) if (f.type === 'hole') drawHole(ctx, f, geo, false);
  for (const f of F) if (f.type === 'pvr') drawPVR(ctx, f, geo, scene);
  if (CR) CR.drawLayer(ctx, scene, geo, 'vitreous');
  drawPVD(ctx, scene, 1);
  for (const f of F) if (f.type === 'vh') drawVH(ctx, f);
  drawMacula(ctx, geo);
  drawBuckleLabels(ctx, scene, ts);
  if (CR && CR.drawTumorLabels) CR.drawTumorLabels(ctx, scene, 11.5 * ts);
  if (scene.lincoff) drawLincoff(ctx, scene);
  if (opts.review) drawReview(ctx, opts.review);
  if (opts.highlight) drawHighlight(ctx, scene, opts.highlight);
  // eye badge
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#123F66'; ctx.font = '700 ' + Math.round(30 * ts) + 'px ' + FONT_UI; ctx.fillText(scene.eye, 20, 18 + 28 * ts);
  ctx.fillStyle = '#5B6773'; ctx.font = '400 ' + Math.round(13 * ts) + 'px ' + FONT_UI; ctx.fillText(scene.eye === 'OD' ? 'Right eye' : 'Left eye', 21, 22 + 44 * ts);
  if (opts.preview) {
    ctx.font = '700 ' + Math.round(12 * ts) + 'px ' + FONT_UI;
    const t = opts.previewText || (ts > 1.3 ? 'PREVIEW' : 'PREVIEW · press Enter to draw');
    const w = ctx.measureText(t).width + 20 * ts, hh = 26 * ts;
    ctx.fillStyle = 'rgba(240,127,99,0.12)'; ctx.strokeStyle = 'rgba(224,96,72,0.8)'; ctx.lineWidth = 1.2;
    roundRect(ctx, S - w - 18, 22, w, hh, hh / 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#B5432E'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, S - w / 2 - 18, 22 + hh / 2 + 0.5);
  }
  if (opts.caption) {
    ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#5B6773'; ctx.font = '400 13px ' + FONT_UI;
    ctx.fillText(opts.caption, S - 22, S - 22);
  }
  return geo;
}

const API = { render, vesselPaths, hasPosterior, _h: { at, arcPath, pathFromPolyline, pathFromLoops, roundRect, spline, strokeTapered, local, circlePath, C, FONT_UI } };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.RDRender = API;
})(typeof window !== 'undefined' ? window : globalThis);
