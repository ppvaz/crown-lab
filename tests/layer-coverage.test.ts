
import { describe, expect, it } from 'vitest';

import { coverageOf, partitionReport, recomposeReport } from '../scripts/lib/layer-coverage.mjs';

const W = 60;
const H = 40;

const inside = (rects: [number, number, number, number][], x: number, y: number) =>
  rects.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);

const scene = (...rects: [number, number, number, number][]) => ({
  width: W,
  height: H,
  channels: 3,
  at: (x: number, y: number): [number, number, number] =>
    inside(rects, x, y) ? [120, 120, 130] : [0, 0, 0],
  alphaAt: () => 255,
});

const translucent = (colour: [number, number, number], ...rects: [number, number, number, number][]) => ({
  width: W,
  height: H,
  channels: 4,
  at: (x: number, y: number): [number, number, number] => (inside(rects, x, y) ? colour : [0, 0, 0]),
  alphaAt: (x: number, y: number) => (inside(rects, x, y) ? 255 : 0),
});

const FLOOR: [number, number, number, number] = [5, 20, 55, 35];
const WALL: [number, number, number, number] = [5, 5, 55, 22];
const PROP: [number, number, number, number] = [40, 24, 48, 32];

describe('do the layers add up to the room', () => {
  it('reports nothing dropped when every mass is in a layer', () => {
    const whole = coverageOf(scene(FLOOR, WALL, PROP));
    const parts = [coverageOf(scene(FLOOR)), coverageOf(scene(WALL)), coverageOf(scene(PROP))];
    const report = partitionReport(whole, parts);
    expect(report.dropped).toBe(0);
    expect(report.outside).toBe(0);
    expect(report.covered).toBeGreaterThan(0);
  });

  it('finds a dropped mass only where nothing else draws', () => {
    const OVER_VOID: [number, number, number, number] = [5, 36, 15, 40];
    const whole = coverageOf(scene(FLOOR, WALL, OVER_VOID));
    const parts = [coverageOf(scene(FLOOR)), coverageOf(scene(WALL))];
    expect(partitionReport(whole, parts).dropped).toBe(10 * 4);
  });

  it('is blind to a mass standing over another layer, which is why the gate is a count', () => {
    const whole = coverageOf(scene(FLOOR, WALL, PROP));
    const withProp = [coverageOf(scene(FLOOR)), coverageOf(scene(WALL)), coverageOf(scene(PROP))];
    const without = [coverageOf(scene(FLOOR)), coverageOf(scene(WALL))];
    expect(partitionReport(whole, withProp).dropped).toBe(0);
    expect(partitionReport(whole, without).dropped).toBe(0);
  });

  it('counts overlap where the layers genuinely share pixels, and does not call it a fault', () => {
    const whole = coverageOf(scene(FLOOR, WALL));
    const parts = [coverageOf(scene(FLOOR)), coverageOf(scene(WALL))];
    const report = partitionReport(whole, parts);
    expect(report.overlapped).toBe(50 * 2);
    expect(report.dropped).toBe(0);
  });

  it('catches a layer drawn where the whole render has nothing', () => {
    const whole = coverageOf(scene(FLOOR));
    const parts = [coverageOf(scene(FLOOR)), coverageOf(scene([0, 0, 4, 4]))];
    expect(partitionReport(whole, parts).outside).toBe(16);
  });

  it('measures the silhouette, because a dropped count means nothing on its own', () => {
    const whole = coverageOf(scene([10, 10, 30, 20]));
    expect(partitionReport(whole, [whole]).perimeter).toBe(2 * 20 + 2 * 10 - 4);
  });

  it('refuses to compare layers exported at different sizes', () => {
    const whole = coverageOf(scene(FLOOR));
    expect(() =>
      partitionReport(whole, [{ width: 1, height: 1, mask: new Uint8Array(1) }]),
    ).toThrow(/sizes differ/);
  });

  it('treats the transparent film as uncovered, which is what makes the threshold work', () => {
    const empty = coverageOf(scene());
    expect(partitionReport(empty, [empty]).covered).toBe(0);
  });

  it('reads coverage off alpha, so a dark layer is not a missing one', () => {
    const dark = translucent([2, 2, 3], FLOOR);
    const report = partitionReport(coverageOf(dark), [coverageOf(dark)]);
    expect(report.covered).toBe(50 * 15);
    expect(report.dropped).toBe(0);
    const noAlpha = { ...dark, channels: 3, alphaAt: () => 255 };
    expect(partitionReport(coverageOf(noAlpha), [coverageOf(noAlpha)]).covered).toBe(0);
  });
});

describe('does merged × shadow rebuild the room', () => {
  const opaque = (colour: [number, number, number]) => ({
    width: W,
    height: H,
    channels: 4,
    at: () => colour,
    alphaAt: () => 255,
  });

  it('is silent when the factor is exactly what the two renders differ by', () => {
    const report = recomposeReport(opaque([100, 100, 100]), [opaque([200, 200, 200])], opaque([128, 128, 128]));
    expect(report.compared).toBe(W * H);
    expect(report.meanAbsError).toBeLessThan(1);
    expect(report.meanBase).toBeCloseTo(200);
  });

  it('reports the whole shadow when the layers kept their own', () => {
    const report = recomposeReport(opaque([100, 100, 100]), [opaque([100, 100, 100])], opaque([128, 128, 128]));
    expect(report.meanAbsError).toBeGreaterThan(40);
  });

  it('compares interior pixels only, because a silhouette is not the decomposition', () => {
    const edge = {
      width: W,
      height: H,
      channels: 4,
      at: (): [number, number, number] => [100, 100, 100],
      alphaAt: (x: number) => (x < 10 ? 120 : 255),
    };
    expect(recomposeReport(edge, [opaque([200, 200, 200])], opaque([128, 128, 128])).compared).toBe(
      (W - 10) * H,
    );
  });
});
