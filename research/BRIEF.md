# Brief for each researcher (shared)

You are building a structured catalogue of retinal / fundus pathology that a retina specialist can DRAW on a standard
indirect-ophthalmoscopy fundus chart (circles: equator, ora serrata, pars plana; clock hours 1–12, 12 = superior;
fovea at centre, disc nasal). The catalogue feeds a drawing app (RDraw), so every entry must say WHERE it sits, WHAT
SHAPE it is, and HOW it is coloured under the standard retinal drawing colour code.

## Tools
Load PubMed tools first with ToolSearch, query:
  "select:mcp__PubMed__search_articles,mcp__PubMed__get_article_metadata,mcp__PubMed__get_full_text_article,mcp__PubMed__convert_article_ids"
Use PubMed for every entry's definition / location / appearance (prefer reviews, classic descriptive papers, AAO/BCSC-style
reviews indexed in PubMed). You may also use WebSearch/WebFetch for colour-code conventions only (EyeWiki/AAO, university
teaching pages, textbooks) — PubMed rarely states colours.

## Standard colour code already established (CMS LCD L33567 Appendix A) — use it, cite it as "CMS L33567 App A"
- Red: retinal arteries, retinal hemorrhages, attached retina
- Blue: retinal veins, detached retina
- Yellow: chorioretinal exudate, intraretinal exudate, intraretinal edema
- Green: opacities in media, vitreous hemorrhage
- Purple: flat neovascularization; Orange: elevated neovascularization
- Brown: RPE or choroidal pigmentation seen through attached retina, and vascular occlusion
- Blue outline filled red: full-thickness sensory retinal break
- Blue outline cross-hatched red: partial-thickness sensory retinal break
- Black outline + black lattice pattern: lattice degeneration of attached retina; blue outline + blue lattice: lattice in detached retina
- Black outline cross-hatched red: paving-stone degeneration (attached); brown outline cross-hatched red: paving stone seen through detached retina
- Short blue lines: retinal tufts and meridional folds
- Black scalloped line on the ora circle: ora serrata with adjacent detached retina
- Green outline filled red: red blood in the vitreous
- Chart: inner circle equator, middle circle ora serrata, outer circle ciliary processes (band between = pars plana), small centre circle optic disc
Common textbook additions (verify/cite if you use them): black = retinal pigment / pigmented scars / demarcation lines;
brown = choroidal lesions (nevus, melanoma), choroidal detachment; yellow = drusen, exudates, edema; green = vitreous membranes, foreign bodies.
If no source specifies a colour, choose the convention that follows from the rules above and set "color_source" to
"inferred: <which rule>". Never invent a citation.

## Output
Write a JSON array to the file path you were given. One object per entry, exactly these keys:
{
 "id": "snake_case unique",
 "name": "Display name",
 "synonyms": ["lowercase phrases/abbreviations a clinician would type or dictate, incl. common voice-recognition variants"],
 "group": "breaks | peripheral_degenerations | detachments_schisis | vitreous | vascular | macula_posterior_pole | optic_disc | tumors_pigment | inflammatory_infectious | treatment_postop",
 "definition": "one precise clinical sentence",
 "location": {"zone": "fovea|macula|posterior_pole|arcades|peripapillary|disc|midperiphery|equator|periphery|ora|pars_plana|vitreous|any",
              "typical_clock": "e.g. 'inferotemporal' or null", "notes": "e.g. 'circumferential, between equator and ora'"},
 "shape": "point|cluster|patch|band_circumferential|band_radial|sector_region|dome|line|ring|vessel_segment|cloud|disc_change",
 "typical_size": "e.g. '1/4–1 disc diameter' or '1–3 clock hours'",
 "drawing": {"fill": "red|blue|green|yellow|black|brown|purple|orange|white|none",
             "outline": "red|blue|green|yellow|black|brown|purple|orange|none",
             "pattern": "solid|cross_hatch|parallel_hatch|stipple|dots|scalloped|short_lines|x_marks|wavy_lines|radial_lines|ring|none",
             "pattern_color": "colour or null",
             "description": "how it is drawn on the chart, 1–2 sentences"},
 "color_source": "CMS L33567 App A | <source title + URL> | inferred: <rule>",
 "pubmed": [{"pmid": "...", "doi": "...", "title": "...", "year": "..."}]
}
Rules: every entry needs ≥1 real PubMed reference you actually retrieved (PMID + DOI if present). Only include things
visible by ophthalmoscopy that a clinician would draw (no OCT-only or angiography-only findings). Aim for completeness in
your assigned area (typically 15–30 entries). When done, reply with a 5-line summary (count, any colour-code gaps).
