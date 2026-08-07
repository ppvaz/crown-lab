
import type { RunMetrics } from '../src/lab/metrics';
import { Session } from '../src/lab/session';
import type { Attempt } from '../src/lab/session';

const metrics = (over: Partial<RunMetrics> = {}): RunMetrics => ({
  durationMs: 45_000,
  outcome: 'cleared',
  parryAttempts: 10,
  parrySuccesses: 4,
  parryAccuracy: 0.4,
  offsets: [-10, 10],
  offsetMean: 0,
  offsetSd: 10,
  damageTaken: 32,
  hitsTaken: 3,
  guardBlocks: 5,
  guardBreaks: 1,
  attacksStarted: 20,
  attacksWhiffed: 4,
  whiffRate: 0.2,
  enemiesKilled: 2,
  friendlyFireKills: 0,
  powersUsed: 0,
  powerHits: 0,
  answerLatencies: [300, 280],
  answerLatencyMean: 290,
  recoveryLatencies: [900],
  recoveryLatencyMean: 900,
  longestCleanMs: 12_000,
  maxParryStreak: 3,
  slowMoActivations: 2,
  pathLength: 60,
  pathPerSecond: 60 / 45,
  ...over,
});

const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  attempt: 1,
  combatId: 'Default',
  slowMoId: 'none',
  encounterId: 'two_guards_open',
  seed: 4471,
  metrics: metrics(),
  ...over,
});

describe('attempt numbering', () => {
  it('starts at one, because humans count that way', () => {
    const s = new Session();

    expect(s.nextAttempt('Default', 'two_guards_open', 'none')).toBe(1);
  });

  it('advances as runs are recorded', () => {
    const s = new Session();
    s.record(attempt({ attempt: 1 }));
    expect(s.nextAttempt('Default', 'two_guards_open', 'none')).toBe(2);

    s.record(attempt({ attempt: 2 }));
    expect(s.nextAttempt('Default', 'two_guards_open', 'none')).toBe(3);
  });

  it('counts each configuration separately', () => {
    const s = new Session();
    s.record(attempt({ attempt: 1 }));
    s.record(attempt({ attempt: 2 }));

    expect(s.nextAttempt('Strict', 'two_guards_open', 'none')).toBe(1);
    expect(s.nextAttempt('Default', 'lone_duelist', 'none')).toBe(1);
    expect(s.nextAttempt('Default', 'two_guards_open', 'assist')).toBe(1);
    expect(s.nextAttempt('Default', 'two_guards_open', 'none')).toBe(3);
  });

  it('returns to the running count when a configuration is revisited', () => {
    const s = new Session();
    s.record(attempt({ attempt: 1 }));
    s.record(attempt({ attempt: 1, combatId: 'Strict' }));

    expect(s.nextAttempt('Default', 'two_guards_open', 'none')).toBe(2);
    expect(s.nextAttempt('Strict', 'two_guards_open', 'none')).toBe(2);
  });

  it('never rewinds the counter when an attempt arrives out of order', () => {
    const s = new Session();
    s.record(attempt({ attempt: 5 }));
    s.record(attempt({ attempt: 2 }));

    expect(s.nextAttempt('Default', 'two_guards_open', 'none')).toBe(6);
  });

  it('does not treat the seed as part of the configuration', () => {
    const s = new Session();
    s.record(attempt({ attempt: 1, seed: 4471 }));

    expect(s.nextAttempt('Default', 'two_guards_open', 'none')).toBe(2);
  });
});

describe('the recorded series', () => {
  it('keeps every attempt in the order it happened', () => {
    const s = new Session();
    s.record(attempt({ attempt: 1 }));
    s.record(attempt({ attempt: 1, combatId: 'Strict' }));
    s.record(attempt({ attempt: 2 }));

    expect(s.all().map((a) => `${a.combatId}#${a.attempt}`)).toEqual([
      'Default#1',
      'Strict#1',
      'Default#2',
    ]);
  });

  it('reads one configuration back oldest first', () => {
    const s = new Session();
    for (const n of [1, 2, 3]) s.record(attempt({ attempt: n }));
    s.record(attempt({ attempt: 1, combatId: 'Strict' }));

    const runs = s.forConfig('Default', 'two_guards_open', 'none');
    expect(runs.map((r) => r.attempt)).toEqual([1, 2, 3]);
  });

  it('returns an empty series for a configuration never played', () => {
    const s = new Session();
    s.record(attempt());

    expect(s.forConfig('Strict', 'two_guards_open', 'none')).toEqual([]);
  });

  it('does not leak attempts between configurations that differ only in slow motion', () => {
    const s = new Session();
    s.record(attempt({ attempt: 1 }));
    s.record(attempt({ attempt: 1, slowMoId: 'assist' }));

    expect(s.forConfig('Default', 'two_guards_open', 'none')).toHaveLength(1);
    expect(s.forConfig('Default', 'two_guards_open', 'assist')).toHaveLength(1);
  });
});

describe('the debug-panel summary', () => {
  it('says so plainly when there is nothing to show', () => {
    const s = new Session();

    expect(s.summary('Default', 'two_guards_open', 'none')).toEqual(['  (no completed runs yet)']);
  });

  it('shows the most recent runs, not the first ones', () => {
    const s = new Session();
    for (let n = 1; n <= 10; n++) s.record(attempt({ attempt: n }));

    const lines = s.summary('Default', 'two_guards_open', 'none', 3);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('# 8');
    expect(lines[2]).toContain('#10');
  });

  it('presents a series rather than an average', () => {
    const s = new Session();
    s.record(attempt({ attempt: 1, metrics: metrics({ offsetSd: 40 }) }));
    s.record(attempt({ attempt: 2, metrics: metrics({ offsetSd: 22 }) }));

    const lines = s.summary('Default', 'two_guards_open', 'none');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('40ms');
    expect(lines[1]).toContain('22ms');
  });

  it('carries the numbers a run is judged by', () => {
    const s = new Session();
    s.record(
      attempt({
        attempt: 3,
        metrics: metrics({ outcome: 'died', durationMs: 31_400, parryAccuracy: 0.44, damageTaken: 87 }),
      }),
    );

    const [line] = s.summary('Default', 'two_guards_open', 'none');
    expect(line).toContain('# 3');
    expect(line).toContain('died');
    expect(line).toContain('31.4s');
    expect(line).toContain('44%');
    expect(line).toContain('87');
  });

  it('renders an absent rate as a dash rather than as a number', () => {
    const s = new Session();
    s.record(attempt({ metrics: metrics({ parryAccuracy: null, offsetSd: null }) }));

    const [line] = s.summary('Default', 'two_guards_open', 'none');
    expect(line).toContain('parry  -- ');
    expect(line).toContain('sd  -- ');
    expect(line).not.toMatch(/NaN|null|undefined/);
  });

  it('keeps the columns aligned across single- and double-digit attempts', () => {
    const s = new Session();
    for (let n = 9; n <= 10; n++) s.record(attempt({ attempt: n }));

    const lines = s.summary('Default', 'two_guards_open', 'none');
    expect(lines[0]).toHaveLength(lines[1].length);
  });
});
