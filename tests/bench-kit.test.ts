
import { describe, expect, it } from 'vitest';

import { ENCOUNTERS } from '../src/lab/encounters';
import { summarize, thinRoster } from '../src/lab/bench-kit';

const maze = ENCOUNTERS['maze_serpentine']!;

describe('thinRoster', () => {
  it('keeps the requested number of bodies', () => {
    for (const bodies of [1, 3, 6]) {
      const thinned = thinRoster(maze, bodies);
      expect(thinned.waves[0]!.spawns).toHaveLength(bodies);
    }
  });

  it('spreads the survivors across the wave instead of slicing off its front', () => {
    const spawns = maze.waves[0]!.spawns;
    const first = spawns[0]!.at.x;
    const last = spawns[spawns.length - 1]!.at.x;
    const kept = thinRoster(maze, 3).waves[0]!.spawns;

    const span = Math.abs(kept[kept.length - 1]!.at.x - kept[0]!.at.x);
    expect(span).toBeGreaterThan(Math.abs(last - first) * 0.5);
  });

  it('leaves a wave alone when it is already short enough', () => {
    const guard = ENCOUNTERS['kernel_guard']!;
    expect(thinRoster(guard, 6).waves[0]!.spawns).toHaveLength(guard.waves[0]!.spawns.length);
  });

  it('does not mutate the content it was handed', () => {
    const before = maze.waves[0]!.spawns.length;
    thinRoster(maze, 2);
    expect(ENCOUNTERS['maze_serpentine']!.waves[0]!.spawns).toHaveLength(before);
  });
});

describe('summarize', () => {
  it('reports the tail, not only the mean', () => {
    const samples = [...Array.from({ length: 99 }, () => 1), 100];
    const summary = summarize(samples);
    expect(summary.samples).toBe(100);
    expect(summary.mean).toBeCloseTo(1.99, 2);
    expect(summary.p50).toBe(1);
    expect(summary.max).toBe(100);
  });

  it('puts p95 above p50 when the tail is long', () => {
    const summary = summarize([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 40]);
    expect(summary.p95).toBeGreaterThan(summary.p50);
  });

  it('survives an empty sample set rather than reporting NaN', () => {
    expect(summarize([])).toEqual({ samples: 0, mean: 0, p50: 0, p95: 0, max: 0 });
  });
});
