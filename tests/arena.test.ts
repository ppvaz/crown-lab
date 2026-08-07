
import type { Arena } from '../src/sim/types';
import {
  arenaContains,
  arenaElevationAt,
  arenaNavigationTarget,
  arenaGeometryIsValid,
  arenaGateIsClosed,
  arenaVertices,
  clampArenaMovement,
  clampToArena,
  rayToArenaBoundary,
} from '../src/sim/arena';
import { makeCamera, screenToWorld, worldToScreen } from '../src/render/iso';
import { ENCOUNTERS } from '../src/lab/encounters';
import { DEFAULT_COMBAT, SLOWMO_PRESETS } from '../src/lab/config';
import { createWorld } from '../src/sim/encounter';
import { NEUTRAL_INTENT } from '../src/sim/types';
import { stepWorld } from '../src/sim/world';

const rectangle: Arena = { halfExtents: { x: 10, y: 7 } };
const hexagon: Arena = {
  halfExtents: { x: 10, y: 6 },
  vertices: [
    { x: -7, y: -6 },
    { x: 7, y: -6 },
    { x: 10, y: 0 },
    { x: 7, y: 6 },
    { x: -7, y: 6 },
    { x: -10, y: 0 },
  ],
};

describe('convex arena boundaries', () => {
  it('preserves the legacy rectangle when no vertices are authored', () => {
    expect(arenaVertices(rectangle)).toEqual([
      { x: -10, y: -7 },
      { x: 10, y: -7 },
      { x: 10, y: 7 },
      { x: -10, y: 7 },
    ]);
    expect(clampToArena(rectangle, { x: 20, y: -20 }, 0.5)).toEqual({
      x: 9.5,
      y: -6.5,
    });
  });

  it('rejects a bounding-box corner cut away by a hexagonal room', () => {
    expect(arenaContains(hexagon, { x: 9, y: 5 })).toBe(false);
    expect(arenaContains(hexagon, { x: 8, y: 2 })).toBe(true);
  });

  it('projects bodies inside the inset polygon rather than its bounding rectangle', () => {
    const clamped = clampToArena(hexagon, { x: 9, y: 5 }, 0.5);
    expect(arenaContains(hexagon, clamped, 0.5)).toBe(true);
    expect(clamped.x).toBeLessThan(9);
  });

  it('ends a committed ray on the actual sloped wall', () => {
    const landed = rayToArenaBoundary(hexagon, { x: 0, y: 0 }, { x: 1, y: 0.5 }, 0);
    expect(landed.x).toBeCloseTo(8, 6);
    expect(landed.y).toBeCloseTo(4, 6);
    expect(arenaContains(hexagon, landed)).toBe(true);
  });

  it('crosses from an inset rectangular corner toward the opposite walls', () => {
    const origin = { x: -9.42, y: -6.42 };
    const directionLength = Math.hypot(origin.x, origin.y);
    const landed = rayToArenaBoundary(
      rectangle,
      origin,
      { x: -origin.x / directionLength, y: -origin.y / directionLength },
      0.58,
    );
    expect(landed.x).toBeGreaterThan(0);
    expect(landed.y).toBeGreaterThan(0);
  });

  it('rejects clockwise, concave and under-declared authored boundaries', () => {
    expect(arenaGeometryIsValid(hexagon)).toBe(true);
    expect(
      arenaGeometryIsValid({ ...hexagon, vertices: [...hexagon.vertices!].reverse() }),
    ).toBe(false);
    expect(
      arenaGeometryIsValid({
        ...hexagon,
        vertices: hexagon.vertices!.map((p, i) => (i === 1 ? { x: 0, y: 0 } : p)),
      }),
    ).toBe(false);
    expect(arenaGeometryIsValid({ ...hexagon, halfExtents: { x: 8, y: 6 } })).toBe(false);
  });
});

describe('authored elevation ramp', () => {
  const split: Arena = {
    ...hexagon,
    elevationRamp: { axis: 'y', from: 2, to: -2, height: 0.9, steps: 6 },
  };

  it('keeps the lower floor flat, rises through the stairs and holds the upper level', () => {
    expect(arenaElevationAt(split, { x: 0, y: 4 })).toBe(0);
    expect(arenaElevationAt(split, { x: 0, y: 0 })).toBeCloseTo(0.45);
    expect(arenaElevationAt(split, { x: 0, y: -4 })).toBe(0.9);
  });

  it.each([
    { x: -2, y: 4 },
    { x: 1, y: 0 },
    { x: 2, y: -4 },
  ])('keeps pointer projection invertible at $x,$y', (point) => {
    const camera = makeCamera(1280, 720);
    camera.arena = split;
    const screen = worldToScreen(camera, point);
    const restored = screenToWorld(camera, screen.x, screen.y);
    expect(restored.x).toBeCloseTo(point.x, 4);
    expect(restored.y).toBeCloseTo(point.y, 4);
  });
});

describe('compound room navigation and wave-locked doors', () => {
  const encounter = ENCOUNTERS.overlap_court;

  it('treats the authored convex cells as one concave playable floor', () => {
    expect(arenaGeometryIsValid(encounter.arena)).toBe(true);
    expect(arenaContains(encounter.arena, { x: -6, y: -4 }, 0.5)).toBe(true);
    expect(arenaContains(encounter.arena, { x: 1.5, y: -1.5 }, 0.5)).toBe(true);
    expect(arenaContains(encounter.arena, { x: 6, y: 5 }, 0.5)).toBe(true);
    expect(arenaContains(encounter.arena, { x: -5, y: 5 })).toBe(false);
  });

  it('routes an enemy through the next overlapping portal instead of into a concave wall', () => {
    const first = arenaNavigationTarget(
      encounter.arena,
      { x: -6, y: -4 },
      { x: 6, y: 5 },
      0.5,
    );
    expect(first.direct).toBe(false);
    expect(first.point.x).toBeCloseTo(-1.5);
    expect(first.point.y).toBeCloseTo(-1.5);

    const last = arenaNavigationTarget(
      encounter.arena,
      { x: 1.5, y: 0.8 },
      { x: 6, y: 5 },
      0.5,
    );
    expect(last.direct).toBe(false);
    expect(last.point.x).toBeCloseTo(1.5);
    expect(last.point.y).toBeCloseTo(2.5);
  });

  it('answers identically when asked twice, per radius, and hands out no reference into itself', () => {
    const from = { x: -6, y: -4 };
    const to = { x: 6, y: 5 };
    const first = arenaNavigationTarget(encounter.arena, from, to, 0.5);
    first.point.x = 999;
    first.point.y = 999;

    const second = arenaNavigationTarget(encounter.arena, from, to, 0.5);
    expect(second.point.x).toBeCloseTo(-1.5);
    expect(second.point.y).toBeCloseTo(-1.5);

    const fat = arenaNavigationTarget(encounter.arena, from, to, 1.2);
    const fatAgain = arenaNavigationTarget(encounter.arena, from, to, 1.2);
    expect(fatAgain.direct).toBe(fat.direct);
    expect(fatAgain.point.x).toBeCloseTo(fat.point.x);
    expect(fatAgain.point.y).toBeCloseTo(fat.point.y);
  });

  it('blocks the current doorway, then opens it permanently when its wave clears', () => {
    const combat = structuredClone(DEFAULT_COMBAT);
    const world = createWorld(encounter, combat, 1);
    stepWorld(world, [NEUTRAL_INTENT], combat, SLOWMO_PRESETS.none, encounter);
    const [lowerGate, upperGate] = world.arena.gates!;
    expect(arenaGateIsClosed(world, lowerGate)).toBe(true);
    expect(arenaGateIsClosed(world, upperGate)).toBe(false);

    const blocked = clampArenaMovement(
      world,
      { x: -2.2, y: -1.5 },
      { x: 0, y: -1.5 },
      0.5,
    );
    expect(blocked.x).toBeCloseTo(-2);

    for (const enemy of world.enemies) {
      enemy.hp = 0;
      enemy.state.kind = 'dead';
    }
    stepWorld(world, [NEUTRAL_INTENT], combat, SLOWMO_PRESETS.none, encounter);
    expect(world.encounter.clearedWaves).toContain('w1');
    expect(world.events.some((event) => event.type === 'arena_gate_opened')).toBe(true);
    expect(arenaGateIsClosed(world, lowerGate)).toBe(false);
    expect(arenaGateIsClosed(world, upperGate)).toBe(true);

    const released = clampArenaMovement(
      world,
      { x: -2.2, y: -1.5 },
      { x: 0, y: -1.5 },
      0.5,
    );
    expect(released.x).toBeCloseTo(0);
  });
});
