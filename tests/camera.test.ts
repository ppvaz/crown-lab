
import { ENCOUNTERS } from '../src/lab/encounters';
import {
  ELEVATION_Y,
  ISO_X,
  ISO_Y,
  OVERSIZED_SPAN,
  READABLE_ZOOM,
  arenaExceedsScreen,
  clampCameraToArena,
  fitZoom,
  isNearViewport,
  makeCamera,
  parallaxOffset,
  worldToScreen,
} from '../src/render/iso';
import { arenaVertices } from '../src/sim/arena';
import { generateChambers, type ChambersSpec } from '../src/lab/generate';
import VOCABULARY from '../src/lab/rooms/vocabulary.json';

const spanOf = (id: string) => {
  const h = ENCOUNTERS[id].arena.halfExtents;
  return h.x + h.y;
};

describe('which rooms are bigger than the screen', () => {
  it('answers yes for the maze and no for every other room in the lab', () => {
    expect(arenaExceedsScreen(ENCOUNTERS.maze_serpentine.arena)).toBe(true);
    for (const [id, def] of Object.entries(ENCOUNTERS)) {
      if (id === 'maze_serpentine') continue;
      expect(arenaExceedsScreen(def.arena), id).toBe(false);
    }
  });

  it('keeps clear air on both sides of the threshold', () => {
    const others = Object.keys(ENCOUNTERS).filter((id) => id !== 'maze_serpentine');
    const largest = Math.max(...others.map(spanOf));
    expect(largest).toBeLessThan(OVERSIZED_SPAN - 2);
    expect(spanOf('maze_serpentine')).toBeGreaterThan(OVERSIZED_SPAN + 2);
  });

  it('frames every room the generator can reach, at every seed', () => {
    const dials = VOCABULARY.arenas.generated_chambers as unknown as ChambersSpec;
    for (let seed = 1; seed <= 60; seed++) {
      const { arena } = generateChambers({ ...dials, seed });
      expect(arenaExceedsScreen(arena), `seed ${seed}`).toBe(false);
      expect(arena.halfExtents.x + arena.halfExtents.y, `seed ${seed}`).toBeLessThan(
        OVERSIZED_SPAN - 2,
      );
    }
  });

  it('follows at the zoom a 20 x 14 room gets on the smallest tuned desktop', () => {
    const cam = makeCamera(1280, 720);
    const fitted = fitZoom(cam, ENCOUNTERS.kernel_guard.arena, 90, { w: 892, h: 618 });
    expect(Math.abs(fitted - READABLE_ZOOM)).toBeLessThan(0.02);
    expect(fitZoom(cam, ENCOUNTERS.maze_serpentine.arena, 90, { w: 892, h: 618 })).toBeLessThan(
      READABLE_ZOOM * 0.6,
    );
  });
});

describe('a following camera stays inside the room', () => {
  const arena = ENCOUNTERS.maze_serpentine.arena;
  const box = { w: 1052, h: 798 };

  it('never shows past the walls, from anywhere on the floor', () => {
    const cam = makeCamera(1440, 900);
    cam.zoom = READABLE_ZOOM;
    for (const corner of arenaVertices(arena)) {
      cam.center = clampCameraToArena(arena, corner, READABLE_ZOOM, box);
      cam.offset = { x: 0, y: 0 };
      const h = arena.halfExtents;
      const envelope = [
        { x: -h.x, y: -h.y },
        { x: h.x, y: -h.y },
        { x: h.x, y: h.y },
        { x: -h.x, y: h.y },
      ].map((p) => worldToScreen(cam, p));
      const label = `corner ${JSON.stringify(corner)}`;
      const axis = (lo: number, hi: number, viewCentre: number, viewSize: number, name: string) => {
        const covers = lo <= viewCentre - viewSize / 2 + 1e-6 && hi >= viewCentre + viewSize / 2 - 1e-6;
        const centred = Math.abs((lo + hi) / 2 - viewCentre) < 1e-6;
        expect(covers || centred, `${label} ${name}: [${lo.toFixed(1)}, ${hi.toFixed(1)}]`).toBe(
          true,
        );
      };
      axis(
        Math.min(...envelope.map((p) => p.x)),
        Math.max(...envelope.map((p) => p.x)),
        1440 / 2,
        box.w,
        'horizontal',
      );
      axis(
        Math.min(...envelope.map((p) => p.y)),
        Math.max(...envelope.map((p) => p.y)),
        900 / 2,
        box.h,
        'vertical',
      );
    }
  });

  it('clamps the axis the room overflows', () => {
    const atCorner = clampCameraToArena(arena, { x: -61.5, y: 12 }, READABLE_ZOOM, box);
    expect(atCorner.x - atCorner.y).toBeGreaterThan(-73.5);
    expect(atCorner.x - atCorner.y).toBeLessThan(0);
  });

  it('reserves asymmetric headroom for a tall room shell', () => {
    const wallHeight = 5.4;
    const look = { x: -61.5, y: -12 };
    const centre = clampCameraToArena(arena, look, READABLE_ZOOM, box, wallHeight);
    const span = arena.halfExtents.x + arena.halfExtents.y;
    const top =
      (-span - (centre.x + centre.y)) * ISO_Y * READABLE_ZOOM -
      wallHeight * ELEVATION_Y * READABLE_ZOOM;

    expect(top).toBeCloseTo(-box.h / 2, 6);
  });

  it('still tracks the king in the middle of the floor, where there is room to', () => {
    const centre = clampCameraToArena(arena, { x: 0, y: 0 }, READABLE_ZOOM, box);
    expect(centre).toEqual({ x: 0, y: 0 });
    const a = clampCameraToArena(arena, { x: -12, y: 0 }, READABLE_ZOOM, box);
    const b = clampCameraToArena(arena, { x: 12, y: 0 }, READABLE_ZOOM, box);
    expect(a).not.toEqual(b);
  });

  it('pins to the centre on an axis the view already covers', () => {
    const huge = { w: 100_000, h: 100_000 };
    expect(clampCameraToArena(arena, { x: 20, y: 10 }, READABLE_ZOOM, huge)).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe('parallax depth', () => {
  const cam = makeCamera(1200, 800);
  cam.zoom = READABLE_ZOOM;
  cam.center = { x: 14, y: -6 };

  it('reproduces the floor’s own motion at depth 1', () => {
    const flat = makeCamera(1200, 800);
    flat.zoom = cam.zoom;
    flat.center = { x: 0, y: 0 };
    const slide = parallaxOffset(cam, 1);
    for (const point of [
      { x: 0, y: 0 },
      { x: 8, y: -3 },
      { x: -12, y: 11 },
    ]) {
      const moved = worldToScreen(cam, point);
      const still = worldToScreen(flat, point);
      expect(moved.x).toBeCloseTo(still.x + slide.x, 9);
      expect(moved.y).toBeCloseTo(still.y + slide.y, 9);
    }
  });

  it('is fixed to the viewport at depth 0', () => {
    expect(parallaxOffset(cam, 0)).toEqual({ x: -0, y: -0 });
  });

  it('slides further the nearer the layer, and always against the camera', () => {
    const rates = [0.03, 0.07, 0.15, 0.28];
    const slides = rates.map((rate) => parallaxOffset(cam, rate));
    for (let i = 1; i < slides.length; i++) {
      expect(Math.abs(slides[i].x), `rate ${rates[i]}`).toBeGreaterThan(Math.abs(slides[i - 1].x));
    }
    expect(Math.sign(slides[0].x)).toBe(-Math.sign((cam.center.x - cam.center.y) * ISO_X));
    expect(Math.sign(slides[0].y)).toBe(-Math.sign((cam.center.x + cam.center.y) * ISO_Y));
  });

  it('gives the maze a spread the old rooms never had', () => {
    const travel = (span: number, zoom: number) => {
      const wide = makeCamera(1200, 800);
      wide.zoom = zoom;
      wide.center = { x: span, y: -span };
      return Math.abs(parallaxOffset(wide, 0.28).x) - Math.abs(parallaxOffset(wide, 0.03).x);
    };
    const before = travel(10 * 0.3, 0.754);
    const after = travel(22.5, READABLE_ZOOM);
    expect(after).toBeGreaterThan(before * 5);
  });
});

describe('what the renderer may reject', () => {
  const maze = ENCOUNTERS.maze_serpentine;

  const followed = () => {
    const cam = makeCamera(1440, 900);
    cam.zoom = READABLE_ZOOM;
    cam.arena = maze.arena;
    cam.center = { x: -60, y: -10 };
    return cam;
  };

  it('never rejects a position that projects inside the canvas', () => {
    const cam = followed();
    for (let x = -70; x <= 70; x += 2.5) {
      for (let y = -14; y <= 14; y += 2) {
        const at = { x, y };
        const screen = worldToScreen(cam, at);
        const inside =
          screen.x >= 0 && screen.x <= cam.width && screen.y >= 0 && screen.y <= cam.height;
        if (inside) expect(isNearViewport(cam, at)).toBe(true);
      }
    }
  });

  it('keeps a neighbouring corridor and drops the far end of the snake', () => {
    const cam = followed();
    expect(isNearViewport(cam, { x: -60, y: 6 })).toBe(true);
    expect(isNearViewport(cam, { x: 60, y: 0 })).toBe(false);
  });

  it('rejects nothing at all in a room that fits on the screen', () => {
    const guard = ENCOUNTERS.kernel_guard;
    const cam = makeCamera(1440, 900);
    cam.arena = guard.arena;
    cam.zoom = fitZoom(cam, guard.arena, 90, { w: 1440, h: 900 });
    for (const vertex of arenaVertices(guard.arena)) {
      expect(isNearViewport(cam, vertex)).toBe(true);
    }
  });
});
