
import { describe, expect, it } from 'vitest';

import type { Arena } from '../src/sim/types';
import { arenaElevationAt, arenaVertices } from '../src/sim/arena';
import { ROOM_WALL_HEIGHT } from '../src/render/facade';
import { RoomScene } from '../src/render/gl/scene';

const COLOURS = { floor: '#2b2f36', wall: '#171a1f', gate: '#5a4632' };

const RECT: Arena = { halfExtents: { x: 10, y: 7 } };

const GATED: Arena = {
  halfExtents: { x: 10, y: 7 },
  gates: [
    { id: 'north', from: { x: -2, y: -7 }, to: { x: 2, y: -7 }, lockUntilWaveCleared: 'wave-1' },
  ],
};

const RAMPED: Arena = {
  halfExtents: { x: 10, y: 7 },
  elevationRamp: { axis: 'y', from: 3, to: -3, height: 1.2, steps: 4 },
};

const positionsOf = (scene: RoomScene): number[][] => {
  const out: number[][] = [];
  scene.group.traverse((object) => {
    const geometry = (object as { geometry?: { getAttribute?: (n: string) => { array: ArrayLike<number> } } })
      .geometry;
    const attribute = geometry?.getAttribute?.('position');
    if (attribute === undefined) return;
    for (let i = 0; i < attribute.array.length; i += 3) {
      out.push([attribute.array[i], attribute.array[i + 1], attribute.array[i + 2]]);
    }
  });
  return out;
};

const triangleCount = (scene: RoomScene): number => positionsOf(scene).length / 3;

describe('the room scene is built from the arena the simulation uses', () => {
  it('puts every vertex on the arena the sim navigates, at the elevation the sim reports', () => {
    const scene = new RoomScene(RECT, COLOURS);
    const h = RECT.halfExtents;
    const EPSILON = 1e-4;
    for (const [x, y, z] of positionsOf(scene)) {
      expect(Math.abs(x)).toBeLessThanOrEqual(h.x + EPSILON);
      expect(Math.abs(y)).toBeLessThanOrEqual(h.y + EPSILON);
      const ground = arenaElevationAt(RECT, { x, y });
      expect([ground, ground + ROOM_WALL_HEIGHT].some((v) => Math.abs(v - z) < EPSILON)).toBe(true);
    }
    scene.dispose();
  });

  it('draws one wall quad per perimeter edge, and a floor that covers the polygon', () => {
    const scene = new RoomScene(RECT, COLOURS);
    const edges = arenaVertices(RECT).length;
    expect(triangleCount(scene)).toBe(edges - 2 + edges * 2);
    scene.dispose();
  });

  it('adds a gate quad only where the arena declares one', () => {
    const plain = triangleCount(new RoomScene(RECT, COLOURS));
    const gated = triangleCount(new RoomScene(GATED, COLOURS));
    expect(gated - plain).toBe(2);
  });

  it('adds one riser per authored step, and none when there is no ramp', () => {
    const plain = triangleCount(new RoomScene(RECT, COLOURS));
    const ramped = triangleCount(new RoomScene(RAMPED, COLOURS));
    expect(ramped - plain).toBe(2 * (RAMPED.elevationRamp?.steps ?? 0));
  });

  it('does not mutate the arena it was built from', () => {
    const before = JSON.stringify(RAMPED);
    const scene = new RoomScene(RAMPED, COLOURS);
    scene.dispose();
    expect(JSON.stringify(RAMPED)).toBe(before);
  });

  it('releases its geometry, because a lab session walks through thirty rooms', () => {
    const scene = new RoomScene(RECT, COLOURS);
    const disposed: string[] = [];
    scene.group.traverse((object) => {
      const geometry = (object as { geometry?: { addEventListener?: unknown } }).geometry as
        | { addEventListener: (type: string, fn: () => void) => void }
        | undefined;
      geometry?.addEventListener('dispose', () => disposed.push('geometry'));
    });
    scene.dispose();
    expect(disposed.length).toBeGreaterThan(0);
    expect(scene.group.children).toHaveLength(0);
  });
});
