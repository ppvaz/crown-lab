
import { describe, expect, it } from 'vitest';

import { arenaFromCorners, chamferedPolygon, projectToPanel } from '../scripts/lib/arena-from-panel.mjs';

const PROJ = { isoX: 34, isoY: 17 };

const cornersOf = (hx: number, hy: number, s = 1.7, origin: [number, number] = [640, 420]) => ({
  left: projectToPanel(-hx, hy, PROJ, s, origin),
  right: projectToPanel(hx, -hy, PROJ, s, origin),
  far: projectToPanel(-hx, -hy, PROJ, s, origin),
  near: projectToPanel(hx, hy, PROJ, s, origin),
});

describe('deriving an arena from panel corners', () => {
  it('round-trips a square room', () => {
    const got = arenaFromCorners(cornersOf(8.5, 8.5), PROJ, 17);
    expect(got.hx).toBeCloseTo(8.5, 6);
    expect(got.hy).toBeCloseTo(8.5, 6);
    expect(got.square).toBe(true);
  });

  it('round-trips the rectangle the lab currently uses', () => {
    const got = arenaFromCorners(cornersOf(10, 7), PROJ, 17);
    expect(got.hx).toBeCloseTo(10, 6);
    expect(got.hy).toBeCloseTo(7, 6);
    expect(got.square).toBe(false);
  });

  it('is independent of where the room sits in the panel and of its pixel scale', () => {
    const a = arenaFromCorners(cornersOf(10, 7, 1.0, [0, 0]), PROJ, 17);
    const b = arenaFromCorners(cornersOf(10, 7, 3.9, [1200, 830]), PROJ, 17);
    expect(a.hx).toBeCloseTo(b.hx, 6);
    expect(a.hy).toBeCloseTo(b.hy, 6);
  });

  it('reports near-zero residuals on a clean annotation', () => {
    const got = arenaFromCorners(cornersOf(9, 8), PROJ, 17);
    expect(got.residual.span).toBeLessThan(1e-9);
    expect(got.residual.skew).toBeLessThan(1e-9);
  });

  it('reports a residual when a corner is picked off the slab edge instead of the floor', () => {
    const c = cornersOf(8.5, 8.5);
    const bad = { ...c, near: [c.near[0], c.near[1] + 40] as [number, number] };
    const got = arenaFromCorners(bad, PROJ, 17);
    expect(got.residual.span).toBeGreaterThan(0.03);
    expect(got.residual.span).toBeCloseTo(0.0399, 3);
  });

  it('reads the same shape from either screen axis alone', () => {
    const got = arenaFromCorners(cornersOf(10, 7), PROJ, 17);
    expect(got.byAxis.x.hx).toBeCloseTo(10, 6);
    expect(got.byAxis.y.hx).toBeCloseTo(10, 6);
    expect(got.byAxis.x.ratio).toBeCloseTo(10 / 7, 6);
    expect(got.byAxis.y.ratio).toBeCloseTo(10 / 7, 6);
  });

  it('is told the wrong projection, and says so without getting the shape wrong', () => {
    const wrong = arenaFromCorners(cornersOf(10, 7), { isoX: 34, isoY: 24 }, 17);
    expect(wrong.residual.span).toBeGreaterThan(0.1);
    expect(wrong.hx).toBeCloseTo(10, 6);
    expect(wrong.byAxis.x.hx).toBeCloseTo(10, 6);
    expect(wrong.byAxis.y.hx).toBeCloseTo(10, 6);
  });

  it('brackets the shape when the panel has no single projection at all', () => {
    const measured = arenaFromCorners(
      {
        left: [38.46, 246.62],
        right: [467.99, 244.55],
        far: [269.87, 145.26],
        near: [246.49, 373.22],
      },
      PROJ,
      17,
    );
    expect(measured.byAxis.x.ratio).toBeCloseTo(0.897, 3);
    expect(measured.byAxis.y.ratio).toBeCloseTo(0.982, 3);
    expect(Math.max(measured.byAxis.x.ratio, measured.byAxis.y.ratio)).toBeLessThan(1);
    expect(Math.min(measured.byAxis.x.ratio, measured.byAxis.y.ratio)).toBeGreaterThan(0.85);
    expect(measured.hx).toBeGreaterThan(measured.byAxis.x.hx);
    expect(measured.hx).toBeLessThan(measured.byAxis.y.hx);
  });

  it('reports the projection the panel was actually drawn at', () => {
    const corners = cornersOf(9, 8);
    expect(arenaFromCorners(corners, PROJ, 17).panelIso).toBeCloseTo(17 / 34, 9);
    expect(arenaFromCorners(corners, { isoX: 1, isoY: 99 }, 17).panelIso).toBeCloseTo(17 / 34, 9);
  });

  it('keeps the corner cut proportional when re-shaping', () => {
    const poly = chamferedPolygon(8.5, 8.5, 3, 3);
    expect(poly).toHaveLength(8);
    expect(poly[0]).toEqual({ x: -5.5, y: -8.5 });
  });
});
