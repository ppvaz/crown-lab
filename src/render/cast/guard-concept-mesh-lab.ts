
import type { Mesh } from '../mesh';
import { box, cylinder, ellipsoid, frustum, merge } from '../mesh';
import type { ModelDef } from '../models';

const HIP_Z = 0.58;

const STANCE = 0.135;

const leg = (side: number, part: 'legLead' | 'legTrail'): Mesh => {
  const x = side * STANCE;
  return merge(
    frustum(
      [x - 0.08, -0.075, x + 0.08, 0.075],
      [x - 0.09, -0.085, x + 0.09, 0.085],
      0.3,
      HIP_Z,
      'garment',
      part,
    ),
    frustum(
      [x - 0.085, -0.08, x + 0.085, 0.08],
      [x - 0.095, -0.09, x + 0.095, 0.09],
      0.08,
      0.3,
      'floor',
      part,
    ),
    frustum(
      [x - 0.09, -0.078, x + 0.09, 0.17],
      [x - 0.1, -0.085, x + 0.1, 0.11],
      0,
      0.08,
      'floor',
      part,
    ),
  );
};

const HEM_Z = 0.34;
const COLLAR_Z = 0.95;
const drape = (): Mesh =>
  merge(
    cylinder([0, 0], [0.34, 0.25], HEM_Z - 0.045, HEM_Z, 'floor', 'body', 6, [0.34, 0.25]),
    cylinder(
      [0, 0],
      [0.34, 0.25],
      HEM_Z,
      HEM_Z + 0.045,
      'playerAccent',
      'body',
      6,
      [0.32, 0.235],
    ),
    cylinder([0, 0], [0.32, 0.235], HEM_Z + 0.045, 0.62, 'tint', 'body', 6, [0.27, 0.2]),
    cylinder([0, 0], [0.27, 0.2], 0.62, COLLAR_Z, 'tint', 'body', 6, [0.155, 0.12]),
    cylinder([0, 0], [0.225, 0.166], 0.6, 0.645, 'playerAccent', 'body', 6, [0.222, 0.163]),
    cylinder([0, 0], [0.135, 0.115], COLLAR_Z, 1.03, 'garment', 'body', 8, [0.118, 0.1]),
  );

const pauldron = (side: number): Mesh =>
  merge(
    frustum(
      [side * 0.13, -0.14, side * 0.4, 0.14],
      [side * 0.15, -0.115, side * 0.34, 0.115],
      0.95,
      1.05,
      'tint',
    ),
    frustum(
      [side * 0.14, -0.125, side * 0.375, 0.125],
      [side * 0.13, -0.14, side * 0.4, 0.14],
      0.85,
      0.95,
      'tint',
    ),
    frustum(
      [side * 0.32 - 0.05, -0.048, side * 0.32 + 0.05, 0.048],
      [side * 0.32 - 0.062, -0.058, side * 0.32 + 0.062, 0.058],
      0.76,
      0.98,
      'garment',
    ),
  );

const helm = (): Mesh =>
  merge(
    cylinder([0, 0], [0.108, 0.1], 1.03, 1.12, 'tint', 'body', 8, [0.127, 0.118]),
    cylinder([0, 0], [0.127, 0.118], 1.12, 1.23, 'tint', 'body', 8, [0.123, 0.114]),
    cylinder([0, 0], [0.123, 0.114], 1.23, 1.3, 'tint', 'body', 8, [0.07, 0.065]),
    cylinder([0, 0], [0.07, 0.065], 1.3, 1.36, 'tint', 'body', 8, [0.012, 0.012]),
    box([-0.018, 0.1, 1.06], [0.018, 0.118, 1.2], 'floor'),
    box([-0.07, 0.1, 1.14], [0.07, 0.118, 1.165], 'floor'),
    frustum([-0.032, -0.03, 0.032, 0.03], [-0.004, -0.004, 0.004, 0.004], 1.36, 1.5, 'playerAccent'),
  );

const shield = (): Mesh =>
  merge(
    frustum([-0.55, -0.03, -0.44, 0.23], [-0.55, -0.045, -0.44, 0.245], 0.34, 0.42, 'tint', 'shield'),
    frustum([-0.55, -0.045, -0.44, 0.245], [-0.55, -0.03, -0.44, 0.23], 1.05, 1.13, 'tint', 'shield'),
    box([-0.55, -0.045, 0.42], [-0.44, 0.245, 1.05], 'tint', 'shield'),
    box([-0.59, 0.02, 0.4], [-0.535, 0.19, 1.07], 'tint', 'shield'),
    box([-0.455, 0.02, 0.4], [-0.4, 0.19, 1.07], 'tint', 'shield'),
    box([-0.6, -0.055, 1.07], [-0.42, 0.26, 1.13], 'playerAccent', 'shield'),
    box([-0.6, -0.055, 0.335], [-0.42, 0.26, 0.395], 'playerAccent', 'shield'),
    ellipsoid([-0.495, -0.05, 0.73], [0.075, 0.04, 0.1], 'playerAccent', 'shield', 4, 2),
  );

const halberd = (): Mesh =>
  merge(
    box([0.3, -0.05, 0.63], [0.46, 0.05, 0.73], 'garment', 'weapon'),
    box([0.44, -0.06, 0.6], [0.56, 0.06, 0.74], 'floor', 'weapon'),
    frustum([0.478, -0.023, 0.527, 0.023], [0.475, -0.028, 0.53, 0.028], -0.28, 0.6, 'garment', 'weapon'),
    frustum([0.475, -0.028, 0.53, 0.028], [0.478, -0.024, 0.527, 0.024], 0.6, 1.5, 'garment', 'weapon'),
    box([0.53, -0.026, 1.14], [0.73, 0.026, 1.38], 'hudText', 'weapon'),
    box([0.395, -0.024, 1.2], [0.475, 0.024, 1.33], 'hudText', 'weapon'),
    cylinder([0.5025, 0], [0.034, 0.034], 1.42, 1.46, 'playerAccent', 'weapon', 8),
    box([0.487, -0.024, 1.46], [0.518, 0.024, 1.74], 'hudText', 'weapon'),
  );

const GUARD_CONCEPT_MESH: Mesh = merge(
  leg(-1, 'legTrail'),
  leg(1, 'legLead'),
  drape(),
  pauldron(-1),
  pauldron(1),
  helm(),
  shield(),
  halberd(),
);

export const MESH_GUARD_CONCEPT: ModelDef = /* @__PURE__ */ (() => ({
  id: 'mesh_guard_concept',
  heightPx: 43.5,
  widthScale: 1,
  shapes: [],
  mesh: GUARD_CONCEPT_MESH,
  meshPivots: {
    weapon: [0.5, 0.0, 0.68],
    shield: [-0.495, 0.1, 0.73],
    hip: [0, 0, HIP_Z],
  },
}))();
