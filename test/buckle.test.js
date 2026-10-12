/* Scleral buckle guide: which configuration each pattern of breaks gets, the evidence behind it,
   the plan drawn on the chart, and buckle elements surviving titles, notes and review links.
   Run: node test/buckle.test.js */
const RD = require('../src/core.js');
const BK = require('../src/buckle.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const mk = (cmds, eye) => { let s = RD.emptyScene(eye || 'OS'); for (const c of cmds) s = RD.applyActions(s, RD.parse(c, { eye: s.eye }).actions).scene; return s; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b) => Math.abs(a - b) < 1e-6;
const refsOf = (items) => [].concat(...items.map(i => i.refs));
const allItems = (p) => ['why', 'alts', 'elements', 'place', 'expect', 'notes', 'against'].flatMap(k => p[k] || []);
const text = (items) => items.map(i => i.t).join(' | ');

/* ---------------- arc covering the breaks ---------------- */
ok(BK.coverArc([]) === null, 'no hours, no arc');
ok(eq(BK.coverArc([3]), { s: 3, e: 3, len: 0 }), 'one hour, zero length');
let a = BK.coverArc([11, 1]);
ok(a.s === 11 && a.e === 1 && near(a.len, 2), 'arc across 12 o’clock goes the short way');
a = BK.coverArc([1, 11, 12]);
ok(a.s === 11 && a.e === 1 && near(a.len, 2), 'order of hours does not matter');
a = BK.coverArc([2, 7]);
ok(near(a.len, 5) && a.s === 2 && a.e === 7, 'two breaks five hours apart');
ok(near(BK.coverArc([12, 4, 8]).len, 8), 'three evenly spaced breaks span two thirds of the clock');

/* ---------------- states the guide does not plan for ---------------- */
ok(BK.plan(RD.emptyScene('OS')).state !== 'ok', 'no detachment, no plan');
ok(BK.plan(mk(['left eye', 'horseshoe tear at 2'])).state !== 'ok', 'a tear without a detachment, no plan');

/* ---------------- one horseshoe tear → radial element ---------------- */
let s = mk(['left eye', 'phakic', 'retinal detachment from 12 to 3 macula on', 'horseshoe tear at 1:30']);
let p = BK.plan(s);
ok(p.state === 'ok' && p.cand.sb && p.cand.ppvsb, 'single tear: both repairs are candidates');
ok(p.sb.status === 'plan' && p.sb.kind === 'radial', 'single horseshoe tear → radial element');
ok(eq(p.facts, ['horseshoe tear 1:30', 'one site']), 'facts list the tear', p.facts);
ok(p.sb.draw.length === 1 && p.sb.draw[0].radial && p.sb.draw[0].hour === 1.5 && p.sb.draw[0].type === 'buckle', 'radial element drawn on the tear’s meridian');
ok(/506.*510.*511.*519G/.test(text(p.sb.elements)), 'unknown tear size: both sponge sizes offered');
ok(refsOf(p.sb.why).includes('goldbaum') && refsOf(p.sb.why).includes('kreissig92'), 'radial: tension model and minimal-buckling series cited');
ok(p.sb.alts.some(x => x.name === 'Encircling band'), 'radial: band offered as the alternative');
s = mk(['left eye', 'phakic', 'retinal detachment from 12 to 3 macula on', 'large horseshoe tear at 1:30']);
p = BK.plan(s);
ok(p.sb.kind === 'radial' && p.sb.draw[0].el === '511' && p.sb.draw[0].size > 1, 'large tear → 511, sized element', p.sb.draw);
ok(/511.*519G/.test(text(p.sb.elements)) && !/506/.test(text(p.sb.elements)), 'large tear: only the large sponges');
ok(refsOf(p.sb.notes).includes('pruett'), 'large tear: fish-mouth note');
s = mk(['left eye', 'phakic', 'retinal detachment from 12 to 3 macula on', 'small horseshoe tear at 1:30']);
p = BK.plan(s);
ok(p.sb.draw[0].el === '506' && /506.*510/.test(text(p.sb.elements)) && !/511/.test(text(p.sb.elements)), 'small tear → 506/510');

/* ---------------- breaks within a quadrant → circumferential segment ---------------- */
s = mk(['left eye', 'phakic', 'retinal detachment from 9 to 3 macula on', 'horseshoe tear at 11 and horseshoe tear at 2']);
p = BK.plan(s);
ok(p.sb.kind === 'circ', 'two tears three hours apart → circumferential segment');
ok(p.sb.draw.length === 1 && p.sb.draw[0].start === 10 && p.sb.draw[0].end === 3 && p.sb.draw[0].el === '506' && !p.sb.draw[0].ant, 'segment runs one hour past each outer tear', p.sb.draw);
ok(refsOf(p.sb.why).includes('wu2024') && refsOf(p.sb.why).includes('conart'), 'circ with several breaks: Wu and the multiple-break caveat');
ok(/teaching, not an outcome-tested figure/.test(text(p.sb.place)), 'the 1-hour margin is labelled as teaching');
s = mk(['left eye', 'phakic', 'retinal detachment from 6 to 8 macula on', 'atrophic holes at 7']);
p = BK.plan(s);
ok(p.sb.kind === 'circ' && p.sb.draw[0].start === 6 && p.sb.draw[0].end === 8, 'atrophic hole → circumferential segment');
ok(refsOf(p.sb.why).includes('ho2002') && !refsOf(p.sb.why).includes('conart'), 'single hole: no multiple-break caveat');

/* ---------------- dialysis ---------------- */
s = mk(['left eye', 'phakic', 'retinal detachment from 3 to 6 macula on', 'dialysis from 4 to 5']);
p = BK.plan(s);
ok(p.sb.kind === 'circ' && /dialysis/.test(p.sb.title), 'dialysis → circumferential buckle along it');
ok(p.sb.draw[0].ant === true && p.sb.draw[0].el === '505' && p.sb.draw[0].start === 3 && p.sb.draw[0].end === 6, 'dialysis segment sits at the ora', p.sb.draw);
ok(eq(p.sb.elements[0].refs, ['kiraly']), 'dialysis elements cite only the comparative series');
ok(refsOf(p.sb.why).includes('stoffelns') && refsOf(p.sb.why).includes('mahmoud'), 'dialysis outcomes cited');

/* ---------------- breaks over more than a quadrant → encircle ---------------- */
s = mk(['left eye', 'phakic', 'retinal detachment from 9 to 6 macula on', 'horseshoe tear at 10 and horseshoe tear at 2 and horseshoe tear at 5']);
p = BK.plan(s);
ok(p.sb.kind === 'encircle', 'breaks over 7 hours → encircling band');
ok(p.sb.draw[0].encircling === true && p.sb.draw[0].el === '240', 'band drawn first, a 240');
const segs = p.sb.draw.slice(1);
ok(segs.length === 3 && segs.every(x => x.onBand && x.el === '287'), 'a 287 tire under each separate tear', segs);
ok(segs.some(x => x.start === 9.25 && x.end === 10.75), 'tire spans ±¾ hour around its tear', segs);
ok(p.sb.alts.some(x => x.name.startsWith('Several radial')), 'all horseshoe tears: multiple radial elements offered');
ok(/287WG/.test(text(p.sb.elements)) && /240.*41.*42/.test(text(p.sb.elements)), 'bands and tires named');
s = mk(['left eye', 'phakic', 'retinal detachment from 9 to 6 macula on', 'horseshoe tear at 10 and horseshoe tear at 11 and atrophic hole at 4']);
p = BK.plan(s);
ok(p.sb.kind === 'encircle' && p.sb.draw.length === 3, 'tears an hour apart share one tire', p.sb.draw);
ok(!p.sb.alts.some(x => x.name.startsWith('Several radial')), 'not all horseshoe tears: no radial-only alternative');
ok(p.sb.expect.some(x => x.refs.includes('smiddyRx')), 'encircle: refraction expectations from the band series');

/* ---------------- no break, giant tear ---------------- */
p = BK.plan(mk(['left eye', 'phakic', 'retinal detachment from 12 to 3 macula on']));
ok(p.sb.status === 'nobreak' && p.sb.draw.length === 0 && refsOf(p.sb.why).includes('tewari'), 'no break: find it first, no drawing');
ok(eq(p.facts, ['No break drawn in the detachment']), 'no break: facts say so');
p = BK.plan(mk(['left eye', 'pseudophakic', 'retinal detachment from 12 to 6 macula off', 'giant retinal tear from 1 to 4']));
ok(p.sb.status === 'avoid' && p.cand.sb === false && p.cand.ppvsb === true, 'giant tear: buckle alone avoided, PPV-buckle a candidate');
ok(refsOf(p.sb.why).includes('lincoffPouch') && refsOf(p.sb.why).includes('evrs2'), 'giant tear evidence');

/* ---------------- breaks outside the detachment are not planned for ---------------- */
p = BK.plan(mk(['left eye', 'phakic', 'retinal detachment from 12 to 3 macula on', 'horseshoe tear at 1:30', 'atrophic hole at 7']));
ok(p.pts.length === 1 && p.outside.length === 1 && p.sb.kind === 'radial', 'a hole in attached retina is listed apart and does not change the plan');

/* ---------------- notes ---------------- */
p = BK.plan(mk(['left eye', 'pseudophakic', 'retinal detachment from 12 to 3 macula on', 'horseshoe tear at 1:30', 'PVR grade C']));
ok(refsOf(p.sb.notes).includes('singh') && refsOf(p.sb.notes).includes('evrs2'), 'pseudophakic and PVR C notes', p.sb.notes);
p = BK.plan(mk(['left eye', 'phakic', 'retinal detachment from 12 to 3 macula on', 'horseshoe tear at 1:30', 'lattice from 7 to 11']));
ok(/Lattice is drawn over more than 3 clock hours/.test(text(p.sb.notes)), 'extensive lattice note');

/* ---------------- vitrectomy with a buckle ---------------- */
p = BK.plan(mk(['left eye', 'phakic', 'retinal detachment from 12 to 3 macula on', 'horseshoe tear at 1:30']));
ok(p.ppvsb.kind === 'band' && eq(p.ppvsb.draw, [{ type: 'buckle', encircling: true, el: '240' }]), 'PPV-buckle draws a 240 band');
ok(refsOf(p.ppvsb.why).includes('pro2') && !refsOf(p.ppvsb.why).includes('pro3'), 'phakic: PRO phakic report');
ok(refsOf(p.ppvsb.against).includes('viper2') && refsOf(p.ppvsb.against).includes('rosenberg') && refsOf(p.ppvsb.against).includes('evrs1'), 'evidence against is always shown');
ok(!p.ppvsb.drawAlt && !refsOf(p.ppvsb.why).includes('pro9'), 'superior tear: no inferior-break evidence or alternative');
p = BK.plan(mk(['left eye', 'pseudophakic', 'retinal detachment from 4 to 8 macula off', 'horseshoe tear at 6']));
ok(refsOf(p.ppvsb.why).includes('pro3') && refsOf(p.ppvsb.why).includes('pro9') && refsOf(p.ppvsb.against).includes('viper3'), 'pseudophakic inferior tear: PRO3, PRO9, VIPER subgroup');
ok(p.ppvsb.drawAlt && p.ppvsb.drawAlt[0].el === '510' && p.ppvsb.drawAlt[0].start === 5.25 && p.ppvsb.drawAlt[0].end === 6.75, 'inferior tear: segmental 510 alternative', p.ppvsb.drawAlt);
ok(refsOf(p.ppvsb.elements).includes('arjmand'), 'segmental alternative cited');

/* ---------------- every citation resolves; every level is known ---------------- */
const scenes = [
  ['left eye', 'phakic', 'retinal detachment from 12 to 3 macula on', 'large horseshoe tear at 1:30', 'PVR grade C', 'lattice from 7 to 11'],
  ['left eye', 'pseudophakic', 'retinal detachment from 9 to 6 macula on', 'horseshoe tear at 10 and horseshoe tear at 2 and horseshoe tear at 5'],
  ['left eye', 'phakic', 'retinal detachment from 3 to 6 macula on', 'dialysis from 4 to 5'],
  ['left eye', 'phakic', 'retinal detachment from 12 to 3 macula on'],
  ['left eye', 'pseudophakic', 'retinal detachment from 12 to 6 macula off', 'giant retinal tear from 1 to 4'],
  ['left eye', 'pseudophakic', 'retinal detachment from 4 to 8 macula off', 'horseshoe tear at 6'],
];
let cited = new Set(), badRef = [], badLv = [];
for (const c of scenes) {
  const q = BK.plan(mk(c));
  const items = [...allItems(q.sb), ...allItems(q.ppvsb), ...q.general];
  for (const i of items) {
    for (const r of i.refs) { cited.add(r); if (!BK.REFS[r]) badRef.push(r); }
    if (i.lv && !BK.LV[i.lv]) badLv.push(i.lv);
    ok(typeof i.t === 'string' && i.t.length > 20, 'every point has text');
  }
}
ok(badRef.length === 0, 'every cited key is in the reference list', badRef);
ok(badLv.length === 0, 'every evidence level is known', badLv);
const noLink = Object.entries(BK.REFS).filter(([, r]) => !(r.doi || r.pmid || r.url));
ok(noLink.length <= 1, 'references carry a DOI, PMID or URL (Froussard has none online)', noLink.map(x => x[0]));
ok(Object.values(BK.REFS).every(r => r.cite && r.cite.length > 10), 'every reference has a citation line');
ok(cited.size >= 35, `most references are reachable from some plan (${cited.size})`);

/* ---------------- element library ---------------- */
const ids = BK.ELEMENTS.flatMap(g => g.items.map(i => i.id));
ok(['240', '41', '42', '287', '287WG', '506', '511'].every(i => ids.includes(i)), 'library has the common elements', ids);
ok(BK.ELEMENTS.every(g => g.items.every(i => i.dims || i.note)), 'every element has dimensions or a note');
for (const d of [...new Set(scenes.flatMap(c => { const q = BK.plan(mk(c)); return [...q.sb.draw, ...q.ppvsb.draw, ...(q.ppvsb.drawAlt || [])].map(x => x.el).filter(Boolean); }))]) ok(RD.BUCKLE_EL[d], `drawn element ${d} is a known element`);

/* ---------------- drawing the plan ---------------- */
s = mk(['left eye', 'phakic', 'retinal detachment from 9 to 6 macula on', 'horseshoe tear at 10 and horseshoe tear at 2 and horseshoe tear at 5', 'segmental buckle from 1 to 3']);
p = BK.plan(s);
const before = JSON.stringify(s);
const n = BK.applyPlan(s, p.sb.draw);
ok(JSON.stringify(s) === before, 'applyPlan does not change the scene it is given');
ok(n.findings.filter(f => f.type === 'buckle').length === 4, 'the old buckle is replaced by the plan');
ok(new Set(n.findings.map(f => f.id)).size === n.findings.length && n.nextId > Math.max(...n.findings.map(f => f.id)), 'ids stay unique');
const p2 = BK.plan(n);
ok(p2.sb.kind === 'encircle' && p2.pts.length === p.pts.length, 'a drawn buckle is not mistaken for a break');
const titles = n.findings.filter(f => f.type === 'buckle').map(RD.findingTitle);
ok(titles[0] === 'Encircling band · 240' && titles.slice(1).every(t => /^Segment on the band .* · 287$/.test(t)), 'titles name the elements', titles);
const note = RD.clinicalNote(n);
ok(/Encircling scleral buckle \(240 band\)\./.test(note) && /Segmental element on the encircling band, 9:15–10:45 o’clock \(287 tire\)\./.test(note), 'note names the elements', note);
let r = BK.applyPlan(mk(['left eye', 'phakic', 'retinal detachment from 12 to 3 macula on', 'large horseshoe tear at 1:30']), BK.plan(mk(['left eye', 'phakic', 'retinal detachment from 12 to 3 macula on', 'large horseshoe tear at 1:30'])).sb.draw);
ok(/Radial scleral buckle element at 1:30 o’clock \(511/.test(RD.clinicalNote(r)), 'radial note', RD.clinicalNote(r));
r = BK.applyPlan(mk(['left eye', 'phakic', 'retinal detachment from 3 to 6 macula on', 'dialysis from 4 to 5']), [{ type: 'buckle', start: 3, end: 6, el: '505', ant: true }]);
ok(/Segmental scleral buckle 3–6 o’clock \(505/.test(RD.clinicalNote(r)), 'dialysis segment note');

/* ---------------- review links keep buckle details ---------------- */
const clean = RD.sanitizeScene(JSON.parse(JSON.stringify(n)));
const cb = clean.findings.filter(f => f.type === 'buckle');
ok(cb.length === 4 && cb[0].encircling && cb[0].el === '240' && cb.slice(1).every(f => f.onBand && f.el === '287'), 'sanitised scene keeps band and tires', cb);
const rad = RD.sanitizeScene(JSON.parse(JSON.stringify(BK.applyPlan(s, [{ type: 'buckle', radial: true, hour: 2, r: 268, size: 1.5, el: '511' }]))));
const rb = rad.findings.find(f => f.type === 'buckle');
ok(rb && rb.radial && rb.hour === 2 && rb.size === 1.5 && rb.el === '511', 'sanitised radial element keeps hour, size, element', rb);
const evil = RD.sanitizeScene({ eye: 'OS', findings: [{ type: 'buckle', id: 1, radial: true, el: '<img>' }, { type: 'buckle', id: 2, encircling: true, el: 'toString' }, { type: 'buckle', id: 3, start: 2, end: 4, ant: 'yes', onBand: 1 }] });
const eb = evil.findings.filter(f => f.type === 'buckle');
ok(!eb.some(f => f.id === 1), 'radial element without an hour dropped');
ok(eb.find(f => f.id === 2) && !('el' in eb.find(f => f.id === 2)), 'unknown element name dropped');
ok(eb.find(f => f.id === 3) && !eb.find(f => f.id === 3).ant && !eb.find(f => f.id === 3).onBand, 'non-boolean flags dropped');
const d = RD.diffScenes(s, n);
ok(d && JSON.stringify(d).includes('buckle') || JSON.stringify(d).toLowerCase().includes('band'), 'a reviewer sees the buckle change', d);

console.log(`buckle: ${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
