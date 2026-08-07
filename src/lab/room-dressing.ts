
import { arenaContains } from '../sim/arena';
import { makeRng, nextFloat, nextInt } from '../sim/rng';
import type { Arena, Obstacle, RngState, Vec2 } from '../sim/types';
import {
  CONCEPT_SOLID_KINDS,
  conceptKitObstacles,
  conceptSolidRadius,
  type ConceptKitKind,
  type ConceptKitSpec,
  type NarrativeClutterFamily,
} from './concept-kit';

const DRESSING_STREAM_MIX = 0x2545f491;

const PILLAR_CLEARANCE = 0.9;
const START_CLEARANCE = 2.2;
const POST_OFFSET = 0.8;

const FAMILIES: readonly NarrativeClutterFamily[] = ['loyalty', 'absence', 'siege', 'service'];

const DOORPOST_KINDS: Readonly<Record<NarrativeClutterFamily, readonly ConceptKitKind[]>> = {
  loyalty: ['candles', 'standard', 'memorial'],
  absence: ['empty_frame', 'clock', 'missing_object_plinth'],
  siege: ['torn_standard', 'bound_pikes', 'broken_statue'],
  service: ['broom_lantern', 'keys_seals', 'ash_brazier'],
};

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const boxOf = (cell: readonly Vec2[]): Box => ({
  x0: Math.min(...cell.map((point) => point.x)),
  x1: Math.max(...cell.map((point) => point.x)),
  y0: Math.min(...cell.map((point) => point.y)),
  y1: Math.max(...cell.map((point) => point.y)),
});

const centreOf = (box: Box): Vec2 => ({ x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 });

const distanceToBox = (box: Box, point: Vec2): number => {
  const dx = Math.max(box.x0 - point.x, 0, point.x - box.x1);
  const dy = Math.max(box.y0 - point.y, 0, point.y - box.y1);
  return Math.hypot(dx, dy);
};

export const generatedCells = (arena: Arena): { chambers: Vec2[][]; corridors: Vec2[][] } => {
  const regions = arena.regions ?? [];
  const chamberCount = (regions.length + 1) / 2;
  if (!Number.isInteger(chamberCount)) {
    throw new Error(`room dressing: ${regions.length} regions is not a generated chain`);
  }
  return {
    chambers: regions.slice(0, chamberCount).map((cell) => cell.map((point) => ({ ...point }))),
    corridors: regions.slice(chamberCount).map((cell) => cell.map((point) => ({ ...point }))),
  };
};

export interface DressedRoom {
  placements: ConceptKitSpec[];
  obstacles: Obstacle[];
  family: NarrativeClutterFamily;
}

const chamberSolid = (
  rng: RngState,
  chamber: Vec2[],
  corridors: readonly Vec2[][],
  playerStart: Vec2,
  pillarChance: number,
): ConceptKitSpec | null => {
  const takesOne = nextFloat(rng) < pillarChance;
  const kind = CONCEPT_SOLID_KINDS[nextInt(rng, 0, CONCEPT_SOLID_KINDS.length)];
  const corner = nextInt(rng, 0, 4);
  if (!takesOne) return null;

  const box = boxOf(chamber);
  const radius = conceptSolidRadius(kind);
  const inset = radius + PILLAR_CLEARANCE;
  const at = {
    x: corner % 2 === 0 ? box.x0 + inset : box.x1 - inset,
    y: corner < 2 ? box.y0 + inset : box.y1 - inset,
  };

  for (const corridor of corridors) {
    if (distanceToBox(boxOf(corridor), at) < radius + PILLAR_CLEARANCE) return null;
  }
  if (Math.hypot(at.x - playerStart.x, at.y - playerStart.y) < START_CLEARANCE + radius) return null;
  return { kind, at, policy: 'solid' };
};

const doorposts = (
  rng: RngState,
  corridor: Vec2[],
  family: NarrativeClutterFamily,
  arena: Arena,
): ConceptKitSpec[] => {
  const kinds = DOORPOST_KINDS[family];
  const kind = kinds[nextInt(rng, 0, kinds.length)];
  const box = boxOf(corridor);
  const centre = centreOf(box);
  const horizontal = box.x1 - box.x0 > box.y1 - box.y0;
  const at = horizontal
    ? [
        { x: centre.x, y: box.y0 - POST_OFFSET },
        { x: centre.x, y: box.y1 + POST_OFFSET },
      ]
    : [
        { x: box.x0 - POST_OFFSET, y: centre.y },
        { x: box.x1 + POST_OFFSET, y: centre.y },
      ];
  return at.filter((point) => !arenaContains(arena, point)).map((point) => ({ kind, at: point }));
};

export interface DressingDials {
  pillarChance: number;
}

export const DEFAULT_DRESSING: DressingDials = { pillarChance: 0.6 };

export const dressGeneratedRoom = (
  arena: Arena,
  seed: number,
  dials: DressingDials = DEFAULT_DRESSING,
): DressedRoom => {
  const { chambers, corridors } = generatedCells(arena);
  const rng = makeRng((seed ^ DRESSING_STREAM_MIX) >>> 0);
  const family = FAMILIES[nextInt(rng, 0, FAMILIES.length)];
  const playerStart = centreOf(boxOf(chambers[0]));

  const placements: ConceptKitSpec[] = [];
  for (const chamber of chambers) {
    const solid = chamberSolid(rng, chamber, corridors, playerStart, dials.pillarChance);
    if (solid !== null) placements.push(solid);
  }
  for (const corridor of corridors) {
    placements.push(...doorposts(rng, corridor, family, arena));
  }

  return { placements, obstacles: conceptKitObstacles(placements), family };
};
