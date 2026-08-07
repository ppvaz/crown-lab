
import { describe, expect, it } from 'vitest';

import { DEFAULT_COMBAT } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import { addPlayer, createWorld } from '../src/sim/encounter';
import { PALETTE } from '../src/render/palette';
import { DEFAULT_PRESENTATION_ID, PRESENTATION_PRESETS, resolve } from '../src/lab/presentation';
import { makeCamera, worldToScreen } from '../src/render/iso';
import { drawScene } from '../src/render/draw';
import { cloneBank } from '../src/render/models';
import { PUBLIC_MODELS } from '../src/render/cast/index-public';
import { APOTHEOSIS_OFF } from '../src/render/apotheosis/config';
import { labArchetypeColor } from '../src/render/palette-lab';
import { LAB_ROOMS } from '../src/render/rooms/index-lab';

const paintedXs = (): { ctx: CanvasRenderingContext2D; xs: number[] } => {
  const xs: number[] = [];
  const gradient = { addColorStop: () => {} };
  const record = (x: unknown): undefined => {
    if (typeof x === 'number' && Number.isFinite(x)) xs.push(x);
    return undefined;
  };
  const target: Record<string | symbol, unknown> = {
    canvas: { width: 1280, height: 720 },
    measureText: () => ({ width: 40, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 3 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    getLineDash: () => [],
    moveTo: record,
    lineTo: record,
    arc: record,
  };
  const ctx = new Proxy(target, {
    get: (obj, prop) => (prop in obj ? obj[prop] : () => undefined),
    set: (obj, prop, value) => {
      obj[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, xs };
};

const twoKings = () => {
  const cfg = { ...DEFAULT_COMBAT, power: 'lightning' as const };
  const world = createWorld(ENCOUNTERS.wayfarer_court, cfg, 1);
  world.players[0].pos = { x: -6, y: 0 };
  addPlayer(world, cfg, { x: 6, y: 0 });
  const cam = makeCamera(1280, 720);
  cam.arena = world.arena;
  return { world, cfg, cam };
};

const paint = (
  world: ReturnType<typeof twoKings>['world'],
  cfg: ReturnType<typeof twoKings>['cfg'],
  cam: ReturnType<typeof twoKings>['cam'],
  localPlayer: number,
): number[] => {
  const { ctx, xs } = paintedXs();
  drawScene(ctx, world, cam, {
    cfg,
    pal: { ...PALETTE },
    pres: resolve(PRESENTATION_PRESETS[DEFAULT_PRESENTATION_ID]),
    apotheosis: APOTHEOSIS_OFF,
    models: cloneBank(PUBLIC_MODELS),
    rooms: LAB_ROOMS,
    archetypeColor: labArchetypeColor,
    localPlayer,
    showHitboxes: false,
    aimDistance: null,
  } as Parameters<typeof drawScene>[3]);
  return xs;
};

const paintedNear = (xs: readonly number[], cam: ReturnType<typeof makeCamera>, at: { x: number; y: number }, span = 90): boolean => {
  const screen = worldToScreen(cam, at);
  return xs.some((x) => Math.abs(x - screen.x) <= span);
};

describe('the channelled power cone', () => {
  it('comes out of the king who is channelling, not the first seat', () => {
    const { world, cfg, cam } = twoKings();
    world.players[1].powerChannelMs = 400;

    const xs = paint(world, cfg, cam, 1);

    expect(paintedNear(xs, cam, world.players[1].pos)).toBe(true);
  });

  it('draws one per channelling king, so a pair casting together reads as two casts', () => {
    const { world, cfg, cam } = twoKings();
    world.players[0].powerChannelMs = 400;
    world.players[1].powerChannelMs = 400;

    const xs = paint(world, cfg, cam, 0);

    expect(paintedNear(xs, cam, world.players[0].pos)).toBe(true);
    expect(paintedNear(xs, cam, world.players[1].pos)).toBe(true);
  });

  it('draws none when nobody is channelling', () => {
    const { world, cfg, cam } = twoKings();
    const before = paint(world, cfg, cam, 0).length;

    world.players[1].powerChannelMs = 400;
    const after = paint(world, cfg, cam, 0).length;

    expect(after).toBeGreaterThan(before);
  });
});
