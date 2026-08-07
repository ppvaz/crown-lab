
export interface FramePair {
  name: string;
  world: [number, number];
  panel: [number, number];
}

export interface FrameResidual {
  name: string;
  panel: [number, number];
  fitted: [number, number];
  dx: number;
  dy: number;
  d: number;
}

export interface FittedFrame {
  dof: number;
  project: (world: [number, number]) => [number, number];
  points: FrameResidual[];
  worst: number;
  rms: number;
  residualSpread: number;
}

export interface RuntimeFrame extends FittedFrame {
  kind: 'runtime';
  scale: number;
  origin: [number, number];
}

export interface AffineFrame extends FittedFrame {
  kind: 'affine';
  coeffs: { x: number[]; y: number[] };
}

export function fitRuntimeFrame(
  pairs: FramePair[],
  proj: { isoX: number; isoY: number },
): RuntimeFrame;
export function fitAffineFrame(pairs: FramePair[]): AffineFrame;
export function floorCornerPairs(
  corners: {
    left: [number, number];
    right: [number, number];
    far: [number, number];
    near: [number, number];
  },
  halfExtents: { x: number; y: number },
): FramePair[];
export function budgetReport(
  runtime: { worst: number },
  affine: { worst: number },
  shorterSide: number,
  budget: number,
): {
  deviation: number;
  floor: number;
  available: number;
  availablePx: number;
  passes: boolean;
  reachable: boolean;
};
