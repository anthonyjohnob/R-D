/* R/D versions and what changed, newest first. The first entry is the version that runs.
   Numbering: a new feature goes up a step (2.0 → 2.1); fixes and small touches add a third number
   (2.1 → 2.1.1). A new major version (3.0) only when the owner decides a release is big enough for it.
   Every published update adds an entry here (tools/publish.sh refuses to publish the same version twice). */
(function (root) {
'use strict';
const CHANGELOG = [
  { v: '2.0', date: '2026-10-12', title: 'Version 2: a simpler layout, made for phones', items: [
    'The chart fills the top of the screen. Under it, a strip sums up the eye — detachment, PVD and lens, repair options, Lincoff zone, buckle guide — and any chip opens its details.',
    'A dock at the bottom holds one big button (Trace the detachment, then Redraw and Add detachment) and the everyday tools: Tear, Hole, Lattice, Laser and More for everything else.',
    'A guide carries on by itself: trace the detachment, add the break (the tools to use glow), then record PVD and lens. Any step can be skipped.',
    'Once the drawing is done, four big buttons light up under the summary (in the top bar on a computer): Surgical options, Buckle guide (when a buckle is among the options), Save PNG and Send for review.',
    'Surgical options describe the evidence rather than a choice: a summary of where the published studies lean for an eye like this one, then each operation labelled most evidence for, some or mixed evidence, evidence leans against, or outside the trial criteria — with a count of the findings for and against.',
    'Tapping a finding opens its editor under the chart, with a size stepper as well as the lever, so the chart is never covered.',
    'Clear, save, share and the clinical note are one tap from the top bar; the laser pattern folds to one line once you start tracing.',
    'On a computer the tools sit in a rail on the left and panels open on the right. The classic layout is still in the ⋯ menu.',
    'Recording a complete PVD draws a Weiss ring, in the vitreous green, just in front of the disc.',
    'Half past twelve reads 12.5 in the clock-hour boxes, not 0.5.',
  ] },
  { v: '1.3', date: '2026-10-12', title: 'Easier drawing, a size lever, traced laser, update notes', items: [
    'Tapping the chart while drawing is off asks whether to start drawing.',
    'Once a detachment is drawn it stays put: a stray drag no longer starts a new one. Use Redraw to trace it again, or Add detachment for another.',
    'Tears, holes, tufts, paving stones, star folds, vitreous haemorrhage, laser spots and library findings can be resized: tap one and slide the lever beside it up to enlarge or down to shrink. Large and small tears and holes are named in the note.',
    'Laser can be traced exactly where you want it: pick Laser, choose the pattern — 1 to 5 rows, confluent or spaced, and the gap in burn widths — then drag along the fundus. Tap a break to laser around it in the same pattern; keep going for more lines, and tap Done when finished. Selecting a laser later lets you change its pattern.',
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
