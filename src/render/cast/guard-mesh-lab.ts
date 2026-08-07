
import type { Mesh } from '../mesh';
import { box, cylinder, ellipsoid, frustum, merge } from '../mesh';
import type { ModelDef } from '../models';

const HIP_Z = 0.58;

const STANCE = 0.135;

const leg = (side: number, part: 'legLead' | 'legTrail'): Mesh => {
  const x = side * STANCE;
  return merge(
    frustum(
      [x - 0.078, -0.075, x + 0.078, 0.075],
      [x - 0.092, -0.088, x + 0.092, 0.088],
      0.32,
      HIP_Z,
      'garment',
      part,
    ),
    frustum(
      [x - 0.082, -0.078, x + 0.082, 0.082],
      [x - 0.098, -0.092, x + 0.098, 0.098],
      0.09,
      0.32,
      'tint',
      part,
    ),
    frustum(
      [x - 0.09, -0.078, x + 0.09, 0.165],
      [x - 0.098, -0.082, x + 0.098, 0.105],
      0,
      0.075,
      'garment',
      part,
    ),
  );
};

const cuirass = (): Mesh =>
  merge(
    cylinder([0, 0], [0.272, 0.19], 0.52, 0.66, 'tint', 'body', 8, [0.222, 0.152]),
    cylinder([0, 0], [0.222, 0.152], 0.66, 0.82, 'tint', 'body', 8, [0.205, 0.14]),
    cylinder([0, 0], [0.205, 0.14], 0.82, 1.02, 'tint', 'body', 8, [0.238, 0.163]),
    cylinder([0, 0], [0.23, 0.16], 0.63, 0.675, 'playerAccent', 'body', 8, [0.226, 0.157]),
    cylinder([0, 0], [0.132, 0.112], 1.02, 1.1, 'garment', 'body', 8, [0.116, 0.098]),
  );

const pauldron = (side: number): Mesh =>
  merge(
    frustum(
      [side * 0.13, -0.14, side * 0.4, 0.14],
      [side * 0.15, -0.115, side * 0.34, 0.115],
      0.9,
      1.0,
      'tint',
    ),
    frustum(
      [side * 0.14, -0.125, side * 0.375, 0.125],
      [side * 0.13, -0.14, side * 0.4, 0.14],
      0.8,
      0.9,
      'tint',
    ),
    frustum(
      [side * 0.32 - 0.05, -0.048, side * 0.32 + 0.05, 0.048],
      [side * 0.32 - 0.062, -0.058, side * 0.32 + 0.062, 0.058],
      0.72,
      0.94,
      'garment',
    ),
  );

const tabard = (): Mesh =>
  merge(
    frustum([-0.132, 0.16, 0.132, 0.196], [-0.1, 0.138, 0.1, 0.168], 0.44, 0.93, 'garment'),
    frustum([-0.06, 0.158, 0.06, 0.2], [-0.055, 0.156, 0.055, 0.198], 0.46, 0.54, 'playerAccent'),
  );

const helm = (): Mesh =>
  merge(
    cylinder([0, 0], [0.108, 0.1], 1.1, 1.19, 'tint', 'body', 8, [0.127, 0.118]),
    cylinder([0, 0], [0.127, 0.118], 1.19, 1.3, 'tint', 'body', 8, [0.123, 0.114]),
    cylinder([0, 0], [0.123, 0.114], 1.3, 1.37, 'tint', 'body', 8, [0.088, 0.082]),
    ellipsoid([0, 0, 1.37], [0.088, 0.082, 0.055], 'tint', 'body', 8, 3),
    box([-0.085, 0.108, 1.2], [0.085, 0.124, 1.25], 'floor'),
    box([-0.022, -0.085, 1.4], [0.022, 0.095, 1.5], 'playerAccent'),
  );

const shield = (): Mesh =>
  merge(
    frustum([-0.55, -0.028, -0.44, 0.228], [-0.55, -0.04, -0.44, 0.24], 0.34, 0.42, 'tint', 'shield'),
    frustum([-0.55, -0.04, -0.44, 0.24], [-0.55, -0.028, -0.44, 0.228], 1.04, 1.12, 'tint', 'shield'),
    box([-0.55, -0.04, 0.42], [-0.44, 0.24, 1.04], 'tint', 'shield'),
    box([-0.585, 0.02, 0.4], [-0.535, 0.18, 1.06], 'tint', 'shield'),
    box([-0.455, 0.02, 0.4], [-0.405, 0.18, 1.06], 'tint', 'shield'),
    box([-0.56, -0.05, 1.06], [-0.43, 0.25, 1.115], 'playerAccent', 'shield'),
    box([-0.56, -0.05, 0.345], [-0.43, 0.25, 0.395], 'playerAccent', 'shield'),
    ellipsoid([-0.495, -0.05, 0.73], [0.058, 0.048, 0.058], 'playerAccent', 'shield', 8, 3),
  );

const halberd = (): Mesh =>
  merge(
    box([0.3, -0.05, 0.63], [0.46, 0.05, 0.73], 'garment', 'weapon'),
    box([0.44, -0.06, 0.6], [0.56, 0.06, 0.74], 'tint', 'weapon'),
    frustum([0.478, -0.023, 0.527, 0.023], [0.475, -0.028, 0.53, 0.028], -0.28, 0.6, 'garment', 'weapon'),
    frustum([0.475, -0.028, 0.53, 0.028], [0.478, -0.024, 0.527, 0.024], 0.6, 1.5, 'garment', 'weapon'),
    box([0.53, -0.026, 1.14], [0.73, 0.026, 1.38], 'hudText', 'weapon'),
    box([0.395, -0.024, 1.2], [0.475, 0.024, 1.33], 'hudText', 'weapon'),
    box([0.487, -0.024, 1.5], [0.518, 0.024, 1.74], 'hudText', 'weapon'),
  );

const GUARD_MESH: Mesh = merge(
  leg(-1, 'legTrail'),
  leg(1, 'legLead'),
  cuirass(),
  pauldron(-1),
  pauldron(1),
  tabard(),
  helm(),
  shield(),
  halberd(),
);

export const MESH_GUARD: ModelDef = /* @__PURE__ */ (() => ({
  id: 'mesh_guard',
  heightPx: 43.5,
  widthScale: 1,
  shapes: [],
  mesh: GUARD_MESH,
  meshPivots: {
    weapon: [0.5, 0.0, 0.68],
    shield: [-0.49, 0.1, 0.72],
    hip: [0, 0, HIP_Z],
  },
}))();
