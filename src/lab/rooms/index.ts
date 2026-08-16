
import VOCABULARY from './vocabulary.json';
import { OCCUPIED_FLOOR_OBSTACLES } from '../concept-kit';
import WAYFARER_COURT from './wayfarer-court.json';
import UPPER_HALL from './upper-hall.json';
import BACKGROUND_ENCOUNTER from './background-encounter.json';
import ROTATED_RECTANGLE from './rotated-rectangle.json';
import TUTORIAL_FUNDAMENTALS from './tutorial-fundamentals.json';
import TUTORIAL_DEFENSE from './tutorial-defense.json';
import TUTORIAL_FOCUS from './tutorial-focus.json';
import TUTORIAL_POWER from './tutorial-power.json';
import KERNEL_GUARD from './kernel-guard.json';
import KERNEL_DUELIST from './kernel-duelist.json';
import SPACING_ARCHER from './spacing-archer.json';
import COURT_45S from './court-45s.json';
import OVERLAP_COURT from './overlap-court.json';
import SHAPE_GALLERY from './shape-gallery.json';
import SHAPE_TWIN_BOWLS from './shape-twin-bowls.json';
import SHAPE_COMBAT_BOWL from './shape-combat-bowl.json';
import SHAPE_CRAMPED_KEEP from './shape-cramped-keep.json';
import GALLERY_ARCHER from './gallery-archer.json';
import MAZE_SERPENTINE from './maze-serpentine.json';
import FIRST_BLADE from './first-blade.json';
import CAPTAIN from './captain.json';
import CAPTAIN_READ from './captain-read.json';
import ELITE_GUARD from './elite-guard.json';
import MESH_GUARD from './mesh-guard.json';
import PROJECTILE_RAIN_BOSS from './projectile-rain-boss.json';
import CHANCELLOR from './chancellor.json';
import PIKE_LINE from './pike-line.json';
import REACH_STUDY from './reach-study.json';
import THORN_MARSHAL from './thorn-marshal.json';
import SIEGE_10 from './siege-10.json';
import SIEGE_10_PACED from './siege-10-paced.json';
import CONCEPT_BELL_COURT from './concept-bell-court.json';
import CONCEPT_SHATTERED_DAIS from './concept-shattered-dais.json';
import CONCEPT_RAIN_BREACHED_HALL from './concept-rain-breached-hall.json';
import CONCEPT_PARALLAX_GALLERY from './concept-parallax-gallery.json';
import CONCEPT_PROP_GALLERY from './concept-prop-gallery.json';
import CONCEPT_KIT_GALLERY from './concept-kit-gallery.json';
import CONCEPT_CLUTTER_GALLERY from './concept-clutter-gallery.json';
import CONCEPT_LANTERN_CLOISTER from './concept-lantern-cloister.json';
import CONCEPT_OATH_GALLERY from './concept-oath-gallery.json';
import CONCEPT_GUARD_PROCESSION from './concept-guard-procession.json';
import CONCEPT_VIOLET_CHANCELLERY from './concept-violet-chancellery.json';
import CONCEPT_ROOKERY_ROOFS from './concept-rookery-roofs.json';
import CONCEPT_CHAINBRIDGE_COURT from './concept-chainbridge-court.json';
import CONCEPT_FLOODED_NAVE from './concept-flooded-nave.json';
import CONCEPT_BELL_FOUNDRY from './concept-bell-foundry.json';
import CONCEPT_ARCHIVE_SPIRAL from './concept-archive-spiral.json';
import CONCEPT_HOLLOW_THRONE from './concept-hollow-throne.json';
import CONCEPT_LANTERN_CLOISTER_BAKED from './concept-lantern-cloister-baked.json';
import CONCEPT_LANTERN_CLOISTER_LIVE from './concept-lantern-cloister-live.json';
import GENERATED_CHAMBERS from './generated-chambers.json';
import QUEEN from './queen.json';
import GLASS_REGENT from './glass-regent.json';
import PHRASE_COURT from './phrase-court.json';

const ORDER = [
  WAYFARER_COURT,
  UPPER_HALL,
  BACKGROUND_ENCOUNTER,
  ROTATED_RECTANGLE,
  TUTORIAL_FUNDAMENTALS,
  TUTORIAL_DEFENSE,
  TUTORIAL_FOCUS,
  TUTORIAL_POWER,
  KERNEL_GUARD,
  KERNEL_DUELIST,
  SPACING_ARCHER,
  COURT_45S,
  OVERLAP_COURT,
  SHAPE_GALLERY,
  SHAPE_TWIN_BOWLS,
  SHAPE_COMBAT_BOWL,
  SHAPE_CRAMPED_KEEP,
  GALLERY_ARCHER,
  MAZE_SERPENTINE,
  FIRST_BLADE,
  CAPTAIN,
  CAPTAIN_READ,
  ELITE_GUARD,
  PROJECTILE_RAIN_BOSS,
  CHANCELLOR,
  PIKE_LINE,
  REACH_STUDY,
  THORN_MARSHAL,
  SIEGE_10,
  SIEGE_10_PACED,
  CONCEPT_BELL_COURT,
  CONCEPT_SHATTERED_DAIS,
  CONCEPT_RAIN_BREACHED_HALL,
  CONCEPT_PARALLAX_GALLERY,
  CONCEPT_PROP_GALLERY,
  CONCEPT_LANTERN_CLOISTER,
  CONCEPT_OATH_GALLERY,
  CONCEPT_GUARD_PROCESSION,
  CONCEPT_VIOLET_CHANCELLERY,
  CONCEPT_ROOKERY_ROOFS,
  CONCEPT_CHAINBRIDGE_COURT,
  CONCEPT_FLOODED_NAVE,
  CONCEPT_BELL_FOUNDRY,
  CONCEPT_ARCHIVE_SPIRAL,
  CONCEPT_HOLLOW_THRONE,
  CONCEPT_KIT_GALLERY,
  CONCEPT_CLUTTER_GALLERY,
  CONCEPT_LANTERN_CLOISTER_BAKED,
  CONCEPT_LANTERN_CLOISTER_LIVE,
  GENERATED_CHAMBERS,
  QUEEN,
  GLASS_REGENT,
  MESH_GUARD,
  PHRASE_COURT,
];

export const ENCOUNTER_DOCUMENT = {
  ...VOCABULARY,
  arenas: {
    ...VOCABULARY.arenas,
    concept_prop_octagon: {
      ...VOCABULARY.arenas.concept_prop_octagon,
      obstacles: OCCUPIED_FLOOR_OBSTACLES,
    },
  },
  encounters: ORDER,
};
