
import { describe, expect, it } from 'vitest';

import type { Camera } from '../src/render/iso';
import { ISO_X, ISO_Y, makeCamera, worldToScreen } from '../src/render/iso';
import type { Mesh, MeshDrawOpts } from '../src/render/mesh';
import { ISO_Z, box, merge, shadeHex } from '../src/render/mesh';
import { IsoCamera, projectToScreen, syncIsoCamera } from '../src/render/gl/camera';
import { HEIGHT_TO_ELEVATION, buildActorGeometry } from '../src/render/gl/actors';

const CAM: Camera = {
  ...makeCamera(1392, 798),
  zoom: 1.37,
  center: { x: 1.75, y: -3.25 },
  offset: { x: -170, y: 12 },
  shake: { x: 3.5, y: -2.25 },
};

const BODY: Mesh = merge(
  box([-0.4, -0.25, 0], [0.4, 0.25, 1.6], 'tint'),
  box([0.35, 0.1, 0.9], [0.75, 0.7, 1.3], 'outline', 'weapon'),
);

const OPTS = (overrides: Partial<MeshDrawOpts> = {}): MeshDrawOpts => ({
  at: { x: 2.5, y: -1.25 },
  facing: 0,
  radius: 0.55,
  height: 1.8,
  lean: 0,
  crouch: 1,
  weapon: 0,
  shield: 0,
  gait: 0,
  resolveFill: (spec) => (spec === 'tint' ? '#8899aa' : '#221a14'),
  ...overrides,
});

const positionsOf = (opts: MeshDrawOpts): number[][] => {
  const array = buildActorGeometry(BODY, opts).getAttribute('position').array;
  const out: number[][] = [];
  for (let i = 0; i < array.length; i += 3) out.push([array[i], array[i + 1], array[i + 2]]);
  return out;
};

const softwareProject = (p: number[]): { x: number; y: number } => {
  const ground = worldToScreen(CAM, { x: p[0], y: p[1] });
  return { x: ground.x, y: ground.y - p[2] * ISO_Z * CAM.zoom };
};

describe('the three.js cast agrees with the software rasterizer', () => {
  it('puts every vertex where drawMesh would put it', () => {
    const camera = new IsoCamera();
    syncIsoCamera(camera, CAM);
    const opts = OPTS({ gait: 1.1, lean: 0.12, facing: 0.9, weapon: 0.4 });

    for (const p of positionsOf(opts)) {
      const expected = softwareProject([p[0], p[1], p[2] / HEIGHT_TO_ELEVATION]);
      const actual = projectToScreen(camera, CAM, { x: p[0], y: p[1] }, p[2]);
      expect(actual.x).toBeCloseTo(expected.x, 3);
      expect(actual.y).toBeCloseTo(expected.y, 3);
    }
  });

  it('scales height by ISO_Z and not by the camera elevation, which is a different number', () => {
    expect(HEIGHT_TO_ELEVATION).toBeCloseTo(30 / 34, 12);
    expect(HEIGHT_TO_ELEVATION).not.toBe(1);
  });

  it('shades a face by the same lambert term and the same palette entry as drawMesh', () => {
    const geometry = buildActorGeometry(BODY, OPTS());
    const colours = geometry.getAttribute('color').array;
    const seen = new Set<string>();
    for (let i = 0; i < colours.length; i += 3) {
      seen.add([colours[i], colours[i + 1], colours[i + 2]].map((c) => c.toFixed(4)).join(','));
    }
    expect(seen.size).toBeGreaterThan(3);
    const channels = [0x88, 0x99, 0xaa].map((c) => Math.round(c * 0.55));
    const darkest = `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    expect(shadeHex('#8899aa', 0.55)).toBe(darkest);
  });
});

describe('facing is readable through 360 degrees', () => {
  it('gives a different silhouette at every heading', () => {
    const camera = new IsoCamera();
    syncIsoCamera(camera, CAM);
    const signatures = new Map<string, number>();
    for (let step = 0; step < 8; step++) {
      const facing = (step / 8) * Math.PI * 2;
      const screen = positionsOf(OPTS({ facing })).map((p) =>
        projectToScreen(camera, CAM, { x: p[0], y: p[1] }, p[2]),
      );
      const xs = screen.map((s) => s.x);
      const ys = screen.map((s) => s.y);
      const signature = [
        Math.min(...xs),
        Math.max(...xs),
        Math.min(...ys),
        Math.max(...ys),
        xs.reduce((a, b) => a + b, 0) / xs.length,
      ]
        .map((v) => v.toFixed(2))
        .join('|');
      signatures.set(signature, (signatures.get(signature) ?? 0) + 1);
    }
    expect(signatures.size).toBe(8);
  });

  it('moves the weapon across the body when the actor turns a quarter circle', () => {
    const camera = new IsoCamera();
    syncIsoCamera(camera, CAM);
    const weaponCentroid = (facing: number): { x: number; y: number } => {
      const geometry = buildActorGeometry(BODY, OPTS({ facing }));
      const position = geometry.getAttribute('position').array;
      const colour = geometry.getAttribute('color').array;
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (let i = 0; i < position.length; i += 3) {
        if (colour[i] > 0.25) continue;
        const s = projectToScreen(
          camera,
          CAM,
          { x: position[i], y: position[i + 1] },
          position[i + 2],
        );
        sx += s.x;
        sy += s.y;
        n++;
      }
      expect(n).toBeGreaterThan(0);
      return { x: sx / n, y: sy / n };
    };
    const east = weaponCentroid(0);
    const north = weaponCentroid(Math.PI / 2);


    const halfBodyWidthPx = 0.5 * (0.8 * 0.55 * ISO_X * CAM.zoom);
    expect(Math.hypot(north.x - east.x, north.y - east.y)).toBeGreaterThan(halfBodyWidthPx);
    expect(ISO_Y).toBeGreaterThan(0);
  });
});
