
import {
  DEFAULT_PRESENTATION,
  PRESENTATION_PRESETS,
  resolve,
} from '../src/lab/presentation';
import { ORCHESTRATION_POLICIES, presentationForRung } from '../src/lab/orchestrator';
import type { PresentationRung } from '../src/lab/orchestrator';
import { FocusVignetteDrive, vignetteGeometry } from '../src/render/focus-vignette-lab';

const RUNGS: readonly PresentationRung[] = ['baseline', 'low', 'medium', 'high', 'perfect'];

const layer = (over: Partial<typeof DEFAULT_PRESENTATION.vignette> = {}) => ({
  ...DEFAULT_PRESENTATION.vignette,
  ...over,
});

describe('the SETTLED constraint: the periphery stays clear', () => {
  it('clamps the coverage cap against the accessibility floor', () => {
    const cfg = structuredClone(PRESENTATION_PRESETS.Vignette_FormA);
    cfg.vignette.maxCoverage = 0.9;
    cfg.accessibility.maxVignetteCoverage = 0.3;
    expect(resolve(cfg).vignette.maxCoverage).toBe(0.3);
  });

  it('cannot close past the cap whatever the drive asks for', () => {
    const v = layer({ maxCoverage: 0.4 });
    const g = vignetteGeometry(1.5, v, 1000, 600);
    expect(g.clearRadius).toBeGreaterThanOrEqual(g.reach * 0.6 - 1e-9);
  });
});

describe('the drive', () => {
  it('seeds at its target so a capture shows the state its URL names', () => {
    const drive = new FocusVignetteDrive();
    const v = layer({ amount: 0.85, breath: 0 });
    expect(drive.advance({ dtMs: 0, layer: v, override: null, streak: 0, simTimeMs: 0 })).toBeCloseTo(0.85);
  });

  it('closes at closeMs and retracts at openMs — asymmetric on purpose', () => {
    const drive = new FocusVignetteDrive();
    const open = layer({ amount: 0, breath: 0, closeMs: 1000, openMs: 100 });
    drive.advance({ dtMs: 16, layer: open, override: null, streak: 0, simTimeMs: 0 });
    drive.advance({ dtMs: 200, layer: open, override: 1, streak: 0, simTimeMs: 200 });
    expect(drive.amount).toBeCloseTo(0.2, 5);
    drive.advance({ dtMs: 40, layer: open, override: 0, streak: 0, simTimeMs: 240 });
    expect(drive.amount).toBeLessThanOrEqual(0.2 - 0.2 + 1e-9);
  });

  it('reopens when the streak breaks — lost rhythm is dispersed perception', () => {
    const drive = new FocusVignetteDrive();
    const v = layer({ amount: 0.8, breath: 0, rhythmRelief: 1, openMs: 400 });
    drive.advance({ dtMs: 0, layer: v, override: null, streak: 3, simTimeMs: 0 });
    const before = drive.amount;
    const after = drive.advance({ dtMs: 200, layer: v, override: null, streak: 0, simTimeMs: 200 });
    expect(before).toBeCloseTo(0.8);
    expect(after).toBeLessThan(before);
  });
});

describe('the orchestrated onset (§11.3 — OPEN, held open as two arms)', () => {
  it('leaves every pre-existing policy vignette-free at every rung', () => {
    for (const id of ['Fixed_Performance', 'Adaptive_Stage', 'Adaptive_Timing', 'Adaptive_Accuracy']) {
      for (const rung of RUNGS) {
        expect(presentationForRung(rung, ORCHESTRATION_POLICIES[id].vignetteOnset).vignette.amount).toBe(0);
      }
    }
  });

  it('grades the amount from imperceptible at onset to the closed frame at perfect', () => {
    const onset = ORCHESTRATION_POLICIES.Adaptive_Stage_VignetteEarly.vignetteOnset;
    const amounts = RUNGS.map((r) => presentationForRung(r, onset).vignette.amount);
    expect(amounts[0]).toBe(0);
    expect(amounts[1]).toBe(0);
    expect(amounts[2]).toBeGreaterThan(0);
    expect(amounts[2]).toBeLessThan(0.15);
    expect(amounts[3]).toBeGreaterThan(amounts[2]);
    expect(amounts[4]).toBeCloseTo(0.85);
    const peak = ORCHESTRATION_POLICIES.Adaptive_Stage_Vignette.vignetteOnset;
    expect(presentationForRung('high', peak).vignette.amount).toBe(0);
    expect(presentationForRung('perfect', peak).vignette.amount).toBeCloseTo(0.85);
  });
});

describe('the public build', () => {
  it('carries the field at amount zero and nothing that draws it', () => {
    expect(DEFAULT_PRESENTATION.vignette.amount).toBe(0);
  });
});
