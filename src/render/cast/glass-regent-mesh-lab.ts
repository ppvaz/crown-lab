
import type { Mesh } from '../mesh';
import { box, cylinder, ellipsoid, merge } from '../mesh';
import type { ModelDef } from '../models';

const HIP_Z = 0.4;

const STANCE = 0.1;

const leg = (side: number, part: 'legLead' | 'legTrail'): Mesh => {
  const x = side * STANCE;
  return merge(
    box([x - 0.07, -0.065, 0.12], [x + 0.07, 0.065, HIP_Z], 'garment', part),
    box([x - 0.075, -0.07, 0], [x + 0.075, 0.13, 0.13], 'garment', part),
  );
};

const robe = (): Mesh =>
  merge(
    cylinder([0, 0], [0.3, 0.22], 0.24, 0.6, 'tint', 'body', 6),
    cylinder([0, 0], [0.245, 0.18], 0.6, 0.98, 'tint', 'body', 6),
    cylinder([0, 0], [0.2, 0.15], 0.98, 1.24, 'tint', 'body', 6),
    box([-0.09, 0.16, 0.26], [0.09, 0.2, 1.1], 'garment'),
    box([-0.115, 0.155, 0.26], [-0.085, 0.205, 1.1], 'hudText'),
    box([0.085, 0.155, 0.26], [0.115, 0.205, 1.1], 'hudText'),
    box([-0.15, -0.13, 1.24], [0.15, 0.14, 1.29], 'hudText'),
  );

const mantle = (): Mesh =>
  merge(
    ellipsoid([-0.24, 0, 1.22], [0.12, 0.11, 0.09], 'tint', 'body', 5, 2),
    ellipsoid([0.24, 0, 1.22], [0.12, 0.11, 0.09], 'tint', 'body', 5, 2),
    box([-0.27, -0.17, 0.7], [0.27, -0.11, 1.2], 'tint'),
  );

const head = (): Mesh =>
  merge(
    box([-0.09, -0.085, 1.29], [0.09, 0.095, 1.46], 'hudText'),
    ellipsoid([0, 0, 1.52], [0.135, 0.125, 0.16], 'tint', 'body', 6, 3),
    box([-0.028, -0.028, 1.64], [0.028, 0.028, 1.8], 'tint'),
  );

const crystals = (): Mesh =>
  merge(
    ellipsoid([-0.52, -0.02, 1.38], [0.1, 0.1, 0.2], 'hudText', 'body', 4, 2),
    ellipsoid([0.52, -0.02, 1.42], [0.09, 0.09, 0.18], 'hudText', 'body', 4, 2),
  );

const STAFF_HAND: [number, number, number] = [0.44, 0.02, 0.92];
const staff = (): Mesh =>
  merge(
    box([0.2, -0.04, 0.98], [0.42, 0.06, 1.18], 'tint'),
    box([0.44 - 0.025, -0.005, 0.08], [0.44 + 0.025, 0.045, 1.5], 'garment', 'weapon'),
    box([0.44 - 0.06, -0.005, 1.5], [0.44 - 0.02, 0.045, 1.66], 'garment', 'weapon'),
    box([0.44 + 0.02, -0.005, 1.5], [0.44 + 0.06, 0.045, 1.66], 'garment', 'weapon'),
    ellipsoid([0.44, 0.02, 1.62], [0.055, 0.055, 0.11], 'hudText', 'weapon', 4, 2),
  );

const GLASS_REGENT_MESH: Mesh = merge(
  leg(-1, 'legTrail'),
  leg(1, 'legLead'),
  robe(),
  mantle(),
  head(),
  crystals(),
  staff(),
);

export const MESH_GLASS_REGENT: ModelDef = /* @__PURE__ */ (() => ({
  id: 'mesh_glass_regent',
  heightPx: 60,
  widthScale: 1,
  shapes: [],
  mesh: GLASS_REGENT_MESH,
  meshPivots: {
    weapon: STAFF_HAND,
    hip: [0, 0, HIP_Z],
  },
}))();
