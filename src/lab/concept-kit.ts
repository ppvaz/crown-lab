
import type { Obstacle, Vec2 } from '../sim/types';

export type ConceptPlacementPolicy = 'solid' | 'flush' | 'visual-only';

export type NarrativeClutterKind =
  | 'intact_standard'
  | 'mounted_sword'
  | 'memorial'
  | 'roll_of_names'
  | 'shield'
  | 'votive_candles'
  | 'empty_frame'
  | 'curtained_empty_chair'
  | 'missing_object_plinth'
  | 'untouched_table'
  | 'clock'
  | 'barred_door'
  | 'torn_standard'
  | 'broken_statue'
  | 'bound_pikes'
  | 'barricade'
  | 'breached_plaster'
  | 'fallen_bell'
  | 'rain_bucket'
  | 'broom_lantern'
  | 'ledger_table'
  | 'keys_seals'
  | 'basket'
  | 'covered_cart'
  | 'ash_brazier'
  | 'service_stair';

export type ConceptKitKind =
  | 'obelisk'
  | 'plinth'
  | 'brazier'
  | 'statue'
  | 'bell_post'
  | 'standard'
  | 'torn_standard'
  | 'memorial'
  | 'candles'
  | 'sword'
  | 'weapon_rack'
  | 'empty_chair'
  | 'laid_table'
  | 'ledger_table'
  | 'clock'
  | 'broken_statue'
  | 'barricade'
  | 'fallen_bell'
  | 'bucket'
  | 'cart'
  | NarrativeClutterKind;

export interface ConceptKitSpec {
  kind: ConceptKitKind;
  at: Vec2;
  scale?: number;
  accent?: 'gold' | 'red' | 'violet' | 'cold';
  policy?: ConceptPlacementPolicy;
}

export type NarrativeClutterFamily = 'loyalty' | 'absence' | 'siege' | 'service';

export type NarrativeClutterPlacement = Omit<ConceptKitSpec, 'kind' | 'policy'> & {
  kind: NarrativeClutterKind;
  policy: 'visual-only';
};

export interface ConceptRoomClutterRecipe {
  primary: NarrativeClutterFamily;
  secondary?: NarrativeClutterFamily;
  placements: readonly ConceptKitSpec[];
}

export type ConceptFloorKind =
  | 'shattered_crown'
  | 'medallion_rings'
  | 'oath_blade'
  | 'procession_lanes'
  | 'puddle'
  | 'runner'
  | 'drain'
  | 'violet_petals';

export interface ConceptFloorPlacement {
  kind: ConceptFloorKind;
  at: Vec2;
  policy: 'flush';
  accent?: 'gold' | 'red' | 'violet' | 'cold';
}

export type ConstructionFloorKind =
  | 'clean_bordered_ashlar'
  | 'oath_blades'
  | 'shattered_crown'
  | 'polygon_rings'
  | 'runner'
  | 'rain_polished_tiles'
  | 'rough_repaired_stone'
  | 'violet_court_geometry';

export type ConstructionWallKind =
  | 'plain_heraldic_panel'
  | 'red_standard_arms'
  | 'violet_record_panels'
  | 'breached_masonry'
  | 'blind_pale_arches'
  | 'service_lantern_wall';

export type ConstructionWindowKind =
  | 'clear_heraldic_lancet'
  | 'deep_empty_lancet'
  | 'barred_slit'
  | 'violet_diamond_glass'
  | 'rose_window'
  | 'empty_opening'
  | 'crown_panel';

export type ConstructionDetailKind =
  | 'steps'
  | 'trims'
  | 'drains'
  | 'corbels'
  | 'sconces'
  | 'hanging_lanterns'
  | 'standards'
  | 'rain_chains'
  | 'memorial_statues'
  | 'balustrades'
  | 'pointed_arches';

export interface ConstructionFloorPlacement {
  kind: ConstructionFloorKind;
  at: Vec2;
  policy: 'flush';
}

export interface ConstructionVerticalPlacement<
  Kind extends ConstructionWallKind | ConstructionWindowKind | ConstructionDetailKind,
> {
  kind: Kind;
  at: Vec2;
  policy: 'visual-only';
}

const SOLID_RADIUS: Readonly<Partial<Record<ConceptKitKind, number>>> = {
  obelisk: 0.52,
  plinth: 0.46,
  brazier: 0.48,
  statue: 0.5,
  bell_post: 0.55,
  standard: 0.36,
};

export const CONCEPT_SOLID_KINDS: readonly ConceptKitKind[] = Object.keys(
  SOLID_RADIUS,
) as ConceptKitKind[];

export const conceptSolidRadius = (kind: ConceptKitKind): number => {
  const radius = SOLID_RADIUS[kind];
  if (radius === undefined) throw new Error(`concept kit solid '${kind}' has no collision footprint`);
  return radius;
};

export const conceptPlacementPolicy = (
  placement:
    | ConceptKitSpec
    | ConceptFloorPlacement
    | ConstructionFloorPlacement
    | ConstructionVerticalPlacement<
      ConstructionWallKind | ConstructionWindowKind | ConstructionDetailKind
    >,
): ConceptPlacementPolicy => placement.policy ?? 'visual-only';

export const conceptKitObstacles = (
  placements: readonly ConceptKitSpec[],
): Obstacle[] =>
  placements.flatMap((placement) => {
    if (conceptPlacementPolicy(placement) !== 'solid') return [];
    const radius = SOLID_RADIUS[placement.kind];
    if (radius === undefined) {
      throw new Error(`concept kit solid '${placement.kind}' has no collision footprint`);
    }
    return [{ at: { ...placement.at }, radius: radius * (placement.scale ?? 1) }];
  });

export const OCCUPIED_FLOOR_SOLIDS: readonly ConceptKitSpec[] = [
  { kind: 'obelisk', at: { x: -6.5, y: 4.1 }, policy: 'solid' },
  { kind: 'plinth', at: { x: -4, y: 4.9 }, policy: 'solid' },
  { kind: 'brazier', at: { x: -1.4, y: 5.25 }, policy: 'solid' },
  { kind: 'statue', at: { x: 1.4, y: 5.25 }, policy: 'solid' },
  { kind: 'bell_post', at: { x: 4, y: 4.9 }, policy: 'solid' },
  { kind: 'standard', at: { x: 6.5, y: 4.1 }, policy: 'solid', accent: 'red' },
];

export const OCCUPIED_FLOOR_FLUSH: readonly ConceptFloorPlacement[] = [
  { kind: 'shattered_crown', at: { x: -6.6, y: -3.8 }, policy: 'flush' },
  { kind: 'medallion_rings', at: { x: -2.2, y: -3.8 }, policy: 'flush' },
  { kind: 'oath_blade', at: { x: 2.2, y: -3.8 }, policy: 'flush' },
  { kind: 'procession_lanes', at: { x: 6.6, y: -3.8 }, policy: 'flush' },
  { kind: 'puddle', at: { x: -6.6, y: 0.2 }, policy: 'flush', accent: 'cold' },
  { kind: 'runner', at: { x: -2.2, y: 0.2 }, policy: 'flush', accent: 'red' },
  { kind: 'drain', at: { x: 2.2, y: 0.2 }, policy: 'flush' },
  { kind: 'violet_petals', at: { x: 6.6, y: 0.2 }, policy: 'flush', accent: 'violet' },
];

export const OCCUPIED_FLOOR_OBSTACLES: readonly Obstacle[] =
  conceptKitObstacles(OCCUPIED_FLOOR_SOLIDS);

export const CONSTRUCTION_FLOORS: readonly ConstructionFloorPlacement[] = [
  { kind: 'clean_bordered_ashlar', at: { x: -7.8, y: -4.3 }, policy: 'flush' },
  { kind: 'oath_blades', at: { x: -2.6, y: -4.3 }, policy: 'flush' },
  { kind: 'shattered_crown', at: { x: 2.6, y: -4.3 }, policy: 'flush' },
  { kind: 'polygon_rings', at: { x: 7.8, y: -4.3 }, policy: 'flush' },
  { kind: 'runner', at: { x: -7.8, y: -2 }, policy: 'flush' },
  { kind: 'rain_polished_tiles', at: { x: -2.6, y: -2 }, policy: 'flush' },
  { kind: 'rough_repaired_stone', at: { x: 2.6, y: -2 }, policy: 'flush' },
  { kind: 'violet_court_geometry', at: { x: 7.8, y: -2 }, policy: 'flush' },
];

export const CONSTRUCTION_WALLS: readonly ConstructionVerticalPlacement<ConstructionWallKind>[] = [
  { kind: 'plain_heraldic_panel', at: { x: -8.5, y: 0.45 }, policy: 'visual-only' },
  { kind: 'red_standard_arms', at: { x: -5.1, y: 0.45 }, policy: 'visual-only' },
  { kind: 'violet_record_panels', at: { x: -1.7, y: 0.45 }, policy: 'visual-only' },
  { kind: 'breached_masonry', at: { x: 1.7, y: 0.45 }, policy: 'visual-only' },
  { kind: 'blind_pale_arches', at: { x: 5.1, y: 0.45 }, policy: 'visual-only' },
  { kind: 'service_lantern_wall', at: { x: 8.5, y: 0.45 }, policy: 'visual-only' },
];

export const CONSTRUCTION_WINDOWS: readonly ConstructionVerticalPlacement<ConstructionWindowKind>[] = [
  { kind: 'clear_heraldic_lancet', at: { x: -8.4, y: 3 }, policy: 'visual-only' },
  { kind: 'deep_empty_lancet', at: { x: -5.6, y: 3 }, policy: 'visual-only' },
  { kind: 'barred_slit', at: { x: -2.8, y: 3 }, policy: 'visual-only' },
  { kind: 'violet_diamond_glass', at: { x: 0, y: 3 }, policy: 'visual-only' },
  { kind: 'rose_window', at: { x: 2.8, y: 3 }, policy: 'visual-only' },
  { kind: 'empty_opening', at: { x: 5.6, y: 3 }, policy: 'visual-only' },
  { kind: 'crown_panel', at: { x: 8.4, y: 3 }, policy: 'visual-only' },
];

export const CONSTRUCTION_DETAILS: readonly ConstructionVerticalPlacement<ConstructionDetailKind>[] = [
  { kind: 'steps', at: { x: -8.5, y: 5.35 }, policy: 'visual-only' },
  { kind: 'trims', at: { x: -6.8, y: 5.35 }, policy: 'visual-only' },
  { kind: 'drains', at: { x: -5.1, y: 5.35 }, policy: 'visual-only' },
  { kind: 'corbels', at: { x: -3.4, y: 5.35 }, policy: 'visual-only' },
  { kind: 'sconces', at: { x: -1.7, y: 5.35 }, policy: 'visual-only' },
  { kind: 'hanging_lanterns', at: { x: 0, y: 5.35 }, policy: 'visual-only' },
  { kind: 'standards', at: { x: 1.7, y: 5.35 }, policy: 'visual-only' },
  { kind: 'rain_chains', at: { x: 3.4, y: 5.35 }, policy: 'visual-only' },
  { kind: 'memorial_statues', at: { x: 5.1, y: 5.35 }, policy: 'visual-only' },
  { kind: 'balustrades', at: { x: 6.8, y: 5.35 }, policy: 'visual-only' },
  { kind: 'pointed_arches', at: { x: 8.5, y: 5.35 }, policy: 'visual-only' },
];

export const CONSTRUCTION_KIT_PIECE_COUNT =
  CONSTRUCTION_FLOORS.length +
  CONSTRUCTION_WALLS.length +
  CONSTRUCTION_WINDOWS.length +
  CONSTRUCTION_DETAILS.length;

const SIX_PIECE_COMPOSITION: readonly Vec2[] = [
  { x: -1.7, y: -0.9 },
  { x: 0, y: -1.05 },
  { x: 1.7, y: -0.85 },
  { x: -1.7, y: 0.9 },
  { x: 0, y: 0.75 },
  { x: 1.7, y: 1 },
];

const SEVEN_PIECE_COMPOSITION: readonly Vec2[] = [
  { x: -1.9, y: -0.9 },
  { x: 0, y: -1.1 },
  { x: 1.9, y: -0.9 },
  { x: -1.9, y: 0.9 },
  { x: 0, y: 1.1 },
  { x: 1.9, y: 0.9 },
  { x: 0, y: 0 },
];

const narrativeComposition = (
  kinds: readonly NarrativeClutterKind[],
  centre: Vec2,
): readonly NarrativeClutterPlacement[] => {
  const offsets = kinds.length === 6 ? SIX_PIECE_COMPOSITION : SEVEN_PIECE_COMPOSITION;
  return kinds.map((kind, index) => ({
    kind,
    at: {
      x: centre.x + offsets[index].x,
      y: centre.y + offsets[index].y,
    },
    policy: 'visual-only',
    accent:
      kind === 'torn_standard' || kind === 'intact_standard'
        ? 'red'
        : kind === 'rain_bucket'
          ? 'cold'
          : undefined,
  }));
};

export const NARRATIVE_CLUTTER: Readonly<
  Record<NarrativeClutterFamily, readonly NarrativeClutterPlacement[]>
> = {
  loyalty: narrativeComposition([
    'intact_standard',
    'mounted_sword',
    'memorial',
    'roll_of_names',
    'shield',
    'votive_candles',
  ], { x: -5, y: -2.7 }),
  absence: narrativeComposition([
    'empty_frame',
    'curtained_empty_chair',
    'missing_object_plinth',
    'untouched_table',
    'clock',
    'barred_door',
  ], { x: 5, y: -2.7 }),
  siege: narrativeComposition([
    'torn_standard',
    'broken_statue',
    'bound_pikes',
    'barricade',
    'breached_plaster',
    'fallen_bell',
    'rain_bucket',
  ], { x: -5, y: 2.7 }),
  service: narrativeComposition([
    'broom_lantern',
    'ledger_table',
    'keys_seals',
    'basket',
    'covered_cart',
    'ash_brazier',
    'service_stair',
  ], { x: 5, y: 2.7 }),
};

export const NARRATIVE_CLUTTER_PIECE_COUNT = Object.values(NARRATIVE_CLUTTER)
  .reduce((count, placements) => count + placements.length, 0);

export const NARRATIVE_CLUTTER_GALLERY: readonly NarrativeClutterPlacement[] = [
  ...NARRATIVE_CLUTTER.loyalty,
  ...NARRATIVE_CLUTTER.absence,
  ...NARRATIVE_CLUTTER.siege,
  ...NARRATIVE_CLUTTER.service,
];

export const CONCEPT_ROOM_CLUTTER: Readonly<Record<string, ConceptRoomClutterRecipe>> = {
  concept_lantern_cloister: {
    primary: 'loyalty',
    placements: [
      { kind: 'memorial', at: { x: -8.1, y: -4.5 } },
      { kind: 'standard', at: { x: 8, y: -4.6 }, accent: 'red' },
      { kind: 'candles', at: { x: -7.4, y: 4.6 } },
      { kind: 'candles', at: { x: 7.4, y: 4.6 } },
    ],
  },
  concept_oath_gallery: {
    primary: 'loyalty',
    placements: [
      { kind: 'sword', at: { x: 0, y: -5.4 }, scale: 1.15 },
      { kind: 'standard', at: { x: -7.8, y: -4.6 }, accent: 'red' },
      { kind: 'standard', at: { x: 7.8, y: -4.6 }, accent: 'red' },
      { kind: 'memorial', at: { x: -8.1, y: 3.8 } },
      { kind: 'memorial', at: { x: 8.1, y: 3.8 } },
    ],
  },
  concept_bell_court: {
    primary: 'loyalty',
    placements: [
      { kind: 'bell_post', at: { x: -8, y: -4.1 } },
      { kind: 'bell_post', at: { x: 8, y: -4.1 } },
      { kind: 'candles', at: { x: -7.6, y: 4.7 } },
      { kind: 'candles', at: { x: 7.6, y: 4.7 } },
    ],
  },
  concept_shattered_dais: {
    primary: 'siege',
    placements: [
      { kind: 'torn_standard', at: { x: -7.8, y: -4.6 }, accent: 'red' },
      { kind: 'broken_statue', at: { x: 7.8, y: -4.4 } },
      { kind: 'barricade', at: { x: -7.4, y: 3.9 } },
      { kind: 'fallen_bell', at: { x: 7.2, y: 4.1 } },
    ],
  },
  concept_guard_procession: {
    primary: 'loyalty',
    secondary: 'service',
    placements: [
      { kind: 'standard', at: { x: -8.8, y: -4.8 }, accent: 'red' },
      { kind: 'standard', at: { x: 8.8, y: -4.8 }, accent: 'red' },
      { kind: 'weapon_rack', at: { x: -8.8, y: 2.7 } },
      { kind: 'weapon_rack', at: { x: 8.8, y: 2.7 } },
      { kind: 'brazier', at: { x: -9.2, y: 4.5 }, accent: 'red' },
      { kind: 'brazier', at: { x: 9.2, y: 4.5 }, accent: 'red' },
    ],
  },
  concept_violet_chancellery: {
    primary: 'absence',
    secondary: 'service',
    placements: [
      { kind: 'empty_chair', at: { x: -6.5, y: -3.7 }, accent: 'violet' },
      { kind: 'empty_chair', at: { x: 6.5, y: -3.7 }, accent: 'violet' },
      { kind: 'ledger_table', at: { x: -7.3, y: 2.6 }, accent: 'violet' },
      { kind: 'ledger_table', at: { x: 7.3, y: 2.6 }, accent: 'violet' },
      { kind: 'clock', at: { x: 0, y: -5.6 }, accent: 'violet' },
    ],
  },
  concept_rookery_roofs: {
    primary: 'service',
    secondary: 'siege',
    placements: [
      { kind: 'cart', at: { x: -8.6, y: 5.5 } },
      { kind: 'torn_standard', at: { x: 8.5, y: -0.5 }, accent: 'red' },
      { kind: 'bucket', at: { x: -3, y: -2.2 }, accent: 'cold' },
    ],
  },
  concept_chainbridge_court: {
    primary: 'siege',
    placements: [
      { kind: 'barricade', at: { x: -8.8, y: 0 } },
      { kind: 'barricade', at: { x: 8.8, y: 0 } },
      { kind: 'statue', at: { x: -1.4, y: -5.8 }, scale: 1.2 },
      { kind: 'statue', at: { x: 1.4, y: 5.8 }, scale: 1.2 },
    ],
  },
  concept_flooded_nave: {
    primary: 'siege',
    secondary: 'loyalty',
    placements: [
      { kind: 'bucket', at: { x: -7.1, y: -3.4 }, accent: 'cold' },
      { kind: 'bucket', at: { x: 2.2, y: 2.1 }, accent: 'cold' },
      { kind: 'fallen_bell', at: { x: 7.4, y: 4.2 }, accent: 'cold' },
      { kind: 'candles', at: { x: -6.3, y: 1.3 }, accent: 'cold' },
    ],
  },
  concept_bell_foundry: {
    primary: 'service',
    secondary: 'siege',
    placements: [
      { kind: 'cart', at: { x: -9.3, y: 0.8 }, accent: 'red' },
      { kind: 'brazier', at: { x: 0, y: 5.8 }, accent: 'red' },
      { kind: 'bucket', at: { x: 8.7, y: -0.8 } },
    ],
  },
  concept_archive_spiral: {
    primary: 'service',
    secondary: 'absence',
    placements: [
      { kind: 'ledger_table', at: { x: -8.8, y: -5.2 } },
      { kind: 'clock', at: { x: 8.9, y: 4.8 } },
      { kind: 'empty_chair', at: { x: -6.7, y: 2.6 } },
      { kind: 'cart', at: { x: 4.3, y: 1 } },
    ],
  },
  concept_hollow_throne: {
    primary: 'absence',
    secondary: 'siege',
    placements: [
      { kind: 'torn_standard', at: { x: -4.2, y: -4.5 }, accent: 'red' },
      { kind: 'torn_standard', at: { x: 4.2, y: -4.5 }, accent: 'red' },
      { kind: 'empty_chair', at: { x: 0, y: -3.25 }, scale: 1.35 },
      { kind: 'fallen_bell', at: { x: 7.7, y: 4.4 } },
    ],
  },
};

export const conceptRoomClutter = (encounterId: string): readonly ConceptKitSpec[] =>
  CONCEPT_ROOM_CLUTTER[encounterId]?.placements ?? [];
