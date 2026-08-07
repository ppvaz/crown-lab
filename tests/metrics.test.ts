
import type { SimEvent, SimEventType } from '../src/sim/types';
import { deriveMetrics } from '../src/lab/metrics';

const ev = (
  tick: number,
  type: SimEventType,
  data?: Record<string, number | string | boolean>,
): SimEvent => ({ tick, type, data });

const derive = (events: SimEvent[], ticks = 0, outcome = 'cleared', pathLength = 0) =>
  deriveMetrics(events, { outcome, ticks, pathLength });

const SECOND = 120;

describe('absence is not zero', () => {
  it('reports every rate as null when its denominator is empty', () => {
    const m = derive([]);

    expect(m.parryAccuracy).toBeNull();
    expect(m.whiffRate).toBeNull();
    expect(m.offsetMean).toBeNull();
    expect(m.offsetSd).toBeNull();
    expect(m.answerLatencyMean).toBeNull();
    expect(m.recoveryLatencyMean).toBeNull();
  });

  it('still reports counts as zero, because a count of nothing is nothing', () => {
    const m = derive([]);

    expect(m.parryAttempts).toBe(0);
    expect(m.damageTaken).toBe(0);
    expect(m.enemiesKilled).toBe(0);
    expect(m.offsets).toEqual([]);
    expect(m.answerLatencies).toEqual([]);
    expect(m.recoveryLatencies).toEqual([]);
  });

  it('gives a single parry a mean but no spread', () => {
    const m = derive([ev(10, 'parry_success', { offsetMs: 12 })]);

    expect(m.offsetMean).toBe(12);
    expect(m.offsetSd).toBeNull();
  });

  it('carries the outcome and duration through from meta', () => {
    const m = derive([], 6 * SECOND, 'died');

    expect(m.outcome).toBe('died');
    expect(m.durationMs).toBeCloseTo(6000);
  });
});

describe('parry accounting', () => {
  it('counts a failed parry as an attempt', () => {
    const m = derive([
      ev(10, 'parry_success', { offsetMs: 0 }),
      ev(20, 'parry_failed', { offsetMs: 40 }),
      ev(30, 'parry_failed', { offsetMs: 55 }),
    ]);

    expect(m.parryAttempts).toBe(3);
    expect(m.parrySuccesses).toBe(1);
    expect(m.parryAccuracy).toBeCloseTo(1 / 3);
  });

  it('keeps the offsets of failed parries, which are the tail of the distribution', () => {
    const m = derive([
      ev(10, 'parry_success', { offsetMs: 5 }),
      ev(20, 'parry_failed', { offsetMs: 70 }),
    ]);

    expect(m.offsets).toEqual([5, 70]);
  });

  it('keeps the sign of the offset, so early and late do not cancel into competence', () => {
    const m = derive([
      ev(10, 'parry_failed', { offsetMs: -20 }),
      ev(20, 'parry_failed', { offsetMs: 20 }),
    ]);

    expect(m.offsets).toEqual([-20, 20]);
    expect(m.offsetMean).toBe(0);
    expect(m.offsetSd).toBe(20);
  });

  it('uses the population standard deviation, not the sample one', () => {
    const m = derive([
      ev(10, 'parry_success', { offsetMs: 0 }),
      ev(20, 'parry_success', { offsetMs: 10 }),
    ]);

    expect(m.offsetSd).toBe(5);
  });

  it('reads the parry streak as a high-water mark, not as a count of parries', () => {
    const m = derive([
      ev(10, 'parry_success', { offsetMs: 0, streak: 1 }),
      ev(20, 'parry_success', { offsetMs: 0, streak: 2 }),
      ev(30, 'parry_success', { offsetMs: 0, streak: 3 }),
      ev(40, 'hit_received', { damage: 10 }),
      ev(50, 'parry_success', { offsetMs: 0, streak: 1 }),
    ]);

    expect(m.parrySuccesses).toBe(4);
    expect(m.maxParryStreak).toBe(3);
  });
});

describe('credit stays with whoever earned it', () => {
  it('counts a friendly-fire kill without crediting it to the player', () => {
    const m = derive([
      ev(10, 'enemy_died', { archetype: 'guard', by: 'player' }),
      ev(20, 'enemy_died', { archetype: 'archer', by: 'friendly_fire' }),
      ev(30, 'enemy_died', { archetype: 'duelist', by: 'friendly_fire' }),
    ]);

    expect(m.enemiesKilled).toBe(1);
    expect(m.friendlyFireKills).toBe(2);
  });

  it('does not count an i-frame evasion as a player whiff', () => {
    const m = derive([
      ev(10, 'attack_started', { attack: 'light' }),
      ev(20, 'attack_whiffed', { attack: 'light', recoveryMs: 300 }),
      ev(30, 'attack_whiffed', { attackId: 'chop', reason: 'iframe' }),
    ]);

    expect(m.attacksStarted).toBe(1);
    expect(m.attacksWhiffed).toBe(1);
    expect(m.whiffRate).toBe(1);
  });

  it('rates whiffs against attacks started', () => {
    const m = derive([
      ev(10, 'attack_started', { attack: 'light' }),
      ev(20, 'attack_started', { attack: 'light' }),
      ev(30, 'attack_started', { attack: 'heavy' }),
      ev(40, 'attack_whiffed', { attack: 'heavy', recoveryMs: 500 }),
    ]);

    expect(m.whiffRate).toBeCloseTo(1 / 3);
  });

  it('counts powers used and the targets they resolved separately', () => {
    const m = derive([
      ev(10, 'power_used', { kind: 'lightning' }),
      ev(12, 'power_hit', {}),
      ev(12, 'power_hit', {}),
      ev(12, 'power_hit', {}),
      ev(60, 'power_used', { kind: 'lightning' }),
    ]);

    expect(m.powersUsed).toBe(2);
    expect(m.powerHits).toBe(3);
  });

  it('counts slow-motion activations', () => {
    const m = derive([
      ev(10, 'slowmo_started', { reason: 'perfect_parry' }),
      ev(40, 'slowmo_ended', {}),
      ev(80, 'slowmo_started', { reason: 'near_miss' }),
    ]);

    expect(m.slowMoActivations).toBe(2);
  });
});

describe('damage taken', () => {
  it('sums clean hits, guard chip and guard breaks into one figure', () => {
    const m = derive([
      ev(10, 'hit_received', { damage: 12 }),
      ev(20, 'guard_success', { chip: 1.5 }),
      ev(30, 'guard_broken', { damage: 20 }),
    ]);

    expect(m.damageTaken).toBeCloseTo(33.5);
    expect(m.hitsTaken).toBe(1);
    expect(m.guardBlocks).toBe(1);
    expect(m.guardBreaks).toBe(1);
  });

  it('coerces a missing payload number to zero rather than to NaN', () => {
    const m = derive([
      ev(10, 'hit_received', {}),
      ev(20, 'parry_success', {}),
      ev(30, 'parry_success', { offsetMs: 10 }),
    ]);

    expect(m.damageTaken).toBe(0);
    expect(m.offsets).toEqual([0, 10]);
    expect(m.offsetMean).toBe(5);
    expect(Number.isNaN(m.offsetMean)).toBe(false);
  });
});

describe('longest clean stretch', () => {
  it('counts an untouched run as clean for its whole duration', () => {
    const m = derive([ev(60, 'attack_started', { attack: 'light' })], 5 * SECOND);

    expect(m.longestCleanMs).toBeCloseTo(5000);
  });

  it('counts the stretch after the last hit, not only the gaps between hits', () => {
    const m = derive([ev(SECOND, 'hit_received', { damage: 5 })], 6 * SECOND);

    expect(m.longestCleanMs).toBeCloseTo(5000);
  });

  it('reports the largest gap rather than the most recent one', () => {
    const m = derive(
      [
        ev(4 * SECOND, 'hit_received', { damage: 5 }),
        ev(5 * SECOND, 'hit_received', { damage: 5 }),
      ],
      6 * SECOND,
    );

    expect(m.longestCleanMs).toBeCloseTo(4000);
  });

  it('treats a guard break as breaking the streak, and a blocked hit as not', () => {
    const broken = derive([ev(3 * SECOND, 'guard_broken', { damage: 9 })], 4 * SECOND);
    const blocked = derive([ev(3 * SECOND, 'guard_success', { chip: 1 })], 4 * SECOND);

    expect(broken.longestCleanMs).toBeCloseTo(3000);
    expect(blocked.longestCleanMs).toBeCloseTo(4000);
  });
});

describe('answer latency', () => {
  it('times a telegraph to the next committed answer', () => {
    const m = derive([
      ev(0, 'enemy_telegraph', { archetype: 'guard' }),
      ev(SECOND, 'parry_success', { offsetMs: 0 }),
    ]);

    expect(m.answerLatencies).toHaveLength(1);
    expect(m.answerLatencies[0]).toBeCloseTo(1000);
    expect(m.answerLatencyMean).toBeCloseTo(1000);
  });

  it('does not time overlapping telegraphs separately', () => {
    const m = derive([
      ev(0, 'enemy_telegraph', { archetype: 'guard' }),
      ev(30, 'enemy_telegraph', { archetype: 'duelist' }),
      ev(SECOND, 'attack_started', { attack: 'light' }),
    ]);

    expect(m.answerLatencies).toHaveLength(1);
    expect(m.answerLatencies[0]).toBeCloseTo(1000);
  });

  it('re-arms after an answer', () => {
    const m = derive([
      ev(0, 'enemy_telegraph', {}),
      ev(SECOND, 'step_started', {}),
      ev(2 * SECOND, 'enemy_telegraph', {}),
      ev(3 * SECOND, 'guard_success', { chip: 0 }),
    ]);

    expect(m.answerLatencies).toHaveLength(2);
    expect(m.answerLatencies[0]).toBeCloseTo(1000);
    expect(m.answerLatencies[1]).toBeCloseTo(1000);
  });

  it('does not accept being hit as an answer', () => {
    const m = derive([
      ev(0, 'enemy_telegraph', {}),
      ev(SECOND, 'hit_received', { damage: 10 }),
      ev(2 * SECOND, 'parry_success', { offsetMs: 0 }),
    ]);

    expect(m.answerLatencies).toHaveLength(1);
    expect(m.answerLatencies[0]).toBeCloseTo(2000);
  });

  it('leaves an unanswered telegraph out of the series entirely', () => {
    const m = derive([ev(0, 'enemy_telegraph', {})], 4 * SECOND);

    expect(m.answerLatencies).toEqual([]);
    expect(m.answerLatencyMean).toBeNull();
  });

  it('keeps the answers in the order they happened', () => {
    const m = derive([
      ev(0, 'enemy_telegraph', {}),
      ev(SECOND, 'parry_success', { offsetMs: 0 }),
      ev(2 * SECOND, 'enemy_telegraph', {}),
      ev(2 * SECOND + 60, 'parry_success', { offsetMs: 0 }),
    ]);

    expect(m.answerLatencies[0]).toBeGreaterThan(m.answerLatencies[1]);
  });
});

describe('recovery from error', () => {
  it('times a hit to the next successful defensive answer', () => {
    const m = derive([
      ev(0, 'hit_received', { damage: 10 }),
      ev(SECOND, 'parry_success', { offsetMs: 0 }),
    ]);

    expect(m.recoveryLatencies).toHaveLength(1);
    expect(m.recoveryLatencies[0]).toBeCloseTo(1000);
    expect(m.recoveryLatencyMean).toBeCloseTo(1000);
  });

  it('also closes the window on a successful guard, not only a parry', () => {
    const m = derive([
      ev(0, 'guard_broken', { damage: 15 }),
      ev(SECOND, 'guard_success', { chip: 1 }),
    ]);

    expect(m.recoveryLatencies[0]).toBeCloseTo(1000);
  });

  it('does not restart the clock on a second hit before recovery', () => {
    const m = derive([
      ev(0, 'hit_received', { damage: 10 }),
      ev(SECOND, 'hit_received', { damage: 10 }),
      ev(2 * SECOND, 'parry_success', { offsetMs: 0 }),
    ]);

    expect(m.recoveryLatencies).toHaveLength(1);
    expect(m.recoveryLatencies[0]).toBeCloseTo(2000);
  });

  it('does not accept a failed parry as recovery', () => {
    const m = derive([
      ev(0, 'hit_received', { damage: 10 }),
      ev(SECOND, 'parry_failed', { offsetMs: 60 }),
      ev(2 * SECOND, 'parry_success', { offsetMs: 0 }),
    ]);

    expect(m.recoveryLatencies).toHaveLength(1);
    expect(m.recoveryLatencies[0]).toBeCloseTo(2000);
  });

  it('leaves a never-recovered error out of the series entirely', () => {
    const m = derive([ev(0, 'hit_received', { damage: 10 })], 4 * SECOND);

    expect(m.recoveryLatencies).toEqual([]);
    expect(m.recoveryLatencyMean).toBeNull();
  });

  it('reports an empty series, not a null-vs-zero confusion, for an untouched run', () => {
    const m = derive([ev(60, 'attack_started', { attack: 'light' })], 5 * SECOND);

    expect(m.recoveryLatencies).toEqual([]);
    expect(m.recoveryLatencyMean).toBeNull();
  });

  it('re-arms after a recovery, so a later error is timed independently', () => {
    const m = derive([
      ev(0, 'hit_received', { damage: 10 }),
      ev(SECOND, 'parry_success', { offsetMs: 0 }),
      ev(2 * SECOND, 'hit_received', { damage: 10 }),
      ev(2 * SECOND + 60, 'guard_success', { chip: 1 }),
    ]);

    expect(m.recoveryLatencies).toHaveLength(2);
    expect(m.recoveryLatencies[0]).toBeCloseTo(1000);
    expect(m.recoveryLatencies[1]).toBeCloseTo(500);
  });
});

describe('ground covered', () => {
  it('passes the measured distance through untouched', () => {
    expect(derive([], 45 * SECOND, 'cleared', 61.5).pathLength).toBe(61.5);
  });

  it('normalises by the time the player actually had to walk', () => {
    const flailed = derive([], 60 * SECOND, 'cleared', 120);
    const fluent = derive([], 30 * SECOND, 'cleared', 60);

    expect(flailed.pathLength).toBe(2 * fluent.pathLength);
    expect(flailed.pathPerSecond).toBe(fluent.pathPerSecond);
    expect(fluent.pathPerSecond).toBeCloseTo(2, 10);
  });

  it('has no rate for a run with no time in it', () => {
    expect(derive([], 0, 'cleared', 0).pathPerSecond).toBeNull();
  });
});

describe('recomputability', () => {
  const stream = (): SimEvent[] => [
    ev(0, 'run_started', { seed: 7 }),
    ev(10, 'enemy_telegraph', { archetype: 'guard' }),
    ev(40, 'parry_success', { offsetMs: -8, streak: 1 }),
    ev(90, 'attack_started', { attack: 'heavy' }),
    ev(130, 'hit_landed', { damage: 24 }),
    ev(200, 'enemy_died', { by: 'player' }),
    ev(240, 'run_ended', { outcome: 'cleared' }),
  ];

  it('does not mutate the events it was given', () => {
    const events = stream();
    const before = structuredClone(events);

    derive(events, 240);

    expect(events).toEqual(before);
  });

  it('returns the same metrics for the same stream, twice', () => {
    expect(derive(stream(), 240)).toEqual(derive(stream(), 240));
  });

  it('returns a fresh offsets array rather than a shared one', () => {
    const events = stream();
    const first = derive(events, 240);
    const second = derive(events, 240);

    first.offsets.push(999);

    expect(second.offsets).toEqual([-8]);
  });
});
