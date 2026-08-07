
import { describe, expect, it } from 'vitest';
import {
  ANTECHAMBER_ENCOUNTER,
  ANTECHAMBER_PUZZLE,
  createSealPuzzle,
  inAntechamber,
  pressSeal,
  sealFurniture,
  sealNear,
  sealOffersInteract,
  sealPuzzleSolved,
  sealsLit,
  showingSeal,
  stepSealPuzzle,
  type SealPuzzleSpec,
} from '../src/game/puzzle';
import { furnitureObstacles, roomFurniture } from '../src/game/furniture';
import { createEscortState } from '../src/game/escort';
import { createWorld } from '../src/sim/encounter';
import { arenaContains } from '../src/sim/arena';
import { ENCOUNTERS } from '../src/lab/encounters';
import { DEFAULT_COMBAT } from '../src/lab/config';

const SPEC: SealPuzzleSpec = {
  seals: [{ at: { x: -4, y: 0 } }, { at: { x: 0, y: 0 } }, { at: { x: 4, y: 0 } }],
  sequence: [1, 2, 0],
  reachRadius: 1.35,
  sealRadius: 0.55,
  resetOnError: true,
  replaySequenceOnError: true,
  flashOnMs: 400,
  flashGapMs: 200,
  errorFlashMs: 600,
};

const at = (index: number) => SPEC.seals[index].at;

const awaiting = (spec = SPEC) => {
  const state = createSealPuzzle(spec);
  stepSealPuzzle(state, (spec.flashOnMs + spec.flashGapMs) * spec.sequence.length);
  expect(state.phase.kind).toBe('awaiting');
  return state;
};

describe('the brazier playback', () => {
  it('replays the authored order on the caller’s clock, then yields the floor', () => {
    const state = createSealPuzzle(SPEC);
    expect(state.phase).toEqual({ kind: 'showing', step: 0, msInStep: 0 });

    expect(showingSeal(state)).toBe(1);
    stepSealPuzzle(state, SPEC.flashOnMs);
    expect(showingSeal(state)).toBeNull();
    stepSealPuzzle(state, SPEC.flashGapMs);
    expect(showingSeal(state)).toBe(2);

    stepSealPuzzle(state, (SPEC.flashOnMs + SPEC.flashGapMs) * 2);
    expect(state.phase.kind).toBe('awaiting');
    expect(showingSeal(state)).toBeNull();
  });

  it('crosses several steps in one large dt rather than losing time', () => {
    const state = createSealPuzzle(SPEC);
    stepSealPuzzle(state, (SPEC.flashOnMs + SPEC.flashGapMs) * 2 + 1);
    expect(state.phase).toEqual({ kind: 'showing', step: 2, msInStep: 1 });
  });

  it('ignores pulls while showing — ignored, not queued', () => {
    const state = createSealPuzzle(SPEC);
    expect(pressSeal(state, at(1))).toBeNull();
    expect(sealsLit(state)).toBe(0);
    expect(state.phase.kind).toBe('showing');
    stepSealPuzzle(state, (SPEC.flashOnMs + SPEC.flashGapMs) * SPEC.sequence.length);
    expect(state.phase.kind).toBe('awaiting');
    expect(sealsLit(state)).toBe(0);
  });
});

describe('pulling in order', () => {
  it('lights each seal in the authored order and solves on the last', () => {
    const state = awaiting();
    expect(pressSeal(state, at(1))).toBe('lit');
    expect(pressSeal(state, at(2))).toBe('lit');
    expect(pressSeal(state, at(0))).toBe('solved');
    expect(sealPuzzleSolved(state)).toBe(true);
    expect(state.lit).toEqual([true, true, true]);
  });

  it('is never solved at tick 0 — the phase says so, no scan can', () => {
    expect(sealPuzzleSolved(createSealPuzzle(SPEC))).toBe(false);
    expect(sealPuzzleSolved(awaiting())).toBe(false);
  });

  it('resets and replays on a wrong pull, with the feedback timer armed', () => {
    const state = awaiting();
    expect(pressSeal(state, at(1))).toBe('lit');
    expect(pressSeal(state, at(0)), 'seal 0 is last in the sequence, not next').toBe('reset');
    expect(state.lit).toEqual([false, false, false]);
    expect(state.phase).toEqual({ kind: 'showing', step: 0, msInStep: 0 });
    expect(state.errorFlashMs).toBe(SPEC.errorFlashMs);
  });

  it('treats an already-lit seal as a wrong pull', () => {
    const state = awaiting();
    pressSeal(state, at(1));
    expect(pressSeal(state, at(1))).toBe('reset');
  });

  it('keeps progress when resetOnError is off, and the floor when replay is off', () => {
    const lenient = awaiting({ ...SPEC, resetOnError: false, replaySequenceOnError: false });
    pressSeal(lenient, at(1));
    expect(pressSeal(lenient, at(0))).toBe('reset');
    expect(lenient.lit, 'the lit seal survives the error').toEqual([false, true, false]);
    expect(lenient.phase.kind, 'no replay — the player keeps pulling').toBe('awaiting');
    expect(lenient.errorFlashMs).toBe(SPEC.errorFlashMs);
    expect(pressSeal(lenient, at(2))).toBe('lit');
    expect(pressSeal(lenient, at(0))).toBe('solved');
  });

  it('does nothing when no seal is in reach, and nothing after the solve', () => {
    const state = awaiting();
    expect(pressSeal(state, { x: 40, y: 40 })).toBeNull();
    pressSeal(state, at(1));
    pressSeal(state, at(2));
    pressSeal(state, at(0));
    expect(pressSeal(state, at(1)), 'a solved puzzle takes no pulls').toBeNull();
  });
});

describe('reach', () => {
  it('resolves the nearest seal inside the radius, ties to the lower index', () => {
    expect(sealNear(SPEC, { x: -4, y: SPEC.reachRadius })).toBe(0);
    expect(sealNear(SPEC, { x: -4, y: SPEC.reachRadius + 0.01 })).toBeNull();
    const tight: SealPuzzleSpec = { ...SPEC, reachRadius: 2 };
    expect(sealNear(tight, { x: -2, y: 0 })).toBe(0);
  });

  it('offers the interact button only while awaiting and in reach', () => {
    const state = createSealPuzzle(SPEC);
    expect(sealOffersInteract(state, at(1))).toBe(false);
    stepSealPuzzle(state, (SPEC.flashOnMs + SPEC.flashGapMs) * SPEC.sequence.length);
    expect(sealOffersInteract(state, at(1))).toBe(true);
    expect(sealOffersInteract(state, { x: 40, y: 40 })).toBe(false);
  });
});

describe('re-entry', () => {
  it('stands the puzzle back up already solved, every seal lit', () => {
    const state = createSealPuzzle(SPEC, true);
    expect(sealPuzzleSolved(state)).toBe(true);
    expect(state.lit).toEqual([true, true, true]);
    expect(sealOffersInteract(state, at(1)), 'nothing left to pull').toBe(false);
  });
});

describe('the seals as furniture', () => {
  it('derives collision from the very spec that draws, as copies', () => {
    const state = createSealPuzzle(SPEC);
    const furniture = sealFurniture(state);
    expect(furniture.map((f) => f.kind)).toEqual(['seal', 'seal', 'seal']);
    const obstacles = furnitureObstacles(furniture);
    expect(obstacles).toEqual(SPEC.seals.map((s) => ({ at: { ...s.at }, radius: SPEC.sealRadius })));
    obstacles[0].at.x = 999;
    expect(SPEC.seals[0].at.x).not.toBe(999);
  });

  it('stands in the antechamber and nowhere else', () => {
    const antechamber = createWorld(ENCOUNTERS[ANTECHAMBER_ENCOUNTER], DEFAULT_COMBAT, 1);
    const court = createWorld(ENCOUNTERS.wayfarer_court, DEFAULT_COMBAT, 1);
    const escort = createEscortState();
    const puzzle = createSealPuzzle(ANTECHAMBER_PUZZLE);

    expect(inAntechamber(antechamber)).toBe(true);
    expect(inAntechamber(court)).toBe(false);
    expect(roomFurniture(antechamber, escort, puzzle)).toEqual(sealFurniture(puzzle));
    expect(roomFurniture(antechamber, escort, null)).toEqual([]);
    expect(roomFurniture(court, escort, puzzle).some((f) => f.kind === 'seal')).toBe(false);
    expect(roomFurniture(court, escort, puzzle).length).toBeGreaterThan(0);
  });
});

describe('the antechamber instance', () => {
  const def = ENCOUNTERS[ANTECHAMBER_ENCOUNTER];

  it('authors a sequence that names every seal exactly once', () => {
    expect([...ANTECHAMBER_PUZZLE.sequence].sort()).toEqual(
      ANTECHAMBER_PUZZLE.seals.map((_, i) => i),
    );
  });

  it('plants every seal on the antechamber’s floor', () => {
    for (const seal of ANTECHAMBER_PUZZLE.seals) {
      expect(arenaContains(def.arena, seal.at)).toBe(true);
    }
  });

  it('leaves the spawn outside every seal footprint', () => {
    for (const seal of ANTECHAMBER_PUZZLE.seals) {
      const dx = def.playerStart.x - seal.at.x;
      const dy = def.playerStart.y - seal.at.y;
      const d = Math.hypot(dx, dy);
      expect(d, 'spawning inside a seal would wedge the king').toBeGreaterThan(
        ANTECHAMBER_PUZZLE.sealRadius + DEFAULT_COMBAT.player.radius,
      );
    }
  });
});
