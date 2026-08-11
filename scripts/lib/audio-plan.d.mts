
import type { AudioPackManifest } from '../../src/assets/audio/manifest.d.mts';

export interface CueSpec {
  file: string;
  layerMs: number;
  essential: boolean;
}

export type ProblemKind =
  | 'empty'
  | 'negation'
  | 'tainted'
  | 'missing-cue'
  | 'unknown-cue'
  | 'unknown-pack'
  | 'unexplained-override'
  | 'out-of-bounds';

export interface Problem {
  kind: ProblemKind;
  cue?: string | null;
  detail: string;
}

export interface Preset {
  durationSeconds: number;
  promptInfluence: number;
  basis: string;
}

export interface PlanEntry {
  cue: string;
  file: string;
  outPath: string;
  prompt: string;
  durationSeconds: number;
  promptInfluence: number;
  derived: Preset;
  overrides: { duration: string | null | undefined; influence: string | null | undefined };
}

export interface Plan {
  packId: string;
  description: string;
  entries: PlanEntry[];
  problems: Problem[];
  totalSeconds: number;
}

export const NEGATION_MARKERS: string[];
export const TAINTED_WORDS: string[];
export const DURATION_BOUNDS: { min: number; max: number };

export function validatePrompt(text: string): Problem[];

export function cueSpecsFrom(
  cues: Record<
    string,
    {
      material: string | null;
      transient: readonly { atMs?: number; durationMs: number }[];
      tonal: readonly { atMs?: number; durationMs: number }[];
    }
  >,
  essentialCues: ReadonlySet<string>,
): Record<string, CueSpec>;

export function presetFor(spec: CueSpec): Preset;

export function planPack(
  packs: Readonly<Record<string, AudioPackManifest>>,
  packId: string,
  specs: Record<string, CueSpec>,
): Plan;

export function formatPlan(plan: Plan): string;
