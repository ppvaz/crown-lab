
import { arenaContains, arenaGeometryIsValid } from '../src/sim/arena';
import type { Arena, Vec2 } from '../src/sim/types';
import { chambersSpecProblem, generateChambers, type ChambersSpec } from '../src/lab/generate';

const BODY = 0.45;

const spec = (over: Partial<ChambersSpec> = {}): ChambersSpec => ({
  seed: 1,
  chambers: 4,
  chamberSpanMin: 4,
  chamberSpanMax: 6,
  spacing: 16,
  corridorWidth: 3,
  ...over,
});

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

const centreOf = (cell: Vec2[]): Vec2 => ({
  x: (Math.min(...cell.map((p) => p.x)) + Math.max(...cell.map((p) => p.x))) / 2,
  y: (Math.min(...cell.map((p) => p.y)) + Math.max(...cell.map((p) => p.y))) / 2,
});

const boxOf = (cell: Vec2[]) => ({
  x0: Math.min(...cell.map((p) => p.x)),
  x1: Math.max(...cell.map((p) => p.x)),
  y0: Math.min(...cell.map((p) => p.y)),
  y1: Math.max(...cell.map((p) => p.y)),
});

const signedArea = (vertices: Vec2[]): number => {
  let twice = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    twice += a.x * b.y - a.y * b.x;
  }
  return twice / 2;
};

const asArena = (arena: Arena, cell: Vec2[]): Arena => ({
  halfExtents: arena.halfExtents,
  vertices: cell,
});

describe('generated room geometry', () => {
  it('makes the same room from the same seed, and a different one from a different seed', () => {
    const once = generateChambers(spec());
    const again = generateChambers(spec());
    expect(again).toEqual(once);

    const rooms = SEEDS.map((seed) => JSON.stringify(generateChambers(spec({ seed })).arena));
    expect(new Set(rooms).size).toBeGreaterThan(SEEDS.length / 2);
  });

  it('validates as arena geometry across a seed sweep, on every dial set', () => {
    const dials = [
      spec(),
      spec({ chambers: 2, spacing: 14, corridorWidth: 2 }),
      spec({ chambers: 6, chamberSpanMin: 3, chamberSpanMax: 5, spacing: 13, corridorWidth: 4 }),
    ];
    for (const dial of dials) {
      for (const seed of SEEDS) {
        const room = generateChambers({ ...dial, seed });
        expect(arenaGeometryIsValid(room.arena)).toBe(true);
        expect(room.arena.regions).toHaveLength(dial.chambers * 2 - 1);
        expect(room.chambers).toHaveLength(dial.chambers);
        expect(arenaContains(room.arena, room.playerStart, BODY)).toBe(true);
      }
    }
  });

  it('joins every consecutive chamber by a floor a body can walk', () => {
    for (const seed of SEEDS) {
      const dial = spec({ seed });
      const room = generateChambers(dial);
      for (let i = 0; i + 1 < room.chambers.length; i++) {
        const from = centreOf(room.chambers[i]);
        const to = centreOf(room.chambers[i + 1]);
        for (let step = 0; step <= 64; step++) {
          const t = step / 64;
          const point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
          expect(arenaContains(room.arena, point, BODY)).toBe(true);
        }
      }
    }
  });

  it('overlaps each corridor a full corridor width into both chambers it joins', () => {
    for (const seed of SEEDS) {
      const dial = spec({ seed });
      const room = generateChambers(dial);
      const corridors = (room.arena.regions ?? []).slice(dial.chambers);
      expect(corridors).toHaveLength(dial.chambers - 1);

      corridors.forEach((corridor, index) => {
        const bar = boxOf(corridor);
        const horizontal = bar.x1 - bar.x0 > bar.y1 - bar.y0;
        for (const chamber of [room.chambers[index], room.chambers[index + 1]]) {
          const box = boxOf(chamber);
          const depth = horizontal
            ? Math.min(bar.x1, box.x1) - Math.max(bar.x0, box.x0)
            : Math.min(bar.y1, box.y1) - Math.max(bar.y0, box.y0);
          expect(depth).toBeCloseTo(dial.corridorWidth, 9);

          const overlap = {
            x: Math.max(bar.x0, box.x0) + (horizontal ? depth / 2 : (bar.x1 - bar.x0) / 2),
            y: Math.max(bar.y0, box.y0) + (horizontal ? (bar.y1 - bar.y0) / 2 : depth / 2),
          };
          expect(arenaContains(asArena(room.arena, corridor), overlap, BODY)).toBe(true);
          expect(arenaContains(asArena(room.arena, chamber), overlap, BODY)).toBe(true);
        }
      });
    }
  });

  it('keeps non-consecutive chambers off each other, so the floor has no ring in it', () => {
    for (const seed of SEEDS) {
      const dial = spec({ seed });
      const room = generateChambers(dial);
      const cells = room.chambers.map((chamber) => {
        const centre = centreOf(chamber);
        return { u: Math.round(centre.x / dial.spacing), v: Math.round(centre.y / dial.spacing) };
      });
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 2; j < cells.length; j++) {
          const distance = Math.abs(cells[i].u - cells[j].u) + Math.abs(cells[i].v - cells[j].v);
          expect(distance).toBeGreaterThan(1);
        }
      }
    }
  });

  it('traces one counter-clockwise outline with a corner at every vertex', () => {
    for (const seed of SEEDS) {
      const room = generateChambers(spec({ seed }));
      const outline = room.arena.outline as Vec2[];
      expect(signedArea(outline)).toBeGreaterThan(0);
      expect(new Set(outline.map((p) => `${p.x},${p.y}`)).size).toBe(outline.length);
      for (let i = 0; i < outline.length; i++) {
        const a = outline[i];
        const b = outline[(i + 1) % outline.length];
        const c = outline[(i + 2) % outline.length];
        expect((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)).not.toBe(0);
      }
    }
  });

  it('refuses dials that produce a plausible-looking unplayable room', () => {
    expect(chambersSpecProblem(spec())).toBeNull();
    expect(chambersSpecProblem(spec({ chambers: 1 }))).toMatch(/at least 2/);
    expect(chambersSpecProblem(spec({ chamberSpanMin: 0 }))).toMatch(/chamberSpanMin/);
    expect(chambersSpecProblem(spec({ chamberSpanMax: 3 }))).toMatch(/chamberSpanMin/);
    expect(chambersSpecProblem(spec({ corridorWidth: 0 }))).toMatch(/corridorWidth must be positive/);
    expect(chambersSpecProblem(spec({ spacing: 12 }))).toMatch(/chambers merge/);
    expect(chambersSpecProblem(spec({ corridorWidth: 9 }))).toMatch(/smallest chamber wall/);
    expect(() => generateChambers(spec({ chambers: 1 }))).toThrow(/at least 2/);
  });
});
