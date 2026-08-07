
import { describe, expect, it } from 'vitest';
import { ActionCamera, actionShot, threatReach } from '../src/render/action-camera';
import type { CameraShot } from '../src/render/action-camera';
import {
  READABLE_ZOOM,
  actionBounds,
  arenaExceedsScreen,
  clampCameraToArena,
  fitZoom,
  makeCamera,
  worldToScreen,
} from '../src/render/iso';
import { createWorld } from '../src/sim/encounter';
import { stepWorld } from '../src/sim/world';
import { NEUTRAL_INTENT } from '../src/sim/types';
import type { Vec2 } from '../src/sim/types';
import { DEFAULT_COMBAT, SLOWMO_PRESETS } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';

const CONTENT = { w: 1440, h: 900 };
const REST: CameraShot = { zoom: 0.75, focus: { x: 0, y: 0 } };

const captainWorld = () => {
  const world = createWorld(ENCOUNTERS.captain, DEFAULT_COMBAT, 31);
  stepWorld(world, [NEUTRAL_INTENT], DEFAULT_COMBAT, SLOWMO_PRESETS.none, ENCOUNTERS.captain);
  if (world.enemies.length === 0) throw new Error('the captain did not spawn');
  return world;
};

describe('the shot that frames the fight', () => {
  it('leaves an emptied room at the host resting shot, object and all', () => {
    const cam = makeCamera(1440, 900);
    const world = captainWorld();
    world.enemies.forEach((enemy) => {
      enemy.state.kind = 'dead';
    });
    expect(actionShot(cam, world, DEFAULT_COMBAT, [{ x: 0, y: 0 }], REST, 108, CONTENT)).toBe(REST);
  });

  it('pushes in on a live duel, and never pulls out past the resting shot', () => {
    const cam = makeCamera(1440, 900);
    const world = captainWorld();
    const shot = actionShot(cam, world, DEFAULT_COMBAT, [world.players[0].pos], REST, 108, CONTENT);
    expect(shot.zoom).toBeGreaterThan(REST.zoom);
  });

  it('sits 60/40 toward the king rather than on the midpoint between the bodies', () => {
    const cam = makeCamera(1440, 900);
    const world = captainWorld();
    world.players[0].pos = { x: 0, y: 0 };
    world.enemies[0].pos = { x: 0, y: -6 };
    const shot = actionShot(cam, world, DEFAULT_COMBAT, [{ x: 0, y: 0 }], REST, 108, CONTENT);
    const boxCentre = (0 + (-6 - threatReach(DEFAULT_COMBAT, world.enemies[0].archetype))) / 2;
    expect(shot.focus.y).toBeLessThan(0);
    expect(shot.focus.y).toBeGreaterThan(boxCentre);
  });

  it('pads each enemy by the longest lunge it could be winding up, not its body', () => {
    for (const archetype of Object.keys(DEFAULT_COMBAT.enemies) as (keyof typeof DEFAULT_COMBAT.enemies)[]) {
      const cfg = DEFAULT_COMBAT.enemies[archetype];
      expect(threatReach(DEFAULT_COMBAT, archetype)).toBeGreaterThan(cfg.attackRange);
      for (const attack of cfg.attacks) {
        expect(threatReach(DEFAULT_COMBAT, archetype)).toBeGreaterThan(
          attack.range + attack.lungeDistance,
        );
      }
    }
  });
});

describe('which threats the shot is allowed to frame', () => {
  const stepped = (id: string) => {
    const def = ENCOUNTERS[id];
    const world = createWorld(def, DEFAULT_COMBAT, 1);
    stepWorld(world, [NEUTRAL_INTENT], DEFAULT_COMBAT, SLOWMO_PRESETS.none, def);
    return { def, world };
  };

  const mazeRest = (box: { w: number; h: number }, king: Vec2) => ({
    zoom: READABLE_ZOOM,
    focus: clampCameraToArena(ENCOUNTERS.maze_serpentine.arena, king, READABLE_ZOOM, box, 5.4),
  });

  for (const box of [
    { w: 892, h: 618, margin: 90 },
    { w: 390, h: 500, margin: 36 },
  ]) {
    it(`keeps the king on screen in the maze at ${box.w}x${box.h}`, () => {
      const { def, world } = stepped('maze_serpentine');
      expect(world.enemies.length).toBe(12);
      const content = { w: box.w, h: box.h };
      const cam = makeCamera(box.w, box.h);
      cam.arena = def.arena;
      const king = world.players[0].pos;
      const shot = actionShot(
        cam,
        world,
        DEFAULT_COMBAT,
        [king],
        mazeRest(content, king),
        box.margin,
        content,
      );
      cam.zoom = shot.zoom;
      cam.center = shot.focus;
      const at = worldToScreen(cam, king);
      expect(Math.abs(at.x - cam.width / 2)).toBeLessThan(content.w / 2 - box.margin);
      expect(Math.abs(at.y - cam.height / 2)).toBeLessThan(content.h / 2 - box.margin);
    });
  }

  it('drops the bodies three corridors away and keeps the ones in this one', () => {
    const { def, world } = stepped('maze_serpentine');
    const content = { w: 892, h: 618 };
    const cam = makeCamera(892, 618);
    cam.arena = def.arena;
    const king = world.players[0].pos;
    const shot = actionShot(cam, world, DEFAULT_COMBAT, [king], mazeRest(content, king), 90, content);
    expect(Math.abs(shot.focus.x - king.x)).toBeLessThan(20);
  });

  it('drops nobody in any room that fits on the screen', () => {
    const content = { w: 892, h: 618 };
    let checked = 0;
    for (const id of Object.keys(ENCOUNTERS)) {
      if (arenaExceedsScreen(ENCOUNTERS[id].arena)) continue;
      const { def, world } = stepped(id);
      if (world.enemies.length === 0) continue;
      const cam = makeCamera(892, 618);
      cam.arena = def.arena;
      const king = world.players[0].pos;
      const rest = {
        zoom: fitZoom(cam, def.arena, 90, content),
        focus: { x: king.x * 0.3, y: king.y * 0.3 },
      };
      const shot = actionShot(cam, world, DEFAULT_COMBAT, [king], rest, 90, content);
      const all = actionBounds(
        [king],
        world.enemies.map((enemy) => ({
          pos: enemy.pos,
          reach: threatReach(DEFAULT_COMBAT, enemy.archetype),
        })),
      );
      if (all === null) throw new Error(`${id} framed nothing`);
      expect(shot.focus.x, id).toBeCloseTo(king.x * 0.6 + all.center.x * 0.4, 9);
      expect(shot.focus.y, id).toBeCloseTo(king.y * 0.6 + all.center.y * 0.4, 9);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(5);
  });
});

describe('the camera arriving at the shot', () => {
  const TARGET: CameraShot = { zoom: 2, focus: { x: 8, y: -4 } };

  it('cuts, for a new room and a resize', () => {
    const cam = makeCamera(1440, 900);
    const camera = new ActionCamera();
    camera.cut(TARGET);
    camera.advance(cam, TARGET, 0);
    expect(cam.zoom).toBe(2);
    expect(cam.center).toEqual({ x: 8, y: -4 });
  });

  it('eases rather than jumping', () => {
    const cam = makeCamera(1440, 900);
    const camera = new ActionCamera();
    camera.cut({ zoom: 1, focus: { x: 0, y: 0 } });
    camera.advance(cam, TARGET, 16);
    expect(cam.zoom).toBeGreaterThan(1);
    expect(cam.zoom).toBeLessThan(1.2);
  });

  it('converges on real time, so the frame rate is not the feel', () => {
    const slow = new ActionCamera();
    const fast = new ActionCamera();
    const slowCam = makeCamera(1440, 900);
    const fastCam = makeCamera(1440, 900);
    slow.cut({ zoom: 1, focus: { x: 0, y: 0 } });
    fast.cut({ zoom: 1, focus: { x: 0, y: 0 } });

    slow.advance(slowCam, TARGET, 100);
    for (let step = 0; step < 6; step += 1) fast.advance(fastCam, TARGET, 100 / 6);

    expect(fastCam.zoom).toBeCloseTo(slowCam.zoom, 6);
    expect(fastCam.center.x).toBeCloseTo(slowCam.center.x, 6);
  });

  it('does not hand out its own state for a host to write through', () => {
    const cam = makeCamera(1440, 900);
    const camera = new ActionCamera();
    camera.cut({ zoom: 1, focus: { x: 0, y: 0 } });
    camera.advance(cam, TARGET, 100);
    const eased = cam.center.x;
    cam.center = { x: 999, y: 999 };
    camera.advance(cam, TARGET, 0);
    expect(cam.center.x).toBeCloseTo(eased, 6);
  });
});
