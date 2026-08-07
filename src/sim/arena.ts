
import type { Arena, Vec2, World } from './types';
import { add, scale } from './vec';

const rectangleCache = new WeakMap<Arena, readonly Vec2[]>();
const regionCache = new WeakMap<Arena, readonly (readonly Vec2[])[]>();

const rectangleVertices = (arena: Arena): readonly Vec2[] => {
  const cached = rectangleCache.get(arena);
  if (cached !== undefined) return cached;
  const vertices = [
    { x: -arena.halfExtents.x, y: -arena.halfExtents.y },
    { x: arena.halfExtents.x, y: -arena.halfExtents.y },
    { x: arena.halfExtents.x, y: arena.halfExtents.y },
    { x: -arena.halfExtents.x, y: arena.halfExtents.y },
  ];
  rectangleCache.set(arena, vertices);
  return vertices;
};

export const arenaVertices = (arena: Arena): readonly Vec2[] =>
  arena.outline ?? arena.vertices ?? rectangleVertices(arena);

export const arenaRegions = (arena: Arena): readonly (readonly Vec2[])[] =>
  arena.regions ?? (() => {
    const cached = regionCache.get(arena);
    if (cached !== undefined) return cached;
    const regions = [arena.vertices ?? rectangleVertices(arena)];
    regionCache.set(arena, regions);
    return regions;
  })();

const verticesAreFiniteAndBounded = (arena: Arena, vertices: readonly Vec2[]): boolean => {
  if (vertices.length < 3) return false;
  for (const vertex of vertices) {
    if (
      !Number.isFinite(vertex.x) ||
      !Number.isFinite(vertex.y) ||
      Math.abs(vertex.x) > arena.halfExtents.x + 1e-9 ||
      Math.abs(vertex.y) > arena.halfExtents.y + 1e-9
    ) {
      return false;
    }
  }
  return true;
};

const signedArea = (vertices: readonly Vec2[]): number => {
  let twiceArea = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    twiceArea += a.x * b.y - a.y * b.x;
  }
  return twiceArea / 2;
};

const verticesAreStrictlyConvexCcw = (vertices: readonly Vec2[]): boolean => {
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const c = vertices[(i + 2) % vertices.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross <= 1e-9) return false;
  }
  return true;
};

export const arenaGeometryIsValid = (arena: Arena): boolean => {
  if (
    !Number.isFinite(arena.halfExtents.x) ||
    !Number.isFinite(arena.halfExtents.y) ||
    arena.halfExtents.x <= 0 ||
    arena.halfExtents.y <= 0
  ) {
    return false;
  }
  const outline = arenaVertices(arena);
  const regions = arenaRegions(arena);
  if (!verticesAreFiniteAndBounded(arena, outline) || signedArea(outline) <= 1e-9) return false;
  if (arena.regions === undefined && !verticesAreStrictlyConvexCcw(outline)) return false;
  if (
    arena.regions !== undefined &&
    (arena.outline === undefined ||
      regions.length < 2 ||
      regions.some(
        (region) =>
          !verticesAreFiniteAndBounded(arena, region) ||
          !verticesAreStrictlyConvexCcw(region),
      ))
  ) {
    return false;
  }
  const ramp = arena.elevationRamp;
  return (
    ramp === undefined ||
    (Number.isFinite(ramp.from) &&
      Number.isFinite(ramp.to) &&
      Number.isFinite(ramp.height) &&
      ramp.from !== ramp.to &&
      ramp.height >= 0 &&
      Number.isInteger(ramp.steps) &&
      ramp.steps > 0)
  );
};

export const arenaElevationAt = (arena: Arena, point: Vec2): number => {
  const ramp = arena.elevationRamp;
  if (ramp === undefined || ramp.from === ramp.to) return 0;
  const value = ramp.axis === 'x' ? point.x : point.y;
  const t = Math.max(0, Math.min(1, (value - ramp.from) / (ramp.to - ramp.from)));
  return t * ramp.height;
};

const inwardNormal = (a: Vec2, b: Vec2): Vec2 => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  return length === 0 ? { x: 0, y: 0 } : { x: -dy / length, y: dx / length };
};

const signedInsetDistance = (point: Vec2, a: Vec2, b: Vec2, radius: number): number => {
  const normal = inwardNormal(a, b);
  return normal.x * (point.x - a.x) + normal.y * (point.y - a.y) - radius;
};

interface HalfPlane {
  nx: number;
  ny: number;
  ax: number;
  ay: number;
}

const halfPlaneCache = new WeakMap<readonly Vec2[], readonly HalfPlane[]>();

const halfPlanes = (vertices: readonly Vec2[]): readonly HalfPlane[] => {
  const cached = halfPlaneCache.get(vertices);
  if (cached !== undefined) return cached;
  const planes = vertices.map((a, index) => {
    const normal = inwardNormal(a, vertices[(index + 1) % vertices.length]);
    return {
      nx: normal.x,
      ny: normal.y,
      ax: a.x,
      ay: a.y,
    };
  });
  halfPlaneCache.set(vertices, planes);
  return planes;
};

const regionContains = (vertices: readonly Vec2[], point: Vec2, radius = 0): boolean => {
  for (const plane of halfPlanes(vertices)) {
    if (
      plane.nx * (point.x - plane.ax) +
        plane.ny * (point.y - plane.ay) -
        radius <
      -1e-9
    ) {
      return false;
    }
  }
  return true;
};

export const arenaContains = (arena: Arena, point: Vec2, radius = 0): boolean => {
  return arenaRegions(arena).some((region) => regionContains(region, point, radius));
};

const clampToRegion = (vertices: readonly Vec2[], point: Vec2, radius: number): Vec2 => {
  const result = { x: point.x, y: point.y };
  const planes = halfPlanes(vertices);
  for (let pass = 0; pass < vertices.length; pass++) {
    let corrected = false;
    for (const plane of planes) {
      const distance =
        plane.nx * (result.x - plane.ax) +
        plane.ny * (result.y - plane.ay) -
        radius;
      if (distance >= 0) continue;
      result.x -= distance * plane.nx;
      result.y -= distance * plane.ny;
      corrected = true;
    }
    if (!corrected) break;
  }
  return result;
};

export const resolveObstacles = (arena: Arena, point: Vec2, radius = 0): Vec2 => {
  const obstacles = arena.obstacles;
  if (obstacles === undefined || obstacles.length === 0) return { x: point.x, y: point.y };
  let out = { x: point.x, y: point.y };
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const obstacle of obstacles) {
      const dx = out.x - obstacle.at.x;
      const dy = out.y - obstacle.at.y;
      const minimum = obstacle.radius + radius;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance >= minimum) continue;
      moved = true;
      if (distance <= 1e-9) {
        out = { x: obstacle.at.x + minimum, y: obstacle.at.y };
        continue;
      }
      out = {
        x: obstacle.at.x + (dx / distance) * minimum,
        y: obstacle.at.y + (dy / distance) * minimum,
      };
    }
    if (!moved) break;
  }
  return out;
};

export const segmentHitsObstacle = (
  arena: Arena,
  from: Vec2,
  to: Vec2,
  radius = 0,
): boolean => {
  const obstacles = arena.obstacles;
  if (obstacles === undefined || obstacles.length === 0) return false;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSq = dx * dx + dy * dy;
  for (const obstacle of obstacles) {
    const reach = obstacle.radius + radius;
    const ox = from.x - obstacle.at.x;
    const oy = from.y - obstacle.at.y;
    const t =
      lengthSq <= 1e-12
        ? 0
        : Math.max(0, Math.min(1, -(ox * dx + oy * dy) / lengthSq));
    const cx = ox + t * dx;
    const cy = oy + t * dy;
    if (cx * cx + cy * cy < reach * reach) return true;
  }
  return false;
};

export const clampToArena = (arena: Arena, point: Vec2, radius = 0): Vec2 => {
  const freed = resolveObstacles(arena, point, radius);
  if (arenaContains(arena, freed, radius)) return freed;
  point = freed;
  let closest = { x: point.x, y: point.y };
  let closestDistanceSq = Number.POSITIVE_INFINITY;
  for (const region of arenaRegions(arena)) {
    const candidate = clampToRegion(region, point, radius);
    const dx = candidate.x - point.x;
    const dy = candidate.y - point.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < closestDistanceSq) {
      closest = candidate;
      closestDistanceSq = distanceSq;
    }
  }
  return closest;
};

export const rayToArenaBoundary = (
  arena: Arena,
  origin: Vec2,
  direction: Vec2,
  radius = 0,
): Vec2 => {
  const intervals: Array<{ from: number; to: number }> = [];
  for (const vertices of arenaRegions(arena)) {
    let from = Number.NEGATIVE_INFINITY;
    let to = Number.POSITIVE_INFINITY;
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % vertices.length];
      const normal = inwardNormal(a, b);
      const clearance =
        normal.x * (origin.x - a.x) + normal.y * (origin.y - a.y) - radius;
      const slope = normal.x * direction.x + normal.y * direction.y;
      if (Math.abs(slope) <= 1e-12) {
        if (clearance < 0) {
          from = 1;
          to = 0;
          break;
        }
      } else if (slope > 0) {
        from = Math.max(from, -clearance / slope);
      } else {
        to = Math.min(to, clearance / -slope);
      }
    }
    if (from <= to && to >= 0) intervals.push({ from, to });
  }
  intervals.sort((a, b) => a.from - b.from);
  let reach = 0;
  let foundOrigin = false;
  const originTolerance = 1e-5;
  for (const interval of intervals) {
    if (!foundOrigin) {
      if (interval.from <= originTolerance && interval.to >= -originTolerance) {
        foundOrigin = true;
        reach = Math.max(0, interval.to);
      }
      continue;
    }
    if (interval.from > reach + originTolerance) break;
    reach = Math.max(reach, interval.to);
  }
  return foundOrigin && Number.isFinite(reach)
    ? add(origin, scale(direction, reach))
    : { x: origin.x, y: origin.y };
};

const intersectConvex = (
  subject: readonly Vec2[],
  clip: readonly Vec2[],
): Vec2[] => {
  let output = subject.map((point) => ({ ...point }));
  for (let edge = 0; edge < clip.length && output.length > 0; edge++) {
    const a = clip[edge];
    const b = clip[(edge + 1) % clip.length];
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i++) {
      const current = input[i];
      const previous = input[(i + input.length - 1) % input.length];
      const currentDistance = signedInsetDistance(current, a, b, 0);
      const previousDistance = signedInsetDistance(previous, a, b, 0);
      if ((currentDistance >= 0) !== (previousDistance >= 0)) {
        const t = previousDistance / (previousDistance - currentDistance);
        output.push({
          x: previous.x + (current.x - previous.x) * t,
          y: previous.y + (current.y - previous.y) * t,
        });
      }
      if (currentDistance >= 0) output.push(current);
    }
  }
  return output;
};

const portalBetween = (
  a: readonly Vec2[],
  b: readonly Vec2[],
  radius: number,
): Vec2 | null => {
  const overlap = intersectConvex(a, b);
  if (overlap.length < 3 || Math.abs(signedArea(overlap)) <= 1e-6) return null;
  const centre = scale(
    overlap.reduce((sum, point) => add(sum, point), { x: 0, y: 0 }),
    1 / overlap.length,
  );
  return regionContains(a, centre, radius) && regionContains(b, centre, radius)
    ? centre
    : null;
};

const portalMatrices = new WeakMap<Arena, Map<number, ReadonlyArray<ReadonlyArray<Vec2 | null>>>>();

const portalMatrix = (
  arena: Arena,
  regions: readonly (readonly Vec2[])[],
  radius: number,
): ReadonlyArray<ReadonlyArray<Vec2 | null>> => {
  let byRadius = portalMatrices.get(arena);
  if (byRadius === undefined) {
    byRadius = new Map();
    portalMatrices.set(arena, byRadius);
  }
  const cached = byRadius.get(radius);
  if (cached !== undefined) return cached;

  const portals: Array<Array<Vec2 | null>> = regions.map(() => regions.map(() => null));
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      const portal = portalBetween(regions[i], regions[j], radius);
      portals[i][j] = portal;
      portals[j][i] = portal;
    }
  }
  byRadius.set(radius, portals);
  return portals;
};

export interface ArenaNavigationTarget {
  point: Vec2;
  direct: boolean;
}

export const arenaNavigationTarget = (
  arena: Arena,
  from: Vec2,
  target: Vec2,
  radius = 0,
): ArenaNavigationTarget => {
  const regions = arenaRegions(arena);
  if (regions.length === 1) return { point: target, direct: true };
  const containing = (point: Vec2): number[] => {
    const inset = regions.flatMap((region, index) =>
      regionContains(region, point, radius) ? [index] : [],
    );
    return inset.length > 0
      ? inset
      : regions.flatMap((region, index) => (regionContains(region, point) ? [index] : []));
  };
  const starts = containing(from);
  const goals = new Set(containing(target));
  if (starts.some((index) => goals.has(index))) return { point: target, direct: true };

  const portals = portalMatrix(arena, regions, radius);

  const queue = [...starts];
  const previous = Array<number>(regions.length).fill(-2);
  for (const start of starts) previous[start] = -1;
  let goal = -1;
  for (let cursor = 0; cursor < queue.length && goal < 0; cursor++) {
    const current = queue[cursor];
    if (goals.has(current)) {
      goal = current;
      break;
    }
    for (let next = 0; next < regions.length; next++) {
      if (portals[current][next] === null || previous[next] !== -2) continue;
      previous[next] = current;
      queue.push(next);
    }
  }
  if (goal < 0) return { point: clampToArena(arena, target, radius), direct: false };

  let next = goal;
  while (previous[next] >= 0 && !starts.includes(previous[next])) next = previous[next];
  const start = previous[next];
  const portal = start >= 0 ? portals[start][next] : null;
  return { point: portal === null ? target : { ...portal }, direct: false };
};

type ArenaGate = NonNullable<Arena['gates']>[number];

export const arenaGateIsClosed = (world: World, gate: ArenaGate): boolean =>
  world.encounter.spawnedWaves.includes(gate.lockUntilWaveCleared) &&
  !world.encounter.clearedWaves.includes(gate.lockUntilWaveCleared);

const gateAxes = (gate: ArenaGate) => {
  const dx = gate.to.x - gate.from.x;
  const dy = gate.to.y - gate.from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length <= 1e-9) return null;
  const tangent = { x: dx / length, y: dy / length };
  return {
    tangent,
    normal: { x: -tangent.y, y: tangent.x },
    length,
  };
};

const dotFrom = (point: Vec2, origin: Vec2, axis: Vec2): number =>
  (point.x - origin.x) * axis.x + (point.y - origin.y) * axis.y;

export const clampArenaMovement = (
  world: World,
  from: Vec2,
  desired: Vec2,
  radius = 0,
): Vec2 => {
  let result = clampToArena(world.arena, desired, radius);
  for (const gate of world.arena.gates ?? []) {
    if (!arenaGateIsClosed(world, gate)) continue;
    const axes = gateAxes(gate);
    if (axes === null) continue;
    const fromSide = dotFrom(from, gate.from, axes.normal);
    const toSide = dotFrom(result, gate.from, axes.normal);
    const side = fromSide < 0 ? -1 : 1;
    const safeSide = side * radius;
    if (side * toSide >= radius - 1e-9) continue;
    const denominator = toSide - fromSide;
    const crossingT =
      Math.abs(denominator) <= 1e-12
        ? 0
        : (safeSide - fromSide) / denominator;
    if (crossingT < -1e-9 || crossingT > 1 + 1e-9) continue;
    const crossing = {
      x: from.x + (result.x - from.x) * crossingT,
      y: from.y + (result.y - from.y) * crossingT,
    };
    const along = dotFrom(crossing, gate.from, axes.tangent);
    if (along < -radius || along > axes.length + radius) continue;
    const correction = safeSide - toSide;
    result = {
      x: result.x + axes.normal.x * correction,
      y: result.y + axes.normal.y * correction,
    };
  }
  return clampToArena(world.arena, result, radius);
};

export const movementCrossesClosedGate = (
  world: World,
  from: Vec2,
  to: Vec2,
  radius = 0,
): boolean => {
  const clamped = clampArenaMovement(world, from, to, radius);
  return Math.abs(clamped.x - to.x) > 1e-8 || Math.abs(clamped.y - to.y) > 1e-8;
};

const segmentOnFloor = (arena: Arena, from: Vec2, to: Vec2): boolean => {
  const regions = arenaRegions(arena);
  if (regions.length === 1) return true;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const intervals: Array<{ from: number; to: number }> = [];
  for (const vertices of regions) {
    let lo = 0;
    let hi = 1;
    let inside = true;
    for (const plane of halfPlanes(vertices)) {
      const clearance =
        plane.nx * (from.x - plane.ax) + plane.ny * (from.y - plane.ay);
      const slope = plane.nx * dx + plane.ny * dy;
      if (Math.abs(slope) <= 1e-12) {
        if (clearance < -1e-9) {
          inside = false;
          break;
        }
      } else if (slope > 0) {
        lo = Math.max(lo, -clearance / slope);
      } else {
        hi = Math.min(hi, clearance / -slope);
      }
      if (lo > hi + 1e-9) {
        inside = false;
        break;
      }
    }
    if (inside) intervals.push({ from: lo, to: hi });
  }
  intervals.sort((a, b) => a.from - b.from);
  const tolerance = 1e-6;
  let reach = 0;
  for (const interval of intervals) {
    if (interval.from > reach + tolerance) return false;
    reach = Math.max(reach, interval.to);
    if (reach >= 1 - tolerance) return true;
  }
  return reach >= 1 - tolerance;
};

export const lineOfSight = (
  world: World,
  from: Vec2,
  to: Vec2,
  radius = 0,
): boolean =>
  !segmentHitsObstacle(world.arena, from, to, radius) &&
  segmentOnFloor(world.arena, from, to) &&
  !movementCrossesClosedGate(world, from, to);
