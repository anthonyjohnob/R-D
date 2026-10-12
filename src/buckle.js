/* R/D scleral buckle guide. For an eye drawn on the chart that is a candidate for a scleral buckle (alone, or
   with vitrectomy), it sets out the buckle configuration the published evidence supports, the elements that
   build it, where they go, and what to expect — each statement tagged with the kind of evidence behind it.
   Fixed rules, no AI; every source was checked on PubMed (or, for technique articles and catalogues, read at
   the stated URL). Education only: the surgeon's examination and judgement decide. */
(function (root) {
'use strict';
const RD = root.RD || (typeof require === 'function' ? require('./core.js') : null);
const { fmtHour, normHour, spanHours, mod } = RD;

/* evidence tags */
const LV = { rct: 'RCT', trial: 'Controlled trial', meta: 'Meta-analysis', cohort: 'Comparative cohort', series: 'Case series', model: 'Lab / geometric model', expert: 'Expert technique' };

const REFS = {
  evrs1: { cite: 'Adelman RA, et al. Strategy for the management of uncomplicated retinal detachments: the European Vitreo-Retinal Society retinal detachment study report 1. Ophthalmology 2013;120:1804–8.', doi: '10.1016/j.ophtha.2013.01.070', pmid: '23601799' },
  evrs2: { cite: 'Adelman RA, et al. Strategy for the management of complex retinal detachments: the European Vitreo-Retinal Society retinal detachment study report 2. Ophthalmology 2013;120:1809–13.', doi: '10.1016/j.ophtha.2013.01.056', pmid: '23601805' },
  ho2002: { cite: 'Ho CL, Chen KJ, See LC. Selection of scleral buckling for primary retinal detachment. Ophthalmologica 2002;216:33–9.', doi: '10.1159/000048294', pmid: '11901286' },
  wu2024: { cite: 'Wu MC, Lee YY, Kuo HK. Clinical features of retinal detachment treated with segmental scleral buckling. Int Ophthalmol 2024;44:304.', doi: '10.1007/s10792-024-03186-7', pmid: '38954136' },
  kreissig92: { cite: 'Kreissig I, Rose D, Jost B. Minimized surgery for retinal detachments with segmental buckling and nondrainage: an 11-year follow-up. Retina 1992;12:224–31.', doi: '10.1097/00006982-199212030-00004', pmid: '1410830' },
  conart: { cite: 'Conart JB, et al. Results of scleral buckling for rhegmatogenous retinal detachment in phakic eyes. J Fr Ophtalmol 2013;36:255–60.', doi: '10.1016/j.jfo.2012.01.007', pmid: '22981521' },
  sudhalkar: { cite: 'Sudhalkar A, Sudhalkar A. Scleral buckling surgery using multiple radial buckles: a valid option? Saudi J Ophthalmol 2015;29:192–6.', doi: '10.1016/j.sjopt.2014.11.004', pmid: '26155077' },
  goldbaum: { cite: 'Goldbaum MH, et al. Geometric analysis of radial buckling. Am J Ophthalmol 1975;79:958–65.', doi: '10.1016/0002-9394(75)90678-9', pmid: '1094833' },
  pruett: { cite: 'Pruett RC. The fishmouth phenomenon. I. Clinical characteristics and surgical options. Arch Ophthalmol 1977;95:1777–81.', doi: '10.1001/archopht.1977.04450100079006', pmid: '911248' },
  lincoffPouch: { cite: 'Lincoff H, Kreissig I, Hahn YS. An elastic pouch operation for large retinal tears. Arch Ophthalmol 1979;97:708–10.', doi: '10.1001/archopht.1979.01020010360016', pmid: '426688' },
  singh: { cite: 'Singh M. Surgery of aphakic retinal detachment. Br J Ophthalmol 1988;72:820–2.', doi: '10.1136/bjo.72.11.820', pmid: '3207656' },
  froussard: { cite: 'Froussard F, Chauvaud D. Anatomic results of buckle surgery for retinal detachments with undetected break. J Fr Ophtalmol 2001;24:345–7.', pmid: '11351205' },
  tewari: { cite: 'Tewari HK, et al. Comparison of scleral buckling with combined scleral buckling and pars plana vitrectomy in the management of rhegmatogenous retinal detachment with unseen retinal breaks. Clin Exp Ophthalmol 2003;31:403–7.', doi: '10.1046/j.1442-9071.2003.00686.x', pmid: '14516427' },
  kiraly: { cite: 'Kiraly P, et al. Outcomes and complications of sponges versus tires for scleral buckling in primary rhegmatogenous retinal detachment: the Manchester Buckle Study. Acta Ophthalmol 2026;104:e538–43.', doi: '10.1111/aos.70082', pmid: '41589551' },
  brown2006: { cite: 'Brown DM, et al. Long-term stability of circumferential silicone sponge scleral buckling exoplants. Retina 2006;26:645–9.', doi: '10.1097/01.iae.0000236473.63819.f4', pmid: '16829806' },
  hilton78: { cite: 'Hilton GF, Wallyn RH. The removal of scleral buckles. Arch Ophthalmol 1978;96:2061–3.', doi: '10.1001/archopht.1978.03910060449011', pmid: '363106' },
  arribas: { cite: 'Arribas NP, et al. Preoperative antibiotic soaking of silicone sponges: does it make a difference? Ophthalmology 1984;91:1684–9.', doi: '10.1016/s0161-6420(84)34105-7', pmid: '6395060' },
  smiddyRx: { cite: 'Smiddy WE, et al. Refractive changes after scleral buckling surgery. Arch Ophthalmol 1989;107:1469–71.', doi: '10.1001/archopht.1989.01070020543036', pmid: '2803094' },
  smiddyEom: { cite: 'Smiddy WE, et al. Extraocular muscle imbalance after scleral buckling surgery. Ophthalmology 1989;96:1485–9.', doi: '10.1016/s0161-6420(89)32701-1', pmid: '2587043' },
  kalman: { cite: 'Kalman A, et al. Results of conventional retinal detachment surgery. III. Orthoptic results. Klin Monbl Augenheilkd 1992;200:458–60.', doi: '10.1055/s-2008-1045793', pmid: '1614125' },
  goezinne: { cite: 'Goezinne F, et al. Diplopia was not predictable and not associated with buckle position after scleral buckling surgery for retinal detachment. Retina 2012;32:1514–24.', doi: '10.1097/IAE.0b013e318240a4fe', pmid: '22466475' },
  okada: { cite: 'Okada Y, et al. Analysis of changes in corneal shape and refraction following scleral buckling surgery. Jpn J Ophthalmol 2000;44:132–8.', doi: '10.1016/s0021-5155(99)00183-5', pmid: '10715379' },
  packer: { cite: 'Packer AJ, et al. Serous choroidal detachment after retinal detachment surgery. Arch Ophthalmol 1983;101:1221–4.', doi: '10.1001/archopht.1983.01040020223012', pmid: '6882250' },
  hilton81: { cite: 'Hilton GF, et al. The drainage of subretinal fluid: a randomized controlled clinical trial. Retina 1981;1:271–80.', doi: '10.1097/00006982-198101040-00002', pmid: '6758088' },
  rachal: { cite: 'Rachal WF, Burton TC. Changing concepts of failures after retinal detachment surgery. Arch Ophthalmol 1979;97:480–3.', doi: '10.1001/archopht.1979.01020010230008', pmid: '420635' },
  stoffelns: { cite: 'Stoffelns BM, Richard G. Is buckle surgery still the state of the art for retinal detachments due to retinal dialysis? J Pediatr Ophthalmol Strabismus 2010;47:281–7.', doi: '10.3928/01913913-20091019-10', pmid: '19873945' },
  mahmoud: { cite: 'Mahmoudzadeh R, et al. Clinical characteristics and management outcomes of rhegmatogenous retinal detachments due to retinal dialysis. J Vitreoretin Dis 2021;5:405–11.', doi: '10.1177/24741264211024127', pmid: '37008705' },
  viper1: { cite: 'Mazinani B, et al. Vitrectomy with or without encircling band for pseudophakic retinal detachment: VIPER Study Report No. 1 — a multi-centre, three-arm, randomised clinical trial (design and enrolment). Br J Ophthalmol 2016;100:405–10.', doi: '10.1136/bjophthalmol-2015-306732', pmid: '26198280' },
  viper2: { cite: 'Walter P, et al. Vitrectomy with and without encircling band for pseudophakic retinal detachment: VIPER Study Report No. 2 — main results. Br J Ophthalmol 2017;101:712–8.', doi: '10.1136/bjophthalmol-2016-309240', pmid: '27609785' },
  viper3: { cite: 'Baumgarten S, et al. Vitrectomy with and without encircling band for pseudophakic retinal detachment with inferior breaks: VIPER Study Report No. 3. Graefes Arch Clin Exp Ophthalmol 2018;256:2069–73.', doi: '10.1007/s00417-018-4106-6', pmid: '30140963' },
  pro2: { cite: 'Ryan EH, et al. Primary Retinal Detachment Outcomes Study Report Number 2: phakic retinal detachment outcomes. Ophthalmology 2020;127:1077–85.', doi: '10.1016/j.ophtha.2020.03.007', pmid: '32312634' },
  pro3: { cite: 'Joseph DP, et al. Primary Retinal Detachment Outcomes Study: pseudophakic retinal detachment outcomes. PRO Study Report Number 3. Ophthalmology 2020;127:1507–14.', doi: '10.1016/j.ophtha.2020.05.005', pmid: '32437865' },
  pro9: { cite: 'Starr MR, et al. Retinal detachment with inferior retinal breaks: primary vitrectomy versus vitrectomy with scleral buckle (PRO Study Report No. 9). Retina 2021;41:525–30.', doi: '10.1097/IAE.0000000000002917', pmid: '33600131' },
  eshtiaghi: { cite: 'Eshtiaghi A, et al. Pars plana vitrectomy with and without supplemental scleral buckle for the repair of rhegmatogenous retinal detachment: a meta-analysis. Ophthalmol Retina 2022;6:871–85.', doi: '10.1016/j.oret.2022.02.009', pmid: '35227949' },
  rosenberg: { cite: 'Rosenberg DM, et al. Supplemental scleral buckle for the management of rhegmatogenous retinal detachment by pars plana vitrectomy: a meta-analysis of randomized controlled trials. Ophthalmologica 2022;245:101–10.', doi: '10.1159/000520220', pmid: '34731858' },
  starrTun: { cite: 'Starr MR, et al. Scleral buckling for primary retinal detachment: outcomes of scleral tunnels versus scleral sutures. J Ophthalmic Vis Res 2021;16:377–83.', doi: '10.18502/jovr.v16i3.9434', pmid: '34394866' },
  ohMf: { cite: 'Oh JK, et al. Refractive outcomes of retinal detachment repair in patients with multifocal intraocular lenses with and without scleral buckling. Am J Ophthalmol 2026;292:1–6.', doi: '10.1016/j.ajo.2026.07.047', pmid: '42521138' },
  falkner: { cite: 'Falkner-Radler CI, Graf A, Binder S. Vitrectomy combined with endolaser or an encircling scleral buckle in primary retinal detachment surgery: a pilot study. Acta Ophthalmol 2015;93:464–9.', doi: '10.1111/aos.12663', pmid: '25626910' },
  navarrete: { cite: 'Navarrete-Sanchis J, et al. Persistent diplopia in primary position after pars plana vitrectomy with encircling band in rhegmatogenous retinal detachment. Ophthalmol Retina 2018;2:197–200.', doi: '10.1016/j.oret.2017.06.009', pmid: '31047585' },
  arjmand: { cite: 'Arjmand P, Felfeli T, Mandelcorn ED. Combined pars plana vitrectomy and segmental scleral buckle for rhegmatogenous retinal detachment with inferior retinal breaks. Clin Ophthalmol 2021;15:3515–9.', doi: '10.2147/OPTH.S321371', pmid: '34434043' },
  roldan: { cite: 'Roldán-Pallarés M, et al. MIRAgel: hydrolytic degradation and long-term observations. Arch Ophthalmol 2007;125:511–4.', doi: '10.1001/archopht.125.4.511', pmid: '17420371' },
  pinninti: { cite: 'Pinninti U, Barkmeier AJ, Carvounis PE. Segmental scleral buckling. Retina Today, March 2011 (technique article).', url: 'https://retinatoday.com/articles/2011-mar/segmental-scleral-buckling' },
  eyewiki: { cite: 'Wilkinson CP, Feldman BH, Kim LA, et al. Scleral buckling for rhegmatogenous retinal detachment. EyeWiki, American Academy of Ophthalmology (technique review).', url: 'https://eyewiki.aao.org/Scleral_Buckling_for_Rhegmatogenous_Retinal_Detachment' },
  read: { cite: 'Read SP. Pearls for scleral buckling with tunnels. Retina Specialist, 2021 (technique article).', url: 'https://www.retina-specialist.com/article/pearls-for-scleral-buckling-with-tunnels' },
  fci: { cite: 'FCI Ophthalmics. Scleral buckling components: product codes and dimensions (2020).', url: 'https://fci-ophthalmics.com/wp-content/uploads/2021/05/2020-06-FCI-Scleral-Buckling-Components-NEW-packaging-update.pdf' },
};

/* The element library. Dimensions as the FCI product list prints them; the style numbers are shared by most
   makers, but some describe the same style differently — check the box. */
const ELEMENTS = [
  { group: 'Encircling bands', items: [
    { id: '240', name: '240 band', shape: 'band', w: 2.5, h: 0.6, dims: '2.5 × 0.6 mm', use: 'Encircling band passed under the four recti, alone or through the groove of a tire (a 287). Tied with a 270 (Watzke) sleeve.', refs: ['fci', 'eyewiki', 'pinninti', 'read'] },
    { id: '41', name: '41 band', shape: 'band', w: 3.5, h: 0.75, dims: '3.5 × 0.75 mm', use: 'Wider encircling band. Pairs with a wide-groove tire (287WG).', refs: ['fci', 'eyewiki', 'read'] },
    { id: '42', name: '42 band', shape: 'band', w: 4.0, h: 1.25, dims: '4.0 × 1.25 mm', use: 'Widest and thickest of the 240, 41 and 42.', refs: ['fci', 'eyewiki'] },
    { id: '40', name: '40 band', shape: 'band', w: 2.0, h: 0.75, dims: '2.0 × 0.75 mm', use: 'A 2 mm band in the same product list.', refs: ['fci'] },
  ] },
  { group: 'Tires (grooved solid silicone)', note: 'A tire is a wider, contoured segment that sits under a band (the band runs in its groove) or is sutured on its own. FCI widths are shown; other makers may describe the same style differently.', items: [
    { id: '287', name: '287 tire', shape: 'tire', w: 9, h: 2.4, dims: 'biconvex, 9 (FCI)', use: 'Carries a 240 band in its groove.', refs: ['fci', 'read'] },
    { id: '287WG', name: '287WG tire', shape: 'tire', w: 9, h: 2.4, groove: 3.5, dims: 'wide groove', use: 'The wide-groove version, for a 41 band.', refs: ['read'] },
    { id: '277', name: '277 tire', shape: 'tire', w: 9, h: 2.2, dims: 'tire 9 (FCI)', use: 'Listed as tire 9; one of the tires (with the 287 and 276) used for segmental buckles in the Manchester series.', refs: ['fci', 'kiraly'] },
    { id: '276', name: '276 tire', shape: 'tire', w: 9, h: 2.2, asym: true, dims: 'asymmetrical, 9 (FCI)', use: 'Asymmetric profile (listed as an asymmetrical tire).', refs: ['fci'] },
    { id: '279', name: '279 tire', shape: 'tire', w: 11, h: 2.2, dims: 'tire 11 (FCI)', use: 'A broader tire.', refs: ['fci'] },
  ] },
  { group: 'Silicone sponges', note: 'Silicone sponges. In the comparative series below they extruded, and were removed, more often than solid tires.', items: [
    { id: '506', name: '506 sponge', shape: 'oval', w: 5, h: 3, dims: '3 × 5 mm oval', use: 'Radial for a tear under about 4 mm; laid circumferentially for a segmental buckle.', refs: ['fci', 'pinninti', 'wu2024'] },
    { id: '510', name: '510 half-sponge', shape: 'half', w: 5, h: 2.5, dims: '2.5 × 5 mm half-round', use: 'Low-profile radial sponge for a tear under about 4 mm.', refs: ['fci', 'pinninti'] },
    { id: '511', name: '511 half-sponge', shape: 'half', w: 7.5, h: 2.75, dims: '2.75 × 7.5 mm half-oval', use: 'Radial sponge for a tear larger than about 4 mm.', refs: ['fci', 'pinninti'] },
    { id: '507', name: '507 sponge', shape: 'oval', w: 7.5, h: 5.5, dims: '5.5 × 7.5 mm', use: 'The largest sponge in the list.', refs: ['fci'] },
    { id: '505', name: '503 / 504 / 505 sponges', shape: 'round', w: 5, h: 5, dims: '3, 4 or 5 mm round', use: 'Cylindrical sponges. In the Manchester series sponges were used more often than tires for dialysis detachments.', refs: ['fci', 'kiraly'] },
  ] },
  { group: 'Sleeves and accessories', items: [
    { id: '270', name: '270 sleeve (Watzke)', shape: 'sleeve', w: 3, h: 1.6, dims: 'silicone sleeve', use: 'Joins the two ends of a 240 band; matching sleeves (70, 71, 72) exist for other bands — check the pairing on the box.', refs: ['fci', 'pinninti'] },
  ] },
  { group: 'No longer used', items: [
    { id: 'miragel', name: 'MIRAgel (hydrogel)', shape: 'oval', w: 5, h: 3, dims: '—', use: 'Hydrogel explants degrade by hydrolysis and swell years later: 6.5% needed removal related to swelling. Recognise them at reoperation; they are not a choice for new surgery.', refs: ['roldan'] },
  ] },
];

/* ------------------------------------------------------------------ helpers */
const R = (t, refs, lv) => ({ t, refs: refs || [], lv: lv || null });
function coverArc(hours) {
  // the shortest arc of the clock that contains all the given hours
  if (!hours.length) return null;
  const s = hours.map(h => mod(h, 12)).sort((a, b) => a - b);
  if (s.length === 1) return { s: s[0], e: s[0], len: 0 };
  let gap = -1, gi = 0;
  for (let i = 0; i < s.length; i++) { const g = (i === s.length - 1 ? s[0] + 12 : s[i + 1]) - s[i]; if (g > gap) { gap = g; gi = i; } }
  const start = s[(gi + 1) % s.length], end = s[gi];
  return { s: normHour(start), e: normHour(end), len: 12 - gap };
}
function sample(a, b) { const out = [], n = Math.max(1, Math.ceil(spanHours(a, b) / 0.25)); for (let i = 0; i <= n; i++) out.push(normHour(a + spanHours(a, b) * i / n)); return out; }
const q15 = (h) => normHour(Math.round(h * 4) / 4);
function clusters(pts) {
  // breaks within 1½ clock hours of each other share one segment under a band
  const s = pts.slice().sort((a, b) => mod(a.h, 12) - mod(b.h, 12));
  const out = [];
  for (const p of s) {
    const last = out[out.length - 1];
    if (last && spanHours(last.e, p.e0) <= 1.5) last.e = p.e1, last.items.push(p);
    else out.push({ s: p.e0, e: p.e1, items: [p] });
  }
  if (out.length > 1) { const a = out[0], z = out[out.length - 1]; if (spanHours(z.e, a.s) <= 1.5) { z.e = a.e; z.items.push(...a.items); out.shift(); } }
  return out;
}

/* ------------------------------------------------------------------ the plan */
function plan(scene) {
  const O = RD.repairOptions(scene);
  if (O.state !== 'ok') return { state: O.state };
  const rd = RD.mainRd(scene);
  const F = RD.makeField(scene, 'rd');
  const inRd = (p) => F(p[0], p[1]) < 4;
  const tier = (id) => { const o = O.options.find(x => x.id === id); return o ? (o.excluded ? 'excluded' : o.tier) : 'excluded'; };
  const cand = { sb: ['favoured', 'consider'].includes(tier('sb')), ppvsb: ['favoured', 'consider'].includes(tier('ppvsb')) };

  // what has to be supported: breaks in the detachment (point breaks, dialyses, giant tears) and holes in lattice
  const pts = [], outside = [];
  for (const b of RD.breakPoints(scene)) {
    const f = b.f, kind = f.type === 'lat' ? 'lattear' : f.type;
    const item = { kind, f, h: b.h, e0: b.span ? b.span[0] : b.h, e1: b.span ? b.span[1] : b.h, span: !!b.span, large: (f.size || 1) > 1, small: (f.size || 1) < 1, post: f.radial === 'post' };
    if (inRd(b.p) || (b.span && rd.total)) pts.push(item); else outside.push(item);
  }
  for (const f of scene.findings.filter(x => x.type === 'lat' && x.holes)) {
    const m = RD.polar(f.r || RD.G.LATTICE_R, RD.hourToAngle(RD.midHour(f.start, f.end)));
    if (inRd(m) || rd.total) pts.push({ kind: 'latholes', f, h: RD.midHour(f.start, f.end), e0: f.start, e1: f.end, span: true });
  }
  const hours = [].concat(...pts.map(p => p.span ? sample(p.e0, p.e1) : [p.h]));
  const arc = coverArc(hours);
  const latAll = scene.findings.filter(x => x.type === 'lat');
  const latHours = latAll.reduce((s, l) => s + spanHours(l.start, l.end), 0);
  const latArc = coverArc([].concat(...latAll.map(l => sample(l.start, l.end))));
  const has = (k) => pts.some(p => p.kind === k);
  const pvrC = scene.findings.some(f => f.type === 'pvr' && (f.grade || 'C') === 'C');
  const pseudo = scene.lens === 'pseudo' || scene.lens === 'aphakic';
  const LABEL = { hst: 'horseshoe tear', hole: 'atrophic hole', oph: 'operculated hole', dia: 'dialysis', grt: 'giant tear', lattear: 'tear at lattice', latholes: 'holes in lattice' };

  const facts = [];
  if (pts.length) {
    facts.push(pts.map(p => `${LABEL[p.kind]} ${p.span ? fmtHour(p.e0) + '–' + fmtHour(p.e1) : fmtHour(p.h)}`).join(', '));
    facts.push(arc.len === 0 ? 'one site' : `spread over ${RD.fmtSpan(arc.len)}`);
  } else facts.push('No break drawn in the detachment');
  if (latAll.length) facts.push(`lattice ${RD.fmtSpan(latHours)}`);

  return { state: 'ok', cand, tiers: { sb: tier('sb'), ppvsb: tier('ppvsb') }, facts, pts, outside, arc,
    sb: primary(scene, rd, pts, arc, { pvrC, pseudo, latHours, latArc, has }),
    ppvsb: combined(scene, rd, pts, arc, { pvrC, pseudo, has }),
    general: general(), refs: REFS, LV };
}

/* ---------------- buckle alone ---------------- */
function primary(scene, rd, pts, arc, X) {
  const out = { why: [], alts: [], elements: [], place: [], expect: [], notes: [], draw: [] };
  if (!pts.length) {
    out.status = 'nobreak';
    out.title = 'Find the break first';
    out.summary = 'The configuration depends on where the breaks are. With no break found, published series of buckling for an unseen break did no better with a 360° buckle than a local one.';
    out.why.push(R('100 detachments with an undetected break: 75% reattached with one operation, with no difference between circumferential (51) and localised (49) buckles.', ['froussard'], 'cohort'));
    out.why.push(R('Randomised, 44 eyes with unseen breaks: a 360° buckle reattached 70% and vitrectomy plus a 360° buckle 80% (no significant difference).', ['tewari'], 'rct'));
    return out;
  }
  if (X.has('grt')) {
    out.status = 'avoid';
    out.title = 'A giant tear is not repaired with a buckle alone';
    out.summary = 'Buckle geometry fails as a tear gets longer, and the large multinational EVRS study favours vitrectomy.';
    out.why.push(R('A radial “pouch” buckle closed breaks of 40–70° in 19 of 20 eyes but failed in 6 of 7 when the break exceeded 70°, because a radial configuration could not be kept.', ['lincoffPouch'], 'series'));
    out.why.push(R('Large or giant tears: vitrectomy failed less often than a buckle (EVRS study — 176 surgeons in 48 countries, non-randomised; P = 7×10⁻⁸).', ['evrs2'], 'cohort'));
    return out;
  }
  out.status = 'plan';
  const L = arc.len, hsts = pts.filter(p => p.kind === 'hst' || p.kind === 'lattear');
  const single = pts.length === 1 && !pts[0].span;
  const lattice = X.latHours > 3 || (X.latArc && X.latArc.len > 3);

  if (L > 3) {
    // breaks over more than one quadrant: encircle
    out.kind = 'encircle';
    out.title = 'Encircling band, with a segment under the breaks';
    out.summary = `The breaks span ${RD.fmtSpan(L)} — more than one quadrant — which is where published series moved from segmental to encircling buckles.`;
    out.why.push(R('A 128-eye segmental series (94.5% single-surgery success) used a segmental buckle only when all breaks lay within 90°; breaks spread wider, or PVR, got an encircling buckle.', ['wu2024'], 'series'));
    out.why.push(R('Detachment beyond one quadrant with multiple breaks predicted failure (P = 0.03) after buckling with a hard-silicone 287 explant in 100 phakic eyes (84% primary success).', ['conart'], 'series'));
    out.why.push(R('Multiple breaks with extensive lattice were assigned an encircling buckle by guideline: 88.9% reattached, with more drainage, longer surgery and a myopic shift than the segmental groups.', ['ho2002'], 'cohort'));
    out.why.push(R('Technique reviews favour a circumferential buckle when breaks, degeneration or significant traction are present in several quadrants; one group does not buckle segmentally beyond 3 clock hours.', ['eyewiki', 'pinninti'], 'expert'));
    if (hsts.length >= 2 && hsts.length === pts.length) out.alts.push({ name: 'Several radial elements, no band', ...R('2–4 radial buckles without a band reattached 24 of 25 eyes with multiple horseshoe tears in different planes.', ['sudhalkar'], 'series') });
    out.alts.push({ name: 'Segmental buckle', ...R('In the largest comparison (EVRS study, uncomplicated detachments) failure did not differ significantly between segmental and encircling buckles (721 vs 351 eyes, P = 0.5), but surgeons chose the buckle, so spread-out breaks were not compared directly.', ['evrs1'], 'cohort') });
    out.elements.push(R('Band: a 240 (2.5 × 0.6 mm), 41 (3.5 × 0.75 mm) or 42 (4.0 × 1.25 mm), passed under the recti; the ends are joined with a Watzke sleeve (a 270 for a 240 band).', ['eyewiki', 'fci', 'pinninti'], 'expert'));
    out.elements.push(R('Under the breaks, a tire carries the band and adds indent: a 287 with a 240 band, a 287WG (wide groove) with a 41 band.', ['read'], 'expert'));
    out.elements.push(R('A 360° 3 × 5 mm sponge is another way to encircle: 0.7% infection or extrusion among 552 patients followed for over a year (840 explants).', ['brown2006'], 'series'));
    out.elements.push(R('Band width and myopia after vitrectomy with a band, in eyes with multifocal lenses (38 banded): 240 −0.78 D, 41 −1.14 D, 42 −2.0 D — a trend, not significant (P = 0.07).', ['ohMf'], 'cohort'));
    out.place.push(R('The buckling effect should reach into the vitreous base; in quadrants without breaks the anterior bite goes about 2–3 mm behind the line joining the muscle insertions.', ['eyewiki'], 'expert'));
    out.place.push(R('Bites that straddle a band sit just far enough apart for it to slide: the band width plus twice its thickness. Belt-loop tunnels about 0.5 mm wider than the band are the alternative; single-surgery success was similar with tunnels (87.3%) and sutures (88.6%).', ['eyewiki', 'read', 'starrTun'], 'expert'));
    out.place.push(R('Tire sutures at least 1–2 mm beyond its edges; the farther apart, the higher the indent. One author suggests beginners aim for about 1 mm of indentation.', ['read'], 'expert'));
    for (const c of clusters(pts)) out.draw.push({ type: 'buckle', start: q15(c.s - 0.75), end: q15(c.e + 0.75), onBand: true, el: '287' });
    out.draw.unshift({ type: 'buckle', encircling: true, el: '240' });
  } else if (single && (pts[0].kind === 'hst' || pts[0].kind === 'lattear')) {
    const p = pts[0];
    out.kind = 'radial';
    out.title = 'Radial segmental element under the tear';
    out.summary = `A single horseshoe tear at ${fmtHour(p.h)}: a radial element supports the whole tear and its flap without the folds a circumferential buckle can raise.`;
    out.why.push(R('Tension analysis: along a circumferential buckle the retina is stretched when the buckle is shorter than 90° of arc but compressed when it is longer (for a 5-mm sponge); that compression raises radial folds and “fish-mouthing” of horseshoe tears, which a radial (meridional) buckle avoids.', ['goldbaum'], 'model'));
    out.why.push(R('Fish-mouthing is typical of a large horseshoe tear near the equator with a bullous detachment; the tear opens wider during buckling.', ['pruett'], 'expert'));
    out.why.push(R('Flap tears assigned to a radial segmental buckle by guideline reattached in 83.9% (56 eyes), comparable to the other buckle types.', ['ho2002'], 'cohort'));
    out.why.push(R('Minimal segmental buckling (71% radial, no drainage; 107 eyes): 92.6% primary reattachment, 97% after reoperation; 12.1% redetached over 11 years and 92.6% were attached at the end.', ['kreissig92'], 'series'));
    out.alts.push({ name: 'Encircling band', ...R('No significant difference in failure from segmental buckles in the EVRS comparison (P = 0.5), at the cost of more diplopia and myopia (below).', ['evrs1'], 'cohort') });
    if (p.small) out.elements.push(R('A small tear (under about 4 mm): a 506 (3 × 5 mm oval) or 510 (2.5 × 5 mm half-round) sponge, placed radially.', ['pinninti', 'fci'], 'expert'));
    else if (p.large) out.elements.push(R('A large tear (over about 4 mm): a 511 (2.75 × 7.5 mm half-oval) or a 519G (3.2 × 7.5 mm grooved) sponge, placed radially.', ['pinninti', 'fci'], 'expert'));
    else out.elements.push(R('Size the sponge to the tear: under about 4 mm, a 506 (3 × 5 mm) or 510 (2.5 × 5 mm); over about 4 mm, a 511 (2.75 × 7.5 mm) or 519G (3.2 × 7.5 mm). The chart does not know the tear’s size in mm.', ['pinninti', 'fci'], 'expert'));
    if (p.large) out.notes.push(R('Large horseshoe tear with a bullous detachment: the classic fish-mouth set-up. Pruett recommended a radial intrascleral solid-silicone wedge with an encircling element for it.', ['pruett'], 'expert'));
    out.place.push(R('Centre the element on the tear: mattress sutures parallel to its meridian and equidistant from its edges, the element at least as wide as the tear, reaching from behind the tear into the vitreous base.', ['eyewiki'], 'expert'));
    out.place.push(R('Aim for at least 1 mm of buckle beyond the tear’s edges.', ['pinninti'], 'expert'));
    out.place.push(R('Mattress sutures about 8 mm apart for a 506 or 510, about 10 mm for a 511 and 11–12 mm for a 519G.', ['pinninti'], 'expert'));
    if (p.post) out.notes.push(R('This tear is drawn posterior to the equator, so the element has to reach further back than usual.', [], null));
    out.draw.push(Object.assign({ type: 'buckle', radial: true, hour: q15(p.h), r: Math.round(RD.radiusFor(p.f)) }, p.f.size && p.f.size !== 1 ? { size: p.f.size } : {}, p.small ? { el: '506' } : p.large ? { el: '511' } : {}));
  } else {
    const dia = X.has('dia');
    out.kind = 'circ';
    out.title = dia ? 'Circumferential segmental buckle along the dialysis' : 'Circumferential segmental buckle';
    out.summary = dia ? 'A dialysis lies along the ora; a circumferential element covers it end to end.'
      : `${pts.length > 1 ? 'The breaks lie' : 'The break lies'} within ${L ? RD.fmtSpan(L) : 'one site'} — within one quadrant — so one circumferential segment can carry ${pts.length > 1 ? 'them all' : 'it'}.`;
    if (dia) {
      out.why.push(R('Dialysis detachments (52 eyes, segmental buckles): 87% reattached after one operation, 97% after two; none of the 40 eyes re-examined 9–17 years later had redetached, though some had had further surgery.', ['stoffelns'], 'series'));
      out.why.push(R('Buckling reattached 90.1% of dialysis detachments at one operation in a 2015–2020 series (51 of 86 eyes buckled).', ['mahmoud'], 'series'));
    } else {
      out.why.push(R('All breaks within 90°: a circumferential 506 sponge spanning at least two recti reattached 94.5% of 128 mainly phakic eyes at one operation (100% finally).', ['wu2024'], 'series'));
      out.why.push(R('Atrophic holes with limited lattice, buckled circumferentially by guideline: 86.1% reattached (36 eyes), comparable to encircling.', ['ho2002'], 'cohort'));
      if (pts.length > 1) out.why.push(R('Multiple breaks with detachment beyond one quadrant predicted failure after buckling with a 287 explant (P = 0.03) — a reason to check the segment covers every break.', ['conart'], 'series'));
    }
    out.alts.push({ name: 'Encircling band', ...R('No significant difference in failure from segmental buckles in the EVRS study (P = 0.5); more diplopia and myopic shift (below).', ['evrs1'], 'cohort') });
    if (hsts.some(p => p.large)) out.alts.push({ name: 'A radial element for the large tear', ...R('A large horseshoe tear on a circumferential buckle longer than 90° can fish-mouth; Kreissig combined radial and circumferential elements in 10% of cases.', ['goldbaum', 'kreissig92'], 'model') });
    out.elements.push(R(dia ? 'A sponge or a tire. In the Manchester series 54% of sponge-buckled eyes had dialysis detachments vs 10% of tire-buckled eyes; single-surgery success was similar (86.0% vs 83.4%), but sponges extruded more (12.6% vs 3.4%).'
      : 'A 506 sponge (3 × 5 mm) laid circumferentially, or a solid tire (277, 287 or 276). Single-surgery success was similar with sponges and tires (86.0% vs 83.4%); sponges extruded more (12.6% vs 3.4%) and were removed more (14.8% vs 6.1%).', dia ? ['kiraly'] : ['kiraly', 'wu2024', 'fci'], 'cohort'));
    out.elements.push(R('Caution: one technique group notes a sponge laid circumferentially over more than 3 clock hours may extrude; the 128-eye series used circumferential 506 segments spanning at least two recti.', ['pinninti', 'wu2024'], 'expert'));
    const s = q15(arc.s - 1), e = q15(arc.e + 1);
    out.place.push(R(`Extend the segment beyond the outermost ${dia ? 'end of the dialysis' : 'breaks'} on each side — drawn here as ${fmtHour(s)} to ${fmtHour(e)}, i.e. 1 clock hour each side. That margin is teaching, not an outcome-tested figure; in the 128-eye series segments averaged about 6 clock hours (from 3.5).`, ['wu2024'], 'expert'));
    if (dia) out.place.push(R('Mattress bites 2–3 mm wider than the element for a modest indent, 4–8 mm wider for a high one.', ['eyewiki'], 'expert'));
    else out.place.push(R('Anterior bite just in front of the posterior margin of the vitreous base, about 2–3 mm behind the line joining the muscle insertions; bites 2–3 mm wider than the element for a modest indent, 4–8 mm for a high one.', ['eyewiki'], 'expert'));
    out.draw.push(Object.assign({ type: 'buckle', start: s, end: e, el: dia ? '505' : '506' }, dia ? { ant: true } : {}));
  }
  if (X.pvrC) out.notes.push(R('PVR grade C is drawn. In the EVRS study a buckle alone failed more often than vitrectomy in grade B PVR (P = 0.0017); in grade C-1 the difference was not significant (P = 0.7).', ['evrs2'], 'cohort'));
  if (X.pseudo) out.notes.push(R('Aphakic eyes (prospective comparison, 84 patients, 1988): adding an encircling band to a local buckle gave similar reattachment. No equivalent pseudophakic study is cited here.', ['singh'], 'trial'));
  if (out.kind !== 'encircle' && (X.latHours > 3 || (X.latArc && X.latArc.len > 3))) out.notes.push(R('Lattice is drawn over more than 3 clock hours. Ho’s guideline encircled multiple breaks with extensive lattice (not tested against segmental); the 128-eye segmental series did not exclude lattice and treated it with cryotherapy.', ['ho2002', 'wu2024'], 'expert'));
  out.expect = expectations(out.kind);
  return out;
}

function expectations(kind) {
  const E = [];
  if (kind === 'encircle') {
    E.push(R('Refraction: encircling buckles lengthened the eye by 0.99 mm on average and induced 2.75 D of myopia (study of 75 eyes).', ['smiddyRx'], 'cohort'));
    E.push(R('Eye movements: post-operative deviations were associated with encircling buckles (P = 0.00003) but not radial ones; persistent diplopia 11% after a band alone, 20% with a band plus radial buckle, over 30% with high encircling buckles (vs 6% after segmental).', ['smiddyEom', 'kalman'], 'cohort'));
    E.push(R('Choroidal detachment: 39.6% overall after buckling, 7.7% when the explant covered one quadrant or less.', ['packer'], 'cohort'));
  } else {
    E.push(R('Refraction: a local buckle shortened the eye with a hyperopic change, whereas an encircling buckle lengthened it (myopic shift); astigmatism follows the buckle and tended to be greater the closer it was to the limbus.', ['okada'], 'cohort'));
    E.push(R('Eye movements: persistent diplopia 6% after segmental buckles vs 11–20% with bands; strabismus was not predictable from buckle position in 1,030 patients (3.8%).', ['kalman', 'goezinne'], 'cohort'));
    E.push(R('Choroidal detachment: 7.7% when the explant covered one quadrant or less, vs 39.6% overall.', ['packer'], 'cohort'));
  }
  E.push(R('Infection: 1.8% with silicone sponges vs none with solid silicone in 600 consecutive buckles.', ['hilton78'], 'series'));
  E.push(R('Soaking sponges in antibiotic before insertion cut infection or extrusion seven-fold (921 sponge cases, alternate allocation).', ['arribas'], 'trial'));
  return E;
}

/* ---------------- with vitrectomy ---------------- */
function combined(scene, rd, pts, arc, X) {
  const out = { why: [], against: [], elements: [], place: [], expect: [], notes: [], draw: [] };
  out.status = 'plan';
  out.kind = 'band';
  out.title = 'Vitrectomy with a 360° encircling band';
  out.summary = 'The usual supplemental buckle is a band under the four recti at the equator. Whether it adds anything is the real question — the evidence is split.';
  const inferior = pts.filter(p => { const h = mod(p.h, 12); return h >= 5 - 1e-6 && h <= 7 + 1e-6; });
  if (X.pseudo) out.why.push(R('Pseudophakic (PRO): single-surgery success 92% with an added buckle vs 84% with vitrectomy alone; 96% vs 82% for inferior detachments.', ['pro3'], 'cohort'));
  if (scene.lens === 'phakic') out.why.push(R('Phakic, moderately complex detachments (PRO): 91.2% with vitrectomy and buckle vs 83.1% with vitrectomy alone.', ['pro2'], 'cohort'));
  if (inferior.length) out.why.push(R('Inferior break (5–7 o’clock, PRO): 87.4% vs 76.8% single-surgery success with an added buckle (85.2% vs 68.6% in phakic eyes).', ['pro9'], 'cohort'));
  out.why.push(R('Pooled across 38 studies (15,661 eyes): 88.2% single-operation success with an added buckle vs 86.3% without — a small effect with a high number needed to treat; final reattachment the same.', ['eshtiaghi'], 'meta'));
  out.against.push(R('Randomised trial (VIPER, pseudophakic, 198 eyes): 79.0% with a band vs 73.5% without (P = 0.56) — no significant benefit.', ['viper2'], 'rct'));
  if (inferior.length) out.against.push(R('VIPER subgroup with breaks at 5–7 o’clock: 77.4% vs 57.1% — favouring the band but not significant (small numbers).', ['viper3'], 'rct'));
  out.against.push(R('Randomised trials pooled (6 RCTs, 705 eyes): primary reattachment RR 0.99 — no demonstrated benefit (low certainty).', ['rosenberg'], 'meta'));
  out.against.push(R('EVRS study (non-randomised, uncomplicated detachments): vitrectomy plus a supplemental buckle failed more often than vitrectomy alone (488 vs 2,235 eyes, P = 0.048) — surgeons chose who got the buckle.', ['evrs1'], 'cohort'));
  out.elements.push(R('A 2–4 mm band in the randomised trial: by width, a 240 (2.5 mm), 41 (3.5 mm) or 42 (4.0 mm).', ['viper1', 'eyewiki', 'fci'], 'expert'));
  out.elements.push(R('Band width and myopia (multifocal-lens eyes, 38 banded): 240 −0.78 D, 41 −1.14 D, 42 −2.0 D after vitrectomy with a band — a trend, not significant (P = 0.07).', ['ohMf'], 'cohort'));
  if (inferior.length) out.elements.push(R('Segmental alternative for inferior breaks: vitrectomy with a segmental 510 sponge and no band reattached all 12 eyes in one small series (7 after failed pneumatic retinopexy; mean follow-up about 4 months).', ['arjmand'], 'series'));
  out.place.push(R('In the trial protocol the band went under the recti, onto the equator, fixed in all four quadrants, with “sufficient buckling with no choroidal folds” at the end of surgery; surgeons had done at least 20 such cases.', ['viper1'], 'expert'));
  out.place.push(R('Belt-loop tunnels or sutures: single-surgery success was similar (tunnels 87.3%, sutures 88.6%). All post-operative strabismus followed combined vitrectomy and buckle (P = 0.02), and the authors flagged tunnels with combined surgery as a possible risk.', ['starrTun'], 'cohort'));
  out.expect.push(R('Refraction: −1.0 D with the band vs −0.1 D without in VIPER; −0.88 D vs −0.20 D in a randomised pilot against 360° laser.', ['viper2', 'falkner'], 'rct'));
  out.expect.push(R('More intra-operative complications (15.2% vs 8.8%) and serious adverse events (30.3% vs 22.5%) with the band in VIPER.', ['viper2'], 'rct'));
  out.expect.push(R('Persistent diplopia in primary position in 5.2% after vitrectomy with a band, mostly small vertical deviations managed with prisms.', ['navarrete'], 'series'));
  if (X.pvrC) out.notes.push(R('PVR is drawn. In the EVRS complex-detachment report (grade B and C-1 PVR among the groups), vitrectomy with a supplemental buckle failed more often than vitrectomy without one (P = 0.007); the authors concluded a supplemental buckle may not be helpful.', ['evrs2'], 'cohort'));
  out.draw.push({ type: 'buckle', encircling: true, el: '240' });
  if (inferior.length && arc) {
    const c = coverArc(inferior.map(p => p.h));
    out.drawAlt = [{ type: 'buckle', start: q15(c.s - 0.75), end: q15(c.e + 0.75), el: '510' }];
  }
  return out;
}

function general() {
  return [
    R('Drainage: in a randomised trial of 120 eyes, drainage and non-drainage buckles reattached 87% and 83% at one operation (97% both finally); complications scored higher with drainage.', ['hilton81'], 'rct'),
    R('Why buckles fail: in 1,088 operations an inadequate buckle caused 10% of failures and undetected breaks 13%; buckle malposition caused 18.8% of failures in a 100-eye series.', ['rachal', 'conart'], 'series'),
  ];
}

/* the plan drawn on the chart: replace any buckle already drawn */
function applyPlan(scene, findings) {
  const next = RD.clone(scene);
  next.findings = next.findings.filter(f => f.type !== 'buckle');
  let id = next.nextId || (Math.max(0, ...next.findings.map(f => f.id || 0)) + 1);
  for (const f of findings) next.findings.push(Object.assign({ id: id, seed: (id * 2654435761) >>> 0 }, RD.clone(f))), id++;
  next.nextId = id;
  return next;
}

const API = { plan, applyPlan, ELEMENTS, REFS, LV, coverArc };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.RDBuckle = API;
})(typeof window !== 'undefined' ? window : globalThis);
