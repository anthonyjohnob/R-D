/* R/D versions and what changed, newest first. The first entry is the version that runs.
   Numbering: a new feature goes up a step (1.2 → 1.3); fixes and small touches add a third number
   (1.3 → 1.3.1). Version 2 only when the owner decides a release is big enough for it.
   Every published update adds an entry here (tools/publish.sh refuses to publish the same version twice). */
(function (root) {
'use strict';
const CHANGELOG = [
  { v: '1.3', date: '2026-10-12', title: 'Resize by hand, traced laser, update notes', items: [
    'Tears, holes, tufts, paving stones, star folds, vitreous haemorrhage, laser spots and library findings can be resized by hand: tap one, then drag the round handle on its edge. Large and small tears and holes are named in the note.',
    'Laser can be traced exactly where you want it: pick Laser, then drag along the fundus and three rows of burns follow your line. A tap on a break still lasers around it.',
    'Version numbers, this update list, and a short note the first time a new version opens.',
  ] },
  { v: '1.2', date: '2026-10-11', title: 'Scleral buckle guide; breaks first', items: [
    'Scleral buckle guide: for the breaks drawn, the configuration the evidence supports (buckle alone, or with vitrectomy), the elements, placement and what to expect, with each point tagged by its level of evidence.',
    'Element guide to bands, tires, sponges and sleeves, with cross-sections.',
    'Outlining a detachment by hand opens the panel on the breaks, and the Lincoff zone is shaded while a break is placed.',
  ] },
  { v: '1.1.1', date: '2026-10-11', title: 'Fundus vessels', items: [
    'Disc vessels emerge at the nasal edge of the cup and line up with the retinal vessels; stray straight nasal vessels removed.',
  ] },
  { v: '1.1', date: '2026-10-11', title: 'Tumours and naevi', items: [
    'Size in disc diameters or mm, thickness, elevation (drawn raised), shape, orange pigment, drusen, subretinal fluid and distance from the disc or fovea — by voice, typing, or the editor in the findings list.',
  ] },
  { v: '1.0.1', date: '2026-10-11', title: 'Fixes', items: [
    'Opens on a clean chart.',
    'Clear during a teaching review asks what to clear, so review marks no longer linger.',
  ] },
  { v: '1.0', date: '2026-10-11', title: 'First release on the web', items: [
    'Retinal detachment drawing by voice, typing or hand in the standard colour code, with macular status, Lincoff analysis, evidence-based repair options, a 226-entry pathology library and an automatically written clinical note.',
    'Teaching review: send a drawing for review by link and get the corrections back.',
    'Works offline and installs as an app.',
  ] },
];
/* compare "1.2.1" with "1.3": negative, zero or positive */
function cmpVersion(a, b) {
  const A = String(a).split('.').map(Number), B = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(A.length, B.length); i++) { const d = (A[i] || 0) - (B[i] || 0); if (d) return d; }
  return 0;
}
const API = { CHANGELOG, VERSION: CHANGELOG[0].v, cmpVersion };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.RDChangelog = API;
})(typeof window !== 'undefined' ? window : globalThis);
