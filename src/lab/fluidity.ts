
import type { SimEvent } from '../sim/types';
import type { RunMetrics } from './metrics';

export interface FluidityComponent {
  score: number | null;
  raw: number | null;
  n: number;
}

export interface Fluidity {
  occupancy: FluidityComponent;
  precision: FluidityComponent;
  economy: FluidityComponent;
  phrasing: FluidityComponent;
  composure: FluidityComponent;
  cadence: FluidityComponent;
  candidateScore: number | null;
  defined: number;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

const falling = (value: number, best: number, worst: number): number =>
  clamp01((worst - value) / (worst - best));

const sd = (xs: number[]): number | null => {
  if (xs.length < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

const none: FluidityComponent = { score: null, raw: null, n: 0 };

export const deriveFluidity = (events: readonly SimEvent[], metrics: RunMetrics): Fluidity => {


  const BUSY = new Set(['windup', 'active', 'recovery', 'parry', 'guard', 'step']);
  const stateChanges = events.filter((e) => e.type === 'player_state_change');
  let busyTicks = 0;
  let openedAt: number | null = null;
  const firstTick = stateChanges.length > 0 ? stateChanges[0].tick : 0;
  const lastTick = stateChanges.length > 0 ? stateChanges[stateChanges.length - 1].tick : 0;
  for (const e of stateChanges) {
    if (openedAt !== null) {
      busyTicks += e.tick - openedAt;
      openedAt = null;
    }
    if (BUSY.has(String(e.data?.to ?? ''))) openedAt = e.tick;
  }
  const spanTicks = lastTick - firstTick;
  const occupancyRaw = spanTicks > 0 ? clamp01(busyTicks / spanTicks) : null;
  const occupancy: FluidityComponent =
    occupancyRaw === null
      ? none
      :
        { score: clamp01(occupancyRaw / 0.55), raw: occupancyRaw, n: stateChanges.length };

  const precision: FluidityComponent =
    metrics.offsetSd === null
      ? none
      : {
          score: falling(metrics.offsetSd, 20, 120),
          raw: metrics.offsetSd,
          n: metrics.offsets.length,
        };

  const economy: FluidityComponent =
    metrics.whiffRate === null
      ? none
      : { score: clamp01(1 - metrics.whiffRate), raw: metrics.whiffRate, n: metrics.attacksStarted };

  const PHRASE_MS = 700;
  const parryTicks = events.filter((e) => e.type === 'parry_success').map((e) => e.tick);
  const attackTicks = events.filter((e) => e.type === 'attack_started').map((e) => e.tick);
  const phrased = attackTicks.filter((t) =>
    parryTicks.some((p) => t >= p && (t - p) * (1000 / 60) <= PHRASE_MS),
  ).length;
  const phrasing: FluidityComponent =
    attackTicks.length === 0
      ? none
      : { score: clamp01(phrased / attackTicks.length / 0.35), raw: phrased / attackTicks.length, n: attackTicks.length };

  const wounds = events.filter((e) => e.type === 'hit_received');
  const committedWhenHit = wounds.filter((e) =>
    BUSY.has(String(e.data?.playerState ?? '')),
  ).length;
  const composure: FluidityComponent =
    wounds.length === 0
      ?
        { score: 1, raw: 0, n: 0 }
      : {
          score: clamp01(1 - committedWhenHit / wounds.length),
          raw: committedWhenHit / wounds.length,
          n: wounds.length,
        };

  const actionTicks = events
    .filter(
      (e) =>
        e.type === 'attack_started' || e.type === 'step_started' || e.type === 'parry_success',
    )
    .map((e) => e.tick)
    .sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < actionTicks.length; i++) {
    gaps.push((actionTicks[i] - actionTicks[i - 1]) * (1000 / 60));
  }
  const gapMean = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
  const gapSd = sd(gaps);
  const cv = gapMean !== null && gapMean > 0 && gapSd !== null ? gapSd / gapMean : null;
  const cadence: FluidityComponent =
    cv === null
      ? none
      : {
          score: clamp01(1 - Math.abs(cv - 0.6) / 0.6),
          raw: cv,
          n: gaps.length,
        };

  const parts = [occupancy, precision, economy, phrasing, composure, cadence];
  const defined = parts.filter((p) => p.score !== null).length;
  const candidateScore =
    defined === 0
      ? null
      : parts.reduce((sum, p) => sum + (p.score ?? 0), 0) / defined;

  return { occupancy, precision, economy, phrasing, composure, cadence, candidateScore, defined };
};
