export function arenaFromCorners(
  corners: {
    left: [number, number];
    right: [number, number];
    far: [number, number];
    near: [number, number];
  },
  proj: { isoX: number; isoY: number },
  span: number,
): {
  hx: number;
  hy: number;
  ratio: number;
  square: boolean;
  residual: { span: number; skew: number };
  byAxis: { x: Reading; y: Reading };
  panelIso: number;
  estimates: Record<string, number>;
};
export interface Reading {
  hx: number;
  hy: number;
  ratio: number;
}
export function chamferedPolygon(
  hx: number,
  hy: number,
  cutX: number,
  cutY: number,
): { x: number; y: number }[];
export function projectToPanel(
  x: number,
  y: number,
  proj: { isoX: number; isoY: number },
  s: number,
  origin?: [number, number],
): [number, number];
