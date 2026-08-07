
import { describe, expect, it } from 'vitest';

import { cameraContract, ceilingFor, probeRoom, rasterCost, VIEWPORTS } from '../scripts/room-zoom';
import { READABLE_ZOOM } from '../src/render/iso';

const ROOM = 'concept_lantern_cloister';

describe('the room push-in ceiling', () => {
  const ceiling = ceilingFor(ROOM);

  it('derives the ceiling from the roster, not from maxZoom', () => {
    expect(ceiling.arenaSpan).toBe(17);
    expect(ceiling.shortest.archetype).toBe('guard');
    expect(ceiling.shortest.reach).toBeCloseTo(3.8, 5);
    expect(ceiling.tightestSpan).toBeCloseTo(7.6, 5);
    expect(ceiling.ratio).toBeCloseTo(17 / 7.6, 5);
  });

  it('is the shortest reach in the roster that sets it, not the longest', () => {
    const duelist = ceiling.reaches.find((r) => r.archetype === 'duelist');
    expect(duelist).toBeDefined();
    expect(duelist!.reach).toBeGreaterThan(ceiling.shortest.reach);
  });

  it('never reaches the 2.6 maxZoom clamp the first estimate divided by', () => {
    for (const row of probeRoom(ROOM)) expect(row.peak).toBeLessThan(2.6);
  });

  it('does not use the readable floor, because the room is not oversized', () => {
    const restings = probeRoom(ROOM).map((row) => row.resting);
    expect(restings.every((z) => z !== READABLE_ZOOM)).toBe(true);
  });
});

describe('the push-in ratio is viewport-independent', () => {
  it('produces the same peak/resting on every viewport', () => {
    const rows = probeRoom(ROOM);
    expect(rows).toHaveLength(VIEWPORTS.length);
    const [first, ...rest] = rows;
    for (const row of rest) expect(row.ratio).toBeCloseTo(first.ratio, 4);
  });

  it('still varies the resting zoom itself across viewports', () => {
    const rows = probeRoom(ROOM);
    const restings = rows.map((row) => row.resting);
    expect(Math.max(...restings) / Math.min(...restings)).toBeGreaterThan(2.0);
  });
});

describe('the sampled push-in', () => {
  it('never exceeds the derived ceiling', () => {
    const ceiling = ceilingFor(ROOM);
    for (const row of probeRoom(ROOM)) expect(row.ratio).toBeLessThanOrEqual(ceiling.ratio + 1e-6);
  });

  it('is reported as a floor, not as the ceiling', () => {
    const ceiling = ceilingFor(ROOM);
    const peak = Math.max(...probeRoom(ROOM).map((row) => row.ratio));
    expect(peak).toBeLessThan(ceiling.ratio);
  });
});

describe('raster cost', () => {
  it('covers the whole arena, not a viewport', () => {
    const cost = rasterCost(17, 1, 'unit');
    expect(cost.w).toBe(2 * 17 * 34);
  });

  it('scales area quadratically, which is why the pixel ratio dominates', () => {
    const one = rasterCost(17, 1, 'one');
    const two = rasterCost(17, 2, 'two');
    expect(two.mbPerLayer / one.mbPerLayer).toBeGreaterThan(3.9);
  });
});

describe('the frame actually contains the room', () => {
  const contract = cameraContract(ROOM);
  const { widthPx, heightPx, effectiveScale: s, origin } = contract.raster;
  const { isoX, isoY, elevationY, wallUnits } = contract.projection;

  const project = (x: number, y: number, h: number) => ({
    x: widthPx / 2 + (x - y) * isoX * s,
    y: heightPx / 2 + ((x + y) * isoY - (h - origin.elevation) * elevationY) * s,
  });

  const corners = contract.arena.vertices ?? [];

  it('holds every arena corner at the top of the wall', () => {
    expect(corners.length).toBeGreaterThan(0);
    for (const c of corners) {
      const p = project(c.x, c.y, wallUnits);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(heightPx);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(widthPx);
    }
  });

  it('holds every arena corner at the floor', () => {
    for (const c of corners) {
      const p = project(c.x, c.y, 0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(heightPx);
    }
  });

  it('puts the frame centre half a wall up, not on the floor', () => {
    expect(origin.elevation).toBeCloseTo(wallUnits / 2, 12);
    expect(project(0, 0, origin.elevation).y).toBeCloseTo(heightPx / 2, 9);
    expect(project(0, 0, 0).y).toBeGreaterThan(heightPx / 2);
  });

  it('would have failed on the aim that shipped, which is the point', () => {
    const old = (x: number, y: number, h: number) =>
      heightPx / 2 + ((x + y) * isoY - h * elevationY) * s;
    const worst = Math.min(...corners.map((c) => old(c.x, c.y, wallUnits)));
    expect(worst).toBeLessThan(0);
    expect(Math.abs(worst)).toBeGreaterThan(100);
  });
});
