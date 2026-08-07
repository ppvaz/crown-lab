
import { describe, expect, it } from 'vitest';

import {
  cornersFromRuns,
  columnRidges,
  fitLine,
  fitRun,
  intersect,
  parallelism,
  sampleRun,
  slopeOf,
} from '../scripts/lib/panel-corners.mjs';

const project = (x: number, y: number, isoX: number, isoY: number, s: number): [number, number] => [
  320 + (x - y) * isoX * s,
  205 + (x + y) * isoY * s,
];

const runsOf = (hx: number, hy: number, isoX = 34, isoY = 17, s = 0.4) => {
  const left = project(-hx, hy, isoX, isoY, s);
  const right = project(hx, -hy, isoX, isoY, s);
  const far = project(-hx, -hy, isoX, isoY, s);
  const near = project(hx, hy, isoX, isoY, s);
  return {
    frontLeft: fitLine([left, near]),
    frontRight: fitLine([near, right]),
    backLeft: fitLine([left, far]),
    backRight: fitLine([far, right]),
  };
};

describe('fitting a line', () => {
  it('recovers a known line from points on it', () => {
    const line = fitLine([
      [0, 10],
      [100, 70],
      [200, 130],
    ]);
    expect(slopeOf(line)).toBeCloseTo(0.6, 10);
  });

  it('handles a run steeper than 45 degrees, which a y = mx + c fit would weight wrongly', () => {
    const pts: [number, number][] = [];
    for (let y = 0; y < 100; y += 1) pts.push([40 + y * 0.05, y]);
    const line = fitLine(pts);
    expect(slopeOf(line)).toBeCloseTo(1 / 0.05, 6);
  });
});

describe('fitting a run', () => {
  const clean = (): [number, number][] =>
    Array.from({ length: 120 }, (_, i) => [80 + i, 250 + (80 + i) * 0.6] as [number, number]);

  it('fits a clean run to well under a pixel', () => {
    const { line, rms, rejected } = fitRun(clean());
    expect(slopeOf(line)).toBeCloseTo(0.6, 6);
    expect(rms).toBeLessThan(1e-9);
    expect(rejected).toBe(0);
  });

  it('survives a stretch where the detector lost the edge', () => {
    const pts = clean();
    for (let i = 30; i < 50; i += 1) pts[i] = [pts[i][0], pts[i][1] - 90];
    const { line, rejected } = fitRun(pts);
    expect(rejected).toBe(20);
    expect(slopeOf(line)).toBeCloseTo(0.6, 6);
  });

  it('refuses a run with too few samples rather than fitting two points', () => {
    expect(() => fitRun([[0, 0], [10, 6]])).toThrow(/too few/);
  });
});

describe('corners from runs', () => {
  it('recovers corners the panel never draws, for a square room', () => {
    const corners = cornersFromRuns(runsOf(8.5, 8.5));
    expect(corners.left[0]).toBeCloseTo(320 - 17 * 34 * 0.4, 6);
    expect(corners.near[1]).toBeCloseTo(205 + 17 * 17 * 0.4, 6);
    expect((corners.left[0] + corners.right[0]) / 2).toBeCloseTo(
      (corners.near[0] + corners.far[0]) / 2,
      6,
    );
  });

  it('recovers corners for the 20x14 the lab currently uses', () => {
    const corners = cornersFromRuns(runsOf(10, 7));
    expect(corners.right[0] - corners.left[0]).toBeCloseTo(2 * 17 * 34 * 0.4, 6);
    expect(corners.near[0] - corners.far[0]).toBeCloseTo(2 * 3 * 34 * 0.4, 6);
  });
});

describe('parallelism', () => {
  it('is zero for any rectangle under any parallel projection', () => {
    for (const [hx, hy] of [[8.5, 8.5], [10, 7], [3, 14]]) {
      for (const [isoX, isoY] of [[34, 17], [34, 22], [40, 9]]) {
        const p = parallelism(runsOf(hx, hy, isoX, isoY));
        expect(p.frontLeftVsBackRight).toBeLessThan(1e-9);
        expect(p.frontRightVsBackLeft).toBeLessThan(1e-9);
      }
    }
  });

  it('catches a panel whose opposite edges converge', () => {
    const runs = runsOf(8.5, 8.5);
    const converging = { ...runs, backRight: fitLine([[0, 0], [100, slopeOf(runs.frontLeft) * 100 * 0.82]]) };
    expect(parallelism(converging).frontLeftVsBackRight).toBeCloseTo(0.18, 2);
  });
});

describe('reading a run out of pixels', () => {
  const FLOOR: [number, number, number] = [32, 34, 41];
  const VOID: [number, number, number] = [14, 14, 16];
  const TRIM: [number, number, number] = [120, 98, 60];
  const STONE: [number, number, number] = [70, 70, 72];

  const painted = (edgeAt: (x: number) => number) => (x: number, y: number) => {
    const edge = edgeAt(x);
    if (y > edge) return VOID;
    if (Math.abs(y - (edge - 8)) < 1) return TRIM;
    if (Math.abs(y - (edge - 60)) < 1) return TRIM;
    if (y < 60) return STONE;
    return FLOOR;
  };

  it('finds every warm ridge in a column', () => {
    const ridges = columnRidges(painted((x) => 300 + x * 0.6), 100, 60, 400);
    expect(ridges).toHaveLength(2);
    expect(ridges[0].centre).toBeCloseTo(300 + 60 - 60, 0);
  });

  it('takes the lowest strong ridge for a front run, not the circle above it', () => {
    const at = painted((x) => 300 + x * 0.6);
    const points = sampleRun(at, { x0: 60, x1: 160, y0: 60, y1: 420, side: 'front' });
    expect(points).toHaveLength(101);
    const { line, rms } = fitRun(points);
    expect(slopeOf(line)).toBeCloseTo(0.6, 3);
    expect(rms).toBeLessThan(0.5);
  });

  it('takes the ridge with stone above and floor below for a back run', () => {
    const at = (x: number, y: number): [number, number, number] => {
      const base = 200 - x * 0.44;
      if (y < base - 2) return STONE;
      if (Math.abs(y - base) < 1) return TRIM;
      if (Math.abs(y - (base + 70)) < 1) return TRIM;
      return FLOOR;
    };
    const points = sampleRun(at, { x0: 80, x1: 200, y0: 60, y1: 300, side: 'back' });
    expect(points.length).toBeGreaterThan(100);
    expect(slopeOf(fitRun(points).line)).toBeCloseTo(-0.44, 4);
  });
});

describe('intersect', () => {
  it('refuses parallel lines rather than returning a corner at infinity', () => {
    const a = fitLine([[0, 0], [100, 60]]);
    const b = fitLine([[0, 50], [100, 110]]);
    expect(() => intersect(a, b)).toThrow(/parallel/);
  });
});
