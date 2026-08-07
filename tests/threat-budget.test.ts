
import { arenaContains } from '../src/sim/arena';
import { generateChambers, type ChambersSpec } from '../src/lab/generate';
import {
  THREAT_COST,
  costOf,
  planWaves,
  waveBudgetProblem,
  type WaveBudgetSpec,
} from '../src/lab/threat-budget';
import type { Vec2 } from '../src/sim/types';

const BODY = 0.45;

const room = (seed = 1) =>
  generateChambers({
    seed,
    chambers: 3,
    chamberSpanMin: 3,
    chamberSpanMax: 4,
    spacing: 10.5,
    corridorWidth: 3,
  } satisfies ChambersSpec);

const budget = (over: Partial<WaveBudgetSpec> = {}): WaveBudgetSpec => ({
  seed: 2,
  budget: 6,
  waveCount: 2,
  spawnMargin: 1.2,
  archetypes: ['guard', 'duelist', 'archer', 'pike_novice'],
  ...over,
});

const inside = (cell: Vec2[], point: Vec2): boolean => {
  const xs = cell.map((p) => p.x);
  const ys = cell.map((p) => p.y);
  return (
    point.x >= Math.min(...xs) &&
    point.x <= Math.max(...xs) &&
    point.y >= Math.min(...ys) &&
    point.y <= Math.max(...ys)
  );
};

const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

describe('waves from a threat budget', () => {
  it('composes the same fight from the same seed', () => {
    const cells = room().chambers;
    expect(planWaves(budget(), cells)).toEqual(planWaves(budget(), cells));
    expect(planWaves(budget({ seed: 3 }), cells)).not.toEqual(planWaves(budget(), cells));
  });

  it('spends each wave down to what it can no longer afford, and never past its share', () => {
    const spec = budget();
    const share = spec.budget / spec.waveCount;
    const cheapest = Math.min(...spec.archetypes.map((a) => costOf(spec, a)));
    for (const seed of SEEDS) {
      const waves = planWaves({ ...spec, seed }, room(seed).chambers);
      expect(waves).toHaveLength(spec.waveCount);
      for (const wave of waves) {
        const spent = wave.spawns.reduce((sum, spawn) => sum + costOf(spec, spawn.archetype), 0);
        expect(spent).toBeLessThanOrEqual(share + 1e-9);
        expect(share - spent).toBeLessThan(cheapest);
        expect(wave.spawns.length).toBeGreaterThan(0);
      }
    }
  });

  it('stands every body in a chamber that is not the king\'s, on the floor', () => {
    for (const seed of SEEDS) {
      const generated = room(seed);
      const waves = planWaves(budget({ seed }), generated.chambers);
      for (const wave of waves) {
        for (const spawn of wave.spawns) {
          expect(inside(generated.chambers[0], spawn.at), `seed ${seed}`).toBe(false);
          expect(
            generated.chambers.slice(1).some((cell) => inside(cell, spawn.at)),
            `seed ${seed}`,
          ).toBe(true);
          expect(arenaContains(generated.arena, spawn.at, BODY), `seed ${seed}`).toBe(true);
        }
      }
    }
  });

  it('keeps the authored wave convention: first at zero, the rest on a clear room', () => {
    const waves = planWaves(budget({ waveCount: 3, budget: 9 }), room().chambers);
    expect(waves.map((wave) => wave.id)).toEqual(['w1', 'w2', 'w3']);
    expect(waves.map((wave) => wave.atMs)).toEqual([0, null, null]);
  });

  it('reads costs from the table, and lets a room feel them differently', () => {
    expect(THREAT_COST.guard).toBe(1);
    const spec = budget({ archetypes: ['guard', 'elite_guard'], costs: { elite_guard: 5 } });
    expect(costOf(spec, 'elite_guard')).toBe(5);
    expect(costOf(spec, 'guard')).toBe(THREAT_COST.guard);
    const waves = planWaves(spec, room().chambers);
    expect(waves.flatMap((wave) => wave.spawns).every((spawn) => spawn.archetype === 'guard')).toBe(true);
  });

  it('refuses a spec whose waves would be empty, or whose margin leaves no floor', () => {
    expect(waveBudgetProblem(budget())).toBeNull();
    expect(waveBudgetProblem(budget({ budget: 0 }))).toMatch(/budget must be positive/);
    expect(waveBudgetProblem(budget({ waveCount: 0 }))).toMatch(/waveCount/);
    expect(waveBudgetProblem(budget({ waveCount: 2.5 }))).toMatch(/waveCount/);
    expect(waveBudgetProblem(budget({ archetypes: [] }))).toMatch(/at least one body/);
    expect(waveBudgetProblem(budget({ spawnMargin: -1 }))).toMatch(/spawnMargin/);
    expect(waveBudgetProblem(budget({ costs: { guard: 0 } }))).toMatch(/positive threat cost/);
    expect(waveBudgetProblem(budget({ archetypes: ['duelist'], waveCount: 4 }))).toMatch(
      /cannot afford one 2-cost body per wave/,
    );

    expect(() => planWaves(budget({ spawnMargin: 4 }), room().chambers)).toThrow(/no floor/);
    expect(() => planWaves(budget(), room().chambers.slice(0, 1))).toThrow(/not the king/);
  });
});
