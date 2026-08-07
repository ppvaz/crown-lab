
import { describe, expect, it } from 'vitest';

import { estimateTiming, summarizeFrames } from '../scripts/lib/frame-sample.mjs';
import type { TierTimings } from '../scripts/lib/frame-sample.d.mts';

describe('a frame sample', () => {
  it('summarizes the durations a page produced', () => {
    const sample = summarizeFrames([8, 10, 12, 40]);
    expect(sample).not.toBeNull();
    expect(sample?.n).toBe(4);
    expect(sample?.mean).toBeCloseTo(17.5, 6);
    expect(sample?.p95).toBe(40);
  });

  it('is not a measurement of zero when the page drew nothing', () => {
    expect(summarizeFrames([])).toBeNull();
  });

  it('accepts a sample of one, because a slow page is still a page', () => {
    expect(summarizeFrames([31.4])?.mean).toBeCloseTo(31.4, 6);
  });
});

describe('the minimum-over-repetitions estimate', () => {
  it('takes the least disturbed repetition and reports the spread beside it', () => {
    const estimate = estimateTiming({
      means: [24.74, 23.75, 20.39],
      p95s: [30.1, 28.4, 26.2],
      fpss: [5.6, 6.8, 6.8],
    });
    expect(estimate?.mean).toBeCloseTo(20.39, 6);
    expect(estimate?.p95).toBeCloseTo(26.2, 6);
    expect(estimate?.fps).toBeCloseTo(6.8, 6);
    expect(estimate?.spread).toBeCloseTo(4.35, 6);
  });

  it('reports what the surviving repetitions measured, not a discarded failure', () => {
    const withFailedRep = [24.93, 24.99].map((mean) => summarizeFrames([mean]));
    expect(summarizeFrames([])).toBeNull();
    const record: TierTimings = { means: [], p95s: [], fpss: [] };
    for (const sample of withFailedRep) {
      if (sample === null) continue;
      record.means.push(sample.mean);
      record.p95s.push(sample.p95);
      record.fpss.push(7.2);
    }
    expect(estimateTiming(record)?.mean).toBeCloseTo(24.93, 6);
  });

  it('is unmeasured, rather than fast, when every repetition was discarded', () => {
    expect(estimateTiming({ means: [], p95s: [], fpss: [] })).toBeNull();
    expect(estimateTiming(undefined)).toBeNull();
  });
});
