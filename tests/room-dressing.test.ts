
import { arenaContains } from '../src/sim/arena';
import { conceptKitObstacles, conceptSolidRadius } from '../src/lab/concept-kit';
import { generateChambers, type ChambersSpec } from '../src/lab/generate';
import {
  DEFAULT_DRESSING,
  dressGeneratedRoom,
  generatedCells,
} from '../src/lab/room-dressing';
import { encounterForSeed } from '../src/lab/encounters';
import type { Vec2 } from '../src/sim/types';

const DIALS: ChambersSpec = {
  seed: 1,
  chambers: 3,
  chamberSpanMin: 3,
  chamberSpanMax: 4,
  spacing: 10.5,
  corridorWidth: 3,
};

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const BODY = 0.45;

const boxOf = (cell: Vec2[]) => ({
  x0: Math.min(...cell.map((p) => p.x)),
  x1: Math.max(...cell.map((p) => p.x)),
  y0: Math.min(...cell.map((p) => p.y)),
  y1: Math.max(...cell.map((p) => p.y)),
});

const distanceToBox = (box: ReturnType<typeof boxOf>, point: Vec2): number =>
  Math.hypot(
    Math.max(box.x0 - point.x, 0, point.x - box.x1),
    Math.max(box.y0 - point.y, 0, point.y - box.y1),
  );

describe('dressing a generated room', () => {
  it('is the same furniture from the same seed, and different from a different one', () => {
    const arena = generateChambers(DIALS).arena;
    expect(dressGeneratedRoom(arena, 5)).toEqual(dressGeneratedRoom(arena, 5));
    expect(dressGeneratedRoom(arena, 5)).not.toEqual(dressGeneratedRoom(arena, 6));
  });

  it('derives collision from the spec that draws, never from a second list', () => {
    for (const seed of SEEDS) {
      const arena = generateChambers({ ...DIALS, seed }).arena;
      const dressed = dressGeneratedRoom(arena, seed);
      expect(dressed.obstacles).toEqual(conceptKitObstacles(dressed.placements));
      for (const placement of dressed.placements) {
        if (placement.policy !== 'solid') continue;
        const obstacle = dressed.obstacles.find(
          (candidate) => candidate.at.x === placement.at.x && candidate.at.y === placement.at.y,
        );
        expect(obstacle?.radius).toBe(conceptSolidRadius(placement.kind));
      }
    }
  });

  it('stands every solid on the floor and every decoration off it', () => {
    for (const seed of SEEDS) {
      const arena = generateChambers({ ...DIALS, seed }).arena;
      const dressed = dressGeneratedRoom(arena, seed);
      for (const placement of dressed.placements) {
        if (placement.policy === 'solid') {
          expect(arenaContains(arena, placement.at), `seed ${seed} ${placement.kind}`).toBe(true);
        } else {
          expect(arenaContains(arena, placement.at), `seed ${seed} ${placement.kind}`).toBe(false);
        }
      }
    }
  });

  it('never narrows a passage, and never stands in the king\'s face', () => {
    for (const seed of SEEDS) {
      const room = generateChambers({ ...DIALS, seed });
      const dressed = dressGeneratedRoom(room.arena, seed);
      const { corridors } = generatedCells(room.arena);
      for (const placement of dressed.placements) {
        if (placement.policy !== 'solid') continue;
        const radius = conceptSolidRadius(placement.kind);
        for (const corridor of corridors) {
          expect(
            distanceToBox(boxOf(corridor), placement.at),
            `seed ${seed} ${placement.kind}`,
          ).toBeGreaterThanOrEqual(radius);
        }
        expect(
          Math.hypot(placement.at.x - room.playerStart.x, placement.at.y - room.playerStart.y),
          `seed ${seed} ${placement.kind}`,
        ).toBeGreaterThan(radius + BODY);
      }
    }
  });

  it('gives every passage two sides, which is what the first capture was missing', () => {
    for (const seed of SEEDS) {
      const room = generateChambers({ ...DIALS, seed });
      const dressed = dressGeneratedRoom(room.arena, seed);
      const { corridors } = generatedCells(room.arena);
      const posts = dressed.placements.filter((placement) => placement.policy !== 'solid');
      expect(posts.length, `seed ${seed}`).toBe(corridors.length * 2);
      for (const corridor of corridors) {
        const flanking = posts.filter(
          (post) => distanceToBox(boxOf(corridor), post.at) < 1.5,
        );
        expect(flanking.length, `seed ${seed}`).toBe(2);
      }
    }
  });

  it('splits a generated arena back into the cells it was built from', () => {
    const room = generateChambers(DIALS);
    const { chambers, corridors } = generatedCells(room.arena);
    expect(chambers).toEqual(room.chambers);
    expect(corridors).toHaveLength(DIALS.chambers - 1);
    expect(() => generatedCells({ halfExtents: { x: 1, y: 1 }, regions: [[], [], [], []] })).toThrow(
      /not a generated chain/,
    );
  });

  it('reaches the loaded room, so the fight is fought around the furniture', () => {
    const withPillars = SEEDS.map((seed) => encounterForSeed('generated_chambers', seed)).filter(
      (def) => (def.arena.obstacles?.length ?? 0) > 0,
    );
    expect(withPillars.length).toBeGreaterThan(SEEDS.length / 2);

    for (const def of withPillars) {
      for (const obstacle of def.arena.obstacles ?? []) {
        expect(arenaContains(def.arena, obstacle.at)).toBe(true);
        for (const spawn of def.waves.flatMap((wave) => wave.spawns)) {
          expect(
            Math.hypot(spawn.at.x - obstacle.at.x, spawn.at.y - obstacle.at.y),
          ).toBeGreaterThanOrEqual(obstacle.radius);
        }
      }
    }
  });

  it('carries a story rather than a shelf of props', () => {
    const arena = generateChambers(DIALS).arena;
    const families = new Set(SEEDS.map((seed) => dressGeneratedRoom(arena, seed).family));
    expect(families.size).toBeGreaterThan(1);
    expect(DEFAULT_DRESSING.pillarChance).toBeGreaterThan(0);
  });
});
