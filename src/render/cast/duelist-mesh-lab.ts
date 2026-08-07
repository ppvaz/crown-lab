
import type { Mesh, Vec3 } from '../mesh';
import { box, cylinder, ellipsoid, frustum, merge, pitched, translated } from '../mesh';
import type { ModelDef } from '../models';

const HIP_Z = 0.62;

const STANCE = 0.13;

const leg = (side: number, part: 'legLead' | 'legTrail'): Mesh => {
  const x = side * STANCE;
  return merge(
    frustum(
      [x - 0.055, -0.05, x + 0.055, 0.05],
      [x - 0.068, -0.062, x + 0.068, 0.062],
      0.36,
      HIP_Z,
      'tint',
      part,
    ),
    frustum(
      [x - 0.072, -0.066, x + 0.072, 0.066],
      [x - 0.066, -0.06, x + 0.066, 0.06],
      0.32,
      0.36,
      'playerAccent',
      part,
    ),
    frustum(
      [x - 0.058, -0.054, x + 0.058, 0.054],
      [x - 0.066, -0.06, x + 0.066, 0.06],
      0.05,
      0.32,
      'garment',
      part,
    ),
    frustum(
      [x - 0.06, -0.055, x + 0.06, 0.12],
      [x - 0.066, -0.058, x + 0.066, 0.075],
      0,
      0.05,
      'garment',
      part,
    ),
    frustum(
      [x - 0.045, 0.12, x + 0.045, 0.19],
      [x - 0.05, 0.08, x + 0.05, 0.12],
      0,
      0.045,
      'playerAccent',
      part,
    ),
  );
};

const HEM_Z = 0.44;
const SHOULDER_Z = 1.06;

const coat = (): Mesh =>
  merge(
    cylinder([0, 0], [0.235, 0.17], HEM_Z, HEM_Z + 0.035, 'playerAccent', 'body', 6, [0.225, 0.16]),
    cylinder([0, 0], [0.225, 0.16], HEM_Z + 0.035, 0.78, 'tint', 'body', 6, [0.15, 0.11]),
    frustum([-0.055, 0.15, 0.055, 0.185], [-0.018, 0.095, 0.018, 0.125], HEM_Z + 0.035, 0.78, 'garment'),
    cylinder([0, 0], [0.15, 0.11], 0.78, SHOULDER_Z, 'tint', 'body', 6, [0.185, 0.13]),
    frustum([0.08, -0.03, 0.17, 0.06], [0.14, -0.005, 0.185, 0.04], SHOULDER_Z - 0.02, 1.14, 'tint'),
    frustum([-0.17, -0.03, -0.08, 0.06], [-0.185, -0.005, -0.14, 0.04], SHOULDER_Z - 0.02, 1.14, 'tint'),
  );

const baldric = (): Mesh =>
  merge(
    frustum([-0.14, 0.11, -0.05, 0.15], [0.09, 0.11, 0.175, 0.15], 0.77, SHOULDER_Z, 'playerAccent'),
    ellipsoid([-0.085, 0.125, 0.98], [0.05, 0.03, 0.065], 'playerAccent', 'body', 4, 2),
    ellipsoid([-0.085, 0.14, 0.98], [0.026, 0.022, 0.034], 'hudText', 'body', 4, 2),
  );

const freeArm = (): Mesh =>
  merge(
    frustum(
      [-0.37, -0.095, -0.27, 0.005],
      [-0.26, -0.05, -0.16, 0.05],
      0.7,
      SHOULDER_Z - 0.02,
      'garment',
      'armLead',
    ),
    frustum(
      [-0.34, -0.085, -0.25, 0.02],
      [-0.315, -0.075, -0.225, 0.03],
      0.84,
      0.88,
      'playerAccent',
      'armLead',
    ),
    ellipsoid([-0.325, -0.05, 0.655], [0.045, 0.042, 0.05], 'floor', 'armLead', 6, 3),
  );

const swordArm = (): Mesh =>
  merge(
    frustum(
      [0.23, -0.05, 0.32, 0.05],
      [0.16, -0.05, 0.26, 0.05],
      0.8,
      SHOULDER_Z - 0.02,
      'garment',
      'armTrail',
    ),
    frustum(
      [0.235, -0.055, 0.32, 0.055],
      [0.215, -0.045, 0.3, 0.045],
      0.8,
      0.84,
      'playerAccent',
      'armTrail',
    ),
  );

const HAND: Vec3 = [0.3, 0.1, 0.56];

const RAPIER_LOW = 1.0;

const rapier = (): Mesh => {
  const forearm = merge(
    frustum([0.26, 0.05, 0.34, 0.15], [0.23, -0.045, 0.31, 0.045], 0.58, 0.8, 'garment', 'weapon'),
    ellipsoid([0.3, 0.1, 0.565], [0.048, 0.045, 0.05], 'floor', 'weapon', 6, 3),
  );
  const hilt = merge(
    frustum([0.295, 0.095, 0.305, 0.105], [0.283, 0.083, 0.317, 0.117], -0.39, 0.505, 'hudText', 'weapon'),
    cylinder([0.3, 0.1], [0.028, 0.028], 0.505, 0.535, 'playerAccent', 'weapon', 6),
    box([0.215, 0.08, 0.535], [0.385, 0.12, 0.575], 'playerAccent', 'weapon'),
    frustum([0.365, 0.08, 0.385, 0.12], [0.373, 0.084, 0.393, 0.116], 0.48, 0.535, 'playerAccent', 'weapon'),
    frustum([0.215, 0.08, 0.235, 0.12], [0.207, 0.084, 0.227, 0.116], 0.48, 0.535, 'playerAccent', 'weapon'),
    cylinder([0.3, 0.1], [0.021, 0.021], 0.575, 0.66, 'garment', 'weapon', 6),
    ellipsoid([0.3, 0.1, 0.685], [0.027, 0.027, 0.032], 'playerAccent', 'weapon', 6, 3),
  );
  return merge(forearm, pitched(hilt, RAPIER_LOW, HAND));
};

const head = (): Mesh =>
  merge(
    cylinder([0, 0], [0.075, 0.07], SHOULDER_Z, 1.18, 'garment', 'body', 6, [0.07, 0.065]),
    cylinder([0, 0], [0.122, 0.114], 1.16, 1.19, 'playerAccent', 'body', 8),
    cylinder([0, 0], [0.105, 0.1], 1.19, 1.28, 'tint', 'body', 8, [0.12, 0.112]),
    cylinder([0, 0], [0.12, 0.112], 1.28, 1.38, 'tint', 'body', 8, [0.095, 0.09]),
    ellipsoid([0, 0, 1.38], [0.095, 0.09, 0.05], 'tint', 'body', 8, 3),
    frustum([-0.012, 0.1, 0.012, 0.125], [-0.075, 0.075, 0.075, 0.13], 1.13, 1.19, 'hudText'),
    frustum([-0.075, 0.075, 0.075, 0.13], [-0.02, 0.09, 0.02, 0.135], 1.19, 1.35, 'hudText'),
    frustum([-0.02, 0.09, 0.02, 0.135], [-0.004, 0.1, 0.004, 0.112], 1.35, 1.53, 'hudText'),
    ellipsoid([0, 0.128, 1.27], [0.045, 0.016, 0.028], 'floor', 'body', 4, 2),
  );

const plume = (): Mesh =>
  merge(
    frustum([-0.035, -0.1, 0.035, 0.02], [-0.028, -0.24, 0.028, -0.1], 1.36, 1.56, 'tint', 'cape'),
    frustum([-0.028, -0.24, 0.028, -0.1], [-0.02, -0.44, 0.02, -0.29], 1.56, 1.6, 'tint', 'cape'),
    translated(
      pitched(
        frustum([-0.02, -0.03, 0.02, 0.03], [-0.007, -0.02, 0.007, 0.02], 0, 0.42, 'tint', 'cape'),
        2.6,
        [0, 0, 0],
      ),
      [0, -0.37, 1.58],
    ),
  );

const DUELIST_MESH: Mesh = merge(
  leg(-1, 'legTrail'),
  leg(1, 'legLead'),
  coat(),
  baldric(),
  freeArm(),
  swordArm(),
  head(),
  plume(),
  rapier(),
);

export const MESH_DUELIST: ModelDef = /* @__PURE__ */ (() => ({
  id: 'mesh_duelist',
  heightPx: 45,
  widthScale: 1,
  shapes: [],
  mesh: DUELIST_MESH,
  meshPivots: {
    weapon: HAND,
    weaponArmPhase: 'trail',
    arm: [0, 0, SHOULDER_Z - 0.04],
    hip: [0, 0, HIP_Z],
    cape: [0, -0.02, 1.37],
  },
}))();
