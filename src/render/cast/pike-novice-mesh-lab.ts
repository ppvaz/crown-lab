
import type { Mesh, Vec3 } from '../mesh';
import { box, cylinder, ellipsoid, merge, pitched } from '../mesh';
import type { ModelDef } from '../models';

const HIP_Z = 0.56;

const STANCE = 0.125;

const leg = (side: number, part: 'legLead' | 'legTrail'): Mesh => {
  const x = side * STANCE;
  return merge(
    box([x - 0.08, -0.078, 0.28], [x + 0.08, 0.078, HIP_Z], 'garment', part),
    box([x - 0.086, -0.082, 0.08], [x + 0.086, 0.086, 0.3], 'tint', part),
    box([x - 0.086, -0.072, 0], [x + 0.086, 0.15, 0.07], 'garment', part),
  );
};

const torso = (): Mesh =>
  merge(
    cylinder([0, 0], [0.195, 0.14], HIP_Z, 0.98, 'tint', 'body', 6),
    box([-0.1, 0.135, 0.34], [0.1, 0.165, 0.88], 'garment'),
    box([-0.21, -0.15, 0.6], [0.21, 0.15, 0.65], 'garment'),
  );

const pauldron = (side: number): Mesh =>
  merge(
    box([side * 0.26 - 0.07, -0.09, 0.88], [side * 0.26 + 0.07, 0.09, 0.97], 'tint'),
    box([side * 0.27 - 0.05, -0.05, 0.66], [side * 0.27 + 0.05, 0.05, 0.9], 'garment'),
  );

const helm = (): Mesh =>
  merge(
    cylinder([0, 0], [0.1, 0.09], 0.98, 1.04, 'garment', 'body', 6),
    box([-0.115, -0.105, 1.04], [0.115, 0.11, 1.27], 'tint'),
    box([-0.135, -0.125, 1.24], [0.135, 0.13, 1.28], 'tint'),
    box([-0.08, 0.11, 1.12], [0.08, 0.122, 1.16], 'floor'),
  );

const PIKE_GRIP: Vec3 = [0.16, 0.28, 0.82];
const pike = (): Mesh =>
  pitched(
    merge(
      box([0.11, 0.02, 0.76], [0.24, 0.24, 0.86], 'garment', 'weapon'),
      box([0.16 - 0.026, -0.62, 0.795], [0.16 + 0.026, 1.32, 0.845], 'garment', 'weapon'),
      ellipsoid([0.16, 0.28, 0.82], [0.05, 0.06, 0.05], 'tint', 'weapon', 5, 2),
      ellipsoid([0.16, -0.18, 0.82], [0.045, 0.055, 0.045], 'tint', 'weapon', 5, 2),
      box([0.16 - 0.012, 1.32, 0.77], [0.16 + 0.012, 1.52, 0.87], 'hudText', 'weapon'),
      box([0.16 - 0.008, 1.08, 0.84], [0.16 + 0.008, 1.26, 0.93], 'tint', 'weapon'),
    ),
    -0.24,
    PIKE_GRIP,
  );

const PIKE_NOVICE_MESH: Mesh = merge(
  leg(-1, 'legTrail'),
  leg(1, 'legLead'),
  torso(),
  pauldron(-1),
  pauldron(1),
  helm(),
  pike(),
);

export const MESH_PIKE_NOVICE: ModelDef = /* @__PURE__ */ (() => ({
  id: 'mesh_pike_novice',
  heightPx: 53,
  widthScale: 1,
  shapes: [],
  mesh: PIKE_NOVICE_MESH,
  meshPivots: {
    weapon: PIKE_GRIP,
    hip: [0, 0, HIP_Z],
  },
}))();
