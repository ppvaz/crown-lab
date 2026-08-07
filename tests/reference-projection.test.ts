
import { describe, expect, it } from 'vitest';

import {
  measureRuns,
  projectionReport,
  projectionVerdict,
  silhouetteBottom,
} from '../scripts/lib/reference-projection.mjs';

const PROJ = { isoX: 34, isoY: 17 };
const WIDTH = 1600;
const HEIGHT = 1400;
const RUNS = { frontLeft: { x0: 200, x1: 700 }, frontRight: { x0: 900, x1: 1400 } };

const roomAt =
  (edge: (fromCorner: number) => number, near = 1100) =>
  (x: number, y: number): [number, number, number] => {
    const inFrame = x >= 120 && x <= 1480;
    const boundary = near - edge(Math.abs(x - 800));
    return inFrame && y <= boundary ? [90, 90, 100] : [2, 2, 3];
  };

const measure = (edge: (d: number) => number) => {
  const points = silhouetteBottom(roomAt(edge), WIDTH, HEIGHT);
  return projectionReport(measureRuns(points, RUNS), PROJ);
};

describe('the projection a reference image was drawn in', () => {
  it('reads 0.5 off a room drawn in the runtime projection, which is the blockout', () => {
    const report = measure((d) => 0.5 * d);
    expect(report.ratio).toBeCloseTo(0.5, 4);
    expect(report.deviation).toBeCloseTo(0, 4);
    expect(report.asymmetry).toBeLessThan(0.001);
    expect(projectionVerdict(report).readableForGeometry).toBe(true);
  });

  it('is indifferent to how large the room is drawn and where it sits', () => {
    const a = measure((d) => 0.5 * d);
    const b = projectionReport(
      measureRuns(silhouetteBottom(roomAt((d) => 0.5 * d, 1340), WIDTH, HEIGHT), RUNS),
      PROJ,
    );
    expect(b.ratio).toBeCloseTo(a.ratio, 6);
  });

  it('charges a different axonometric its full relative deviation', () => {
    const report = measure((d) => 0.56567 * d);
    expect(report.deviation).toBeCloseTo(0.1313, 3);
    expect(report.worstDrift).toBeLessThan(0.01);
    const verdict = projectionVerdict(report);
    expect(verdict.ratioOk).toBe(false);
    expect(verdict.parallelOk).toBe(true);
    expect(verdict.readableForGeometry).toBe(false);
  });

  it('catches converging edges whose mean slope is exactly right', () => {
    const mid = 350;
    const report = measure((d) => 0.5 * d + 3e-5 * (d - mid) ** 2 - 3e-5 * mid ** 2);
    expect(Math.abs(report.deviation)).toBeLessThan(0.02);
    const verdict = projectionVerdict(report);
    expect(verdict.ratioOk).toBe(true);
    expect(verdict.parallelOk).toBe(false);
    expect(verdict.readableForGeometry).toBe(false);
  });

  it('separates the two runs, because an axonometric may treat them differently', () => {
    const points = silhouetteBottom(
      (x, y) => {
        const inFrame = x >= 120 && x <= 1480;
        const d = x - 800;
        const boundary = 1100 - (d < 0 ? 0.5 * -d : 0.62 * d);
        return inFrame && y <= boundary ? [90, 90, 100] : [2, 2, 3];
      },
      WIDTH,
      HEIGHT,
    );
    const report = projectionReport(measureRuns(points, RUNS), PROJ);
    expect(report.asymmetry).toBeCloseTo(0.12 / 0.56, 2);
    expect(projectionVerdict(report).ratioOk).toBe(false);
  });

  it('rejects a prop that dips below the edge rather than fitting through it', () => {
    const clean = measure((d) => 0.5 * d);
    const points = silhouetteBottom(
      (x, y) => {
        const inFrame = x >= 120 && x <= 1480;
        const d = Math.abs(x - 800);
        const prop = x >= 300 && x <= 340 ? 25 : 0;
        return inFrame && y <= 1100 - 0.5 * d + prop ? [90, 90, 100] : [2, 2, 3];
      },
      WIDTH,
      HEIGHT,
    );
    const runs = measureRuns(points, RUNS);
    expect(runs.frontLeft.rejected).toBeGreaterThan(20);
    expect(projectionReport(runs, PROJ).ratio).toBeCloseTo(clean.ratio, 3);
  });

  it('drops columns that hold no room at all, rather than reporting them as an edge', () => {
    const points = silhouetteBottom(roomAt((d) => 0.5 * d), WIDTH, HEIGHT);
    expect(points.every(([x]) => x >= 120 && x <= 1480)).toBe(true);
    expect(points.length).toBe(1361);
  });

  it('refuses a window that caught nothing, instead of fitting two stray points', () => {
    const points = silhouetteBottom(roomAt((d) => 0.5 * d), WIDTH, HEIGHT);
    expect(() => measureRuns(points, { off: { x0: 1500, x1: 1560 } })).toThrow(/too few to fit/);
  });
});
