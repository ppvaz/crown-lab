
import { arenaGeometryIsValid } from '../sim/arena';
import { makeRng, nextInt, nextRange } from '../sim/rng';
import type { Arena, RngState, Vec2 } from '../sim/types';

export interface ChambersSpec {
  seed: number;
  chambers: number;
  chamberSpanMin: number;
  chamberSpanMax: number;
  spacing: number;
  corridorWidth: number;
}

export interface GeneratedRoom {
  arena: Arena;
  playerStart: Vec2;
  chambers: Vec2[][];
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const DIRECTIONS: ReadonlyArray<{ u: number; v: number }> = [
  { u: 1, v: 0 },
  { u: 0, v: 1 },
  { u: -1, v: 0 },
  { u: 0, v: -1 },
];

const cellKey = (u: number, v: number): string => `${u},${v}`;

const shuffledDirections = (rng: RngState): Array<{ u: number; v: number }> => {
  const order = [...DIRECTIONS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = nextInt(rng, 0, i + 1);
    const swap = order[i];
    order[i] = order[j];
    order[j] = swap;
  }
  return order;
};

const walkLattice = (rng: RngState, chambers: number): Array<{ u: number; v: number }> => {
  const chain: Array<{ u: number; v: number }> = [{ u: 0, v: 0 }];
  const used = new Set<string>([cellKey(0, 0)]);

  const admissible = (u: number, v: number, from: { u: number; v: number }): boolean => {
    if (used.has(cellKey(u, v))) return false;
    return !DIRECTIONS.some(
      (d) => !(u + d.u === from.u && v + d.v === from.v) && used.has(cellKey(u + d.u, v + d.v)),
    );
  };

  const extend = (): boolean => {
    if (chain.length === chambers) return true;
    const head = chain[chain.length - 1];
    for (const direction of shuffledDirections(rng)) {
      const next = { u: head.u + direction.u, v: head.v + direction.v };
      if (!admissible(next.u, next.v, head)) continue;
      chain.push(next);
      used.add(cellKey(next.u, next.v));
      if (extend()) return true;
      used.delete(cellKey(next.u, next.v));
      chain.pop();
    }
    return false;
  };

  extend();
  return chain;
};

const outlineOf = (rects: readonly Rect[]): Vec2[] => {
  const xs = [...new Set(rects.flatMap((r) => [r.x0, r.x1]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap((r) => [r.y0, r.y1]))].sort((a, b) => a - b);

  const occupied = (i: number, j: number): boolean => {
    if (i < 0 || j < 0 || i + 1 >= xs.length || j + 1 >= ys.length) return false;
    const cx = (xs[i] + xs[i + 1]) / 2;
    const cy = (ys[j] + ys[j + 1]) / 2;
    return rects.some((r) => cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1);
  };

  const edges = new Map<string, { from: Vec2; to: Vec2 }>();
  const addEdge = (from: Vec2, to: Vec2): void => {
    edges.set(`${from.x},${from.y}`, { from, to });
  };
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < ys.length; j++) {
      if (!occupied(i, j)) continue;
      const [x0, x1, y0, y1] = [xs[i], xs[i + 1], ys[j], ys[j + 1]];
      if (!occupied(i, j - 1)) addEdge({ x: x0, y: y0 }, { x: x1, y: y0 });
      if (!occupied(i + 1, j)) addEdge({ x: x1, y: y0 }, { x: x1, y: y1 });
      if (!occupied(i, j + 1)) addEdge({ x: x1, y: y1 }, { x: x0, y: y1 });
      if (!occupied(i - 1, j)) addEdge({ x: x0, y: y1 }, { x: x0, y: y0 });
    }
  }

  const first = edges.values().next().value as { from: Vec2; to: Vec2 };
  const loop: Vec2[] = [first.from];
  let cursor = first.to;
  while (cursor.x !== first.from.x || cursor.y !== first.from.y) {
    loop.push(cursor);
    const edge = edges.get(`${cursor.x},${cursor.y}`);
    if (edge === undefined) throw new Error('generated room: boundary does not close');
    cursor = edge.to;
  }
  if (loop.length !== edges.size) throw new Error('generated room: boundary is not one loop');

  return loop.filter((point, index) => {
    const before = loop[(index - 1 + loop.length) % loop.length];
    const after = loop[(index + 1) % loop.length];
    const collinear =
      (point.x - before.x) * (after.y - point.y) === (point.y - before.y) * (after.x - point.x);
    return !collinear;
  });
};

const rectVertices = (r: Rect): Vec2[] => [
  { x: r.x0, y: r.y0 },
  { x: r.x1, y: r.y0 },
  { x: r.x1, y: r.y1 },
  { x: r.x0, y: r.y1 },
];

export const chambersSpecProblem = (spec: ChambersSpec): string | null => {
  if (!Number.isInteger(spec.chambers) || spec.chambers < 2) return 'chambers must be an integer of at least 2';
  if (!(spec.chamberSpanMin > 0) || spec.chamberSpanMax < spec.chamberSpanMin) {
    return 'chamberSpanMin must be positive and no greater than chamberSpanMax';
  }
  if (!(spec.corridorWidth > 0)) return 'corridorWidth must be positive';
  if (spec.spacing <= 2 * spec.chamberSpanMax) return 'spacing must exceed 2 * chamberSpanMax, or chambers merge';
  if (spec.corridorWidth > 2 * spec.chamberSpanMin) return 'corridorWidth must fit the smallest chamber wall';
  return null;
};

export const generateChambers = (spec: ChambersSpec): GeneratedRoom => {
  const problem = chambersSpecProblem(spec);
  if (problem !== null) throw new Error(`generated room: ${problem}`);

  const rng = makeRng(spec.seed);

  const spans = Array.from({ length: spec.chambers }, () => ({
    x: nextRange(rng, spec.chamberSpanMin, spec.chamberSpanMax),
    y: nextRange(rng, spec.chamberSpanMin, spec.chamberSpanMax),
  }));
  const chain = walkLattice(rng, spec.chambers);

  const centres = chain.map((cell) => ({ x: cell.u * spec.spacing, y: cell.v * spec.spacing }));
  const chamberRects: Rect[] = centres.map((centre, i) => ({
    x0: centre.x - spans[i].x,
    y0: centre.y - spans[i].y,
    x1: centre.x + spans[i].x,
    y1: centre.y + spans[i].y,
  }));

  const half = spec.corridorWidth / 2;
  const corridorRects: Rect[] = chamberRects.slice(1).map((to, index) => {
    const from = chamberRects[index];
    const a = centres[index];
    const b = centres[index + 1];
    if (a.y === b.y) {
      const [left, right] = a.x < b.x ? [from, to] : [to, from];
      return {
        x0: left.x1 - spec.corridorWidth,
        y0: a.y - half,
        x1: right.x0 + spec.corridorWidth,
        y1: a.y + half,
      };
    }
    const [lower, upper] = a.y < b.y ? [from, to] : [to, from];
    return {
      x0: a.x - half,
      y0: lower.y1 - spec.corridorWidth,
      x1: a.x + half,
      y1: upper.y0 + spec.corridorWidth,
    };
  });

  const rects = [...chamberRects, ...corridorRects];
  const bounds = rects.reduce(
    (box, r) => ({
      x0: Math.min(box.x0, r.x0),
      y0: Math.min(box.y0, r.y0),
      x1: Math.max(box.x1, r.x1),
      y1: Math.max(box.y1, r.y1),
    }),
    { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
  );

  const shift = { x: -(bounds.x0 + bounds.x1) / 2, y: -(bounds.y0 + bounds.y1) / 2 };
  const moved = rects.map((r) => ({
    x0: r.x0 + shift.x,
    y0: r.y0 + shift.y,
    x1: r.x1 + shift.x,
    y1: r.y1 + shift.y,
  }));

  const regions = moved.map(rectVertices);
  const arena: Arena = {
    halfExtents: { x: (bounds.x1 - bounds.x0) / 2, y: (bounds.y1 - bounds.y0) / 2 },
    outline: outlineOf(moved),
    regions,
  };
  if (!arenaGeometryIsValid(arena)) {
    throw new Error(`generated room: seed ${spec.seed} produced invalid geometry`);
  }

  return {
    arena,
    playerStart: { x: centres[0].x + shift.x, y: centres[0].y + shift.y },
    chambers: regions.slice(0, spec.chambers),
  };
};
