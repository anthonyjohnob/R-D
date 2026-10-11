/* Hand-drawn detachments, placement, PVD/lens status and repair options. Run: node test/hand.test.js */
const RD = require('../src/core.js');
const { G } = RD;
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL', msg); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const hdist = (a, b) => RD.hourDist(a, b);

/* a posterior border from the ora at h0, clockwise, in to rmin and out to the ora at h1 */
function arc(h0, h1, rmin, opts = {}) {
  const span = RD.mod(h1 - h0, 12) || 12, n = opts.n || 60, rOut = opts.rOut == null ? 312 : opts.rOut;
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n, h = h0 + span * t, r = rOut - (rOut - rmin) * Math.pow(Math.sin(Math.PI * t), 0.8); pts.push(RD.polar(r, RD.hourToAngle(h))); }
  return pts;
}
const tapAt = (prep, r, h) => RD.pickPathSide(prep, RD.polar(r, RD.hourToAngle(h)));
const rdOf = (stroke, r, h) => { const prep = RD.prepareStroke(stroke); return prep.ok ? RD.rdFromPath(tapAt(prep, r, h)) : null; };

/* ---------- stroke preparation ---------- */
{
  const p = RD.prepareStroke(arc(10, 2, 120));
  ok(p.ok && !p.closed, 'ora-to-ora arc prepares');
  const ends = [p.pts[0], p.pts[p.pts.length - 1]].map(q => Math.hypot(q[0], q[1]));
  ok(ends.every(r => near(r, G.R_ORA, 0.6)), 'ends snapped to the ora ' + ends);
  ok(p.pts.every(q => Math.hypot(q[0], q[1]) <= G.R_ORA + 0.6), 'stroke clipped inside the ora');
  // a stroke that stops short of the ora is carried on to it
  const short = RD.prepareStroke(arc(10, 2, 120, { rOut: 230 }));
  ok(short.ok && near(Math.hypot(...short.pts[0]), G.R_ORA, 0.6) && near(Math.hypot(...short.pts[short.pts.length - 1]), G.R_ORA, 0.6), 'free ends extended to the ora');
  const rd = RD.rdFromPath(tapAt(short, 280, 12));
  ok(hdist(rd.start, 10) <= 0.75 && hdist(rd.end, 2) <= 0.75, `extended stroke keeps roughly its hours (${rd.start}–${rd.end})`);
  ok(!RD.prepareStroke([[0, 0], [5, 5], [10, 8]]).ok, 'a tiny stroke is rejected');
  ok(RD.prepareStroke([[0, 0], [5, 5], [10, 8]]).reason === 'short', 'rejected as short');
  const outside = []; for (let i = 0; i <= 30; i++) outside.push(RD.polar(330, RD.hourToAngle(1 + i / 10)));
  ok(!RD.prepareStroke(outside).ok, 'a stroke entirely in the pars plana is rejected');
  const loop = []; for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI * 2; loop.push([80 * Math.cos(a), 80 * Math.sin(a)]); }
  const L = RD.prepareStroke(loop);
  ok(L.ok && L.closed, 'a loop is recognised');
  // a stroke wandering out past the ora and back keeps its longest inside stretch
  const wander = arc(10, 2, 120).concat([[0, -400], [50, -420]]);
  const W = RD.prepareStroke(wander);
  ok(W.ok && W.pts.every(q => Math.hypot(q[0], q[1]) <= G.R_ORA + 0.6), 'excursions past the ora are clipped');
}

/* ---------- choosing the detached side ---------- */
{
  const prep = RD.prepareStroke(arc(10, 2, 120));
  const sup = tapAt(prep, 250, 12), inf = tapAt(prep, 100, 6);
  ok(sup.dir !== inf.dir, 'the two taps choose opposite sides');
  const rs = RD.rdFromPath(sup), ri = RD.rdFromPath(inf);
  ok(hdist(rs.start, 10) <= 0.25 && hdist(rs.end, 2) <= 0.25, `superior side spans 10→2 (${rs.start}→${rs.end})`);
  ok(hdist(ri.start, 2) <= 0.25 && hdist(ri.end, 10) <= 0.25, `inferior side spans 2→10 (${ri.start}→${ri.end})`);
  ok(rs.macula === 'on' && rs.fovea === 'on', 'superior side spares the macula');
  ok(ri.macula === 'off' && ri.fovea === 'off', 'inferior side detaches the fovea');
  // swipes starting on the line
  const onLine = RD.polar(120, RD.hourToAngle(12));
  ok(RD.pickPathSide(prep, onLine, RD.polar(190, RD.hourToAngle(12))).dir === sup.dir, 'swipe outward picks the superior side');
  ok(RD.pickPathSide(prep, onLine, RD.polar(60, RD.hourToAngle(12))).dir === inf.dir, 'swipe inward picks the inferior side');
  // a swipe that starts on the attached side and crosses the line
  ok(RD.pickPathSide(prep, RD.polar(95, RD.hourToAngle(12)), RD.polar(170, RD.hourToAngle(12))).dir === sup.dir, 'swipe crossing the line follows its direction');
  // a swipe far from the line goes by where it ends
  ok(RD.pickPathSide(prep, RD.polar(150, RD.hourToAngle(6)), RD.polar(260, RD.hourToAngle(6))).dir === inf.dir, 'far swipe uses its end point');
  // a closed loop: tap inside vs outside
  const loop = []; for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI * 2; loop.push([60 * Math.cos(a) - 10, 60 * Math.sin(a)]); }
  const L = RD.prepareStroke(loop);
  const out = RD.rdFromPath(RD.pickPathSide(L, [220, 0])), inn = RD.rdFromPath(RD.pickPathSide(L, [0, 10]));
  ok(out.ring && out.macula === 'thr', `outside a posterior loop: 360° RD, macula threatened (${out.macula})`);
  ok(inn.island && inn.fovea === 'off', 'inside the loop: an island detaching the fovea');
}

/* ---------- macular status from the drawing ---------- */
{
  const st = (rmin) => { const r = rdOf(arc(10, 2, rmin), 260, 12); return `${r.macula}/${r.fovea}`; };
  ok(st(150) === 'on/on', 'border well clear of the macula: macula on ' + st(150));
  ok(st(50) === 'thr/on', 'border just outside the macula: threatened ' + st(50));
  ok(st(26) === 'off/on', 'border inside the macula: macula off, fovea on ' + st(26));
  ok(st(12) === 'off/thr', 'border at the foveal edge: fovea threatened ' + st(12));
  const line = []; for (let i = 0; i <= 40; i++) line.push([-320 + 640 * i / 40, 0]);
  const half = rdOf(line, 200, 12);
  ok(half.fovea === 'split' && hdist(half.start, 9) <= 0.25 && hdist(half.end, 3) <= 0.25, `a border through the fovea splits it (${half.fovea} ${half.start}–${half.end})`);
}

/* ---------- geometry renders for many hand strokes ---------- */
{
  let bad = 0, n = 0, slow = 0;
  const rnd = RD.mulberry32(42);
  for (let k = 0; k < 60; k++) {
    const h0 = rnd() * 12, span = 1 + rnd() * 10, rmin = 10 + rnd() * 220;
    const pts = arc(h0, h0 + span, rmin, { n: 20 + Math.floor(rnd() * 60) }).map(([x, y]) => [x + (rnd() - 0.5) * 6, y + (rnd() - 0.5) * 6]);
    const prep = RD.prepareStroke(pts);
    if (!prep.ok) continue;
    n++;
    for (const side of RD.pathOptions(prep)) {
      const rd = RD.rdFromPath(side);
      let sc = RD.applyActions(RD.emptyScene(k % 2 ? 'OD' : 'OS'), [{ op: 'add', f: rd }]).scene;
      const t0 = Date.now();
      try {
        const geo = RD.rdGeometry(sc);
        if (!geo || !geo.loops.length || !geo.borders.length) bad++;
        if (!RD.validHour && !(rd.start > 0 && rd.start <= 12 && rd.end > 0 && rd.end <= 12)) bad++;
        RD.clinicalNote(sc); RD.lincoff(sc); RD.repairOptions(sc);
      } catch (e) { bad++; console.log(e); }
      if (Date.now() - t0 > 400) slow++;
    }
  }
  ok(n > 40, 'most random strokes prepare (' + n + ')');
  ok(bad === 0, 'every side of every stroke builds geometry, note, Lincoff and repair options (bad ' + bad + ')');
  ok(slow === 0, 'geometry stays fast (slow ' + slow + ')');
}

/* ---------- scene rules for drawn detachments ---------- */
{
  let sc = RD.emptyScene('OS');
  sc = RD.applyActions(sc, RD.parse('bullous RRD from 9 to 1 macula off with HST at 11', { eye: 'OS' }).actions).scene;
  const drawn = rdOf(arc(10, 2, 120), 260, 12);
  const out = RD.applyActions(sc, [{ op: 'add', f: drawn }]);
  const rds = RD.rdsOf(out.scene);
  ok(rds.length === 1 && rds[0].path && rds[0].depth === 'bullous', 'a traced border replaces the overlapping detachment and keeps its height');
  ok(out.notes.some(n => /Replaced/.test(n)), 'and says so');
  ok(out.scene.findings.some(f => f.type === 'hst'), 'other findings stay');
  let s2 = RD.applyActions(out.scene, RD.parse('macula on', { eye: 'OS' }).actions).scene;
  ok(RD.mainRd(s2).path && RD.mainRd(s2).macula === 'on', 'a spoken status that matches the drawing keeps the drawn border');
  const o3 = RD.applyActions(out.scene, RD.parse('macula off', { eye: 'OS' }).actions);
  ok(!RD.mainRd(o3.scene).path && RD.mainRd(o3.scene).macula === 'off' && o3.notes.some(n => /standard outline/.test(n)), 'a contradicting status switches to the standard outline, and says so');
  const o4 = RD.applyActions(out.scene, RD.parse('make it total', { eye: 'OS' }).actions);
  ok(RD.mainRd(o4.scene).total && !RD.mainRd(o4.scene).path, '“total” replaces the drawn border');
  s2 = RD.applyActions(s2, RD.parse('extend it to 4', { eye: 'OS' }).actions).scene;
  ok(!RD.mainRd(s2).path && RD.mainRd(s2).end === 4, 'extending switches to the standard shape');
  // a near-total drawing is a 360° detachment, not a sliver
  const nt = []; for (let i = 0; i <= 80; i++) { const t = i / 80; nt.push(RD.polar(312 - 162 * Math.sin(Math.PI * t), RD.hourToAngle(11.97 + 0.06 * t))); }
  const ntp = RD.prepareStroke(nt);
  if (ntp.ok) { const opts = RD.pathOptions(ntp).map(RD.rdFromPath); ok(opts.some(r => r.ring && r.fovea === 'off'), 'a drawing covering almost all the ora is recorded as 360° ' + JSON.stringify(opts.map(r => [r.start, r.end, r.ring]))); }
  else ok(false, 'near-total stroke prepares');
  // an island around the fovea is described as posterior, without Lincoff
  const isl = []; for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI * 2; isl.push([60 * Math.cos(a), 60 * Math.sin(a)]); }
  const il = RD.rdFromPath(RD.pickPathSide(RD.prepareStroke(isl), [0, 0]));
  const isc = RD.applyActions(RD.emptyScene('OS'), [{ op: 'add', f: il }]).scene;
  ok(il.island && il.aroundFovea && /posterior fundus surrounding the fovea, not reaching the ora/.test(RD.clinicalNote(isc)) && !RD.lincoff(isc), 'posterior island: described as such, no Lincoff zone');
  const sep = rdOf(arc(4, 7, 200), 280, 5.5);
  const s3 = RD.applyActions(out.scene, [{ op: 'add', f: sep }]).scene;
  ok(RD.rdsOf(s3).length === 2, 'a separate drawn detachment is added alongside');
  const note = RD.clinicalNote(RD.applyActions(RD.emptyScene('OS'), [{ op: 'add', f: RD.rdFromPath(RD.pickPathSide(RD.prepareStroke((() => { const l = []; for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI * 2; l.push([90 * Math.cos(a), 90 * Math.sin(a)]); } return l; })()), [250, 0])) }]).scene);
  ok(/through 360°/.test(note), 'a ring detachment reads “through 360°” in the note');
}

/* ---------- placing by hand ---------- */
{
  ok(RD.radiusFor({ type: 'hst', hour: 12, r: 150 }) === 150, 'an exact radius wins');
  let sc = RD.emptyScene('OS');
  sc = RD.applyActions(sc, [{ op: 'add', f: { type: 'hst', hour: 12, r: 268 } }, { op: 'add', f: { type: 'hst', hour: 12.05, r: 150 } }]).scene;
  ok(sc.findings.filter(f => f.type === 'hst').length === 2, 'two tears on one meridian at different depths are both kept');
  sc = RD.applyActions(sc, [{ op: 'add', f: { type: 'hst', hour: 12.02, r: 262 } }]).scene;
  ok(sc.findings.filter(f => f.type === 'hst').length === 2, 'a tear dropped on top of another replaces it');
  sc = RD.applyActions(sc, [{ op: 'add', f: { type: 'laser', hour: 12, r: 200 } }]).scene;
  ok(sc.findings.some(f => f.type === 'laser' && f.r === 200 && !f.target), 'laser dropped away from a break stays where it was put');
  const nev = { type: 'cat', key: 'choroidal_nevus', hour: 4, at: [120, 60], site: 'mid', id: 9, seed: 9 };
  if (RD.CAT.choroidal_nevus) { const P = RD.catPlace(nev, 'OS'); ok(P.x === 120 && P.y === 60, 'a dropped catalogue finding sits exactly where dropped'); }
  ok(RD.siteAt([0, 0], 'OS') === 'fovea' && RD.siteAt([-76, 0], 'OS') === 'disc' && RD.siteAt([76, 0], 'OD') === 'disc', 'sites: fovea and disc by eye');
  ok(RD.siteAt([0, -30], 'OS') === 'macula' && RD.siteAt([0, -80], 'OS') === 'pole' && RD.siteAt([0, -216], 'OS') === 'equator' && RD.siteAt([0, -298], 'OS') === 'ora', 'sites by radius');
  ok(RD.fmtHour(12.53) === '12:30' && RD.fmtHour(1.9) === '2' && RD.fmtHour(10.25) === '10:15', 'clock text in quarter hours');
}

/* ---------- PVD and lens from speech ---------- */
{
  const meta = (t) => { const a = RD.parse(t, { eye: 'OS' }).actions.find(x => x.op === 'meta'); return a ? [a.pvd || '-', a.lens || '-'].join('/') : 'none'; };
  const cases = [['PVD', 'yes/-'], ['complete PVD', 'complete/-'], ['Weiss ring', 'complete/-'], ['partial PVD', 'partial/-'], ['incomplete posterior vitreous detachment', 'partial/-'],
    ['no PVD', 'none/-'], ['attached hyaloid', 'none/-'], ['vitreous attached', 'none/-'], ['PVD absent', 'none/-'], ['pseudophakic', '-/pseudo'], ['PCIOL', '-/pseudo'],
    ['s/p cataract surgery', '-/pseudo'], ['phakic', '-/phakic'], ['2+ NS', '-/phakic'], ['NS cataract', '-/phakic'], ['aphakic', '-/aphakic'], ['phakic IOL', '-/phakic'],
    ['PVD with Weiss ring, pseudophakic', 'complete/pseudo'], ['macula off RRD 10 to 2 with HST at 12, phakic, no PVD', 'none/phakic'], ['RRD 10 to 2', 'none']];
  for (const [t, want] of cases) ok(meta(t) === want, `meta “${t}” → ${meta(t)} (want ${want})`);
  for (const [t, want] of [['PVD not present', 'none/-'], ['PVD: none', 'none/-'], ['negative PVD', 'none/-'], ['cataract surgery planned', '-/phakic'], ['phakic, planning combined cataract surgery', '-/phakic'], ['had cataract surgery', '-/pseudo'], ['remove the PVD', 'null']])
    { const a = RD.parse(t, { eye: 'OS' }).actions.find(x => x.op === 'meta'); const got = a ? (a.pvd === null ? 'null' : [a.pvd || '-', a.lens || '-'].join('/')) : 'none'; ok(got === want, `meta “${t}” → ${got} (want ${want})`); }
  ok(RD.parse('anomalous PVD macula', { eye: 'OS' }).actions.some(a => a.op === 'add' && a.f.key === 'vitreomacular_traction'), '“anomalous PVD macula” is still vitreomacular traction');
  ok(RD.parse('no PVD and HST at 12', { eye: 'OS' }).actions.some(a => a.op === 'add' && a.f.type === 'hst'), '“no PVD and HST at 12” keeps the tear');
  ok(RD.parse('RRD 10 to 2, no lattice and HST at 12', { eye: 'OS' }).actions.some(a => a.op === 'add' && a.f.type === 'hst'), '“no lattice and HST at 12” keeps the tear');
  ok(!RD.parse('no NVD or NVE', { eye: 'OS' }).actions.some(a => a.op === 'add'), '“no NVD or NVE” still draws nothing');
  ok(!RD.parse('no holes and no tears', { eye: 'OS' }).actions.some(a => a.op === 'add'), '“no holes and no tears” draws nothing');
  const p = RD.parse('no PVD or lattice at 6', { eye: 'OS' });
  ok(!p.actions.some(a => a.op === 'add' && a.f.type === 'lat'), '“no PVD or lattice” still leaves the lattice out');
  ok(!RD.parse('pseudophakic', { eye: 'OS' }).unknown.length, 'status words are not “unrecognised”');
  ok(!RD.parse('vitreous attached to the flap of the tear at 12', { eye: 'OS' }).actions.some(a => a.op === 'meta'), 'vitreous attached to a flap is not “no PVD”');
  let sc = RD.applyActions(RD.emptyScene('OS'), RD.parse('RRD 10 to 2, complete PVD, pseudophakic', { eye: 'OS' }).actions).scene;
  ok(sc.pvd === 'complete' && sc.lens === 'pseudo', 'stored on the scene');
  const note = RD.clinicalNote(sc);
  ok(/Complete posterior vitreous detachment\. Lens: pseudophakic\./.test(note) && !/Posterior vitreous detachment in the vitreous/.test(note), 'note states PVD and lens once');
  sc = RD.applyActions(sc, [{ op: 'meta', pvd: null }]).scene;
  ok(!sc.pvd, 'PVD can be cleared');
  ok(RD.sanitizeActions([{ op: 'meta', pvd: 'none', lens: 'bogus' }]).length === 1 && RD.sanitizeActions([{ op: 'meta', pvd: 'x' }]).length === 0, 'meta sanitised');
  ok(RD.describeAction({ op: 'meta', pvd: 'none', lens: 'phakic' }).t === 'No PVD (vitreous attached) · Phakic', 'meta chip text');
}

/* ---------- repair options ---------- */
{
  const mk = (cmds) => { let s = RD.emptyScene('OS'); for (const c of cmds) s = RD.applyActions(s, RD.parse(c, { eye: 'OS' }).actions).scene; return s; };
  const tiers = (s) => Object.fromEntries(RD.repairOptions(s).options.map(o => [o.id, o.tier]));
  ok(RD.repairOptions(RD.emptyScene('OS')).state === 'none', 'no detachment: nothing to weigh');
  ok(RD.repairOptions(mk(['exudative RD 4 to 8'])).state === 'exudative', 'exudative: trials do not apply');
  const a = mk(['macula on RRD 10 to 2 with HST at 12', 'phakic, complete PVD']);
  ok(tiers(a).pnr === 'favoured', 'single superior break, phakic: PnR favoured');
  ok(tiers(a).ppv !== 'favoured', '… vitrectomy alone not favoured in a phakic eye');
  const b = mk(['macula off RRD 3 to 8 with tear at 6', 'pseudophakic PVD']);
  ok(tiers(b).ppvsb === 'favoured' && tiers(b).pnr === 'less' && tiers(b).sb === 'less', 'inferior break, pseudophakic: PPV/SB favoured, PnR and SB less suited');
  const c = mk(['total RD', 'PVR C', 'pseudophakic']);
  ok(tiers(c).ppv === 'favoured' && tiers(c).sb === 'less', 'PVR C: vitrectomy favoured, buckle alone less suited');
  const d = mk(['RD 9 to 3 macula off, giant tear 10 to 2']);
  ok(tiers(d).ppv === 'favoured' && tiers(d).sb === 'less' && tiers(d).pnr === 'less', 'giant tear: vitrectomy');
  const e = mk(['RD 3 to 6 fovea splitting, dialysis 4 to 5', 'phakic, attached hyaloid']);
  ok(tiers(e).sb === 'favoured' && tiers(e).ppv === 'less', 'dialysis, attached hyaloid: buckle');
  const f = mk(['RD 10 to 2 macula on']);
  const fo = RD.repairOptions(f);
  ok(fo.ask.pvd && fo.ask.lens, 'asks for PVD and lens when missing');
  ok(fo.options.find(o => o.id === 'pnr').tier === 'pending', 'no break drawn: PnR waits for the break');
  const g = mk(['macula on RRD 11 to 3 with HST at 12 and HST at 2']);
  ok(RD.repairOptions(g).options.find(o => o.id === 'pnr').why.some(w => /spread over 2 clock hours/.test(w.t)), 'breaks 2 hours apart fall outside PnR criteria');
  const h = mk(['macula off RRD 10 to 2 with HST at 12', 'pseudophakic']);
  ok(RD.repairOptions(h).options.find(o => o.id === 'pnr').why.some(w => /53\.9%/.test(w.t)), 'real-world PnR caution for pseudophakic eyes');
  ok(/6 days/.test(RD.repairOptions(h).timing.t), 'fovea off: timing evidence');
  ok(/24 hours/.test(RD.repairOptions(a).timing.t), 'macula on: urgent');
  ok(/part of the fovea is detached/.test(RD.repairOptions(e).timing.t), 'fovea splitting is not called attached');
  ok(tiers(mk(['combined RD 10 to 2 with HST at 12', 'phakic'])).pnr === 'less', 'combined TRD/RRD: PnR not offered');
  const ph6 = tiers(mk(['RRD 4 to 8 macula on with HST at 6', 'phakic']));
  ok(ph6.sb === 'favoured' && ph6.ppvsb === 'favoured', 'phakic inferior break: SB and PPV/SB both best supported');
  const ps = tiers(mk(['macula on RRD 10 to 2 with HST at 12', 'pseudophakic, complete PVD']));
  ok(ps.pnr === 'favoured', 'pseudophakic, PIVOT-eligible: PnR still best supported');
  ok(tiers(mk(['macula on RRD 1 to 5 with HST at 4'])).pnr === 'less', 'a break on the 4 o’clock meridian is outside the PnR criteria');
  ok(RD.repairOptions(mk(['macula on RRD 10 to 2 with HST at 12', 'vitreous hemorrhage at 6'])).options.find(o => o.id === 'pnr').why.some(w => /hide further breaks/.test(w.t)), 'vitreous haemorrhage tempers PnR');
  ok(/72 hours/.test(RD.repairOptions(mk(['RRD 10 to 2 macula off fovea on with HST at 12'])).timing.t), 'macula off, fovea on: both PIVOT windows');
  ok(RD.repairOptions(mk(['RRD 3 to 8 macula off with tear at 6', 'aphakic'])).options.find(o => o.id === 'ppvsb').why.some(w => /aphakic eyes were not studied/.test(w.t)), 'aphakic eyes are not called pseudophakic');
  // every cited source exists and has a DOI
  const all = [a, b, c, d, e, f, g, h].map(s => RD.repairOptions(s));
  const keys = new Set();
  for (const o of all) { for (const p of o.options) for (const w of p.why) w.refs.forEach(k => keys.add(k)); if (o.timing) o.timing.refs.forEach(k => keys.add(k)); o.notes.forEach(n => n.refs.forEach(k => keys.add(k))); }
  ok([...keys].every(k => RD.REPAIR_REFS[k] && /^10\./.test(RD.REPAIR_REFS[k].doi)), 'every cited source has a DOI');
  ok(keys.size >= 18, 'the rules draw on most of the sources (' + keys.size + ')');
  // a hand-drawn detachment feeds the card too
  const drawn = RD.applyActions(RD.emptyScene('OS'), [{ op: 'add', f: rdOf(arc(10, 2, 120), 260, 12) }, { op: 'add', f: { type: 'hst', hour: 12.5, r: 262 } }, { op: 'meta', lens: 'phakic', pvd: 'complete' }]).scene;
  ok(tiers(drawn).pnr === 'favoured', 'a drawn superior detachment with one tear: PnR favoured');
}

console.log(`hand: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
