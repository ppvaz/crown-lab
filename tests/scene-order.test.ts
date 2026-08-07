
import { labArchetypeColor } from '../src/render/palette-lab';
import { LAB_ROOMS } from '../src/render/rooms/index-lab';
import { vi } from 'vitest';

const { order } = vi.hoisted(() => ({ order: [] as string[] }));

vi.mock('../src/render/models', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/render/models')>();
  return {
    ...actual,
    drawModel: () => order.push('king'),
  };
});

import { DEFAULT_COMBAT } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import { createWorld } from '../src/sim/encounter';
import { PALETTE } from '../src/render/palette';
import { DEFAULT_PRESENTATION_ID, PRESENTATION_PRESETS, resolve } from '../src/lab/presentation';
import { makeCamera } from '../src/render/iso';
import { drawScene, type FloorPad, type SceneBody } from '../src/render/draw';
import { cloneBank } from '../src/render/models';
import { PUBLIC_MODELS } from '../src/render/cast/index-public';
import { spawnCompanion } from '../src/sim/companion';
import { setUiProbe } from '../src/render/ui-probe';
import { APOTHEOSIS_OFF } from '../src/render/apotheosis/config';

const stubCtx = (): CanvasRenderingContext2D => {
  const gradient = { addColorStop: () => {} };
  const target: Record<string | symbol, unknown> = {
    canvas: { width: 1280, height: 720 },
    measureText: () => ({ width: 40, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 3 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    getLineDash: () => [],
  };
  return new Proxy(target, {
    get: (obj, prop) => (prop in obj ? obj[prop] : () => undefined),
    set: (obj, prop, value) => {
      obj[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
};

const paint = (at: { x: number; y: number }, kind: 'pad' | 'body' = 'pad'): string[] => {
  order.length = 0;
  const world = createWorld(ENCOUNTERS.wayfarer_court, DEFAULT_COMBAT, 1);
  world.players[0].pos = { x: 0, y: 0 };
  const cam = makeCamera(1280, 720);
  cam.arena = world.arena;
  const piece: FloorPad & SceneBody = { at, draw: () => order.push(kind) };
  drawScene(stubCtx(), world, cam, {
    cfg: DEFAULT_COMBAT,
    pal: { ...PALETTE },
    pres: resolve(PRESENTATION_PRESETS[DEFAULT_PRESENTATION_ID]),
    apotheosis: APOTHEOSIS_OFF,
    models: cloneBank(PUBLIC_MODELS),
    rooms: LAB_ROOMS,
    archetypeColor: labArchetypeColor,
    localPlayer: 0,
    showHitboxes: false,
    aimDistance: null,
    ...(kind === 'pad' ? { floorPads: [piece] } : { bodies: [piece] }),
  });
  return order;
};

describe('a travel pad in the painter’s sort', () => {
  it('draws before the king when it is farther from the camera', () => {
    expect(paint({ x: -2, y: -2 })).toEqual(['pad', 'king']);
  });

  it('draws after the king when it is nearer', () => {
    expect(paint({ x: 2, y: 2 })).toEqual(['king', 'pad']);
  });

  it('stays under the king when he is standing on it', () => {
    expect(paint({ x: 0, y: 0 })).toEqual(['pad', 'king']);
  });
});

describe('the host’s floor-painted effects', () => {
  it('run under every body, wherever they were thrown from', () => {
    order.length = 0;
    const world = createWorld(ENCOUNTERS.wayfarer_court, DEFAULT_COMBAT, 1);
    const cam = makeCamera(1280, 720);
    cam.arena = world.arena;
    drawScene(stubCtx(), world, cam, {
      cfg: DEFAULT_COMBAT,
      pal: { ...PALETTE },
      pres: resolve(PRESENTATION_PRESETS[DEFAULT_PRESENTATION_ID]),
      apotheosis: APOTHEOSIS_OFF,
      models: cloneBank(PUBLIC_MODELS),
      rooms: LAB_ROOMS,
      archetypeColor: labArchetypeColor,
      localPlayer: 0,
      showHitboxes: false,
      aimDistance: null,
      groundFx: () => order.push('groundfx'),
    });
    expect(order).toEqual(['groundfx', 'king']);
  });
});

describe('a health bar over a body', () => {
  it('draws after the cast, even for someone standing at the back of the room', () => {
    order.length = 0;
    const world = createWorld(ENCOUNTERS.wayfarer_court, DEFAULT_COMBAT, 1);
    world.players[0].pos = { x: 0, y: 0 };
    spawnCompanion(world, 'MARA', 60, 90, { x: -3, y: -3 });
    const cam = makeCamera(1280, 720);
    cam.arena = world.arena;

    setUiProbe((rect) => {
      if (rect.id === 'world.companion.health') order.push('bar');
    });
    drawScene(stubCtx(), world, cam, {
      cfg: DEFAULT_COMBAT,
      pal: { ...PALETTE },
      pres: resolve(PRESENTATION_PRESETS[DEFAULT_PRESENTATION_ID]),
      apotheosis: APOTHEOSIS_OFF,
      models: cloneBank(PUBLIC_MODELS),
      rooms: LAB_ROOMS,
      archetypeColor: labArchetypeColor,
      localPlayer: 0,
      showHitboxes: false,
      aimDistance: null,
    });
    setUiProbe(null);

    expect(order).toEqual(['king', 'bar']);
  });
});

describe('a host-owned body in the painter’s sort', () => {
  it('draws before the king when she is farther from the camera', () => {
    expect(paint({ x: -2, y: -2 }, 'body')).toEqual(['body', 'king']);
  });

  it('draws after the king when she is nearer', () => {
    expect(paint({ x: 2, y: 2 }, 'body')).toEqual(['king', 'body']);
  });
});
