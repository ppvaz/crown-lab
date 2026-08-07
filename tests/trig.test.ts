
import { describe, expect, it } from 'vitest';

import { asin, atan, atan2, cos, sin } from '../src/sim/trig';

const TOLERANCE = 1e-15;

const worstError = (mine: (x: number) => number, native: (x: number) => number, xs: number[]) => {
  let worst = 0;
  let at = 0;
  for (const x of xs) {
    const error = Math.abs(mine(x) - native(x));
    if (error > worst) {
      worst = error;
      at = x;
    }
  }
  return { worst, at };
};

const range = (count: number, from: number, step: number) =>
  Array.from({ length: count }, (_, i) => from + i * step);

describe('pinned sin and cos agree with the host', () => {
  const play = range(200_001, -16, 1 / 6250);

  it('is accurate over the range the sim uses', () => {
    expect(worstError(sin, Math.sin, play).worst).toBeLessThan(TOLERANCE);
    expect(worstError(cos, Math.cos, play).worst).toBeLessThan(TOLERANCE);
  });

  it('survives argument reduction far outside it', () => {
    const wide = range(50_000, -1000, 1 / 25);
    expect(worstError(sin, Math.sin, wide).worst).toBeLessThan(TOLERANCE);
    expect(worstError(cos, Math.cos, wide).worst).toBeLessThan(TOLERANCE);
  });

  it('holds the identities that matter geometrically', () => {
    for (const a of range(2000, -Math.PI, Math.PI / 1000)) {
      expect(sin(a) * sin(a) + cos(a) * cos(a)).toBeCloseTo(1, 15);
    }
  });

  it('is exact at the quadrant boundaries', () => {
    expect(sin(0)).toBe(0);
    expect(cos(0)).toBe(1);
    expect(Math.abs(sin(Math.PI))).toBeLessThan(TOLERANCE);
    expect(cos(Math.PI)).toBeCloseTo(-1, 15);
    expect(sin(Math.PI / 2)).toBeCloseTo(1, 15);
    expect(Math.abs(cos(Math.PI / 2))).toBeLessThan(TOLERANCE);
  });
});

describe('pinned atan2', () => {
  it('agrees with the host across a full grid of directions', () => {
    let worst = 0;
    for (let j = -64; j <= 64; j++) {
      for (let i = -64; i <= 64; i++) {
        const error = Math.abs(atan2(j / 8, i / 8) - Math.atan2(j / 8, i / 8));
        if (error > worst) worst = error;
      }
    }
    expect(worst).toBeLessThan(TOLERANCE);
  });

  it('puts every quadrant where the world convention expects it', () => {
    expect(atan2(0, 1)).toBe(0);
    expect(atan2(1, 0)).toBeCloseTo(Math.PI / 2, 15);
    expect(atan2(0, -1)).toBeCloseTo(Math.PI, 15);
    expect(atan2(-1, 0)).toBeCloseTo(-Math.PI / 2, 15);
    expect(atan2(1, 1)).toBeCloseTo(Math.PI / 4, 15);
    expect(atan2(-1, -1)).toBeCloseTo(-3 * Math.PI / 4, 15);
  });

  it('answers zero for a zero vector, which is what angleOf promises', () => {
    expect(atan2(0, 0)).toBe(0);
  });

  it('round-trips through sin and cos', () => {
    for (const a of range(1000, -Math.PI + 1e-9, (2 * Math.PI) / 1000)) {
      expect(atan2(sin(a), cos(a))).toBeCloseTo(a, 14);
    }
  });

  it('handles ratios large enough to overflow', () => {
    expect(atan(Number.MAX_VALUE)).toBeCloseTo(Math.PI / 2, 15);
    expect(atan2(1e308, 1e-308)).toBeCloseTo(Math.PI / 2, 15);
  });
});

describe('pinned asin', () => {
  it('agrees with the host over the closed unit interval', () => {
    const unit = range(200_001, -1, 1 / 100_000);
    expect(worstError(asin, Math.asin, unit).worst).toBeLessThan(TOLERANCE);
  });

  it('is exact at the endpoints, where powers.ts reads it', () => {
    expect(asin(1)).toBeCloseTo(Math.PI / 2, 15);
    expect(asin(-1)).toBeCloseTo(-Math.PI / 2, 15);
    expect(asin(0)).toBe(0);
  });

  it('refuses an argument outside the domain instead of inventing an angle', () => {
    expect(Number.isNaN(asin(1.0000001))).toBe(true);
    expect(Number.isNaN(asin(-2))).toBe(true);
  });
});

describe('the pinned functions are built only from operations the spec pins', () => {
  it('calls no approximated Math function, including from itself', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(process.cwd(), 'src', 'sim', 'trig.ts'), 'utf8');
    const calls = source.match(/Math\.[a-z0-9]+\s*\(/gi) ?? [];
    expect([...new Set(calls)].sort()).toEqual(['Math.round(', 'Math.sqrt(']);
  });
});
