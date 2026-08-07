
/**
 * One tier's sample, or `null` when the page produced no frames.
 *
 * @param {readonly number[]} frames Frame callback durations in milliseconds.
 * @returns {{ n: number, mean: number, p95: number } | null}
 */
export const summarizeFrames = (frames) => {
  if (frames.length === 0) return null;
  const sorted = [...frames].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  return {
    n: sorted.length,
    mean: frames.reduce((total, value) => total + value, 0) / sorted.length,
    p95: at(0.95),
  };
};

/**
 * The minimum-over-repetitions estimate for one tier, or `null` when nothing survived.
 *
 * The minimum is the repetition least disturbed by whatever else the machine was doing, and the
 * spread beside it is what says whether the run resolved anything at all: a spread comparable to
 * the difference being looked for means it did not.
 *
 * @param {{ means: number[], p95s: number[], fpss: number[] } | undefined} record
 * @returns {{ mean: number, p95: number, fps: number, spread: number } | null}
 */
export const estimateTiming = (record) => {
  if (record === undefined || record.means.length === 0) return null;
  const mean = Math.min(...record.means);
  return {
    mean,
    p95: Math.min(...record.p95s),
    fps: Math.max(...record.fpss),
    spread: Math.max(...record.means) - mean,
  };
};
