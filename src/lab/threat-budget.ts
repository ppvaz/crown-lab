
import { makeRng, nextInt, nextRange } from '../sim/rng';
import type { EnemyArchetype, Obstacle, Vec2, WaveDef } from '../sim/types';

export const THREAT_COST: Record<EnemyArchetype, number> = {
  guard: 1,
  mesh_guard: 1,
  duelist: 2,
  archer: 2,
  pike_novice: 2,
  elite_guard: 3,
  first_blade: 6,
  captain: 8,
  captain_read: 8,
  rain_boss: 8,
  chancellor: 8,
  pike_boss: 8,
  thorn_marshal: 8,
  queen: 8,
  glass_regent: 8,
};

export interface WaveBudgetSpec {
  seed: number;
  budget: number;
  waveCount: number;
  archetypes: EnemyArchetype[];
  costs?: Partial<Record<EnemyArchetype, number>>;
  spawnMargin: number;
}

const clearOf = (avoid: readonly Obstacle[], margin: number, at: Vec2, centre: Vec2): Vec2 => {
  const blocked = (point: Vec2): boolean =>
    avoid.some(
      (obstacle) =>
        Math.hypot(point.x - obstacle.at.x, point.y - obstacle.at.y) < obstacle.radius + margin,
    );
  if (!blocked(at)) return at;
  const mirrored = { x: 2 * centre.x - at.x, y: 2 * centre.y - at.y };
  return blocked(mirrored) ? centre : mirrored;
};

export const costOf = (spec: WaveBudgetSpec, archetype: EnemyArchetype): number =>
  spec.costs?.[archetype] ?? THREAT_COST[archetype];

export const waveBudgetProblem = (spec: WaveBudgetSpec): string | null => {
  if (!(spec.budget > 0)) return 'budget must be positive';
  if (!Number.isInteger(spec.waveCount) || spec.waveCount < 1) return 'waveCount must be a positive integer';
  if (spec.archetypes.length === 0) return 'archetypes must name at least one body';
  for (const archetype of spec.archetypes) {
    if (!(costOf(spec, archetype) > 0)) return `every archetype needs a positive threat cost ('${archetype}' has none)`;
  }
  if (!(spec.spawnMargin >= 0)) return 'spawnMargin must not be negative';
  const cheapest = Math.min(...spec.archetypes.map((archetype) => costOf(spec, archetype)));
  if (spec.budget / spec.waveCount < cheapest) {
    return `budget ${spec.budget} across ${spec.waveCount} waves cannot afford one ${cheapest}-cost body per wave`;
  }
  return null;
};

export const planWaves = (
  spec: WaveBudgetSpec,
  chambers: readonly Vec2[][],
  avoid: readonly Obstacle[] = [],
): WaveDef[] => {
  const problem = waveBudgetProblem(spec);
  if (problem !== null) throw new Error(`wave budget: ${problem}`);
  if (chambers.length < 2) throw new Error('wave budget: needs a chamber that is not the king\'s');

  const rng = makeRng(spec.seed);
  const share = spec.budget / spec.waveCount;
  const elsewhere = chambers.slice(1);

  for (const cell of elsewhere) {
    const width = Math.max(...cell.map((p) => p.x)) - Math.min(...cell.map((p) => p.x));
    const height = Math.max(...cell.map((p) => p.y)) - Math.min(...cell.map((p) => p.y));
    if (Math.min(width, height) <= 2 * spec.spawnMargin) {
      throw new Error(`wave budget: spawnMargin ${spec.spawnMargin} leaves no floor in a chamber`);
    }
  }

  return Array.from({ length: spec.waveCount }, (_, index) => {
    const spawns: WaveDef['spawns'] = [];
    let remaining = share;
    for (;;) {
      const affordable = spec.archetypes.filter((archetype) => costOf(spec, archetype) <= remaining + 1e-9);
      if (affordable.length === 0) break;
      const archetype = affordable[nextInt(rng, 0, affordable.length)];
      remaining -= costOf(spec, archetype);

      const cell = elsewhere[nextInt(rng, 0, elsewhere.length)];
      const box = {
        x0: Math.min(...cell.map((point) => point.x)) + spec.spawnMargin,
        x1: Math.max(...cell.map((point) => point.x)) - spec.spawnMargin,
        y0: Math.min(...cell.map((point) => point.y)) + spec.spawnMargin,
        y1: Math.max(...cell.map((point) => point.y)) - spec.spawnMargin,
      };
      spawns.push({
        archetype,
        at: clearOf(
          avoid,
          spec.spawnMargin,
          { x: nextRange(rng, box.x0, box.x1), y: nextRange(rng, box.y0, box.y1) },
          { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 },
        ),
      });
    }
    return { id: `w${index + 1}`, atMs: index === 0 ? 0 : null, spawns };
  });
};
