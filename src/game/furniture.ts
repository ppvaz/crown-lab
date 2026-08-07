
import type { Obstacle, Vec2, World } from '../sim/types';
import type { PowerStand } from './armoury';
import { POWER_STANDS, STAND_RADIUS } from './armoury';
import { COURT_ENCOUNTER, COURT_PILLARS } from './court';
import { HERALD, HERALD_RADIUS } from './herald';
import { ENVOY } from './envoy';
import type { EscortState } from './escort';
import { MARA, maraWaiting } from './escort';
import type { SealPuzzle } from './puzzle';
import { inAntechamber, sealFurniture } from './puzzle';

export const inOpeningCourt = (world: World): boolean =>
  world.encounter.defId === COURT_ENCOUNTER;

export type Furniture =
  | { kind: 'power_stand'; at: Vec2; radius: number; stand: PowerStand }
  | { kind: 'court_pillar'; at: Vec2; radius: number }
  | { kind: 'herald'; at: Vec2; radius: number }
  | { kind: 'envoy'; at: Vec2; radius: number }
  | { kind: 'escort'; at: Vec2; radius: number }
  | { kind: 'seal'; at: Vec2; radius: number; index: number };

export const courtFurniture = (world: World, escort: EscortState): readonly Furniture[] => {
  if (!inOpeningCourt(world)) return [];
  return [
    ...POWER_STANDS.map((stand): Furniture => ({
      kind: 'power_stand',
      at: { ...stand.at },
      radius: STAND_RADIUS,
      stand,
    })),
    { kind: 'herald', at: { ...HERALD.at }, radius: HERALD_RADIUS },
    { kind: 'envoy', at: { ...ENVOY.at }, radius: ENVOY.radius },
    ...COURT_PILLARS.map((pillar): Furniture => ({
      kind: 'court_pillar',
      at: { ...pillar.at },
      radius: pillar.radius,
    })),
    ...(maraWaiting(escort)
      ? [{ kind: 'escort' as const, at: { ...MARA.at }, radius: MARA.radius }]
      : []),
  ];
};

export const roomFurniture = (
  world: World,
  escort: EscortState,
  puzzle: SealPuzzle | null,
): readonly Furniture[] => {
  if (puzzle !== null && inAntechamber(world)) return sealFurniture(puzzle);
  return courtFurniture(world, escort);
};

export const furnitureObstacles = (items: readonly Furniture[]): Obstacle[] =>
  items.map((item) => ({ at: { ...item.at }, radius: item.radius }));

export const furnitureOfKind = <K extends Furniture['kind']>(
  items: readonly Furniture[],
  kind: K,
): ReadonlyArray<Extract<Furniture, { kind: K }>> =>
  items.filter((item): item is Extract<Furniture, { kind: K }> => item.kind === kind);
