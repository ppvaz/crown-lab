
import type { RunMetrics } from '../src/lab/metrics';
import { deriveMastery } from '../src/lab/estimator';

const metrics = (over: Partial<RunMetrics> = {}): RunMetrics => ({
  durationMs: 45_000,
  outcome: 'cleared',
  parryAttempts: 10,
  parrySuccesses: 3,
  parryAccuracy: 0.3,
  offsets: [-40, 40],
  offsetMean: 0,
  offsetSd: 60,
  damageTaken: 30,
  hitsTaken: 3,
  woundsInOwnRecovery: 0,
  recoveryCancels: 0,
  guardBlocks: 4,
  guardBreaks: 0,
  attacksStarted: 20,
  attacksWhiffed: 5,
  whiffRate: 0.25,
  enemiesKilled: 2,
  friendlyFireKills: 0,
  powersUsed: 0,
  powerHits: 0,
  answerLatencies: [400, 400],
  answerLatencyMean: 400,
  recoveryLatencies: [3000],
  recoveryLatencyMean: 3000,
  longestCleanMs: 9_000,
  maxParryStreak: 2,
  slowMoActivations: 0,
  pathLength: 60,
  pathPerSecond: 60 / 45,
  ...over,
});

const fluent = (over: Partial<RunMetrics> = {}): RunMetrics =>
  metrics({
    parryAttempts: 20,
    parrySuccesses: 18,
    parryAccuracy: 0.9,
    offsetSd: 15,
    answerLatencyMean: 100,
    recoveryLatencies: [600],
    recoveryLatencyMean: 600,
    hitsTaken: 1,
    longestCleanMs: 40_000,
    ...over,
  });

describe('components stay visible', () => {
  it('reports every component alongside the stage, never a bare score', () => {
    const est = deriveMastery(fluent());

    expect(est.components).toMatchObject({
      parryAccuracy: expect.any(Number),
      timing: expect.any(Number),
      anticipation: expect.any(Number),
      recovery: expect.any(Number),
      continuity: expect.any(Number),
    });
    expect(est.rationale.length).toBeGreaterThan(0);
  });

  it('names what is holding a run back, not merely that it is held back', () => {
    const est = deriveMastery(fluent({ offsetSd: 70 }));

    expect(est.stage).toBe('anticipation');
    expect(est.rationale.join(' ')).toContain('timing');
  });

  it('scores components on a 0..1 scale, clamped at both ends', () => {
    const superb = deriveMastery(fluent({ offsetSd: 0, answerLatencyMean: 0, recoveryLatencyMean: 0 }));
    const dire = deriveMastery(
      metrics({ offsetSd: 500, answerLatencyMean: 5000, recoveryLatencyMean: 60_000 }),
    );

    expect(superb.components.timing).toBe(1);
    expect(superb.components.anticipation).toBe(1);
    expect(superb.components.recovery).toBe(1);
    expect(dire.components.timing).toBe(0);
    expect(dire.components.anticipation).toBe(0);
    expect(dire.components.recovery).toBe(0);
  });
});

describe('absence of evidence is not evidence of absence', () => {
  it('leaves timing and accuracy null when no parry was attempted', () => {
    const est = deriveMastery(
      metrics({ parryAttempts: 0, parrySuccesses: 0, parryAccuracy: null, offsetSd: null, offsets: [] }),
    );

    expect(est.components.timing).toBeNull();
    expect(est.components.parryAccuracy).toBeNull();
  });

  it('leaves anticipation null when no telegraph was ever answered', () => {
    const est = deriveMastery(metrics({ answerLatencies: [], answerLatencyMean: null }));

    expect(est.components.anticipation).toBeNull();
  });

  it('leaves recovery null when there was nothing to recover from', () => {
    const est = deriveMastery(
      fluent({ hitsTaken: 0, guardBreaks: 0, recoveryLatencies: [], recoveryLatencyMean: null }),
    );

    expect(est.components.recovery).toBeNull();
  });

  it('scores recovery 0 — not null — when an error was never recovered from', () => {
    const est = deriveMastery(
      metrics({ hitsTaken: 2, recoveryLatencies: [], recoveryLatencyMean: null }),
    );

    expect(est.components.recovery).toBe(0);
  });

  it('does not let a null component promote a run it has no evidence for', () => {
    const est = deriveMastery(
      fluent({ answerLatencies: [], answerLatencyMean: null }),
    );

    expect(est.stage).toBe('recognition');
  });
});

describe('R03 — the estimator must not reward avoidance', () => {
  it('holds a player who never attempts a parry at recognition, however clean the run', () => {
    const kiter = deriveMastery(
      metrics({
        parryAttempts: 0,
        parrySuccesses: 0,
        parryAccuracy: null,
        offsetSd: null,
        offsets: [],
        hitsTaken: 0,
        guardBreaks: 0,
        damageTaken: 0,
        recoveryLatencies: [],
        recoveryLatencyMean: null,
        longestCleanMs: 45_000,
        answerLatencyMean: 80,
      }),
    );

    expect(kiter.components.continuity).toBe(1);
    expect(kiter.stage).toBe('recognition');
    expect(kiter.rationale.join(' ')).toContain('no parries attempted');
  });

  it('does not let continuity gate any stage on its own', () => {
    const engagedButBattered = fluent({ longestCleanMs: 2_000 });
    const est = deriveMastery(engagedButBattered);

    expect(est.components.continuity).toBeCloseTo(2_000 / 45_000);
    expect(est.stage).toBe('fluency');
  });

  it('refuses fluency to a player who is consistent but consistently wrong', () => {
    const est = deriveMastery(
      fluent({ offsetSd: 5, parryAttempts: 20, parrySuccesses: 0, parryAccuracy: 0 }),
    );

    expect(est.components.timing).toBe(1);
    expect(est.stage).toBe('anticipation');
    expect(est.rationale.join(' ')).toContain('accuracy');
  });
});

describe('the stage ladder', () => {
  it('starts at recognition while answers are still reactive', () => {
    const est = deriveMastery(metrics({ answerLatencyMean: 400 }));

    expect(est.stage).toBe('recognition');
  });

  it('reaches anticipation once answers arrive faster than a reaction could', () => {
    const est = deriveMastery(metrics({ answerLatencyMean: 100 }));

    expect(est.stage).toBe('anticipation');
  });

  it('reaches fluency when timing, accuracy and recovery all hold up', () => {
    expect(deriveMastery(fluent()).stage).toBe('fluency');
  });

  it('holds a fluent-looking run back when recovery is slow', () => {
    const est = deriveMastery(fluent({ recoveryLatencies: [3500], recoveryLatencyMean: 3500 }));

    expect(est.stage).toBe('anticipation');
    expect(est.rationale.join(' ')).toContain('recovery');
  });

  it('does not hold a run back for slow recovery it never had the chance to show', () => {
    const est = deriveMastery(
      fluent({ hitsTaken: 0, guardBreaks: 0, recoveryLatencies: [], recoveryLatencyMean: null }),
    );

    expect(est.stage).toBe('fluency');
  });
});

describe('performance requires repetition, not a lucky run', () => {
  it('does not award performance for a single fluent run', () => {
    expect(deriveMastery(fluent(), []).stage).toBe('fluency');
  });

  it('does not award performance when only one prior attempt was fluent', () => {
    const est = deriveMastery(fluent(), [fluent(), metrics()]);

    expect(est.stage).toBe('fluency');
    expect(est.rationale.join(' ')).toContain('1/2');
  });

  it('awards performance once fluency is demonstrated across recent attempts', () => {
    const est = deriveMastery(fluent(), [metrics(), fluent(), fluent()]);

    expect(est.stage).toBe('performance');
  });

  it('only considers the most recent attempts, so old form does not carry forever', () => {
    const stale = [fluent(), fluent(), metrics(), metrics(), metrics()];
    const est = deriveMastery(fluent(), stale);

    expect(est.stage).toBe('fluency');
  });

  it('judges history entries on their own components, not on the current run', () => {
    const est = deriveMastery(metrics(), [fluent(), fluent(), fluent()]);

    expect(est.stage).toBe('recognition');
  });
});

describe('purity', () => {
  it('does not mutate the metrics it was given', () => {
    const m = fluent();
    const before = structuredClone(m);

    deriveMastery(m, [fluent(), fluent()]);

    expect(m).toEqual(before);
  });

  it('returns the same estimate for the same inputs, twice', () => {
    expect(deriveMastery(fluent(), [fluent()])).toEqual(deriveMastery(fluent(), [fluent()]));
  });
});
