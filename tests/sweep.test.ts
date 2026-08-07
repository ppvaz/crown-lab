
import { describe, expect, it } from 'vitest';

import {
  SWEEP_CONTROL,
  createSweep,
  summarizePeriods,
  sweepProbesFromSearch,
  sweepSchedule,
  type SweepReport,
  type SweepStep,
} from '../src/lab/sweep';

const PROBES = [
  { label: 'plain', apotheosis: 'full', compositing: 'plain' as const },
  { label: 'nofilter', apotheosis: 'full', compositing: 'nofilter' as const },
];

describe('the sweep schedule', () => {
  it('puts a control beside every probe, on both sides', () => {
    const steps = sweepSchedule(PROBES, 1);
    expect(steps.map((step) => step.label)).toEqual([
      'control',
      'plain',
      'control',
      'nofilter',
      'control',
    ]);
  });

  it('rotates the probe order once per repetition', () => {
    const probeOrder = sweepSchedule(PROBES, 2)
      .filter((step) => !step.control)
      .map((step) => step.label);
    expect(probeOrder).toEqual(['plain', 'nofilter', 'nofilter', 'plain']);
  });

  it('numbers every step, so a drift ordered by time can be read back', () => {
    const steps = sweepSchedule(PROBES, 2);
    expect(steps.map((step) => step.index)).toEqual(steps.map((_, index) => index));
  });
});

describe('the sweep URL', () => {
  it('is off unless asked for', () => {
    expect(sweepProbesFromSearch('')).toBeNull();
    expect(sweepProbesFromSearch('?sweep=0')).toBeNull();
  });

  it('takes the three compositing probes as a shorthand', () => {
    expect(sweepProbesFromSearch('?sweep=1')?.map((probe) => probe.compositing)).toEqual([
      'plain',
      'nofilter',
      'nocomposite',
    ]);
  });

  it('takes tiers and painter probes, measured with nothing neutralized', () => {
    const probes = sweepProbesFromSearch('?sweep=probe-post,probe-light,optimized_lv3');
    expect(probes?.map((probe) => probe.apotheosis)).toEqual([
      'probe-post',
      'probe-light',
      'optimized_lv3',
    ]);
    expect(probes?.every((probe) => probe.compositing === 'none')).toBe(true);
  });
});

describe('a period summary', () => {
  it('is null for a step that produced no frames', () => {
    expect(summarizePeriods([])).toBeNull();
  });

  it('keeps the quantization visible instead of averaging it away', () => {
    const summary = summarizePeriods([11.1, 11.1, 22.2, 11.1, 33.3]);
    expect(summary?.n).toBe(5);
    expect(summary?.min).toBeCloseTo(11.1, 6);
    expect(summary?.median).toBeCloseTo(11.1, 6);
    expect(summary?.p95).toBeCloseTo(33.3, 6);
  });
});

describe('a sweep run', () => {
  const run = (periodFor: (step: SweepStep) => number): SweepReport => {
    let report: SweepReport | null = null;
    const applied: SweepStep[] = [];
    const sweep = createSweep({
      probes: PROBES,
      reps: 1,
      settleMs: 50,
      sampleMs: 100,
      apply: (step) => applied.push(step),
      report: (result) => {
        report = result;
      },
      now: () => '2026-08-07T00:00:00.000Z',
      environment: () => ({
        userAgent: 'test',
        devicePixelRatio: 2,
        viewport: { width: 984, height: 443 },
      }),
    });
    for (let frame = 0; frame < 2000; frame += 1) {
      const step = applied[applied.length - 1];
      if (!sweep.tick(periodFor(step))) break;
    }
    expect(report).not.toBeNull();
    return report as unknown as SweepReport;
  };

  it('measures every step and names the display period it found', () => {
    const report = run((step) => (step.control ? 11.1 : 22.2));
    expect(report.steps).toHaveLength(5);
    expect(report.steps.every((step) => step.periods !== null)).toBe(true);
    expect(report.refreshPeriodMs).toBeCloseTo(11.1, 6);
  });

  it('is not fooled about the refresh period by a single short frame', () => {
    let frames = 0;
    const report = run(() => {
      frames += 1;
      return frames === 40 ? 8.9 : 11.1;
    });
    expect(report.refreshPeriodMs).toBeCloseTo(11.1, 6);
  });

  it('reports the spread across its repeated controls as drift', () => {
    let seen = 0;
    const report = run((step) => {
      if (!step.control) return 22.2;
      seen += 1;
      return 11.1 + (seen - 1) * 5.5;
    });
    expect(report.controlDriftMs).toBeGreaterThan(10);
  });

  it('reports no drift when the controls agree', () => {
    expect(run(() => 11.1).controlDriftMs).toBe(0);
  });

  it('keeps the control in the report, so every probe has its neighbour', () => {
    const report = run((step) => (step.control ? 11.1 : 22.2));
    const controls = report.steps.filter((step) => step.control);
    expect(controls).toHaveLength(3);
    expect(controls.every((step) => step.apotheosis === SWEEP_CONTROL.apotheosis)).toBe(true);
  });
});
