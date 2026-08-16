
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { SimEvent, SimEventType } from '../src/sim/types';
import {
  ALL_CUES,
  CUES,
  cueForEvent,
  cueIntensity,
  cueSpanMs,
  ESSENTIAL_CUES,
} from '../src/render/soundbank';
import type { AudioCue } from '../src/render/soundbank';
import { labCueForEvent } from '../src/render/cue-route';

const at = (type: SimEventType, data?: SimEvent['data']): SimEvent => ({ tick: 1, type, data });

const peakGain = (def: (typeof CUES)[AudioCue]): number =>
  Math.max(0, ...def.transient.map((l) => l.gain), ...def.tonal.map((l) => l.gain));

const state = (data: SimEvent['data']): SimEvent => at('player_state_change', data);

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
  attack_started: 'the commit has no air; the swing plays on the transition into active',
  chain_reset: 'the absence of a next swing is not audible; the swing that follows speaks',
  parry_failed: 'the hit that followed is the answer, and it plays',
  stamina_empty: 'a resource floor is a HUD fact, not an audible one',
  enemy_attack:
    'the telegraph announced it and the landing plays as hit_received — except rain_focus, whose strike must sound whether or not it connects',
  arena_gate_opened: 'presentation and telemetry read it; no cue is authored',
  companion_hit: 'the escort has no voice yet — see the scope list in CLAUDE.md',
  companion_downed: 'same',
  enemy_phase_changed: 'the phase roar is the audible half and it plays',
  enemy_sequence_step: 'each step emits its own telegraph',
  overlap_released:
    'a body being let off its leash is not a thing that happened in the room — the telegraph it then commits to is, and that plays',
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

  it('distinguishes a heavy swing from a light one, at the tick the blade moves', () => {
    expect(cueForEvent(state({ to: 'active', attack: 'heavy' }))).toBe('heavy');
    expect(cueForEvent(state({ to: 'active', attack: 'light' }))).toBe('light');
  });

  it('plays nothing when the attack is merely committed to', () => {
    expect(cueForEvent(at('attack_started', { attack: 'heavy' }))).toBeNull();
  });

  it('is silent on every other state transition', () => {
    expect(cueForEvent(state({ to: 'windup', attack: 'heavy' }))).toBeNull();
    expect(cueForEvent(state({ to: 'recovery', attack: 'heavy' }))).toBeNull();
    expect(cueForEvent(state({ to: 'active', attack: 'none' }))).toBeNull();
  });

  it('gives a swing that hit nothing its own sound', () => {
    expect(cueForEvent(at('attack_whiffed', { attack: 'heavy' }))).toBe('whiff');
  });

  it('stays silent when an i-frame evaded someone else’s swing', () => {
    expect(cueForEvent(at('attack_whiffed', { attackId: 'guard_swing', reason: 'iframe' }))).toBeNull();
  });

  it('keeps a miss audible in a stripped mix, and quieter than any impact', () => {
    expect(ESSENTIAL_CUES.has('whiff')).toBe(true);
    const whiff = CUES.whiff;
    expect(whiff.material).toBeNull();
    const loudest = peakGain(whiff);
    for (const cue of ['hit', 'parry', 'guard', 'player_hurt'] as const) {
      expect(peakGain(CUES[cue])).toBeGreaterThan(loudest);
    }
  });

  it('gives an unparryable telegraph its own sound, since red alone is not accessible', () => {
    expect(cueForEvent(at('enemy_telegraph', { parryable: false }))).toBe('unparryable');
    expect(cueForEvent(at('enemy_telegraph', { parryable: true }))).toBe('telegraph');
  });
});

const CONDITIONAL: Partial<Record<SimEventType, SimEvent['data']>> = {
  player_state_change: { to: 'active', attack: 'light' },
};

describe('the Chancellor’s lightning, the Regent’s pane', () => {
  it('gives the Chancellor’s one parryable attack its own read', () => {
    expect(cueForEvent(at('enemy_telegraph', { attackId: 'rain_focus', parryable: true }))).toBe(
      'arc_charge',
    );
    expect(cueForEvent(at('enemy_telegraph', { attackId: 'rain_ring', parryable: false }))).toBe(
      'unparryable',
    );
  });

  it('sounds the strike whether or not it connects', () => {
    expect(cueForEvent(at('enemy_attack', { attackId: 'rain_focus' }))).toBe('arc_strike');
    expect(cueForEvent(at('enemy_attack', { attackId: 'rain_ring' }))).toBeNull();
  });

  it('scales the charge to the window a player could learn, never to the jitter', () => {
    const span = cueSpanMs(at('enemy_telegraph', { telegraphMs: 700, actualTelegraphMs: 812 }));
    expect(span).toBe(700);
  });

  it('carries no span for an event with no deadline', () => {
    expect(cueSpanMs(at('hit_landed'))).toBeUndefined();
    expect(cueIntensity(at('hit_landed'))).toBeUndefined();
  });

  it('reads the pane’s strain off the rally itself', () => {
    expect(cueIntensity(at('volley_returned', { integrity: 6, rally: 0 }))).toBe(0);
    expect(cueIntensity(at('volley_returned', { integrity: 3, rally: 3 }))).toBeCloseTo(0.5, 6);
    expect(cueIntensity(at('volley_returned', { integrity: 0, rally: 6 }))).toBe(1);
  });

  it('treats a shard with nothing left as fully strained rather than dividing by zero', () => {
    expect(cueIntensity(at('volley_returned', { integrity: 0, rally: 0 }))).toBe(1);
  });

  it('only bends a cue that asked to be bent', () => {
    expect(CUES.glass_strain.reactive).toBe(true);
    expect(CUES.arc_charge.stretch).toBe(true);
    expect(CUES.hit.reactive).toBeUndefined();
    expect(CUES.hit.stretch).toBeUndefined();
  });

  it('builds the strike as an envelope', () => {
    const offsets = CUES.arc_strike.transient.map((l) => l.atMs ?? 0);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    expect(new Set(offsets).size).toBe(offsets.length);
    expect(Math.max(...offsets)).toBeGreaterThan(0);
  });
});

describe('the lab/public divergence is declared, not discovered', () => {
  it('routes or explicitly silences every event type the contract defines', () => {
    const unaccounted = ALL_EVENT_TYPES.filter(
      (type) =>
        labCueForEvent(at(type, CONDITIONAL[type])) === null &&
        DELIBERATELY_SILENT[type] === undefined,
    );
    expect(unaccounted).toEqual([]);
  });

  it('requires a conditional route to actually be routed by the payload it names', () => {
    for (const [type, data] of Object.entries(CONDITIONAL)) {
      expect(labCueForEvent(at(type as SimEventType, data))).not.toBeNull();
      expect(labCueForEvent(at(type as SimEventType))).toBeNull();
    }
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
