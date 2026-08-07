
import { LAB_ROOMS } from '../src/render/rooms/index-lab';
import { PUBLIC_ROOMS } from '../src/render/rooms/index-public';
import { describe, expect, it } from 'vitest';

import {
  ambienceFor,
  drawFloorLight,
  drawRoomAir,
  drawRoomShell,
  drawWindowLight,
  hashNoise,
  wallFootprint,
  lightsFor,
} from '../src/render/atmosphere';
import { PALETTE } from '../src/render/palette';
import { makeCamera } from '../src/render/iso';
import type { World } from '../src/sim/types';

const recordingContext = () => {
  const calls: string[] = [];
  const composites: string[] = [];
  const target: Record<string, unknown> = {
    canvas: { width: 1440, height: 900 },
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
  };
  const proxy = new Proxy(target, {
    get(object, property: string) {
      if (property in object) return object[property];
      return (...args: unknown[]) => {
        calls.push(`${property}(${args.join(',')})`);
      };
    },
    set(object, property: string, value) {
      if (property === 'globalCompositeOperation') composites.push(String(value));
      object[property] = value;
      return true;
    },
  });
  return { ctx: proxy as unknown as CanvasRenderingContext2D, calls, composites };
};

const worldWith = (defId: string, halfExtents: { x: number; y: number }): World =>
  ({
    encounter: { defId },
    arena: { shape: 'rect', halfExtents },
    players: [{ pos: { x: 0, y: 0 } }],
  }) as unknown as World;

describe('ambience', () => {
  it('falls back to the default for a room nobody has lit', () => {
    const unknown = ambienceFor(LAB_ROOMS, 'an_encounter_that_does_not_exist');
    expect(unknown.key).toBe(ambienceFor(LAB_ROOMS, '').key);
    expect(unknown.dust).toBeGreaterThan(0);
  });

  it('gives every node of the route its own mood', () => {
    const route = [
      'wayfarer_court',
      'kernel_guard',
      'kernel_duelist',
      'spacing_archer',
      'overlap_court',
      'upper_hall',
      'captain',
    ];
    const signatures = route.map((id) => {
      const a = ambienceFor(LAB_ROOMS, id);
      return `${a.skyHorizon}|${a.key}|${a.fill}|${a.dust}|${a.fog}`;
    });
    expect(new Set(signatures).size).toBe(route.length);
  });

  it('keeps the throne the darkest and the court the warmest', () => {
    expect(ambienceFor(LAB_ROOMS, 'upper_hall').dust).toBeLessThan(ambienceFor(LAB_ROOMS, 'wayfarer_court').dust);
    expect(ambienceFor(LAB_ROOMS, 'captain').skyHigh).not.toBe(ambienceFor(LAB_ROOMS, 'wayfarer_court').skyHigh);
  });

  it('gives route architecture court, lancet and defensive window families', () => {
    expect(ambienceFor(LAB_ROOMS, 'wayfarer_court').windowStyle).toBe('court');
    expect(ambienceFor(LAB_ROOMS, 'kernel_duelist').windowStyle).toBe('lancet');
    expect(ambienceFor(LAB_ROOMS, 'spacing_archer').windowStyle).toBe('defensive');
  });

  it('composes the existing skyline differently by room role', () => {
    expect(ambienceFor(LAB_ROOMS, 'wayfarer_court').parallaxStyle).toBe('inhabited');
    expect(ambienceFor(LAB_ROOMS, 'kernel_guard').parallaxStyle).toBe('fortress');
    expect(ambienceFor(LAB_ROOMS, 'overlap_court').parallaxStyle).toBe('ruin');
    expect(ambienceFor(LAB_ROOMS, 'upper_hall').parallaxStyle).toBe('high_court');
  });

  it('carries maintenance state from kept court to damaged keep', () => {
    expect(ambienceFor(LAB_ROOMS, 'wayfarer_court').wallCondition).toBe('kept');
    expect(ambienceFor(LAB_ROOMS, 'kernel_guard').wallCondition).toBe('fortified');
    expect(ambienceFor(LAB_ROOMS, 'kernel_duelist').wallCondition).toBe('weathered');
    expect(ambienceFor(LAB_ROOMS, 'overlap_court').wallCondition).toBe('damaged');
    expect(ambienceFor(LAB_ROOMS, 'projectile_rain_boss').wallCondition).toBe('plain');
  });

  it('uses glazing colour as architecture rather than encounter telemetry', () => {
    expect(ambienceFor(LAB_ROOMS, 'wayfarer_court').glassStyle).toBe('amber');
    expect(ambienceFor(LAB_ROOMS, 'kernel_guard').glassStyle).toBe('smoke');
    expect(ambienceFor(LAB_ROOMS, 'kernel_duelist').glassStyle).toBe('frost');
    expect(ambienceFor(LAB_ROOMS, 'spacing_archer').glassStyle).toBe('clear');
    expect(ambienceFor(LAB_ROOMS, 'first_blade').glassStyle).toBe('crimson');
  });

  it('uses wall displays to name room function without decorating control rooms', () => {
    expect(ambienceFor(LAB_ROOMS, 'wayfarer_court').wallDisplay).toBe('heraldry');
    expect(ambienceFor(LAB_ROOMS, 'kernel_guard').wallDisplay).toBe('arms');
    expect(ambienceFor(LAB_ROOMS, 'overlap_court').wallDisplay).toBe('service');
    expect(ambienceFor(LAB_ROOMS, 'upper_hall').wallDisplay).toBe('records');
    expect(ambienceFor(LAB_ROOMS, 'projectile_rain_boss').wallDisplay).toBe('none');
    expect(ambienceFor(LAB_ROOMS, 'reach_study').wallDisplay).toBe('none');
  });

  it('keeps public-route lighting identical in the public and lab registries', () => {
    for (const id of [
      'wayfarer_court',
      'kernel_guard',
      'kernel_duelist',
      'spacing_archer',
      'overlap_court',
      'siege_10',
      'upper_hall',
      'first_blade',
    ]) {
      expect(ambienceFor(LAB_ROOMS, id)).toEqual(ambienceFor(PUBLIC_ROOMS, id));
    }
  });
});

describe('hashNoise', () => {
  it('is deterministic, which is what keeps capture diffs meaningful', () => {
    expect(hashNoise(3, 7)).toBe(hashNoise(3, 7));
    expect(hashNoise(3, 7)).not.toBe(hashNoise(3, 8));
  });

  it('stays inside [0,1)', () => {
    for (let i = 0; i < 200; i++) {
      const value = hashNoise(i, i * 3);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('lightsFor', () => {
  it('always lights the king, so he is never standing in the dark', () => {
    const world = worldWith('kernel_guard', { x: 8, y: 6 });
    const lights = lightsFor(world, []);
    expect(lights).toHaveLength(1);
    expect(lights[0].at).toEqual(world.players[0].pos);
  });

  it('keeps pools smaller than the gaps between emitters', () => {
    const world = worldWith('kernel_guard', { x: 8, y: 6 });
    const emitters = [
      { x: -6, y: -6 },
      { x: 6, y: -6 },
      { x: 6, y: 6 },
    ];
    const lights = lightsFor(world, emitters);
    expect(lights).toHaveLength(4);
    for (const light of lights) expect(light.radius).toBeLessThan(6);
  });
});

describe('drawFloorLight', () => {
  it('adds light rather than replacing the floor', () => {
    const { ctx, composites } = recordingContext();
    const world = worldWith('kernel_guard', { x: 8, y: 6 });
    drawFloorLight(ctx, makeCamera(1440, 900), ambienceFor(LAB_ROOMS, 'kernel_guard'), lightsFor(world, []), 0);
    expect(composites).toContain('lighter');
  });

  it('draws one pool per light', () => {
    const { ctx, calls } = recordingContext();
    const world = worldWith('kernel_guard', { x: 8, y: 6 });
    const lights = lightsFor(world, [{ x: 3, y: 3 }, { x: -3, y: -3 }]);
    drawFloorLight(ctx, makeCamera(1440, 900), ambienceFor(LAB_ROOMS, 'kernel_guard'), lights, 1200);
    expect(calls.filter((call) => call.startsWith('arc(')).length).toBe(lights.length);
  });
});

describe('drawRoomAir', () => {
  it('batches each themed room pocket into one paint operation', () => {
    for (const id of ['kernel_guard', 'overlap_court', 'siege_10']) {
      const { ctx, calls } = recordingContext();
      const world = worldWith(id, { x: 8, y: 6 });
      drawRoomAir(
        ctx,
        world,
        makeCamera(1440, 900),
        LAB_ROOMS,
        ambienceFor(LAB_ROOMS, id),
        1200,
      );
      expect(calls.filter((call) => call === 'fill()' || call === 'stroke()')).toHaveLength(1);
    }
  });

  it('leaves mechanics-only control rooms without local environmental cues', () => {
    const { ctx, calls } = recordingContext();
    const world = worldWith('projectile_rain_boss', { x: 8, y: 6 });
    drawRoomAir(
      ctx,
      world,
      makeCamera(1440, 900),
      LAB_ROOMS,
      ambienceFor(LAB_ROOMS, 'projectile_rain_boss'),
      1200,
    );
    expect(calls).toEqual([]);
  });
});

describe('drawWindowLight', () => {
  it('batches every projected opening into one floor fill', () => {
    const { ctx, calls, composites } = recordingContext();
    const world = worldWith('kernel_guard', { x: 8, y: 6 });
    drawWindowLight(
      ctx,
      world,
      makeCamera(1440, 900),
      LAB_ROOMS,
      ambienceFor(LAB_ROOMS, 'kernel_guard'),
    );
    expect(calls.filter((call) => call === 'fill()')).toHaveLength(1);
    expect(composites).toContain('lighter');
  });

  it('does not project decorative window shapes into a control arena', () => {
    const { ctx, calls } = recordingContext();
    const world = worldWith('projectile_rain_boss', { x: 8, y: 6 });
    drawWindowLight(
      ctx,
      world,
      makeCamera(1440, 900),
      LAB_ROOMS,
      ambienceFor(LAB_ROOMS, 'projectile_rain_boss'),
    );
    expect(calls).toEqual([]);
  });
});

const ROOM_FACADE_STROKES = 6;

const ROOM_DISPLAY_STROKES = 1;

const ROOM_SHELL_STROKES = 4;

const rectRoom = (defId: string, halfX: number, halfY: number): World =>
  ({
    encounter: { defId },
    arena: {
      halfExtents: { x: halfX, y: halfY },
      outline: [
        { x: -halfX, y: -halfY },
        { x: halfX, y: -halfY },
        { x: halfX, y: halfY },
        { x: -halfX, y: halfY },
      ],
    },
    players: [{ pos: { x: 0, y: 0 } }],
  }) as unknown as World;

describe('drawRoomShell', () => {
  it('walls the far edges and plinths the near ones', () => {
    const { ctx, calls } = recordingContext();
    const world = worldWith('kernel_guard', { x: 8, y: 6 });
    drawRoomShell(ctx, world, makeCamera(1440, 900), ambienceFor(LAB_ROOMS, 'kernel_guard'), PALETTE.wall);
    expect(calls.filter((call) => call === 'stroke()').length).toBe(
      ROOM_SHELL_STROKES + ROOM_FACADE_STROKES + ROOM_DISPLAY_STROKES,
    );
    expect(calls.filter((call) => call === 'fill()').length).toBeGreaterThanOrEqual(2 * 2 + 2);
  });

  it('runs on a non-rectangular arena', () => {
    const { ctx, calls } = recordingContext();
    const world = {
      encounter: { defId: 'overlap_court' },
      arena: {
        halfExtents: { x: 9, y: 7 },
        outline: [
          { x: -9, y: -3.5 },
          { x: -4.5, y: -7 },
          { x: 4.5, y: -7 },
          { x: 9, y: -3.5 },
          { x: 4.5, y: 7 },
          { x: -4.5, y: 7 },
        ],
      },
      players: [{ pos: { x: 0, y: 0 } }],
    } as unknown as World;
    drawRoomShell(ctx, world, makeCamera(1440, 900), ambienceFor(LAB_ROOMS, 'overlap_court'), PALETTE.wall);
    expect(calls.filter((call) => call === 'stroke()').length).toBe(
      ROOM_SHELL_STROKES + ROOM_FACADE_STROKES + ROOM_DISPLAY_STROKES,
    );
    expect(calls.filter((call) => call === 'fill()').length).toBeGreaterThanOrEqual(3 * 2 + 3);
  });

  it('shows the actual outside through the glass, rather than painting a lit panel', () => {
    const { ctx, calls, composites } = recordingContext();
    const world = worldWith('kernel_guard', { x: 8, y: 6 });
    drawRoomShell(ctx, world, makeCamera(1440, 900), ambienceFor(LAB_ROOMS, 'kernel_guard'), PALETTE.wall);
    expect(calls.filter((call) => call === 'clip()').length).toBe(2);
    expect(calls.some((call) => call.startsWith('fillRect('))).toBe(true);
    expect(composites).toContain('lighter');
  });

  it('costs the same however many windows the room holds', () => {
    const short = recordingContext();
    drawRoomShell(
      short.ctx,
      rectRoom('kernel_guard', 6, 5),
      makeCamera(1440, 900),
      ambienceFor(LAB_ROOMS, 'kernel_guard'),
      PALETTE.wall,
    );
    const long = recordingContext();
    drawRoomShell(
      long.ctx,
      rectRoom('kernel_guard', 22, 5),
      makeCamera(1440, 900),
      ambienceFor(LAB_ROOMS, 'kernel_guard'),
      PALETTE.wall,
    );

    const expensive = (calls: string[]) =>
      calls.filter((call) => /^(fill|stroke|clip|fillRect|drawImage)\(/.test(call)).length;
    expect(expensive(long.calls)).toBe(expensive(short.calls));
    expect(long.calls.filter((c) => c.startsWith('lineTo(')).length).toBeGreaterThan(
      short.calls.filter((c) => c.startsWith('lineTo(')).length,
    );
  });

  it('leaves a blind wall blind when the room asks for one', () => {
    const { ctx, calls } = recordingContext();
    const world = worldWith('kernel_guard', { x: 8, y: 6 });
    const blind = { ...ambienceFor(LAB_ROOMS, 'kernel_guard'), windowSpacing: 0 };
    drawRoomShell(ctx, world, makeCamera(1440, 900), blind, PALETTE.wall);

    expect(calls.filter((call) => call === 'clip()').length).toBe(0);
    expect(calls.filter((call) => call === 'stroke()').length).toBe(ROOM_SHELL_STROKES);
    expect(calls.filter((call) => call === 'fill()').length).toBe(2 * 2 + 2 + 2 + 2 + 2 + 1);
  });
});

describe('the wall footprint', () => {
  it('returns one point per corner, so the ring cannot open', () => {
    const square = [
      { x: -4, y: -4 },
      { x: 4, y: -4 },
      { x: 4, y: 4 },
      { x: -4, y: 4 },
    ];
    const out = wallFootprint(square, 1);
    expect(out).toHaveLength(square.length);
    for (let i = 0; i < square.length; i++) {
      expect(Math.hypot(out[i].x, out[i].y)).toBeGreaterThan(Math.hypot(square[i].x, square[i].y));
    }
  });

  it('keeps both edge faces the requested distance outside at a concave corner', () => {
    const elbow = [
      { x: -4, y: -4 },
      { x: 4, y: -4 },
      { x: 4, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 4 },
      { x: -4, y: 4 },
    ];
    const out = wallFootprint(elbow, 0.55);
    expect(out[3].x).toBeCloseTo(0.55, 6);
    expect(out[3].y).toBeCloseTo(0.55, 6);
  });

  it('survives a degenerate corner sitting on the centroid', () => {
    const out = wallFootprint([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }], 1);
    for (const point of out) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });
});
