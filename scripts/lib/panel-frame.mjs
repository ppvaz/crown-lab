
/**
 * Least squares for `A·c = b` by normal equations, `n` unknowns, Gauss-Jordan with partial
 * pivoting. Small and square by construction — the design matrices here are 3x3.
 *
 * @param {number[][]} rows one row per observation
 * @param {number[]} rhs
 * @returns {number[]}
 */
const solveNormal = (rows, rhs) => {
  const n = rows[0].length;
  /** @type {number[][]} */
  const m = Array.from({ length: n }, () => Array(n + 1).fill(0));
  for (let k = 0; k < rows.length; k += 1) {
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) m[i][j] += rows[k][i] * rows[k][j];
      m[i][n] += rows[k][i] * rhs[k];
    }
  }
  for (let i = 0; i < n; i += 1) {
    let pivot = i;
    for (let r = i + 1; r < n; r += 1) {
      if (Math.abs(m[r][i]) > Math.abs(m[pivot][i])) pivot = r;
    }
    if (Math.abs(m[pivot][i]) < 1e-12) throw new Error('degenerate fit — the points are collinear');
    [m[i], m[pivot]] = [m[pivot], m[i]];
    for (let r = 0; r < n; r += 1) {
      if (r === i) continue;
      const f = m[r][i] / m[i][i];
      for (let j = i; j <= n; j += 1) m[r][j] -= f * m[i][j];
    }
  }
  return m.map((row, i) => row[n] / m[i][i]);
};

/**
 * @param {{name: string, world: [number, number], panel: [number, number]}[]} pairs
 * @param {(w: [number, number]) => [number, number]} project
 */
const residualsOf = (pairs, project) => {
  const points = pairs.map((p) => {
    const fitted = project(p.world);
    const dx = fitted[0] - p.panel[0];
    const dy = fitted[1] - p.panel[1];
    return { name: p.name, panel: p.panel, fitted, dx, dy, d: Math.hypot(dx, dy) };
  });
  const worst = points.reduce((acc, p) => Math.max(acc, p.d), 0);
  const rms = Math.sqrt(points.reduce((acc, p) => acc + p.d * p.d, 0) / points.length);
  const least = points.reduce((acc, p) => Math.min(acc, p.d), Infinity);
  return {
    points,
    worst,
    rms,
    residualSpread: worst === 0 ? 0 : (worst - least) / worst,
  };
};

/**
 * The frame the runtime can actually reach: its own isometric, at some zoom, centred somewhere.
 *
 * @param {{name: string, world: [number, number], panel: [number, number]}[]} pairs
 * @param {{isoX: number, isoY: number}} proj
 */
export const fitRuntimeFrame = (pairs, proj) => {
  if (pairs.length < 2) throw new Error('a runtime frame needs at least two points');
  const u = pairs.map((p) => (p.world[0] - p.world[1]) * proj.isoX);
  const v = pairs.map((p) => (p.world[0] + p.world[1]) * proj.isoY);
  const n = pairs.length;
  let suu = 0;
  let su = 0;
  let sv = 0;
  let sup = 0;
  let sp = 0;
  let sq = 0;
  for (let i = 0; i < n; i += 1) {
    suu += u[i] * u[i] + v[i] * v[i];
    su += u[i];
    sv += v[i];
    sup += u[i] * pairs[i].panel[0] + v[i] * pairs[i].panel[1];
    sp += pairs[i].panel[0];
    sq += pairs[i].panel[1];
  }
  const [scale, ox, oy] = solveNormal(
    [
      [suu, su, sv],
      [su, n, 0],
      [sv, 0, n],
    ],
    [sup, sp, sq],
  );
  /** @type {(w: [number, number]) => [number, number]} */
  const project = (w) => [
    ox + (w[0] - w[1]) * proj.isoX * scale,
    oy + (w[0] + w[1]) * proj.isoY * scale,
  ];
  return {
    kind: /** @type {const} */ ('runtime'),
    dof: 3,
    scale,
    origin: /** @type {[number, number]} */ ([ox, oy]),
    project,
    ...residualsOf(pairs, project),
  };
};

/**
 * The floor: the best *any* linear map can do, including the shear and the split axis scales the
 * runtime has no way to produce.
 *
 * @param {{name: string, world: [number, number], panel: [number, number]}[]} pairs
 */
export const fitAffineFrame = (pairs) => {
  if (pairs.length < 3) throw new Error('an affine frame needs at least three points');
  const rows = pairs.map((p) => [p.world[0], p.world[1], 1]);
  const cx = solveNormal(rows, pairs.map((p) => p.panel[0]));
  const cy = solveNormal(rows, pairs.map((p) => p.panel[1]));
  /** @type {(w: [number, number]) => [number, number]} */
  const project = (w) => [
    cx[0] * w[0] + cx[1] * w[1] + cx[2],
    cy[0] * w[0] + cy[1] * w[1] + cy[2],
  ];
  return {
    kind: /** @type {const} */ ('affine'),
    dof: 6,
    coeffs: { x: cx, y: cy },
    project,
    ...residualsOf(pairs, project),
  };
};

/**
 * The four floor corners as fit input. `left`/`right`/`far`/`near` are the annotation's names for
 * the rectangle's corners, and the world point each one depicts follows from the arena's
 * half-extents exactly as `arena-from-panel.mjs` documents.
 *
 * @param {{left: [number, number], right: [number, number], far: [number, number], near: [number, number]}} corners
 * @param {{x: number, y: number}} halfExtents
 */
export const floorCornerPairs = (corners, halfExtents) => {
  const { x: hx, y: hy } = halfExtents;
  return /** @type {{name: string, world: [number, number], panel: [number, number]}[]} */ ([
    { name: 'left', world: [-hx, hy], panel: corners.left },
    { name: 'right', world: [hx, -hy], panel: corners.right },
    { name: 'far', world: [-hx, -hy], panel: corners.far },
    { name: 'near', world: [hx, hy], panel: corners.near },
  ]);
};

/**
 * The gate's arithmetic, in one place so the budget is spent explicitly.
 *
 * `floor` is what the panel costs before the model is asked for anything, and `available` is what
 * is left to hold a blockout to. A negative `available` does not mean the blockout failed — it
 * means the comparison cannot be made at this tolerance by any model, which is a fact about the
 * source and a decision for a designer.
 *
 * @param {{worst: number}} runtime
 * @param {{worst: number}} affine
 * @param {number} shorterSide the comparison frame's shorter dimension, in the same pixels
 * @param {number} budget as a fraction, e.g. 0.02
 */
export const budgetReport = (runtime, affine, shorterSide, budget) => ({
  deviation: runtime.worst / shorterSide,
  floor: affine.worst / shorterSide,
  available: budget - affine.worst / shorterSide,
  availablePx: budget * shorterSide - affine.worst,
  passes: runtime.worst / shorterSide <= budget,
  reachable: affine.worst / shorterSide <= budget,
});
