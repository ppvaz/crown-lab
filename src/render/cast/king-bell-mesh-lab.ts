
import type { Mesh, Vec3 } from '../mesh';
import { box, cylinder, ellipsoid, frustum, merge, pitched, pitchedPoint, translated } from '../mesh';
import type { ModelDef } from '../models';

const HIP_Z = 0.5;

const STANCE = 0.1;

const leg = (side: number, part: 'legLead' | 'legTrail'): Mesh => {
  const x = side * STANCE;
  return merge(
    frustum(
      [x - 0.07, -0.062, x + 0.07, 0.062],
      [x - 0.05, -0.046, x + 0.05, 0.046],
      0.14,
      HIP_Z,
      'garment',
      part,
    ),
    box([x - 0.078, -0.07, 0], [x + 0.078, 0.11, 0.15], 'floor', part),
  );
};

const BELL_HEM_Z = 0.42;
const BELL_SHOULDER_Z = 1.22;

const bell = (): Mesh =>
  merge(
    cylinder([0, 0], [0.44, 0.25], BELL_HEM_Z - 0.06, BELL_HEM_Z, 'floor', 'body', 8, [0.44, 0.25]),
    cylinder([0, 0], [0.44, 0.25], BELL_HEM_Z, BELL_HEM_Z + 0.05, 'playerAccent', 'body', 8, [0.42, 0.24]),
    cylinder([0, 0], [0.42, 0.24], BELL_HEM_Z + 0.05, BELL_SHOULDER_Z, 'player', 'body', 8, [0.24, 0.14]),
    frustum([-0.13, 0.18, 0.13, 0.26], [-0.09, 0.1, 0.09, 0.16], BELL_HEM_Z + 0.05, BELL_SHOULDER_Z, 'garment'),
    frustum([0.126, 0.175, 0.17, 0.252], [0.087, 0.096, 0.123, 0.154], BELL_HEM_Z + 0.05, BELL_SHOULDER_Z, 'playerAccent'),
    frustum([-0.17, 0.175, -0.126, 0.252], [-0.123, 0.096, -0.087, 0.154], BELL_HEM_Z + 0.05, BELL_SHOULDER_Z, 'playerAccent'),
    box([-0.13, 0.19, 0.98], [0.13, 0.225, 1.012], 'playerAccent'),
    box([-0.13, 0.19, 1.06], [0.13, 0.225, 1.092], 'playerAccent'),
    frustum([-0.09, -0.27, 0.09, -0.19], [-0.06, -0.17, 0.06, -0.105], BELL_HEM_Z + 0.05, BELL_SHOULDER_Z, 'garment'),
    box([-0.1, -0.19, 1.13], [0.1, -0.145, 1.17], 'playerAccent'),
  );

const sideFlap = (): Mesh =>
  merge(
    frustum(
      [-0.4, 0.13, -0.13, 0.28],
      [-0.23, 0.06, -0.09, 0.18],
      BELL_HEM_Z + 0.03,
      BELL_SHOULDER_Z,
      'player',
      'cape',
    ),
    frustum(
      [-0.44, 0.12, -0.385, 0.285],
      [-0.25, 0.05, -0.222, 0.185],
      BELL_HEM_Z + 0.03,
      BELL_SHOULDER_Z,
      'playerAccent',
      'cape',
    ),
    translated(
      merge(
        pitched(cylinder([0, 0], [0.055, 0.055], -0.016, 0.016, 'playerAccent', 'cape', 8), Math.PI / 2, [0, 0, 0]),
        pitched(cylinder([0, 0], [0.032, 0.032], -0.02, 0.02, 'player', 'cape', 8), Math.PI / 2, [0, 0, 0]),
      ),
      [-0.11, 0.225, 1.035],
    ),
  );

const freeArm = (): Mesh =>
  merge(
    frustum(
      [-0.27, -0.05, -0.15, 0.05],
      [-0.24, -0.052, -0.18, 0.052],
      0.78,
      1.16,
      'garment',
      'armLead',
    ),
    ellipsoid([-0.21, 0, 0.72], [0.045, 0.042, 0.045], 'playerFace', 'armLead', 6, 3),
  );

const head = (): Mesh =>
  merge(
    cylinder([0, 0], [0.075, 0.07], BELL_SHOULDER_Z, BELL_SHOULDER_Z + 0.06, 'garment', 'body', 6, [
      0.07, 0.065,
    ]),
    ellipsoid([0, 0, 1.46], [0.115, 0.105, 0.14], 'playerFace', 'body', 8, 6),
    cylinder([0, 0], [0.145, 0.135], 1.56, 1.62, 'playerAccent', 'body', 8, [0.145, 0.135]),
    frustum([-0.14, -0.032, -0.078, 0.032], [-0.126, -0.02, -0.092, 0.02], 1.62, 1.72, 'playerAccent'),
    frustum([-0.034, -0.036, 0.034, 0.036], [-0.018, -0.022, 0.018, 0.022], 1.62, 1.8, 'playerAccent'),
    frustum([0.078, -0.032, 0.14, 0.032], [0.092, -0.02, 0.126, 0.02], 1.62, 1.72, 'playerAccent'),
  );

const HAND: Vec3 = [0.29, 0, 0.66];
const SHOULDER: Vec3 = [0.24, 0, BELL_SHOULDER_Z];
const BLADE_RAISE = 2.2689;
const ARM_FORWARD = 0.7;

const greatsword = (): Mesh => {
  const armAndHand = merge(
    frustum([0.2, -0.048, 0.3, 0.048], [0.18, -0.055, 0.28, 0.055], 0.76, BELL_SHOULDER_Z, 'garment', 'armTrail'),
    ellipsoid(HAND, [0.048, 0.045, 0.05], 'playerFace', 'weapon', 6, 3),
  );
  const bladeGroup = pitched(
    merge(
      box([0.2, -0.032, 0.53], [0.38, 0.032, 0.575], 'playerAccent', 'weapon'),
      box([0.27, -0.026, 0.6], [0.31, 0.026, 0.72], 'garment', 'weapon'),
      ellipsoid([0.29, 0, 0.735], [0.038, 0.038, 0.038], 'playerAccent', 'weapon', 6, 3),
      frustum([0.255, -0.026, 0.325, 0.026], [0.272, -0.011, 0.308, 0.011], 0.02, 0.55, 'hudText', 'weapon'),
    ),
    BLADE_RAISE,
    HAND,
  );
  return pitched(merge(armAndHand, bladeGroup), ARM_FORWARD, SHOULDER);
};

const KING_BELL_MESH: Mesh = merge(
  leg(-1, 'legTrail'),
  leg(1, 'legLead'),
  bell(),
  sideFlap(),
  freeArm(),
  head(),
  greatsword(),
);

export const MESH_KING_BELL: ModelDef = /* @__PURE__ */ (() => ({
  id: 'mesh_king_bell',
  heightPx: 66,
  widthScale: 1,
  shapes: [],
  flatArticulation: { weapon: { pivot: [0.33, 0.7], rotationScale: 0.5, releaseScale: 2.75 } },
  mesh: KING_BELL_MESH,
  meshPivots: {
    weapon: pitchedPoint(HAND, ARM_FORWARD, SHOULDER),
    weaponArmPhase: 'trail',
    arm: [0, 0, BELL_SHOULDER_Z - 0.06],
    hip: [0, 0, HIP_Z],
    cape: [0, 0.12, BELL_SHOULDER_Z - 0.02],
    waist: [0, 0, HIP_Z],
  },
}))();
