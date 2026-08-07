
import type { EncounterDef } from '../sim/types';

export { ENCOUNTERS } from './encounters';
export { COMBAT_PRESETS, DEFAULT_SLOWMO_ID, SLOWMO_PRESETS } from './config';
export { addPlayer, createWorld } from '../sim/encounter';
export { stepWorld } from '../sim/world';
export { DEFAULT_PILOT_SKILL_ID, PILOT_SKILLS, Pilot } from './pilot';
export { TICK_MS } from '../sim/types';

export const thinRoster = (def: EncounterDef, bodies: number): EncounterDef => {
  const thinned = structuredClone(def) as EncounterDef;
  for (const wave of thinned.waves) {
    if (wave.spawns.length <= bodies) continue;
    const stride = wave.spawns.length / bodies;
    const kept = Array.from({ length: bodies }, (_, i) => wave.spawns[Math.floor(i * stride)]);
    wave.spawns = kept.filter((spawn) => spawn !== undefined);
  }
  return thinned;
};

export interface Summary {
  samples: number;
  mean: number;
  p50: number;
  p95: number;
  max: number;
}

export const summarize = (samples: readonly number[]): Summary => {
  if (samples.length === 0) return { samples: 0, mean: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  return {
    samples: sorted.length,
    mean: samples.reduce((total, value) => total + value, 0) / sorted.length,
    p50: at(0.5),
    p95: at(0.95),
    max: sorted[sorted.length - 1] ?? 0,
  };
};
