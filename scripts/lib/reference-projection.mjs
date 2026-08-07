
import { fitRun, slopeOf } from './panel-corners.mjs';

/**
 * The lowest non-void pixel in each column — the room's outer silhouette against the backdrop.
 *
 * Columns that are void top to bottom are dropped rather than reported as zero, so an image with
 * margin on both sides yields a run of points and not a pair of spikes at the frame edge.
 *
 * @param {(x: number, y: number) => [number, number, number]} at
 */
export const silhouetteBottom = (at, width, height, { voidLuminance = 10 } = {}) => {
  const points = [];
  for (let x = 0; x < width; x += 1) {
    let y = height - 1;
    while (y >= 0) {
      const [r, g, b] = at(x, y);
      if ((r + g + b) / 3 >= voidLuminance) break;
      y -= 1;
    }
    if (y >= 0) points.push([x, y]);
  }
  return points;
};

/**
 * Fit one line per declared window, and each window's two halves separately.
 *
 * The halves are the whole point of fitting three lines where one would do. A single fit over a
 * curved run returns its average slope with an rms that looks like edge antialiasing, because
 * least squares spreads curvature evenly and a hundred samples of it read as noise. Splitting the
 * run makes the curvature a difference between two numbers instead of a residual inside one.
 *
 * @param {[number, number][]} points
 * @param {Record<string, {x0: number, x1: number}>} runs
 */
export const measureRuns = (points, runs, { tolerance = 1.5 } = {}) => {
  const out = {};
  for (const [name, window] of Object.entries(runs)) {
    const inWindow = points.filter(([x]) => x >= window.x0 && x <= window.x1);
    if (inWindow.length < 16) {
      throw new Error(
        `run "${name}" (x ${window.x0}..${window.x1}) caught ${inWindow.length} silhouette ` +
          'samples — too few to fit. Is the window inside the image, and on the floor rather ' +
          'than on a prop that overhangs it?',
      );
    }
    const fit = fitRun(inWindow, tolerance);
    const mid = (window.x0 + window.x1) / 2;
    const halves = [
      slopeOf(fitRun(inWindow.filter(([x]) => x <= mid), tolerance).line),
      slopeOf(fitRun(inWindow.filter(([x]) => x > mid), tolerance).line),
    ];
    const slope = slopeOf(fit.line);
    out[name] = {
      slope,
      halves,
      drift: Math.abs(halves[0] - halves[1]) / Math.abs(slope),
      rms: fit.rms,
      worst: fit.worst,
      samples: inWindow.length,
      rejected: fit.rejected,
      line: fit.line,
      inliers: fit.inliers,
    };
  }
  return out;
};

/**
 * What the fitted runs say about the projection, against what the runtime's contract asks for.
 *
 * `ratio` is the image's own `isoY:isoX`. `deviation` is relative, so it is the fraction by which
 * every vertical dimension read off the image is wrong — the figure to quote, because it does not
 * depend on the image's size, crop or zoom.
 *
 * `asymmetry` is a separate question and not a parallel-projection test: the two front runs are
 * *adjacent* sides of the room, perpendicular in world space, so a general axonometric is free to
 * give them different slopes. It is zero for the runtime's symmetric isometric specifically, so a
 * non-zero reading says the image is not that projection even where the ratio agrees.
 *
 * @param {Record<string, {slope: number, drift: number}>} measured
 * @param {{isoX: number, isoY: number}} projection
 */
export const projectionReport = (measured, { isoX, isoY }) => {
  const runs = Object.values(measured);
  if (runs.length === 0) throw new Error('no runs measured');
  const magnitudes = runs.map((r) => Math.abs(r.slope));
  const ratio = magnitudes.reduce((a, v) => a + v, 0) / magnitudes.length;
  const expected = isoY / isoX;
  return {
    ratio,
    expected,
    deviation: (ratio - expected) / expected,
    asymmetry: (Math.max(...magnitudes) - Math.min(...magnitudes)) / ratio,
    worstDrift: Math.max(...runs.map((r) => r.drift)),
  };
};

export const projectionVerdict = (report, { ratioTolerance = 0.01, driftTolerance = 0.01 } = {}) => {
  const ratioOk = Math.abs(report.deviation) <= ratioTolerance;
  const parallelOk = report.worstDrift <= driftTolerance;
  return {
    ratioOk,
    parallelOk,
    readableForGeometry: ratioOk && parallelOk,
  };
};
