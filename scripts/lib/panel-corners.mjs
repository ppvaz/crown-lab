
export const fitLine = (points) => {
  const n = points.length;
  if (n < 2) throw new Error(`need at least 2 points to fit a line, got ${n}`);
  const mx = points.reduce((a, p) => a + p[0], 0) / n;
  const my = points.reduce((a, p) => a + p[1], 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of points) {
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
    sxy += (x - mx) * (y - my);
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const nx = -Math.sin(theta);
  const ny = Math.cos(theta);
  return { nx, ny, c: nx * mx + ny * my };
};

export const lineDistance = (line, [x, y]) => Math.abs(line.nx * x + line.ny * y - line.c);

export const slopeOf = (line) => -line.nx / line.ny;

export const intersect = (a, b) => {
  const det = a.nx * b.ny - b.nx * a.ny;
  if (Math.abs(det) < 1e-12) throw new Error('lines are parallel — no corner');
  return [(a.c * b.ny - b.c * a.ny) / det, (a.nx * b.c - b.nx * a.c) / det];
};

export const fitRun = (points, tolerance = 1.5) => {
  const n = points.length;
  if (n < 8) throw new Error(`run has only ${n} samples — too few to trust`);
  const step = Math.max(1, Math.floor(n / 40));
  let best = null;
  let bestCount = -1;
  for (let i = 0; i < n; i += step) {
    for (let j = i + Math.floor(n / 4); j < n; j += step) {
      if (Math.abs(points[i][0] - points[j][0]) < 20) continue;
      const line = fitLine([points[i], points[j]]);
      let count = 0;
      for (const p of points) if (lineDistance(line, p) < tolerance) count += 1;
      if (count > bestCount) {
        best = line;
        bestCount = count;
      }
    }
  }
  if (!best) throw new Error('no seed pair spanned enough of the run');

  let inliers = points.filter((p) => lineDistance(best, p) < tolerance);
  let line = fitLine(inliers);
  for (let pass = 0; pass < 6; pass += 1) {
    const keep = points.filter((p) => lineDistance(line, p) < tolerance);
    if (keep.length === inliers.length) break;
    inliers = keep;
    line = fitLine(keep);
  }
  const residuals = inliers.map((p) => lineDistance(line, p));
  return {
    line,
    inliers,
    rejected: n - inliers.length,
    rms: Math.sqrt(residuals.reduce((a, r) => a + r * r, 0) / residuals.length),
    worst: Math.max(...residuals),
  };
};

/**
 * The rectangle's four corners, as the intersections of adjacent runs.
 *
 * @param {{frontLeft: object, frontRight: object, backLeft: object, backRight: object}} runs
 */
export const cornersFromRuns = ({ frontLeft, frontRight, backLeft, backRight }) => ({
  left: intersect(frontLeft, backLeft),
  right: intersect(frontRight, backRight),
  far: intersect(backLeft, backRight),
  near: intersect(frontLeft, frontRight),
});

export const parallelism = ({ frontLeft, frontRight, backLeft, backRight }) => {
  const rel = (a, b) => Math.abs(slopeOf(a) - slopeOf(b)) / Math.abs(slopeOf(a));
  return {
    frontLeftVsBackRight: rel(frontLeft, backRight),
    frontRightVsBackLeft: rel(frontRight, backLeft),
  };
};

/**
 * Sub-pixel centres of contiguous warm ridges down one column.
 *
 * @param {(x: number, y: number) => [number, number, number]} at
 */
export const columnRidges = (at, x, y0, y1, threshold = 12) => {
  const warmth = (y) => {
    const [r, , b] = at(x, y);
    return r - b;
  };
  const out = [];
  let y = y0;
  while (y < y1) {
    if (warmth(y) < threshold) {
      y += 1;
      continue;
    }
    const ys = [];
    while (y < y1 && warmth(y) >= threshold) ys.push(y++);
    const total = ys.reduce((a, k) => a + warmth(k), 0);
    out.push({
      centre: ys.reduce((a, k) => a + k * warmth(k), 0) / total,
      thickness: ys.length,
      peak: Math.max(...ys.map(warmth)),
    });
  }
  return out;
};

const luminance = (at, x, y) => {
  const [r, g, b] = at(x, y);
  return (r + g + b) / 3;
};

const isFloor = (at, x, y) => {
  const [r, g, b] = at(x, y);
  const lum = (r + g + b) / 3;
  return lum >= 22 && lum <= 60 && b - r >= 4 && b - r <= 18 && g >= r;
};

/**
 * Sample one straight run of the perimeter, one point per column.
 *
 * @param {(x: number, y: number) => [number, number, number]} at
 * @param {{x0: number, x1: number, y0: number, y1: number, side: 'front' | 'back'}} window
 */
export const sampleRun = (at, { x0, x1, y0, y1, side }, opts = {}) => {
  const { minPeak = 25, maxThickness = 5 } = opts;
  const points = [];
  for (let x = x0; x <= x1; x += 1) {
    const ridges = columnRidges(at, x, y0, y1);
    if (side === 'front') {
      const strong = ridges.filter((r) => r.thickness <= maxThickness && r.peak >= minPeak);
      if (strong.length > 0) {
        points.push([x, strong[strong.length - 1].centre]);
      }
      continue;
    }
    for (const ridge of ridges) {
      if (ridge.thickness > 4 || ridge.peak < 20) continue;
      const y = Math.round(ridge.centre);
      const below = [3, 5, 7].filter((d) => isFloor(at, x, y + d)).length;
      const above = Math.max(luminance(at, x, y - 3), luminance(at, x, y - 5));
      if (below >= 2 && above > 55) {
        points.push([x, ridge.centre]);
        break;
      }
    }
  }
  return points;
};
