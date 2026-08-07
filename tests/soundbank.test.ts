
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { SimEvent, SimEventType } from '../src/sim/types';
import { ALL_CUES, cueForEvent } from '../src/render/soundbank';
import { labCueForEvent } from '../src/render/cue-route';

const at = (type: SimEventType, data?: SimEvent['data']): SimEvent => ({ tick: 1, type, data });

const LAB_ONLY_CUED = [
  'enemy_feint',
  'friendly_fire',
  'slowmo_started',
  'volley_returned',
  'volley_served',
  'volley_shattered',
  'volley_ward_pushed',
].sort();

const ALL_EVENT_TYPES: SimEventType[] = (() => {
  const source = readFileSync(join(process.cwd(), 'src/sim/types.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const union = /export type SimEventType =([\s\S]*?);/.exec(source);
  expect(union).not.toBeNull();
  const types = [...union![1].matchAll(/\|\s*'([a-z_]+)'/g)].map((m) => m[1] as SimEventType);
  expect(types.length).toBeGreaterThan(40);
  expect(types).toContain('slowmo_ended');
  return types;
})();

const DELIBERATELY_SILENT: Readonly<Record<string, string>> = {
  run_started: 'the encounter opening is not an event in the fiction',
  run_ended: 'the outcome banner and the music gate both already mark it',
  encounter_cleared: 'wave_spawned and the outcome carry the shape of the fight',
  player_died: 'hit_received already played the blow that did it',
  player_state_change: 'every state worth hearing emits its own fact',
  attack_whiffed: 'the swing already played on attack_started',
  chain_reset: 'the absence of a next swing is not audible; the next attack_started speaks',
  parry_failed: 'the hit that followed is the answer, and it plays',
  stamina_empty: 'a resource floor is a HUD fact, not an audible one',
  enemy_attack: 'the telegraph announced it; the landing plays as hit_received',
  arena_gate_opened: 'presentation and telemetry read it; no cue is authored',
  companion_hit: 'the escort has no voice yet — see the scope list in CLAUDE.md',
  companion_downed: 'same',
  enemy_phase_changed: 'the phase roar is the audible half and it plays',
  enemy_sequence_step: 'each step emits its own telegraph',
  enemy_status_applied: 'status audio is unbuilt; the powers are experiments',
  enemy_status_ended: 'same',
  enemy_status_tick: 'same, and a per-tick cue would be a drone',
  projectile_fired: 'the archer telegraph precedes it',
  projectile_reflected: 'the parry that caused it already played',
  power_released: 'power_used opened the channel and power_hit lands it',
  power_overcast: 'no authored cue; the visual overcharge is the signal',
  slowmo_ended: 'the return to speed is heard as the world speeding up',
  pickup_dropped: 'the death that caused it already played; a second cue would double every kill',
  pickup_expired: 'nothing the player did — and a sound for a missed reward is a scold',
};

describe('cueForEvent — the shared vocabulary', () => {
  it('returns only cues the bank actually defines', () => {
    for (const type of ALL_EVENT_TYPES) {
      const cue = labCueForEvent(at(type));
      if (cue !== null) expect(ALL_CUES).toContain(cue);
    }
  });

  it('distinguishes a heavy swing from a light one', () => {
    expect(cueForEvent(at('attack_started', { attack: 'heavy' }))).toBe('heavy');
    expect(cueForEvent(at('attack_started', { attack: 'light' }))).toBe('light');
  });

  it('gives an unparryable telegraph its own sound, since red alone is not accessible', () => {
    expect(cueForEvent(at('enemy_telegraph', { parryable: false }))).toBe('unparryable');
    expect(cueForEvent(at('enemy_telegraph', { parryable: true }))).toBe('telegraph');
  });
});

describe('the lab/public divergence is declared, not discovered', () => {
  it('routes or explicitly silences every event type the contract defines', () => {
    const unaccounted = ALL_EVENT_TYPES.filter(
      (type) => labCueForEvent(at(type)) === null && DELIBERATELY_SILENT[type] === undefined,
    );
    expect(unaccounted).toEqual([]);
  });

  it('lists nothing as silent that is in fact routed, so the reasons cannot go stale', () => {
    const contradictions = Object.keys(DELIBERATELY_SILENT).filter(
      (type) => labCueForEvent(at(type as SimEventType)) !== null,
    );
    expect(contradictions).toEqual([]);
  });

  it('names no event the contract has since removed', () => {
    const ghosts = Object.keys(DELIBERATELY_SILENT).filter(
      (type) => !(ALL_EVENT_TYPES as string[]).includes(type),
    );
    expect(ghosts).toEqual([]);
  });

  it('answers in the lab exactly the facts the public build cannot produce', () => {
    const labOnly = ALL_EVENT_TYPES.filter(
      (type) => cueForEvent(at(type)) === null && labCueForEvent(at(type)) !== null,
    );
    expect(labOnly.sort()).toEqual(LAB_ONLY_CUED);
  });

  it('agrees with the shared router everywhere else, so the two cannot drift again', () => {
    const labOnly = new Set(LAB_ONLY_CUED);
    for (const type of ALL_EVENT_TYPES) {
      if (labOnly.has(type)) continue;
      expect(labCueForEvent(at(type)), type).toBe(cueForEvent(at(type)));
    }
  });
});

describe('lab cue vocabulary stays out of the public module', () => {
  it('keeps the lab-only event names in cue-route.ts, which app/game.ts never imports', () => {
    const soundbank = readFileSync(join(process.cwd(), 'src/render/soundbank.ts'), 'utf8');
    for (const name of ['slowmo_started', 'enemy_feint', 'friendly_fire']) {
      expect(soundbank).not.toContain(`'${name}'`);
    }
    const game = readFileSync(join(process.cwd(), 'src/app/game.ts'), 'utf8');
    expect(game).not.toContain('cue-route');
  });
});
