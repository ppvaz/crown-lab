
import { DEFAULT_COMBAT } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import {
  arenaContains,
  arenaGeometryIsValid,
  arenaNavigationTarget,
  arenaVertices,
  clampToArena,
} from '../src/sim/arena';
import type { Vec2 } from '../src/sim/types';

const MAZE = ENCOUNTERS.maze_serpentine;
const ARENA = MAZE.arena;
const PLAYER_RADIUS = DEFAULT_COMBAT.player.radius;

const insideOutline = (point: Vec2): boolean => {
  const vertices = arenaVertices(ARENA);
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i];
    const b = vertices[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
};

const CENTRELINE: Vec2[] = [
  { x: -60, y: -11 },
  { x: -60, y: 10.5 },
  { x: -40, y: 10.5 },
  { x: -40, y: -10.5 },
  { x: -20, y: -10.5 },
  { x: -20, y: 10.5 },
  { x: 0, y: 10.5 },
  { x: 0, y: -10.5 },
  { x: 20, y: -10.5 },
  { x: 20, y: 10.5 },
  { x: 40, y: 10.5 },
  { x: 40, y: -10.5 },
  { x: 60, y: -10.5 },
  { x: 60, y: 11 },
];

describe('the serpentine maze', () => {
  it('has valid geometry', () => {
    expect(arenaGeometryIsValid(ARENA)).toBe(true);
  });

  it('paints its outline exactly where its collision regions are', () => {
    const h = ARENA.halfExtents;
    let sampled = 0;
    let walkable = 0;
    for (let x = -h.x + 0.23; x < h.x; x += 0.25) {
      for (let y = -h.y + 0.23; y < h.y; y += 0.25) {
        const point = { x, y };
        sampled++;
        if (arenaContains(ARENA, point)) walkable++;
        expect(arenaContains(ARENA, point), `(${x.toFixed(2)}, ${y.toFixed(2)})`).toBe(
          insideOutline(point),
        );
      }
    }
    expect(sampled).toBeGreaterThan(10_000);
    expect(walkable / sampled).toBeLessThan(0.29);
    expect(walkable / sampled).toBeGreaterThan(0.26);
  });

  it('is walkable corner to corner at the king’s radius', () => {
    for (let leg = 0; leg + 1 < CENTRELINE.length; leg++) {
      const from = CENTRELINE[leg];
      const to = CENTRELINE[leg + 1];
      const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 0.25);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
        expect(
          arenaContains(ARENA, point, PLAYER_RADIUS),
          `(${point.x.toFixed(2)}, ${point.y.toFixed(2)})`,
        ).toBe(true);
      }
    }
  });

  it('spawns every body on floor it fits on', () => {
    expect(arenaContains(ARENA, MAZE.playerStart, PLAYER_RADIUS)).toBe(true);
    for (const wave of MAZE.waves) {
      for (const spawn of wave.spawns) {
        const radius = DEFAULT_COMBAT.enemies[spawn.archetype].radius;
        expect(
          arenaContains(ARENA, spawn.at, radius),
          `${spawn.archetype} at ${JSON.stringify(spawn.at)}`,
        ).toBe(true);
      }
    }
  });

  it('puts neighbouring corridors on opposite sides of the nav mesh', () => {
    const radius = DEFAULT_COMBAT.enemies.guard.radius;
    for (const [from, to] of [
      [{ x: -60, y: 0 }, { x: -40, y: 0 }],
      [{ x: -40, y: 0 }, { x: -20, y: 0 }],
      [{ x: 40, y: 0 }, { x: 60, y: 0 }],
    ] as const) {
      expect(Math.hypot(to.x - from.x, to.y - from.y)).toBe(20);
      expect(arenaNavigationTarget(ARENA, from, to, radius).direct).toBe(false);
    }
  });

  it('steers an enemy the whole length of the snake', () => {
    const radius = DEFAULT_COMBAT.enemies.guard.radius;
    const goal = { x: 60, y: 10 };
    let at: Vec2 = { x: -60, y: -10 };
    let steps = 0;
    while (Math.hypot(goal.x - at.x, goal.y - at.y) > 0.5 && steps < 2_000) {
      const target = arenaNavigationTarget(ARENA, at, goal, radius).point;
      const dx = target.x - at.x;
      const dy = target.y - at.y;
      const distance = Math.max(1e-9, Math.hypot(dx, dy));
      const stride = Math.min(0.5, distance);
      at = clampToArena(
        ARENA,
        { x: at.x + (dx / distance) * stride, y: at.y + (dy / distance) * stride },
        radius,
      );
      steps++;
    }
    expect(Math.hypot(goal.x - at.x, goal.y - at.y)).toBeLessThanOrEqual(0.5);
    expect(steps).toBeGreaterThan(300);
  });

  it('is the largest floor in the lab', () => {
    const area = (id: string) => {
      const h = ENCOUNTERS[id].arena.halfExtents;
      return h.x * h.y * 4;
    };
    for (const id of Object.keys(ENCOUNTERS)) {
      if (id === 'maze_serpentine') continue;
      expect(area(id), id).toBeLessThan(area('maze_serpentine'));
    }
  });
});
