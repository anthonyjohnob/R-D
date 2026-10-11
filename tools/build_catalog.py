"""Merge the four PubMed research sets into one curated catalogue (research/catalog.json).

Each entry keeps its colour code, definition, drawing description and PubMed references,
and gains the curation R/D needs to place and draw it: a recipe (generic shape or a
bespoke renderer), a default site, a default quadrant, a size factor, and — for entries
that the original R/D engine already draws (tears, lattice, RD, buckles…) — a mapping
onto that engine's finding type.
"""
import json, glob, re, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
raw = []
for f in sorted(glob.glob(str(root / 'research' / '[1-4]_*.json'))):
    raw += json.load(open(f))

# --- extra entries not covered by the research sets (verified on PubMed) ---
raw += [
    {
        'id': 'retinitis_pigmentosa_bone_spicules', 'name': 'Bone-spicule pigmentation (retinitis pigmentosa)',
        'synonyms': ['bone spicules', 'bone spicule pigmentation', 'bone spicule', 'bone corpuscles', 'retinitis pigmentosa', 'rp pigment', 'pigmentary retinopathy', 'rp'],
        'group': 'dystrophies',
        'definition': 'Intraretinal pigment formed by RPE cells that migrate along retinal vessels after photoreceptor loss; the hallmark mid-peripheral fundus sign of retinitis pigmentosa, usually with attenuated arterioles and waxy disc pallor.',
        'location': {'zone': 'midperiphery', 'typical_clock': '360 degrees', 'notes': 'Mid-periphery around the equator, sparing the macula until late; spicules outline the retinal capillary network.'},
        'shape': 'cluster', 'typical_size': 'scattered spicules ~1/10 DD, confluent in a ring',
        'drawing': {'fill': 'black', 'outline': 'none', 'pattern': 'solid', 'pattern_color': None,
                    'description': 'Small black branching (spicule-shaped) marks scattered in a ring through the mid-periphery, following the vessels; leave the posterior pole clear.'},
        'color_source': 'eOphtha drawing convention (black solid = hyperpigmentation / intraretinal pigment); same convention as RPE hyperplasia in this catalogue',
        'pubmed': [
            {'pmid': '17113430', 'doi': '10.1016/S0140-6736(06)69740-7', 'title': 'Retinitis pigmentosa.', 'year': '2006'},
            {'pmid': '7777280', 'doi': '10.1016/s0161-6420(95)30953-0', 'title': 'Histopathology of bone spicule pigmentation in retinitis pigmentosa.', 'year': '1995'},
            {'pmid': '20012642', 'doi': '10.1007/s00417-009-1253-9', 'title': 'Bone spicule pigment formation in retinitis pigmentosa: insights from a mouse model.', 'year': '2009'},
        ],
    },
    {
        'id': 'stargardt_flecks', 'name': 'Stargardt flecks (fundus flavimaculatus)',
        'synonyms': ['stargardt flecks', 'stargardt disease', 'stargardt', 'fundus flavimaculatus', 'pisciform flecks', 'yellow flecks', 'flecks', 'stgd'],
        'group': 'dystrophies',
        'definition': 'Yellow-white pisciform lipofuscin flecks at the level of the RPE in ABCA4 Stargardt disease, scattered around the macula and posterior pole, often with central atrophy.',
        'location': {'zone': 'posterior_pole', 'typical_clock': None, 'notes': 'Posterior pole and around the arcades, sparing the peripapillary ring.'},
        'shape': 'cluster', 'typical_size': 'flecks 1/10–1/4 DD',
        'drawing': {'fill': 'yellow', 'outline': 'none', 'pattern': 'solid', 'pattern_color': None,
                    'description': 'Scattered small yellow fish-tail (pisciform) flecks through the posterior pole; add macular atrophy if present.'},
        'color_source': 'inferred: CMS L33567 App A yellow = exudate/deposits at the level of the RPE (same family as drusen)',
        'pubmed': [{'pmid': '27491360', 'doi': '10.1136/bjophthalmol-2016-308823', 'title': 'Stargardt disease: clinical features, molecular genetics, animal models and therapeutic options.', 'year': '2016'}],
    },
]

# --- entries the original engine already draws ------------------------------
MAP = {
    'horseshoe_tear': {'type': 'hst'}, 'operculated_hole': {'type': 'oph'}, 'atrophic_round_hole': {'type': 'hole'},
    'giant_retinal_tear': {'type': 'grt'}, 'retinal_dialysis': {'type': 'dia'},
    'lattice_degeneration': {'type': 'lat'}, 'lattice_with_atrophic_holes': {'type': 'lat', 'holes': True},
    'lattice_with_tractional_tear': {'type': 'lattear'}, 'pigmented_lattice': {'type': 'lat', 'pigmented': True},
    'lattice_in_detached_retina': {'type': 'lat'},
    'paving_stone_degeneration': {'type': 'pav'}, 'paving_stone_in_detached_retina': {'type': 'pav'},
    'retinal_tuft': {'type': 'tuft'}, 'cystic_retinal_tuft': {'type': 'tuft'}, 'noncystic_retinal_tuft': {'type': 'tuft'}, 'zonular_traction_tuft': {'type': 'tuft'},
    'rhegmatogenous_retinal_detachment': {'type': 'rd'}, 'subclinical_retinal_detachment': {'type': 'rd', 'depth': 'shallow'},
    'exudative_retinal_detachment': {'type': 'rd', 'cause': 'exudative'}, 'combined_tractional_rhegmatogenous_rd': {'type': 'rd', 'cause': 'combined'},
    'schisis_detachment': {'type': 'rd', 'cause': 'schisis'},
    'demarcation_line': {'type': 'dem'}, 'ora_with_detached_retina': {'type': 'auto'},
    'serous_choroidal_detachment': {'type': 'chd'}, 'kissing_choroidal_detachment': {'type': 'chd', 'kissing': True},
    'suprachoroidal_hemorrhage': {'type': 'chd', 'hem': True},
    'pvr_star_fold': {'type': 'star'}, 'anterior_pvr': {'type': 'pvr', 'loc': 'A'}, 'rolled_edge_of_tear': {'type': 'rolled'},
    'pvr_funnel_detachment': {'type': 'funnel'},
    'vitreous_hemorrhage': {'type': 'vh'}, 'red_blood_in_vitreous': {'type': 'vh', 'fresh': True},
    'encircling_scleral_buckle': {'type': 'buckle', 'encircling': True}, 'segmental_scleral_buckle': {'type': 'buckle'},
    'laser_retinopexy': {'type': 'laser'}, 'laser_demarcation_barrier': {'type': 'laser'}, 'laser_360': {'type': 'laser', 'full': True},
    'cryopexy_scar': {'type': 'cryo'},
}

# --- how everything else is drawn: recipe + placement overrides -------------
# r = recipe (a generic shape name or a bespoke renderer), site = default site, dq = default
# quadrant ('all' = 360°), k = size factor, o = orientation for lines ('radial' | 'circ')
CUR = {
    'vitreous_base_avulsion': {'dq': 'st'},
    'pars_plana_tear': {'k': 0.8},
    'full_thickness_macular_hole': {'r': 'ftmh', 'site': 'fovea'},
    'lamellar_macular_hole': {'r': 'lmh', 'site': 'fovea'},
    'partial_thickness_break': {'k': 0.7, 'site': 'periphery'},
    'retinal_erosion': {'k': 0.7},
    'schisis_inner_layer_hole': {'k': 1.2},
    'schisis_outer_layer_hole': {'k': 1.7},
    'break_with_subretinal_fluid_cuff': {'r': 'cuff'},
    'bridging_vessel_tear': {'r': 'bridging'},
    'radial_perivascular_lattice': {'site': 'equator'},
    'snail_track_degeneration': {'dq': 'st'},
    'white_without_pressure': {'k': 1.8, 'dq': 'it'},
    'white_with_pressure': {'k': 1.8, 'dq': 'it'},
    'dark_without_pressure': {'k': 1.5, 'dq': 'it'},
    'typical_peripheral_cystoid_degeneration': {'dq': 'st'},
    'reticular_peripheral_cystoid_degeneration': {'dq': 'it'},
    'meridional_fold': {'r': 'line', 'o': 'radial', 'k': 0.8, 'dq': 'sn'},
    'meridional_complex': {'r': 'line', 'o': 'radial', 'k': 0.9, 'dq': 'sn'},
    'enclosed_oral_bay': {'k': 0.7, 'dq': 'n'},
    'ora_serrata_pearl': {'k': 0.6},
    'pars_plana_cyst': {'k': 0.9, 'dq': 't'},
    'reticular_pigmentary_degeneration': {'dq': 'all'},
    'peripheral_chorioretinal_scar': {'k': 1.2},
    'degenerative_retinoschisis_typical': {'r': 'schisis', 'dq': 'it'},
    'degenerative_retinoschisis_bullous_reticular': {'r': 'schisis', 'dq': 'it', 'k': 1.35},
    'x_linked_retinoschisis_peripheral': {'r': 'schisis', 'dq': 'it', 'k': 1.6},
    'xlrs_vitreous_veil': {'r': 'patch', 'site': 'mid', 'dq': 'it', 'k': 2.4},
    'intraretinal_macrocyst': {'site': 'mid', 'k': 0.8},
    'subretinal_bands': {'r': 'line', 'o': 'circ', 'site': 'mid'},
    'tractional_retinal_detachment': {'r': 'trd', 'site': 'arcade'},
    'shifting_subretinal_fluid': {'r': 'line', 'o': 'circ', 'dq': 'i'},
    'pars_plana_epithelial_detachment': {'dq': 'it'},
    'pvr_fixed_retinal_folds': {'r': 'line', 'o': 'radial', 'site': 'mid', 'k': 1.5},
    'pvr_epiretinal_membrane': {'site': 'mid', 'k': 1.5},
    'posterior_vitreous_detachment': {'r': 'pvd'},
    'weiss_ring': {'r': 'weiss', 'site': 'disc'},
    'subhyaloid_hemorrhage': {'r': 'boat', 'site': 'pole'},
    'vitreous_membrane_traction_band': {'r': 'line', 'o': 'radial', 'site': 'mid', 'k': 2},
    'fibrovascular_proliferation': {'r': 'frond', 'site': 'arcade', 'k': 1.4},
    'synchysis_scintillans': {'dq': 'i'},
    'intraocular_foreign_body': {'site': 'mid', 'dq': 'i'},
    'retained_lens_fragment': {'site': 'mid', 'dq': 'i'},
    'radial_sponge_buckle': {'k': 1.3},
    'scleral_buckle_intrusion': {'dq': 'st'},
    'prp_scars': {'r': 'prp', 'dq': 'all'},
    'focal_grid_macular_laser': {'r': 'grid', 'site': 'macula'},
    'fresh_laser_burns': {'site': 'periphery'},
    'srf_drainage_site': {'site': 'equator', 'dq': 'it'},
    'drainage_retinotomy': {'site': 'mid', 'dq': 'sn'},
    'relaxing_retinectomy': {'dq': 'i'},
    'intraocular_gas_bubble': {'r': 'gas'},
    'pneumatic_retinopexy': {'r': 'gas'},
    'silicone_oil_fill': {'r': 'oil'},
    'emulsified_silicone_oil': {'site': 'periphery', 'dq': 's'},
    'retained_pfcl': {'site': 'pole', 'dq': 'i', 'k': 1.7},
    'postoperative_retinal_fold': {'r': 'line', 'o': 'circ', 'site': 'macula', 'k': 1.2},
    'intraretinal_hemorrhage_flame': {'r': 'flame', 'site': 'pole'},
    'intraretinal_hemorrhage_dot_blot': {'site': 'pole'},
    'preretinal_hemorrhage': {'site': 'pole', 'k': 1.1},
    'subretinal_hemorrhage': {'site': 'macula', 'k': 1.6},
    'roth_spot': {'site': 'pole', 'k': 1.1},
    'microaneurysm': {'site': 'macula'},
    'hard_exudates': {'site': 'macula'},
    'circinate_exudate_ring': {'site': 'macula', 'k': 1.2},
    'macular_star': {'r': 'mstar', 'site': 'fovea'},
    'cotton_wool_spot': {'site': 'pole', 'k': 0.6},
    'macular_edema_thickening': {'site': 'macula', 'k': 2.3},
    'cystoid_macular_edema': {'r': 'cme', 'site': 'fovea'},
    'neovascularization_elsewhere_flat': {'r': 'frond', 'site': 'arcade'},
    'neovascularization_elsewhere_elevated': {'r': 'frond', 'site': 'arcade', 'k': 1.2},
    'neovascularization_of_disc': {'r': 'frond', 'site': 'disc'},
    'irma': {'site': 'pole'},
    'venous_beading': {'site': 'arcade'},
    'branch_retinal_vein_occlusion': {'r': 'vo', 'dq': 'st'},
    'hemiretinal_vein_occlusion': {'r': 'vo', 'dq': 'sh'},
    'central_retinal_vein_occlusion': {'r': 'vo', 'dq': 'all'},
    'branch_retinal_artery_occlusion': {'r': 'ao', 'dq': 'st'},
    'central_retinal_artery_occlusion': {'r': 'crao', 'site': 'macula'},
    'cilioretinal_artery_occlusion': {'r': 'cilio', 'site': 'pmb'},
    'cherry_red_spot': {'r': 'crs', 'site': 'fovea'},
    'retinal_ischemic_whitening': {'site': 'pole', 'k': 1.3},
    'retinal_embolus': {'site': 'arcade', 'k': 0.55},
    'retinal_arterial_macroaneurysm': {'site': 'arcade', 'k': 0.8},
    'vascular_sheathing': {'site': 'mid'},
    'sclerotic_white_vessels': {'site': 'mid'},
    'retinal_vasculitis_active': {'site': 'mid'},
    'arteriovenous_nicking': {'site': 'arcade'},
    'retinal_vasculitis_sheathing': {'site': 'mid'},
    'coats_telangiectasia': {'dq': 't'},
    'macular_telangiectasia_type2': {'site': 'parafovea', 'dq': 't', 'k': 0.9},
    'sickle_sea_fan': {'site': 'periphery', 'dq': 't'},
    'sickle_salmon_patch': {'dq': 'st'},
    'sickle_black_sunburst': {'dq': 'it'},
    'sickle_iridescent_spots': {'dq': 'st'},
    'rop_demarcation_line_ridge': {'dq': 't'},
    'rop_extraretinal_fibrovascular_proliferation': {'dq': 't'},
    'purtscher_retinopathy': {'r': 'cluster', 'site': 'pole', 'k': 1.8},
    'ocular_ischemic_syndrome_hemorrhages': {'r': 'cluster', 'site': 'mid', 'dq': 'all'},
    'drusen_hard': {'site': 'macula'},
    'drusen_soft': {'site': 'macula', 'k': 1.1},
    'geographic_atrophy': {'site': 'macula', 'k': 1.5},
    'choroidal_neovascularization': {'site': 'fovea', 'k': 1.2},
    'disciform_scar': {'site': 'fovea', 'k': 1.8},
    'pigment_epithelial_detachment': {'site': 'macula', 'k': 1.3},
    'rpe_tear': {'site': 'macula', 'k': 1.4},
    'csc_serous_detachment': {'site': 'macula', 'k': 2.0},
    'polypoidal_choroidal_vasculopathy': {'site': 'macula'},
    'vitelliform_lesion': {'site': 'fovea'},
    'epiretinal_membrane': {'site': 'macula', 'k': 2.4},
    'vitreomacular_traction': {'r': 'vmt', 'site': 'fovea'},
    'impending_macular_hole_stage1': {'r': 'imh', 'site': 'fovea'},
    'macular_pseudohole': {'r': 'pseudohole', 'site': 'fovea'},
    'angioid_streaks': {'r': 'angioid', 'site': 'ppa'},
    'lacquer_cracks': {'r': 'cracks', 'site': 'macula'},
    'posterior_staphyloma': {'r': 'staph', 'site': 'pole'},
    'myopic_chorioretinal_atrophy': {'site': 'ppa', 'k': 1.7},
    'fuchs_spot': {'site': 'fovea'},
    'bulls_eye_maculopathy': {'r': 'bullseye', 'site': 'fovea'},
    'choroidal_folds': {'r': 'cfolds', 'site': 'pole'},
    'choroidal_rupture': {'r': 'rupture', 'site': 'pmb'},
    'commotio_retinae': {'site': 'pole', 'k': 2},
    'elschnig_spots_siegrist_streaks': {'site': 'pole'},
    'optic_disc_edema': {'r': 'discedema', 'site': 'disc'},
    'papilledema': {'r': 'discedema', 'site': 'disc'},
    'optic_disc_pallor': {'r': 'pallor', 'site': 'disc'},
    'glaucomatous_cupping': {'r': 'cupping', 'site': 'disc'},
    'optic_disc_hemorrhage': {'r': 'dischem', 'site': 'disc', 'dq': 'it'},
    'optic_disc_pit': {'r': 'pit', 'site': 'disc', 'dq': 't'},
    'optic_disc_coloboma': {'r': 'discoloboma', 'site': 'disc'},
    'morning_glory_disc': {'r': 'morningglory', 'site': 'disc'},
    'optic_disc_drusen': {'r': 'discdrusen', 'site': 'disc'},
    'myelinated_nerve_fibres': {'r': 'myelin', 'site': 'ppa', 'dq': 's'},
    'peripapillary_atrophy': {'r': 'ppa', 'site': 'ppa', 'dq': 't'},
    'tilted_disc': {'r': 'tilted', 'site': 'disc'},
    'optic_nerve_hypoplasia': {'r': 'hypoplasia', 'site': 'disc'},
    'optic_disc_melanocytoma': {'r': 'melanocytoma', 'site': 'disc', 'dq': 'i'},
    'choroidal_nevus': {'site': 'pole', 'k': 1.2},
    'choroidal_melanoma': {'site': 'pole', 'k': 2.3},
    'amelanotic_choroidal_melanoma': {'site': 'pole', 'k': 2.3},
    'circumscribed_choroidal_hemangioma': {'site': 'pole', 'k': 1.8},
    'diffuse_choroidal_hemangioma': {'r': 'patch', 'site': 'pole', 'k': 4},
    'choroidal_metastasis': {'site': 'pole', 'k': 1.9},
    'choroidal_osteoma': {'site': 'ppa', 'k': 1.8},
    'chrpe_solitary': {'site': 'mid', 'k': 1.4},
    'chrpe_grouped_bear_tracks': {'site': 'mid', 'k': 1.5},
    'grouped_albinotic_spots': {'site': 'mid', 'k': 1.4},
    'fap_pigmented_fundus_lesions': {'site': 'mid', 'k': 1.3},
    'rpe_hyperplasia_pigment_clumps': {'site': 'mid'},
    'combined_hamartoma': {'site': 'ppa', 'k': 1.6},
    'astrocytic_hamartoma': {'site': 'ppa'},
    'retinal_capillary_hemangioblastoma': {'r': 'rch', 'site': 'periphery', 'dq': 't'},
    'retinal_cavernous_hemangioma': {'site': 'mid', 'k': 1.3},
    'retinoblastoma': {'site': 'pole', 'k': 2},
    'vasoproliferative_tumour': {'site': 'periphery', 'dq': 'it', 'k': 1.6},
    'chorioretinal_coloboma': {'r': 'coloboma', 'site': 'pole', 'dq': 'i'},
    'vitreoretinal_lymphoma': {'site': 'pole'},
    'toxoplasmosis_active': {'r': 'toxo', 'site': 'pole'},
    'toxoplasmosis_scar': {'site': 'pole', 'k': 1.2},
    'cmv_retinitis': {'r': 'patch', 'site': 'arcade', 'k': 2.6},
    'acute_retinal_necrosis': {'dq': 'all'},
    'progressive_outer_retinal_necrosis': {'site': 'pole'},
    'candida_chorioretinitis': {'site': 'pole', 'k': 1.3},
    'endophthalmitis_vitreous_opacity': {'k': 1.5},
    'chorioretinal_scar': {'site': 'mid', 'k': 1.1},
    'histoplasmosis_spots': {'site': 'mid'},
    'multifocal_choroiditis': {'site': 'pole', 'k': 1.3},
    'punctate_inner_choroidopathy': {'site': 'macula'},
    'birdshot_chorioretinopathy': {'site': 'pole', 'k': 2.2},
    'serpiginous_choroiditis': {'r': 'patch', 'site': 'ppa', 'k': 2.6},
    'apmppe': {'site': 'pole', 'k': 1.8},
    'mewds': {'site': 'pole', 'k': 1.4},
    'asppc': {'site': 'macula', 'k': 2},
    'choroidal_granuloma_tuberculoma': {'site': 'pole', 'k': 1.3},
    'toxocara_posterior_granuloma': {'site': 'macula', 'k': 1.3},
    'toxocara_peripheral_granuloma': {'site': 'periphery', 'dq': 't', 'k': 1.3},
    'pars_planitis_snowbank': {'dq': 'i'},
    'vitreous_snowballs': {'site': 'vitreous', 'dq': 'i'},
    'dalen_fuchs_nodules': {'site': 'mid'},
    'retinitis_pigmentosa_bone_spicules': {'r': 'spicules', 'site': 'mid', 'dq': 'all'},
    'stargardt_flecks': {'r': 'flecks', 'site': 'pole'},
}

GROUP_FIX = {'full_thickness_macular_hole': 'macula_posterior_pole', 'lamellar_macular_hole': 'macula_posterior_pole',
             'vitreous_base_avulsion': 'breaks', 'schisis_detachment': 'detachments_schisis'}

# shared synonyms → the entry that owns them; None = ambiguous, drop from matching
OWNER = {
    'pars plana tear': 'pars_plana_tear', 'pars plana break': 'pars_plana_tear',
    'cuff of fluid': 'break_with_subretinal_fluid_cuff', 'srf cuff': 'break_with_subretinal_fluid_cuff',
    'subclinical detachment': 'subclinical_retinal_detachment', 'subclinical retinal detachment': 'subclinical_retinal_detachment',
    'radial fold': None, 'epiretinal proliferation': None,
    'pigment clumping': 'rpe_hyperplasia_pigment_clumps', 'pigment clump': 'rpe_hyperplasia_pigment_clumps',
    'hyperpigmentation': 'rpe_hyperplasia_pigment_clumps', 'rpe hyperplasia': 'rpe_hyperplasia_pigment_clumps',
    'pigment migration': 'rpe_hyperplasia_pigment_clumps',
    'chorioretinal atrophy': 'peripheral_chorioretinal_atrophy',
    'chorioretinal scar': 'chorioretinal_scar', 'pigmented scar': 'chorioretinal_scar', 'old scar': 'chorioretinal_scar',
    'pigmented chorioretinal scar': 'chorioretinal_scar',
    'peripheral drusen': 'peripheral_drusen', 'subretinal fibrosis': 'disciform_scar',
    'serous retinal detachment': 'exudative_retinal_detachment',
    'epiretinal membrane': 'epiretinal_membrane', 'erm': 'epiretinal_membrane', 'preretinal membrane': 'epiretinal_membrane',
    'cellophane': 'epiretinal_membrane',
    'subhyaloid hemorrhage': 'subhyaloid_hemorrhage', 'sub hyaloid hemorrhage': 'subhyaloid_hemorrhage',
    'premacular hemorrhage': 'subhyaloid_hemorrhage', 'boat shaped hemorrhage': 'subhyaloid_hemorrhage',
    'sub ilm hemorrhage': 'subhyaloid_hemorrhage', 'preretinal hemorrhage': 'preretinal_hemorrhage',
    'elevated nv': 'neovascularization_elsewhere_elevated',
    'vitreous cells': 'vitreous_cells_haze', 'vitreous haze': 'vitreous_cells_haze', 'vitritis': 'vitreous_cells_haze',
    'double ring sign': 'optic_nerve_hypoplasia',
    'vascular sheathing': 'vascular_sheathing', 'perivascular sheathing': 'vascular_sheathing', 'sheathed vessels': 'vascular_sheathing',
    'retinal vasculitis': 'retinal_vasculitis_active', 'periphlebitis': 'retinal_vasculitis_active',
    'frosted branch angiitis': 'retinal_vasculitis_active', 'candle wax drippings': 'retinal_vasculitis_active',
    'vasculitis': 'retinal_vasculitis_active', 'operculum': 'operculated_hole',
}
# words that are too common (pronouns, everyday words) or clash with dictation of other findings
NO_MATCH = {'ma', 'he', 'me', 'so', 'pr', 'cd', 'fb', 'met', 'srf', 'rs', 'ld', 'dl', 'crt', 'cra', 'him', 'pic', 'ram', 'ois',
            'box-carring', 'boxcarring', 'notching', 'frond', 'ridge', 'popcorn', 'erosion', 'intrusion', 'sponge', 'tire',
            'pneumatic', 'emulsification', 'disinsertion', 'tubercles', 'frosting', 'nicking', 'tenting', 'retinotomy',
            'retinectomy', 'explant', 'watermark', 'polyps', 'asteroids', 'flecks', 'rp', 'onh', 'odd', 'pfo', 'envy', 'fresh blood',
            'foveal detachment', 'laser today', 'new laser', 'laser uptake', 'fresh laser', 'small rd', 'cuff of srf',
            'hole in lattice', 'rolled edge', 'rolled edges', 'rolled', 'pvr grade c', 'pvr grade b', 'fixed folds', 'pvr folds', 'buckle', 'sb', 'scleral buckle'}
# phrases clinicians use that the research sets did not list (UK usage, “new vessels”, plurals)
EXTRA_MATCH = {
    'choroidal_neovascularization': ['choroidal new vessels', 'choroidal new vessel', 'subfoveal choroidal new vessels', 'subfoveal cnv', 'cnv membrane', 'macular neovascularization', 'choroidal neovascular membrane'],
    'neovascularization_of_disc': ['new vessels at the disc', 'new vessels on the disc', 'new vessels of the disc', 'neovascularization at the disc', 'neovascularization of the disc', 'neovascularization on the disc', 'disc new vessels', 'disc neovascularization'],
    'neovascularization_elsewhere_flat': ['new vessels elsewhere', 'retinal neovascularization', 'neovascularization elsewhere', 'preretinal neovascularization', 'retinal new vessels'],
    'choroidal_nevus': ['nevi', 'choroidal nevi', 'naevi', 'choroidal naevi'],
    'macular_edema_thickening': ['dmo', 'diabetic macular oedema', 'centre involving dmo', 'center involving dmo', 'ci-dmo', 'macular oedema', 'cmt increase'],
    'hard_exudates': ['exudate', 'exudates', 'lipid exudation', 'lipid exudate', 'lipid', 'hard exudate'],
    'circinate_exudate_ring': ['circinate ring of exudates', 'circinate ring of hard exudates', 'ring of exudates', 'ring of hard exudates', 'circinate exudates'],
    'subretinal_hemorrhage': ['blood under the macula', 'submacular blood', 'submacular hemorrhage', 'subretinal blood', 'submacular haemorrhage'],
    'silicone_oil_fill': ['oil', 'silicone oil', 'oil fill', 'oil tamponade', 'under oil'],
    'intraocular_gas_bubble': ['gas', 'gas fill', 'gas filled', 'gas bubble', 'gas tamponade', 'air bubble', 'air fill', 'air'],
    'intraretinal_hemorrhage_flame': ['nerve fiber layer hemorrhage', 'nerve fibre layer hemorrhage', 'nfl hemorrhage', 'splinter hemorrhages', 'flame hemorrhages'],
    'cotton_wool_spot': ['nerve fiber layer infarct', 'nerve fibre layer infarct', 'nfl infarct', 'soft exudate', 'soft exudates'],
}
DIRECTION = re.compile(r'^(superior|inferior|temporal|nasal|supero|infero|upper|lower|left|right)\b')

ZONE_SITE = {'periphery': 'periphery', 'ora': 'ora', 'pars_plana': 'pars_plana', 'fovea': 'fovea', 'macula': 'macula',
             'posterior_pole': 'pole', 'arcades': 'arcade', 'peripapillary': 'ppa', 'disc': 'disc', 'midperiphery': 'mid',
             'equator': 'equator', 'vitreous': 'vitreous', 'any': None}

def quad_from(clock):
    c = (clock or '').lower()
    if not c: return None
    if '360' in c or 'all four' in c: return 'all'
    for k, q in (('superotemporal', 'st'), ('inferotemporal', 'it'), ('superonasal', 'sn'), ('inferonasal', 'in')):
        if c.startswith(k): return q
    if c.startswith('superior or inferior') or c.startswith('superior and inferior'): return None
    if c.startswith('temporal'): return 't'
    if c.startswith('nasal'): return 'n'
    if c.startswith('inferior'): return 'i'
    if c.startswith('superior'): return 's'
    return None

def kf(x): return re.sub(r"[\s'-]+", '', x.lower())
OWNER = {kf(k): v for k, v in OWNER.items()}
seen = {}
order = []
for e in raw:
    i = e['id']
    if i in seen:
        a = seen[i]
        a['synonyms'] = list(dict.fromkeys(a['synonyms'] + e.get('synonyms', [])))
        have = {p['pmid'] for p in a['pubmed']}
        a['pubmed'] += [p for p in e.get('pubmed', []) if p['pmid'] not in have]
        continue
    seen[i] = json.loads(json.dumps(e))
    order.append(i)

owners = {}
for i in order:
    for s in seen[i]['synonyms']:
        owners.setdefault(kf(s), []).append(i)

out = []
for i in order:
    e = seen[i]
    d = e.get('drawing', {})
    loc = e.get('location', {})
    cur = CUR.get(i, {})
    names = [e['name']] + e.get('synonyms', [])
    syn, match = [], []
    for s in e.get('synonyms', []):
        s2 = re.sub(r'\s+', ' ', s.lower().strip())
        if s2 in syn: continue
        syn.append(s2)
        own = OWNER.get(kf(s2), 'x')
        if own is None: continue
        if own != 'x' and own != i: continue
        if own == 'x' and len(set(owners.get(kf(s2), []))) > 1 and owners[kf(s2)][0] != i: continue
        if s2 in NO_MATCH or len(s2) < 2: continue
        if DIRECTION.match(s2) and len(s2.split()) > 1: continue
        match.append(s2)
    for x in EXTRA_MATCH.get(i, []):
        if x not in match: match.append(x)
    # the entry's own name (minus any parenthetical) is always sayable
    for nm in re.sub(r'\s*\(.*?\)', '', e['name']).lower().split(' / '):
        nm = nm.strip()
        own = OWNER.get(kf(nm), i)
        if nm and len(nm.split()) >= 2 and nm not in match and not DIRECTION.match(nm) and nm not in NO_MATCH and own == i: match.insert(0, nm)
    refs = [{'pmid': str(p.get('pmid', '')), 'doi': p.get('doi', '') or '', 'title': p.get('title', ''), 'year': str(p.get('year', ''))} for p in e.get('pubmed', []) if p.get('pmid')]
    item = {
        'id': i, 'name': e['name'], 'group': GROUP_FIX.get(i, e['group']),
        'def': e.get('definition', ''), 'zone': loc.get('zone'), 'clock': loc.get('typical_clock'), 'where': loc.get('notes', ''),
        'size': e.get('typical_size', ''), 'shape': e.get('shape'),
        'fill': d.get('fill') or 'none', 'outline': d.get('outline') or 'none', 'pattern': d.get('pattern') or 'none', 'pcolor': d.get('pattern_color') or None,
        'how': d.get('description', ''), 'src': e.get('color_source', ''), 'refs': refs, 'syn': syn, 'match': match,
    }
    if i in MAP: item['map'] = MAP[i]
    else:
        item['r'] = cur.get('r', e.get('shape'))
        item['site'] = cur.get('site', ZONE_SITE.get(loc.get('zone')))
        dq = cur.get('dq', quad_from(loc.get('typical_clock')))
        if dq: item['dq'] = dq
        if cur.get('k'): item['k'] = cur['k']
        if cur.get('o'): item['o'] = cur['o']
    out.append(item)

missing = [i for i in CUR if i not in seen]
assert not missing, missing
(root / 'research' / 'catalog.json').write_text(json.dumps(out, ensure_ascii=False, indent=0))
print(len(out), 'entries;', sum(1 for x in out if 'map' in x), 'mapped onto existing drawings;',
      sum(len(x['match']) for x in out), 'sayable phrases')
