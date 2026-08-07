
import type { Vec2, World } from '../sim/types';
import { dist } from '../sim/vec';
import type { Furniture } from './furniture';

export const ANTECHAMBER_ENCOUNTER = 'upper_hall';

export const inAntechamber = (world: World): boolean =>
  world.encounter.defId === ANTECHAMBER_ENCOUNTER;

export interface SealPuzzleSpec {
  seals: readonly { at: Vec2 }[];
  sequence: readonly number[];
  reachRadius: number;
  sealRadius: number;
  resetOnError: boolean;
  replaySequenceOnError: boolean;
  flashOnMs: number;
  flashGapMs: number;
  errorFlashMs: number;
}

export type SealPhase =
  | { kind: 'showing'; step: number; msInStep: number }
  | { kind: 'awaiting' }
  | { kind: 'solved' };

export interface SealPuzzle {
  spec: SealPuzzleSpec;
  phase: SealPhase;
  lit: boolean[];
  errorFlashMs: number;
}

export type SealPress = 'lit' | 'solved' | 'reset' | null;

export const ANTECHAMBER_PUZZLE: SealPuzzleSpec = {
  seals: [{ at: { x: -4.5, y: 2.4 } }, { at: { x: 0, y: 3.2 } }, { at: { x: 4.5, y: 2.4 } }],
  sequence: [1, 2, 0],
  reachRadius: 1.35,
  sealRadius: 0.55,
  resetOnError: true,
  replaySequenceOnError: true,
  flashOnMs: 450,
  flashGapMs: 250,
  errorFlashMs: 600,
};

export const createSealPuzzle = (spec: SealPuzzleSpec, alreadySolved = false): SealPuzzle => ({
  spec,
  phase: alreadySolved ? { kind: 'solved' } : { kind: 'showing', step: 0, msInStep: 0 },
  lit: spec.seals.map(() => alreadySolved),
  errorFlashMs: 0,
});

export const stepSealPuzzle = (state: SealPuzzle, dtMs: number): void => {
  state.errorFlashMs = Math.max(0, state.errorFlashMs - dtMs);
  if (state.phase.kind !== 'showing') return;
  const stepLen = state.spec.flashOnMs + state.spec.flashGapMs;
  state.phase.msInStep += dtMs;
  while (state.phase.msInStep >= stepLen) {
    state.phase.msInStep -= stepLen;
    state.phase.step += 1;
    if (state.phase.step >= state.spec.sequence.length) {
      state.phase = { kind: 'awaiting' };
      return;
    }
  }
};

export const showingSeal = (state: SealPuzzle): number | null =>
  state.phase.kind === 'showing' && state.phase.msInStep < state.spec.flashOnMs
    ? (state.spec.sequence[state.phase.step] ?? null)
    : null;

export const sealNear = (spec: SealPuzzleSpec, pos: Vec2): number | null => {
  let best: number | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < spec.seals.length; i++) {
    const d = dist(spec.seals[i].at, pos);
    if (d <= spec.reachRadius && d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return best;
};

export const sealOffersInteract = (state: SealPuzzle, pos: Vec2): boolean =>
  state.phase.kind === 'awaiting' && sealNear(state.spec, pos) !== null;

export const sealPuzzleSolved = (state: SealPuzzle): boolean => state.phase.kind === 'solved';

export const sealsLit = (state: SealPuzzle): number =>
  state.lit.reduce((count, lit) => count + (lit ? 1 : 0), 0);

export const pressSeal = (state: SealPuzzle, at: Vec2): SealPress => {
  if (state.phase.kind !== 'awaiting') return null;
  const index = sealNear(state.spec, at);
  if (index === null) return null;
  const progress = sealsLit(state);
  if (index === state.spec.sequence[progress]) {
    state.lit[index] = true;
    if (progress + 1 === state.spec.sequence.length) {
      state.phase = { kind: 'solved' };
      return 'solved';
    }
    return 'lit';
  }
  if (state.spec.resetOnError) state.lit = state.spec.seals.map(() => false);
  if (state.spec.replaySequenceOnError) state.phase = { kind: 'showing', step: 0, msInStep: 0 };
  state.errorFlashMs = state.spec.errorFlashMs;
  return 'reset';
};

export const sealFurniture = (state: SealPuzzle): Furniture[] =>
  state.spec.seals.map((seal, index) => ({
    kind: 'seal',
    at: { ...seal.at },
    radius: state.spec.sealRadius,
    index,
  }));
