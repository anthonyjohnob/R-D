/* R/D core — pure logic: chart geometry, command parser, scene model,
   detachment field + contour extraction, Lincoff analysis, clinical note.
   No DOM access here, so it runs (and is tested) under Node too. */
(function (root) {
'use strict';

/* ------------------------------------------------------------------ *
 * Chart geometry. Logical pixels, fovea at the origin, canvas y down.
 * Proportions follow the standard indirect-ophthalmoscopy chart:
 * inner circle = equator, middle = ora serrata, outer = ciliary
 * processes (pars plana band between). Posterior pole is drawn ~1.5x
 * anatomical scale so macular status stays readable.
 * ------------------------------------------------------------------ */
const G = {
  SIZE: 820,
  R_ORA: 300,
  R_CB: 340,
  R_EQ: 216,
  R_MAC: 38,
  R_FOV: 6.5,
  DISC_DIST: 76,
  DISC_R: 14,
  TEAR_R: 268,      // default radius for tears: posterior edge of the vitreous base
  LATTICE_R: 238,   // between equator and ora
};
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/* PubMed-sourced pathology catalogue (src/catalog.js, built by tools/) */
const CATALOG = (typeof module !== 'undefined' && module.exports)
  ? (() => { try { return require('./catalog.js'); } catch (e) { return []; } })()
  : (root.RD_CATALOG || []);
const CAT = {};
CATALOG.forEach((e, i) => { e.ix = i; CAT[e.id] = e; });
const GROUPS = [
  ['breaks', 'Retinal breaks'], ['peripheral_degenerations', 'Peripheral degenerations'], ['detachments_schisis', 'Detachments & schisis'],
  ['vitreous', 'Vitreous'], ['treatment_postop', 'Treatment & post-op'], ['vascular', 'Vascular'], ['macula_posterior_pole', 'Macula & posterior pole'],
  ['optic_disc', 'Optic disc'], ['tumors_pigment', 'Tumours & pigmented lesions'], ['inflammatory_infectious', 'Inflammatory & infectious'],
  ['dystrophies', 'Inherited dystrophies'],
];

/* ---------------------------- clock math --------------------------- */
function mod(a, n) { return ((a % n) + n) % n; }
function normHour(h) { const m = mod(h, 12); return m === 0 ? 12 : +m.toFixed(4); }
function hourToAngle(h) { return (mod(h, 12) * 30 - 90) * DEG; }
function angleToHour(a) { const h = mod((a / DEG + 90) / 30, 12); return h === 0 ? 12 : h; }
function spanHours(s, e) { const d = mod(e - s, 12); return d === 0 ? 12 : d; }
function hourDist(a, b) { const d = mod(a - b, 12); return Math.min(d, 12 - d); }
/* is hour h inside the clockwise span s→e (inclusive, with tolerance in hours) */
function inSpan(h, s, e, tol) {
  tol = tol || 0;
  const span = spanHours(s, e);
  if (span >= 12) return true;
  const d = mod(h - s, 12);
  return d <= span + tol || d >= 12 - tol;
}
function midHour(s, e) { return normHour(s + spanHours(s, e) / 2); }
/* height of a clock hour on the fundus: 12 → +1 (superior), 6 → −1 */
function hourHeight(h) { return Math.cos(mod(h, 12) * 30 * DEG); }
function fmtHour(h) {
  h = normHour(h);
  const whole = Math.floor(h + 1e-6);
  const mins = Math.round((h - whole) * 4) * 15;     // clinical charts speak in quarter hours (positions placed by hand are exact)
  const hh = whole === 0 ? 12 : whole;
  if (mins === 0) return String(hh);
  if (mins === 60) return String(normHour(hh + 1));
  return hh + ':' + String(mins).padStart(2, '0');
}
function fmtSpan(h) {
  const r = Math.round(h * 2) / 2;
  if (r === 12) return '12 clock hours';
  const s = Number.isInteger(r) ? String(r) : (Math.floor(r) ? Math.floor(r) + '½' : '½');
  return s + (r === 1 ? ' clock hour' : ' clock hours');
}
function polar(r, a) { return [r * Math.cos(a), r * Math.sin(a)]; }

/* eye-dependent anatomy: OS has temporal retina at 3 o'clock, OD at 9 */
function temporalHour(eye) { return eye === 'OD' ? 9 : 3; }
function nasalHour(eye) { return eye === 'OD' ? 3 : 9; }
function discCenter(eye) { return [eye === 'OD' ? G.DISC_DIST : -G.DISC_DIST, 0]; }

/* quadrant phrases → clock positions for the current eye */
function quadrant(q, eye) {
  const T = temporalHour(eye);
  const N = nasalHour(eye);
  const sup = { s: 10, e: 2, c: 12 };
  switch (q) {
    case 's': return sup;
    case 'i': return { s: 4, e: 8, c: 6 };
    case 't': return { s: normHour(T - 2), e: normHour(T + 2), c: T };
    case 'n': return { s: normHour(N - 2), e: normHour(N + 2), c: N };
    case 'st': return T === 9 ? { s: 9, e: 12, c: 10.5 } : { s: 12, e: 3, c: 1.5 };
    case 'sn': return N === 3 ? { s: 12, e: 3, c: 1.5 } : { s: 9, e: 12, c: 10.5 };
    case 'it': return T === 9 ? { s: 6, e: 9, c: 7.5 } : { s: 3, e: 6, c: 4.5 };
    case 'in': return N === 3 ? { s: 3, e: 6, c: 4.5 } : { s: 6, e: 9, c: 7.5 };
    case 'sh': return { s: 9, e: 3, c: 12 };
    case 'ih': return { s: 3, e: 9, c: 6 };
    case 'th': return { s: normHour(T - 3), e: normHour(T + 3), c: T };
    case 'nh': return { s: normHour(N - 3), e: normHour(N + 3), c: N };
    case 'all': return { s: 12, e: 12, c: 12, full: true };
  }
  return null;
}
const QUAD_NAMES = { all: 'in all quadrants', s: 'superior', i: 'inferior', t: 'temporal', n: 'nasal', st: 'superotemporal', sn: 'superonasal', it: 'inferotemporal', in: 'inferonasal', sh: 'superior half', ih: 'inferior half', th: 'temporal half', nh: 'nasal half' };

/* ------------------------------------------------------------------ *
 * Command parser
 * ------------------------------------------------------------------ */
const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const MINW = { fifteen: 15, thirty: 30, 'forty five': 45, 'forty-five': 45, 'fourty five': 45 };
const H = '(\\d{1,2}(?:\\.\\d+)?)';

const STOP = new Set(('draw me a an the add with and at plus also show there is are of in on please clock hour hours position positions located ' +
  'extending extends extend spanning spans span from to near around has have patient eye eyes o its it this that which just new put place mark ' +
  'some then now make be for by x degrees degree area region site seen noted present visible periphery retinal retina rhegmatogenous ' +
  'oclock hey ok okay um uh like can you could would i want need give let lets let\'s there\'s here a\'s fluid sub subretinal detachment involving ' +
  'into onto over up down out located location is was were having also an another more small-ish one\'s go , ? s got get set change status ' +
  'both all big-ish its\' my our your his her their each every same right left side sided side\'s zone zones well quite very slightly mildly ' +
  'moderately severely degeneration grade type stage like just only both edge edges border borders line lines part portion half ' +
  'lets theres ones sides there here where its few tiny small large some area areas spot spots lesion lesions finding findings along seen noted ' +
  'appears appear looks look consistent likely possible probably suspect suspected suspicious showing shows evident tractional ' +
  'measuring measures measured measurement measurements approximately approx about roughly around size sized basal diameter diameters ' +
  'largest greatest thickness height overlying surface shaped margin margins its').split(/\s+/));

function num(w) {
  if (w == null) return null;
  if (/^\d+(\.\d+)?$/.test(w)) return parseFloat(w);
  return NUMW[w] != null ? NUMW[w] : null;
}
function validHour(h) { return h != null && isFinite(h) && h > 0 && h <= 12.99; }

/* Measurements that describe a tumour or naevus become tokens instead of being dropped: basal size in disc
   diameters or mm (one or two dimensions), thickness, and a distance from the disc or fovea. The parser keeps
   them only beside a tumour; anywhere else they are ignored, as before. Run twice: on digits, and again after
   spoken numbers (“two disc diameters”) have been turned into digits. */
const MN = '(\\d+(?:\\.\\d+)?)';
const MEASURE_RE = [
  [/\bmillimet(?:er|re)s?\b/g, 'mm'],
  [/\b(?:optic\s+)?(?:disc|disk)[\s-]+diam(?:eter|eters|s)?\b|\bdds\b/g, 'dd'],
  [/(\d)\s*d\s+d\b/g, '$1 dd'],
  [/\b(\d+)\s*\/\s*(\d+)\s*(?=(?:dd|mm)\b)/g, (m, a, b) => +b ? ' ' + Math.round(+a / +b * 100) / 100 + ' ' : m],
  [/(?<!\band\s+a\s)\bhalf(?:\s+of)?(?:\s+an?)?\s+(?=dd\b)/g, ' 0.5 '],
  [/\b(?:a\s+)?quarter(?:\s+of)?(?:\s+an?)?\s+(?=dd\b)/g, ' 0.25 '],
  // three dimensions: “6 x 5 x 2.5 mm” is base × base × thickness
  [new RegExp(`\\b${MN}\\s*(?:mm\\s*)?(?:x|by|×)\\s*${MN}\\s*(?:mm\\s*)?(?:x|by|×)\\s*${MN}\\s*mm\\b`, 'g'), (m, a, b, c) => ` _tsz_${a}_${b}_mm_ _tth_${c}_ `],
  // thickness
  [new RegExp(`\\b(?:thickness|height|apical\\s+height|elevation|elevated|thick)\\s*(?:of|is|was|=|:|measuring|measures|measured|by|to)?\\s*(?:about|approximately|approx|around|~)?\\s*${MN}\\s*mm\\b`, 'g'), (m, n) => ` _tth_${n}_ `],
  [new RegExp(`\\b${MN}\\s*mm\\s+(?:thick|in\\s+(?:thickness|height|elevation|apical\\s+height)|high|tall|of\\s+(?:thickness|elevation)|elevation)\\b`, 'g'), (m, n) => ` _tth_${n}_ `],
  // basal size: “2 x 1.5 DD”, “2 DD by 1.5 DD”, “5 by 4 mm”, “2 DD”, “a 3 mm naevus”
  [new RegExp(`\\b${MN}\\s*(?:(?:dd|mm)\\s*)?(?:x|by|×)\\s*${MN}\\s*(dd|mm)\\b`, 'g'), (m, a, b, u) => ` _tsz_${a}_${b}_${u}_ `],
  // distance: “2 DD from the disc”, “1.5 DD temporal to the fovea”, “3 mm away from the disc margin”
  [new RegExp(`\\b${MN}\\s*(dd|mm)\\s+(?:away\\s+)?(?=(?:from|off)\\b|(?:to|of)\\s+(?:the\\s+)?(?:optic\\s+)?(?:disc|disk|nerve|fovea|foveola|macula)|(?:above|below)\\s+(?:the\\s+)?(?:optic\\s+)?(?:disc|disk|nerve|fovea|macula)|(?:super|infer|temp|nas)\\w*\\s+(?:to|of|from)\\b)`, 'g'), (m, n, u) => ` _tdist_${n}_${u}_ `],
  [new RegExp(`\\b${MN}\\s*(dd|mm)\\b`, 'g'), (m, n, u) => ` _tsz_${n}__${u}_ `],
];
function measureStage(s) { for (const [re, to] of MEASURE_RE) s = s.replace(re, to); return s; }

/* stage 1: punctuation, spoken numbers, speech slips and spelling variants */
function stage1(raw) {
  let s = ' ' + String(raw || '').toLowerCase() + ' ';
  s = s.replace(/[‘’ʼ`´]/g, "'").replace(/[–—−]/g, '-').replace(/[“”"]/g, ' ').replace(/[→⇒>]/g, ' to ');
  s = s.replace(/\b((?:[a-z]\.){2,})/g, m => m.replace(/\./g, ''));
  s = s.replace(/\b([a-z])\.\s+([a-z])\.?(?=\s|,|$)/g, '$1$2');
  // numbers that are not clock positions: ratios, acuities, fractions, grades, percentages, sizes
  s = s.replace(/\b(?:c\s*\/\s*d|c\s*:\s*d|cdr|cup[\s-]*(?:to|-)?[\s-]*dis[ck](?:\s+ratio)?)\s*(?:ratio\s*)?(?:of\s*|is\s*|=\s*|:\s*)?(?:0?\.\d+|1\.0|1)\b/g, ' ');
  s = s.replace(/\b(?:va|bcva|ucva|vision|visual acuity|acuity|ph|pinhole)\s*(?:is\s*|of\s*|was\s*|:\s*)?(?:od\s+|os\s+|re\s+|le\s+)?(?:6\s*\/\s*\d{1,2}(?:\.\d)?|20\s*\/\s*\d{2,3}|\d\.\d+|cf|hm|lp|nlp|pl)\b/g, ' ');
  s = s.replace(/\blog\s*mar\s*(?:of\s*|is\s*)?-?\d*\.?\d+\b/g, ' ');
  s = measureStage(s);
  s = s.replace(/\b\d+(?:\.\d+)?\s*\/\s*\d+\s*(?:dd|disc diameters?|disk diameters?|mm)\b/g, ' ');
  s = s.replace(/\b\d+(?:\.\d+)?\s*(?:by|x|×)\s*\d+(?:\.\d+)?\s*(?:mm|dd|disc diameters?|microns?|um|µm)?(?![\w])/g, ' ');
  s = s.replace(/\b\d+(?:\.\d+)?\s*%/g, ' ').replace(/\b(\d(?:\.\d)?)\s*\+/g, ' grade$1plus ');
  s = s.replace(/\b(stage|grade|type|zone|category|cat|level|class|report|day|week|wk|pod|month|visit|injection)\s*#?\s*(\d+[a-z]?)\b/g, '$1_$2');
  s = s.replace(/\b(?:in\s+)?all\s+(?:4\s+|four\s+)?quadrants\b/g, ' _q_all_ ').replace(/\b(?:\d+|one|two|three|four)\s+quadrants?\b/g, ' ');
  s = s.replace(/\b\d+\s+(?:injections?|sessions?|treatments?|doses?|shots?|attempts?|surgeries|operations?|procedures?)\b/g, ' ');
  s = s.replace(/[!;:]+(?!\d)/g, ' , ').replace(/\?/g, ' ? ');
  s = s.replace(/(\d)\.(\d)/g, '$1§$2').replace(/\./g, ' , ').replace(/§/g, '.');
  s = s.replace(/[()\[\]{}]/g, ' ').replace(/&/g, ' and ').replace(/\+/g, ' plus ').replace(/\//g, ' ');
  // spoken numbers and times
  s = s.replace(/\bhalf\s+past\s+(\w+)/g, (m, w) => num(w) != null ? ' ' + (num(w) + 0.5) + ' ' : m);
  s = s.replace(/\bquarter\s+past\s+(\w+)/g, (m, w) => num(w) != null ? ' ' + (num(w) + 0.25) + ' ' : m);
  s = s.replace(/\bquarter\s+(?:to|til|till)\s+(\w+)/g, (m, w) => num(w) != null ? ' ' + normHour(num(w) - 0.25) + ' ' : m);
  s = s.replace(/\b(?:the|this|that|which) one\b/g, ' it ');
  s = s.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g, w => NUMW[w]);
  s = s.replace(/\b(fifteen|thirty|forty[\s-]five|fourty five)\b/g, w => MINW[w.replace('-', ' ')] || MINW[w]);
  s = s.replace(/\b(\d{1,2})\s+and\s+a\s+half\b/g, (m, h) => ' ' + (+h + 0.5) + ' ');
  s = measureStage(s);
  s = s.replace(/\b(\d{1,2}):(\d{2})\b/g, (m, h, mm) => ' ' + (+h + Math.round(+mm / 15) * 0.25) + ' ');
  s = s.replace(/\b(\d{1,2})\s+(15|30|45)\b(?!\s*(?:degree|clock))/g, (m, h, mm) => +h <= 12 ? ' ' + (+h + +mm / 60) + ' ' : m);
  s = s.replace(/\b360(?:\s*degrees?|°)?\b/g, ' _360_ ');
  s = s.replace(/\b(?:va|vision|visual acuity|bcva|iop|pressure|cmt|age|aged|patient is)\s+(?:of\s+|is\s+|was\s+)?(?:20\s+\d{2,3}|\d+(?:\.\d+)?)/g, ' ');
  s = s.replace(/\b20\s+\d{2,3}\b/g, ' ');
  s = s.replace(/\b\d+(?:\.\d+)?\s*(?:days?|weeks?|wks?|months?|mos?|years?|yrs?|y\/o|yo|hours ago|hrs ago|disc diameters?|dd|mm|microns?|um|%|percent|degrees?|diopters?|mmhg|letters?|times|x)\b/g, ' ');
  s = s.replace(/\b(\d{1,2})\s*clock[\s-]*hours?\b/g, ' _ch_$1_ ');
  s = s.replace(/\bo\s*'?\s*clock\b|\bo'?clock\b|\boclock\b/g, ' oclock ');
  s = s.replace(/\b(?:at\s+)?(?:the\s+)?(\d{1,2}(?:\.\d+)?)\s*oclock\s+(?:position|meridian|location|area|region)\b/g, ' $1 oclock ');
  s = s.replace(/\bclock[\s-]*hours?\b|\bclock\b/g, ' ');

  // speech-recognition slips and shorthand
  const ALIAS = [
    [/\b(?:fovea's|phobia's|phobias|fobias|phobia|fovia|fobia|foveal|fova|fovy|fovea)(?![\w'])/g, 'fovea'],
    [/\b(?:macula's|maculae|macular|macula|mack|mac|mak)(?![\w'])/g, 'macula'],
    [/\b(?:lettuce|lattices|latice|lettice|lettuces|lattice's)\b/g, 'lattice'],
    [/\btiers\b|\btares\b/g, 'tears'], [/\btier\b|\btare\b/g, 'tear'],
    [/\bhorse[\s-]*shoe(?:d)?\b|\bhorseshoe(?:d)?\b/g, 'horseshoe'],
    [/\b(?:r\s+r\s+d|r\s+rd|rr\s+d|our\s+rd|our\s+d|ard|r\s+r\s+ds)\b/g, ' rd '],
    [/\br\s+d\b|\br\s+ds\b/g, ' rd '], [/\bh\s+s\s+t\b/g, ' hst '], [/\bg\s+r\s+t\b/g, ' grt '], [/\bp\s+v\s+r\b|\bpbr\b|\bpdr\b(?=\s*(?:grade\s*)?[abc]\b)/g, ' pvr '],
    [/\bsuper\s+temporal\b/g, ' superotemporal '], [/\binfra[\s-]*temporal\b/g, ' inferotemporal '],
    // British spellings and shorthand → the catalogue's
    [/\bhaems\b/g, 'hemorrhages'], [/\bhaem\b/g, 'hemorrhage'], [/\bhems\b/g, 'hemorrhages'], [/\bhem\b/g, 'hemorrhage'],
    [/isation(s?)\b/g, 'ization$1'], [/\bfibre\b/g, 'fiber'],
    [/haem/g, 'hem'], [/oedema/g, 'edema'], [/oesoph/g, 'esoph'], [/\btumour/g, 'tumor'], [/\bnaev/g, 'nev'], [/fibres\b/g, 'fibers'], [/\bcentre/g, 'center'], [/\bgrey/g, 'gray'], [/\bcolour/g, 'color'],
  ];
  for (const [re, to] of ALIAS) s = s.replace(re, to);
  s = s.replace(/\s+/g, ' ');
  return s;
}

function normalize(raw, opts) {
  let s = stage1(raw);

  const REP_A = [
    // commands (whole-utterance forms, so “media clear” or “redo PPV” in a note do not wipe the chart)
    [/\b(?:hide|turn off|switch off|remove|clear) (?:the )?lincoff(?: zone| map| overlay)?\b|\blincoff off\b/g, ' _lincoffoff_ '],
    [/\b(?:show )?lincoff(?:'s)?(?: rules?| zone| map| overlay| analysis)?\b|\bwhere(?:'s| is| are)? (?:the )?(?:primary |likely |probable )?(?:tear|break|hole)s?\b|\bfind (?:the )?(?:primary )?(?:tear|break|hole)\b|\bprobab(?:le|ility)\s+(?:break|map|zone)\b|\bpredict(?:ed)? (?:the )?break\b|\blocate (?:the )?break\b|\b(?:tear|break)s? \?/g, ' _lincoff_ '],
    [/\b(?:undo|go back|oops|scratch that|take that back|undo that)\b/g, ' _undo_ '],
    [/^\s*redo(?:\s+(?:that|it|please))?\s*$/g, ' _redo_ '],
    [/^\s*(?:clear|reset|wipe(?: it)?)(?:\s+(?:all|everything|it|chart|drawing|the\s+(?:chart|drawing|page)))?(?:\s+please)?\s*$|\b(?:clear|erase|wipe)\s+(?:all|everything|the\s+(?:whole\s+)?(?:chart|drawing))\b|\bstart over\b|\bnew drawing\b|\bblank chart\b|\breset (?:the )?(?:chart|drawing)\b/g, ' _clear_ '],
    [/\b(?:flip|switch|swap|change)\s+(?:to\s+)?(?:the\s+)?(?:other\s+)?eyes?\b|^\s*(?:the\s+)?other eye\s*$/g, ' _eyeflip_ '],
    [/\b(?:remove|delete|erase|take out|take off|get rid of)\b|\bdrop\b(?=\s+(?:the|that|it|this|last)\b)/g, ' _remove_ '],
    // eyes
    [/\bright eye\b|\bod\b|\bo d\b|\bright\b(?=.*\beye\b)/g, ' _eye_OD_ '],
    [/\bleft eye\b|\bos\b|\bo s\b|\bleft\b(?=.*\beye\b)/g, ' _eye_OS_ '],
    // negated involvement means the structure is still attached (or, beside a named finding, that it is spared)
    [/\b(?:not|never|no longer|isn't|is not|without|doesn't|does not|didn't|did not|yet to)\s+(?:yet\s+)?(?:involv(?:e|es|ing|ed)|affect(?:s|ing|ed)?|touch(?:es|ing)?|reach(?:es|ing)?|includ(?:e|es|ing)|threaten(?:s|ing)?)\s+(?:the\s+)?fovea\b|\bfovea\s+(?:is\s+)?(?:still\s+)?(?:not|never)\s+(?:yet\s+)?(?:involved|detached|off|affected|reached)\b|\b(?:no|without)\s+fovea\s+involvement\b/g, ' _fov_spare_ '],
    [/\b(?:not|never|no longer|isn't|is not|without|doesn't|does not|didn't|did not|yet to)\s+(?:yet\s+)?(?:involv(?:e|es|ing|ed)|affect(?:s|ing|ed)?|touch(?:es|ing)?|reach(?:es|ing)?|includ(?:e|es|ing))\s+(?:the\s+)?macula\b|\bmacula\s+(?:is\s+)?(?:still\s+)?(?:not|never)\s+(?:yet\s+)?(?:involved|detached|off|affected|reached)\b|\b(?:no|without)\s+macula\s+involvement\b/g, ' _mac_spare_ '],
    [/\bmacula[\s-]*of\b(?=\s*(?:,|and\b|with\b|fovea\b|$))/g, ' _mac_off_ '],
    // macular status (before "detached" is consumed). Status wording (“macula off”) always describes the
    // detachment; involvement wording (“involving the fovea”, “sparing the fovea”) may describe a named finding.
    [/\bfovea[\s-]*(?:is\s+)?split(?:ting|s)?\b|\bsplit(?:ting|s)?\s+(?:the\s+)?fovea\b|\bbisect(?:ing|s)?\s+(?:the\s+)?fovea\b|\bthrough\s+(?:the\s+)?fovea\b/g, ' _fov_split_ '],
    [/\bfovea[\s-]*(?:is\s+)?threat(?:en(?:ed|ing))?\b/g, ' _fov_thr_ '],
    [/\bthreaten(?:s|ing|ed)?\s+(?:the\s+)?fovea\b|\bapproaching\s+(?:the\s+)?fovea\b/g, ' _fov_thrv_ '],
    [/\bspar(?:ing|es|ed)\s+(?:the\s+)?fovea\b|\bfovea[\s-]*sparing\b/g, ' _fov_spare_ '],
    [/\bfovea[\s-]*(?:is\s+)?(?:still\s+)?(?:on(?!\s+(?:oct|the|exam|examination|imaging|fa|ffa|icg|photos?|ultrasound|b\s*scan|autofluorescence|faf|ophthalmoscopy|fundus|clinical|both|this|that)\b)|attached|spared|in tact|intact|in(?!\s+(?:the|both|a|an|left|right|this|that|each|his|her|their|our|my|your|which|oct)\b))\b/g, ' _fov_on_ '],
    [/\bfovea[\s-]*(?:is\s+)?(?:now\s+)?(?:off|detached|out|up)\b/g, ' _fov_off_ '],
    [/\bfovea[\s-]*(?:is\s+)?(?:now\s+)?(?:involved|involving)\b|\binvolv(?:ing|es|ed)\s+(?:the\s+)?fovea\b/g, ' _fov_inv_ '],
    [/\bmacula[\s-]*(?:is\s+)?threat(?:en(?:ed|ing))?\b|\bmacula[\s-]*at[\s-]*risk\b/g, ' _mac_thr_ '],
    [/\bthreaten(?:s|ing|ed)?\s+(?:the\s+)?macula\b|\bapproaching\s+(?:the\s+)?macula\b/g, ' _mac_thrv_ '],
    [/\bspar(?:ing|es|ed)\s+(?:the\s+)?macula\b|\bmacula[\s-]*sparing\b/g, ' _mac_spare_ '],
    [/\bmacula[\s-]*(?:is\s+)?(?:still\s+)?(?:on(?!\s+(?:oct|the|exam|examination|imaging|fa|ffa|icg|photos?|ultrasound|b\s*scan|autofluorescence|faf|ophthalmoscopy|fundus|clinical|both|this|that)\b)|attached|spared|in tact|intact|in(?!\s+(?:the|both|a|an|left|right|this|that|each|his|her|their|our|my|your|which|oct)\b))\b/g, ' _mac_on_ '],
    [/\bmacula[\s-]*(?:is\s+)?(?:now\s+)?(?:off|detached|out|up)\b/g, ' _mac_off_ '],
    [/\bmacula[\s-]*(?:is\s+)?(?:now\s+)?(?:involved|involving)\b|\binvolv(?:ing|es|ed)\s+(?:the\s+)?macula\b/g, ' _mac_inv_ '],
  ];
  for (const [re, to] of REP_A) s = s.replace(re, to);
  // vitreous and lens status (for the repair-options card). A stated PVD is still drawn; a negated one keeps
  // its negation word so “no PVD or lattice” still leaves the lattice out.
  s = s.replace(PVD_RE, (m, neg, q1, ph, q2, off, str) => {
    const q = (q1 || '') + ' ' + (q2 || '');
    if (neg || /absent|negative|\bneg\b|\bnot\b|none/.test(q2 || '')) {
      // keep the negation word only when it goes on to a list (“no PVD or lattice”)
      const list = /^\s*,?\s*(?:or|nor)\b/.test(str.slice(off + m.length));
      return ` ${list && neg ? neg : ''} _meta_pvd_none_ `;
    }
    const v = /partial|incomplete|early|evolving|perifoveal|peripapillary/.test(q) ? 'partial' : /complete|full|total/.test(q) ? 'complete' : 'yes';
    return ` _meta_pvd_${v}_ ${v === 'partial' ? 'partial pvd' : v === 'complete' ? 'complete pvd' : 'pvd'} `;
  });
  for (const [re, to] of META_RE) s = s.replace(re, to);
  // how a tumour or naevus looks (elevation, shape, orange pigment, drusen, subretinal fluid) — only when one is named
  s = tumorWords(s);
  // named pathology from the catalogue, longest phrase first
  if (!(opts && opts.noCatalog)) s = catalogStage(s);
  const REP_B = [
    // negation: “no NVD or NVE”, “without PVR”, “negative for holes” — the next findings are not drawn
    [/\b(?:no\s+(?:evidence|signs?|sign)\s+of|negative\s+for|absence\s+of|absent|free\s+of|ruled\s+out|rules\s+out|r\s*o|nil|no|without|denies|neither|nor)\b/g, ' _neg_ '],
    // where on the fundus (sites) — before the generic posterior/extent words
    [/\bperi[\s-]?papillary\b|\bjuxta[\s-]?papillary\b|\baround\s+(?:the\s+)?(?:optic\s+)?(?:disc|disk|nerve(?:\s+head)?)\b/g, ' _site_ppa_ '],
    [/\bpapillo[\s-]?macula(?:r)?(?:\s+bundle)?\b|\bbetween\s+(?:the\s+)?(?:optic\s+)?(?:disc|disk|nerve)\s+and\s+(?:the\s+)?(?:fovea|macula)\b/g, ' _site_pmb_ '],
    [/\babove\b(?=\s+(?:the\s+)?(?:optic\s+)?(?:disc|disk|fovea|macula|nerve))/g, ' _q_s_ '], [/\bbelow\b(?=\s+(?:the\s+)?(?:optic\s+)?(?:disc|disk|fovea|macula|nerve))/g, ' _q_i_ '],
    [/\b(?:optic\s+)?(?:disc|disk)s?\b|\boptic\s+nerve(?:\s+head)?s?\b|\bnerve\s+head\b/g, ' _site_disc_ '],
    [/\bposterior\s+pole\b/g, ' _site_pole_ '],
    [/\bmid[\s-]?peripher(?:y|al|ally)\b/g, ' _site_mid_ '],
    [/\b(?:para|juxta|peri)[\s-]?fove(?:a|al)\b/g, ' _site_parafovea_ '],
    [/\bpars\s+plana\b/g, ' _site_pp_ '],
    // posterior extent
    [/\b(?:(superior|upper)\s+|(inferior|lower)\s+)?(?:temporal\s+|major\s+|vascular\s+)*arcades?\b/g, (m, sup, inf) => ' _ext_arcade_ ' + (sup ? '_arcq_s_ ' : inf ? '_arcq_i_ ' : '')],
    [/\bposterior\s+(?:to\s+)?(?:the\s+)?equator\b|\bpost(?:-|\s)?equatorial\b/g, ' _ext_posteq_ '],
    [/\banterior\s+to\s+(?:the\s+)?equator\b|\bpre[\s-]?equatorial\b/g, ' _ext_anteq_ '],
    [/\b(?:to|at|near|reaching|up to)\s+(?:the\s+)?equator\b|\bequatorial\b|\bequator\b/g, ' _ext_eq_ '],
    // quadrants
    [/\bsuper(?:o|ior)?[\s-]*temporal(?:ly)?\b|\btemporal[\s-]+superior(?:ly)?\b/g, ' _q_st_ '],
    [/\bsuper(?:o|ior)?[\s-]*nasal(?:ly)?\b|\bnasal[\s-]+superior(?:ly)?\b/g, ' _q_sn_ '],
    [/\binfer(?:o|ior)?[\s-]*temporal(?:ly)?\b|\btemporal[\s-]+inferior(?:ly)?\b/g, ' _q_it_ '],
    [/\binfer(?:o|ior)?[\s-]*nasal(?:ly)?\b|\bnasal[\s-]+inferior(?:ly)?\b/g, ' _q_in_ '],
    // findings (order matters: specific before generic)
    [/\bposterior vitreous detachments?\b|\bpvds?\b/g, ' _pvd_ '],
    // bare “choroidal” means a choroidal detachment only when nothing else is named after it
    [/\bchoroidals\b|\bchoroidal\s+(?:detachments?|effusions?)\b|\bcilio[\s-]?choroidal(?:\s+detachments?)?\b|\bchoroidal\b(?=\s*(?:$|,|\?|_|from\b|at\b|in\b|on\b|between\b|and\b|with\b|\d))/g, ' _f_chd_ '],
    [/\bgiant\s+(?:retinal\s+)?(?:tears?|breaks?)\b|\bgrts?\b/g, ' _f_grt_ '],
    [/\b(?:retinal\s+)?dialys[ie]s\b/g, ' _f_dia_ '],
    [/\blattice(?:\s+degeneration)?\s+with\s+(?:atrophic\s+|round\s+)?holes?\b/g, ' _f_lat_ _m_holes_ '],
    [/\boperculated\s+(?:retinal\s+)?(?:holes?|tears?|breaks?)\b|\boperculum\b|\boperculated\b|\bop\s+holes?\b|\bfree\s+operculum\b/g, ' _f_oph_ '],
    [/\b(?:atrophic|round|retinal|small round)\s+holes?\b/g, m => / holes$/.test(m) ? ' _f_holes_ ' : ' _f_hole_ '],
    [/\bholes\b/g, ' _f_holes_ '], [/\bhole\b/g, ' _f_hole_ '],
    [/\b(?:horseshoe|flap|u[\s-]shaped|retinal|giant)?\s*(?:tears|breaks)\b|\bhsts\b/g, ' _f_hsts_ '],
    [/\b(?:horseshoe|flap|u[\s-]shaped|retinal)\s*(?:tear|break)\b|\b(?:tear|break)\b|\bhst\b|\bhorseshoe\b/g, ' _f_hst_ '],
    [/\blattice(?:\s+degeneration)?\b/g, ' _f_lat_ '],
    [/\b(?:paving[\s-]*stones?|cobble[\s-]*stones?)(?:\s+degeneration)?\b/g, ' _f_pav_ '],
    [/\b(?:retinal\s+|cystic\s+|zonular\s+)?tufts?\b|\bmeridional\s+folds?\b/g, ' _f_tuft_ '],
    [/\b(?:star|fixed|stellate)\s+folds?\b/g, ' _f_star_ '],
    [/\bpvr\s*(?:grade\s*)?([abc])\s*([pa])?\s*(\d{1,2})?\b|\bgrade\s*([abc])\s*([pa])?\s*(\d{1,2})?\s*pvr\b/g, (m, a, b, c, a2, b2, c2) => ` _f_pvr_ _pvr_${(a || a2).toUpperCase()}_${(b || b2 || '').toUpperCase()}_${c || c2 || ''}_ `],
    [/\bproliferative\s+vitreoretinopathy\b|\bpvr\b/g, ' _f_pvr_ '],
    [/\blaser\s+(?:retinopexy|barricade|barrier|demarcation|photocoagulation)\b|\b(?:barricade|barrier|demarcating|demarcation)\s+laser\b|\blaser(?:ed)?\b|\bretinopexy\b|\blpc\b|\bbarricade\b/g, ' _f_laser_ '],
    [/\b(?:pigmented\s+)?demarcation(?:\s+lines?)?\b|\bhigh[\s-]*water\s*marks?\b|\bpigment(?:ed)?\s+lines?\b/g, ' _f_dem_ '],
    [/\bcryo(?:therapy|pexy)?\b/g, ' _f_cryo_ '],
    [/\b(?:vitreous|vit)\s+(?:h(?:a)?emorrhages?|heme|hem|blood|bleed)\b|\bvhs?\b/g, ' _f_vh_ '],
    [/\bblood\s+in\s+(?:the\s+)?vitreous(?:\s+cavity)?\b/g, ' _f_vh_ '],
    [/\b(?:retinal\s+|intraretinal\s+)?hemorrhages?\b|\bheme\b|\bbleeds?\b|\bblood\b/g, (m) => CAT.intraretinal_hemorrhage_dot_blot && !(opts && opts.noCatalog) ? ` _c_${CAT.intraretinal_hemorrhage_dot_blot.ix}_${/s$/.test(m) ? 'p' : ''}_ ` : m],
    [/\b(?:encircling|circumferential)\s+(?:scleral\s+)?(?:buckle|band|element)s?\b|\bencircling\b/g, ' _f_buckle_ _m_enc_ '],
    [/\b(?:segmental\s+|radial\s+)?(?:scleral\s+)?buckles?\b|\bsb\b|\bscleral\s+band\b/g, ' _f_buckle_ '],
    [/\b(?:retinal\s+)?detachments?\b|\bdetached(?:\s+retina)?\b|\brrds?\b|\brds\b|\brd\b/g, ' _f_rd_ '],
    // modifiers
    [/\b(?:very\s+|highly\s+)?bullous\b/g, ' _m_bullous_ '],
    [/\b(?:shallow|subclinical|localized|localised|limited)\b|\bflat\b(?=\s+(?:_m_\w+_\s+)*_f_rd_)/g, ' _m_shallow_ '],
    [/\b(?:exudative|serous|non[\s-]?rhegmatogenous)\b/g, ' _m_exud_ '],
    [/\bfresh\b|\bbright red\b/g, ' _m_fresh_ '],
    [/\b(?:chronic|old|longstanding|long-standing)\b/g, ' _m_chronic_ '],
    [/\bsub[\s-]?total\b/g, ' _m_subtotal_ '],
    [/\b(?:total|complete|entire|whole)\b/g, ' _m_total_ '],
    [/\b(?:sparing|except(?:\s+for)?|apart\s+from|other\s+than|but\s+not)\b/g, ' _m_spare_ '],
    [/\bposterior(?:ly)?\b/g, ' _m_post_ '],
    [/\bat\s+(?:the\s+)?(?:ora(?:\s+serrata)?|vitreous\s+base)\b|\bnear\s+(?:the\s+)?ora(?:\s+serrata)?\b|\bfar\s+peripher(?:y|al)\b|\boral\b/g, ' _m_ora_ '],
    [/\banterior(?:ly)?\b/g, ' _m_ant_ '],
    [/\b(?:tiny|small|little|minute)\b/g, ' _m_small_ '],
    [/\b(?:large|big|huge|massive|wide|broad)\b/g, ' _m_large_ '],
    [/\bpigmented\b/g, ' _m_pig_ '],
    [/\brolled(?:\s+edges?)?\b/g, ' _m_rolled_ '],
    [/\b(?:multiple|several|numerous|many|a few|few)\b/g, ' _m_multi_ '],
    [/\bdense\b|\bthick\b/g, ' _m_dense_ '],
    [/\bmild\b|\bfaint\b|\bwispy\b|\blight\b/g, ' _m_mild_ '],
    [/\b(?:superior|upper)\s+half\b/g, ' _q_sh_ '], [/\b(?:inferior|lower)\s+half\b/g, ' _q_ih_ '],
    [/\btemporal\s+half\b/g, ' _q_th_ '], [/\bnasal\s+half\b/g, ' _q_nh_ '],
    // plain quadrants last
    [/\bsuperior(?:ly)?\b|\bupper\b|\bup\s+top\b/g, ' _q_s_ '],
    [/\binferior(?:ly)?\b|\blower\b|\bbottom\b/g, ' _q_i_ '],
    [/\btemporal(?:ly)?\b/g, ' _q_t_ '],
    [/\bnasal(?:ly)?\b/g, ' _q_n_ '],
    [/\bmacula\b/g, ' _macword_ '], [/\bfovea\b/g, ' _fovword_ '],
    // remaining site words (after vitreous haemorrhage / vitreous base / far periphery are taken)
    [/\bvitreous\b/g, ' _site_vit_ '],
    [/\bperipher(?:y|al|ally)\b/g, ' _site_periph_ '],
  ];
  for (const [re, to] of REP_B) s = s.replace(re, to);

  // ranges
  s = s.replace(new RegExp(`\\b${H}\\s*(?:oclock\\s*)?(?:extending|extends|going|running|stretching|reaching|spreading|sweeping|wrapping)\\s+(?:all the way\\s+|around\\s+)?(?:to|through|until|till|thru)\\s+${H}`, 'g'), ' $1 to $2 ');
  s = s.replace(new RegExp(`\\bbetween\\s+${H}\\s*(?:oclock\\s*)?(?:and|-)\\s*${H}(?:\\s*oclock)?`, 'g'), ' _rng_$1_$2_ ');
  s = s.replace(new RegExp(`\\b(?:from\\s+)?${H}\\s*(?:oclock\\s*)?(?:to|through|thru|till|until|til|-)\\s*${H}(?:\\s*oclock)?\\b`, 'g'), ' _rng_$1_$2_ ');
  // counts: "2 tears", "3 small holes" (plural nouns only, after ranges are taken)
  s = s.replace(/\b(\d{1,2})\s+((?:_m_\w+?_\s+)*)(_f_(?:hsts|holes|tuft|star)_|_c_\d+_p_)/g, (m, n, mods, f) => ` _count_${n}_ ${mods}${f}`);
  // single hours
  s = s.replace(new RegExp(`\\b${H}\\s*(oclock)?\\b`, 'g'), (m, h, oc) => ` _hr_${h}_${oc ? 'oc' : ''}_ `);
  return s.replace(/\s+/g, ' ').trim();
}

const PVD_PHRASE = '(posterior\\s+vitreous\\s+detachments?|(?:posterior\\s+)?vitreous\\s+detachments?|pvds?|p\\s+v\\s+d|(?:posterior\\s+)?hyaloid\\s+separation|vitreous\\s+separation|separated\\s+(?:posterior\\s+)?hyaloid)';
const PVD_RE = new RegExp('\\b(?<!anomalous\\s)(?:(no|without|negative\\s+for|negative|absence\\s+of|absent)\\s+(?:a\\s+|an\\s+|evidence\\s+of\\s+(?:a\\s+)?|signs?\\s+of\\s+(?:a\\s+)?)?)?' +
  '(?:(partial|incomplete|early|evolving|perifoveal|peripapillary|complete|full|total)\\s+)?' + PVD_PHRASE +
  '\\b(?!\\s+macula)(?:\\s*,?\\s+(?:is\\s+|was\\s+)?(absent|negative|neg|not\\s+(?:present|seen|evident)|none|present|positive|partial|incomplete|complete|full)\\b)?', 'g');
const META_RE = [
  [/\b(?:weiss|weis|vice|wise|vogt)\s+ring\b/g, (m) => ' _meta_pvd_complete_ ' + m + ' '],
  [/\b(?:attached|adherent|undetached)\s+(?:posterior\s+)?(?:hyaloid|vitreous)(?:\s+face)?\b|\b(?:posterior\s+)?(?:hyaloid|vitreous)(?:\s+face)?\s+(?:is\s+|remains\s+|still\s+)*(?:attached|adherent)\b(?!\s+(?:to|at|on)\b)/g, ' _meta_pvd_none_ '],
  [/\bphakic\s+(?:iol|icl|lens\s+implant)\b|\bicl\b/g, ' _meta_lens_phakic_ '],
  [/\bpseudo[\s-]?phak(?:ic|ia|os|e)\b|\b(?:pc|ac|sulcus|scleral[\s-]?fixated|iris[\s-]?fixated)[\s-]?iol\b|\bpciol\b|\baciol\b|\biol\b|\bintraocular\s+lens(?:\s+implant)?\b|\b(?:s\s*p|status\s+post|post|after|following|prior|previous|history\s+of|hx\s+of|had|underwent|has\s+had)\s+(?:(?:uncomplicated|routine|bilateral|left|right)\s+)?(?:cataract(?:\s+(?:surgery|extraction|operation|op))?|phaco(?:emulsification)?|cei|ecce)\b|\bpost[\s-]?phaco\b/g, ' _meta_lens_pseudo_ '],
  [/\baphak(?:ic|ia)\b/g, ' _meta_lens_aphakic_ '],
  [/\bphak(?:ic|ia)\b|\b(?:clear|crystalline|natural)\s+lens\b|\bnuclear\s+scleros[ie]s\b|\bnuclear\s+sclerotic(?:\s+cataracts?)?\b|\b(?:ns|cortical|psc|posterior\s+subcapsular|senile|age[\s-]related)\s+cataracts?\b|\bgrade[\d.]+plus\s+(?:ns|nuclear|cortical|psc)\b|\bcataracts?\b/g, ' _meta_lens_phakic_ '],
];

/* catalogue phrase matcher: one alternation, longest phrase first; the matched text is mapped back to
   its entry by a separator-free key so “cotton-wool spots”, “cotton wool spot” and “cottonwool spot” agree */
let CAT_RE = null, CAT_KEY = null;
function catKey(s) { return s.replace(/[\s'-]+/g, ''); }
function buildCatalogMatcher() {
  CAT_KEY = new Map();
  const set = new Set();
  for (const e of CATALOG) {
    if (e.map && e.map.type === 'auto') continue;
    for (const raw of (e.match || [])) {
      const p = stage1(raw).replace(/'/g, '').replace(/[,?]/g, ' ').replace(/\s+/g, ' ').trim();
      if (p.length < 2 || /^\d{1,2}(?!\d)/.test(p)) continue;   // never start on a clock hour
      const k = catKey(p);
      if (CAT_KEY.has(k) && CAT_KEY.get(k) !== e.ix) continue;    // the phrase belongs to an earlier entry
      CAT_KEY.set(k, e.ix);
      set.add(p);
    }
  }
  const phrases = [...set];
  phrases.sort((a, b) => b.length - a.length);
  const esc = p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[\\s-]*');
  // plurals only for real words: “gas” must not read as GA + s, nor “mass” as MAs + s
  CAT_RE = phrases.length ? new RegExp('\\b(?:' + phrases.map(p => esc(p) + (catKey(p).length >= 4 ? '(?:e?s)?' : '')).join('|') + ')\\b', 'g') : null;
}
function catalogStage(s) {
  if (!CATALOG.length) return s;
  if (!CAT_KEY) buildCatalogMatcher();
  if (!CAT_RE) return s;
  s = s.replace(/'/g, '');
  return s.replace(CAT_RE, (m) => {
    const k = catKey(m);
    let ix = CAT_KEY.get(k), plural = false;
    if (ix == null && /es$/.test(k)) { ix = CAT_KEY.get(k.slice(0, -2)); plural = ix != null; }
    if (ix == null && /s$/.test(k)) { ix = CAT_KEY.get(k.slice(0, -1)); plural = ix != null; }
    if (ix == null) return m;
    if (!plural && /(?:s|drusen|nevi)$/.test(k)) plural = true;
    return ` _c_${ix}_${plural ? 'p' : ''}_ `;
  });
}

/* tumour descriptors → tokens; the parser attaches them to the tumour they sit beside */
const TUMOR_WORD = /\b(?:nev(?:us|i|uses)|melanomas?|tumou?rs?|mass(?:es)?|lesions?|hemangiomas?|metasta\w*|mets|osteomas?|chrpe|c\s*h\s*r\s*p\s*e|hamartomas?|retinoblastomas?|vasoproliferative|hypertrophy\s+of\s+the\s+(?:rpe|retinal\s+pigment\s+epithelium))\b|_tsz_|_tth_/;
const SRF_W = '(?:sub[\\s-]?retinal\\s+fluid|srf)';
const TUMOR_RE = [
  // “orange pigment absent”, “SRF: none”, “drusen negative”
  [new RegExp(`\\b(orange\\s+pigment(?:ation)?|lipofuscin|${SRF_W}|drusen)\\s+(?:is\\s+|are\\s+|was\\s+)?(?:absent|negative|neg|not\\s+(?:present|seen|evident|visible)|none)\\b`, 'g'), (m, w) => ` _neg_ ${w} `],
  [/\b(?:orange\s+)?lipofuscin\b|\borange\s+pigment(?:ation|ed)?\b/g, ' _top_ '],
  [/(?<!\b(?:soft|hard|large|small|medium|confluent|macular|peripheral|equatorial|disc|disk|optic|nerve|buried|superficial|calcified|cuticular|reticular|basal\s+laminar|optic\s+disc|optic\s+nerve)\s)(?:\b(?:overlying|surface|surface\s+of)\s+)?\bdrusen\b(?![\s-]*like)(?!\s+(?:in|at|of|around|within|near)\s+(?:the\s+)?(?:macula|fovea|periphery|peripheral|disc|disk|optic|nerve|posterior|mid))/g, ' _tdru_ '],
  [new RegExp(`\\b(?:trace|minimal|mild|slight|shallow|small\\s+amount\\s+of|a\\s+little|a\\s+small\\s+amount\\s+of|little)\\s+${SRF_W}\\b`, 'g'), ' _tsrf_trace_ '],
  [new RegExp(`\\b(?:extensive|large\\s+amount\\s+of|a\\s+lot\\s+of|lots\\s+of|significant|marked|bullous|much)\\s+${SRF_W}\\b`, 'g'), ' _tsrf_ext_ '],
  [new RegExp(`(?<!\\b(?:cuff\\s+of|shifting)\\s)\\b${SRF_W}\\b(?!\\s+(?:drainage|cuff|macula))`, 'g'), ' _tsrf_yes_ '],
  [/\b(?:no|without)\s+(?:sub[\s-]?retinal\s+)?fluid\b/g, ' _neg_ _tsrf_yes_ '],
  // elevation and shape
  [/\b(?:mushroom|collar[\s-]?button)(?:[\s-]?shaped)?\b/g, ' _tsh_mush_ '],
  [/\bdome[\s-]?shaped\b|\bdomed?\b/g, ' _tsh_dome_ '],
  [/\b(?:not|non)[\s-]?elevated\b|\bno\s+elevation\b/g, ' _tel_flat_ '],
  [/\b(?:minimally|slightly|mildly|barely|subtly|minimal)\s+elevated\b|\b(?:minimal|slight|mild|subtle)\s+elevation\b/g, ' _tel_min_ '],
  [/\bmoderately\s+elevated\b|\bmoderate\s+elevation\b/g, ' _tel_mod_ '],
  [/\b(?:markedly|highly|significantly|very|prominently|substantially|greatly)\s+elevated\b|\b(?:marked|significant|prominent|substantial)\s+elevation\b/g, ' _tel_marked_ '],
  [/\belevated\b(?!\s+(?:nve|nvd|nv|neovascul\w*|new\s+vessels|dis[ck]|optic|nerve|iop|pressure|intraocular))|\belevation\b/g, ' _tel_elev_ '],
  [/\bflat\b(?=\s+pigmented)/g, ' _tel_flat_ flat'],
  [/\bflat\b(?!\s+(?:pigmented|(?:\w+\s+)?(?:retinal\s+)?(?:detachment|rd|rrd|rds|schisis|nve|nvd|nv|neovascul\w*|retina)\b|under\b|on\b|after\b))/g, ' _tel_flat_ '],
];
function tumorWords(s) {
  if (!TUMOR_WORD.test(s)) return s;
  for (const [re, to] of TUMOR_RE) s = s.replace(re, to);
  return s;
}
const TUM_TOKEN = /^_(tsz|tth|tdist|tel|tsh|top|tdru|tsrf)_(?:([\d.]+|[a-z]+)_)?(?:([\d.]*)_)?(?:(dd|mm)_)?$/;
function tumToken(w) {
  const m = TUM_TOKEN.exec(w);
  if (!m) return null;
  const n = (v, lo, hi) => { const x = parseFloat(v); return isFinite(x) && x >= lo && x <= hi ? x : null; };
  switch (m[1]) {
    case 'tsz': { const a = n(m[2], 0.05, 40), b = m[3] ? n(m[3], 0.05, 40) : null; return a == null || (m[3] && b == null) ? null : { k: 'sz', v: { base: b != null ? [a, b] : [a], unit: m[4] === 'mm' ? 'mm' : 'dd' } }; }
    case 'tth': { const a = n(m[2], 0.05, 30); return a == null ? null : { k: 'th', v: a }; }
    case 'tdist': { const a = n(m[2], 0, 40); return a == null ? null : { k: 'dist', v: { n: a, unit: m[4] === 'mm' ? 'mm' : m[3] === 'mm' ? 'mm' : 'dd' } }; }
    case 'tel': return ELEV_TEXT[m[2]] ? { k: 'elev', v: m[2] } : null;
    case 'tsh': return SHAPE_TEXT[m[2]] ? { k: 'shape', v: m[2] } : null;
    case 'top': return { k: 'op', v: 'yes' };
    case 'tdru': return { k: 'dru', v: 'yes' };
    case 'tsrf': return ['trace', 'yes', 'ext'].includes(m[2]) ? { k: 'srf', v: m[2] } : null;
  }
  return null;
}

function tokenize(norm) {
  const out = [];
  for (const w of norm.split(' ')) {
    if (!w) continue;
    let m;
    if ((m = /^_rng_([\d.]+)_([\d.]+)_$/.exec(w))) { if (validHour(+m[1]) && validHour(+m[2])) out.push({ t: 'rng', a: +m[1], b: +m[2] }); else out.push({ t: 'word', w: m[1] + '-' + m[2] }); }
    else if ((m = /^_hr_([\d.]+)_(oc)?_$/.exec(w))) { if (validHour(+m[1])) out.push({ t: 'hr', h: +m[1], oc: !!m[2] }); else out.push({ t: 'word', w: m[1] }); }
    else if ((m = /^_ch_(\d+)_$/.exec(w))) out.push({ t: 'ch', n: +m[1] });
    else if ((m = /^_q_(\w+?)_$/.exec(w))) out.push({ t: 'q', q: m[1] });
    else if ((m = /^_f_(\w+?)_$/.exec(w))) out.push({ t: 'f', f: m[1] });
    else if ((m = /^_m_(\w+?)_$/.exec(w))) out.push({ t: 'm', m: m[1] });
    else if ((m = /^_ext_(\w+?)_$/.exec(w))) out.push({ t: 'ext', ext: m[1] });
    else if ((m = /^_(mac|fov)_(\w+?)_$/.exec(w))) out.push({ t: 'st', k: m[1], v: m[2] });
    else if ((m = /^_eye_(OD|OS)_$/i.exec(w))) out.push({ t: 'eye', eye: m[1].toUpperCase() });
    else if ((m = /^_count_(\d+)_$/.exec(w))) out.push({ t: 'count', n: +m[1] });
    else if ((m = /^_pvr_([ABC])_([PA]?)_(\d*)_$/.exec(w))) out.push({ t: 'pvr', grade: m[1], loc: m[2] || null, hours: m[3] ? +m[3] : null });
    else if (w === '_360_') out.push({ t: 'm', m: 'enc' });
    else if ((m = /^_c_(\d+)_(p?)_$/.exec(w))) out.push({ t: 'f', f: 'cat', ix: +m[1], plural: !!m[2] });
    else if ((m = /^_site_(\w+?)_$/.exec(w))) out.push({ t: 'site', site: SITE_WORD[m[1]] || m[1] });
    else if (w === '_macword_') out.push({ t: 'site', site: 'macula', weak: true });
    else if (w === '_fovword_') out.push({ t: 'site', site: 'fovea', weak: true });
    else if ((m = /^_arcq_([si])_$/.exec(w))) out.push({ t: 'arcq', q: m[1] });
    else if (/^_(undo|redo|clear|remove|lincoff|lincoffoff|eyeflip)_$/.test(w)) out.push({ t: 'cmd', c: w.slice(1, -1) });
    else if (w === '_pvd_') out.push({ t: 'skip', w });
    else if ((m = /^_meta_(pvd|lens)_(\w+?)_$/.exec(w))) out.push({ t: 'meta', k: m[1], v: m[2] });
    else if (w === '_neg_') out.push({ t: 'neg' });
    else if (/^_t(?:sz|th|dist|el|sh|op|dru|srf)_/.test(w)) { const t = tumToken(w); if (t) out.push({ t: 'tum', k: t.k, v: t.v }); }
    else if (w === ',' || w === 'and' || w === 'or' || w === 'with' || w === 'plus' || w === 'also' || w === 'then' || w === 'but') out.push({ t: 'sep', w });
    else out.push({ t: 'word', w });
  }
  return out;
}

const SITE_WORD = { ppa: 'ppa', pmb: 'pmb', disc: 'disc', pole: 'pole', mid: 'mid', parafovea: 'parafovea', pp: 'pars_plana', vit: 'vitreous', periph: 'periphery' };
const EXT_SITE = { arcade: 'arcade', posteq: 'mid', eq: 'equator', anteq: 'periphery' };
const KIND_ALIAS = { hsts: 'hst', holes: 'hole' };
const POINT_KINDS = new Set(['hst', 'hole', 'oph', 'tuft', 'star', 'pav']);
const ADD_WORDS = new Set(['add', 'draw', 'put', 'place', 'plus', 'show', 'mark', 'also']);

function parse(text, ctx) {
  ctx = ctx || {};
  const norm = normalize(text, { noCatalog: ctx.noCatalog });
  let eye = ctx.eye || 'OS';
  const pre = [];

  // move / extend are handled up front so "to H" isn't read as a range
  let work = ' ' + norm + ' ';
  if (/\b(?:move|shift|relocate|reposition)\b/.test(norm)) {
    const raw = String(text).toLowerCase();
    const m2 = /(?:move|shift|relocate|reposition)\b(.*?)\bto\s+(?:the\s+)?(\d{1,2}(?::\d{2}|\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/.exec(raw);
    if (m2) {
      const toks = tokenize(normalize(m2[1], { noCatalog: ctx.noCatalog }));
      const f = toks.find(t => t.t === 'f');
      const fe = f && f.f === 'cat' ? CATALOG[f.ix] : null;
      const from = toks.find(t => t.t === 'hr');
      let to = m2[2].includes(':') ? (+m2[2].split(':')[0] + Math.round(+m2[2].split(':')[1] / 15) * 0.25) : num(m2[2]);
      if (validHour(to)) {
        const mv = { op: 'move', type: fe ? (fe.map ? fe.map.type : 'cat') : f ? (KIND_ALIAS[f.f] || f.f) : null, from: from ? from.h : null, to: normHour(to) };
        if (fe && !fe.map) mv.key = fe.id;
        pre.push(mv);
        work = ' ';
      }
    }
  }
  if (work !== ' ' && /\b(?:move|shift|relocate|reposition)\b/.test(norm)) {
    const raw = String(text).toLowerCase();
    const mq = /(?:move|shift|relocate|reposition)\b(.*?)\bto\s+(?:the\s+)?(super(?:o|ior)?[\s-]*temporal|super(?:o|ior)?[\s-]*nasal|infer(?:o|ior)?[\s-]*temporal|infer(?:o|ior)?[\s-]*nasal|superior|inferior|temporal|nasal)(?:ly)?\b/.exec(raw);
    if (mq) {
      const w = mq[2].replace(/[\s-]/g, '');
      const q = /^super.*temp/.test(w) ? 'st' : /^super.*nas/.test(w) ? 'sn' : /^infer.*temp/.test(w) ? 'it' : /^infer.*nas/.test(w) ? 'in' : w === 'superior' ? 's' : w === 'inferior' ? 'i' : w === 'temporal' ? 't' : 'n';
      const t2 = tokenize(normalize(mq[1], { noCatalog: ctx.noCatalog }));
      const f2 = t2.find(t => t.t === 'f'), fe2 = f2 && f2.f === 'cat' ? CATALOG[f2.ix] : null;
      const mv = { op: 'move', type: fe2 ? (fe2.map ? fe2.map.type : 'cat') : f2 ? (KIND_ALIAS[f2.f] || f2.f) : null, quad: q, to: quadrant(q, eye).c };
      if (fe2 && !fe2.map) mv.key = fe2.id;
      pre.push(mv);
      work = ' ';
    }
  }
  const ex = /\b(?:extend|enlarge|widen|expand|extending)\b(?:\s+(?:it|the|_f_rd_))*\s+(?:to|through|until|till|up to|down to)\s+_hr_([\d.]+)_/.exec(work.replace(/_f_rd_/g, '_f_rd_'));
  if (ex && validHour(+ex[1])) {
    pre.push({ op: 'extend', to: normHour(+ex[1]) });
    work = work.replace(ex[0], ' ');
  }

  const toks = tokenize(work.trim());
  const actions = [];
  const unknown = [];
  const mentions = [];
  const statuses = {};
  let current = null;
  let sepSince = false;
  let pendingPos = [];
  let pendingMods = [];
  let pendingCount = null;
  let removeMode = false;
  let pendingSpare = false;
  let pendingHint = null;
  let chExtent = null;
  const exts = [];
  let pvrSpec = null;
  let lincoff = null;
  let pendingSite = null, pendingArc = null;
  let clause = 0;
  let negActive = false, negAnd = false;
  let lastSep = null;
  const negated = [];
  const cmds = [];
  const metas = {};
  let pendingTum = null, negConsumed = false;
  const isTumMention = (mn) => !!mn && mn.kind === 'cat' && !!mn.entry && isTumor(mn.entry) && !mn.remove;
  const setTum = (t, k, v) => {
    if (k === 'sz') { t.base = v.base.slice(); t.bu = v.unit; }
    else if (k === 'dist') { t.dist = v.n; t.du = v.unit; }
    else t[k] = v;
  };
  // drusen said beside a tumour describe its surface; drusen with a place of their own, or with no tumour
  // in the sentence before them, are the catalogue finding
  const DRUSEN = CAT.drusen_hard;
  toks.forEach((t, i) => {
    if (t.t !== 'tum' || t.k !== 'dru') return;
    let own = false;
    for (let j = i + 1; j < toks.length && toks[j].t !== 'sep' && toks[j].t !== 'f'; j++) if (['hr', 'rng', 'q', 'site'].includes(toks[j].t)) { own = true; break; }
    let tum = false;
    for (let j = i - 1; j >= 0; j--) { const u = toks[j]; if (u.t === 'f') { tum = u.f === 'cat' && isTumor(CATALOG[u.ix]); break; } }
    // “no orange pigment or drusen on the naevus”: the tumour comes after, with nothing but “or” in between
    if (!tum) for (let j = i + 1; j < toks.length; j++) { const u = toks[j]; if (u.t === 'f') { tum = u.f === 'cat' && isTumor(CATALOG[u.ix]); break; } if (u.t === 'sep' && u.w !== 'or') break; }
    if ((own || !tum) && DRUSEN) toks[i] = { t: 'f', f: 'cat', ix: DRUSEN.ix, plural: true };
  });

  const nextNonMod = (i) => { for (let j = i + 1; j < toks.length; j++) { const t = toks[j]; if (t.t === 'm' || t.t === 'count' || t.t === 'arcq' || t.t === 'tum' || (t.t === 'word' && STOP.has(t.w))) continue; return t; } return null; };
  const prevNonStop = (i) => { for (let j = i - 1; j >= 0; j--) { const t = toks[j]; if (t.t === 'word' && STOP.has(t.w)) continue; return t; } return null; };

  toks.forEach((tk, i) => {
    switch (tk.t) {
      case 'f': {
        let kind = KIND_ALIAS[tk.f] || tk.f, entry = null, extra = null;
        if (kind === 'cat') {
          entry = CATALOG[tk.ix];
          if (entry && entry.map) { kind = entry.map.type; extra = Object.assign({}, entry.map); delete extra.type; if (!Object.keys(extra).length) extra = null; entry = null; }
        }
        const pv = prevNonStop(i);
        const joined = pv && pv.t === 'sep' ? pv.w : null;
        // “a cuff of fluid” said with a break belongs to that break; with a macular hole it is part of the hole
        if (entry && entry.id === 'break_with_subretinal_fluid_cuff' && current && !current.negated && !negActive) {
          if (['hst', 'hole', 'oph'].includes(current.kind)) { current.extra = Object.assign(current.extra || {}, { cuff: true }); break; }
          if (current.kind === 'cat' && (!sepSince || lastSep === 'with')) break;
        }
        // “lattice with holes …”: one lattice, flagged; “lattice with a tear at 2”: the tear is drawn and the lattice sits with it
        if (current && current.kind === 'lat' && !current.pos.length && joined === 'with' && !negActive) {
          if (tk.f === 'hole' || tk.f === 'holes') { current.extra = Object.assign(current.extra || {}, { holes: true }); sepSince = false; break; }
        }
        // the same finding named twice in a row (“SF6 gas”, “PCV with orange nodules”, “combined tractional RD”)
        if (current && !current.pos.length && !current.negated && !negActive && current.kind === kind && (!sepSince || lastSep === 'with') &&
            (kind !== 'cat' || current.entry.id === entry.id) && kind !== 'hst' && kind !== 'hole') {
          if (extra) current.extra = Object.assign(current.extra || {}, extra);
          for (const m of pendingMods) current.mods.add(m);
          pendingMods = [];
          if (pendingTum) { current.tum = Object.assign(current.tum || {}, pendingTum); pendingTum = null; }
          sepSince = false;
          break;
        }
        const prevMention = current;
        // a negation used up by a tumour's descriptors (“no orange pigment or drusen on the naevus”) does not negate the tumour
        const neg = negActive && !(negConsumed && entry && isTumor(entry));
        current = { kind, entry, extra, plural: tk.f === 'hsts' || tk.f === 'holes' || !!tk.plural, pos: pendingPos, mods: new Set(pendingMods), count: pendingCount, remove: removeMode, quadHint: pendingHint, site: pendingSite, arc: pendingArc, clause, negated: neg, negAnd: neg && negAnd };
        if (pendingTum) { if (entry && isTumor(entry)) current.tum = pendingTum; pendingTum = null; }
        if (prevMention && (joined === 'and' || joined === 'or')) current.andPrev = prevMention;
        if (prevMention && prevMention.kind === 'lat' && !prevMention.pos.length && joined === 'with' && (kind === 'hst' || kind === 'oph')) prevMention.borrow = current;
        pendingHint = null; pendingSite = null; pendingArc = null;
        if (pendingSpare) { current.spare = true; pendingSpare = false; }
        pendingPos = []; pendingMods = []; pendingCount = null; sepSince = false;
        mentions.push(current);
        break;
      }
      case 'rng': case 'hr': case 'q': {
        const pos = tk.t === 'rng' ? { kind: 'rng', a: tk.a, b: tk.b } : tk.t === 'hr' ? { kind: 'hr', h: tk.h, oc: tk.oc } : { kind: 'q', q: tk.q };
        if (pendingSpare) { pos.spare = true; pendingSpare = false; }
        const nx = nextNonMod(i);
        const nextIsFinding = nx && nx.t === 'f';
        if (current && pos.kind !== 'q' && current.pos.length === 1 && current.pos[0].kind === 'q' && !sepSince) { current.quadHint = current.pos[0].q; current.pos[0] = pos; break; }
        if (current && pos.kind === 'q' && current.pos.length && current.pos[current.pos.length - 1].kind === 'rng' && !sepSince) { current.quadHint = pos.q; break; }
        if (!current && pos.kind === 'rng' && pendingPos.length === 1 && pendingPos[0].kind === 'q') { pendingHint = pendingPos[0].q; pendingPos = []; }
        const accepts = current && !(current.kind === 'rd' && current.pos.length) && !(current.kind === 'buckle' && current.pos.length && pos.kind !== 'hr');
        if (nextIsFinding && (!current || current.pos.length || sepSince)) pendingPos.push(pos);
        else if (accepts) current.pos.push(pos);
        else if (current && current.kind === 'rd' && current.pos.length && pos.kind !== 'hr') {
          current = { kind: 'rd', pos: [pos], mods: new Set(current.mods), remove: removeMode };
          mentions.push(current);
        } else pendingPos.push(pos);
        break;
      }
      case 'm': {
        if (negActive) break;
        if (tk.m === 'spare') { pendingSpare = true; break; }
        const nx = nextNonMod(i);
        if (nx && nx.t === 'f' && (!current || sepSince || ['small', 'large', 'bullous', 'shallow', 'chronic', 'total', 'subtotal', 'pig', 'multi', 'enc', 'dense', 'mild', 'exud', 'fresh'].includes(tk.m))) pendingMods.push(tk.m);
        else if (current) current.mods.add(tk.m);
        else pendingMods.push(tk.m);
        break;
      }
      case 'count': pendingCount = tk.n; break;
      case 'ch': chExtent = tk.n; break;
      case 'ext': {
        const base = tk.ext.split('_')[0];
        const nx = nextNonMod(i);
        if (current && current.kind === 'cat' && !sepSince) current.site = EXT_SITE[base] || current.site;
        else if (nx && nx.t === 'f' && nx.f === 'cat') pendingSite = EXT_SITE[base];
        else if (current && ['hst', 'hole', 'oph', 'lat'].includes(current.kind) && !sepSince && base === 'posteq') current.mods.add('post');
        else exts.push(base);
        break;
      }
      case 'arcq': {
        const nx = nextNonMod(i);
        if (current && current.kind === 'cat' && !sepSince) { current.site = 'arcade'; current.arc = tk.q; }
        else if (nx && nx.t === 'f' && nx.f === 'cat') { pendingSite = 'arcade'; pendingArc = tk.q; }
        break;
      }
      case 'site': {
        // where a named finding sits; ignored for detachments and breaks (they have their own geometry)
        const nx = nextNonMod(i);
        const nextCat = nx && nx.t === 'f' && nx.f === 'cat';
        if (current && current.kind === 'cat' && (!sepSince || !nextCat)) {
          current.site = tk.site;
          // “haemorrhages and microaneurysms in the macula”: the place covers findings joined by and/or,
          // unless they carry their own position or belong somewhere fixed (the disc, the vitreous)
          if (!current.pos.length) for (let m = current.andPrev; m && m.kind === 'cat' && !m.site && !m.pos.length && !['disc', 'ppa', 'fovea', 'vitreous'].includes(m.entry.site); m = m.andPrev) m.site = tk.site;
        }
        else if (nextCat && !tk.weak) pendingSite = tk.site;
        else if (nextCat && tk.weak) pendingSite = tk.site;
        break;
      }
      case 'st': {
        // involvement wording beside a named finding describes that finding (“CNV involving the fovea”,
        // “foveal-sparing GA”, “TRD threatening the macula”); status wording always describes the detachment
        const nx = nextNonMod(i);
        const verbal = tk.v === 'inv' || tk.v === 'spare' || tk.v === 'thrv';
        const base = { inv: 'off', spare: 'on', thrv: 'thr' }[tk.v] || tk.v;
        const place = tk.k === 'mac' ? 'macula' : 'fovea';
        const onCat = current && current.kind === 'cat' && !sepSince;
        const beforeCat = nx && nx.t === 'f' && nx.f === 'cat' && !(current && current.kind === 'rd' && !sepSince);
        if (verbal && (onCat || beforeCat)) {
          if (tk.v === 'inv') { if (onCat) current.site = place; else pendingSite = place; }
          break;
        }
        statuses[tk.k] = base;
        break;
      }
      case 'eye': eye = tk.eye; actions.push({ op: 'eye', eye: tk.eye }); break;
      case 'pvr': pvrSpec = tk; break;
      case 'cmd':
        if (tk.c === 'remove') removeMode = true;
        else if (tk.c === 'lincoff') lincoff = true;
        else if (tk.c === 'lincoffoff') lincoff = false;
        else if (tk.c === 'eyeflip') actions.push({ op: 'eye', eye: 'flip' });
        else cmds.push(tk.c);
        break;
      case 'meta':
        if (removeMode) { metas[tk.k] = null; break; }   // “remove the PVD” clears the status as well as the drawing
        // a specific statement (complete / partial / none) is not overridden by a bare “PVD” in the same breath
        if (!(tk.k === 'pvd' && tk.v === 'yes' && metas.pvd && metas.pvd !== 'yes')) metas[tk.k] = tk.v;
        break;
      case 'neg': negActive = true; negAnd = false; negConsumed = false; break;
      case 'tum': {
        // size, thickness, distance, elevation, shape, orange pigment, drusen, SRF: they describe the tumour just
        // named (“naevus 2 DD, flat, with drusen, no SRF”) or the one about to be named (“a flat 3 mm naevus”)
        let v = tk.v;
        if (negActive && (tk.k === 'op' || tk.k === 'dru' || tk.k === 'srf')) { v = 'no'; negConsumed = true; }
        else if (negActive && tk.k === 'elev') { v = 'flat'; negConsumed = true; }
        let nx = null;
        for (let j = i + 1; j < toks.length; j++) { const t = toks[j]; if (t.t === 'tum' || t.t === 'm' || t.t === 'count' || t.t === 'neg' || (t.t === 'sep' && t.w === 'or') || (t.t === 'word' && STOP.has(t.w))) continue; nx = t; break; }
        const nextTum = nx && nx.t === 'f' && nx.f === 'cat' && isTumor(CATALOG[nx.ix]);
        if (nextTum && (sepSince || !isTumMention(current))) { pendingTum = pendingTum || {}; setTum(pendingTum, tk.k, v); }
        else if (isTumMention(current) && (!sepSince || [',', 'with', 'and', 'or'].includes(lastSep))) { current.tum = current.tum || {}; setTum(current.tum, tk.k, v); }
        break;
      }
      case 'sep': sepSince = true; lastSep = tk.w; if (tk.w === ',') clause++; if (tk.w === 'and' && negActive) negAnd = true; if (tk.w !== 'and' && tk.w !== 'or') negActive = false; if (tk.w === 'plus' || tk.w === 'also') removeMode = false; break;
      case 'word':
        if (ADD_WORDS.has(tk.w)) removeMode = false;
        if (!STOP.has(tk.w) && !ADD_WORDS.has(tk.w) && !/^\d+$/.test(tk.w) && tk.w.length > 1) unknown.push(tk.w);
        break;
    }
  });

  // leftover modifiers with no finding modify the existing detachment
  const looseMods = new Set(pendingMods);
  if (pendingPos.length && !mentions.length) {
    // bare clock positions with a status, e.g. "10 to 2 macula off" → detachment
    if (Object.keys(statuses).length || looseMods.has('bullous') || looseMods.has('shallow') || exts.length) {
      mentions.push({ kind: 'rd', pos: pendingPos, mods: looseMods, remove: false });
    } else {
      for (const p of pendingPos) unknown.push(p.kind === 'rng' ? `${p.a}-${p.b}` : p.kind === 'hr' ? String(p.h) : QUAD_NAMES[p.q]);
    }
  } else if (pendingPos.length && mentions.length) {
    const last = mentions[mentions.length - 1];
    if (!(last.kind === 'rd' && last.pos.length)) last.pos.push(...pendingPos);
  }

  for (const c of cmds) actions.push({ op: c });
  const warnings = [];
  let addedRd = false;

  // a named finding from the catalogue: keep what was said (hour, range, quadrant, site);
  // catPlace() turns it into chart geometry with the entry's typical location as the default
  const buildCat = (mn) => {
    let E = mn.entry;
    const mods = mn.mods;
    // an unqualified “hemorrhage” takes its meaning from where it is
    if (E.id === 'intraretinal_hemorrhage_dot_blot' && (mn.site === 'disc' || mn.site === 'ppa') && CAT.optic_disc_hemorrhage) E = CAT.optic_disc_hemorrhage;
    if (E.id === 'intraretinal_hemorrhage_dot_blot' && mn.site === 'vitreous') {
      const p = mn.pos[0];
      actions.push({ op: 'add', f: { type: 'vh', hour: p ? posCenter(p, eye) : 6, located: !!p, density: mods.has('dense') ? 'dense' : mods.has('mild') ? 'mild' : 'moderate' } });
      return;
    }
    const base = { type: 'cat', key: E.id };
    let site = mn.site || null;
    if (!site && mods.has('ora')) site = 'ora';
    if (!site && mods.has('post') && !POSTERIOR_SITES.has(E.site)) site = 'mid';
    if (site) base.site = site;
    if (mn.arc) base.arc = mn.arc;
    if (mods.has('small')) base.size = 0.72; else if (mods.has('large')) base.size = 1.45;
    if (mn.count) base.count = mn.count; else if (mods.has('multi')) base.multi = true;
    if (mods.has('dense')) base.density = 'dense'; else if (mods.has('mild')) base.density = 'mild';
    if (mods.has('enc') && !mn.pos.length) { base.start = 12; base.end = 12; base.full = true; }
    if (mn.tum && isTumor(E)) for (const k of TUM_KEYS) if (mn.tum[k] != null) base[k] = clone(mn.tum[k]);
    if (!mn.pos.length) { actions.push({ op: 'add', f: base }); return; }
    for (const p of mn.pos) {
      const f = clone(base);
      if (p.kind === 'rng') { const r = orient({ s: p.a, e: p.b }, mn.quadHint, eye); f.start = normHour(r.s); f.end = normHour(r.e); }
      else if (p.kind === 'hr') f.hour = normHour(p.h);
      else { const q = quadrant(p.q, eye); if (!q) continue; f.quad = p.q; f.hour = q.c; f.start = q.s; f.end = q.e; }
      actions.push({ op: 'add', f });
    }
  };
  const build = (mn) => {
    const kind = mn.kind;
    if (mn.remove) {
      const key = mn.entry ? mn.entry.id : undefined;
      if (!mn.pos.length) actions.push({ op: 'remove', type: kind, key });
      for (const p of mn.pos) actions.push({ op: 'remove', type: kind, key, hour: posCenter(p, eye) });
      return;
    }
    if (mn.negated && !(mn.negAnd && mn.pos.length)) { negated.push(mn.entry ? catName(mn.entry).toLowerCase() : (LABEL[kind] || kind).toLowerCase()); return; }
    if (kind === 'auto') { warnings.push('The black scalloped ora is drawn automatically next to detached retina.'); return; }
    if (kind === 'lattear') {
      // lattice with a tractional tear at its margin: both are drawn, so the tear counts as a break
      const ps = mn.pos.length ? mn.pos : [];
      if (!ps.length) { warnings.push('Say where the lattice is, for example “lattice with a tear at 2”.'); return; }
      for (const p of ps) {
        const r = p.kind === 'rng' ? orient(posRange(p, eye), mn.quadHint, eye) : p.kind === 'q' ? (() => { const c = posCenter(p, eye); return { s: c - 0.75, e: c + 0.75 }; })() : { s: p.h - 0.5, e: p.h + 0.5 };
        actions.push({ op: 'add', f: { type: 'lat', start: normHour(r.s), end: normHour(r.e) } });
        actions.push({ op: 'add', f: { type: 'hst', hour: p.kind === 'hr' ? normHour(p.h) : normHour(r.e - 0.2) } });
      }
      return;
    }
    if (kind === 'rolled') { actions.push({ op: 'rdmod', rolled: true }); return; }
    if (kind === 'funnel') {
      const rdA = actions.find(a => a.op === 'add' && a.f.type === 'rd');
      if (rdA) Object.assign(rdA.f, { total: true, start: 12, end: 12 });
      else actions.push({ op: 'add', f: { type: 'rd', total: true, start: 12, end: 12, depth: 'normal' } });
      if (!actions.some(a => a.op === 'add' && a.f.type === 'pvr')) actions.push({ op: 'add', f: { type: 'pvr', grade: 'C', loc: 'P', extent: 12 } });
      addedRd = true;
      return;
    }
    if (kind === 'cat') { buildCat(mn); return; }
    const mods = mn.mods;
    const sizeOf = () => mods.has('small') ? 0.72 : mods.has('large') ? 1.45 : 1;
    const radialOf = () => mods.has('ora') ? 'ora' : mods.has('post') ? 'post' : mods.has('ant') ? 'ora' : null;

    if (kind === 'rd') {
      const f = { type: 'rd', depth: mods.has('bullous') ? 'bullous' : mods.has('shallow') ? 'shallow' : 'normal', chronic: mods.has('chronic') || undefined };
      if (mods.has('exud')) f.cause = 'exudative';
      if (exts.length) f.extent = exts[exts.length - 1];
      const p = mn.pos[0];
      if (mods.has('total') && !mods.has('subtotal') && !p) { f.total = true; f.start = 12; f.end = 12; }
      else if (p) {
        let r = posRange(p, eye, 'rd');
        if (p.kind === 'rng') r = orient(r, mn.quadHint, eye);
        if (p.spare || mn.spare) r = { s: r.e, e: r.s };
        if (!r) return;
        f.start = normHour(r.s); f.end = normHour(r.e);
        if (mods.has('total') && !mods.has('subtotal')) { /* "total except ..." handled by spare */ }
      } else {
        // no position: treat as a change to the existing detachment
        const mod = {};
        if (mods.has('bullous')) mod.depth = 'bullous';
        if (mods.has('shallow')) mod.depth = 'shallow';
        if (mods.has('chronic')) mod.chronic = true;
        if (exts.length) mod.extent = exts[exts.length - 1];
        if (mn.extra && mn.extra.cause) mod.cause = mn.extra.cause;
        if (mods.has('exud')) mod.cause = 'exudative';
        if (Object.keys(mod).length) actions.push({ op: 'rdmod', ...mod });
        else if (!Object.keys(statuses).length) warnings.push('Say where the detachment is, for example “from 10 to 2”.');
        return;
      }
      if (!f.chronic) delete f.chronic;
      actions.push({ op: 'add', f });
      addedRd = true;
      return;
    }

    if (kind === 'dem') { actions.push({ op: 'rdmod', chronic: true }); return; }

    if (kind === 'pvr' || kind === 'star') {
      const grade = pvrSpec ? pvrSpec.grade : 'C';
      const f = { type: 'pvr', grade };
      if (grade === 'C') f.loc = pvrSpec && pvrSpec.loc ? pvrSpec.loc : (mods.has('ant') || mods.has('ora') ? 'A' : 'P');
      const hours = [];
      for (const p of mn.pos) {
        if (p.kind === 'rng') { const r = posRange(p, eye); const n = Math.max(1, Math.round(spanHours(r.s, r.e))); for (let k = 0; k < n; k++) hours.push(normHour(r.s + (k + 0.5) * spanHours(r.s, r.e) / n)); }
        else hours.push(posCenter(p, eye));
      }
      if (hours.length) f.hours = hours;
      if (pvrSpec && pvrSpec.hours) f.extent = pvrSpec.hours;
      else if (chExtent) f.extent = chExtent;
      if (mn.count) f.count = mn.count;
      actions.push({ op: 'add', f });
      return;
    }

    if (kind === 'laser' || kind === 'cryo') {
      if (!mn.pos.length && mn.extra && mn.extra.full) { actions.push({ op: 'add', f: { type: kind, start: 12, end: 12, full: true } }); return; }
      if (!mn.pos.length) { actions.push({ op: 'add', f: { type: kind, around: 'breaks' } }); return; }
      for (const p of mn.pos) {
        if (p.kind === 'rng') { const r = posRange(p, eye); actions.push({ op: 'add', f: { type: kind, start: normHour(r.s), end: normHour(r.e) } }); }
        else actions.push({ op: 'add', f: { type: kind, hour: posCenter(p, eye) } });
      }
      return;
    }

    if (kind === 'vh') {
      const p = mn.pos[0];
      const vf = { type: 'vh', hour: p ? posCenter(p, eye) : 6, located: !!p, density: mods.has('dense') ? 'dense' : mods.has('mild') ? 'mild' : 'moderate' };
      if (mods.has('fresh')) vf.fresh = true;
      actions.push({ op: 'add', f: vf });
      return;
    }

    if (kind === 'buckle') {
      const p = mn.pos.find(x => x.kind === 'rng' || x.kind === 'q');
      if (mods.has('enc') || !mn.pos.length || (mn.extra && mn.extra.encircling)) actions.push({ op: 'add', f: { type: 'buckle', encircling: true } });
      else if (p) { const r = orient(posRange(p, eye), mn.quadHint, eye); actions.push({ op: 'add', f: { type: 'buckle', start: normHour(r.s), end: normHour(r.e) } }); }
      else { const c = posCenter(mn.pos[0], eye); actions.push({ op: 'add', f: { type: 'buckle', start: normHour(c - 1), end: normHour(c + 1) } }); }
      return;
    }

    if (kind === 'chd') {
      const p = mn.pos[0];
      if (!p) actions.push({ op: 'add', f: { type: 'chd', total: true, start: 12, end: 12 } });
      else { const r = orient(posRange(p, eye, 'rd'), mn.quadHint, eye); actions.push({ op: 'add', f: { type: 'chd', start: normHour(r.s), end: normHour(r.e) } }); }
      return;
    }

    if (kind === 'grt' || kind === 'dia') {
      for (const p of mn.pos.length ? mn.pos : [null]) {
        if (!p) { warnings.push(`Say where the ${kind === 'grt' ? 'giant tear' : 'dialysis'} is, for example “from 10 to 2”.`); return; }
        let r;
        if (p.kind === 'rng' || p.kind === 'q') r = orient(posRange(p, eye), mn.quadHint, eye);
        else { const c = posCenter(p, eye); const half = kind === 'grt' ? 1.5 : 0.75; r = { s: c - half, e: c + half }; }
        actions.push({ op: 'add', f: { type: kind, start: normHour(r.s), end: normHour(r.e) } });
      }
      return;
    }

    if (kind === 'lat') {
      let lpos = mn.pos;
      if (!lpos.length && mn.borrow && mn.borrow.pos.length) lpos = mn.borrow.pos.map(p => p.kind === 'hr' ? { kind: 'rng', a: normHour(p.h - 0.6), b: normHour(p.h + 0.6) } : p);
      if (!lpos.length) { warnings.push('Say where the lattice is, for example “lattice from 7 to 9”.'); return; }
      for (const p of lpos) {
        let r;
        if (p.kind === 'rng') r = orient(posRange(p, eye), mn.quadHint, eye);
        else if (p.kind === 'q') { const c = posCenter(p, eye); r = { s: c - 0.75, e: c + 0.75 }; }
        else r = { s: p.h - 0.5, e: p.h + 0.5 };
        const f = { type: 'lat', start: normHour(r.s), end: normHour(r.e) };
        if (mods.has('pig')) f.pigmented = true;
        if (mods.has('holes')) f.holes = true;
        if (radialOf() === 'post') f.radial = 'post';
        actions.push({ op: 'add', f });
      }
      return;
    }

    if (POINT_KINDS.has(kind)) {
      if (!mn.pos.length) {
        if (kind === 'hst' && mods.has('rolled')) { actions.push({ op: 'rdmod', rolled: true }); return; }
        const lastLat = [...actions].reverse().find(a => a.op === 'add' && a.f.type === 'lat');
        if (lastLat && (kind === 'hole' || kind === 'hst' || kind === 'oph')) { if (kind === 'hst') lastLat.f.tear = true; else lastLat.f.holes = true; return; }
        warnings.push(`Say where the ${LABEL[kind].toLowerCase()} is, for example “at 12”.`);
        return;
      }
      const hours = [];
      for (const p of mn.pos) {
        if (p.kind === 'rng') {
          const span = spanHours(p.a, p.b);
          if (kind === 'hst' && span >= 3 && !mn.plural) { actions.push({ op: 'add', f: { type: 'grt', start: normHour(p.a), end: normHour(p.b) } }); return; }
          if (mn.plural || mn.count || span >= 1.5) { const n = mn.count || Math.max(2, Math.round(span) + 1); for (let k = 0; k < n; k++) hours.push(normHour(p.a + span * k / (n - 1))); }
          else hours.push(normHour(p.a + span / 2));
        } else hours.push(posCenter(p, eye));
      }
      if (mn.count && hours.length === 1 && mn.count > 1) {
        const c = hours.pop();
        for (let k = 0; k < mn.count; k++) hours.push(normHour(c + (k - (mn.count - 1) / 2) * 0.6));
      }
      for (const h of hours) {
        const f = { type: kind === 'star' ? 'pvr' : kind, hour: h };
        if (kind !== 'star') { const s = sizeOf(); if (s !== 1) f.size = s; const rad = radialOf(); if (rad) f.radial = rad; }
        if (kind === 'hst' && mods.has('rolled')) f.rolled = true;
        if (kind === 'star') { f.grade = 'C'; f.hours = [h]; delete f.hour; }
        actions.push({ op: 'add', f });
      }
      return;
    }
    };
  for (const mn of mentions) {
    const n0 = actions.length;
    build(mn);
    if (mn.extra) for (let i = n0; i < actions.length; i++) if (actions[i].op === 'add' && actions[i].f.type === mn.kind) Object.assign(actions[i].f, mn.extra);
  }

  // macular status
  if (statuses.mac || statuses.fov) actions.push({ op: 'status', macula: statuses.mac || null, fovea: statuses.fov || null });

  // modifiers / extent said on their own ("make it bullous", "extends to the arcade")
  if (!addedRd) {
    const mod = {};
    if (looseMods.has('bullous')) mod.depth = 'bullous';
    if (looseMods.has('shallow')) mod.depth = 'shallow';
    if (looseMods.has('chronic')) mod.chronic = true;
    if (looseMods.has('total') && !mentions.length) mod.total = true;
    if (exts.length) mod.extent = exts[exts.length - 1];
    if (Object.keys(mod).length) actions.push({ op: 'rdmod', ...mod });
  }

  // "remove the last one", "delete it"
  if (removeMode && !mentions.some(m => m.remove)) actions.push({ op: 'remove', last: true });
  if (lincoff !== null) actions.push({ op: 'lincoff', on: lincoff });
  if (Object.keys(metas).length) actions.push({ op: 'meta', ...metas });

  const all = pre.concat(actions);
  const info = negated.length ? [`Not drawn — stated as absent: ${listJoin([...new Set(negated)])}.`] : [];
  return { actions: all, warnings, unknown, norm, info, chips: all.map(a => describeAction(a, eye)).filter(Boolean) };
}

function posCenter(p, eye) {
  if (p.kind === 'hr') return normHour(p.h);
  if (p.kind === 'rng') return midHour(p.a, p.b);
  const q = quadrant(p.q, eye);
  return q ? q.c : 12;
}
function orient(r, hint, eye) {
  if (!hint || !r) return r;
  const q = quadrant(hint, eye);
  if (!q) return r;
  const a = midHour(r.s, r.e), b = midHour(r.e, r.s);
  return hourDist(b, q.c) < hourDist(a, q.c) ? { s: r.e, e: r.s } : r;
}
function posRange(p, eye, forWhat) {
  if (p.kind === 'rng') return { s: p.a, e: p.b };
  if (p.kind === 'q') { const q = quadrant(p.q, eye); return { s: q.s, e: q.e }; }
  return forWhat === 'rd' ? { s: p.h - 1, e: p.h + 1 } : { s: p.h - 0.5, e: p.h + 0.5 };
}

/* ------------------------------------------------------------------ *
 * Catalogue findings: where they sit on the chart and how they read
 * ------------------------------------------------------------------ */
const POSTERIOR_SITES = new Set(['fovea', 'parafovea', 'macula', 'pole', 'arcade', 'disc', 'ppa', 'pmb']);
const SITE_R = { fovea: 0, parafovea: 13, macula: 17, pole: 60, arcade: 80, mid: 160, equator: G.R_EQ, periphery: 254, ora: 287, pars_plana: 320, vitreous: 150 };
const SITE_TEXT = { fovea: 'at the fovea', parafovea: 'parafoveal', macula: 'in the macula', pole: 'in the posterior pole', arcade: 'along the arcade', disc: 'on the optic disc', ppa: 'peripapillary', pmb: 'between the disc and fovea', mid: 'in the mid-periphery', equator: 'at the equator', periphery: 'in the periphery', ora: 'at the ora serrata', pars_plana: 'at the pars plana', vitreous: 'in the vitreous' };
const SITE_SHORT = { fovea: 'fovea', parafovea: 'parafovea', macula: 'macula', pole: 'posterior pole', arcade: 'arcade', disc: 'disc', ppa: 'peripapillary', pmb: 'papillomacular', mid: 'mid-periphery', equator: 'equator', periphery: 'periphery', ora: 'ora', pars_plana: 'pars plana', vitreous: 'vitreous' };
const SITES = Object.keys(SITE_TEXT);
const QUAD_RECIPES = new Set(['sector_region', 'vo', 'ao', 'prp', 'spicules']);
const DISC_RECIPES = new Set(['discedema', 'pallor', 'cupping', 'dischem', 'pit', 'discoloboma', 'morningglory', 'discdrusen', 'tilted', 'hypoplasia', 'melanocytoma', 'frond', 'weiss']);
function catName(E) {
  if (!E) return 'Finding';
  const n = E.name.replace(/\s*\([^)]*\)/g, '').trim();
  const m = /^(.*?)\s+[–-]\s+(flat|elevated)$/i.exec(n);
  return m ? cap(m[2].toLowerCase()) + ' ' + m[1].charAt(0).toLowerCase() + m[1].slice(1) : n;
}

/* ------------------------------------------------------------------ *
 * Tumours and naevi: basal size (DD or mm), thickness, elevation and shape, orange pigment, drusen,
 * subretinal fluid, and distance from the disc or fovea. A measured lesion is drawn to scale against
 * the disc (1 DD = the disc's diameter on the chart; 1 DD ≈ 1.5 mm when only mm are given).
 * ------------------------------------------------------------------ */
const DD_UNITS = 2 * G.DISC_R;
const MM_PER_DD = 1.5;
const MELANOCYTIC = new Set(['choroidal_nevus', 'choroidal_melanoma', 'amelanotic_choroidal_melanoma']);
const TUM_KEYS = ['base', 'bu', 'th', 'elev', 'shape', 'op', 'dru', 'srf', 'dist', 'du'];
const ELEV_TEXT = { flat: 'flat', min: 'minimally elevated', elev: 'elevated', mod: 'moderately elevated', marked: 'markedly elevated' };
const SHAPE_TEXT = { dome: 'dome-shaped', mush: 'mushroom-shaped' };
const SRF_TEXT = { no: 'no subretinal fluid', trace: 'trace subretinal fluid', yes: 'subretinal fluid', ext: 'extensive subretinal fluid' };
const SRF_SHORT = { no: 'no SRF', trace: 'trace SRF', yes: 'SRF', ext: 'extensive SRF' };
function isTumor(E) { return !!E && E.group === 'tumors_pigment' && (E.r === 'patch' || E.r === 'dome'); }
function toDD(v, u) { return u === 'mm' ? v / MM_PER_DD : v; }
function fmtNum(n) { return String(Math.round(n * 100) / 100); }
function tumorSize(f, short) {
  if (!Array.isArray(f.base) || !f.base.length) return '';
  return f.base.map(fmtNum).join(short ? '×' : ' × ') + ' ' + (f.bu === 'mm' ? 'mm' : 'DD');
}
/* the lesion's half-axes on the chart: measured, or the catalogue's typical size */
function tumorRadii(f, E, post, k) {
  if (Array.isArray(f.base) && f.base.length) {
    const c = (v) => Math.max(0.1, Math.min(16, toDD(v, f.bu)));
    const h = c(f.base[0]), v = c(f.base[1] != null ? f.base[1] : f.base[0]);
    return { rx: h * DD_UNITS / 2, ry: v * DD_UNITS / 2, rot: 0, measured: true };
  }
  const dome = E.r === 'dome', r = (dome ? (post ? 9 : 17) : (post ? 7 : 13)) * k;
  return { rx: r, ry: r * (dome ? 0.86 : 0.78), rot: null, measured: false };
}
/* distance from an ellipse's centre to its edge in direction a */
function ellipseR(rx, ry, a) { const c = Math.cos(a), s = Math.sin(a); return (rx * ry) / Math.sqrt((ry * c) ** 2 + (rx * s) ** 2) || rx; }
/* 0 flat … 3 markedly elevated: how strongly the chart shades the lesion */
function tumorLevel(f, E) {
  if (f.shape === 'mush') return 3;
  const w = { flat: 0, min: 1, elev: 2, mod: 2, marked: 3 }[f.elev];
  if (w != null) return f.shape === 'dome' ? Math.max(w, 1.5) : w;
  if (f.shape === 'dome') return 2;
  if (typeof f.th === 'number') return f.th < 0.8 ? 0.4 : f.th < 2 ? 1 : f.th < 4 ? 2 : 3;
  return E && E.r === 'dome' ? 2 : 0;
}
/* the described features in order, for the note (long) or the findings list (short) */
function tumorFeatures(f, short) {
  const out = [];
  if (typeof f.th === 'number') out.push(short ? fmtNum(f.th) + ' mm thick' : fmtNum(f.th) + ' mm thick');
  const el = [f.elev ? ELEV_TEXT[f.elev] : null, f.shape ? SHAPE_TEXT[f.shape] : null].filter(Boolean);
  if (el.length) out.push(el.join(', '));
  if (f.dru) out.push(f.dru === 'yes' ? (short ? 'drusen' : 'overlying drusen') : 'no drusen');
  if (f.op) out.push(f.op === 'yes' ? (short ? 'orange pigment' : 'orange pigment') : 'no orange pigment');
  if (f.srf) out.push(short ? SRF_SHORT[f.srf] : SRF_TEXT[f.srf]);
  return out;
}
/* tumour fields from untrusted input (review links, AI actions) */
function cleanTumor(f, g) {
  const n = (v, lo, hi) => (typeof v === 'number' && isFinite(v) && v >= lo && v <= hi) ? Math.round(v * 100) / 100 : null;
  if (Array.isArray(f.base)) { const b = f.base.slice(0, 2).map(v => n(v, 0.05, 40)); if (b.length && b.every(v => v != null)) g.base = b; }
  if (f.bu === 'mm' || f.bu === 'dd') g.bu = f.bu;
  const th = n(f.th, 0.05, 30); if (th != null) g.th = th;
  const d = n(f.dist, 0, 40); if (d != null) g.dist = d;
  if (f.du === 'mm' || f.du === 'dd') g.du = f.du;
  if (Object.prototype.hasOwnProperty.call(ELEV_TEXT, f.elev)) g.elev = f.elev;
  if (Object.prototype.hasOwnProperty.call(SHAPE_TEXT, f.shape)) g.shape = f.shape;
  for (const k of ['op', 'dru']) if (f[k] === 'yes' || f[k] === 'no') g[k] = f[k];
  if (Object.prototype.hasOwnProperty.call(SRF_TEXT, f.srf)) g.srf = f.srf;
  return g;
}

/* resolve a catalogue finding to chart geometry: site, clock direction, optional span, anchor point */
function catPlace(f, eye) {
  const E = CAT[f.key];
  if (!E) return null;
  const said = f.hour != null || f.start != null;
  const site = f.site || E.site || (said ? 'mid' : 'pole');
  const post = POSTERIOR_SITES.has(site);
  const dc = discCenter(eye), T = temporalHour(eye);
  const rng = mulberry32(((f.seed || f.id || 7) * 7919) >>> 0);
  const dq = E.dq && E.dq !== 'all' ? quadrant(E.dq, eye) : null;
  let h = f.hour != null ? f.hour : f.start != null ? midHour(f.start, f.end) : null;
  if (h == null && site === 'arcade' && f.arc) h = f.arc === 's' ? (T === 3 ? 1.5 : 10.5) : (T === 3 ? 4.5 : 7.5);
  if (h == null && dq) h = dq.c;
  // a whole quadrant is used only by findings that occupy one (vein occlusions, sector lesions …);
  // bands and clusters said “superotemporally” sit across the middle 1½ clock hours of it
  let span = null;
  const wide = QUAD_RECIPES.has(E.r);
  if (f.quad === 'all' || f.full) span = { s: 12, e: 12 };
  else if (f.start != null && f.quad && !wide) span = { s: normHour(f.hour - 0.75), e: normHour(f.hour + 0.75) };
  else if (f.start != null) span = { s: f.start, e: f.end };
  else if (!said && E.dq === 'all') span = { s: 12, e: 12 };
  else if (!said && dq && wide) span = { s: dq.s, e: dq.e };
  if (span) span.full = !!f.full || spanHours(span.s, span.e) >= 12;
  let x = 0, y = 0;
  const towards = (cx, cy, hh, r) => { const a = hourToAngle(hh); return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  switch (site) {
    case 'disc': [x, y] = DISC_RECIPES.has(E.r) || h == null ? dc : towards(dc[0], dc[1], h, G.DISC_R + 13); break;
    case 'ppa': [x, y] = towards(dc[0], dc[1], h != null ? h : T, G.DISC_R + 9); break;
    case 'pmb': [x, y] = h != null && said ? towards(dc[0] * 0.5, 0, h, 8) : [dc[0] * 0.5, 0]; break;
    case 'fovea': if (h != null && said) [x, y] = towards(0, 0, h, 7); break;
    case 'parafovea': [x, y] = towards(0, 0, h != null ? h : T, SITE_R.parafovea); break;
    case 'macula': if (h != null && said) [x, y] = towards(0, 0, h, SITE_R.macula); break;
    case 'vitreous': if (h != null) [x, y] = towards(0, 0, h, SITE_R.vitreous); else y = 30; break;
    default:
      if (h == null) h = post ? (rng() < 0.5 ? (T === 3 ? 1.5 : 10.5) : (T === 3 ? 4.5 : 7.5)) : [1, 2, 4, 5, 7, 8, 10, 11][Math.floor(rng() * 8)];
      // keep a default position off the vortex ampullae drawn at the oblique meridians
      if (!said && (site === 'equator' || site === 'mid') && Math.abs(mod(h, 3) - 1.5) < 0.2) h = normHour(h + 0.45);
      [x, y] = towards(0, 0, h, SITE_R[site] || 160);
  }
  const k = (E.k || 1) * (f.size || 1);
  let tum = null;
  if (isTumor(E)) {
    tum = tumorRadii(f, E, post, k);
    // “2 DD superotemporal to the disc”: margin to margin, along the stated direction (temporal if none)
    const ref = (site === 'disc' || site === 'ppa') ? { c: dc, r: G.DISC_R } : (site === 'fovea' || site === 'parafovea' || site === 'macula') ? { c: [0, 0], r: 0 } : null;
    if (ref && !Array.isArray(f.at) && (f.dist != null || (h != null && said))) {
      const a = hourToAngle(h != null ? h : T);
      // no distance given: “inferotemporal to the fovea” keeps the lesion just clear of the fovea (or disc)
      const gap = f.dist != null ? toDD(f.dist, f.du) * DD_UNITS : DD_UNITS * (ref.r ? 0.2 : 0.25);
      const d = ref.r + gap + ellipseR(tum.rx, tum.ry, a);
      x = ref.c[0] + Math.cos(a) * d; y = ref.c[1] + Math.sin(a) * d;
    }
  }
  // dropped by hand at an exact spot (span and disc recipes keep their anatomical anchor)
  if (Array.isArray(f.at) && (!span || tum) && !(site === 'disc' && DISC_RECIPES.has(E.r))) { x = f.at[0]; y = f.at[1]; }
  if (tum && tum.rot == null) tum.rot = Math.atan2(y, x || 1e-6);
  return { E, site, post, h, span, x, y, said, k, auto: !said && !f.site, tum };
}
/* which named site a point on the chart falls in (for findings dropped by hand) */
function siteAt(p, eye) {
  const r = Math.hypot(p[0], p[1]);
  const dd = dist2(p, discCenter(eye));
  if (dd <= G.DISC_R + 2) return 'disc';
  if (dd <= G.DISC_R + 16) return 'ppa';
  if (r <= G.R_FOV + 3) return 'fovea';
  if (r <= 22) return 'parafovea';
  if (r <= G.R_MAC + 4) return 'macula';
  if (r <= 110) return 'pole';
  if (r <= G.R_EQ - 25) return 'mid';
  if (r <= G.R_EQ + 20) return 'equator';
  if (r <= G.R_ORA - 8) return 'periphery';
  if (r <= G.R_ORA + 6) return 'ora';
  return 'pars_plana';
}
function catLocText(f, eye, short) {
  const P = catPlace(f, eye);
  if (!P) return '';
  const parts = [];
  if (P.tum && f.dist != null && !Array.isArray(f.at) && ['disc', 'ppa', 'fovea', 'parafovea', 'macula'].includes(P.site)) {
    const d = `${fmtNum(f.dist)} ${f.du === 'mm' ? 'mm' : 'DD'}`;
    const toDisc = P.site === 'disc' || P.site === 'ppa';
    const q = f.quad && f.quad !== 'all' ? QUAD_NAMES[f.quad] : f.hour != null ? null : null;
    if (short) return [q, `${d} from ${toDisc ? 'disc' : 'fovea'}`].filter(Boolean).join(' · ');
    return q ? `${d} ${q} to the ${toDisc ? 'optic disc' : 'fovea'}` : f.hour != null ? `${d} from the ${toDisc ? 'optic disc' : 'fovea'} toward ${fmtHour(f.hour)} o’clock` : `${d} from the ${toDisc ? 'optic disc' : 'fovea'}`;
  }
  // “temporal to the fovea”, “superotemporal to the optic disc”, “in the inferior macula”
  const rel = { fovea: 'the fovea', parafovea: 'the fovea', disc: 'the optic disc', ppa: 'the optic disc' }[P.site];
  if (f.quad && f.quad !== 'all' && (rel || P.site === 'macula') && !DISC_RECIPES.has(P.E.r)) {
    const q = QUAD_NAMES[f.quad];
    return short ? `${q} · ${SITE_SHORT[P.site]}` + (f.count > 1 ? ' · ×' + f.count : '') : (rel ? `${q} to ${rel}` : `in the ${q} macula`);
  }
  if (f.quad === 'all') parts.push(short ? 'all quadrants' : P.post ? 'in all four quadrants of the' : 'in all four quadrants');
  else if (f.quad) parts.push(QUAD_NAMES[f.quad]);
  else if (f.start != null) parts.push(P.span && P.span.full ? '360°' : `${fmtHour(f.start)}–${fmtHour(f.end)}${short ? '' : ' o’clock'}`);
  else if (f.hour != null) parts.push(P.site === 'disc' ? (short ? `${fmtHour(f.hour)} on the disc` : `at the ${fmtHour(f.hour)} o’clock disc margin`) : short ? fmtHour(f.hour) : `at ${fmtHour(f.hour)} o’clock`);
  else if (P.E.dq) parts.push(P.E.dq === 'all' ? '360°' : QUAD_NAMES[P.E.dq]);
  if (f.quad === 'all' && P.post && !short) parts.push(SITE_SHORT[P.site]);
  else if (P.site === 'disc' && DISC_RECIPES.has(P.E.r) && !f.site && (f.hour == null || f.quad || f.start != null) && !short) { /* the name says where */ }
  else if (P.site === 'disc' && f.hour != null && !f.quad && f.start == null && DISC_RECIPES.has(P.E.r)) { /* already said */ }
  else if ((P.site === 'disc' || P.site === 'ppa') && f.quad && !DISC_RECIPES.has(P.E.r)) parts.push(short ? 'by the disc' : 'to the optic disc');
  else if (P.site === 'arcade' && f.arc) parts.push(short ? (f.arc === 's' ? 'superior arcade' : 'inferior arcade') : `along the ${f.arc === 's' ? 'superior' : 'inferior'} arcade`);
  else parts.push(short ? SITE_SHORT[P.site] : SITE_TEXT[P.site]);
  if (f.count > 1 && short) parts.push('×' + f.count);
  return parts.filter(Boolean).join(short ? ' · ' : ' ');
}

/* buckle elements the chart can name (see buckle.js for the full guide) */
const BUCKLE_EL = { '240': '240 band', '41': '41 band', '42': '42 band', '40': '40 band', '287': '287 tire', '287WG': '287WG tire', '277': '277 tire', '276': '276 tire', '279': '279 tire',
  '506': '506 sponge', '510': '510 half-sponge', '511': '511 half-sponge', '519G': '519G grooved sponge', '507': '507 sponge', '505': '505 round sponge' };
const LABEL = {
  cat: 'Finding', rd: 'Retinal detachment', hst: 'Horseshoe tear', grt: 'Giant retinal tear', dia: 'Retinal dialysis', oph: 'Operculated hole',
  hole: 'Atrophic hole', lat: 'Lattice degeneration', pav: 'Paving-stone degeneration', tuft: 'Retinal tuft', pvr: 'PVR',
  laser: 'Laser retinopexy', cryo: 'Cryopexy', vh: 'Vitreous hemorrhage', buckle: 'Scleral buckle', chd: 'Choroidal detachment',
};

/* vitreous and lens status, used by the repair-options card and the note */
const PVD_TEXT = { complete: 'Complete PVD', partial: 'Partial PVD', yes: 'PVD present', none: 'No PVD (vitreous attached)' };
const LENS_TEXT = { phakic: 'Phakic', pseudo: 'Pseudophakic', aphakic: 'Aphakic' };

function macText(m, f) {
  if (f === 'split') return 'fovea splitting';
  if (f === 'thr') return 'macula partly involved, fovea on but threatened';
  if (m === 'off' && f === 'on') return 'macula off, fovea on';
  if (m === 'off' || f === 'off') return 'macula off';
  if (m === 'thr') return 'macula threatened';
  if (m === 'on' || f === 'on') return 'macula on';
  return null;
}

function describeAction(a, eye) {
  switch (a.op) {
    case 'eye': return a.eye === 'flip' ? { k: 'cmd', t: 'Switch eye' } : { k: 'eye', t: a.eye === 'OD' ? 'Right eye · OD' : 'Left eye · OS' };
    case 'undo': return { k: 'cmd', t: 'Undo' };
    case 'redo': return { k: 'cmd', t: 'Redo' };
    case 'clear': return { k: 'cmd', t: 'Clear chart' };
    case 'lincoff': return { k: 'cmd', t: a.on ? 'Show Lincoff zone' : 'Hide Lincoff zone' };
    case 'status': return { k: 'status', t: cap(macText(a.macula, a.fovea) || 'macular status') };
    case 'rdmod': {
      const p = [];
      if (a.depth) p.push(a.depth);
      if (a.chronic) p.push('chronic · demarcation line');
      if (a.extent) p.push('to ' + EXT_TEXT[a.extent]);
      if (a.total) p.push('total');
      if (a.rolled) p.push('rolled tear edges');
      if (a.cause) p.push(CAUSE_TEXT[a.cause] || a.cause);
      return { k: 'mod', t: 'Detachment: ' + p.join(', ') };
    }
    case 'remove': return { k: 'remove', t: a.last ? 'Remove last item' : 'Remove ' + (a.key ? catName(CAT[a.key]) : (LABEL[a.type] || 'item')).toLowerCase() + (a.hour ? ' at ' + fmtHour(a.hour) : '') };
    case 'move': return { k: 'cmd', t: `Move ${a.key ? catName(CAT[a.key]).toLowerCase() : a.type ? (LABEL[a.type] || 'item').toLowerCase() : 'item'}${a.from ? ' at ' + fmtHour(a.from) : ''} → ${a.quad ? QUAD_NAMES[a.quad] : fmtHour(a.to)}` };
    case 'extend': return { k: 'mod', t: `Extend detachment to ${fmtHour(a.to)}` };
    case 'meta': return { k: 'status', t: [a.pvd === null ? 'PVD status cleared' : PVD_TEXT[a.pvd], a.lens === null ? 'Lens status cleared' : LENS_TEXT[a.lens]].filter(Boolean).join(' · ') || 'Status' };
    case 'add': return { k: a.f.type === 'cat' ? 'cat' : a.f.type, t: findingTitle(a.f, eye) };
  }
  return null;
}
const EXT_TEXT = { arcade: 'the arcades', posteq: 'posterior to the equator', eq: 'the equator', anteq: 'anterior to the equator' };
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

const CAUSE_TEXT = { exudative: 'exudative', combined: 'combined tractional–rhegmatogenous', schisis: 'schisis-detachment' };
const CAUSE_SHORT = { exudative: 'Exudative RD', combined: 'Combined TRD/RRD', schisis: 'Schisis-detachment' };
function findingTitle(f, eye) {
  const r = (a, b) => `${fmtHour(a)}–${fmtHour(b)}`;
  switch (f.type) {
    case 'cat': { const sz = isTumor(CAT[f.key]) ? tumorSize(f, true) : ''; return `${catName(CAT[f.key])} · ${sz ? sz + ' · ' : ''}${catLocText(f, eye || 'OS', true)}`; }
    case 'rd': { const w = CAUSE_SHORT[f.cause] || 'RD'; return f.total ? (f.cause === 'exudative' ? 'Total exudative RD' : 'Total RD') : (f.ring ? `${w} · 360°` : f.island && spanHours(f.start, f.end) >= 12 ? `${w} · posterior, not to the ora` : `${w} ${fmtHour(f.start)} → ${fmtHour(f.end)} · ${fmtSpan(spanHours(f.start, f.end))}${f.island ? ' · not to the ora' : ''}`) + (f.depth && f.depth !== 'normal' ? ' · ' + f.depth : ''); }
    case 'hst': return `${sizeWord(f) ? cap(sizeWord(f)) + ' h' : 'H'}orseshoe tear · ${fmtHour(f.hour)}${f.cuff ? ' · cuff of SRF' : ''}`;
    case 'grt': return `Giant tear ${r(f.start, f.end)} · ${fmtSpan(spanHours(f.start, f.end))}`;
    case 'dia': return `Dialysis ${r(f.start, f.end)}`;
    case 'oph': return `${sizeWord(f) ? cap(sizeWord(f)) + ' o' : 'O'}perculated hole · ${fmtHour(f.hour)}${f.cuff ? ' · cuff of SRF' : ''}`;
    case 'hole': return `${sizeWord(f) ? cap(sizeWord(f)) + ' a' : 'A'}trophic hole · ${fmtHour(f.hour)}${f.cuff ? ' · cuff of SRF' : ''}`;
    case 'lat': return `Lattice ${r(f.start, f.end)}` + (f.pigmented ? ' · pigmented' : '') + (f.holes ? ' · with holes' : '') + (f.tear ? ' · with tractional tear' : '');
    case 'pav': return `Paving stone · ${fmtHour(f.hour)}`;
    case 'tuft': return `Tuft · ${fmtHour(f.hour)}`;
    case 'pvr': return `PVR ${f.grade || 'C'}${(f.grade || 'C') === 'C' ? (f.loc || 'P') : ''}${f.extent ? ' · ' + fmtSpan(f.extent) : ''}${f.hours ? ' · star fold ' + f.hours.map(fmtHour).join(', ') : ''}`;
    case 'laser': if (Array.isArray(f.line) && f.line.length > 1) { const L = lineSpan(f.line); return L.len >= 11.5 ? 'Laser line · 360°' : L.len < 0.25 ? `Laser line · ${fmtHour(L.s)}` : `Laser line · ${fmtHour(L.s)}–${fmtHour(L.e)}`; }
      return f.around ? 'Laser around breaks' : f.target ? 'Laser around a break' : f.full || (f.start != null && spanHours(f.start, f.end) >= 12) ? 'Laser 360°' : f.hour ? `Laser · ${fmtHour(f.hour)}` : `Laser ${r(f.start, f.end)}`;
    case 'cryo': return f.around ? 'Cryo around breaks' : f.target ? 'Cryo around a break' : f.hour ? `Cryo · ${fmtHour(f.hour)}` : `Cryo ${r(f.start, f.end)}`;
    case 'vh': return `${f.fresh ? 'Fresh blood in vitreous' : 'Vitreous hemorrhage'} · ${fmtHour(f.hour)}`;
    case 'buckle': return (f.encircling ? 'Encircling band' : f.radial ? `Radial buckle element · ${fmtHour(f.hour)}` : f.onBand ? `Segment on the band ${r(f.start, f.end)}` : `Segmental buckle ${r(f.start, f.end)}`) + (BUCKLE_EL[f.el] ? ` · ${f.el}` : '');
    case 'chd': { const w = f.hem ? 'Suprachoroidal hemorrhage' : f.kissing ? 'Kissing choroidals' : 'Choroidal detachment'; return f.total ? w + ' · 360°' : `${w} ${r(f.start, f.end)}`; }
  }
  return LABEL[f.type] || f.type;
}

/* ------------------------------------------------------------------ *
 * Scene model
 * ------------------------------------------------------------------ */
function emptyScene(eye) { return { v: 2, eye: eye || 'OS', findings: [], lincoff: false, pending: null, nextId: 1 }; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function seedFor(scene) { return (scene.nextId * 2654435761 + 97) >>> 0; }
const BREAK_TYPES = new Set(['hst', 'grt', 'dia', 'oph', 'hole']);

function rdsOf(scene) { return scene.findings.filter(f => f.type === 'rd'); }
function mainRd(scene) {
  let r = rdsOf(scene);
  if (!r.length) return null;
  if (r.some(x => !x.island)) r = r.filter(x => !x.island);
  return r.reduce((a, b) => (spanHours(b.start, b.end) > spanHours(a.start, a.end) ? b : a));
}
function findingHour(f) {
  if (f.hour != null) return f.hour;
  if (Array.isArray(f.line) && f.line.length) { const m = f.line[Math.floor(f.line.length / 2)]; return angleToHour(Math.atan2(m[1], m[0])); }
  if (f.start != null) return f.total ? 12 : midHour(f.start, f.end);
  if (f.hours && f.hours.length) return f.hours[0];
  return null;
}
function spansOverlap(a, b) {
  if (a.total || b.total) return true;
  return inSpan(a.start, b.start, b.end) || inSpan(a.end, b.start, b.end) || inSpan(b.start, a.start, a.end) || inSpan(b.end, a.start, a.end);
}

function unPath(rd) { delete rd.path; delete rd.ring; delete rd.island; delete rd.aroundFovea; }
/* does a drawn outline still show the macular status recorded for it? */
function pathAgrees(rd) {
  if (!rd.path) return true;
  const d = rdFromPath(rd.path);
  return (d.macula || null) === (rd.macula || null) && (d.fovea || null) === (rd.fovea || null);
}
function applyStatus(rd, macula, fovea) {
  let m = macula || null, f = fovea || null;
  if (f === 'split') m = 'off';
  else if (f === 'thr') m = 'off';
  else if (f === 'off') m = 'off';
  else if (f === 'on' && !m) m = rd.macula === 'off' ? 'off' : (rd.macula === 'thr' ? 'thr' : 'on');
  if (m === 'on' && !f) f = 'on';
  if (m === 'thr' && !f) f = 'on';
  if (m === 'off' && !f) f = 'off';
  rd.macula = m; rd.fovea = f;
}

/* apply parsed actions to a scene; returns {scene, notes, changed, history} */
function applyActions(scene0, actions) {
  let scene = clone(scene0);
  const notes = [];
  const added = [];
  let history = null;
  let rdThisCommand = null;
  const addFinding = (f) => {
    f.id = scene.nextId; f.seed = seedFor(scene); scene.nextId++;
    scene.findings.push(f); added.push(f); return f;
  };
  for (const a of actions) {
    switch (a.op) {
      case 'undo': case 'redo': history = a.op; break;
      case 'clear': scene = emptyScene(scene.eye); notes.push('Chart cleared.'); break;
      case 'eye': {
        const was = scene.eye;
        scene.eye = a.eye === 'flip' ? (scene.eye === 'OD' ? 'OS' : 'OD') : a.eye;
        // findings placed by quadrant keep their anatomy (“superotemporal”) when the eye changes
        if (was !== scene.eye) for (const f of scene.findings) if (f.type === 'cat' && f.quad) { const q = quadrant(f.quad, scene.eye); f.hour = q.c; if (f.start != null) { f.start = q.s; f.end = q.e; } }
        break;
      }
      case 'lincoff': scene.lincoff = !!a.on; break;
      case 'meta': {
        if (Object.prototype.hasOwnProperty.call(PVD_TEXT, a.pvd)) scene.pvd = a.pvd;
        if (Object.prototype.hasOwnProperty.call(LENS_TEXT, a.lens)) scene.lens = a.lens;
        if (a.pvd === null) delete scene.pvd;
        if (a.lens === null) delete scene.lens;
        break;
      }
      case 'add': {
        const f = clone(a.f);
        if (f.type === 'rd' && f.path) {
          // a traced border is the clinician's own outline: it replaces any detachment it overlaps
          const old = rdsOf(scene).filter(r => spansOverlap(r, f));
          if (old.length) {
            const o = old[0];
            for (const k of ['depth', 'cause', 'chronic']) if (o[k] && f[k] == null) f[k] = o[k];
            if ((!f.depth || f.depth === 'normal') && o.depth) f.depth = o.depth;
            const ids = new Set(old.map(r => r.id));
            scene.findings = scene.findings.filter(x => !ids.has(x.id));
            notes.push('Replaced the detachment with your drawing.');
          }
          f.depth = f.depth || 'normal';
          if (scene.pending && !f.macula) { applyStatus(f, scene.pending.macula, scene.pending.fovea); }
          scene.pending = null;
          rdThisCommand = addFinding(f);
          break;
        }
        if (f.type === 'rd') {
          const existing = rdsOf(scene).find(r => spansOverlap(r, f));
          if (existing) {
            if (existing.path) unPath(existing);
            if (existing.total && !f.total) { existing.macula = null; existing.fovea = null; }
            existing.start = f.start; existing.end = f.end; existing.total = !!f.total;
            if (f.depth && f.depth !== 'normal') existing.depth = f.depth;
            if (f.extent) existing.extent = f.extent;
            if (f.chronic) existing.chronic = true;
            if (f.total) { existing.macula = 'off'; existing.fovea = 'off'; }
            rdThisCommand = existing;
            notes.push('Updated the detachment.');
          } else {
            f.depth = f.depth || 'normal';
            if (f.total) { f.macula = 'off'; f.fovea = 'off'; }
            else if (scene.pending) { applyStatus(f, scene.pending.macula, scene.pending.fovea); scene.pending = null; }
            rdThisCommand = addFinding(f);
          }
          break;
        }
        if (f.type === 'cat') {
          if (!CAT[f.key]) break;
          // “the naevus has orange pigment”, “naevus 2 DD”: a tumour described again without a new place is updated
          if (isTumor(CAT[f.key]) && f.hour == null && f.start == null && !f.site && !Array.isArray(f.at) && !f.count && !f.multi && TUM_KEYS.some(k => f[k] != null)) {
            const same = scene.findings.filter(x => x.type === 'cat' && x.key === f.key);
            if (same.length) {
              const t = same.reduce((a, b) => (b.id > a.id ? b : a));
              for (const k of TUM_KEYS) if (f[k] != null) t[k] = clone(f[k]);
              if (f.dist != null && f.du == null) delete t.du;
              notes.push(`Updated the ${catName(CAT[f.key]).toLowerCase()}${same.length > 1 ? ` ${catLocText(t, scene.eye)} (the most recent one)` : ''}.`);
              break;
            }
          }
          const sameSite = (x) => (x.site || null) === (f.site || null);
          const dup = scene.findings.find(x => x.type === 'cat' && x.key === f.key && sameSite(x) && (
            (f.at ? (Array.isArray(x.at) && dist2(x.at, f.at) < 12) : (f.hour != null && x.hour != null && hourDist(x.hour, f.hour) < 0.2)) ||
            (f.hour == null && f.start == null && x.hour == null && x.start == null)));
          if (dup) { Object.assign(dup, f, { id: dup.id, seed: dup.seed }); notes.push(`Updated the ${catName(CAT[f.key]).toLowerCase()}.`); break; }
          const P = catPlace(f, scene.eye);
          addFinding(f);
          if (P && P.auto && !POSTERIOR_SITES.has(P.site) && P.site !== 'vitreous' && !(P.E.dq === 'all')) notes.push(`${catName(P.E)} placed at its typical location — say a clock hour to move it.`);
          break;
        }
        if (f.type === 'laser' || f.type === 'cryo') {
          if (f.around === 'breaks') {
            const targets = added.filter(x => BREAK_TYPES.has(x.type));
            const pool = targets.length ? targets : scene.findings.filter(x => BREAK_TYPES.has(x.type));
            if (!pool.length) { notes.push('No breaks to treat yet — add a tear first, or give a clock position.'); break; }
            const already = new Set(scene.findings.filter(x => x.type === f.type && x.target).map(x => x.target));
            for (const b of pool) if (!already.has(b.id)) addFinding({ type: f.type, target: b.id });
            break;
          }
          if (f.hour != null && f.r == null) {
            const brk = scene.findings.filter(x => BREAK_TYPES.has(x.type)).find(x => hourDist(findingHour(x), f.hour) < 0.6);
            if (brk) { addFinding({ type: f.type, target: brk.id }); break; }
          }
        }
        if (f.hour != null) {
          const dup = scene.findings.find(x => x.type === f.type && x.hour != null && hourDist(x.hour, f.hour) < 0.2 && Math.abs(radiusFor(x) - radiusFor(f)) < 24);
          if (dup) { Object.assign(dup, f, { id: dup.id, seed: dup.seed }); break; }
        }
        if (f.type === 'buckle' && !f.radial && !f.onBand) scene.findings = scene.findings.filter(x => x.type !== 'buckle' || x.radial || (x.onBand && f.encircling) || !(f.encircling || x.encircling));
        if (f.type === 'grt' && spanHours(f.start, f.end) < 3) notes.push(`A giant retinal tear spans 3 clock hours (90°) or more; this one spans ${fmtSpan(spanHours(f.start, f.end))}. Drawn as stated.`);
        if (f.type === 'lat') {
          const dup = scene.findings.find(x => x.type === 'lat' && spansOverlap(x, f));
          if (dup) { Object.assign(dup, f, { id: dup.id, seed: dup.seed }); break; }
        }
        addFinding(f);
        break;
      }
      case 'status': {
        const target = rdThisCommand || mainRd(scene);
        if (!target) { scene.pending = { macula: a.macula, fovea: a.fovea }; notes.push('Macular status saved — it will apply to the next detachment you draw.'); break; }
        if (target.total) { notes.push('A total detachment is always macula off.'); break; }
        applyStatus(target, a.macula, a.fovea);
        if (target.path && !pathAgrees(target)) { unPath(target); notes.push('Switched to the standard outline so the drawing shows the macular status you stated — Undo restores your hand-drawn border.'); }
        break;
      }
      case 'rdmod': {
        const target = rdThisCommand || mainRd(scene);
        if (a.rolled) {
          scene.findings.filter(x => x.type === 'hst').forEach(x => { x.rolled = true; });
          if (!target) break;
        }
        if (!target) { if (!a.rolled) notes.push('Draw the detachment first, then describe it.'); break; }
        if (target.path && (a.total || a.extent)) { unPath(target); notes.push('Switched to the standard outline so the drawing matches what you said — Undo restores your hand-drawn border.'); }
        if (a.depth) target.depth = a.depth;
        if (a.chronic) target.chronic = true;
        if (a.extent) target.extent = a.extent;
        if (a.cause) target.cause = a.cause;
        if (a.total) { target.total = true; target.start = 12; target.end = 12; target.macula = 'off'; target.fovea = 'off'; }
        break;
      }
      case 'extend': {
        const target = rdThisCommand || mainRd(scene);
        if (!target || target.total) { notes.push('There is no detachment to extend.'); break; }
        if (inSpan(a.to, target.start, target.end)) { notes.push(`${fmtHour(a.to)} o'clock is already inside the detachment.`); break; }
        if (target.path) { unPath(target); notes.push('The hand-drawn border was replaced by the standard shape so the detachment could be extended.'); }
        const cw = mod(a.to - target.end, 12);
        const ccw = mod(target.start - a.to, 12);
        if (cw <= ccw) target.end = a.to; else target.start = a.to;
        break;
      }
      case 'move': {
        let cands = scene.findings.filter(x => (!a.type || x.type === a.type) && (!a.key || x.key === a.key) && (x.hour != null || x.type === 'cat'));
        if (a.from != null) cands = cands.filter(x => x.hour != null && hourDist(x.hour, a.from) < 0.75);
        const t = cands[cands.length - 1];
        if (!t) { notes.push('Couldn’t find that item to move.'); break; }
        if (a.quad) {
          const q = quadrant(a.quad, scene.eye);
          t.hour = q.c;
          if (t.start != null || t.type === 'cat') { t.start = q.s; t.end = q.e; t.quad = a.quad; }
          break;
        }
        if (t.type === 'cat' && t.start != null) { const half = t.quad ? 1.5 : spanHours(t.start, t.end) / 2; t.start = normHour(a.to - half); t.end = normHour(a.to + half); }
        delete t.quad;
        t.hour = a.to;
        break;
      }
      case 'remove': {
        if (a.last) {
          const last = scene.findings.reduce((m, x) => (!m || x.id > m.id ? x : m), null);
          if (last) scene.findings = scene.findings.filter(x => x !== last);
          break;
        }
        let cands = scene.findings.filter(x => (x.type === a.type || (a.type === 'hst' && (x.type === 'grt' || x.type === 'hst')) || (a.type === 'star' && x.type === 'pvr')) && (!a.key || x.key === a.key));
        if (a.type === 'dem') { scene.findings.forEach(x => { if (x.type === 'rd') x.chronic = false; }); break; }
        // “remove the haemorrhages”: any drawn haemorrhage if no dot-blot ones are on the chart
        if (!cands.length && a.key === 'intraretinal_hemorrhage_dot_blot') cands = scene.findings.filter(x => x.type === 'cat' && /hemorrhage|roth/.test(x.key));
        if (a.hour != null) cands = cands.filter(x => { const h = findingHour(x); return h != null && (x.start != null && !x.total ? inSpan(a.hour, x.start, x.end, 0.4) : hourDist(h, a.hour) < 0.75); });
        if (!cands.length) { notes.push(`No ${(a.key ? catName(CAT[a.key]) : (LABEL[a.type] || 'item')).toLowerCase()}${a.hour ? ' at ' + fmtHour(a.hour) : ''} on the chart.`); break; }
        const kill = a.hour != null ? cands : [cands[cands.length - 1]];
        const ids = new Set(kill.map(x => x.id));
        scene.findings = scene.findings.filter(x => !ids.has(x.id) && !(x.target && ids.has(x.target)));
        break;
      }
    }
  }
  return { scene, notes, added, history };
}

/* ------------------------------------------------------------------ *
 * Detachment geometry: a signed field (negative = detached) built from
 * a peripheral band anchored exactly at the stated clock hours plus,
 * when the macula is involved, a posterior lobe whose tip is placed by
 * the macular status. The outline is extracted with marching squares,
 * so the fill and the bold border are always the same curve.
 * ------------------------------------------------------------------ */
const EXTENT_R = { anteq: 238, eq: 214, posteq: 172, arcade: 76 };
function rdDepthTarget(rd) {
  // signed position of the border's deepest point along the detachment's axis
  if (rd.fovea === 'off' || (rd.macula === 'off' && !rd.fovea)) return -(G.R_MAC + 6);
  if (rd.fovea === 'split') return 0;
  if (rd.fovea === 'thr') return G.R_FOV + 6;
  if (rd.macula === 'off' && rd.fovea === 'on') return 19;
  if (rd.macula === 'thr') return G.R_MAC + 12;
  if (rd.extent && EXTENT_R[rd.extent]) return EXTENT_R[rd.extent];
  return rd.depth === 'bullous' ? 112 : rd.depth === 'shallow' ? 196 : 128;
}

function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
function smax(a, b, k) { return -smin(-a, -b, k); }
function wrapPi(a) { a = mod(a + Math.PI, TAU) - Math.PI; return a; }

function rdShape(rd) {
  if (rd.path && Array.isArray(rd.path.pts) && rd.path.pts.length > 2) return pathShape(rd.path);
  if (rd.total) return { total: true };
  const span = spanHours(rd.start, rd.end);
  const Delta = span * 30 * DEG;
  const spanDeg = Delta / DEG;
  const phi = hourToAngle(rd.start) + Delta / 2;
  const xD = rdDepthTarget(rd);
  const beta = Math.max(0, Math.min(15 * DEG, Delta * 0.25, (TAU - Delta) / 3));
  const ux = Math.cos(phi), uy = Math.sin(phi);
  const useLobe = xD < 30 || (xD < 72 && spanDeg < 150);
  if (!useLobe) {
    // peripheral detachment: convex inner border, deepest in the middle of the span
    const rDeep = Math.max(xD, 14);
    return { kind: 'band', total: false, Delta, phi, rDeep, rShallow: rDeep + 0.42 * (G.R_ORA - rDeep), beta, lobe: null, xD };
  }
  const rho = Math.max(60, Math.min(118, 44 + spanDeg * 0.42));
  const c = xD + rho;
  const Q = [ux * c, uy * c];
  if (spanDeg <= 165) {
    // funnel: convex hull of the ora base and a rounded posterior tip
    const Ps = polar(G.R_ORA, hourToAngle(rd.start)), Pe = polar(G.R_ORA, hourToAngle(rd.end));
    const tang = (P, sideSign) => {
      const dx = P[0] - Q[0], dy = P[1] - Q[1], d = Math.hypot(dx, dy);
      const a0 = Math.atan2(dy, dx), al = Math.acos(Math.min(1, rho / d));
      const cands = [a0 + al, a0 - al].map(a => [Q[0] + rho * Math.cos(a), Q[1] + rho * Math.sin(a)]);
      const side = t => (ux * t[1] - uy * t[0]) * sideSign;
      return side(cands[0]) > side(cands[1]) ? cands[0] : cands[1];
    };
    const sS = Math.sign(ux * Ps[1] - uy * Ps[0]) || -1, sE = Math.sign(ux * Pe[1] - uy * Pe[0]) || 1;
    const Ts = tang(Ps, sS), Te = tang(Pe, sE);
    const poly = [Ps, Ts, Te, Pe];
    // orient polygon counter-clockwise for consistent half-plane signs
    let area = 0; for (let i = 0; i < 4; i++) { const a = poly[i], b = poly[(i + 1) % 4]; area += a[0] * b[1] - b[0] * a[1]; }
    if (area < 0) poly.reverse();
    // bow each lateral edge so its midpoint sits ~0.4 clock hour outside the clock line
    const bowFor = (P, T, edgeAngle, sign) => {
      const M = [(P[0] + T[0]) / 2, (P[1] + T[1]) / 2];
      const d0 = sign * wrapPi(edgeAngle - Math.atan2(M[1], M[0]));
      return Math.max(6, Math.min(40, Math.hypot(M[0], M[1]) * (12 * DEG - d0)));
    };
    const bowS = bowFor(Ps, Ts, hourToAngle(rd.start), 1);
    const bowE = bowFor(Pe, Te, hourToAngle(rd.end), -1);
    return { kind: 'funnel', total: false, Delta, phi, xD, Q, rho, poly, Ps, Pe, Ts, Te, bowS, bowE, rChord: G.R_ORA * Math.cos(Delta / 2) - 6, beta: 0, rDeep: c - rho, rShallow: G.R_ORA * Math.cos(Delta / 2) };
  }
  // wide detachment reaching the pole: lateral edges run in toward the pole and
  // the lobe carries the border across (or around) the fovea
  const rDeep = Math.max(22, xD + 30);
  const rShallow = rDeep + 0.05 * (G.R_ORA - rDeep);
  const lobe = { cx: Q[0], cy: Q[1], ux, uy, ru: rho, rv: rho * 1.1, k: 40 };
  return { kind: 'band', total: false, Delta, phi, rDeep, rShallow, beta, lobe, xD };
}

/* signed distance to the funnel; bowed lateral edges, round tip, exact anchors at the ora */
function funnelField(x, y, sh) {
  const [Qx, Qy] = sh.Q;
  const dCirc = Math.hypot(x - Qx, y - Qy) - sh.rho;
  let dPoly = -Infinity, lat = false;
  const P = sh.poly;
  for (let i = 0; i < 4; i++) {
    const a = P[i], b = P[(i + 1) % 4];
    const ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1;
    let d = ((x - a[0]) * ey - (y - a[1]) * ex) / L;
    const isS = (a === sh.Ps && b === sh.Ts) || (a === sh.Ts && b === sh.Ps);
    const isE = (a === sh.Pe && b === sh.Te) || (a === sh.Te && b === sh.Pe);
    if (isS || isE) {
      const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / (L * L)));
      d -= (isS ? sh.bowS : sh.bowE) * Math.sin(Math.PI * t);
    }
    if (d > dPoly) { dPoly = d; lat = isS || isE; }
  }
  // base: the sector between the chord and the ora, with exact radial edges
  const r = Math.hypot(x, y), th = Math.atan2(y, x);
  const dd = wrapPi(th - sh.phi);
  const dBase = Math.max((Math.abs(dd) - sh.Delta / 2) * Math.max(r, 30), sh.rChord - r);
  const v = Math.min(dCirc, dPoly, dBase);
  const part = v === dCirc ? 'post' : (v === dPoly && lat && dCirc > 18) ? 'lat' : 'post';
  return { v, part };
}

function bandField(x, y, sh) {
  const r = Math.hypot(x, y);
  const th = Math.atan2(y, x);
  const d = wrapPi(th - sh.phi);
  const t = Math.min(1, Math.max(0, (d + sh.Delta / 2) / sh.Delta));
  const rIn = sh.rShallow - (sh.rShallow - sh.rDeep) * Math.pow(Math.sin(Math.PI * t), 0.65);
  const dRad = rIn - r;
  const s = Math.min(1, Math.max(0, (G.R_ORA - r) / (G.R_ORA - sh.rShallow)));
  const b = sh.beta * Math.pow(Math.sin(Math.PI * s), 1.1);
  const hw = sh.Delta / 2 + b;
  const dAng = (Math.abs(d) - hw) * Math.max(r, 30);
  return { v: smax(dAng, dRad, 14), dAng, dRad };
}
/* egg-shaped lobe: rounded tip toward the fovea, broad where it joins the band */
function lobeField(x, y, L) {
  const px = x - L.cx, py = y - L.cy;
  const qu = (px * L.ux + py * L.uy), qv = (-px * L.uy + py * L.ux);
  const tu = Math.max(-1.6, Math.min(1.6, qu / L.ru));
  const rv = L.rv * (0.9 + 0.1 * (tu + 1) / 2);
  const k0 = Math.hypot(qu / L.ru, qv / rv);
  const k1 = Math.hypot(qu / (L.ru * L.ru), qv / (rv * rv));
  if (k1 < 1e-9) return -Math.min(L.ru, rv);
  return k0 * (k0 - 1) / k1;
}
function rdFieldDetail(x, y, sh) {
  if (sh.kind === 'path') return pathField(x, y, sh);
  if (sh.total) return { v: Math.hypot(x, y) - G.R_ORA, part: 'total' };
  if (sh.kind === 'funnel') return funnelField(x, y, sh);
  const b = bandField(x, y, sh);
  if (!sh.lobe) return { v: b.v, part: Math.abs(b.dAng) < Math.abs(b.dRad) - 3 ? 'lat' : 'post' };
  const l = lobeField(x, y, sh.lobe);
  const v = smin(b.v, l, sh.lobe.k);
  const part = l < b.v ? 'post' : (Math.abs(b.dAng) < Math.abs(b.dRad) - 3 ? 'lat' : 'post');
  return { v, part };
}

function makeField(scene, kind) {
  kind = kind || 'rd';
  const items = scene.findings.filter(f => f.type === kind).map(f => ({ f, sh: kind === 'rd' ? rdShape(f) : chdShape(f) }));
  const disc = discCenter(scene.eye);
  const F = (x, y) => {
    let v = Infinity;
    for (const it of items) { const d = kind === 'rd' ? rdFieldDetail(x, y, it.sh).v : chdField(x, y, it.sh); v = v === Infinity ? d : smin(v, d, 8); }
    v = Math.max(v, Math.hypot(x, y) - G.R_ORA);
    v = Math.max(v, -(Math.hypot(x - disc[0], y - disc[1]) - (G.DISC_R + 3)));
    return v;
  };
  F.items = items;
  F.disc = disc;
  F.part = (x, y) => {
    let best = null, bv = Infinity;
    for (const it of items) { const d = kind === 'rd' ? rdFieldDetail(x, y, it.sh) : { v: chdField(x, y, it.sh), part: 'post' }; if (Math.abs(d.v) < bv) { bv = Math.abs(d.v); best = d.part; } }
    return best;
  };
  return F;
}

/* ------------------------------------------------------------------ *
 * Hand-drawn detachments. The clinician traces the posterior border;
 * the stroke is smoothed, clipped or extended to the ora, then closed
 * along the ora on the side they swipe toward (a closed loop is the
 * region inside or outside it). The region becomes a signed field like
 * the parametric shapes, so fill, border, folds, Lincoff and the note
 * all follow. Clock hours and macular status are read off the drawing.
 * ------------------------------------------------------------------ */
const PATH_OUT = G.R_ORA + 40;
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function pathLength(p) { let L = 0; for (let i = 1; i < p.length; i++) L += dist2(p[i], p[i - 1]); return L; }
function resamplePath(p, step) {
  const L = pathLength(p);
  if (L < step) return p.slice();
  const n = Math.max(2, Math.round(L / step));
  const out = [p[0]];
  let i = 1, acc = 0;
  for (let k = 1; k < n; k++) {
    const target = (L * k) / n;
    while (i < p.length && acc + dist2(p[i], p[i - 1]) < target) { acc += dist2(p[i], p[i - 1]); i++; }
    if (i >= p.length) break;
    const seg = dist2(p[i], p[i - 1]) || 1, t = (target - acc) / seg;
    out.push([p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t]);
  }
  out.push(p[p.length - 1]);
  return out;
}
/* a laser line traced by hand: the clock hours it covers, and where its spots go (three staggered rows,
   as for laser drawn along an arc) */
function lineSpan(line) {
  const hs = line.map(q => mod(angleToHour(Math.atan2(q[1], q[0])), 12)).sort((a, b) => a - b);
  if (!hs.length) return null;
  let gap = -1, gi = 0;
  for (let i = 0; i < hs.length; i++) { const g = (i === hs.length - 1 ? hs[0] + 12 : hs[i + 1]) - hs[i]; if (g > gap) { gap = g; gi = i; } }
  return { s: normHour(Math.round(hs[(gi + 1) % hs.length] * 4) / 4), e: normHour(Math.round(hs[gi] * 4) / 4), len: 12 - gap };
}
function laserLineSpots(line) {
  const step = 6.5, P = resamplePath(line, step), out = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
    out.push(P[i]);
    if (i === P.length - 1) break;
    for (const o of [-7, 7]) out.push([P[i][0] - ty * o + tx * step / 2, P[i][1] + tx * o + ty * step / 2]);
  }
  return out;
}
function smoothPath(raw, passes) {
  let p = [];
  for (const q of raw) if (q && isFinite(q[0]) && isFinite(q[1]) && (!p.length || dist2(q, p[p.length - 1]) >= 1.2)) p.push([q[0], q[1]]);
  if (p.length < 4) return p;
  for (let pass = 0; pass < (passes || 2); pass++) {
    const o = [p[0]];
    for (let i = 1; i < p.length - 1; i++) {
      let sx = 0, sy = 0, n = 0;
      for (let j = -2; j <= 2; j++) { const k = Math.min(p.length - 1, Math.max(0, i + j)); sx += p[k][0]; sy += p[k][1]; n++; }
      o.push([sx / n, sy / n]);
    }
    o.push(p[p.length - 1]);
    p = o;
  }
  return p;
}
/* where segment a→b crosses the circle of radius R (a inside, b outside) */
function segCircle(a, b, R) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const A = dx * dx + dy * dy, B = 2 * (a[0] * dx + a[1] * dy), C = a[0] * a[0] + a[1] * a[1] - R * R;
  const D = B * B - 4 * A * C;
  if (D < 0 || A < 1e-9) return null;
  const s = Math.sqrt(D);
  for (const t of [(-B + s) / (2 * A), (-B - s) / (2 * A)]) if (t >= -1e-6 && t <= 1 + 1e-6) return [a[0] + dx * t, a[1] + dy * t];
  return null;
}
function rayToCircle(P, d, R) {
  const B = 2 * (P[0] * d[0] + P[1] * d[1]), C = P[0] * P[0] + P[1] * P[1] - R * R;
  const t = (-B + Math.sqrt(Math.max(0, B * B - 4 * C))) / 2;
  return [P[0] + d[0] * t, P[1] + d[1] * t];
}
const round1 = (p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];

/* stroke (chart coordinates) → { ok, pts, closed } — pts run ora-to-ora, or form a closed loop */
function prepareStroke(raw) {
  // very long scribbles are thinned first so the outline stays quick to build
  let src = Array.isArray(raw) ? raw : [];
  if (src.length > 1500) { const k = Math.ceil(src.length / 1500); src = src.filter((_, i) => i % k === 0 || i === src.length - 1); }
  let p = smoothPath(src, 2);
  if (p.length < 3 || pathLength(p) < 50) return { ok: false, reason: 'short' };
  const R = G.R_ORA;
  // keep the longest stretch inside the ora, cut exactly at the ora
  let best = null, cur = null;
  for (let i = 0; i < p.length; i++) {
    if (Math.hypot(p[i][0], p[i][1]) < R) { cur = cur ? [cur[0], i] : [i, i]; if (!best || cur[1] - cur[0] > best[1] - best[0]) best = cur.slice(); }
    else cur = null;
  }
  if (!best || best[1] - best[0] < 2) return { ok: false, reason: 'outside' };
  let q = p.slice(best[0], best[1] + 1);
  if (best[0] > 0) { const x = segCircle(p[best[0]], p[best[0] - 1], R); if (x) q.unshift(x); }
  if (best[1] < p.length - 1) { const x = segCircle(p[best[1]], p[best[1] + 1], R); if (x) q.push(x); }
  const L = pathLength(q);
  if (L < 50) return { ok: false, reason: 'short' };
  const a = q[0], b = q[q.length - 1];
  // a loop: the ends meet away from the ora
  if (L > 150 && dist2(a, b) < Math.max(26, L * 0.09) && Math.hypot(a[0], a[1]) < R - 10 && Math.hypot(b[0], b[1]) < R - 10) {
    const loop = resamplePath(q.concat([q[0]]), Math.max(6, L / 220));
    loop.pop();
    return { ok: true, closed: true, pts: loop.map(round1) };
  }
  // carry each free end on to the ora, continuing the stroke's direction where it heads outward
  const extend = (end, prev) => {
    const r = Math.hypot(end[0], end[1]);
    if (r >= R - 1.5) return [];
    let tx = end[0] - prev[0], ty = end[1] - prev[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const ux = r > 1 ? end[0] / r : tx, uy = r > 1 ? end[1] / r : ty;
    const outward = tx * ux + ty * uy;
    let d = outward > 0.2 ? [tx * 0.5 + ux * 0.5, ty * 0.5 + uy * 0.5] : [ux, uy];
    const dl = Math.hypot(d[0], d[1]) || 1; d = [d[0] / dl, d[1] / dl];
    const hit = rayToCircle(end, d, R);
    const D = dist2(end, hit);
    const c = outward > 0.2 ? [end[0] + tx * D * 0.4, end[1] + ty * D * 0.4] : [(end[0] + hit[0]) / 2, (end[1] + hit[1]) / 2];
    const n = Math.max(2, Math.ceil(D / 6));
    const pts = [];
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      pts.push([u * u * end[0] + 2 * u * t * c[0] + t * t * hit[0], u * u * end[1] + 2 * u * t * c[1] + t * t * hit[1]]);
    }
    // the curve may graze past the ora before its end; stop at the first crossing
    for (let k = 0; k < pts.length; k++) if (Math.hypot(pts[k][0], pts[k][1]) >= R) { const prevP = k ? pts[k - 1] : end; const x = segCircle(prevP, pts[k], R) || hit; return pts.slice(0, k).concat([x]); }
    return pts;
  };
  const head = extend(q[0], q[Math.min(3, q.length - 1)]).reverse();
  const tail = extend(q[q.length - 1], q[Math.max(0, q.length - 4)]);
  const full = head.concat(resamplePath(q, Math.max(6, L / 220)), tail);
  // snap the two ends onto the ora
  for (const k of [0, full.length - 1]) { const r = Math.hypot(full[k][0], full[k][1]) || 1; full[k] = [full[k][0] * R / r, full[k][1] * R / r]; }
  if (dist2(full[0], full[full.length - 1]) < 4) return { ok: false, reason: 'degenerate' };
  return { ok: true, closed: false, pts: full.map(round1) };
}

/* the closed outline for one side: the stroke, out past the ora at both ends, and round the outside */
function pathPolygon(path) {
  const pts = path.pts;
  if (path.closed) return pts.slice();
  const A = pts[0], B = pts[pts.length - 1];
  const aA = Math.atan2(A[1], A[0]), aB = Math.atan2(B[1], B[0]);
  const dir = path.dir === -1 ? -1 : 1;
  const sweep = dir > 0 ? mod(aA - aB, TAU) : -mod(aB - aA, TAU);
  const poly = pts.slice();
  const n = Math.max(2, Math.ceil(Math.abs(sweep) / (12 * DEG)));
  for (let k = 0; k <= n; k++) poly.push(polar(PATH_OUT, aB + (sweep * k) / n));
  return poly;
}
function pathShape(path) {
  const poly = pathPolygon(path);
  const nStroke = path.closed ? poly.length : path.pts.length - 1;
  const segs = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey;
    if (L2 < 1e-6) continue;
    let part = 'ora';
    if (i < nStroke) {
      // a stretch running mostly radially is a lateral edge: kept smooth, no undulation
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, mr = Math.hypot(mx, my) || 1;
      const radial = Math.abs((ex * mx + ey * my) / (Math.sqrt(L2) * mr));
      part = radial > 0.8 && mr > 70 ? 'lat' : 'post';
    }
    segs.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], ex, ey, L2, part });
  }
  return { kind: 'path', total: false, path, poly, segs, sign: path.closed && path.inside === false ? -1 : 1 };
}
function pathField(x, y, sh) {
  let best = Infinity, part = 'post', inside = false;
  const S = sh.segs;
  for (let i = 0; i < S.length; i++) {
    const s = S[i];
    const px = x - s.ax, py = y - s.ay;
    let t = (px * s.ex + py * s.ey) / s.L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = px - s.ex * t, dy = py - s.ey * t, d2 = dx * dx + dy * dy;
    if (d2 < best) { best = d2; part = s.part; }
    if ((s.ay > y) !== (s.by > y) && x < s.ax + ((y - s.ay) * s.ex) / s.ey) inside = !inside;
  }
  const d = Math.sqrt(best);
  return { v: (inside ? -d : d) * sh.sign, part: part === 'ora' ? 'post' : part };
}
/* the two ways a prepared stroke can bound a detachment */
function pathOptions(prep) {
  return prep.closed ? [{ pts: prep.pts, closed: true, inside: true }, { pts: prep.pts, closed: true, inside: false }]
    : [{ pts: prep.pts, closed: false, dir: 1 }, { pts: prep.pts, closed: false, dir: -1 }];
}
/* which option a tap or swipe (chart coordinates) points to */
function pickPathSide(prep, from, to) {
  const opts = pathOptions(prep).map(p => ({ p, sh: pathShape(p) }));
  const val = (o, q) => pathField(q[0], q[1], o.sh).v;
  const choose = (q) => { const v0 = val(opts[0], q), v1 = val(opts[1], q); return v0 <= v1 ? opts[0].p : opts[1].p; };
  const mv = to ? dist2(from, to) : 0;
  if (!to || mv < 8) return choose(from);
  let near = null, nd = Infinity;
  for (const q of prep.pts) { const d = dist2(q, from); if (d < nd) { nd = d; near = q; } }
  if (nd < 80) {
    const ux = (to[0] - from[0]) / mv, uy = (to[1] - from[1]) / mv;
    return choose([near[0] + ux * 22, near[1] + uy * 22]);
  }
  return choose(to);
}
/* a detachment finding from a chosen outline: clock hours and macular status read from the drawing */
function rdFromPath(path) {
  const p = { pts: path.pts.map(round1), closed: !!path.closed };
  if (path.closed) p.inside = path.inside !== false; else p.dir = path.dir === -1 ? -1 : 1;
  const sh = pathShape(p);
  const F = (x, y) => pathField(x, y, sh).v;
  const rd = { type: 'rd', depth: 'normal', path: p };
  // ora coverage → start / end, clockwise
  const N = 720, ins = [];
  for (let k = 0; k < N; k++) { const a = hourToAngle(12) + (k / N) * TAU; const q = polar(G.R_ORA - 4, a); ins.push(F(q[0], q[1]) < 0); }
  const q4 = (h) => normHour(Math.round(h * 4) / 4);
  const hourAt = (k) => (k / N) * 12;
  const cover = ins.filter(Boolean).length / N;
  if (cover >= 0.97) { rd.start = 12; rd.end = 12; rd.ring = true; }
  else if (cover > 0) {
    // the longest attached stretch of ora; the detachment runs from its end round to its start
    let bestLen = -1, bestStart = 0;
    for (let k = 0; k < N; k++) {
      if (ins[k] || !ins[(k - 1 + N) % N]) continue;
      let len = 0; while (len < N && !ins[(k + len) % N]) len++;
      if (len > bestLen) { bestLen = len; bestStart = k; }
    }
    rd.start = q4(hourAt(bestStart + bestLen));
    rd.end = q4(hourAt(bestStart));
    if (rd.start === rd.end) rd.end = normHour(rd.start + 0.25);
  } else {
    // an island that does not reach the ora: its angular extent
    const hs = p.pts.map(q => angleToHour(Math.atan2(q[1], q[0]))).sort((a, b) => a - b);
    let gap = -1, at = 0;
    for (let i = 0; i < hs.length; i++) { const g = mod(hs[(i + 1) % hs.length] - hs[i], 12) || (hs.length === 1 ? 12 : 0); if (g > gap) { gap = g; at = i; } }
    rd.start = q4(hs[(at + 1) % hs.length]); rd.end = q4(hs[at]);
    if (rd.start === rd.end) rd.end = normHour(rd.start + 0.25);
    rd.island = true;
    if (F(0, 0) < 0 || 12 - gap >= 10) { rd.aroundFovea = F(0, 0) < 0; rd.start = 12; rd.end = 12; }
  }
  // macular status from the distance between the fovea and the drawn border
  const s0 = F(0, 0);
  if (s0 < -G.R_FOV) { rd.macula = 'off'; rd.fovea = 'off'; }
  else if (s0 <= G.R_FOV) { rd.macula = 'off'; rd.fovea = 'split'; }
  else if (s0 <= G.R_FOV + 9) { rd.macula = 'off'; rd.fovea = 'thr'; }
  else if (s0 <= G.R_MAC) { rd.macula = 'off'; rd.fovea = 'on'; }
  else if (s0 <= G.R_MAC + 18) { rd.macula = 'thr'; rd.fovea = 'on'; }
  else { rd.macula = 'on'; rd.fovea = 'on'; }
  return rd;
}

/* choroidal detachment: smooth lobulated band anterior to the equator */
function chdShape(f) {
  const span = f.total ? 12 : spanHours(f.start, f.end);
  return { total: !!f.total, Delta: span * 30 * DEG, phi: hourToAngle(f.total ? 12 : f.start) + span * 15 * DEG, seed: f.seed || 1, kiss: !!f.kissing };
}
function chdField(x, y, sh) {
  const r = Math.hypot(x, y), th = Math.atan2(y, x);
  const lobes = 4 * (sh.total ? 1 : Math.max(0.5, sh.Delta / TAU));
  const scallop = 10 * Math.abs(Math.sin((th + (sh.seed % 7)) * Math.max(2, Math.round(lobes * 2)) / 2));
  const dRad = ((sh.kiss ? G.R_EQ - 78 : G.R_EQ + 8) + scallop) - r;
  if (sh.total) return dRad;
  const d = wrapPi(th - sh.phi);
  const dAng = (Math.abs(d) - sh.Delta / 2) * Math.max(r, 30);
  return smax(dAng, dRad, 16);
}

/* marching squares → closed loops */
function contour(F, step, bound) {
  step = step || 3;
  bound = bound || (G.R_ORA + 8);
  const n = Math.ceil((2 * bound) / step) + 1;
  const x0 = -bound, y0 = -bound;
  const val = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) val[j * n + i] = F(x0 + i * step, y0 + j * step);
  const segs = new Map();
  const pts = new Map();
  const edgeKey = (i, j, dir) => (dir === 0 ? 'h' : 'v') + i + ',' + j;
  const edgePoint = (i, j, dir) => {
    const k = edgeKey(i, j, dir);
    if (pts.has(k)) return k;
    const a = val[j * n + i];
    const b = dir === 0 ? val[j * n + i + 1] : val[(j + 1) * n + i];
    const t = a / (a - b);
    const p = dir === 0 ? [x0 + (i + t) * step, y0 + j * step] : [x0 + i * step, y0 + (j + t) * step];
    pts.set(k, p);
    return k;
  };
  const link = (a, b) => {
    if (!segs.has(a)) segs.set(a, []);
    if (!segs.has(b)) segs.set(b, []);
    segs.get(a).push(b); segs.get(b).push(a);
  };
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = val[j * n + i], b = val[j * n + i + 1], c = val[(j + 1) * n + i + 1], d = val[(j + 1) * n + i];
      const code = (a < 0 ? 8 : 0) | (b < 0 ? 4 : 0) | (c < 0 ? 2 : 0) | (d < 0 ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const T = () => edgePoint(i, j, 0), R = () => edgePoint(i + 1, j, 1), B = () => edgePoint(i, j + 1, 0), L = () => edgePoint(i, j, 1);
      const center = (a + b + c + d) / 4;
      switch (code) {
        case 1: case 14: link(L(), B()); break;
        case 2: case 13: link(B(), R()); break;
        case 3: case 12: link(L(), R()); break;
        case 4: case 11: link(T(), R()); break;
        case 6: case 9: link(T(), B()); break;
        case 7: case 8: link(L(), T()); break;
        case 5: if (center < 0) { link(L(), T()); link(B(), R()); } else { link(L(), B()); link(T(), R()); } break;
        case 10: if (center < 0) { link(T(), R()); link(L(), B()); } else { link(L(), T()); link(B(), R()); } break;
      }
    }
  }
  const loops = [];
  const seen = new Set();
  for (const start of segs.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let prev = null, cur = start;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      loop.push(pts.get(cur));
      const nb = segs.get(cur).filter(k => k !== prev && !seen.has(k));
      prev = cur;
      cur = nb[0] || null;
    }
    if (loop.length > 4) loops.push(loop);
  }
  return loops;
}

function chaikin(loop, iters, fixed) {
  let p = loop;
  for (let k = 0; k < iters; k++) {
    const q = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      if (fixed && fixed(a) && fixed(b)) { q.push(a); continue; }
      q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      q.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    p = q;
  }
  return p;
}

function mulberry32(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/* full detachment geometry for rendering */
function rdGeometry(scene) {
  const rds = rdsOf(scene);
  if (!rds.length) return null;
  const F = makeField(scene, 'rd');
  let loops = contour(F, 3);
  const nearOra = p => Math.hypot(p[0], p[1]) > G.R_ORA - 2.2;
  loops = loops.map(l => chaikin(l, 2, nearOra));
  const seed = rds[0].seed || 7;
  const rng = mulberry32(seed);
  const ph = [rng() * TAU, rng() * TAU, rng() * TAU];
  const amp = rds.some(r => r.depth === 'bullous') ? 7.5 : rds.every(r => r.depth === 'shallow') ? 3.5 : 5.5;
  const disc = F.disc;
  // undulate only the posterior border; lateral edges and ora stay smooth
  loops = loops.map(loop => {
    const n = loop.length;
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const [x, y] = loop[i];
      const r = Math.hypot(x, y);
      let k = 1;
      k *= smooth01((G.R_ORA - 18 - r) / 22);
      k *= smooth01((Math.hypot(x - disc[0], y - disc[1]) - (G.DISC_R + 10)) / 14);
      k *= smooth01((r - (G.R_MAC + 16)) / 44);
      if (F.part(x, y) === 'lat') k = 0;
      w[i] = k;
    }
    const ws = new Float64Array(n);
    const R = 7;
    for (let i = 0; i < n; i++) { let s = 0; for (let j = -R; j <= R; j++) s += w[mod(i + j, n)]; ws[i] = s / (2 * R + 1); }
    let arc = 0;
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = loop[mod(i - 1, n)], p = loop[i], b = loop[(i + 1) % n];
      arc += Math.hypot(p[0] - a[0], p[1] - a[1]);
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      let nx = ty, ny = -tx;
      if (F(p[0] + nx * 2, p[1] + ny * 2) < F(p[0] - nx * 2, p[1] - ny * 2)) { nx = -nx; ny = -ny; }
      const wave = 0.56 * Math.sin(arc / 11.5 + ph[0]) + 0.3 * Math.sin(arc / 5.1 + ph[1]) + 0.14 * Math.sin(arc / 2.3 + ph[2]);
      const dsp = amp * ws[i] * wave;
      out.push([p[0] + nx * dsp, p[1] + ny * dsp, ws[i], nx, ny]);
    }
    return out;
  });
  // border = loop minus the stretch lying on the ora
  const borders = [];
  for (const loop of loops) {
    const onOra = loop.map(p => Math.hypot(p[0], p[1]) > G.R_ORA - 2.4);
    if (!onOra.some(Boolean)) { borders.push({ pts: loop.concat([loop[0]]), closed: true }); continue; }
    const n = loop.length;
    let start = onOra.findIndex((v, i) => v && !onOra[(i + 1) % n]);
    let cur = [];
    for (let k = 1; k <= n; k++) {
      const i = (start + k) % n;
      if (onOra[i]) { if (cur.length > 1) borders.push({ pts: cur, closed: false }); cur = []; }
      else cur.push(loop[i]);
    }
    if (cur.length > 1) borders.push({ pts: cur, closed: false });
  }
  // stretches of ora adjacent to detached retina (drawn as a black scalloped line)
  const oraArcs = [];
  let inArc = false, s0 = 0;
  for (let k = 0; k <= 720; k++) {
    const a = (k / 720) * TAU - Math.PI / 2;
    const p = polar(G.R_ORA - 5, a);
    const inside = F(p[0], p[1]) < 0;
    if (inside && !inArc) { inArc = true; s0 = a; }
    if ((!inside || k === 720) && inArc) { inArc = false; oraArcs.push([s0, a]); }
  }
  return { F, loops, borders, oraArcs, shapes: F.items };
}
function smooth01(t) { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); }

/* where a point finding sits on the chart */
function radiusFor(f) {
  if (f.r != null && isFinite(f.r)) return f.r;      // placed by hand at an exact spot
  if (f.radial === 'post') return G.R_EQ - 10;
  if (f.radial === 'ora') return G.R_ORA - 14;
  if (f.type === 'hole' || f.type === 'oph') return G.TEAR_R - 6;
  if (f.type === 'tuft') return G.R_ORA - 22;
  if (f.type === 'pav') return G.R_ORA - 30;
  return G.TEAR_R;
}

/* ------------------------------------------------------------------ *
 * Lincoff rules (Lincoff & Gieser, Arch Ophthalmol 1971;85:565-9)
 * ------------------------------------------------------------------ */
function strictlyInside(h, s, e) { const span = spanHours(s, e), d = mod(h - s, 12); return span >= 12 || (d > 1e-6 && d < span - 1e-6); }
const LINCOFF_R_IN = G.R_EQ - 40;
function lincoff(scene) {
  const rd = mainRd(scene);
  if (!rd || rd.cause === 'exudative' || rd.island) return null;
  const s = rd.start, e = rd.end, span = rd.total ? 12 : spanHours(s, e);
  const crosses12 = rd.total || strictlyInside(12, s, e);
  const hs = hourHeight(s), he = hourHeight(e);
  const level = Math.abs(hs - he) < 0.02;
  const hiBorder = hs >= he ? s : e;
  const hiIsStart = hs >= he;
  const bothLow = hs <= 0.05 && he <= 0.05;
  const into = (h, dir) => dir > 0 ? { from: h, to: normHour(h + Math.min(1.5, span)) } : { from: normHour(h - Math.min(1.5, span)), to: h };
  let z;
  if (crosses12) {
    z = { rule: 2, pct: 93, title: 'Rule 2 · RD crosses 12 o’clock', text: 'Primary break at 12 o’clock or within a triangle whose apex is at the ora serrata and whose sides extend 1½ clock hours to either side of 12.', zones: [{ kind: 'triangle', apex: 12, from: 10.5, to: 1.5 }] };
  } else if (bothLow && rd.depth === 'bullous') {
    const zf = level ? { from: 10.5, to: 1.5 } : (mod(hiBorder, 12) > 0 && mod(hiBorder, 12) < 6 ? { from: 12, to: 3 } : { from: 9, to: 12 });
    z = { rule: 4, pct: null, title: 'Rule 4 · inferior bullous RD', text: 'An inferior bullous detachment arises from a superior break. Search the superior retina' + (level ? ', centred on 12 o’clock.' : ' on the side of the higher border.'), zones: [{ kind: 'sector', ...zf }] };
  } else if (hourHeight(hiBorder) > 0.05) {
    if (level) {
      z = { rule: 1, pct: 98, title: 'Rule 1 · both borders equally high', text: `The borders at ${fmtHour(s)} and ${fmtHour(e)} o’clock are level, so search within 1½ clock hours of each.`, zones: [{ kind: 'sector', ...into(s, 1) }, { kind: 'sector', ...into(e, -1) }] };
    } else {
      z = { rule: 1, pct: 98, title: 'Rule 1 · superior temporal or nasal RD', text: `Primary break within 1½ clock hours of the higher border (${fmtHour(hiBorder)} o’clock).`, zones: [{ kind: 'sector', ...(hiIsStart ? into(s, 1) : into(e, -1)) }] };
    }
  } else if (level) {
    z = { rule: 3, pct: 95, title: 'Rule 3 · inferior RD, level borders', text: 'Fluid is level on both sides of 6 o’clock, so the break is expected close to 6 o’clock.', zones: [{ kind: 'sector', from: 5, to: 7 }] };
  } else {
    const zf = hiIsStart ? { from: s, to: inSpan(6, s, e) ? 6 : e } : { from: inSpan(6, s, e) ? 6 : s, to: e };
    z = { rule: 3, pct: 95, title: 'Rule 3 · inferior RD', text: `The higher border (${fmtHour(hiBorder)} o’clock) shows which side of 6 o’clock the inferior break lies on.`, zones: [{ kind: 'sector', ...zf }] };
  }
  z.zone = z.zones[0];
  // a break counts only if its drawn position falls inside a drawn zone
  const breaks = scene.findings.filter(f => BREAK_TYPES.has(f.type) && f.type !== 'oph');
  const hits = breaks.filter(b => z.zones.some(zz => breakInZone(b, zz)));
  z.breaks = breaks.length;
  z.consistent = hits.length > 0;
  z.hits = hits;
  z.zoneText = z.zones.map(zz => `${fmtHour(zz.from)}–${fmtHour(zz.to)}`).join(' and ') + ' o’clock';
  return z;
}
function lincoffTriangle() {
  const apex = polar(G.R_ORA, hourToAngle(12));
  const rb = G.R_EQ - 46;
  return { apex, a: polar(rb, hourToAngle(10.5)), b: polar(rb, hourToAngle(1.5)), rb };
}
function breakInZone(b, zz) {
  const pts = [];
  if (b.hour != null) pts.push(polar(radiusFor(b), hourToAngle(b.hour)));
  else if (b.start != null) { const n = 8, sp = spanHours(b.start, b.end); for (let i = 0; i <= n; i++) pts.push(polar(G.R_ORA - 26, hourToAngle(b.start + sp * i / n))); }
  return pts.some(p => {
    const r = Math.hypot(p[0], p[1]);
    const h = angleToHour(Math.atan2(p[1], p[0]));
    if (zz.kind === 'sector') return r >= LINCOFF_R_IN - 4 && inSpan(h, zz.from, zz.to, 0.12);
    // triangle: apex at the ora at 12, base on an arc spanning 10:30–1:30
    if (r < G.R_EQ - 46 - 4 || r > G.R_ORA + 2) return false;
    const T = lincoffTriangle();
    const t = (G.R_ORA - r) / (G.R_ORA - T.rb);
    return hourDist(h, 12) <= 1.5 * t + 0.12;
  });
}

/* ------------------------------------------------------------------ *
 * Clinical note
 * ------------------------------------------------------------------ */
function listJoin(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
function hourList(hs) { return listJoin(hs.map(h => fmtHour(h))) + ' o’clock'; }
/* breaks drawn larger or smaller than usual (by voice, or by dragging the size handle) */
function sizeWord(f) { return !f || !f.size ? '' : f.size < 0.85 ? 'small' : f.size >= 1.25 ? 'large' : ''; }
/* “Large horseshoe tear at 12 o’clock”, “2 horseshoe tears at 11 (large) and 1 o’clock” */
function sizedBreaks(items, noun, plural, counted) {
  const w = items.map(sizeWord), same = w.every(x => x === w[0]);
  if (items.length === 1) return `${cap((w[0] ? w[0] + ' ' : '') + noun)} at ${hourList([items[0].hour])}`;
  const head = counted ? `${items.length} ` : '';
  if (same) return cap(`${head}${w[0] ? w[0] + ' ' : ''}${plural}`) + ` at ${hourList(items.map(f => f.hour))}`;
  return cap(`${head}${plural}`) + ` at ${listJoin(items.map((f, i) => fmtHour(f.hour) + (w[i] ? ` (${w[i]})` : '')))} o’clock`;
}

function clinicalNote(scene) {
  const eyeTxt = scene.eye === 'OD' ? 'OD (right eye)' : 'OS (left eye)';
  const lines = [];
  const F = scene.findings;
  const hasBreak = F.some(f => BREAK_TYPES.has(f.type));
  for (const rd of F.filter(f => f.type === 'rd')) {
    const parts = [];
    const kind = rd.cause === 'exudative' ? 'exudative retinal detachment' : rd.cause === 'combined' ? 'combined tractional–rhegmatogenous retinal detachment'
      : rd.cause === 'schisis' ? 'schisis-detachment' : (hasBreak ? 'rhegmatogenous retinal detachment' : 'retinal detachment');
    const depth = rd.depth === 'bullous' ? 'Bullous ' + kind : rd.depth === 'shallow' ? 'Shallow ' + kind : cap(kind);
    if (rd.total) parts.push('Total ' + kind + ', macula off');
    else {
      if (rd.ring) parts.push(`${depth} through 360°`);
      else if (rd.island && spanHours(rd.start, rd.end) >= 12) parts.push(`${depth} in the posterior fundus${rd.aroundFovea ? ' surrounding the fovea' : ''}, not reaching the ora`);
      else parts.push(`${depth} ${rd.island ? 'between' : 'from'} ${fmtHour(rd.start)} ${rd.island ? 'and' : 'to'} ${fmtHour(rd.end)} o’clock (${fmtSpan(spanHours(rd.start, rd.end))})${rd.island ? ', not reaching the ora' : ''}`);
      parts.push(macText(rd.macula, rd.fovea) || 'macular status not recorded');
      if (rd.extent) parts.push('extending ' + (rd.extent === 'arcade' ? 'to the vascular arcades' : EXT_TEXT[rd.extent]));
    }
    if (rd.chronic) parts.push('pigmented demarcation line consistent with chronicity');
    lines.push(parts.join(', ') + '.');
  }
  const pts = (type) => F.filter(f => f.type === type);
  const hsts = pts('hst');
  if (hsts.length) lines.push(`${sizedBreaks(hsts, 'horseshoe tear', 'horseshoe tears', true)}${hsts.some(f => f.rolled) ? ', rolled edges' : ''}${hsts.some(f => f.cuff) ? ', with a cuff of subretinal fluid' : ''}.`);
  for (const g of pts('grt')) lines.push(`Giant retinal tear from ${fmtHour(g.start)} to ${fmtHour(g.end)} o’clock (${fmtSpan(spanHours(g.start, g.end))}).`);
  for (const d of pts('dia')) lines.push(`Retinal dialysis from ${fmtHour(d.start)} to ${fmtHour(d.end)} o’clock.`);
  const oph = pts('oph'); if (oph.length) lines.push(`${sizedBreaks(oph, 'operculated hole', 'operculated holes')}${oph.some(f => f.cuff) ? ', with a cuff of subretinal fluid' : ''}.`);
  const hol = pts('hole'); if (hol.length) lines.push(`${sizedBreaks(hol, 'atrophic hole', 'atrophic holes')}${hol.some(f => f.cuff) ? ', with a cuff of subretinal fluid' : ''}.`);
  const lat = pts('lat');
  if (lat.length) lines.push(`Lattice degeneration ${listJoin(lat.map(l => `${fmtHour(l.start)}–${fmtHour(l.end)}`))} o’clock${lat.some(l => l.pigmented) ? ', pigmented' : ''}${lat.some(l => l.holes) ? ', with atrophic holes' : ''}${lat.some(l => l.tear) ? ', with a tractional tear at its margin' : ''}.`);
  const pav = pts('pav'); if (pav.length) lines.push(`Paving-stone degeneration at ${hourList(pav.map(f => f.hour))}.`);
  const tuf = pts('tuft'); if (tuf.length) lines.push(`Retinal tuft${tuf.length > 1 ? 's' : ''} at ${hourList(tuf.map(f => f.hour))}.`);
  for (const g of pts('pvr')) {
    const gr = g.grade || 'C';
    const hrs = g.hours || [];
    const loc = gr === 'C' ? (g.loc === 'A' ? ' anterior' : ' posterior') : '';
    lines.push(`Proliferative vitreoretinopathy grade ${gr}${gr === 'C' ? (g.loc === 'A' ? 'A' : 'P') : ''}${g.extent ? ` (${fmtSpan(g.extent)}${loc})` : (gr === 'C' ? ` (${loc.trim()})` : '')}${hrs.length ? ', star fold' + (hrs.length > 1 ? 's' : '') + ' at ' + hourList(hrs) : ''}.`);
  }
  for (const v of pts('vh')) {
    const dens = v.density === 'dense' ? 'Dense v' : v.density === 'mild' ? 'Mild v' : 'V';
    lines.push(`${v.fresh ? 'Fresh red blood in the vitreous' : dens + 'itreous hemorrhage'}${v.located === false ? ', layered inferiorly' : ` at ${fmtHour(v.hour)} o’clock`}.`);
  }
  for (const b of pts('buckle')) {
    const el = BUCKLE_EL[b.el] ? ` (${BUCKLE_EL[b.el]})` : '';
    lines.push(b.encircling ? `Encircling scleral buckle${el}.` : b.radial ? `Radial scleral buckle element at ${fmtHour(b.hour)} o’clock${el}.` : b.onBand ? `Segmental element on the encircling band, ${fmtHour(b.start)}–${fmtHour(b.end)} o’clock${el}.` : `Segmental scleral buckle ${fmtHour(b.start)}–${fmtHour(b.end)} o’clock${el}.`);
  }
  for (const c of pts('chd')) { const w = c.hem ? 'suprachoroidal hemorrhage' : c.kissing ? 'kissing choroidal detachments' : 'choroidal detachment'; lines.push(c.total ? `360° ${w}.` : `${cap(w)} ${fmtHour(c.start)}–${fmtHour(c.end)} o’clock.`); }
  const las = pts('laser'); if (las.length) lines.push(laserText(las, F, 'Laser retinopexy'));
  const cry = pts('cryo'); if (cry.length) lines.push(laserText(cry, F, 'Cryopexy'));
  // catalogue findings, in catalogue group order
  const cats = F.filter(f => f.type === 'cat' && CAT[f.key] && !(scene.pvd && f.key === 'posterior_vitreous_detachment'));
  const gIndex = Object.fromEntries(GROUPS.map(([g], i) => [g, i]));
  cats.sort((a, b) => ((gIndex[CAT[a.key].group] || 0) - (gIndex[CAT[b.key].group] || 0)) || (CAT[a.key].ix - CAT[b.key].ix) || (a.id - b.id));
  const plural = (n) => n.replace(/\b(spot|lesion|nodule|hemorrhage|aneurysm|microaneurysm|tuft|nevus|drop|droplet|cyst|hole|tear|fold|streak|fleck|scar|granuloma|ring)\b(?!.*\b(?:spot|lesion|nodule|hemorrhage|aneurysm|microaneurysm|tuft|nevus|drop|droplet|cyst|hole|tear|fold|streak|fleck|scar|granuloma|ring)\b)/, w => w === 'nevus' ? 'nevi' : w + 's');
  for (const f of cats) {
    const nm = catName(CAT[f.key]);
    const head = f.count > 1 ? `${f.count} ${plural(nm.charAt(0).toLowerCase() + nm.slice(1))}` : nm;
    if (isTumor(CAT[f.key])) {
      // “Choroidal nevus 2 × 1.5 DD, 2 DD superotemporal to the optic disc; flat, overlying drusen, no orange pigment, no subretinal fluid.”
      const sz = tumorSize(f), feats = tumorFeatures(f);
      lines.push(`${head}${sz ? ' ' + sz + ',' : ''} ${catLocText(f, scene.eye)}${feats.length ? '; ' + feats.join(', ') : ''}.`.replace(/\s+\./, '.').replace(/,\s*;/, ';'));
      continue;
    }
    lines.push(`${head} ${catLocText(f, scene.eye)}.`.replace(/\s+\./, '.'));
  }
  const vit = { complete: 'Complete posterior vitreous detachment.', partial: 'Partial posterior vitreous detachment.', yes: 'Posterior vitreous detachment present.', none: 'No posterior vitreous detachment (vitreous attached).' }[scene.pvd];
  const lens = LENS_TEXT[scene.lens];
  if (vit || lens) lines.push([vit, lens ? 'Lens: ' + lens.toLowerCase() + '.' : null].filter(Boolean).join(' '));
  if (!lines.length) return `${eyeTxt}: no findings drawn.`;
  const lz = lincoff(scene);
  if (mainRd(scene) && mainRd(scene).cause === 'exudative') lines.push('No retinal break is expected in an exudative detachment; Lincoff’s rules do not apply.');
  if (lz && !mainRd(scene).total) {
    const rule = 'Lincoff ' + lz.title.split(' · ')[0].toLowerCase();
    if (lz.breaks) lines.push(lz.consistent ? `Break location is consistent with ${rule} (zone ${lz.zoneText}).` : `No break is drawn in the ${rule} zone (${lz.zoneText}); consider a further search for the primary break.`);
    else lines.push(`No break identified; ${rule} predicts the primary break at ${lz.zoneText}.`);
  }
  return `${eyeTxt}: ` + lines.join(' ');
}
function laserText(items, all, word) {
  const tgt = items.filter(x => x.target).map(x => all.find(y => y.id === x.target)).filter(Boolean);
  const parts = [];
  if (tgt.length) parts.push('around the ' + (tgt.length === 1 ? LABEL[tgt[0].type].toLowerCase() + ' at ' + fmtHour(findingHour(tgt[0])) + ' o’clock' : tgt.length + ' breaks'));
  const arcs = items.filter(x => x.start != null);
  if (arcs.some(a => spanHours(a.start, a.end) >= 12)) parts.push('360°');
  const part = arcs.filter(a => spanHours(a.start, a.end) < 12);
  if (part.length) parts.push(listJoin(part.map(a => `${fmtHour(a.start)}–${fmtHour(a.end)}`)) + ' o’clock');
  const spots = items.filter(x => x.hour != null && !x.target);
  if (spots.length) parts.push('at ' + hourList(spots.map(s => s.hour)));
  const drawn = items.filter(x => Array.isArray(x.line) && x.line.length > 1).map(x => lineSpan(x.line));
  const spanTxt = (L) => L.len >= 11.5 ? '360°' : L.len < 0.25 ? `at ${fmtHour(L.s)} o’clock` : `from ${fmtHour(L.s)} to ${fmtHour(L.e)} o’clock`;
  if (drawn.length === 1) parts.push(`along a drawn line ${drawn[0].len >= 11.5 ? 'all round (360°)' : spanTxt(drawn[0])}`);
  else if (drawn.length) parts.push(`along drawn lines (${listJoin(drawn.map(L => L.len >= 11.5 ? '360°' : L.len < 0.25 ? fmtHour(L.s) : fmtHour(L.s) + '–' + fmtHour(L.e)))} o’clock)`);
  return `${word} ${parts.join('; ')}.`;
}

/* ------------------------------------------------------------------ *
 * Repair options. Rule-based, from published trials and large cohorts
 * (all checked against PubMed). Each rule adds or subtracts weight and
 * says why, with its sources; the card shows the ranked options, the
 * timing evidence and what is still missing (PVD, lens status).
 * ------------------------------------------------------------------ */
const REPAIR_REFS = {
  pivot: { cite: 'Hillier RJ, et al. Pneumatic Retinopexy versus Vitrectomy (PIVOT) randomized trial. Ophthalmology 2019;126:531–9.', doi: '10.1016/j.ophtha.2018.11.014', pmid: '30468761' },
  tornambe: { cite: 'Tornambe PE, Hilton GF. Pneumatic retinopexy: a multicenter randomized controlled clinical trial comparing pneumatic retinopexy with scleral buckling. Ophthalmology 1989;96:772–83.', doi: '10.1016/s0161-6420(89)32820-x', pmid: '2662100' },
  iris: { cite: 'Griffin S, et al. Pneumatic retinopexy for RRD: IRIS Registry analysis. Ophthalmol Retina 2025;9:437–43.', doi: '10.1016/j.oret.2024.10.025', pmid: '39521131' },
  kurochkin: { cite: 'Kurochkin P, et al. Vitrectomy outcomes for RRD qualifying for pneumatic retinopexy. Clin Ophthalmol 2021;15:1207–14.', doi: '10.2147/OPTH.S302413', pmid: '33776417' },
  cochPnr: { cite: 'Sena DF, et al. Pneumatic retinopexy versus scleral buckle for simple RRD. Cochrane Database Syst Rev 2021;11:CD008350.', doi: '10.1002/14651858.CD008350.pub3', pmid: '34762741' },
  cochPpv: { cite: 'Znaor L, et al. Pars plana vitrectomy versus scleral buckling for simple RRD. Cochrane Database Syst Rev 2019;3:CD009562.', doi: '10.1002/14651858.CD009562.pub2', pmid: '30848830' },
  spr: { cite: 'Heimann H, et al. Scleral buckling versus primary vitrectomy (SPR study). Ophthalmology 2007;114:2142–54.', doi: '10.1016/j.ophtha.2007.09.013', pmid: '18054633' },
  pro2: { cite: 'Ryan EH, et al. PRO Study Report 2: phakic retinal detachment outcomes. Ophthalmology 2020;127:1077–85.', doi: '10.1016/j.ophtha.2020.03.007', pmid: '32312634' },
  pro3: { cite: 'Joseph DP, et al. PRO Study Report 3: pseudophakic retinal detachment outcomes. Ophthalmology 2020;127:1507–14.', doi: '10.1016/j.ophtha.2020.05.005', pmid: '32437865' },
  pro9: { cite: 'Starr MR, et al. RD with inferior retinal breaks: PPV versus PPV with scleral buckle (PRO Report 9). Retina 2021;41:525–30.', doi: '10.1097/IAE.0000000000002917', pmid: '33600131' },
  proSum: { cite: 'Starr MR, Ryan EH, Yonekawa Y. PRO Study: summary of reports 1–18. Curr Opin Ophthalmol 2023;34:211–7.', doi: '10.1097/ICU.0000000000000942', pmid: '36866845' },
  sil1: { cite: 'Silicone Study Group. Silicone oil or SF6 gas in severe PVR (Report 1). Arch Ophthalmol 1992;110:770–9.', doi: '10.1001/archopht.1992.01080180042027', pmid: '1596224' },
  sil2: { cite: 'Silicone Study Group. Silicone oil or C3F8 gas in severe PVR (Report 2). Arch Ophthalmol 1992;110:780–92.', doi: '10.1001/archopht.1992.01080180052028', pmid: '1596225' },
  kunikata: { cite: 'Kunikata H, et al. 23-, 25- and 27-gauge vitrectomy without scleral encircling for giant retinal tear. Jpn J Ophthalmol 2020;64:506–15.', doi: '10.1007/s10384-020-00755-y', pmid: '32686061' },
  mikhail: { cite: 'Mikhail MA, et al. Management of giant retinal tears with vitrectomy and perfluorocarbon liquid postoperatively as a short-term tamponade. Eye 2017;31:1290–5.', doi: '10.1038/eye.2017.157', pmid: '28799563' },
  berrocal: { cite: 'Berrocal MH, Chenworth ML, Acaba LA. Management of giant retinal tear detachments. J Ophthalmic Vis Res 2017;12:93–7.', doi: '10.4103/2008-322X.200158', pmid: '28299011' },
  rohowetz: { cite: 'Rohowetz LJ, et al. Retinal detachment with retinal dialysis: a 10-year study. Ophthalmol Retina 2023;7:857–61.', doi: '10.1016/j.oret.2023.06.013', pmid: '37379884' },
  stoffelns: { cite: 'Stoffelns BM, Richard G. Is buckle surgery still the state of the art for retinal detachments due to retinal dialysis? J Pediatr Ophthalmol Strabismus 2010;47:281–7.', doi: '10.3928/01913913-20091019-10', pmid: '19873945' },
  yap: { cite: 'Yap J, et al. Vitrectomy with or without circumferential buckling for detachments from retinal dialysis. Asia Pac J Ophthalmol 2020;9:435–9.', doi: '10.1097/APO.0000000000000309', pmid: '32694346' },
  ung: { cite: 'Ung T, et al. Retinal detachment secondary to round retinal holes. Eye 2005;19:665–9.', doi: '10.1038/sj.eye.6701618', pmid: '15359254' },
  vorob: { cite: 'Vorobichik Berar O, et al. Grading retinal displacement after retinal detachment repair: a prospective study linking displacement grade and visual outcome. Graefes Arch Clin Exp Ophthalmol 2025;263:2789–96.', doi: '10.1007/s00417-025-06897-4', pmid: '40728572' },
  kim2013: { cite: 'Kim JD, et al. Symptom duration and outcomes after vitrectomy for macula-off RD. Retina 2013;33:1931–7.', doi: '10.1097/IAE.0b013e3182877a27', pmid: '23591530' },
  elghawy: { cite: 'Elghawy O, et al. Surgical timing in 23-gauge vitrectomy for macula-off RRD. BMC Ophthalmol 2022;22:136.', doi: '10.1186/s12886-022-02364-4', pmid: '35337296' },
};
const PROCS = [
  ['pnr', 'Pneumatic retinopexy'],
  ['sb', 'Scleral buckle'],
  ['ppv', 'Vitrectomy (PPV)'],
  ['ppvsb', 'Vitrectomy with scleral buckle'],
];
function breakPoints(scene) {
  const out = [];
  for (const f of scene.findings) {
    if (f.type === 'hst' || f.type === 'hole' || f.type === 'oph') out.push({ f, h: f.hour, p: polar(radiusFor(f), hourToAngle(f.hour)) });
    else if (f.type === 'grt' || f.type === 'dia') out.push({ f, h: midHour(f.start, f.end), p: polar(G.R_ORA - 22, hourToAngle(midHour(f.start, f.end))), span: [f.start, f.end] });
    else if (f.type === 'lat' && f.tear) { const h = normHour(f.end - 0.12); out.push({ f, h, p: polar(f.r || G.LATTICE_R, hourToAngle(h)) }); }
  }
  return out;
}
function hourSpread(hs) {
  if (hs.length < 2) return 0;
  const s = hs.map(h => mod(h, 12)).sort((a, b) => a - b);
  let gap = 0;
  for (let i = 0; i < s.length; i++) gap = Math.max(gap, (i === s.length - 1 ? s[0] + 12 : s[i + 1]) - s[i]);
  return 12 - gap;
}
function repairOptions(scene) {
  const rd = mainRd(scene);
  const ask = { pvd: !scene.pvd, lens: !scene.lens };
  if (!rd) return { state: 'none', ask };
  if (rd.cause === 'exudative') return { state: 'exudative', ask };
  const F = makeField(scene, 'rd');
  const all = breakPoints(scene);
  const brk = all.filter(b => F(b.p[0], b.p[1]) < 4 || (b.span && rd.total));
  const hasGrt = scene.findings.some(f => f.type === 'grt');
  const hasDia = scene.findings.some(f => f.type === 'dia');
  const pvrC = scene.findings.some(f => f.type === 'pvr' && (f.grade || 'C') === 'C');
  const vh = scene.findings.some(f => f.type === 'vh' || (f.type === 'cat' && /vitreous_hemorrhage|subhyaloid/.test(f.key)));
  const lens = scene.lens || null, pvd = scene.pvd || null;
  const phakic = lens === 'phakic', pseudo = lens === 'pseudo' || lens === 'aphakic';
  const PSE = lens === 'aphakic' ? 'Aphakic (pseudophakic/aphakic evidence)' : 'Pseudophakic';
  const PSEonly = lens === 'aphakic' ? 'Pseudophakic eyes (aphakic eyes were not studied)' : 'Pseudophakic';
  const inferiorPro = brk.filter(b => { const h = mod(b.h, 12); return h >= 5 - 1e-6 && h <= 7 + 1e-6; });
  // PIVOT / RDS: breaks in detached retina must lie above the 4 and 8 o’clock meridians (a break on them is outside)
  const lowThird = brk.filter(b => { const h = mod(b.h, 12); return h >= 4 - 1e-6 && h <= 8 + 1e-6; });
  const spread = hourSpread(brk.map(b => b.h));
  const fovOff = rd.total || rd.fovea === 'off' || (rd.macula === 'off' && !rd.fovea);
  const S = Object.fromEntries(PROCS.map(([id, name]) => [id, { id, name, score: 0, why: [], excluded: false }]));
  const add = (id, w, t, refs) => { S[id].score += w; S[id].why.push({ t, refs, sign: w > 0 ? 1 : w < 0 ? -1 : 0 }); };

  // pneumatic retinopexy: PIVOT / Retinal Detachment Study eligibility, plus clinical exclusions (marked as such)
  const pnrBlock = [];
  if (!brk.length) pnrBlock.push([all.length ? 'No break is drawn inside the detachment yet — PnR candidacy depends on where the break is.' : 'Locate the break first — PnR candidacy depends on where it is.', ['pivot']]);
  if (lowThird.length) pnrBlock.push([`Break at ${hourList(lowThird.map(b => b.h))} is not above the 4 and 8 o’clock meridians, outside the trial criteria.`, ['pivot', 'tornambe']]);
  if (brk.length > 1 && spread > 1 + 1e-6) pnrBlock.push([`Breaks spread over ${fmtSpan(spread)}; the trials allowed one break or a group within 1 clock hour.`, ['pivot', 'tornambe']]);
  if (pvrC) pnrBlock.push(['PVR grade C — excluded from the trials (significant PVR).', ['tornambe']]);
  if (hasGrt) pnrBlock.push(['Giant retinal tear — larger than the 1-clock-hour breaks the trials enrolled.', ['tornambe']]);
  if (hasDia) pnrBlock.push(['Retinal dialysis — buckling is the usual first operation (clinical judgement; not studied in the PnR trials).', []]);
  if (rd.total || rd.ring) pnrBlock.push(['Total / 360° detachment — clinical judgement: rarely suited to a single gas bubble.', []]);
  if (rd.cause === 'combined') pnrBlock.push(['Combined tractional–rhegmatogenous detachment — gas does not relieve the traction (clinical judgement).', []]);
  if (rd.cause === 'schisis') pnrBlock.push(['Schisis-detachment — outside the PnR trial populations (clinical judgement).', []]);
  if (pnrBlock.length) {
    S.pnr.excluded = true;
    for (const [t, refs] of pnrBlock) S.pnr.why.push({ t, refs, sign: -1 });
    if (!brk.length && pnrBlock.length === 1) S.pnr.pending = true;
  } else {
    add('pnr', 3, `Meets PIVOT criteria (${brk.length === 1 ? 'a single break' : 'breaks within 1 clock hour'} in detached retina, above the 4 and 8 o’clock meridians). PnR gave better 1-year acuity than vitrectomy (+4.9 letters) and less metamorphopsia; primary success 80.8% vs 93.2%, final reattachment about 99% with both.`, ['pivot']);
    add('pnr', 0.5, 'Against scleral buckling in the same criteria: single-operation success 73% vs 82%, final 99% vs 98%; 20/50 or better in 80% vs 56% when the macula had been off ≤2 weeks; more new breaks (23% vs 13%). Cochrane: PnR may reattach slightly less often (RR 0.91, low certainty) with more recurrence but fewer complications.', ['tornambe', 'cochPnr']);
    if (phakic) add('pnr', 0.5, 'Phakic: cataract surgery within a year in 16% after PnR vs 65% after vitrectomy.', ['pivot']);
    add('pnr', pseudo ? -1 : -0.5, `Real-world caution: single-operation success was 59.8% across 13,302 IRIS Registry eyes${pseudo ? ', and lower in pseudophakic than phakic eyes (53.9% vs 64.5%)' : phakic ? ' (64.5% in phakic eyes)' : ''}.`, ['iris']);
    if (vh) add('pnr', -1, 'Vitreous haemorrhage can hide further breaks (clinical judgement).', []);
    add('ppv', 0.5, 'In detachments that qualified for PnR, vitrectomy reached 94.0% single-surgery success in a real-world series.', ['kurochkin']);
  }

  // scleral buckle
  if (hasDia) add('sb', 3, 'Retinal dialysis: buckling alone was the first operation in 82% of a 10-year series (single-operation success 77%), with cataract surgery in 15% vs all 6 eyes after combined surgery; segmental buckles held long term.', ['rohowetz', 'stoffelns']);
  if (phakic) add('sb', 2, 'Phakic: single-surgery success 91.7% with SB vs 83.1% with PPV in PRO, and better vision than PPV or PPV/SB in macula-on and fovea-splitting eyes; in the SPR trial phakic eyes gained more acuity after SB, with less cataract progression.', ['pro2', 'spr']);
  if (pvd === 'none') add('sb', 2, 'No PVD (attached hyaloid), typical of round-hole detachments in young myopes: in a 110-eye round-hole series (hyaloid attached in 86%), 99% reattached with one procedure, nearly all by cryotherapy and buckle.', ['ung']);
  if (pseudo) add('sb', -1, `${PSE}: primary success 53.4% with SB vs 72.0% with PPV in the SPR trial.`, ['spr']);
  if (pvrC) add('sb', -2, 'PVR grade C: the published tamponade evidence comes from vitrectomised eyes (Silicone Study, grade C-3 or worse); buckling alone was not studied there.', ['sil1', 'sil2']);
  if (hasGrt) add('sb', -2, 'Giant retinal tear: vitrectomy-based repair is the mainstay; a buckle is used mainly as an adjunct.', ['berrocal']);

  // vitrectomy
  if (pseudo) add('ppv', 1, `${PSE}: higher primary success than SB in the SPR trial (72.0% vs 53.4%).`, ['spr']);
  if (pseudo) add('ppv', -0.5, `${PSEonly} in PRO: single-surgery success 84% with PPV alone vs 92% with an added buckle.`, ['pro3']);
  if (phakic) add('ppv', -1, 'Phakic: lowest single-surgery success of the three in PRO (83.1%), and cataract progression afterwards (Cochrane RR 1.71).', ['pro2', 'cochPpv']);
  if (pvrC) add('ppv', 3, 'Severe PVR: vitrectomy with silicone oil or C3F8 — the Silicone Study (grade C-3 or worse) found both better than SF6.', ['sil1', 'sil2']);
  if (hasGrt) add('ppv', 3, 'Giant retinal tear: small-gauge vitrectomy reattached 93% at the first operation without an encircling band (83% received silicone oil); perfluorocarbon liquid holds the flap.', ['kunikata', 'mikhail']);
  if (pvd === 'none') add('ppv', -1, 'No PVD: vitrectomy has to create one; a preoperative PVD predicted vitrectomy success in a prospective cohort.', ['vorob']);
  else if (pvd === 'complete' || pvd === 'yes') add('ppv', 0.5, 'PVD present: a preoperative PVD predicted vitrectomy success in a prospective cohort.', ['vorob']);
  if (inferiorPro.length) add('ppv', -1.5, 'Inferior break (5–7 o’clock): single-surgery success 76.8% with PPV alone vs 87.4% with an added buckle (68.6% vs 85.2% in phakic eyes).', ['pro9']);
  if (vh) add('ppv', 1, 'Vitreous haemorrhage is among the findings PRO investigators counted as favouring vitrectomy.', ['pro2']);

  // vitrectomy + buckle
  if (pseudo) add('ppvsb', 1.5, `${PSEonly} in PRO: single-surgery success 92% vs 84% with PPV alone; 96% vs 82% for inferior detachments.`, ['pro3']);
  if (phakic) add('ppvsb', 1.5, 'Phakic: single-surgery success 91.2% in PRO — similar to SB (91.7%), above PPV (83.1%).', ['pro2']);
  if (inferiorPro.length) add('ppvsb', 0.5, 'Inferior break (5–7 o’clock): an added buckle beat PPV alone (87.4% vs 76.8%); PRO did not compare it with a buckle alone.', ['pro9']);
  if (pvrC) add('ppvsb', 3, 'Severe PVR: vitrectomy with silicone oil or C3F8 (Silicone Study, grade C-3 or worse); the trial did not test an added buckle.', ['sil1', 'sil2']);
  if (hasGrt) add('ppvsb', 0, 'Giant retinal tear: an encircling band may not be needed — one series of 41 eyes reattached 93% without it (2 later needed a band).', ['kunikata']);
  if (hasDia) add('ppvsb', 0.5, 'Dialysis with a poor view or PVR: vitrectomy (with a circumferential buckle in 24 of 30 eyes) reattached 90% at the first operation.', ['yap']);
  if (pvd === 'none') add('ppvsb', -0.5, 'No PVD: the vitrectomy has to create one.', ['vorob']);
  if (vh) add('ppvsb', 0.5, 'Vitreous haemorrhage is among the findings PRO investigators counted as favouring vitrectomy.', ['pro2']);

  const list = Object.values(S);
  const top = Math.max(...list.filter(o => !o.excluded).map(o => o.score));
  for (const o of list) {
    if (o.excluded) o.tier = o.pending ? 'pending' : 'less';
    else if (o.score >= 2 && o.score >= top - 1) o.tier = 'favoured';
    else if (o.score >= 0) o.tier = 'consider';
    else o.tier = 'less';
  }
  const order = { favoured: 0, consider: 1, pending: 2, less: 3 };
  list.sort((a, b) => (order[a.tier] - order[b.tier]) || (b.score - a.score));

  // what the card knows
  const facts = [];
  facts.push(rd.total ? 'Total RD' : rd.ring ? '360° RD' : rd.island ? 'Posterior RD (not to the ora)' : `RD ${fmtHour(rd.start)}–${fmtHour(rd.end)}`);
  const mt = rd.total ? 'macula off' : macText(rd.macula, rd.fovea);
  if (mt) facts.push(cap(mt));
  if (brk.length) facts.push(`${brk.length === 1 ? 'Break' : brk.length + ' breaks'} at ${listJoin(brk.map(b => fmtHour(b.h)))}${inferiorPro.length ? ' (inferior)' : lowThird.length ? ' (inferior third)' : ''}`);
  else facts.push('No break drawn in the detachment');
  if (pvrC) facts.push('PVR C');
  if (hasGrt) facts.push('Giant tear');
  if (hasDia) facts.push('Dialysis');
  if (vh) facts.push('Vitreous haemorrhage');
  if (lens) facts.push(LENS_TEXT[lens]);
  if (pvd) facts.push(PVD_TEXT[pvd]);

  let timing = null;
  const PIV = 'PIVOT treated macula-on detachments within 24 hours and macula-off detachments within 72 hours.';
  if (fovOff) timing = { t: 'Fovea off: final acuity was better when vitrectomy repair came within 6 days of macular symptoms (mean 20/25 vs 20/50); a 3–7-day delay matched repair within 48 hours, while more than 7 days did worse.', refs: ['kim2013', 'elghawy'] };
  else if (rd.fovea === 'split') timing = { t: 'Fovea splitting: part of the fovea is detached and the rest is at immediate risk. ' + PIV, refs: ['pivot'] };
  else if (rd.macula === 'off') timing = { t: `Macula off, fovea ${rd.fovea === 'thr' ? 'on but threatened' : 'still on'}. ` + PIV, refs: ['pivot'] };
  else if (rd.macula || rd.fovea) timing = { t: `${rd.macula === 'thr' ? 'Macula threatened' : 'Macula on'}: PIVOT treated macula-on detachments within 24 hours.`, refs: ['pivot'] };
  const notes = [];
  if (pvrC) notes.push({ t: 'Tamponade in severe PVR (grade C-3 or worse): silicone oil and C3F8 gave similar overall results; both did better than SF6.', refs: ['sil1', 'sil2'] });
  if (hasGrt) notes.push({ t: 'Giant tear: perfluorocarbon liquid left about a week as a short-term tamponade, then gas or oil — no slippage, 90.9% attached at final review.', refs: ['mikhail'] });
  notes.push({ t: 'Prophylactic 360° laser at vitrectomy: evidence conflicts — PRO data suggest poorer outcomes, a single-centre series found it protective.', refs: ['proSum', 'elghawy'] });
  notes.push({ t: 'Final reattachment is about 94–99% whichever primary operation is chosen; the trials differ mainly in first-operation success, vision and cataract.', refs: ['cochPpv', 'pivot'] });
  const caveat = rd.cause === 'combined' ? 'This is a combined tractional–rhegmatogenous detachment; the trials below enrolled primary rhegmatogenous detachments, so they apply only in part.'
    : rd.cause === 'schisis' ? 'This is a schisis-detachment; the trials below enrolled primary rhegmatogenous detachments, so they apply only in part.'
    : rd.island ? 'This detachment does not reach the ora (as with a macular-hole detachment); the trials below enrolled detachments extending to the ora, so they apply only in part.' : null;
  return { state: 'ok', ask, facts, options: list, timing, notes, caveat, refs: REPAIR_REFS };
}

/* sanitize actions coming from outside (Claude interpretation) */
const OK_TYPES = new Set(Object.keys(LABEL));
function sanitizeActions(list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  const H = v => (typeof v === 'number' && isFinite(v) && v > 0 && v <= 12.99) ? normHour(v) : null;
  for (const a of list.slice(0, 40)) {
    if (!a || typeof a !== 'object') continue;
    switch (a.op) {
      case 'eye': if (a.eye === 'OD' || a.eye === 'OS') out.push({ op: 'eye', eye: a.eye }); break;
      case 'undo': case 'redo': case 'clear': out.push({ op: a.op }); break;
      case 'lincoff': out.push({ op: 'lincoff', on: a.on !== false }); break;
      case 'status': {
        const m = ['on', 'thr', 'off'].includes(a.macula) ? a.macula : null;
        const f = ['on', 'thr', 'split', 'off'].includes(a.fovea) ? a.fovea : null;
        if (m || f) out.push({ op: 'status', macula: m, fovea: f });
        break;
      }
      case 'rdmod': {
        const o = { op: 'rdmod' };
        if (['bullous', 'shallow', 'normal'].includes(a.depth)) o.depth = a.depth;
        if (a.chronic === true) o.chronic = true;
        if (EXTENT_R[a.extent]) o.extent = a.extent;
        if (['exudative', 'combined', 'schisis'].includes(a.cause)) o.cause = a.cause;
        if (a.rolled === true) o.rolled = true;
        if (Object.keys(o).length > 1) out.push(o);
        break;
      }
      case 'extend': if (H(a.to)) out.push({ op: 'extend', to: H(a.to) }); break;
      case 'meta': { const o = { op: 'meta' }; if (Object.prototype.hasOwnProperty.call(PVD_TEXT, a.pvd)) o.pvd = a.pvd; if (Object.prototype.hasOwnProperty.call(LENS_TEXT, a.lens)) o.lens = a.lens; if (o.pvd || o.lens) out.push(o); break; }
      case 'remove': if (a.last) out.push({ op: 'remove', last: true }); else if (OK_TYPES.has(a.type)) out.push({ op: 'remove', type: a.type, key: a.type === 'cat' && CAT[a.key] ? a.key : undefined, hour: H(a.hour) || undefined }); break;
      case 'move': if (H(a.to)) out.push({ op: 'move', type: OK_TYPES.has(a.type) ? a.type : null, key: a.type === 'cat' && CAT[a.key] ? a.key : undefined, from: H(a.from), to: H(a.to), quad: QUAD_NAMES[a.quad] && a.quad !== 'all' ? a.quad : undefined }); break;
      case 'add': {
        const f = a.f || {};
        if (!OK_TYPES.has(f.type)) break;
        const g = { type: f.type };
        if (f.type === 'cat') {
          const E = CAT[f.key];
          if (!E || E.map) break;
          g.key = E.id;
          if (SITES.includes(f.site)) g.site = f.site;
          if (f.arc === 's' || f.arc === 'i') g.arc = f.arc;
          if (typeof f.count === 'number' && f.count > 1) g.count = Math.min(12, Math.round(f.count));
          if (QUAD_NAMES[f.quad]) g.quad = f.quad;
          if (isTumor(E)) cleanTumor(f, g);
        }
        if (['exudative', 'combined', 'schisis'].includes(f.cause)) g.cause = f.cause;
        if (f.hem === true) g.hem = true;
        if (f.kissing === true) g.kissing = true;
        if (f.fresh === true) g.fresh = true;
        if (f.tear === true) g.tear = true;
        if (f.full === true) g.full = true;
        if (f.type === 'rd' && f.total) { g.total = true; g.start = 12; g.end = 12; }
        else if (H(f.start) && H(f.end)) { g.start = H(f.start); g.end = H(f.end); }
        if (H(f.hour)) g.hour = H(f.hour);
        if (Array.isArray(f.hours)) g.hours = f.hours.map(H).filter(Boolean);
        if (typeof f.size === 'number') g.size = Math.max(0.6, Math.min(1.6, f.size));
        if (['bullous', 'shallow', 'normal'].includes(f.depth)) g.depth = f.depth;
        if (EXTENT_R[f.extent]) g.extent = f.extent;
        if (f.chronic === true) g.chronic = true;
        if (f.encircling === true) g.encircling = true;
        if (['A', 'B', 'C'].includes(f.grade)) g.grade = f.grade;
        if (['P', 'A'].includes(f.loc)) g.loc = f.loc;
        if (f.pigmented === true) g.pigmented = true;
        if (f.cuff === true) g.cuff = true;
        if (f.holes === true) g.holes = true;
        if (['ora', 'post'].includes(f.radial)) g.radial = f.radial;
        if (f.around === 'breaks') g.around = 'breaks';
        if (['dense', 'mild', 'moderate'].includes(f.density)) g.density = f.density;
        const needsSpan = ['rd', 'grt', 'dia', 'lat'].includes(g.type);
        const needsHour = ['hst', 'oph', 'hole', 'tuft', 'pav'].includes(g.type);
        if (needsSpan && g.start == null && !g.total) break;
        if (needsHour && g.hour == null) break;
        if (g.type === 'vh' && g.hour == null) g.hour = 6;
        if (g.type === 'buckle' && g.start == null) g.encircling = true;
        if (g.type === 'chd' && g.start == null) { g.total = true; g.start = 12; g.end = 12; }
        if ((g.type === 'laser' || g.type === 'cryo') && g.hour == null && g.start == null) { if (g.full) { g.start = 12; g.end = 12; } else g.around = 'breaks'; }
        out.push({ op: 'add', f: g });
        break;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Teaching review. A resident's drawing travels inside a link; a fellow
 * or attending corrects it with the normal tools and pins comments; the
 * link goes back with both versions. Everything here is pure: where a
 * finding sits on the chart, what changed between two drawings, and a
 * strict clean-up of anything that arrives in a link (it comes from
 * someone else, so nothing in it is trusted).
 * ------------------------------------------------------------------ */
/* a point on the chart that stands for a finding (for change markers and comments) */
function findingAnchor(f, scene) {
  const at = (r, h) => polar(r, hourToAngle(h));
  switch (f.type) {
    case 'hst': case 'hole': case 'oph': case 'tuft': case 'pav': return at(radiusFor(f), f.hour);
    case 'lat': return at(f.r != null ? f.r : f.radial === 'post' ? G.R_EQ - 12 : G.LATTICE_R, midHour(f.start, f.end));
    case 'grt': case 'dia': return at(G.R_ORA - 22, midHour(f.start, f.end));
    case 'rd': return f.total || f.ring ? at(G.R_ORA - 40, 12) : f.island && spanHours(f.start, f.end) >= 12 ? [0, -70] : at(G.R_ORA - 40, midHour(f.start, f.end));
    case 'chd': return at(G.R_EQ + 34, f.total ? 6 : midHour(f.start, f.end));
    case 'pvr': return Array.isArray(f.pts) && f.pts.length ? f.pts[0].slice(0, 2) : f.hours && f.hours.length ? at(G.R_EQ - 34, f.hours[0]) : at(G.R_EQ - 34, 6);
    case 'vh': return at(f.r != null ? f.r : (G.R_EQ + G.R_ORA) / 2 - 12, f.hour);
    case 'laser': case 'cryo': {
      const t = f.target != null && scene ? scene.findings.find(x => x.id === f.target) : null;
      if (t) { const p = findingAnchor(t, scene); return [p[0] + 16, p[1] + 16]; }
      if (f.hour != null) return at(f.r != null ? f.r : G.TEAR_R, f.hour);
      if (Array.isArray(f.line) && f.line.length) return f.line[Math.floor(f.line.length / 2)].slice(0, 2);
      if (f.start != null) return at(G.R_ORA - 50, midHour(f.start, f.end));
      return at(G.R_ORA - 50, 12);
    }
    case 'buckle': return f.radial ? at(Math.min(G.R_ORA - 26, (f.r || G.TEAR_R) - 6), f.hour) : at(G.R_ORA - 26, f.encircling || f.start == null ? 3 : midHour(f.start, f.end));
    case 'cat': { const P = catPlace(f, scene ? scene.eye : 'OS'); return P ? [P.x, P.y] : null; }
  }
  return null;
}
/* what changed from drawing a (the resident's) to drawing b (the corrected one) */
const DIFF_SKIP = new Set(['id', 'seed']);
function sameFinding(x, y) {
  const norm = (f) => { const o = {}; for (const k of Object.keys(f).sort()) if (!DIFF_SKIP.has(k) && f[k] !== undefined && f[k] !== null && f[k] !== false) o[k] = f[k]; return JSON.stringify(o); };
  return norm(x) === norm(y);
}
function diffScenes(a, b) {
  const out = [];
  const A = new Map(a.findings.map(f => [f.id, f])), B = new Map(b.findings.map(f => [f.id, f]));
  if (a.eye !== b.eye) out.push({ kind: 'changed', what: 'eye', text: `Eye changed from ${a.eye} to ${b.eye}` });
  for (const [id, f] of B) {
    const o = A.get(id);
    if (!o) { out.push({ kind: 'added', id, type: f.type, text: findingTitle(f, b.eye), at: findingAnchor(f, b) }); continue; }
    if (sameFinding(o, f)) continue;
    const t0 = findingTitle(o, a.eye), t1 = findingTitle(f, b.eye);
    const parts = [];
    if (t0 !== t1) parts.push(`${t0} → ${t1}`);
    if (f.type === 'rd') {
      const m0 = o.total ? 'macula off' : macText(o.macula, o.fovea), m1 = f.total ? 'macula off' : macText(f.macula, f.fovea);
      if (m0 !== m1) parts.push(`${m0 || 'macular status not recorded'} → ${m1 || 'macular status not recorded'}`);
      if (!!o.path !== !!f.path) parts.push(f.path ? 'border redrawn by hand' : 'standard outline');
      else if (o.path && f.path && JSON.stringify(o.path) !== JSON.stringify(f.path) && t0 === t1 && m0 === m1) parts.push('border reshaped');
      if ((o.depth || 'normal') !== (f.depth || 'normal')) parts.push(`${o.depth || 'standard'} → ${f.depth || 'standard'}`);
      if (!!o.chronic !== !!f.chronic) parts.push(f.chronic ? 'marked chronic' : 'no longer chronic');
    }
    if (f.type === 'cat' && isTumor(CAT[f.key])) {
      const d0 = tumorFeatures(o, true).join(', '), d1 = tumorFeatures(f, true).join(', ');
      if (d0 !== d1) parts.push(d0 && d1 ? `${d0} → ${d1}` : d1 ? `now ${d1}` : `no longer described as ${d0}`);
    }
    if ((o.size || 1) !== (f.size || 1) && t0 === t1) parts.push(`${t1} ${(f.size || 1) > (o.size || 1) ? 'enlarged' : 'made smaller'}`);
    if (!parts.length) {
      const p0 = findingAnchor(o, a), p1 = findingAnchor(f, b);
      parts.push(p0 && p1 && Math.hypot(p0[0] - p1[0], p0[1] - p1[1]) > 6 ? `${t1} moved` : `${t1} adjusted`);
    }
    out.push({ kind: 'changed', id, type: f.type, text: parts.join('; '), at: findingAnchor(f, b), from: findingAnchor(o, a) });
  }
  for (const [id, f] of A) if (!B.has(id)) out.push({ kind: 'removed', id, type: f.type, text: findingTitle(f, a.eye), at: findingAnchor(f, a) });
  const meta = (k, T) => { if ((a[k] || null) !== (b[k] || null)) out.push({ kind: 'changed', what: k, text: `${k === 'pvd' ? 'PVD' : 'Lens'}: ${T[a[k]] || 'not recorded'} → ${T[b[k]] || 'not recorded'}` }); };
  meta('pvd', PVD_TEXT); meta('lens', LENS_TEXT);
  return out;
}

/* strict clean-up of a drawing that arrived from someone else */
const ENUMS = {
  radial: ['post', 'ora'], depth: ['normal', 'bullous', 'shallow'], macula: ['on', 'thr', 'off'], fovea: ['on', 'thr', 'split', 'off'],
  cause: ['exudative', 'combined', 'schisis'], grade: ['A', 'B', 'C'], loc: ['P', 'A'], density: ['dense', 'mild', 'moderate'],
  arc: ['s', 'i'], around: ['breaks'],
};
const BOOLS = ['total', 'chronic', 'ring', 'island', 'aroundFovea', 'rolled', 'cuff', 'pigmented', 'holes', 'tear', 'encircling', 'kissing', 'hem', 'fresh', 'full', 'located', 'multi'];
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const numIn = (v, lo, hi) => (typeof v === 'number' && isFinite(v) && v >= lo && v <= hi) ? v : null;
const pt2 = (q) => Array.isArray(q) && q.length >= 2 && numIn(q[0], -900, 900) != null && numIn(q[1], -900, 900) != null ? [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10] : null;
function sanitizeFinding(f) {
  if (!f || typeof f !== 'object' || !OK_TYPES.has(f.type)) return null;
  const g = { type: f.type };
  const id = numIn(f.id, 1, 1e6); if (id == null) return null; g.id = Math.round(id);
  const seed = numIn(f.seed, 0, 4294967295); if (seed != null) g.seed = Math.round(seed);
  for (const k of ['hour', 'start', 'end']) { const h = numIn(f[k], 0.0001, 12.9999); if (h != null) g[k] = normHour(h); }
  const r = numIn(f.r, 0, 400); if (r != null) g.r = r;
  const size = numIn(f.size, 0.4, 3); if (size != null) g.size = size;
  const ext = f.extent; if (typeof ext === 'number') { const e = numIn(ext, 0, 12); if (e != null) g.extent = e; } else if (own(EXTENT_R, ext)) g.extent = ext;
  const count = numIn(f.count, 1, 12); if (count != null) g.count = Math.round(count);
  const tgt = numIn(f.target, 1, 1e6); if (tgt != null) g.target = Math.round(tgt);
  for (const [k, vals] of Object.entries(ENUMS)) if (vals.includes(f[k])) g[k] = f[k];
  for (const k of BOOLS) if (f[k] === true) g[k] = true;
  if (Array.isArray(f.hours)) g.hours = f.hours.slice(0, 24).map(h => numIn(h, 0.0001, 12.9999)).filter(h => h != null).map(normHour);
  if (f.type === 'buckle') { if (f.radial === true) g.radial = true; if (f.onBand === true) g.onBand = true; if (f.ant === true) g.ant = true; if (own(BUCKLE_EL, f.el)) g.el = f.el; }
  if (Array.isArray(f.pts) && f.type === 'pvr') g.pts = f.pts.slice(0, 12).map(pt2).filter(Boolean);
  if (Array.isArray(f.line) && (f.type === 'laser' || f.type === 'cryo')) {
    let ln = f.line.slice(0, 3000).map(pt2).filter(Boolean);
    if (ln.length > 400) ln = resamplePath(ln, pathLength(ln) / 380).map(round1);
    if (ln.length >= 2 && pathLength(ln) >= 6) g.line = ln;
  }
  if (f.type === 'cat') {
    if (!own(CAT, f.key)) return null;
    g.key = f.key;
    if (SITES.includes(f.site)) g.site = f.site;
    if (own(QUAD_NAMES, f.quad)) g.quad = f.quad;
    const at = pt2(f.at); if (at) g.at = at;
    if (isTumor(CAT[f.key])) cleanTumor(f, g);
  }
  if (f.type === 'rd' && f.path && typeof f.path === 'object' && Array.isArray(f.path.pts)) {
    let pts = f.path.pts.slice(0, 3000).map(pt2).filter(Boolean);
    // a real traced outline has some length; very long ones are thinned so they stay quick to draw
    if (pts.length > 300) pts = resamplePath(pts, pathLength(pts) / 280).map(round1);
    if (pts.length >= 3 && pathLength(pts) >= 40) {
      g.path = { pts, closed: f.path.closed === true };
      if (g.path.closed) g.path.inside = f.path.inside !== false; else g.path.dir = f.path.dir === -1 ? -1 : 1;
    }
  }
  // what each kind of finding needs in order to be drawn
  if (['hst', 'hole', 'oph', 'tuft', 'pav', 'vh'].includes(g.type) && g.hour == null) return null;
  if (g.type === 'buckle' && g.radial && g.hour == null) return null;
  if (['lat', 'grt', 'dia'].includes(g.type) && (g.start == null || g.end == null)) return null;
  if (g.type === 'rd' && !g.total && !g.path && (g.start == null || g.end == null)) return null;
  if (g.type === 'rd' && g.path && (g.start == null || g.end == null)) { const d = rdFromPath(g.path); g.start = d.start; g.end = d.end; }
  if (g.type === 'chd' && !g.total && (g.start == null || g.end == null)) { g.total = true; g.start = 12; g.end = 12; }
  return g;
}
function sanitizeScene(s) {
  if (!s || typeof s !== 'object') return null;
  const out = emptyScene(s.eye === 'OD' ? 'OD' : 'OS');
  const seen = new Set();
  for (const f of (Array.isArray(s.findings) ? s.findings.slice(0, 400) : [])) {
    const g = sanitizeFinding(f);
    if (g && !seen.has(g.id)) { seen.add(g.id); out.findings.push(g); }
  }
  for (const f of out.findings) if (f.target != null && !seen.has(f.target)) delete f.target;
  out.findings = out.findings.filter(f => !((f.type === 'laser' || f.type === 'cryo') && f.target == null && f.hour == null && f.start == null && !f.around && !f.line));
  if (own(PVD_TEXT, s.pvd)) out.pvd = s.pvd;
  if (own(LENS_TEXT, s.lens)) out.lens = s.lens;
  out.lincoff = s.lincoff === true;
  out.nextId = Math.max(1, ...out.findings.map(f => f.id + 1));
  return out;
}
const clip = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '';
function sanitizeReview(r) {
  if (!r || typeof r !== 'object' || r.v !== 1) return null;
  const o = sanitizeScene(r.o);
  if (!o) return null;
  const out = { v: 1, st: r.st === 'reviewed' ? 'reviewed' : 'submitted', o, case: clip(r.case, 80), author: clip(r.author, 80), reviewer: clip(r.reviewer, 80), fb: clip(r.fb, 4000) };
  const t = numIn(r.t, 1.5e12, 4e12); if (t != null) out.t = t;
  const rt = numIn(r.rt, 1.5e12, 4e12); if (rt != null) out.rt = rt;
  if (out.st === 'reviewed') { const c = sanitizeScene(r.c); if (!c) return null; out.c = c; }
  out.cm = (Array.isArray(r.cm) ? r.cm.slice(0, 60) : []).map(c => {
    if (!c || typeof c !== 'object') return null;
    const at = pt2(c.at); const text = clip(c.text, 1000);
    if (!at) return null;
    const m = { at, text };
    const fid = numIn(c.f, 1, 1e6); if (fid != null) m.f = Math.round(fid);
    return m;
  }).filter(Boolean);
  return out;
}

const API = {
  G, TAU, DEG, mod, normHour, hourToAngle, angleToHour, spanHours, hourDist, inSpan, midHour, hourHeight, fmtHour, fmtSpan, polar,
  temporalHour, nasalHour, discCenter, quadrant, normalize, tokenize, parse, describeAction, findingTitle, LABEL, macText,
  emptyScene, clone, applyActions, applyStatus, rdsOf, mainRd, findingHour, BREAK_TYPES,
  rdShape, rdDepthTarget, makeField, contour, chaikin, rdGeometry, radiusFor, mulberry32, smooth01,
  lincoff, lincoffTriangle, clinicalNote, sanitizeActions, EXTENT_R,
  CATALOG, CAT, GROUPS, catPlace, catLocText, catName, POSTERIOR_SITES, SITE_TEXT, SITES, QUAD_NAMES, stage1,
  prepareStroke, pathOptions, pickPathSide, rdFromPath, pathShape, pathField, pathAgrees, PVD_TEXT, LENS_TEXT, repairOptions, REPAIR_REFS, PROCS,
  DISC_RECIPES, QUAD_RECIPES, siteAt, findingAnchor, diffScenes, sanitizeScene, sanitizeReview,
  breakPoints, hourSpread, BUCKLE_EL, lineSpan, laserLineSpots, sizeWord,
  isTumor, MELANOCYTIC, TUM_KEYS, DD_UNITS, MM_PER_DD, ELEV_TEXT, SHAPE_TEXT, SRF_TEXT, SRF_SHORT, toDD, fmtNum, tumorSize, tumorRadii, tumorLevel, tumorFeatures, ellipseR, cleanTumor,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root.RD = API;
})(typeof window !== 'undefined' ? window : globalThis);
