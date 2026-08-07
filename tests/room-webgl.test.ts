
import { describe, expect, it } from 'vitest';

import type { Camera } from '../src/render/iso';
import { worldToScreenAtElevation } from '../src/render/iso';
import { roomResponse } from '../src/render/room-light-lab';
import type { RoomAblationAxis } from '../src/render/room-webgl-lab';
import {
  ROOM_SCALE_STEPS,
  currentRoomScale,
  isoProjection,
  roomShaderSources,
  setRoomScale,
} from '../src/render/room-webgl-lab';
import type { SurfaceDescription } from '../src/render/room-mesh-lab';
import { roomAblationFromSearch } from '../src/app/lab-rooms';
import { createWorld } from '../src/sim/encounter';
import { DEFAULT_COMBAT, SLOWMO_PRESETS } from '../src/lab/config';
import { stepWorld } from '../src/sim/world';
import { NEUTRAL_INTENT, TICK_MS } from '../src/sim/types';
import { ENCOUNTERS } from '../src/lab/encounters';

const CAM: Camera = {
  center: { x: 1.75, y: -3.25 },
  zoom: 1.37,
  width: 1392,
  height: 798,
  offset: { x: -170, y: 12 },
  shake: { x: 3.5, y: -2.25 },
  arena: null,
};

const PIXEL_PLACES = 3;

const project = (
  cam: Camera,
  point: { x: number; y: number },
  elevation: number,
): { x: number; y: number; z: number } => {
  const m = isoProjection(cam);
  const v = [point.x, point.y, elevation, 1];
  const out = [0, 0, 0, 0];
  for (let row = 0; row < 4; row++) {
    for (let k = 0; k < 4; k++) out[row] += m[k * 4 + row] * v[k];
  }
  expect(out[3]).toBeCloseTo(1, 12);
  return {
    x: ((out[0] + 1) / 2) * cam.width,
    y: ((1 - out[1]) / 2) * cam.height,
    z: out[2],
  };
};

const POINTS: readonly { x: number; y: number; elevation: number }[] = [
  { x: 0, y: 0, elevation: 0 },
  { x: -8.5, y: -5.5, elevation: 0 },
  { x: -8.5, y: -5.5, elevation: 5.4 },
  { x: 5.5, y: 8.5, elevation: 0 },
  { x: 8.5, y: 5.5, elevation: 1.6 },
  { x: -5.5, y: -8.5, elevation: 3.45 },
  { x: 7, y: 7, elevation: 1.15 },
];

describe('the live room projects through the runtime camera', () => {
  it('lands every point where worldToScreenAtElevation puts it', () => {
    for (const p of POINTS) {
      const want = worldToScreenAtElevation(CAM, { x: p.x, y: p.y }, p.elevation);
      const got = project(CAM, { x: p.x, y: p.y }, p.elevation);
      expect(got.x).toBeCloseTo(want.x, PIXEL_PLACES);
      expect(got.y).toBeCloseTo(want.y, PIXEL_PLACES);
    }
  });

  it('follows the camera, so a push-in and a shake move room and cast together', () => {
    const variants: readonly Camera[] = [
      { ...CAM, zoom: 0.62 },
      { ...CAM, zoom: 2.24 },
      { ...CAM, center: { x: -6, y: 4 } },
      { ...CAM, offset: { x: 0, y: 0 } },
      { ...CAM, shake: { x: 11, y: -7 } },
      { ...CAM, width: 984, height: 443 },
    ];
    for (const cam of variants) {
      for (const p of POINTS) {
        const want = worldToScreenAtElevation(cam, { x: p.x, y: p.y }, p.elevation);
        const got = project(cam, { x: p.x, y: p.y }, p.elevation);
        expect(got.x).toBeCloseTo(want.x, PIXEL_PLACES);
        expect(got.y).toBeCloseTo(want.y, PIXEL_PLACES);
      }
    }
  });

  it('orders the depth buffer the way the painter orders the cast', () => {
    const near = project(CAM, { x: 4, y: 4 }, 0).z;
    const far = project(CAM, { x: -4, y: -4 }, 0).z;
    expect(near).toBeLessThan(far);

    const high = project(CAM, { x: 0, y: 0 }, 5.4).z;
    const low = project(CAM, { x: 0, y: 0 }, 0).z;
    expect(high).toBeLessThan(low);

    for (const p of POINTS) {
      const { z } = project(CAM, { x: p.x, y: p.y }, p.elevation);
      expect(Math.abs(z)).toBeLessThan(1);
    }
  });
});

describe('the room reads the fight as light', () => {
  const world = () => {
    const def = ENCOUNTERS.concept_lantern_cloister_live;
    const w = createWorld(def, DEFAULT_COMBAT, 7);
    stepWorld(w, [NEUTRAL_INTENT], DEFAULT_COMBAT, SLOWMO_PRESETS.none, def);
    return w;
  };

  it('is pure: the same world lights the room the same way, twice', () => {
    expect(roomResponse(world())).toEqual(roomResponse(world()));
  });

  it('rests dark and even, with nobody winding up', () => {
    const rest = roomResponse(world());
    expect(rest.threats).toHaveLength(0);
    expect(rest.chill).toBe(0);
    expect(rest.bloom).toBeCloseTo(1, 6);
  });

  it('leans toward an enemy that is winding up, and only that far', () => {
    const w = world();
    w.enemies[0].state.kind = 'telegraph';
    const lit = roomResponse(w);
    expect(lit.threats).toHaveLength(1);
    expect(lit.threats[0].at).toEqual(w.enemies[0].pos);
    expect(lit.threats[0].weight).toBe(1);
    w.enemies[0].state.kind = 'attack';
    expect(roomResponse(w).threats[0].weight).toBeLessThan(1);
    w.enemies[0].state.kind = 'idle';
    expect(roomResponse(w).threats).toHaveLength(0);
  });

  it('blooms cold while a parry window is open', () => {
    const w = world();
    const rest = roomResponse(w).bloom;
    w.players[0].state.kind = 'parry';
    const parry = roomResponse(w);
    expect(parry.chill).toBe(1);
    expect(parry.bloom).toBeGreaterThan(rest);
  });

  it('bleeds out with the worst-off king, and never to black', () => {
    const w = world();
    const full = roomResponse(w).bloom;
    w.players[0].hp = w.players[0].maxHp * 0.1;
    const hurt = roomResponse(w).bloom;
    expect(hurt).toBeLessThan(full);
    w.players[0].hp = 0;
    expect(roomResponse(w).bloom).toBeGreaterThan(0.3);
  });

  it('falls low and very red when the last king is down, and takes a moment over it', () => {
    const w = world();
    const fellAt = w.tick;
    const rest = roomResponse(w).bloom;
    w.players[0].hp = 0;
    w.players[0].state = { ...w.players[0].state, kind: 'dead', enteredTick: fellAt };

    expect(roomResponse(w).mourning).toBe(0);

    const at = (ms: number) => {
      w.tick = fellAt + ms / TICK_MS;
      return roomResponse(w);
    };
    const settled = at(2000);
    expect(settled.mourning).toBe(1);
    expect(settled.bloom).toBeGreaterThan(0);
    expect(settled.bloom).toBeLessThan(rest * 0.25);
    expect(at(200).bloom).toBeGreaterThan(at(400).bloom);
    expect(at(400).bloom).toBeGreaterThan(at(700).bloom);
  });

  it('throws occasional lightning over the lost room, and only over a lost one', () => {
    const w = world();
    const fellAt = w.tick;
    expect(roomResponse(w).storm).toBe(0);

    w.players[0].hp = 0;
    w.players[0].state = { ...w.players[0].state, kind: 'dead', enteredTick: fellAt };

    const samples: number[] = [];
    for (let ms = 0; ms <= 10_000; ms += TICK_MS) {
      w.tick = fellAt + ms / TICK_MS;
      samples.push(roomResponse(w).storm);
    }
    const lit = samples.filter((s) => s > 0.05);
    expect(lit.length).toBeGreaterThan(0);
    expect(lit.length / samples.length).toBeLessThan(0.2);
    expect(Math.max(...samples)).toBeGreaterThan(0.5);

    w.tick = fellAt + 4000 / TICK_MS;
    expect(roomResponse(w).storm).toBe(roomResponse(w).storm);
  });

  it('goes out on a clock that still runs after the run has ended', () => {
    const w = world();
    const fellAt = w.tick;
    w.players[0].hp = 0;
    w.players[0].state = { ...w.players[0].state, kind: 'dead', enteredTick: fellAt, elapsedMs: 0 };
    w.tick = fellAt + 1200 / TICK_MS;
    expect(w.players[0].state.elapsedMs).toBe(0);
    expect(roomResponse(w).mourning).toBe(1);
  });

  it('keeps the room lit while anyone is still standing', () => {
    const w = world();
    const fellAt = w.tick;
    w.tick = fellAt + 5000 / TICK_MS;
    w.players.push({
      ...w.players[0],
      hp: 0,
      state: { ...w.players[0].state, kind: 'dead', enteredTick: fellAt },
    });
    expect(roomResponse(w).mourning).toBe(0);
    for (const player of w.players) {
      player.hp = 0;
      player.state = { ...player.state, kind: 'dead', enteredTick: fellAt };
    }
    expect(roomResponse(w).mourning).toBe(1);
  });
});

describe('the live room can be built without one subsystem at a time', () => {
  const SURFACES: readonly SurfaceDescription[] = [
    { kind: 'flagstone', colour: [0.31, 0.3, 0.29], joint: [0.2, 0.2, 0.2], block: [0.8, 0.8] },
    { kind: 'ashlar', colour: [0.4, 0.38, 0.35], joint: [0.25, 0.24, 0.22], block: [1.4, 0.6] },
    { kind: 'flame', colour: [1, 0.8, 0.5] },
  ];
  const AMBIENT: readonly [number, number, number] = [0.04, 0.05, 0.08];
  const LIGHTS = 9;
  const sources = (ablate?: ReadonlySet<RoomAblationAxis>) =>
    roomShaderSources(SURFACES, LIGHTS, AMBIENT, ablate);

  const MARKERS: Record<Exclude<RoomAblationAxis, 'msaa' | 'liquid'>, string> = {
    ripples: 'vec4 ring = uRipples[i];',
    reflection: 'vec3 mirror = reflect(-v, n);',
    lights: 'vec3 hv = normalize(l + v);',
    masonry: 'albedo = coursed(albedo, s, n, vPos);',
  };

  it('generates today’s shader when nothing is ablated', () => {
    const dial = sources(new Set<RoomAblationAxis>());
    const untouched = sources();
    expect(dial.fragment).toBe(untouched.fragment);
    expect(dial.vertex).toBe(untouched.vertex);
    for (const marker of Object.values(MARKERS)) {
      expect(untouched.fragment).toContain(marker);
    }
    expect(untouched.fragment).toContain('if (uLiquid > 0.0');
  });

  it('removes exactly the named subsystem, and leaves the others standing', () => {
    for (const [axis, marker] of Object.entries(MARKERS) as [RoomAblationAxis, string][]) {
      const { fragment } = sources(new Set([axis]));
      expect(fragment, axis).not.toContain(marker);
      for (const [other, otherMarker] of Object.entries(MARKERS)) {
        if (other !== axis) expect(fragment, `${axis} keeps ${other}`).toContain(otherMarker);
      }
      expect(fragment).toContain('void main()');
      expect(fragment).toContain('outColor = vec4(pow(lit, vec3(1.0 / 2.2)), 1.0);');
    }
  });

  it('takes the whole water out as one axis, rings and reflection with it', () => {
    const { fragment } = sources(new Set<RoomAblationAxis>(['liquid']));
    expect(fragment).not.toContain('if (uLiquid > 0.0');
    expect(fragment).not.toContain(MARKERS.ripples);
    expect(fragment).not.toContain(MARKERS.reflection);
    expect(fragment).toContain(MARKERS.lights);
    expect(fragment).toContain(MARKERS.masonry);
  });

  it('scales the backing only through the named steps, and rests at full', () => {
    expect(currentRoomScale()).toBe(1);
    try {
      expect(setRoomScale(0.75)).toBe(0.75);
      expect(currentRoomScale()).toBe(0.75);
      expect(setRoomScale(0.63)).toBe(1);
      expect(setRoomScale(ROOM_SCALE_STEPS[2])).toBe(0.5);
    } finally {
      setRoomScale(1);
    }
  });

  it('reads the dial from the query string, and drops what it does not know', () => {
    expect(roomAblationFromSearch('')).toEqual([]);
    expect(roomAblationFromSearch('?capture=x')).toEqual([]);
    expect(roomAblationFromSearch('?roomAblate=liquid')).toEqual(['liquid']);
    expect(roomAblationFromSearch('?roomAblate=liquid,lights')).toEqual(['liquid', 'lights']);
    expect(roomAblationFromSearch('?roomAblate= masonry , msaa ')).toEqual(['masonry', 'msaa']);
    expect(roomAblationFromSearch('?roomAblate=liquid,everything')).toEqual(['liquid']);
    expect(roomAblationFromSearch('?roomAblate=')).toEqual([]);
  });
});
