import type { MasteryEstimate } from '../src/lab/estimator';
import {
  ORCHESTRATION_POLICIES,
  PresentationOrchestrator,
  presentationForRung,
} from '../src/lab/orchestrator';

const estimate = (
  stage: MasteryEstimate['stage'],
  timing: number,
  parryAccuracy = timing,
): MasteryEstimate => ({
  stage,
  components: {
    parryAccuracy,
    timing,
    anticipation: timing,
    recovery: timing,
    continuity: timing,
  },
  rationale: ['fixture'],
});

describe('fixed unlock versus live adaptation', () => {
  it('can reach the identical final state through both experiment arms', () => {
    const fixed = new PresentationOrchestrator().update(
      ORCHESTRATION_POLICIES.Fixed_Performance,
      null,
    );
    const live = new PresentationOrchestrator().update(
      ORCHESTRATION_POLICIES.Adaptive_Stage,
      estimate('performance', 1),
    );

    expect(fixed.rung).toBe('perfect');
    expect(live.rung).toBe('perfect');
    expect(fixed.presentation).toEqual(live.presentation);
  });

  it('withholds adaptation before the live estimate has an opinion', () => {
    const result = new PresentationOrchestrator().update(
      ORCHESTRATION_POLICIES.Adaptive_Stage,
      null,
    );
    expect(result.rung).toBe('baseline');
  });
});

describe('Q07 remains selectable', () => {
  it('can disagree when stage and timing say different things', () => {
    const reading = estimate('performance', 0.2);
    const byStage = new PresentationOrchestrator().update(
      ORCHESTRATION_POLICIES.Adaptive_Stage,
      reading,
    );
    const byTiming = new PresentationOrchestrator().update(
      ORCHESTRATION_POLICIES.Adaptive_Timing,
      reading,
    );
    expect(byStage.rung).toBe('perfect');
    expect(byTiming.rung).toBe('low');
  });
});

describe('the accessibility floor survives every rung', () => {
  it('keeps health, telegraphs, facing, threat colours, and audible equivalents', () => {
    const perfect = presentationForRung('perfect');
    expect(perfect.hud.health).toBe(true);
    expect(perfect.visual.telegraphs).toBe(true);
    expect(perfect.visual.facingMarks).toBe(true);
    expect(perfect.preserveThreatColors).toBe(true);
    expect(perfect.audio.essentialCues).toBe(true);
  });

  it('uses hysteresis to avoid flickering around a threshold', () => {
    const orchestrator = new PresentationOrchestrator();
    const policy = ORCHESTRATION_POLICIES.Adaptive_Timing;

    expect(orchestrator.update(policy, estimate('recognition', 0.46)).rung).toBe('medium');
    expect(orchestrator.update(policy, estimate('recognition', 0.38)).rung).toBe('medium');
    expect(orchestrator.update(policy, estimate('recognition', 0.35)).rung).toBe('low');
  });
});
