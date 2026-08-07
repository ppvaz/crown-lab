
import type { SimEvent, SimEventType } from '../src/sim/types';
import { ticksToMs } from '../src/sim/types';
import {
  LIVE_SAMPLE_TICKS,
  LIVE_WARMUP_MS,
  LiveMastery,
  isSampleTick,
  isWarm,
  sampleMastery,
} from '../src/lab/live';

const ev = (
  tick: number,
  type: SimEventType,
  data?: Record<string, number | string | boolean>,
): SimEvent => ({ tick, type, data });

const SECOND = 120;

const WARMUP_TICKS = (LIVE_WARMUP_MS / 1000) * SECOND;

const engagedRun = (): SimEvent[] => [
  ev(1 * SECOND, 'enemy_telegraph', { attackId: 'guard_swing' }),
  ev(1 * SECOND + 20, 'parry_success', { offsetMs: 10 }),
  ev(3 * SECOND, 'enemy_telegraph', { attackId: 'guard_swing' }),
  ev(3 * SECOND + 22, 'parry_success', { offsetMs: -8 }),
  ev(6 * SECOND, 'enemy_telegraph', { attackId: 'guard_swing' }),
  ev(6 * SECOND + 18, 'parry_success', { offsetMs: 6 }),
  ev(9 * SECOND, 'enemy_telegraph', { attackId: 'guard_swing' }),
  ev(9 * SECOND + 25, 'parry_failed', { offsetMs: 90 }),
];

describe('the cadence is a function of tick count', () => {
  it('samples on multiples of the interval and nowhere else', () => {
    expect(isSampleTick(LIVE_SAMPLE_TICKS)).toBe(true);
    expect(isSampleTick(LIVE_SAMPLE_TICKS * 4)).toBe(true);
    expect(isSampleTick(LIVE_SAMPLE_TICKS - 1)).toBe(false);
    expect(isSampleTick(LIVE_SAMPLE_TICKS + 1)).toBe(false);
  });

  it('does not sample on tick 0 — a run with no ticks has produced nothing to read', () => {
    expect(isSampleTick(0)).toBe(false);
  });

  it('reproduces offline: stepping tick by tick equals recomputing at the same ticks', () => {
    const events = engagedRun();
    const live = new LiveMastery();

    const streamed: Array<{ tick: number; stage: string }> = [];
    for (let tick = 1; tick <= 20 * SECOND; tick++) {
      const soFar = events.filter((e) => e.tick <= tick);
      const before = live.sampledAtTick;
      const estimate = live.update(soFar, tick, 0, []);
      if (live.sampledAtTick !== before && estimate !== null) {
        streamed.push({ tick, stage: estimate.stage });
      }
    }

    const offline = [];
    for (let tick = 1; tick <= 20 * SECOND; tick++) {
      if (!isSampleTick(tick) || !isWarm(tick)) continue;
      const soFar = events.filter((e) => e.tick <= tick);
      offline.push({ tick, stage: sampleMastery(soFar, tick, 0, []).stage });
    }

    expect(streamed.length).toBeGreaterThan(0);
    expect(streamed).toEqual(offline);
  });
});

describe('the warm-up withholds an opinion rather than inventing one', () => {
  it('reports no estimate before the run is warm, however clean it looks', () => {
    const live = new LiveMastery();
    for (let tick = 1; tick < WARMUP_TICKS; tick++) {
      expect(live.update([], tick, 0, [])).toBeNull();
    }
    expect(live.estimate).toBeNull();
    expect(live.sampledAtTick).toBe(0);
  });

  it('marks the boundary by simulated time, not by sample count', () => {
    expect(isWarm(WARMUP_TICKS - 1)).toBe(false);
    expect(isWarm(WARMUP_TICKS)).toBe(true);
    expect(ticksToMs(WARMUP_TICKS)).toBe(LIVE_WARMUP_MS);
  });

  it('starts reporting once warm, and keeps the sample between sample ticks', () => {
    const events = engagedRun();
    const live = new LiveMastery();

    const first = live.update(events, WARMUP_TICKS, 0, []);
    expect(first).not.toBeNull();
    expect(live.sampledAtTick).toBe(WARMUP_TICKS);

    const cached = live.update(events, WARMUP_TICKS + 1, 0, []);
    expect(cached).toBe(first);
    expect(live.sampledAtTick).toBe(WARMUP_TICKS);
  });
});

describe('reset', () => {
  it('drops the estimate, so one attempt never scores the next', () => {
    const live = new LiveMastery();
    live.update(engagedRun(), WARMUP_TICKS, 0, []);
    expect(live.estimate).not.toBeNull();

    live.reset();

    expect(live.estimate).toBeNull();
    expect(live.sampledAtTick).toBe(0);
    expect(live.update(engagedRun(), LIVE_SAMPLE_TICKS, 0, [])).toBeNull();
  });
});

describe('the sample carries its components, not just a stage', () => {
  it('exposes the breakdown and the reason — capability 5 holds live too', () => {
    const estimate = sampleMastery(engagedRun(), 20 * SECOND, 0, []);

    expect(estimate.components).toHaveProperty('parryAccuracy');
    expect(estimate.components).toHaveProperty('timing');
    expect(estimate.components).toHaveProperty('anticipation');
    expect(estimate.components).toHaveProperty('continuity');
    expect(estimate.rationale.length).toBeGreaterThan(0);
  });
});
