
import type { Mesh, Vec3 } from '../mesh';
import { box, cylinder, ellipsoid, merge, pitched, rolled } from '../mesh';
import type { ModelDef } from '../models';

const HIP_Z = 0.56;

const STANCE = 0.115;

const leg = (side: number, part: 'legLead' | 'legTrail'): Mesh => {
  const x = side * STANCE;
  return merge(
    box([x - 0.075, -0.07, 0.3], [x + 0.075, 0.07, HIP_Z], 'garment', part),
    box([x - 0.08, -0.075, 0.32], [x + 0.08, 0.075, 0.36], 'playerAccent', part),
    box([x - 0.08, -0.075, 0.08], [x + 0.08, 0.078, 0.32], 'garment', part),
    box([x - 0.078, -0.07, 0], [x + 0.078, 0.14, 0.08], 'garment', part),
  );
};

const core = (): Mesh =>
  merge(
    cylinder([0, 0], [0.21, 0.15], HIP_Z, 1.28, 'garment', 'body', 6),
    cylinder([0, 0], [0.26, 0.19], 0.48, 0.6, 'garment', 'body', 6),
    box([-0.2, 0.16, 0.48], [0.2, 0.19, 0.52], 'playerAccent'),
    box([-0.22, -0.155, 0.66], [0.22, 0.155, 0.71], 'playerAccent'),
    box([-0.07, 0.15, 0.18], [0.07, 0.18, 0.64], 'hudText'),
    ellipsoid([0, 0.18, 0.44], [0.045, 0.02, 0.07], 'playerAccent', 'body', 4, 2),
  );

const mantle = (): Mesh =>
  merge(
    box([-0.29, 0.125, 0.44], [-0.07, 0.18, 1.26], 'hudText'),
    box([0.07, 0.125, 0.44], [0.29, 0.18, 1.26], 'hudText'),
    box([-0.28, -0.2, 0.2], [0.28, -0.128, 1.26], 'tint'),
    box([-0.36, -0.1, 1.22], [-0.13, 0.1, 1.3], 'hudText'),
    box([0.13, -0.1, 1.22], [0.36, 0.1, 1.3], 'hudText'),
    box([-0.17, 0.12, 1.21], [0.17, 0.185, 1.26], 'playerAccent'),
  );

const head = (): Mesh =>
  merge(
    cylinder([0, 0], [0.085, 0.075], 1.28, 1.36, 'garment', 'body', 6),
    box([-0.1, -0.09, 1.36], [0.1, 0.095, 1.6], 'hudText'),
    box([-0.07, 0.095, 1.47], [0.07, 0.107, 1.51], 'floor'),
  );

const HALO_CENTRE: Vec3 = [0, -0.14, 1.62];
const halo = (): Mesh =>
  merge(
    ...Array.from({ length: 8 }, (_, i) =>
      rolled(
        box([-0.075, -0.155, 1.9], [0.075, -0.125, 1.94], 'playerAccent'),
        (i * Math.PI) / 4,
        HALO_CENTRE,
      ),
    ),
    ...[-90, -54, -18, 18, 54, 90].map((degrees) =>
      rolled(
        box([-0.016, -0.152, 1.95], [0.016, -0.128, 2.04], 'playerAccent'),
        (degrees * Math.PI) / 180,
        HALO_CENTRE,
      ),
    ),
  );

const SWORD_HAND: Vec3 = [0.33, 0.02, 0.66];
const sword = (): Mesh =>
  pitched(
    merge(
      box([0.24, -0.05, 0.86], [0.35, 0.05, 1.22], 'garment'),
      box([0.28, -0.045, 0.68], [0.38, 0.045, 0.88], 'garment', 'weapon'),
      box([0.22, -0.035, 0.62], [0.44, 0.035, 0.67], 'playerAccent', 'weapon'),
      ellipsoid([0.33, 0, 0.7], [0.035, 0.035, 0.035], 'playerAccent', 'weapon', 4, 2),
      box([0.33 - 0.048, -0.018, 0.04], [0.33 + 0.048, 0.018, 0.62], 'hudText', 'weapon'),
    ),
    -0.22,
    SWORD_HAND,
  );

const QUEEN_MESH: Mesh = merge(
  leg(-1, 'legTrail'),
  leg(1, 'legLead'),
  core(),
  mantle(),
  head(),
  halo(),
  sword(),
);

export const MESH_QUEEN: ModelDef = /* @__PURE__ */ (() => ({
  id: 'mesh_queen_regalia',
  heightPx: 58,
  widthScale: 1,
  shapes: [],
  mesh: QUEEN_MESH,
  meshPivots: {
    weapon: SWORD_HAND,
    hip: [0, 0, HIP_Z],
  },
}))();
