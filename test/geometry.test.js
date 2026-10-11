const RD = require('../src/core.js');
const { G } = RD;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('✗ ' + m); } };

function sceneWith(cmds, eye) {
  let sc = RD.emptyScene(eye || 'OS');
  for (const c of cmds) sc = RD.applyActions(sc, RD.parse(c, { eye: sc.eye }).actions).scene;
  return sc;
}
// inside test on the extracted (smoothed, undulated) outline, which is what is actually drawn
function insideLoops(loops, x, y) {
  let c = false;
  for (const L of loops) for (let i = 0, j = L.length - 1; i < L.length; j = i++) {
    const [xi, yi] = L[i], [xj, yj] = L[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function check(label, cmds, expect, eye) {
  const sc = sceneWith(cmds, eye);
  const geo = RD.rdGeometry(sc);
  const rd = RD.mainRd(sc);
  const sh = RD.rdShape(rd);
  const L = geo.loops;
  const fov = insideLoops(L, 0, 0);
  // macula ring: is any point of the macula detached?
  let macAny = false, macAll = true;
  for (let k = 0; k < 72; k++) { const a = k * 5 * RD.DEG; for (const r of [G.R_FOV + 4, G.R_MAC * 0.6, G.R_MAC - 2]) { const v = insideLoops(L, r * Math.cos(a), r * Math.sin(a)); macAny = macAny || v; macAll = macAll && v; } }
  const disc = RD.discCenter(sc.eye);
  ok(!insideLoops(L, disc[0], disc[1]), `${label}: optic disc must never be detached`);
  if (expect.fovea !== undefined) ok(fov === expect.fovea, `${label}: fovea detached should be ${expect.fovea}, got ${fov}`);
  if (expect.macAny !== undefined) ok(macAny === expect.macAny, `${label}: some macula detached should be ${expect.macAny}`);
  if (expect.macAll !== undefined) ok(macAll === expect.macAll, `${label}: whole macula detached should be ${expect.macAll}`);
  if (expect.split) {
    // the outline must pass through the fovea itself: detached on one side, attached on the other
    const u = [Math.cos(sh.phi), Math.sin(sh.phi)];
    const a = insideLoops(L, u[0] * 4, u[1] * 4), b = insideLoops(L, -u[0] * 4, -u[1] * 4);
    ok(a && !b, `${label}: fovea split in half (RD side ${a}, far side ${b})`);
  }
  if (!rd.total) {
    // anchored at the stated clock hours at the ora
    const inA = (h, dh) => { const a = RD.hourToAngle(h + dh); return insideLoops(L, (G.R_ORA - 4) * Math.cos(a), (G.R_ORA - 4) * Math.sin(a)); };
    ok(inA(rd.start, 0.12) && !inA(rd.start, -0.12), `${label}: start edge anchored at ${rd.start} o'clock`);
    ok(inA(rd.end, -0.12) && !inA(rd.end, 0.12), `${label}: end edge anchored at ${rd.end} o'clock`);
    // lateral edges bulge outward (beyond the clock line) mid-way
    const rMid = sh.kind === 'funnel' ? 200 : (G.R_ORA + sh.rShallow) / 2;
    const bulge = (h, dir) => { for (let d = 0.6; d > 0; d -= 0.02) { const a = RD.hourToAngle(h + dir * d); if (insideLoops(L, rMid * Math.cos(a), rMid * Math.sin(a))) return d; } return 0; };
    const bs = bulge(rd.start, -1), be = bulge(rd.end, 1);
    ok(bs > 0.2 && bs < 0.6 && be > 0.2 && be < 0.6, `${label}: edges bulge outward ~½ clock hour (start ${bs.toFixed(2)}h, end ${be.toFixed(2)}h)`);
  }
  // fill and stroke come from the same outline
  ok(geo.borders.length > 0, `${label}: has a drawable border`);
  return { sc, geo };
}

check('macula on 10-2', ['rrd from 10 to 2 macula on'], { fovea: false, macAny: false });
check('no status 2-4', ['rd from 2 to 4'], { fovea: false, macAny: false });
check('macula threatened 1-5', ['macula threatened rd from 1 to 5'], { fovea: false, macAny: false });
check('macula off fovea on 10-5', ['rd from 10 to 5 macula off fovea on'], { fovea: false, macAny: true });
check('fovea splitting 10-5', ['draw a fovea splitting rrd from 10 to 5 with a break at 12'], { split: true, macAny: true, macAll: false });
check('macula off 10-5', ['rd from 10 to 5 macula off'], { fovea: true, macAll: true });
check('macula off inferior 5-7', ['rd from 5 to 7 macula off'], { fovea: true, macAll: true });
check('macula off OD superotemporal', ['macula off superotemporal rd'], { fovea: true, macAll: true }, 'OD');
check('fovea split nasal OD 1-5', ['fovea splitting rd from 1 to 5'], { split: true }, 'OD');
check('fovea split RD crossing the disc side OS 7-11', ['fovea splitting rd from 7 to 11'], { split: true }, 'OS');
check('macula off 8-10 near disc', ['rd from 8 to 10 macula off'], { fovea: true });
check('wide 9-3 bullous', ['bullous rd from 9 to 3'], { fovea: false });
check('total', ['total rd'], { fovea: true, macAll: true });
check('11-10 nearly total', ['rd from 11 to 10 macula off'], { fovea: true });

// Lincoff
const lz = (cmds) => RD.lincoff(sceneWith(cmds));
let z = lz(['rd from 10 to 2']); ok(z.rule === 2, 'crosses 12 → rule 2');
z = lz(['rd from 1 to 4']); ok(z.rule === 1 && z.zone.from === 1 && z.zone.to === 2.5, `superotemporal 1-4 → rule 1 from 1 to 2.5 (got ${z.rule} ${z.zone.from}-${z.zone.to})`);
z = lz(['rd from 8 to 11']); ok(z.rule === 1 && z.zone.from === 9.5 && z.zone.to === 11, `8-11 → rule 1 near 11 (got ${z.zone.from}-${z.zone.to})`);
z = lz(['rd from 4 to 8']); ok(z.rule === 3 && z.zone.from === 5 && z.zone.to === 7, 'level inferior → near 6');
z = lz(['rd from 3 to 7']); ok(z.rule === 3 && z.zone.from === 3 && z.zone.to === 6, `inferior higher on 3 side → 3–6 (got ${z.zone.from}-${z.zone.to})`);
z = lz(['inferior bullous rd from 4 to 8']); ok(z.rule === 4, 'inferior bullous → rule 4');
z = lz(['rd from 10 to 2 with tear at 12']); ok(z.consistent, 'tear at 12 consistent with rule 2');
z = lz(['rd from 1 to 4 with tear at 4']); ok(!z.consistent, 'tear at 4 inconsistent with rule 1 zone 1–2:30');

z = lz(['rd from 9 to 12']); ok(z.rule === 1 && z.zone.from === 10.5 && z.zone.to === 12, `9-12 border at 12 → rule 1 10:30–12 (got rule ${z.rule} ${z.zone.from}-${z.zone.to})`);
z = lz(['rd from 12 to 3']); ok(z.rule === 1 && z.zone.from === 12 && z.zone.to === 1.5, `12-3 → rule 1 12–1:30 (got rule ${z.rule})`);
z = lz(['rd from 9 to 12 with tear at 1']); ok(!z.consistent, 'tear at 1 outside a 9–12 RD is not consistent');
z = lz(['rd from 2 to 10']); ok(z.zones.length === 2, 'level borders 2-10 → zones at both borders');
z = lz(['bullous rd from 5 to 10']); ok(z.rule === 1, `bullous 5-10 with high border → rule 1 (got ${z.rule})`);
z = lz(['rd from 10 to 2 with tear at 11']); ok(!z.consistent, 'tear at 11 near the ora lies outside the rule-2 triangle');
z = lz(['rd from 10 to 2 with posterior tear at 11']); ok(z.consistent, 'posterior tear at 11 lies inside the rule-2 triangle');
// note
const note = RD.clinicalNote(sceneWith(['draw a fovea splitting rrd from 10 to 5 with a break at 12', 'lattice 7 to 8']));
ok(/fovea splitting/.test(note) && /Horseshoe tear at 12/.test(note) && /Lattice degeneration 7–8/.test(note), 'note: ' + note);
console.log(note);
console.log(`geometry: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
