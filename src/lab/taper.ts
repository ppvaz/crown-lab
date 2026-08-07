
import type { SlowMoConfig } from '../sim/types';
import type { MasteryComponents, MasteryEstimate, MasteryStage } from './estimator';

export type MasterySignal = 'stage' | keyof MasteryComponents;
export type TaperDirection = 'taper' | 'reward';

export interface MasteryTaperPolicy {
  id: string;
  direction: TaperDirection;
  signal: MasterySignal;
  minIntensity: number;
  maxIntensity: number;
  noOpinionIntensity: number;
}

const STAGE_LEVEL: Record<MasteryStage, number> = {
  recognition: 0.2,
  anticipation: 0.45,
  fluency: 0.7,
  performance: 1,
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export const masterySignal = (
  estimate: MasteryEstimate | null,
  signal: MasterySignal,
): number | null => {
  if (estimate === null) return null;
  if (signal === 'stage') return STAGE_LEVEL[estimate.stage];
  return estimate.components[signal];
};

export const taperIntensity = (
  estimate: MasteryEstimate | null,
  policy: MasteryTaperPolicy,
): number => {
  const signal = masterySignal(estimate, policy.signal);
  if (signal === null) return clamp01(policy.noOpinionIntensity);

  const lo = clamp01(Math.min(policy.minIntensity, policy.maxIntensity));
  const hi = clamp01(Math.max(policy.minIntensity, policy.maxIntensity));
  const directed = policy.direction === 'taper' ? 1 - clamp01(signal) : clamp01(signal);
  return lo + (hi - lo) * directed;
};

export const applyMasteryTaper = (
  base: SlowMoConfig,
  estimate: MasteryEstimate | null,
  policy: MasteryTaperPolicy | null,
): SlowMoConfig =>
  policy === null ? base : { ...base, intensity: taperIntensity(estimate, policy) };

export const MASTERY_TAPER_POLICIES: Readonly<Record<string, MasteryTaperPolicy>> = {
  mastery_taper: {
    id: 'mastery_taper',
    direction: 'taper',
    signal: 'stage',
    minIntensity: 0.1,
    maxIntensity: 1,
    noOpinionIntensity: 1,
  },
  mastery_reward: {
    id: 'mastery_reward',
    direction: 'reward',
    signal: 'stage',
    minIntensity: 0.1,
    maxIntensity: 1,
    noOpinionIntensity: 0.1,
  },
};

export const taperPolicyFor = (slowMoId: string): MasteryTaperPolicy | null =>
  MASTERY_TAPER_POLICIES[slowMoId] ?? null;
