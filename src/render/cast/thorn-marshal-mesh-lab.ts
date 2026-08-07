
import type { Mesh, Vec3 } from '../mesh';
import { box, cylinder, ellipsoid, merge, pitched, rolled } from '../mesh';
import type { ModelDef } from '../models';

const HIP_Z = 0.56;

const STANCE = 0.14;

const leg = (side: number, part: 'legLead' | 'legTrail'): Mesh => {
  const x = side * STANCE;
  return merge(
    box([x - 0.088, -0.082, 0.28], [x + 0.088, 0.082, HIP_Z], 'garment', part),
    box([x - 0.096, -0.088, 0.07], [x + 0.096, 0.092, 0.3], 'tint', part),
    box([x - 0.094, -0.078, 0], [x + 0.094, 0.16, 0.08], 'garment', part),
  );
};

const torso = (): Mesh =>
  merge(
    cylinder([0, 0], [0.24, 0.17], HIP_Z, 1.0, 'tint', 'body', 6),
    cylinder([0, 0], [0.27, 0.19], 0.5, 0.62, 'tint', 'body', 6),
    box([-0.17, 0.16, 0.66], [0.17, 0.19, 0.98], 'garment'),
    box([-0.245, -0.175, 0.6], [0.245, 0.175, 0.65], 'garment'),
    box([-0.035, 0.165, 0.6], [0.035, 0.195, 0.65], 'hudText'),
    box([-0.12, 0.15, 0.18], [0.12, 0.18, 0.6], 'tint'),
    box([-0.04, 0.175, 0.34], [0.04, 0.195, 0.42], 'hudText'),
  );

const pauldron = (side: number): Mesh =>
  merge(
    ellipsoid([side * 0.29, 0, 0.97], [0.14, 0.125, 0.1], 'tint', 'body', 5, 2),
    box([side * 0.29 - 0.13, -0.1, 1.02], [side * 0.29 + 0.13, 0.1, 1.07], 'hudText'),
    box([side * 0.33 - 0.06, -0.055, 0.7], [side * 0.33 + 0.06, 0.055, 0.94], 'garment'),
  );

const helm = (): Mesh =>
  merge(
    box([-0.13, -0.12, 1.06], [0.13, 0.125, 1.32], 'tint'),
    ellipsoid([0, 0, 1.32], [0.13, 0.12, 0.07], 'tint', 'body', 5, 2),
    box([-0.09, 0.125, 1.15], [0.09, 0.137, 1.2], 'floor'),
  );

const FAN_MOUNT: Vec3 = [0, -0.16, 0.9];
const FAN: Array<[degrees: number, length: number]> = [
  [-80, 0.72],
  [-60, 0.68],
  [-40, 0.66],
  [-20, 0.62],
  [0, 0.6],
  [20, 0.62],
  [40, 0.66],
  [60, 0.68],
  [80, 0.72],
];
const fan = (): Mesh =>
  merge(
    ...FAN.map(([degrees, length]) =>
      rolled(
        merge(
          box([-0.022, -0.185, 0.96], [0.022, -0.135, 0.9 + length], 'garment'),
          box([-0.034, -0.18, 0.9 + length], [0.034, -0.14, 0.9 + length + 0.12], 'hudText'),
        ),
        (degrees * Math.PI) / 180,
        FAN_MOUNT,
      ),
    ),
  );

const PIKE_GRIP: Vec3 = [0.17, 0.3, 0.78];
const pike = (): Mesh =>
  pitched(
    merge(
      box([0.12, 0.04, 0.72], [0.25, 0.26, 0.82], 'garment', 'weapon'),
      box([0.17 - 0.028, -1.0, 0.755], [0.17 + 0.028, 1.62, 0.805], 'tint', 'weapon'),
      ellipsoid([0.17, 0.3, 0.78], [0.055, 0.065, 0.055], 'garment', 'weapon', 5, 2),
      ellipsoid([0.17, -0.2, 0.78], [0.05, 0.06, 0.05], 'garment', 'weapon', 5, 2),
      box([0.17 - 0.014, 1.62, 0.766], [0.17 + 0.014, 1.98, 0.794], 'hudText', 'weapon'),
      box([0.17 - 0.05, -1.24, 0.75], [0.17 + 0.05, -1.0, 0.81], 'hudText', 'weapon'),
      box([0.17 - 0.016, 0.62, 0.805], [0.17 + 0.016, 0.7, 0.86], 'tint', 'weapon'),
      box([0.17 - 0.016, 1.06, 0.805], [0.17 + 0.016, 1.14, 0.87], 'tint', 'weapon'),
      box([0.17 - 0.016, 1.4, 0.805], [0.17 + 0.016, 1.46, 0.86], 'tint', 'weapon'),
    ),
    -0.08,
    PIKE_GRIP,
  );

const THORN_MARSHAL_MESH: Mesh = merge(
  leg(-1, 'legTrail'),
  leg(1, 'legLead'),
  torso(),
  pauldron(-1),
  pauldron(1),
  helm(),
  fan(),
  pike(),
);

export const MESH_THORN_MARSHAL: ModelDef = /* @__PURE__ */ (() => ({
  id: 'mesh_thorn_marshal',
  heightPx: 56,
  widthScale: 1,
  shapes: [],
  mesh: THORN_MARSHAL_MESH,
  meshPivots: {
    weapon: PIKE_GRIP,
    hip: [0, 0, HIP_Z],
  },
}))();
