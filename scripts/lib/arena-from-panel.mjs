
/**
 * @param {{left: [number, number], right: [number, number], far: [number, number], near: [number, number]}} corners
 * @param {{isoX: number, isoY: number}} proj
 * @param {number} span the arena's `hx + hy`, which fixes absolute scale
 */
export const arenaFromCorners = (corners, proj, span) => {
  const { left, right, far, near } = corners;
  const { isoX, isoY } = proj;

  const sumFromX = (right[0] - left[0]) / (2 * isoX);
  const sumFromY = (near[1] - far[1]) / (2 * isoY);
  const diffFromY = (right[1] - left[1]) / (2 * isoY);
  const diffFromX = (near[0] - far[0]) / (2 * isoX);

  const sum = (sumFromX + sumFromY) / 2;
  const diff = (diffFromY + diffFromX) / 2;
  if (sum <= 0) throw new Error('corners give a non-positive span — left/right may be swapped');

  const residual = {
    span: Math.abs(sumFromX - sumFromY) / sum,
    skew: Math.abs(diffFromY - diffFromX) / sum,
  };

  const hx = (span * (sum + diff)) / (2 * sum);
  const hy = (span * (sum - diff)) / (2 * sum);

  const reading = (t) => ({
    hx: (span * (1 + t)) / 2,
    hy: (span * (1 - t)) / 2,
    ratio: t === 1 ? Infinity : (1 + t) / (1 - t),
  });
  const byAxis = {
    x: reading((near[0] - far[0]) / (right[0] - left[0])),
    y: reading((right[1] - left[1]) / (near[1] - far[1])),
  };

  return {
    hx,
    hy,
    ratio: hy === 0 ? Infinity : hx / hy,
    square: Math.abs(hx - hy) / span < 0.01,
    residual,
    byAxis,
    panelIso: (near[1] - far[1]) / (right[0] - left[0]),
    estimates: { sumFromX, sumFromY, diffFromY, diffFromX },
  };
};

export const chamferedPolygon = (hx, hy, cutX, cutY) => [
  { x: -(hx - cutX), y: -hy },
  { x: hx - cutX, y: -hy },
  { x: hx, y: -(hy - cutY) },
  { x: hx, y: hy - cutY },
  { x: hx - cutX, y: hy },
  { x: -(hx - cutX), y: hy },
  { x: -hx, y: hy - cutY },
  { x: -hx, y: -(hy - cutY) },
];

export const projectToPanel = (x, y, proj, s, origin = [0, 0]) => [
  origin[0] + (x - y) * proj.isoX * s,
  origin[1] + (x + y) * proj.isoY * s,
];
