
import type { SimEvent, Tick } from '../sim/types';
import { ticksToMs } from '../sim/types';

export interface RunMetrics {
  durationMs: number;
  outcome: string;

  parryAttempts: number;
  parrySuccesses: number;
  parryAccuracy: number | null;

  offsets: number[];
  offsetMean: number | null;
  offsetSd: number | null;

  damageTaken: number;
  hitsTaken: number;
  woundsInOwnRecovery: number;
  guardBlocks: number;
  guardBreaks: number;
  recoveryCancels: number;

  attacksStarted: number;
  attacksWhiffed: number;
  whiffRate: number | null;
  enemiesKilled: number;
  friendlyFireKills: number;
  powersUsed: number;
  powerHits: number;

  answerLatencies: number[];
  answerLatencyMean: number | null;

  recoveryLatencies: number[];
  recoveryLatencyMean: number | null;

  longestCleanMs: number;
  maxParryStreak: number;

  pathLength: number;
  pathPerSecond: number | null;

  slowMoActivations: number;
}

const mean = (xs: number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

const sd = (xs: number[]): number | null => {
  if (xs.length < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length);
};

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

const ANSWER_TYPES: ReadonlySet<string> = new Set([
  'parry_success',
  'parry_failed',
  'guard_success',
  'attack_started',
  'step_started',
]);

const RECOVERY_TYPES: ReadonlySet<string> = new Set(['parry_success', 'guard_success']);

export interface MetricsMeta {
  outcome: string;
  ticks: Tick;
  pathLength: number;
}

export const deriveMetrics = (events: readonly SimEvent[], meta: MetricsMeta): RunMetrics => {
  const offsets: number[] = [];
  const answerLatencies: number[] = [];
  const recoveryLatencies: number[] = [];

  let parryAttempts = 0;
  let parrySuccesses = 0;
  let damageTaken = 0;
  let hitsTaken = 0;
  let guardBlocks = 0;
  let guardBreaks = 0;
  let attacksStarted = 0;
  let attacksWhiffed = 0;
  let enemiesKilled = 0;
  let friendlyFireKills = 0;
  let powersUsed = 0;
  let powerHits = 0;
  let maxParryStreak = 0;
  let slowMoActivations = 0;
  let woundsInOwnRecovery = 0;
  let recoveryCancels = 0;

  let openTelegraphTick: Tick | null = null;
  let openErrorTick: Tick | null = null;
  let lastHitTick = 0;
  let longestCleanMs = 0;

  for (const ev of events) {
    switch (ev.type) {
      case 'parry_success':
        parryAttempts += 1;
        parrySuccesses += 1;
        offsets.push(num(ev.data?.offsetMs));
        maxParryStreak = Math.max(maxParryStreak, num(ev.data?.streak));
        break;

      case 'parry_failed':
        parryAttempts += 1;
        offsets.push(num(ev.data?.offsetMs));
        break;

      case 'hit_received':
        hitsTaken += 1;
        if (ev.data?.playerState === 'recovery') woundsInOwnRecovery += 1;
        damageTaken += num(ev.data?.damage);
        longestCleanMs = Math.max(longestCleanMs, ticksToMs(ev.tick - lastHitTick));
        lastHitTick = ev.tick;
        if (openErrorTick === null) openErrorTick = ev.tick;
        break;

      case 'guard_success':
        guardBlocks += 1;
        damageTaken += num(ev.data?.chip);
        break;

      case 'guard_broken':
        guardBreaks += 1;
        damageTaken += num(ev.data?.damage);
        longestCleanMs = Math.max(longestCleanMs, ticksToMs(ev.tick - lastHitTick));
        lastHitTick = ev.tick;
        if (openErrorTick === null) openErrorTick = ev.tick;
        break;

      case 'attack_started':
        attacksStarted += 1;
        break;

      case 'attack_whiffed':
        if (ev.data?.reason === undefined) attacksWhiffed += 1;
        break;

      case 'enemy_died':
        if (ev.data?.by === 'friendly_fire') friendlyFireKills += 1;
        else enemiesKilled += 1;
        break;

      case 'power_used':
        powersUsed += 1;
        break;

      case 'power_hit':
        powerHits += 1;
        break;

      case 'enemy_telegraph':
        if (openTelegraphTick === null) openTelegraphTick = ev.tick;
        break;

      case 'slowmo_started':
        slowMoActivations += 1;
        break;

      case 'recovery_cancelled':
        recoveryCancels += 1;
        break;

      default:
        break;
    }

    if (openTelegraphTick !== null && ANSWER_TYPES.has(ev.type)) {
      answerLatencies.push(ticksToMs(ev.tick - openTelegraphTick));
      openTelegraphTick = null;
    }

    if (openErrorTick !== null && RECOVERY_TYPES.has(ev.type)) {
      recoveryLatencies.push(ticksToMs(ev.tick - openErrorTick));
      openErrorTick = null;
    }
  }

  longestCleanMs = Math.max(longestCleanMs, ticksToMs(meta.ticks - lastHitTick));

  return {
    durationMs: ticksToMs(meta.ticks),
    outcome: meta.outcome,
    parryAttempts,
    parrySuccesses,
    parryAccuracy: parryAttempts === 0 ? null : parrySuccesses / parryAttempts,
    offsets,
    offsetMean: mean(offsets),
    offsetSd: sd(offsets),
    damageTaken,
    hitsTaken,
    woundsInOwnRecovery,
    guardBlocks,
    guardBreaks,
    recoveryCancels,
    attacksStarted,
    attacksWhiffed,
    whiffRate: attacksStarted === 0 ? null : attacksWhiffed / attacksStarted,
    enemiesKilled,
    friendlyFireKills,
    powersUsed,
    powerHits,
    answerLatencies,
    answerLatencyMean: mean(answerLatencies),
    recoveryLatencies,
    recoveryLatencyMean: mean(recoveryLatencies),
    longestCleanMs,
    maxParryStreak,
    slowMoActivations,
    pathLength: meta.pathLength,
    pathPerSecond: meta.ticks === 0 ? null : meta.pathLength / (ticksToMs(meta.ticks) / 1000),
  };
};
