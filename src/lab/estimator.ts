
import type { RunMetrics } from './metrics';


export const TIMING_SD_EXCELLENT_MS = 20;
export const TIMING_SD_POOR_MS = 80;

export const ANTICIPATORY_LATENCY_MS = 120;
export const REACTIVE_LATENCY_MS = 300;

export const RECOVERY_FAST_MS = 800;
export const RECOVERY_SLOW_MS = 4000;

const ANTICIPATION_THRESHOLD = 0.5;
const FLUENCY_TIMING_THRESHOLD = 0.6;
const FLUENCY_ACCURACY_THRESHOLD = 0.5;
const FLUENCY_RECOVERY_THRESHOLD = 0.5;

const PERFORMANCE_WINDOW = 3;
const PERFORMANCE_MIN_FLUENT = 2;


export interface MasteryComponents {
  parryAccuracy: number | null;
  timing: number | null;
  anticipation: number | null;
  recovery: number | null;
  continuity: number;
}

export type MasteryStage = 'recognition' | 'anticipation' | 'fluency' | 'performance';

export interface MasteryEstimate {
  components: MasteryComponents;
  stage: MasteryStage;
  rationale: string[];
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

const scoreLowerIsBetter = (value: number, excellentMs: number, poorMs: number): number =>
  clamp01((poorMs - value) / (poorMs - excellentMs));

const deriveComponents = (metrics: RunMetrics): MasteryComponents => {
  const timing =
    metrics.offsetSd === null
      ? null
      : scoreLowerIsBetter(metrics.offsetSd, TIMING_SD_EXCELLENT_MS, TIMING_SD_POOR_MS);

  const anticipation =
    metrics.answerLatencyMean === null
      ? null
      : scoreLowerIsBetter(metrics.answerLatencyMean, ANTICIPATORY_LATENCY_MS, REACTIVE_LATENCY_MS);

  const errorsOccurred = metrics.hitsTaken + metrics.guardBreaks > 0;
  const recovery = !errorsOccurred
    ? null
    : metrics.recoveryLatencyMean === null
      ? 0
      : scoreLowerIsBetter(metrics.recoveryLatencyMean, RECOVERY_FAST_MS, RECOVERY_SLOW_MS);

  const continuity =
    metrics.durationMs > 0 ? clamp01(metrics.longestCleanMs / metrics.durationMs) : 0;

  return { parryAccuracy: metrics.parryAccuracy, timing, anticipation, recovery, continuity };
};


const stageFor = (
  metrics: RunMetrics,
  components: MasteryComponents,
): Exclude<MasteryStage, 'performance'> => {
  if (metrics.parryAttempts === 0) return 'recognition';
  if (components.anticipation === null || components.anticipation < ANTICIPATION_THRESHOLD) {
    return 'recognition';
  }

  const timingReady = components.timing !== null && components.timing >= FLUENCY_TIMING_THRESHOLD;
  const accuracyReady =
    components.parryAccuracy !== null && components.parryAccuracy >= FLUENCY_ACCURACY_THRESHOLD;
  const recoveryReady = components.recovery === null || components.recovery >= FLUENCY_RECOVERY_THRESHOLD;

  if (timingReady && accuracyReady && recoveryReady) return 'fluency';
  return 'anticipation';
};

const countFluentAttempts = (history: readonly RunMetrics[]): { fluent: number; of: number } => {
  const recent = history.slice(-PERFORMANCE_WINDOW);
  const fluent = recent.filter((m) => stageFor(m, deriveComponents(m)) === 'fluency').length;
  return { fluent, of: recent.length };
};

const explain = (
  metrics: RunMetrics,
  components: MasteryComponents,
  stage: MasteryStage,
  history: readonly RunMetrics[],
): string[] => {
  if (stage === 'recognition') {
    return [
      metrics.parryAttempts === 0
        ? 'no parries attempted yet — recognition is the floor until the parry is engaged'
        : `answers are still reactive (anticipation ${(components.anticipation ?? 0).toFixed(2)}, ` +
          `need >= ${ANTICIPATION_THRESHOLD})`,
    ];
  }

  if (stage === 'anticipation') {
    const blockers: string[] = [];
    if (components.timing === null || components.timing < FLUENCY_TIMING_THRESHOLD) {
      blockers.push('timing consistency');
    }
    if (components.parryAccuracy === null || components.parryAccuracy < FLUENCY_ACCURACY_THRESHOLD) {
      blockers.push('parry accuracy');
    }
    if (components.recovery !== null && components.recovery < FLUENCY_RECOVERY_THRESHOLD) {
      blockers.push('recovery from errors');
    }
    return [`held back from fluency by: ${blockers.join(', ')}`];
  }

  if (stage === 'fluency') {
    const { fluent, of } = countFluentAttempts(history);
    return [
      `fluent this run; performance needs ${PERFORMANCE_MIN_FLUENT} of the last ` +
        `${PERFORMANCE_WINDOW} prior attempts at fluency too (${fluent}/${of} so far)`,
    ];
  }

  return ['fluency sustained across this run and its recent history — not a single lucky clear'];
};

export const deriveMastery = (
  metrics: RunMetrics,
  history: readonly RunMetrics[] = [],
): MasteryEstimate => {
  const components = deriveComponents(metrics);
  const capped = stageFor(metrics, components);

  let stage: MasteryStage = capped;
  if (capped === 'fluency') {
    const { fluent } = countFluentAttempts(history);
    if (fluent >= PERFORMANCE_MIN_FLUENT) stage = 'performance';
  }

  return { components, stage, rationale: explain(metrics, components, stage, history) };
};
