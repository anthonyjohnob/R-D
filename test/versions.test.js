/* Resizing breaks and other spot findings, traced laser lines, and the version list.
   Run: node test/versions.test.js */
const RD = require('../src/core.js');
const CL = require('../src/changelog.js');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } };
const mk = (cmds, eye) => { let s = RD.emptyScene(eye || 'OS'); for (const c of cmds) s = RD.applyActions(s, RD.parse(c, { eye: s.eye }).actions).scene; return s; };
const T = (f) => RD.findingTitle(f, 'OS');

/* ---------------- sizes in titles and the note ---------------- */
ok(T({ type: 'hst', hour: 12 }) === 'Horseshoe tear · 12', 'plain tear');
ok(T({ type: 'hst', hour: 12, size: 1.45 }) === 'Large horseshoe tear · 12', 'spoken “large” still large');
ok(T({ type: 'hst', hour: 12, size: 0.72 }) === 'Small horseshoe tear · 12', 'spoken “small” still small');
ok(T({ type: 'hst', hour: 12, size: 1.1 }) === 'Horseshoe tear · 12', 'a slight enlargement keeps the plain name');
ok(T({ type: 'hst', hour: 12, size: 1.25 }) === 'Large horseshoe tear · 12', '1.25× is large');
ok(T({ type: 'hole', hour: 7, size: 1.6 }) === 'Large atrophic hole · 7', 'large hole');
ok(T({ type: 'oph', hour: 7, size: 0.6 }) === 'Small operculated hole · 7', 'small operculated hole');
let s = mk(['left eye', 'large horseshoe tear at 12']);
ok(/Large horseshoe tear at 12 o’clock\./.test(RD.clinicalNote(s)), 'note: one large tear', RD.clinicalNote(s));
s = mk(['left eye', 'large horseshoe tear at 12', 'large horseshoe tear at 2']);
ok(/2 large horseshoe tears at 12 and 2 o’clock\./.test(RD.clinicalNote(s)), 'note: two large tears', RD.clinicalNote(s));
s = mk(['left eye', 'large horseshoe tear at 12', 'horseshoe tear at 2']);
ok(/2 horseshoe tears at 12 \(large\) and 2 o’clock\./.test(RD.clinicalNote(s)), 'note: mixed sizes', RD.clinicalNote(s));
s = mk(['left eye', 'horseshoe tear at 12', 'horseshoe tear at 2', 'atrophic holes at 7 and 8']);
ok(/2 horseshoe tears at 12 and 2 o’clock\./.test(RD.clinicalNote(s)) && /Atrophic holes at 7 and 8 o’clock\./.test(RD.clinicalNote(s)), 'note unchanged without sizes', RD.clinicalNote(s));
s = mk(['left eye', 'small atrophic hole at 7']);
ok(/Small atrophic hole at 7 o’clock\./.test(RD.clinicalNote(s)), 'note: small hole', RD.clinicalNote(s));

/* ---------------- sizes survive review links; a resize is named in the review ---------------- */
const base = { v: 2, eye: 'OS', findings: [{ type: 'hst', id: 1, hour: 12, size: 2.5 }, { type: 'cat', id: 2, key: 'cotton_wool_spot', hour: 2, size: 3 }, { type: 'hole', id: 3, hour: 5, size: 9 }] };
let c = RD.sanitizeScene(JSON.parse(JSON.stringify(base)));
ok(c.findings[0].size === 2.5, 'size 2.5 kept', c.findings[0]);
ok(!c.findings[2] || c.findings.find(f => f.id === 3).size == null, 'absurd size dropped', c.findings);
const a = mk(['left eye', 'retinal detachment from 10 to 2', 'horseshoe tear at 12']);
const b = RD.clone(a); b.findings.find(f => f.type === 'hst').size = 1.15;
const d = RD.diffScenes(a, b);
ok(d.some(x => x.kind === 'changed' && /Horseshoe tear · 12 enlarged/.test(x.text)), 'review names an enlargement', d);

/* ---------------- traced laser lines ---------------- */
const arc = (h0, h1, r, n) => Array.from({ length: n + 1 }, (_, i) => { const h = h0 + (h1 - h0) * i / n, ang = RD.hourToAngle(h); return [Math.round(r * Math.cos(ang) * 10) / 10, Math.round(r * Math.sin(ang) * 10) / 10]; });
const L1 = arc(10, 14, 250, 60);
const sp = RD.lineSpan(L1);
ok(sp.s === 10 && sp.e === 2 && Math.abs(sp.len - 4) < 0.1, 'span of a line across 12', sp);
ok(T({ type: 'laser', line: L1 }) === 'Laser line · 10–2', 'title of a traced line', T({ type: 'laser', line: L1 }));
ok(T({ type: 'laser', line: arc(0, 11.95, 260, 200) }) === 'Laser line · 360°', '360° line');
const spots = RD.laserLineSpots(L1);
ok(spots.length > 200 && spots.every(q => Number.isFinite(q[0]) && Number.isFinite(q[1])), 'spots along the line', spots.length);
const near = spots.every(q => Math.abs(Math.hypot(q[0], q[1]) - 250) < 9);
ok(near, 'spots stay within a band around the traced line');
s = mk(['left eye', 'retinal detachment from 10 to 2', 'horseshoe tear at 12']);
s = RD.applyActions(s, [{ op: 'add', f: { type: 'laser', line: L1 } }]).scene;
ok(s.findings.some(f => f.type === 'laser' && Array.isArray(f.line)), 'a traced line is added as drawn');
ok(/Laser retinopexy along a drawn line from 10 to 2 o’clock\./.test(RD.clinicalNote(s)), 'note for a traced line', RD.clinicalNote(s));
s = RD.applyActions(s, [{ op: 'add', f: { type: 'laser', line: arc(4, 6, 240, 30) } }]).scene;
ok(/along drawn lines \(10–2 and 4–6 o’clock\)/.test(RD.clinicalNote(s)), 'note for two lines', RD.clinicalNote(s));
s = RD.applyActions(s, [{ op: 'add', f: { type: 'laser', around: 'breaks' } }]).scene;
ok(/Laser retinopexy around the horseshoe tear at 12 o’clock; along drawn lines/.test(RD.clinicalNote(s)), 'traced lines and laser around a break together', RD.clinicalNote(s));
c = RD.sanitizeScene(JSON.parse(JSON.stringify(s)));
const lines = c.findings.filter(f => f.type === 'laser' && f.line);
ok(lines.length === 2 && lines[0].line.length === L1.length, 'review links keep traced lines', lines.map(l => l.line.length));
const evil = RD.sanitizeScene({ v: 2, eye: 'OS', findings: [{ type: 'laser', id: 1, line: [[0, 0]] }, { type: 'laser', id: 2, line: [['x', 1], [5, 5]] }, { type: 'laser', id: 3, line: Array.from({ length: 2000 }, (_, i) => [i % 200, (i * 7) % 300]) }, { type: 'hst', id: 4, hour: 1, line: [[0, 0], [50, 50]] }] });
ok(!evil.findings.some(f => f.id === 1 || f.id === 2), 'degenerate lines dropped', evil.findings.map(f => f.id));
ok(evil.findings.find(f => f.id === 3).line.length <= 400, 'long lines thinned');
ok(!('line' in evil.findings.find(f => f.id === 4)), 'only laser and cryo carry a line');
const anchor = RD.findingAnchor(lines[0], c);
ok(anchor && Math.abs(Math.hypot(anchor[0], anchor[1]) - 250) < 2, 'review marker sits on the line', anchor);
const moved = RD.clone(c); const ml = moved.findings.find(f => f.id === lines[0].id); ml.line = ml.line.map(q => [q[0] + 20, q[1] + 20]);
ok(RD.diffScenes(c, moved).some(x => x.kind === 'changed' && /moved|Laser line · .* → Laser line/.test(x.text)), 'moving a line shows as a change');

/* ---------------- the version list ---------------- */
ok(CL.VERSION === CL.CHANGELOG[0].v && /^1(\.\d+){1,2}$/.test(CL.VERSION), 'version 1.x', CL.VERSION);
let ordered = true;
for (let i = 1; i < CL.CHANGELOG.length; i++) if (CL.cmpVersion(CL.CHANGELOG[i - 1].v, CL.CHANGELOG[i].v) <= 0 || CL.CHANGELOG[i - 1].date < CL.CHANGELOG[i].date) ordered = false;
ok(ordered, 'newest first, versions and dates in order');
ok(CL.CHANGELOG.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.title && r.items.length && r.items.every(t => t.length > 10)), 'every entry has a date, title and items');
ok(new Set(CL.CHANGELOG.map(r => r.v)).size === CL.CHANGELOG.length, 'no version twice');
ok(CL.cmpVersion('1.10', '1.9') > 0 && CL.cmpVersion('1.2.1', '1.2') > 0 && CL.cmpVersion('1.2', '1.2.0') === 0 && CL.cmpVersion('1.0', '2') < 0, 'version comparison');
ok(CL.CHANGELOG[CL.CHANGELOG.length - 1].v === '1.0', 'the list starts at 1.0');

console.log(`versions: ${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
