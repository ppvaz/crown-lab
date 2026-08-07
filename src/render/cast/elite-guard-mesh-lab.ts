
import type { Mesh, Vec3 } from '../mesh';
import { box, ellipsoid, frustum, merge } from '../mesh';
import type { ModelDef } from '../models';

const HIP_Z = 0.3;

const STANCE = 0.22;

const leg = (side: number, part: 'legLead' | 'legTrail'): Mesh => {
  const x = side * STANCE;
  return merge(
    frustum(
      [x - 0.095, -0.085, x + 0.095, 0.085],
      [x - 0.11, -0.1, x + 0.11, 0.1],
      0.08,
      HIP_Z,
      'garment',
      part,
    ),
    frustum(
      [x - 0.105, -0.09, x + 0.105, 0.17],
      [x - 0.11, -0.1, x + 0.11, 0.13],
      0,
      0.09,
      'tint',
      part,
    ),
  );
};

const torso = (): Mesh =>
  merge(
    frustum([-0.42, -0.32, 0.42, 0.32], [-0.5, -0.36, 0.5, 0.36], HIP_Z, 0.5, 'tint'),
    frustum([-0.5, -0.36, 0.5, 0.36], [-0.4, -0.3, 0.4, 0.3], 0.5, 0.78, 'tint'),
    box([-0.34, 0.28, 0.56], [0.34, 0.34, 0.64], 'garment'),
  );

const pauldron = (side: number): Mesh =>
  merge(
    frustum(
      [side * 0.38, -0.14, side * 0.9, 0.14],
      [side * 0.34, -0.1, side * 0.62, 0.1],
      0.62,
      0.82,
      'tint',
    ),
    frustum(
      [side * 0.34 - 0.07, -0.065, side * 0.34 + 0.07, 0.065],
      [side * 0.4 - 0.07, -0.07, side * 0.4 + 0.07, 0.07],
      0.5,
      0.66,
      'garment',
    ),
  );

const head = (): Mesh => box([-0.22, -0.2, 0.98], [0.22, 0.2, 1.26], 'hudDim');

const WEAPON_PIVOT: Vec3 = [0.5, 0.05, 0.5];
const sword = (): Mesh =>
  merge(
    frustum([0.36, -0.08, 0.56, 0.08], [0.32, -0.09, 0.6, 0.09], 0.4, 0.56, 'garment', 'weapon'),
    ellipsoid([0.5, 0, 0.55], [0.09, 0.07, 0.06], 'hudDim', 'weapon', 8, 3),
    box([0.4, -0.03, 0.5], [0.62, 0.03, 0.6], 'hudDim', 'weapon'),
    frustum(
      [0.55, -0.025, 0.68, 0.025],
      [0.6, -0.018, 0.75, 0.018],
      0.56,
      0.6,
      'hudText',
      'weapon',
    ),
    frustum(
      [0.6, -0.018, 0.75, 0.018],
      [0.98, -0.006, 1.02, 0.006],
      0.55,
      0.62,
      'hudText',
      'weapon',
    ),
  );

const SHIELD_PIVOT: Vec3 = [-0.5, 0.05, 0.58];
const shield = (): Mesh =>
  merge(
    box([-1.0, -0.02, 0.05], [-0.15, 0.1, 1.12], 'hudDim', 'shield'),
    box([-0.92, -0.11, 0.14], [-0.23, -0.02, 1.02], 'hudDim', 'shield'),
    box([-0.62, 0.1, 0.16], [-0.5, 0.13, 1.0], 'hudText', 'shield'),
    box([-0.58, 0.1, 0.16], [-0.55, 0.13, 1.0], 'garment', 'shield'),
    box([-0.95, -0.03, 1.02], [-0.2, 0.11, 1.14], 'garment', 'shield'),
    box([-0.9, -0.03, 0.02], [-0.25, 0.11, 0.13], 'garment', 'shield'),
    ellipsoid([-0.5, 0.08, 0.55], [0.08, 0.06, 0.06], 'hudDim', 'shield', 8, 3),
    frustum(
      [-0.62, -0.1, -0.4, 0.1],
      [-0.56, -0.08, -0.46, 0.08],
      0.5,
      0.64,
      'garment',
      'shield',
    ),
  );

const ELITE_GUARD_MESH: Mesh = merge(
  leg(-1, 'legTrail'),
  leg(1, 'legLead'),
  torso(),
  pauldron(-1),
  pauldron(1),
  head(),
  sword(),
  shield(),
);

export const MESH_ELITE_GUARD: ModelDef = /* @__PURE__ */ (() => ({
  id: 'mesh_elite_guard',
  heightPx: 64,
  widthScale: 1,
  shapes: [],
  mesh: ELITE_GUARD_MESH,
  meshPivots: {
    weapon: WEAPON_PIVOT,
    shield: SHIELD_PIVOT,
    hip: [0, 0, HIP_Z],
  },
}))();
