
import type { SimEvent, Tick } from '../sim/types';
import { ticksToMs } from '../sim/types';
import { deriveMetrics, type RunMetrics } from './metrics';
import { deriveMastery, type MasteryEstimate } from './estimator';


export const LIVE_SAMPLE_TICKS = 30;

export const LIVE_WARMUP_MS = 5_000;

export const isSampleTick = (tick: Tick): boolean =>
  tick > 0 && tick % LIVE_SAMPLE_TICKS === 0;

export const isWarm = (tick: Tick): boolean => ticksToMs(tick) >= LIVE_WARMUP_MS;

export const sampleMastery = (
  events: readonly SimEvent[],
  tick: Tick,
  pathLength: number,
  history: readonly RunMetrics[] = [],
): MasteryEstimate =>
  deriveMastery(deriveMetrics(events, { outcome: 'running', ticks: tick, pathLength }), history);

export class LiveMastery {
  private current: MasteryEstimate | null = null;
  private sampledAt: Tick = 0;

  reset(): void {
    this.current = null;
    this.sampledAt = 0;
  }

  update(
    events: readonly SimEvent[],
    tick: Tick,
    pathLength: number,
    history: readonly RunMetrics[] = [],
  ): MasteryEstimate | null {
    if (isSampleTick(tick) && isWarm(tick)) {
      this.current = sampleMastery(events, tick, pathLength, history);
      this.sampledAt = tick;
    }
    return this.current;
  }

  get estimate(): MasteryEstimate | null {
    return this.current;
  }

  get sampledAtTick(): Tick {
    return this.sampledAt;
  }
}
