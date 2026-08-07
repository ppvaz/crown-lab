
import type { MasteryEstimate } from './estimator';
import type { MasterySignal } from './taper';
import { masterySignal } from './taper';
import type { PresentationConfig, ResolvedPresentation } from './presentation';
import { PRESENTATION_PRESETS, resolve } from './presentation';

export type PresentationRung = 'baseline' | 'low' | 'medium' | 'high' | 'perfect';
export type OrchestrationMode = 'fixed' | 'live';

export type VignetteOnset = Exclude<PresentationRung, 'baseline'> | 'off';

export interface OrchestrationPolicy {
  id: string;
  mode: OrchestrationMode;
  driver: MasterySignal;
  fixedRung: PresentationRung;
  thresholds: Record<Exclude<PresentationRung, 'baseline'>, number>;
  hysteresis: number;
  vignetteOnset: VignetteOnset;
}

const RUNGS: readonly PresentationRung[] = ['baseline', 'low', 'medium', 'high', 'perfect'];

const cloneFull = (): PresentationConfig => structuredClone(PRESENTATION_PRESETS.Full);

const VIGNETTE_FULL_AMOUNT = 0.85;

const vignetteAmountFor = (rung: PresentationRung, onset: VignetteOnset): number => {
  if (onset === 'off' || rung === 'baseline') return 0;
  const at = RUNGS.indexOf(rung);
  const from = RUNGS.indexOf(onset);
  if (at < from) return 0;
  const steps = RUNGS.length - from;
  const fraction = (at - from + 1) / steps;
  return VIGNETTE_FULL_AMOUNT * fraction * fraction;
};

export const presentationForRung = (
  rung: PresentationRung,
  vignetteOnset: VignetteOnset = 'off',
): ResolvedPresentation => {
  if (rung === 'perfect') {
    const perfect = structuredClone(PRESENTATION_PRESETS.Subtracted_All);
    perfect.id = vignetteOnset === 'off' ? 'Orchestrated_Perfect' : 'Orchestrated_Perfect_V';
    perfect.vignette.amount = vignetteAmountFor(rung, vignetteOnset);
    return resolve(perfect);
  }

  const cfg = cloneFull();
  const suffix = vignetteAmountFor(rung, vignetteOnset) > 0 ? '_V' : '';
  cfg.id = `Orchestrated_${rung[0].toUpperCase()}${rung.slice(1)}${suffix}`;
  cfg.description = `Phase 6 cumulative subtraction rung: ${rung}.`;
  cfg.vignette.amount = vignetteAmountFor(rung, vignetteOnset);

  if (rung !== 'baseline') {
    cfg.hud.damageNumbers = false;
    cfg.hud.prompts = false;
    cfg.audio.stems.strings = false;
  }
  if (rung === 'medium' || rung === 'high') {
    cfg.hud.level = 'reduced';
    cfg.hud.comboCounter = false;
    cfg.hud.enemyHealth = false;
    cfg.visual.saturation = 0.65;
    cfg.visual.particleDensity = 0.65;
    cfg.audio.stems.choir = false;
    cfg.audio.stems.organ = false;
  }
  if (rung === 'high') {
    cfg.hud.level = 'none';
    cfg.hud.health = false;
    cfg.hud.stamina = false;
    cfg.hud.peripheral = false;
    cfg.visual.saturation = 0.25;
    cfg.visual.particleDensity = 0.25;
    cfg.visual.screenEffects = 0.35;
    cfg.audio.density = 0.35;
    cfg.audio.music = false;
  }
  return resolve(cfg);
};

const DEFAULT_THRESHOLDS = { low: 0.15, medium: 0.4, high: 0.65, perfect: 0.9 };

const livePolicy = (
  id: string,
  driver: MasterySignal,
  vignetteOnset: VignetteOnset = 'off',
): OrchestrationPolicy => ({
  id,
  mode: 'live',
  driver,
  fixedRung: 'baseline',
  thresholds: { ...DEFAULT_THRESHOLDS },
  hysteresis: 0.04,
  vignetteOnset,
});

export const ORCHESTRATION_POLICIES: Readonly<Record<string, OrchestrationPolicy>> = {
  Fixed_Performance: {
    id: 'Fixed_Performance',
    mode: 'fixed',
    driver: 'stage',
    fixedRung: 'perfect',
    thresholds: { ...DEFAULT_THRESHOLDS },
    hysteresis: 0,
    vignetteOnset: 'off',
  },
  Adaptive_Stage: livePolicy('Adaptive_Stage', 'stage'),
  Adaptive_Timing: livePolicy('Adaptive_Timing', 'timing'),
  Adaptive_Accuracy: livePolicy('Adaptive_Accuracy', 'parryAccuracy'),
  Adaptive_Stage_Vignette: livePolicy('Adaptive_Stage_Vignette', 'stage', 'perfect'),
  Adaptive_Stage_VignetteEarly: livePolicy('Adaptive_Stage_VignetteEarly', 'stage', 'medium'),
};

export const orchestrationPolicyFor = (id: string): OrchestrationPolicy | null =>
  ORCHESTRATION_POLICIES[id] ?? null;

export class PresentationOrchestrator {
  private rung: PresentationRung = 'baseline';

  reset(): void {
    this.rung = 'baseline';
  }

  update(
    policy: OrchestrationPolicy,
    estimate: MasteryEstimate | null,
  ): { rung: PresentationRung; presentation: ResolvedPresentation } {
    if (policy.mode === 'fixed') {
      this.rung = policy.fixedRung;
      return { rung: this.rung, presentation: presentationForRung(this.rung, policy.vignetteOnset) };
    }

    const signal = masterySignal(estimate, policy.driver);
    if (signal !== null) {
      let index = RUNGS.indexOf(this.rung);
      while (index < RUNGS.length - 1) {
        const next = RUNGS[index + 1] as Exclude<PresentationRung, 'baseline'>;
        if (signal < policy.thresholds[next] + policy.hysteresis) break;
        index += 1;
      }
      while (index > 0) {
        const current = RUNGS[index] as Exclude<PresentationRung, 'baseline'>;
        if (signal >= policy.thresholds[current] - policy.hysteresis) break;
        index -= 1;
      }
      this.rung = RUNGS[index];
    }

    return { rung: this.rung, presentation: presentationForRung(this.rung, policy.vignetteOnset) };
  }
}
