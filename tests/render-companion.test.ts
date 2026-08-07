
import { labArchetypeColor } from '../src/render/palette-lab';
import { LAB_ROOMS } from '../src/render/rooms/index-lab';
import { DEFAULT_COMBAT } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import { PALETTE } from '../src/render/palette';
import type { Palette } from '../src/render/palette';
import {
  DEFAULT_PRESENTATION_ID,
  PRESENTATION_PRESETS,
  resolve,
  transformPalette,
} from '../src/lab/presentation';
import { createWorld } from '../src/sim/encounter';
import { spawnCompanion } from '../src/sim/companion';
import { MODEL_BANKS } from '../src/render/cast/banks-lab';
import { drawCompanion, drawCompanionOverhead } from '../src/render/draw';
import { makeCamera, worldToScreen } from '../src/render/iso';
import type { Camera } from '../src/render/iso';
import { APOTHEOSIS_OFF } from '../src/render/apotheosis/config';

interface Draw {
  what: string;
  x: number;
  y: number;
  size: number;
}

const makeRecorder = () => {
  const draws: Draw[] = [];
  let translateX = 0;
  let translateY = 0;
  const transforms: Array<[number, number]> = [];
  const target: Record<string, unknown> = {
    canvas: { width: 1280, height: 720 },
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    save: () => transforms.push([translateX, translateY]),
    restore: () => {
      const prior = transforms.pop();
      if (prior !== undefined) [translateX, translateY] = prior;
    },
    translate: (x: number, y: number) => {
      translateX += x;
      translateY += y;
    },
    quadraticCurveTo: (cx: number, cy: number, x: number, y: number) =>
      draws.push({ what: 'vertex', x: x + translateX, y: y + translateY, size: 0 }),
    fillRect: (x: number, y: number, w: number, h: number) =>
      draws.push({ what: `rect(${Math.round(w)})`, x: x + translateX, y: y + translateY, size: h }),
    arc: (x: number, y: number, r: number) =>
      draws.push({ what: 'arc', x: x + translateX, y: y + translateY, size: r }),
    ellipse: (x: number, y: number, rx: number, ry: number) =>
      draws.push({ what: 'ellipse', x: x + translateX, y: y + translateY, size: ry }),
    moveTo: (x: number, y: number) =>
      draws.push({ what: 'vertex', x: x + translateX, y: y + translateY, size: 0 }),
    lineTo: (x: number, y: number) =>
      draws.push({ what: 'vertex', x: x + translateX, y: y + translateY, size: 0 }),
  };
  const ctx = new Proxy(target, {
    get: (obj, prop: string) => (prop in obj ? obj[prop] : () => {}),
    set: (obj, prop: string, value) => {
      obj[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, draws };
};

const pres = resolve(PRESENTATION_PRESETS[DEFAULT_PRESENTATION_ID]);
const pal: Palette = transformPalette({ ...PALETTE }, pres.visual, pres.preserveThreatColors);
const opts = {
  cfg: DEFAULT_COMBAT,
  pal,
  pres,
  apotheosis: APOTHEOSIS_OFF,
  models: Object.values(MODEL_BANKS)[0],
  rooms: LAB_ROOMS,
  archetypeColor: labArchetypeColor,
  localPlayer: 0,
  showHitboxes: false,
  aimDistance: null,
};

const render = (zoom: number, downed: boolean) => {
  const world = createWorld(ENCOUNTERS.wayfarer_court, DEFAULT_COMBAT, 1);
  const companion = spawnCompanion(world, 'MARA', 60, 90, { x: 0, y: 0 });
  if (downed) companion.state = 'downed';

  const cam: Camera = { ...makeCamera(1280, 720), zoom };
  const { ctx, draws } = makeRecorder();
  drawCompanion(ctx, world, cam, opts);
  drawCompanionOverhead(ctx, world, cam, opts);
  return { draws, at: worldToScreen(cam, companion.pos) };
};

const barBottom = (draws: Draw[], zoom: number): number => {
  const bars = draws.filter((d) => d.what === `rect(${Math.round(42 * zoom)})`);
  expect(bars.length).toBeGreaterThan(0);
  return Math.max(...bars.map((d) => d.y + d.size));
};

const bodyTop = (draws: Draw[], at: { x: number; y: number }): number =>
  Math.min(
    ...draws
      .filter((d) => d.what === 'arc' || d.what === 'ellipse' || d.what === 'vertex')
      .filter((d) => d.y <= at.y)
      .map((d) => d.y - d.size),
  );

describe('the escort health bar', () => {
  it('keeps a physical lantern handle inside the glow', () => {
    const { draws } = render(1, false);
    expect(
      draws.some((draw) => draw.what === 'arc' && draw.size > 2 && draw.size < 5),
    ).toBe(true);
  });

  it('sits entirely above the head rather than across the face', () => {
    const { draws, at } = render(1, false);

    expect(barBottom(draws, 1)).toBeLessThanOrEqual(bodyTop(draws, at));
  });

  it('stays clear of the head when the arena is zoomed out', () => {
    const { draws, at } = render(0.4, false);

    expect(barBottom(draws, 0.4)).toBeLessThanOrEqual(bodyTop(draws, at));
  });

  it('follows a downed escort down instead of floating where her head used to be', () => {
    const standing = render(1, false);
    const downed = render(1, true);

    expect(barBottom(downed.draws, 1)).toBeGreaterThan(barBottom(standing.draws, 1));
    expect(barBottom(downed.draws, 1)).toBeLessThanOrEqual(bodyTop(downed.draws, downed.at));
  });
});
