
import { describe, expect, it } from 'vitest';

import { ENCOUNTERS } from '../src/lab/encounters';
import { ROOM_WALL_HEIGHT } from '../src/render/atmosphere';
import type { Camera } from '../src/render/iso';
import {
  READABLE_ZOOM,
  arenaExceedsScreen,
  clampCameraToArena,
  fitZoom,
  makeCamera,
  worldToScreenAtElevation,
} from '../src/render/iso';
import { IsoCamera, projectToScreen, syncIsoCamera } from '../src/render/gl/camera';

const PLACES = 3;

const VIEWPORT = { w: 1392, h: 798 };

interface Case {
  name: string;
  cam: Camera;
}

const cameraFor = (
  zoom: number,
  center: { x: number; y: number },
  extra: Partial<Camera> = {},
): Camera => ({
  ...makeCamera(VIEWPORT.w, VIEWPORT.h),
  zoom,
  center,
  ...extra,
});

const CASES: readonly Case[] = (() => {
  const fitted = ENCOUNTERS.captain;
  const maze = ENCOUNTERS.maze_serpentine;
  expect(fitted, 'the captain room is the fitted-framing fixture').toBeDefined();
  expect(arenaExceedsScreen(fitted.arena), 'the fitted fixture must fit').toBe(false);
  const fitZoomFor = (arena: typeof fitted.arena): number =>
    fitZoom(makeCamera(VIEWPORT.w, VIEWPORT.h), arena, 90, VIEWPORT);

  const cases: Case[] = [
    {
      name: 'the identity case — origin, unit zoom, no offset',
      cam: cameraFor(1, { x: 0, y: 0 }),
    },
    {
      name: 'a fitted room, centred, with the rail offset and a shake',
      cam: cameraFor(fitZoomFor(fitted.arena), { x: 0, y: 0 }, {
        arena: fitted.arena,
        offset: { x: -170, y: 12 },
        shake: { x: 3.5, y: -2.25 },
      }),
    },
    {
      name: 'the floor of fitZoom, which clamps at 0.25',
      cam: cameraFor(0.25, { x: 4.5, y: -2.25 }, { offset: { x: 40, y: -8 } }),
    },
  ];

  expect(arenaExceedsScreen(maze.arena)).toBe(true);
  for (const look of [
    { x: 0, y: 0 },
    { x: 34, y: -6 },
    { x: -52, y: 11 },
    { x: 61.5, y: 3.25 },
  ]) {
    cases.push({
      name: `the OVERSIZED_SPAN follow path, looking at (${look.x}, ${look.y})`,
      cam: cameraFor(
        READABLE_ZOOM,
        clampCameraToArena(maze.arena, look, READABLE_ZOOM, VIEWPORT, ROOM_WALL_HEIGHT),
        { arena: maze.arena, offset: { x: -170, y: 12 }, shake: { x: -1.5, y: 4 } },
      ),
    });
  }

  for (const zoom of [0.25, 0.5, READABLE_ZOOM, 0.754, 1, 1.37, 2.4]) {
    cases.push({
      name: `zoom ${zoom}`,
      cam: cameraFor(zoom, { x: 1.75, y: -3.25 }, {
        offset: { x: -170, y: 12 },
        shake: { x: 3.5, y: -2.25 },
      }),
    });
  }
  return cases;
})();

const POINTS: readonly { x: number; y: number; elevation: number }[] = (() => {
  const out: { x: number; y: number; elevation: number }[] = [];
  for (const x of [-61.5, -20, -7.25, 0, 7.25, 20, 61.5]) {
    for (const y of [-12.5, -3.75, 0, 3.75, 12.5]) {
      for (const elevation of [0, 0.02, 1.5, ROOM_WALL_HEIGHT, 12]) {
        out.push({ x, y, elevation });
      }
    }
  }
  return out;
})();

describe('the three.js camera reproduces iso.ts', () => {
  it('samples enough points to mean something', () => {
    expect(POINTS.length).toBeGreaterThanOrEqual(150);
    expect(CASES.length).toBeGreaterThanOrEqual(10);
  });

  it.each(CASES.map((c) => [c.name, c.cam] as const))(
    'agrees with worldToScreenAtElevation for %s',
    (_name, cam) => {
      const camera = new IsoCamera();
      syncIsoCamera(camera, cam);
      for (const point of POINTS) {
        const expected = worldToScreenAtElevation(cam, point, point.elevation);
        const actual = projectToScreen(camera, cam, point, point.elevation);
        const where = `(${point.x}, ${point.y}) at ${point.elevation}`;
        expect(actual.x, `x at ${where}`).toBeCloseTo(expected.x, PLACES);
        expect(actual.y, `y at ${where}`).toBeCloseTo(expected.y, PLACES);
      }
    },
  );

  it('fails when the camera and the projection disagree, which is what it is for', () => {
    const cam = CASES[1].cam;
    const camera = new IsoCamera();
    syncIsoCamera(camera, { ...cam, zoom: cam.zoom * 1.01 });
    const far = POINTS.filter((p) => Math.abs(p.x) > 15);
    expect(far.length).toBeGreaterThan(0);
    const worst = Math.max(
      ...far.map((point) => {
        const expected = worldToScreenAtElevation(cam, point, point.elevation);
        const actual = projectToScreen(camera, cam, point, point.elevation);
        return Math.max(Math.abs(actual.x - expected.x), Math.abs(actual.y - expected.y));
      }),
    );
    expect(worst).toBeGreaterThan(1);
  });

  it('refuses to recompute its projection from a frustum', () => {
    expect(() => new IsoCamera().updateProjectionMatrix()).toThrow(/iso\.ts/);
  });

  it('keeps the inverse in step, so unproject and culling read the same camera', () => {
    const cam = CASES[1].cam;
    const camera = new IsoCamera();
    syncIsoCamera(camera, cam);
    const product = camera.projectionMatrix.clone().multiply(camera.projectionMatrixInverse);
    for (const [index, value] of product.elements.entries()) {
      expect(value, `element ${index}`).toBeCloseTo(index % 5 === 0 ? 1 : 0, 5);
    }
  });
});
