/* Teaching review: diffs, anchors and the clean-up of links from other people. Run: node test/review.test.js */
const RD = require('../src/core.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const mk = (cmds, eye) => { let s = RD.emptyScene(eye || 'OS'); for (const c of cmds) s = RD.applyActions(s, RD.parse(c, { eye: s.eye }).actions).scene; return s; };

const a = mk(['macula on RRD 10 to 2 with HST at 12, lattice 7 to 8, phakic']);
ok(RD.diffScenes(a, RD.clone(a)).length === 0, 'identical drawings: no changes');
let b = RD.applyActions(RD.clone(a), RD.parse('macula off', { eye: 'OS' }).actions).scene;
b = RD.applyActions(b, RD.parse('move the tear to 1', { eye: 'OS' }).actions).scene;
b = RD.applyActions(b, RD.parse('remove the lattice', { eye: 'OS' }).actions).scene;
b = RD.applyActions(b, RD.parse('operculated hole at 11, complete PVD, pseudophakic', { eye: 'OS' }).actions).scene;
const d = RD.diffScenes(a, b);
const has = (k, re) => d.some(x => x.kind === k && re.test(x.text));
ok(has('changed', /macula on → macula off/), 'macular status change listed');
ok(has('changed', /Horseshoe tear · 12 → Horseshoe tear · 1/), 'moved tear listed with old and new position');
ok(has('removed', /Lattice 7–8/), 'removed lattice listed');
ok(has('added', /Operculated hole · 11/), 'added hole listed');
ok(has('changed', /PVD: not recorded → Complete PVD/) && has('changed', /Lens: Phakic → Pseudophakic/), 'PVD and lens changes listed');
ok(d.filter(x => x.at).every(x => x.at.every(Number.isFinite)), 'every marked change has a place on the chart');
const mv = d.find(x => /Horseshoe tear · 12 →/.test(x.text));
ok(mv.from && Math.hypot(mv.from[0] - mv.at[0], mv.from[1] - mv.at[1]) > 50, 'a moved finding carries where it came from');
// an only-moved hand-placed tear says “moved”
const c1 = RD.applyActions(RD.emptyScene('OS'), [{ op: 'add', f: { type: 'hst', hour: 12, r: 268 } }]).scene;
const c2 = RD.clone(c1); c2.findings[0].r = 200;
ok(/moved/.test(RD.diffScenes(c1, c2)[0].text), 'a tear moved along its meridian is reported as moved');
ok(RD.diffScenes(a, Object.assign(RD.clone(a), { eye: 'OD' }))[0].text === 'Eye changed from OS to OD', 'eye change listed');
// anchors for every engine type
const all = mk(['RRD 10 to 2', 'giant tear 3 to 6', 'dialysis 7 to 8', 'tuft at 9', 'paving stone at 5', 'PVR C star fold at 11', 'vitreous hemorrhage at 6', 'laser around the breaks', 'encircling buckle', 'choroidal detachment 4 to 8', 'drusen in the macula', 'choroidal nevus at 8']);
ok(all.findings.every(f => { const p = RD.findingAnchor(f, all); return p && p.every(Number.isFinite); }), 'every finding type has an anchor');

// sanitising links
const ok1 = RD.sanitizeReview({ v: 1, st: 'submitted', o: a, case: 'Case 3', author: 'J', t: Date.now() });
ok(ok1 && ok1.o.findings.length === a.findings.length && ok1.case === 'Case 3', 'a genuine link survives intact');
ok(RD.sanitizeReview({ v: 2, o: a }) === null && RD.sanitizeReview(null) === null && RD.sanitizeReview('x') === null, 'wrong version or junk rejected');
ok(RD.sanitizeReview({ v: 1, st: 'reviewed', o: a }) === null, 'a “reviewed” link without the corrected drawing is rejected');
const evil = RD.sanitizeReview({ v: 1, st: 'submitted', case: 'x'.repeat(500) + '\u0000', o: { eye: 'XX', pvd: 'constructor', lens: '__proto__', findings: [
  { type: '__proto__', id: 1 }, { type: 'constructor', id: 2 }, { type: 'cat', key: 'constructor', id: 3 }, { type: 'cat', key: '__proto__', id: 4 },
  { type: 'hst', id: 5, hour: 'noon' }, { type: 'hst', id: 6, hour: 12, r: 1e12, size: 99 }, { type: 'hst', id: 6, hour: 1 },
  { type: 'rd', id: 7, path: { pts: Array(5000).fill([0, 0]) } }, { type: 'lat', id: 8, start: 7 }, { type: 'laser', id: 9, target: 999 },
  { type: 'rd', id: 10, start: 10, end: 2, macula: 'sideways', depth: 'enormous' } ] } });
const ids = evil.o.findings.map(f => f.id);
ok(evil.o.eye === 'OS' && !evil.o.pvd && !evil.o.lens, 'bad eye / status values dropped');
ok(ids.join() === '6,10', 'unknown types, prototype keys, bad hours, duplicate ids, collapsed outlines and half-spans are dropped (' + ids + ')');
ok(evil.o.findings[0].r == null && evil.o.findings[0].size == null, 'out-of-range numbers dropped');
ok(!evil.o.findings[1].macula && !evil.o.findings[1].depth, 'unknown enum values dropped');
ok(evil.case.length === 80 && !/\u0000/.test(evil.case), 'labels clipped and control characters removed');
const long = []; for (let i = 0; i <= 2000; i++) { const t = i / 2000; long.push(RD.polar(312 - 180 * Math.sin(Math.PI * t), RD.hourToAngle(10 + 4 * t))); }
const lp = RD.sanitizeScene({ eye: 'OS', findings: [{ type: 'rd', id: 1, path: { pts: long, dir: -1 } }] }).findings[0];
ok(lp && lp.path.pts.length <= 300 && RD.hourDist(lp.start, 10) <= 0.5 && RD.hourDist(lp.end, 2) <= 0.5, 'a very long outline is thinned and keeps its clock hours');
const cms = RD.sanitizeReview({ v: 1, o: a, cm: [{ at: [1, 2], text: 'x'.repeat(5000), f: 2 }, { at: ['a', 2], text: 'bad' }, null, { text: 'no place' }] }).cm;
ok(cms.length === 1 && cms[0].text.length === 1000 && cms[0].f === 2, 'comments: placed ones kept, clipped; others dropped');
ok(RD.sanitizeScene(a).nextId === a.nextId, 'next id carried so new findings never collide');

console.log(`review: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
