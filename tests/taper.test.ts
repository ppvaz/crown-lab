import type { MasteryEstimate } from '../src/lab/estimator';
import {
  MASTERY_TAPER_POLICIES,
  applyMasteryTaper,
  masterySignal,
  taperIntensity,
} from '../src/lab/taper';
import { SLOWMO_PRESETS } from '../src/lab/config';

const estimate = (stage: MasteryEstimate['stage'], timing = 0.6): MasteryEstimate => ({
  stage,
  components: {
    parryAccuracy: 0.75,
    timing,
    anticipation: 0.7,
    recovery: 0.8,
    continuity: 0.65,
  },
  rationale: ['fixture'],
});

describe('mastery signals', () => {
  it('withholds an opinion before the live estimator is warm', () => {
    expect(masterySignal(null, 'stage')).toBeNull();
  });

  it('can use either the stage or an inspectable component', () => {
    expect(masterySignal(estimate('fluency'), 'stage')).toBe(0.7);
    expect(masterySignal(estimate('fluency', 0.83), 'timing')).toBe(0.83);
  });
});

describe('the unresolved direction stays a policy', () => {
  it('tapers scaffolding as mastery rises', () => {
    const policy = MASTERY_TAPER_POLICIES.mastery_taper;
    expect(taperIntensity(estimate('recognition'), policy)).toBeGreaterThan(
      taperIntensity(estimate('performance'), policy),
    );
  });

  it('can run the opposite earned-spectacle arm without changing the simulation preset', () => {
    const policy = MASTERY_TAPER_POLICIES.mastery_reward;
    expect(taperIntensity(estimate('performance'), policy)).toBeGreaterThan(
      taperIntensity(estimate('recognition'), policy),
    );
    expect(SLOWMO_PRESETS.mastery_reward.worldScale).toBe(
      SLOWMO_PRESETS.mastery_taper.worldScale,
    );
    expect(SLOWMO_PRESETS.mastery_reward.durationMs).toBe(
      SLOWMO_PRESETS.mastery_taper.durationMs,
    );
  });

  it('uses an explicit no-opinion value during warm-up', () => {
    expect(taperIntensity(null, MASTERY_TAPER_POLICIES.mastery_taper)).toBe(1);
    expect(taperIntensity(null, MASTERY_TAPER_POLICIES.mastery_reward)).toBe(0.1);
  });
});

describe('the sim boundary', () => {
  it('passes only a number and never mutates a module-level preset', () => {
    const base = SLOWMO_PRESETS.mastery_taper;
    const adapted = applyMasteryTaper(
      base,
      estimate('performance'),
      MASTERY_TAPER_POLICIES.mastery_taper,
    );

    expect(adapted).not.toBe(base);
    expect(adapted.intensity).toBeCloseTo(0.1);
    expect(base.intensity).toBe(1);
  });
});
