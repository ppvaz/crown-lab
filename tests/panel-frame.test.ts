
import { describe, expect, it } from 'vitest';

import {
  budgetReport,
  fitAffineFrame,
  fitRuntimeFrame,
  floorCornerPairs,
} from '../scripts/lib/panel-frame.mjs';

const PROJ = { isoX: 34, isoY: 17 };

const project = (
  x: number,
  y: number,
  s: number,
  origin: [number, number],
): [number, number] => [
  origin[0] + (x - y) * PROJ.isoX * s,
  origin[1] + (x + y) * PROJ.isoY * s,
];

const cornersOf = (hx: number, hy: number, s = 0.4, origin: [number, number] = [255, 252]) => ({
  left: project(-hx, hy, s, origin),
  right: project(hx, -hy, s, origin),
  far: project(-hx, -hy, s, origin),
  near: project(hx, hy, s, origin),
});

const pairsOf = (hx: number, hy: number, s?: number, origin?: [number, number]) =>
  floorCornerPairs(cornersOf(hx, hy, s, origin), { x: hx, y: hy });

describe('the panel/runtime comparison frame', () => {
  it('recovers the zoom and pan of a panel drawn in the runtime projection', () => {
    const frame = fitRuntimeFrame(pairsOf(8.5, 8.5, 0.376, [255.7, 252.4]), PROJ);
    expect(frame.scale).toBeCloseTo(0.376, 9);
    expect(frame.origin[0]).toBeCloseTo(255.7, 6);
    expect(frame.origin[1]).toBeCloseTo(252.4, 6);
    expect(frame.worst).toBeLessThan(1e-9);
  });

  it('reads the same deviation wherever the panel sits and however large it is drawn', () => {
    const a = fitRuntimeFrame(pairsOf(8.5, 8.5, 0.2, [0, 0]), PROJ);
    const b = fitRuntimeFrame(pairsOf(8.5, 8.5, 3.4, [1200, 830]), PROJ);
    expect(a.worst).toBeLessThan(1e-9);
    expect(b.worst).toBeLessThan(1e-9);
  });

  it('charges a shape disagreement to the runtime frame, which cannot absorb one', () => {
    const panel = cornersOf(8.5, 8.5);
    const frame = fitRuntimeFrame(floorCornerPairs(panel, { x: 10, y: 7 }), PROJ);
    expect(frame.worst).toBeGreaterThan(20);
  });

  it('lets the affine frame absorb a stretch the camera cannot produce', () => {
    const panel = cornersOf(8.5, 8.5);
    const stretched = Object.fromEntries(
      Object.entries(panel).map(([k, [x, y]]) => [k, [x, 252 + (y - 252) * 1.06]]),
    ) as typeof panel;
    const pairs = floorCornerPairs(stretched, { x: 8.5, y: 8.5 });
    expect(fitRuntimeFrame(pairs, PROJ).worst).toBeGreaterThan(5);
    expect(fitAffineFrame(pairs).worst).toBeLessThan(1e-9);
  });

  it('leaves a residual under every linear map when the panel has converging axes', () => {
    const panel = cornersOf(9, 8);
    const converging = Object.fromEntries(
      Object.entries(panel).map(([k, [x, y]]) => {
        const f = 1 / (1 + (y - 252) / 1500);
        return [k, [255 + (x - 255) * f, 252 + (y - 252) * f]];
      }),
    ) as typeof panel;
    const pairs = floorCornerPairs(converging, { x: 9, y: 8 });
    const affine = fitAffineFrame(pairs);
    expect(affine.worst).toBeGreaterThan(1);
    expect(fitRuntimeFrame(pairs, PROJ).worst).toBeGreaterThan(affine.worst);
  });

  it('spends one residual equally on four corners, however badly one was picked', () => {
    const clean = fitAffineFrame(pairsOf(8.5, 8.5));
    expect(clean.worst).toBeLessThan(1e-9);

    const panel = cornersOf(8.5, 8.5);
    const bad = { ...panel, near: [panel.near[0], panel.near[1] + 40] as [number, number] };
    const frame = fitAffineFrame(floorCornerPairs(bad, { x: 8.5, y: 8.5 }));
    expect(frame.worst).toBeGreaterThan(9);
    expect(frame.residualSpread).toBeLessThan(1e-9);
  });

  it('can at least see the inconsistency once a fifth landmark over-determines the fit', () => {
    const panel = cornersOf(8.5, 8.5);
    const pairs = floorCornerPairs(
      { ...panel, near: [panel.near[0], panel.near[1] + 40] as [number, number] },
      { x: 8.5, y: 8.5 },
    );
    pairs.push({ name: 'lantern', world: [-8.5, 0], panel: project(-8.5, 0, 0.4, [255, 252]) });

    const frame = fitAffineFrame(pairs);
    expect(frame.residualSpread).toBeGreaterThan(0.1);
  });

  it('spends the budget on the floor before the model', () => {
    const report = budgetReport({ worst: 15.21 }, { worst: 7.26 }, 410, 0.02);
    expect(report.deviation).toBeCloseTo(0.0371, 4);
    expect(report.floor).toBeCloseTo(0.0177, 4);
    expect(report.availablePx).toBeCloseTo(0.94, 2);
    expect(report.passes).toBe(false);
    expect(report.reachable).toBe(true);
  });
});
