/* Every catalogue entry: its name parses to that entry, it places on the chart in both eyes,
   and its title and note line read cleanly. Plus phrase-level regression checks. */
const RD = require('../src/core.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('✗ ' + m); } };
const add = (text, eye) => RD.parse(text, { eye: eye || 'OS' }).actions.filter(a => a.op === 'add');
const drawable = RD.CATALOG.filter(e => !(e.map && e.map.type === 'auto'));
ok(RD.CATALOG.length >= 220, `catalogue has ${RD.CATALOG.length} entries`);

for (const E of drawable) {
  // 1. the first sayable phrase reaches this entry
  const ph = (E.match && E.match[0]) || null;
  if (E.map) {
    // engine findings: the catalogue only keeps phrases the engine did not already understand
    if (ph) {
      const t = { star: 'pvr', rolled: null, dem: null, funnel: 'rd', lattear: 'hst' }[E.map.type];
      const want = t === undefined ? E.map.type : t;
      const p = RD.parse(ph + (['rd', 'grt', 'dia', 'lat', 'chd', 'buckle', 'lattear'].includes(E.map.type) ? ' from 10 to 2' : ' at 2'), { eye: 'OS' });
      if (want) ok(p.actions.some(a => a.op === 'add' && a.f.type === want), `${E.id}: "${ph}" → ${want} (got ${p.actions.map(a => a.op + ':' + (a.f ? a.f.type : '')).join(',')})`);
      else ok(p.actions.some(a => a.op === 'rdmod'), `${E.id}: "${ph}" → detachment modifier`);
    }
    continue;
  }
  ok(ph, `${E.id}: has at least one sayable phrase`);
  const a = add(ph);
  ok(a.length && a[0].f.type === 'cat' && a[0].f.key === E.id, `${E.id}: "${ph}" → ${a.map(x => x.f.key || x.f.type).join(',') || 'nothing'}`);
  // 2. placement in both eyes, with and without a clock hour
  for (const eye of ['OS', 'OD']) {
    for (const f of [{ type: 'cat', key: E.id, id: 3, seed: 99 }, { type: 'cat', key: E.id, hour: 2, id: 4, seed: 5 }, { type: 'cat', key: E.id, start: 1, end: 4, id: 5, seed: 7 }]) {
      const P = RD.catPlace(f, eye);
      ok(P && isFinite(P.x) && isFinite(P.y) && Math.hypot(P.x, P.y) < RD.G.R_CB + 1, `${E.id} ${eye} ${JSON.stringify(f)}: placed inside the chart (${P && [P.x, P.y].map(v => v.toFixed(0))})`);
      const t = RD.findingTitle(f, eye);
      ok(t && !/undefined|NaN|null/.test(t), `${E.id}: title "${t}"`);
    }
  }
  // 3. the note
  let sc = RD.applyActions(RD.emptyScene('OS'), [{ op: 'add', f: { type: 'cat', key: E.id } }]).scene;
  const note = RD.clinicalNote(sc);
  ok(note.includes(RD.catName(E)) && !/undefined|NaN/.test(note), `${E.id}: note "${note}"`);
  // 4. Claude's actions are accepted for every id
  const san = RD.sanitizeActions([{ op: 'add', f: { type: 'cat', key: E.id, hour: 5, site: 'mid', count: 2 } }]);
  ok(san.length === 1 && san[0].f.key === E.id && san[0].f.site === 'mid', `${E.id}: sanitize keeps the action`);
}

// phrase-level checks
const T = (text, check, label, eye) => { const p = RD.parse(text, { eye: eye || 'OS' }); let r = false; try { r = check(p.actions, p); } catch (e) { r = false; } ok(r, `${label || text} → ${JSON.stringify(p.actions)}`); };
const one = (k) => (as) => as.filter(a => a.op === 'add').length >= 1 && as.find(a => a.op === 'add').f.key === k;
T('cotton wool spots at 1 and 2', as => as.filter(a => a.f && a.f.key === 'cotton_wool_spot').map(a => a.f.hour).join() === '1,2');
T('3 cotton-wool spots superotemporal to the disc', as => as[0].f.count === 3 && as[0].f.site === 'disc' && as[0].f.quad === 'st');
T('drusen in the macula', as => as[0].f.key === 'drusen_hard' && as[0].f.site === 'macula');
T('soft drusen', one('drusen_soft'));
T('BRVO superotemporal', as => as[0].f.key === 'branch_retinal_vein_occlusion' && as[0].f.quad === 'st' && as[0].f.start === 12 && as[0].f.end === 3);
T('BRVO superotemporal', as => as[0].f.quad === 'st' && as[0].f.start === 9 && as[0].f.end === 12, 'BRVO superotemporal OD', 'OD');
T('CRVO', one('central_retinal_vein_occlusion'));
T('CNV involving the fovea', as => as.length === 1 && as[0].f.key === 'choroidal_neovascularization' && as[0].f.site === 'fovea');
T('macula off RRD from 10 to 2 with a tear at 12', as => as.some(a => a.op === 'status' && a.macula === 'off') && !as.some(a => a.f && a.f.type === 'cat'));
T('exudative RD from 4 to 8', as => as[0].f.type === 'rd' && as[0].f.cause === 'exudative' && as[0].f.start === 4);
T('exudative retinal detachment inferiorly', as => as[0].f.type === 'rd' && as[0].f.cause === 'exudative' && as[0].f.start === 4 && as[0].f.end === 8);
T('disc hemorrhage at 7', as => as[0].f.key === 'optic_disc_hemorrhage' && as[0].f.hour === 7);
T('haemorrhage at the disc', as => as[0].f.key === 'optic_disc_hemorrhage');
T('hemorrhages in the posterior pole', as => as[0].f.key === 'intraretinal_hemorrhage_dot_blot' && as[0].f.site === 'pole');
T('blood in the vitreous', as => as[0].f.type === 'vh');
T('dot blot hemorrhages and microaneurysms in the macula', as => as.every(a => a.f.site === 'macula') && as.length === 2);
T('nevus at 7 o\'clock in the mid periphery', as => as[0].f.key === 'choroidal_nevus' && as[0].f.hour === 7 && as[0].f.site === 'mid');
T('choroidal nevus at the equator at 8', as => as[0].f.site === 'equator' && as[0].f.hour === 8);
T('PRP', one('prp_scars'));
T('panretinal photocoagulation', one('prp_scars'));
T('silicone oil', one('silicone_oil_fill'));
T('macular hole', one('full_thickness_macular_hole'));
T('lamellar macular hole', one('lamellar_macular_hole'));
T('ERM', one('epiretinal_membrane'));
T('epiretinal membrane', one('epiretinal_membrane'));
T('papilloedema', one('papilledema'));
T('choroidal melanoma inferotemporal', as => as[0].f.key === 'choroidal_melanoma' && as[0].f.quad === 'it');
T('choroidal detachment', as => as[0].f.type === 'chd');
T('choroidal detachment from 4 to 8', as => as[0].f.type === 'chd' && as[0].f.start === 4);
T('suprachoroidal hemorrhage from 4 to 8', as => as[0].f.type === 'chd' && as[0].f.hem === true);
T('kissing choroidals', as => as[0].f.type === 'chd' && as[0].f.kissing === true);
T('encircling band', as => as[0].f.type === 'buckle' && as[0].f.encircling);
T('segmental buckle from 10 to 2', as => as[0].f.type === 'buckle' && !as[0].f.encircling && as[0].f.start === 10);
T('scleral buckle', as => as[0].f.type === 'buckle');
T('360 laser', as => as[0].f.type === 'laser' && as[0].f.full && as[0].f.start === 12 && as[0].f.end === 12);
T('laser around the tear', as => as[0].f.type === 'laser' && as[0].f.around === 'breaks');
T('pigmented lattice with holes from 5 to 7', as => as.length === 1 && as[0].f.type === 'lat' && as[0].f.pigmented && as[0].f.holes);
T('lattice from 7 to 9 with holes', as => as.length === 1 && as[0].f.holes);
T('lattice with a tear at 2', as => as.length === 2 && as[0].f.type === 'lat' && as[1].f.type === 'hst' && as[1].f.hour === 2);
T('lattice with tractional tear from 7 to 8', as => as.some(a => a.f.type === 'lat' && a.f.start === 7) && as.some(a => a.f.type === 'hst'));
T('HST at 1 with rolled edges', as => as[0].f.type === 'hst' && as[0].f.rolled);
T('PVR grade C', as => as[0].f.type === 'pvr' && as[0].f.grade === 'C');
T('PVR grade B', as => as[0].f.type === 'pvr' && as[0].f.grade === 'B');
T('funnel detachment', as => as.some(a => a.f.type === 'rd' && a.f.total) && as.some(a => a.f.type === 'pvr'));
T('fresh blood in the vitreous', as => as[0].f.type === 'vh' && as[0].f.fresh);
T('vitreous hemorrhage inferiorly', as => as[0].f.type === 'vh' && as[0].f.hour === 6);
T('posterior vitreous detachment', one('posterior_vitreous_detachment'));
T('weiss ring', one('weiss_ring'));
T('remove the drusen', as => as[0].op === 'remove' && as[0].key === 'drusen_hard');
T('move the nevus to 5', as => as[0].op === 'move' && as[0].key === 'choroidal_nevus' && as[0].to === 5);
T('tractional retinal detachment along the superior arcade', as => as[0].f.key === 'tractional_retinal_detachment' && as[0].f.site === 'arcade' && as[0].f.arc === 's');
T('NVD', one('neovascularization_of_disc'));
T('NVE at 2', as => as[0].f.key === 'neovascularization_elsewhere_flat' && as[0].f.hour === 2);
T('sea fan at 3', as => as[0].f.key === 'sickle_sea_fan' && as[0].f.hour === 3);
T('cherry red spot', one('cherry_red_spot'));
T('CRAO', one('central_retinal_artery_occlusion'));
T('bone spicules', one('retinitis_pigmentosa_bone_spicules'));
T('Stargardt flecks', one('stargardt_flecks'));
T('RPE tear', one('rpe_tear'));
T('pars planitis snowbank inferiorly', as => as[0].f.key === 'pars_planitis_snowbank' && as[0].f.quad === 'i');
T('CSC', one('csc_serous_detachment'));
T('PED', one('pigment_epithelial_detachment'));
T('geographic atrophy', one('geographic_atrophy'));
T('fovea-involving CNV', as => as.length === 1 && as[0].f.key === 'choroidal_neovascularization');
T('flame hemorrhages along the inferior arcade', as => as[0].f.key === 'intraretinal_hemorrhage_flame' && as[0].f.arc === 'i');
T('gas bubble', as => as[0].f.key === 'intraocular_gas_bubble' || as[0].f.key === 'pneumatic_retinopexy');
T('superior hemiretinal vein occlusion', as => as[0].f.key === 'hemiretinal_vein_occlusion' && as[0].f.quad === 's');
// the old engine phrases are untouched
T('fovea splitting RRD from 10 to 5, HST at 12, lattice 7 to 8', as => as.filter(a => a.op === 'add').map(a => a.f.type).join() === 'rd,hst,lat');
T('he has a tear at 12', as => as.length === 1 && as[0].f.type === 'hst', 'pronoun “he” is not hard exudates');
T('so there is a tear at 12', as => as.length === 1 && as[0].f.type === 'hst', '“so” is not silicone oil');
T('draw me a tear at 12', as => as.length === 1 && as[0].f.type === 'hst', '“me” is not macular edema');

// scene behaviour
let sc = RD.emptyScene('OS');
sc = RD.applyActions(sc, RD.parse('drusen in the macula', { eye: 'OS' }).actions).scene;
sc = RD.applyActions(sc, RD.parse('drusen in the macula', { eye: 'OS' }).actions).scene;
ok(sc.findings.length === 1, 'saying the same finding twice updates it');
sc = RD.applyActions(sc, RD.parse('remove the drusen', { eye: 'OS' }).actions).scene;
ok(sc.findings.length === 0, 'remove by name');
sc = RD.applyActions(RD.emptyScene('OS'), RD.parse('exudative RD from 4 to 8', { eye: 'OS' }).actions).scene;
ok(RD.lincoff(sc) === null && /exudative/i.test(RD.clinicalNote(sc)) && /Lincoff’s rules do not apply/.test(RD.clinicalNote(sc)), 'exudative RD: no Lincoff zone, note says why');
sc = RD.applyActions(RD.emptyScene('OS'), RD.parse('choroidal nevus at 8', { eye: 'OS' }).actions).scene;
sc = RD.applyActions(sc, RD.parse('move the nevus to 5', { eye: 'OS' }).actions).scene;
ok(sc.findings[0].hour === 5, 'move a catalogue finding');
console.log(`catalog: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
{
  let s2 = RD.applyActions(RD.emptyScene('OS'), RD.parse('HST at 12, laser around the tear, cryo around the tear', { eye: 'OS' }).actions).scene;
  const titles = s2.findings.map(f => RD.findingTitle(f, 'OS'));
  ok(titles.every(t => !/NaN|undefined/.test(t)) && titles.includes('Laser around a break'), 'treatment around a break has a clean title: ' + titles.join(' | '));
  console.log(`catalog (with treatment titles): ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
}
/* regressions from the independent review */
{
  const has = (as, k) => as.some(a => a.op === 'add' && (a.f.key === k || a.f.type === k));
  T('No NVD or NVE', as => as.length === 0, 'negation: no NVD or NVE');
  T('RD from 10 to 2, no PVR', as => as.length === 1 && as[0].f.type === 'rd', 'negation after a comma');
  T('lattice at 7 to 8 no holes', as => as.length === 1 && !as[0].f.holes, 'negated holes');
  T('PDR with NVD and NVE superotemporally, no vitreous haemorrhage', as => has(as, 'neovascularization_of_disc') && !has(as, 'vh'));
  T('macular hole at the fovea in the left eye', as => !as.some(a => a.op === 'status') && has(as, 'full_thickness_macular_hole'));
  T('CNV at the macula on OCT', as => !as.some(a => a.op === 'status'));
  T('GA sparing the fovea', as => !as.some(a => a.op === 'status') && has(as, 'geographic_atrophy'));
  T('foveal sparing GA', as => !as.some(a => a.op === 'status'));
  T('TRD threatening the macula', as => !as.some(a => a.op === 'status'));
  T('RD 10 to 2 with ERM macula off', as => as.some(a => a.op === 'status' && a.macula === 'off'));
  T('RD from 1 to 5 with a choroidal naevus at 7 fovea off', as => as.some(a => a.op === 'status' && a.fovea === 'off') && as.find(a => a.f && a.f.key === 'choroidal_nevus').f.hour === 7);
  T('C3F8 gas', as => as.length === 1 && as[0].f.key === 'intraocular_gas_bubble');
  T('10% SF6 gas', as => as.length === 1 && as[0].f.key === 'intraocular_gas_bubble' && as[0].f.hour == null);
  T('there is a mass at 3', as => !has(as, 'microaneurysm'));
  T('odds are there is a tear at 2', as => as.length === 1 && as[0].f.type === 'hst');
  T('BRAO, history of PFO', as => as.length === 1);
  T('choroidal neovascularisation at the fovea', as => has(as, 'choroidal_neovascularization') && !has(as, 'chd'));
  T('choroidal tumour at 7', as => !has(as, 'chd'));
  T('two choroidal naevi superotemporally', as => as.length === 1 && as[0].f.key === 'choroidal_nevus' && as[0].f.count === 2);
  T('ERM and a nevus at 7 in the mid periphery', as => as[0].f.site !== 'mid' && as[1].f.site === 'mid');
  T('NVD and dot blot haemorrhages in the macula', as => as[0].f.site !== 'macula' && as[1].f.site === 'macula');
  T('papilloedema with flame haemorrhages around the disc', as => as[0].f.site == null && as[1].f.site === 'ppa');
  T('along the superior arcade there are flame haemorrhages', as => as.length === 1 && as[0].f.site === 'arcade' && as[0].f.arc === 's');
  T('posterior to the equator there is a nevus at 7', as => as.length === 1 && as[0].f.site === 'mid');
  T('horseshoe tear with a cuff of fluid at 1', as => as.length === 1 && as[0].f.type === 'hst' && as[0].f.cuff && as[0].f.hour === 1);
  T('combined tractional rhegmatogenous RD from 7 to 11 macula off', as => as[0].f.type === 'rd' && as[0].f.cause === 'combined' && as[0].f.start === 7);
  T('exudative bullous RD from 4 to 8', as => as[0].f.cause === 'exudative' && as[0].f.depth === 'bullous');
  T('remove the oil', as => as[0].op === 'remove' && as[0].key === 'silicone_oil_fill');
  T('retina flat under oil', as => !as.some(a => a.op === 'rdmod'));
  T('small PFCL drop at the fovea', as => as.length === 1 && as[0].op === 'add');
  T('media clear, horseshoe tear at 12', as => !as.some(a => a.op === 'clear'));
  T('clear', as => as[0].op === 'clear');
  T('clear the chart', as => as[0].op === 'clear');
  T('redo PPV for recurrent RD', as => !as.some(a => a.op === 'redo'));
  T('redo', as => as[0].op === 'redo');
  T('similar drusen in the other eye', as => !as.some(a => a.op === 'eye'));
  T('switch to the other eye', as => as[0].op === 'eye');
  T('probable CNV', as => !as.some(a => a.op === 'lincoff'));
  T('dot blot haems', as => has(as, 'intraretinal_hemorrhage_dot_blot'));
  T('vit haem', as => has(as, 'vh'));
  T('DMO', as => has(as, 'macular_edema_thickening'));
  T('lipid exudation', as => has(as, 'hard_exudates'));
  T('move the BRVO to inferotemporal', as => as[0].op === 'move' && as[0].quad === 'it');
  T('total RD with PVR grade C and a closed funnel', as => as.filter(a => a.f && a.f.type === 'rd').length === 1 && as.filter(a => a.f && a.f.type === 'pvr').length === 1);
  T('FTMH with a small cuff of subretinal fluid', as => as.length === 1);
  T('WWOP 360', as => as[0].f.full === true);
  T('PCV with orange nodules', as => as.length === 1);
  T('stage 4 FTMH', as => as.length === 1 && as[0].f.hour == null);
  T('cup to disc ratio 0.6', as => as.length === 0);
  T('BCVA 6/12, drusen in the macula', as => as.length === 1 && as[0].f.hour == null);
  T('1+ vitreous cells', as => as.length === 1 && as[0].f.hour == null);
  T('nevus measuring 5 by 4 mm superotemporally', as => as.length === 1 && as[0].f.quad === 'st');
  T('nevus 1/2 DD at 7', as => as.length === 1 && as[0].f.hour === 7);
  T('post op day 1, gas bubble', as => as.length === 1 && as[0].f.hour == null);
  T('dot blot haems in all four quadrants', as => as.length === 1 && as[0].f.quad === 'all');
  T('fresh blood in the vitreous', as => as[0].f.type === 'vh' && as[0].f.fresh);
  let e2 = RD.applyActions(RD.emptyScene('OS'), RD.parse('BRVO superotemporal', { eye: 'OS' }).actions).scene;
  e2 = RD.applyActions(e2, RD.parse('switch eye', { eye: 'OS' }).actions).scene;
  ok(e2.eye === 'OD' && e2.findings[0].start === 9 && e2.findings[0].end === 12, 'quadrant findings keep their anatomy when the eye changes');
  e2 = RD.applyActions(e2, RD.parse('move the BRVO to inferotemporal', { eye: 'OD' }).actions).scene;
  ok(e2.findings.length === 1 && e2.findings[0].quad === 'it' && e2.findings[0].start === 6, 'move to a quadrant');
  let e3 = RD.applyActions(RD.emptyScene('OS'), RD.parse('RD from 12 to 4 macula on, lattice with a horseshoe tear at 2, laser around the tear', { eye: 'OS' }).actions);
  ok(e3.scene.findings.some(f => f.type === 'hst') && e3.scene.findings.some(f => f.type === 'laser' && f.target) && !e3.notes.some(n => /No breaks/.test(n)), 'a tear said with lattice is a real break: ' + e3.notes.join(' '));
  console.log(`catalog (with review regressions): ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
}
