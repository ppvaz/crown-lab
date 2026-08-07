
import { CAPTURE_SHOTS, prepareCaptureWorld, type CaptureShotId } from '../src/app/capture';
import { conceptArenaScene } from '../src/render/concept-arenas-lab';
import { FIRST_CROWN } from '../src/game/route';
import { DEFAULT_COMBAT, SLOWMO_PRESETS } from '../src/lab/config';
import {
  CONSTRUCTION_DETAILS,
  CONSTRUCTION_FLOORS,
  CONSTRUCTION_KIT_PIECE_COUNT,
  CONSTRUCTION_WALLS,
  CONSTRUCTION_WINDOWS,
  CONCEPT_ROOM_CLUTTER,
  NARRATIVE_CLUTTER,
  NARRATIVE_CLUTTER_GALLERY,
  NARRATIVE_CLUTTER_PIECE_COUNT,
  OCCUPIED_FLOOR_FLUSH,
  OCCUPIED_FLOOR_OBSTACLES,
  OCCUPIED_FLOOR_SOLIDS,
  conceptKitObstacles,
  conceptPlacementPolicy,
} from '../src/lab/concept-kit';
import { ENCOUNTERS } from '../src/lab/encounters';
import { createWorld } from '../src/sim/encounter';
import { arenaGeometryIsValid } from '../src/sim/arena';
import { makeCamera } from '../src/render/iso';
import { PALETTE } from '../src/render/palette';
import { LAB_ROOMS } from '../src/render/rooms/index-lab';
import { PUBLIC_ROOMS } from '../src/render/rooms/index-public';

const CONCEPT_IDS = [
  'concept_bell_court',
  'concept_shattered_dais',
  'concept_rain_breached_hall',
  'concept_parallax_gallery',
  'concept_prop_gallery',
  'concept_lantern_cloister',
  'concept_oath_gallery',
  'concept_guard_procession',
  'concept_violet_chancellery',
  'concept_rookery_roofs',
  'concept_chainbridge_court',
  'concept_flooded_nave',
  'concept_bell_foundry',
  'concept_archive_spiral',
  'concept_hollow_throne',
  'concept_kit_gallery',
  'concept_clutter_gallery',
] as const;

const NAMED_ROOM_IDS = CONCEPT_IDS.filter(
  (id) =>
    id !== 'concept_rain_breached_hall' &&
    id !== 'concept_parallax_gallery' &&
    id !== 'concept_prop_gallery' &&
    id !== 'concept_kit_gallery' &&
    id !== 'concept_clutter_gallery',
);

describe('lab-only concept arenas', () => {
  it('keeps every experiment outside the canonical route and the public room registry', () => {
    const routed = new Set(
      [...FIRST_CROWN.nodes, ...FIRST_CROWN.asides].map((node) => node.encounterId),
    );
    for (const id of CONCEPT_IDS) {
      expect(routed.has(id), id).toBe(false);
      expect(PUBLIC_ROOMS.themeFor(id), id).toBeNull();
      expect(LAB_ROOMS.themeFor(id), id).not.toBeNull();
    }
  });

  it('does not decorate either characterization control arm', () => {
    expect(LAB_ROOMS.themeFor('projectile_rain_boss')).toBeNull();
    expect(LAB_ROOMS.themeFor('reach_study')).toBeNull();
  });

  it('uses valid playable geometry and the same small combat pair in every room', () => {
    for (const id of CONCEPT_IDS) {
      const encounter = ENCOUNTERS[id];
      expect(arenaGeometryIsValid(encounter.arena), id).toBe(true);
      expect(
        encounter.waves.flatMap((wave) => wave.spawns.map((spawn) => spawn.archetype)),
        id,
      ).toEqual(['guard', 'duelist']);
    }
  });

  it('derives occupied-floor collision from the same six solid placements the renderer uses', () => {
    expect(OCCUPIED_FLOOR_SOLIDS.map((placement) => placement.kind)).toEqual([
      'obelisk',
      'plinth',
      'brazier',
      'statue',
      'bell_post',
      'standard',
    ]);
    expect(OCCUPIED_FLOOR_SOLIDS.map(conceptPlacementPolicy)).toEqual(
      Array(6).fill('solid'),
    );
    expect(conceptKitObstacles(OCCUPIED_FLOOR_SOLIDS)).toEqual(OCCUPIED_FLOOR_OBSTACLES);
    expect(ENCOUNTERS.concept_prop_gallery.arena.obstacles).toEqual(
      OCCUPIED_FLOOR_OBSTACLES,
    );
    expect(ENCOUNTERS.concept_shattered_dais.arena.obstacles).toBeUndefined();

    const propWorld = createWorld(ENCOUNTERS.concept_prop_gallery, DEFAULT_COMBAT, 1);
    const propScene = conceptArenaScene(
      {} as CanvasRenderingContext2D,
      propWorld,
      makeCamera(1440, 900),
      PALETTE,
    );
    expect(propScene.bodies).toHaveLength(6);
  });

  it('keeps all eight occupied-floor motifs explicitly flush and walk-through', () => {
    expect(OCCUPIED_FLOOR_FLUSH.map((placement) => placement.kind)).toEqual([
      'shattered_crown',
      'medallion_rings',
      'oath_blade',
      'procession_lanes',
      'puddle',
      'runner',
      'drain',
      'violet_petals',
    ]);
    expect(OCCUPIED_FLOOR_FLUSH.map(conceptPlacementPolicy)).toEqual(
      Array(8).fill('flush'),
    );
    expect(ENCOUNTERS.concept_prop_gallery.arena.obstacles).toHaveLength(6);
  });

  it('treats narrative scenery as explicitly non-colliding unless promoted to solid', () => {
    const cart = { kind: 'cart', at: { x: 0, y: 0 } } as const;
    expect(conceptPlacementPolicy(cart)).toBe('visual-only');
    expect(conceptKitObstacles([cart])).toEqual([]);
  });

  it('provides fixed enlarged captures for both occupied-floor inspection rows', () => {
    expect(CAPTURE_SHOTS['concept-prop-gallery-solids'].inspection).toEqual({
      focus: { x: 0, y: 4.7 },
      zoomScale: 1.65,
    });
    expect(CAPTURE_SHOTS['concept-prop-gallery-flush'].inspection).toEqual({
      focus: { x: 0, y: -1.8 },
      zoomScale: 1.55,
    });
  });

  it('authors the complete Stone, Glass & Oath construction taxonomy', () => {
    expect(CONSTRUCTION_FLOORS.map((placement) => placement.kind)).toEqual([
      'clean_bordered_ashlar',
      'oath_blades',
      'shattered_crown',
      'polygon_rings',
      'runner',
      'rain_polished_tiles',
      'rough_repaired_stone',
      'violet_court_geometry',
    ]);
    expect(CONSTRUCTION_WALLS.map((placement) => placement.kind)).toEqual([
      'plain_heraldic_panel',
      'red_standard_arms',
      'violet_record_panels',
      'breached_masonry',
      'blind_pale_arches',
      'service_lantern_wall',
    ]);
    expect(CONSTRUCTION_WINDOWS.map((placement) => placement.kind)).toEqual([
      'clear_heraldic_lancet',
      'deep_empty_lancet',
      'barred_slit',
      'violet_diamond_glass',
      'rose_window',
      'empty_opening',
      'crown_panel',
    ]);
    expect(CONSTRUCTION_DETAILS.map((placement) => placement.kind)).toEqual([
      'steps',
      'trims',
      'drains',
      'corbels',
      'sconces',
      'hanging_lanterns',
      'standards',
      'rain_chains',
      'memorial_statues',
      'balustrades',
      'pointed_arches',
    ]);
    expect(CONSTRUCTION_KIT_PIECE_COUNT).toBe(32);
    expect(CONSTRUCTION_FLOORS.map(conceptPlacementPolicy)).toEqual(Array(8).fill('flush'));
    expect([
      ...CONSTRUCTION_WALLS,
      ...CONSTRUCTION_WINDOWS,
      ...CONSTRUCTION_DETAILS,
    ].map(conceptPlacementPolicy)).toEqual(Array(24).fill('visual-only'));
    expect(ENCOUNTERS.concept_kit_gallery.arena.obstacles).toBeUndefined();
  });

  it('provides fixed inspection captures for every construction-kit row', () => {
    expect(CAPTURE_SHOTS['concept-kit-gallery-floors'].inspection?.focus).toEqual({
      x: 0,
      y: -3.15,
    });
    expect(CAPTURE_SHOTS['concept-kit-gallery-walls'].inspection?.focus).toEqual({
      x: 0,
      y: 0.45,
    });
    expect(CAPTURE_SHOTS['concept-kit-gallery-windows'].inspection?.focus).toEqual({
      x: 0,
      y: 3,
    });
    expect(CAPTURE_SHOTS['concept-kit-gallery-details'].inspection?.focus).toEqual({
      x: 0,
      y: 5.35,
    });
    expect(CAPTURE_SHOTS['concept-kit-gallery-desaturated'].presentationId).toBe(
      'Color_Drained',
    );
  });

  it('authors all four narrative-clutter families as composed visual-only rows', () => {
    expect(NARRATIVE_CLUTTER.loyalty.map((placement) => placement.kind)).toEqual([
      'intact_standard',
      'mounted_sword',
      'memorial',
      'roll_of_names',
      'shield',
      'votive_candles',
    ]);
    expect(NARRATIVE_CLUTTER.absence.map((placement) => placement.kind)).toEqual([
      'empty_frame',
      'curtained_empty_chair',
      'missing_object_plinth',
      'untouched_table',
      'clock',
      'barred_door',
    ]);
    expect(NARRATIVE_CLUTTER.siege.map((placement) => placement.kind)).toEqual([
      'torn_standard',
      'broken_statue',
      'bound_pikes',
      'barricade',
      'breached_plaster',
      'fallen_bell',
      'rain_bucket',
    ]);
    expect(NARRATIVE_CLUTTER.service.map((placement) => placement.kind)).toEqual([
      'broom_lantern',
      'ledger_table',
      'keys_seals',
      'basket',
      'covered_cart',
      'ash_brazier',
      'service_stair',
    ]);
    expect(NARRATIVE_CLUTTER_PIECE_COUNT).toBe(26);
    expect(NARRATIVE_CLUTTER_GALLERY).toHaveLength(26);
    expect(NARRATIVE_CLUTTER_GALLERY.map(conceptPlacementPolicy)).toEqual(
      Array(26).fill('visual-only'),
    );
    expect(conceptKitObstacles(NARRATIVE_CLUTTER_GALLERY)).toEqual([]);
    expect(ENCOUNTERS.concept_clutter_gallery.arena.obstacles).toBeUndefined();
  });

  it('makes every composed room name one primary and at most one secondary clutter family', () => {
    const recipes = Object.values(CONCEPT_ROOM_CLUTTER);
    expect(new Set(recipes.map((recipe) => recipe.primary))).toEqual(
      new Set(['loyalty', 'absence', 'siege', 'service']),
    );
    for (const recipe of recipes) {
      expect(recipe.placements.length).toBeGreaterThan(0);
      expect(recipe.secondary).not.toBe(recipe.primary);
      expect(conceptKitObstacles(recipe.placements)).toEqual([]);
    }
  });

  it('provides fixed inspection captures for every narrative family', () => {
    for (const [family, focus] of [
      ['loyalty', { x: -5, y: -2.7 }],
      ['absence', { x: 5, y: -2.7 }],
      ['siege', { x: -5, y: 2.7 }],
      ['service', { x: 5, y: 2.7 }],
    ] as const) {
      const inspection = CAPTURE_SHOTS[`concept-clutter-gallery-${family}`].inspection;
      expect(inspection?.focus).toEqual(focus);
      expect(inspection?.zoomScale).toBe(2.5);
    }
    expect(CAPTURE_SHOTS['concept-clutter-gallery-desaturated'].presentationId).toBe(
      'Color_Drained',
    );
  });

  it('injects only the custom volumetric family each room asks for', () => {
    const bodyCounts = CONCEPT_IDS.map((id) => {
      const world = createWorld(ENCOUNTERS[id], DEFAULT_COMBAT, 1);
      return conceptArenaScene(
        {} as CanvasRenderingContext2D,
        world,
        makeCamera(1440, 900),
        PALETTE,
      ).bodies?.length ?? 0;
    });
    expect(bodyCounts).toEqual([11, 4, 3, 0, 6, 9, 5, 6, 5, 8, 4, 4, 10, 8, 5, 24, 26]);
  });
});

describe('concept arena capture pairs', () => {
  const captureId = (
    encounterId: (typeof CONCEPT_IDS)[number],
    state: 'empty' | 'combat',
  ): CaptureShotId => `${encounterId.replaceAll('_', '-')}-${state}` as CaptureShotId;

  it('gives every fixture an empty/combat pair that differs only by the staged cast', () => {
    for (const id of CONCEPT_IDS) {
      const empty = captureId(id, 'empty');
      const combat = captureId(id, 'combat');
      expect(CAPTURE_SHOTS[empty].encounterId, empty).toBe(id);
      expect(CAPTURE_SHOTS[combat].encounterId, combat).toBe(id);
      const encounter = ENCOUNTERS[id];

      const emptyWorld = createWorld(encounter, structuredClone(DEFAULT_COMBAT), 1);
      prepareCaptureWorld(
        emptyWorld,
        structuredClone(DEFAULT_COMBAT),
        SLOWMO_PRESETS.none,
        encounter,
        empty,
      );
      expect(emptyWorld.enemies, empty).toHaveLength(0);

      const combatWorld = createWorld(encounter, structuredClone(DEFAULT_COMBAT), 1);
      prepareCaptureWorld(
        combatWorld,
        structuredClone(DEFAULT_COMBAT),
        SLOWMO_PRESETS.none,
        encounter,
        combat,
      );
      expect(
        combatWorld.enemies.map((enemy) => enemy.archetype),
        combat,
      ).toEqual(['guard', 'duelist']);
    }
  });

  it('gives every named room an empty desaturated inspection capture', () => {
    for (const id of NAMED_ROOM_IDS) {
      const shot = `${id.replaceAll('_', '-')}-desaturated` as CaptureShotId;
      expect(CAPTURE_SHOTS[shot].encounterId, shot).toBe(id);
      expect(CAPTURE_SHOTS[shot].presentationId, shot).toBe('Color_Drained');

      const encounter = ENCOUNTERS[id];
      const world = createWorld(encounter, structuredClone(DEFAULT_COMBAT), 1);
      prepareCaptureWorld(
        world,
        structuredClone(DEFAULT_COMBAT),
        SLOWMO_PRESETS.none,
        encounter,
        shot,
      );
      expect(world.enemies, shot).toHaveLength(0);
    }
  });
});
