
import { describe, expect, it } from 'vitest';
import { LabCamera, captureCameraFramesAction } from '../src/app/lab-camera';
import type { CaptureShot } from '../src/app/capture';
import { makeCamera } from '../src/render/iso';
import { createWorld } from '../src/sim/encounter';
import { stepWorld } from '../src/sim/world';
import { NEUTRAL_INTENT } from '../src/sim/types';
import { DEFAULT_COMBAT, SLOWMO_PRESETS } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import type { RoomRegistry } from '../src/render/rooms/theme';

const CONTENT = { w: 984, h: 443 };

const SHOT: CaptureShot = {
  id: 'arena-training',
  encounterId: 'kernel_guard',
  combatId: 'Default',
  slowMoId: 'none',
  presentationId: 'Full',
  materialPack: 'none',
  modelBank: 'silhouette',
  seed: 1,
};

const BARE_ROOMS = { themeFor: () => null } as unknown as RoomRegistry;

const guardWorld = () => {
  const world = createWorld(ENCOUNTERS.kernel_guard, DEFAULT_COMBAT, 31);
  stepWorld(world, [NEUTRAL_INTENT], DEFAULT_COMBAT, SLOWMO_PRESETS.none, ENCOUNTERS.kernel_guard);
  if (world.enemies.length === 0) throw new Error('the guard did not spawn');
  return world;
};

const cameraFor = (captureShot: CaptureShot | null) => {
  const cam = makeCamera(CONTENT.w, CONTENT.h);
  const world = guardWorld();
  const labCamera = new LabCamera({
    cam,
    rooms: BARE_ROOMS,
    captureShot,
    world: () => world,
    combat: () => DEFAULT_COMBAT,
    touchActive: () => false,
    showcaseActive: () => false,
  });
  return { cam, world, labCamera };
};

describe('asking a capture to stand in the fight’s frame', () => {
  it('is off unless the host explicitly opts in', () => {
    expect(captureCameraFramesAction('')).toBe(false);
    expect(captureCameraFramesAction('?capture=arena-training')).toBe(false);
    expect(captureCameraFramesAction('?captureCamera=rest')).toBe(false);
    expect(captureCameraFramesAction('?captureCamera=actionn')).toBe(false);
    expect(captureCameraFramesAction('?captureCamera=action')).toBe(true);
    expect(captureCameraFramesAction('?capture=x&captureCamera=ACTION')).toBe(true);
  });

  it('changes nothing for a live lab, which has its own eased camera already', () => {
    const { labCamera } = cameraFor(null);
    labCamera.frameCapturesAsAction(true);
    expect(labCamera.cutsToAction()).toBe(false);
    expect(labCamera.eases()).toBe(true);
  });

  it('applies only when it was asked for', () => {
    const { labCamera } = cameraFor(SHOT);
    expect(labCamera.cutsToAction()).toBe(false);
    labCamera.frameCapturesAsAction(true);
    expect(labCamera.cutsToAction()).toBe(true);
    expect(labCamera.eases()).toBe(false);
  });

  it('stands closer than the resting frame the benchmark has always used', () => {
    const { labCamera } = cameraFor(SHOT);
    const box = { w: CONTENT.w, h: CONTENT.h };
    expect(labCamera.target(box).zoom).toBeGreaterThan(labCamera.rest(box).zoom);
  });

  it('writes the fight’s shot onto the camera exactly, with no ease left in it', () => {
    const { cam, labCamera } = cameraFor(SHOT);
    const box = { w: CONTENT.w, h: CONTENT.h };
    const target = labCamera.target(box);
    labCamera.cutToAction(box);
    expect(cam.zoom).toBe(target.zoom);
    expect(cam.center).toEqual(target.focus);
  });

  it('produces the same frame twice, which is the whole contract of a capture', () => {
    const { cam, labCamera } = cameraFor(SHOT);
    const box = { w: CONTENT.w, h: CONTENT.h };
    labCamera.cutToAction(box);
    const first = { zoom: cam.zoom, center: { ...cam.center } };
    labCamera.cutToAction(box);
    labCamera.cutToAction(box);
    expect(cam.zoom).toBe(first.zoom);
    expect(cam.center).toEqual(first.center);
  });
});
