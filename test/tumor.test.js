/* Tumours and naevi: size, thickness, elevation, surface features, SRF, placement, note and review links.
   Run: node test/tumor.test.js */
const RD = require('../src/core.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const P = (t, eye) => RD.parse(t, { eye: eye || 'OS' });
const adds = (t, eye) => P(t, eye).actions.filter(a => a.op === 'add').map(a => a.f);
const one = (t, eye) => { const a = adds(t, eye); return a.length === 1 ? a[0] : null; };
const mk = (cmds, eye) => { let s = RD.emptyScene(eye || 'OS'); for (const c of cmds) s = RD.applyActions(s, RD.parse(c, { eye: s.eye }).actions).scene; return s; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------------- parsing ---------------- */
let f = one('choroidal nevus 2 x 1.5 dd, 2 dd superotemporal to the disc, flat, with drusen, no orange pigment, no SRF');
ok(f && f.key === 'choroidal_nevus' && eq(f.base, [2, 1.5]) && f.bu === 'dd', 'two-dimension size in DD');
ok(f && f.dist === 2 && f.du === 'dd' && f.site === 'disc' && f.quad === 'st', 'distance from the disc with a direction');
ok(f && f.elev === 'flat' && f.dru === 'yes' && f.op === 'no' && f.srf === 'no', 'flat, drusen, no orange pigment, no SRF');
f = one('melanoma 6 x 5 x 2.5 mm, dome shaped, orange pigment, subretinal fluid');
ok(f && eq(f.base, [6, 5]) && f.bu === 'mm' && f.th === 2.5 && f.shape === 'dome' && f.op === 'yes' && f.srf === 'yes', 'base × base × height in mm');
f = one('choroidal melanoma 3 x 2.5 DD at 2 o\'clock, 4.1 mm thick, collar button, extensive subretinal fluid');
ok(f && f.hour === 2 && f.th === 4.1 && f.shape === 'mush' && f.srf === 'ext', 'thickness, collar button, extensive SRF, clock hour kept');
ok(one('mushroom shaped melanoma inferotemporally').shape === 'mush', '“mushroom shaped melanoma” keeps the shape');
f = one('a flat 3 mm nevus at 7 with no drusen or orange pigment');
ok(f && eq(f.base, [3]) && f.bu === 'mm' && f.elev === 'flat' && f.dru === 'no' && f.op === 'no' && f.hour === 7, 'descriptors before the name; negated list');
f = one('no orange pigment or drusen on the nevus');
ok(f && f.op === 'no' && f.dru === 'no', 'negated features named before the tumour do not negate the tumour');
f = one('Nevus 1.5 DD, inferotemporal to the fovea, minimally elevated, overlying drusen, orange pigment absent, SRF absent');
ok(f && eq(f.base, [1.5]) && f.dist == null && f.elev === 'min' && f.dru === 'yes' && f.op === 'no' && f.srf === 'no' && f.site === 'fovea', 'postfix “absent”; a size then a place');
f = one('Nevus 1.5 DD inferotemporal to the fovea');
ok(f && f.dist === 1.5 && !f.base, '“N DD inferotemporal to the fovea” is a distance');
ok(one('nevus 1/2 DD at 7').base[0] === 0.5 && one('nevus 1/2 DD at 7').hour === 7, 'fraction of a DD');
ok(eq(one('two by one and a half disc diameters nevus').base, [2, 1.5]), 'spoken size');
ok(eq(one('half a disc diameter nevus 3 dd from the fovea').base, [0.5]) && one('half a disc diameter nevus 3 dd from the fovea').dist === 3, 'half a DD, and a distance');
ok(one('nevus at 7 and a minimally elevated melanoma at 2 with trace SRF') === null, 'two tumours stay two');
const two = adds('nevus at 7 and a minimally elevated melanoma at 2 with trace SRF');
ok(two.length === 2 && !two[0].elev && !two[0].srf && two[1].elev === 'min' && two[1].srf === 'trace', 'descriptors go to the right tumour');
ok(one('elevated nevus at 3').elev === 'elev' && one('markedly elevated melanoma').elev === 'marked' && one('moderately elevated nevus').elev === 'mod', 'elevation grades');
ok(one('nevus, not elevated').elev === 'flat', '“not elevated” is flat');
ok(one('CHRPE 2 DD at 8').key === 'chrpe_solitary' && eq(one('CHRPE 2 DD at 8').base, [2]), 'other tumours take a size');
ok(one('amelanotic melanoma 2 DD at 4, lipofuscin').op === 'yes', 'lipofuscin is orange pigment');

/* ---------------- nothing else changes ---------------- */
ok(eq(adds('drusen in the macula').map(x => x.key), ['drusen_hard']), 'drusen on their own are drusen');
ok(eq(adds('nevus at 7, drusen in the macula').map(x => [x.key, x.site || null]), [['choroidal_nevus', null], ['drusen_hard', 'macula']]), 'drusen with their own place stay a finding beside a naevus');
ok(eq(adds('drusen in the macula and a nevus at 7').map(x => x.key), ['drusen_hard', 'choroidal_nevus']), 'drusen before a naevus stay a finding');
ok(eq(adds('hard drusen and soft drusen').map(x => x.key), ['drusen_hard', 'drusen_soft']), 'hard and soft drusen');
ok(one('elevated NVE at 2').key === 'neovascularization_elsewhere_elevated', 'elevated NVE');
ok(one('elevated disc').key === 'optic_disc_edema', 'elevated disc');
ok(one('flat RD from 10 to 2').type === 'rd' && one('flat RD from 10 to 2').depth === 'shallow', 'flat RD is shallow');
const rdOnly = adds('RD from 10 to 2, 2 dd from the fovea');
ok(rdOnly.length === 1 && rdOnly[0].type === 'rd' && rdOnly[0].dist == null, 'a distance with no tumour is ignored');
ok(one('FTMH with a small cuff of subretinal fluid') && !one('FTMH with a small cuff of subretinal fluid').srf, 'a cuff of fluid at a hole is not tumour SRF');
ok(adds('nevus with srf').length === 1 && one('nevus with srf').srf === 'yes', 'SRF abbreviation');

/* ---------------- placement and size on the chart ---------------- */
let s = mk(['choroidal nevus 2 x 1.5 dd, 2 dd superotemporal to the disc'], 'OD');
let pl = RD.catPlace(s.findings[0], 'OD');
ok(Math.abs(pl.tum.rx - RD.DD_UNITS) < 1e-6 && Math.abs(pl.tum.ry - 0.75 * RD.DD_UNITS) < 1e-6, 'drawn to scale: 2 × 1.5 DD');
const dc = RD.discCenter('OD'), a = RD.hourToAngle(10.5);
const margin = Math.hypot(pl.x - dc[0], pl.y - dc[1]) - RD.G.DISC_R - RD.ellipseR(pl.tum.rx, pl.tum.ry, a);
ok(Math.abs(margin - 2 * RD.DD_UNITS) < 0.5, 'margin-to-margin distance from the disc is 2 DD');
ok(Math.cos(Math.atan2(pl.y - dc[1], pl.x - dc[0]) - a) > 0.99, 'in the superotemporal direction');
s = mk(['melanoma 3 x 2.5 DD inferotemporal to the fovea']);
pl = RD.catPlace(s.findings[0], 'OS');
ok(Math.hypot(pl.x, pl.y) > RD.ellipseR(pl.tum.rx, pl.tum.ry, Math.atan2(pl.y, pl.x)), 'a lesion said to be beside the fovea does not cover it');
s = mk(['melanoma 6 x 6 mm at 1 in the mid periphery']);
pl = RD.catPlace(s.findings[0], 'OS');
ok(Math.abs(pl.tum.rx - 4 / 2 * RD.DD_UNITS) < 1e-6, 'mm convert at 1 DD = 1.5 mm');
ok(RD.tumorLevel({ elev: 'flat' }, RD.CAT.choroidal_melanoma) === 0 && RD.tumorLevel({ shape: 'mush' }, RD.CAT.choroidal_nevus) === 3 && RD.tumorLevel({ th: 3 }, RD.CAT.choroidal_nevus) === 2, 'elevation level for drawing');
ok(RD.tumorLevel({}, RD.CAT.choroidal_nevus) === 0 && RD.tumorLevel({}, RD.CAT.choroidal_melanoma) === 2, 'unstated elevation follows the catalogue shape');

/* ---------------- note, titles, updates ---------------- */
s = mk(['choroidal nevus 2 x 1.5 dd, 2 dd superotemporal to the disc, flat, with drusen, no orange pigment, no SRF'], 'OD');
const note = RD.clinicalNote(s);
ok(/Choroidal nevus 2 × 1\.5 DD, 2 DD superotemporal to the optic disc; flat, overlying drusen, no orange pigment, no subretinal fluid\./.test(note), 'note sentence: ' + note);
ok(RD.findingTitle(s.findings[0], 'OD') === 'Choroidal nevus · 2×1.5 DD · superotemporal · 2 DD from disc', 'title with size and place');
let u = RD.applyActions(s, P('the nevus has orange pigment', 'OD').actions);
ok(u.scene.findings.length === 1 && u.scene.findings[0].op === 'yes' && u.scene.findings[0].dru === 'yes' && /Updated/.test(u.notes.join(' ')), 'described again → updated, not duplicated');
u = RD.applyActions(u.scene, P('nevus is 3 DD, minimally elevated', 'OD').actions);
ok(u.scene.findings.length === 1 && eq(u.scene.findings[0].base, [3]) && u.scene.findings[0].elev === 'min' && u.scene.findings[0].dist === 2, 'size and elevation updated, place kept');
u = RD.applyActions(u.scene, P('nevus at 7 in the mid periphery', 'OD').actions);
ok(u.scene.findings.length === 2, 'a naevus at a new place is a second naevus');
s = mk(['melanoma 6 x 5 x 2.5 mm at 1 in the mid periphery, dome shaped, orange pigment, trace SRF']);
ok(/Choroidal melanoma 6 × 5 mm, at 1 o’clock in the mid-periphery; 2\.5 mm thick, dome-shaped, orange pigment, trace subretinal fluid\./.test(RD.clinicalNote(s)), 'note with thickness and shape');

/* ---------------- review links: clean-up and change list ---------------- */
const hostile = { eye: 'OS', findings: [{ type: 'cat', key: 'choroidal_nevus', id: 1, base: [2, 'x'], bu: 'km', th: 99, elev: 'sky', shape: 'dome', op: 'yes', dru: true, srf: 'lots', dist: -3 }] };
const clean = RD.sanitizeScene(hostile).findings[0];
ok(clean && clean.base === undefined && clean.bu === undefined && clean.th === undefined && clean.elev === undefined && clean.shape === 'dome' && clean.op === 'yes' && clean.dru === undefined && clean.srf === undefined && clean.dist === undefined, 'untrusted tumour fields cleaned');
const good = RD.sanitizeScene(mk(['choroidal nevus 2 x 1.5 dd, 2 dd superotemporal to the disc, flat, with drusen, no orange pigment, no SRF'])).findings[0];
ok(eq(good.base, [2, 1.5]) && good.elev === 'flat' && good.dru === 'yes' && good.op === 'no' && good.srf === 'no' && good.dist === 2, 'genuine tumour fields survive a review link');
const r0 = mk(['nevus 2 DD at 7 in the mid periphery, flat, no SRF']);
const r1 = RD.applyActions(RD.clone(r0), P('the nevus is minimally elevated with SRF and orange pigment').actions).scene;
const dif = RD.diffScenes(r0, r1);
ok(dif.length === 1 && dif[0].kind === 'changed' && /flat, no SRF → minimally elevated, orange pigment, SRF/.test(dif[0].text), 'review lists a tumour’s changed features: ' + (dif[0] && dif[0].text));
const r2 = RD.applyActions(RD.clone(r0), P('nevus 3 DD').actions).scene;
ok(/2 DD.*→.*3 DD/.test(RD.diffScenes(r0, r2)[0].text), 'review lists a size change');

console.log(`tumour: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
