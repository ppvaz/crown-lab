
import { DEFAULT_COMBAT } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import { Pilot, PILOT_SKILLS } from '../src/lab/pilot';
import { createWorld } from '../src/sim/encounter';
import { fingerprintWorld } from '../src/sim/fingerprint';
import { stepWorld } from '../src/sim/world';
import { SLOWMO_PRESETS } from '../src/lab/config';
import { TICK_MS } from '../src/sim/types';
import type { CombatConfig, EncounterDef, World } from '../src/sim/types';

const play = (
  encounter: EncounterDef,
  ticks: number,
  seed = 1,
): { world: World; damage: number; presses: number; events: World['events'] } => {
  const cfg: CombatConfig = structuredClone(DEFAULT_COMBAT);
  const world = createWorld(encounter, cfg, seed);
  const pilot = new Pilot(PILOT_SKILLS.steady, seed);
  const slowMo = SLOWMO_PRESETS.none;
  let damage = 0;
  let presses = 0;
  const events: World['events'] = [];
  for (let i = 0; i < ticks && world.outcome === 'running'; i++) {
    const intent = pilot.intent(world, cfg);
    if (intent.lightPressed || intent.heavyPressed || intent.guardPressed) presses += 1;
    stepWorld(world, [intent], cfg, slowMo, encounter);
    events.push(...world.events);
    for (const e of world.events) {
      if (e.type === 'hit_received') damage += (e.data?.damage as number) ?? 0;
    }
  }
  return { world, damage, presses, events };
};

describe('the pilot reads a body crossing the room', () => {
  it('kills the First Blade, which it could not do at all', () => {
    const { world } = play(ENCOUNTERS.first_blade, 60 * 150);
    expect(world.tick * TICK_MS).toBeGreaterThan(33_000);
    expect(world.outcome).toBe('cleared');
    expect(world.players[0].hp).toBeGreaterThan(80);
  });

  it('reads every pass of the phrase, and is not hit by the charge at all', () => {
    const { events } = play(ENCOUNTERS.first_blade, 60 * 150);
    const landed = events.filter((e) => e.type === 'parry_success').length;
    const glideWounds = events.filter(
      (e) => e.type === 'hit_received' && String(e.data?.attackId ?? '').includes('glide'),
    ).length;
    expect(landed).toBeGreaterThanOrEqual(20);
    expect(glideWounds).toBe(0);
  });

  it('completes the five-read phrase, which is the only punish this fight offers', () => {

    const { events } = play(ENCOUNTERS.first_blade, 60 * 150);
    const staggers = events.filter((e) => e.type === 'enemy_staggered').length;
    const whiffs = events.filter((e) => e.type === 'attack_whiffed').length;
    const landed = events.filter((e) => e.type === 'hit_landed').length;
    expect(staggers).toBeGreaterThanOrEqual(3);
    expect(landed).toBeGreaterThan(whiffs * 3);
  });
});

describe('the pilot leaves a promised circle, but not while a blade is falling', () => {
  it('walks around a promised circle rather than only out of one', () => {

    const { world } = play(ENCOUNTERS.chancellor, 60 * 90, 3);
    expect(world.outcome).toBe('cleared');
  });

  it('takes less rain damage from the Chancellor than the 108 it took standing in it', () => {
    const { events } = play(ENCOUNTERS.chancellor, 60 * 40);
    const rain = events
      .filter((e) => e.type === 'hit_received' && e.data?.attackId === 'projectile_rain')
      .reduce((sum, e) => sum + ((e.data?.damage as number) ?? 0), 0);
    expect(rain).toBeLessThan(108);
  });

  it('does not abandon a parry it could still make', () => {
    const { events } = play(ENCOUNTERS.chancellor, 60 * 40);
    const landed = events.filter((e) => e.type === 'parry_success').length;
    expect(landed).toBeGreaterThanOrEqual(4);
  });
});

describe('the boundaries ADR-060 clauses 2 and 3 draw', () => {
  it('changes nothing in a room with neither a charge nor rain', () => {
    for (const id of ['kernel_guard', 'kernel_duelist', 'spacing_archer', 'court_45s']) {
      const a = play(ENCOUNTERS[id], 60 * 30, 1);
      const b = play(ENCOUNTERS[id], 60 * 30, 1);
      expect(fingerprintWorld(b.world)).toBe(fingerprintWorld(a.world));
    }
  });

  it('never draws from the world RNG', () => {
    const cfg = structuredClone(DEFAULT_COMBAT);
    const enc = ENCOUNTERS.first_blade;
    const w = createWorld(enc, cfg, 1);
    const before = { ...w.rng };
    const pilot = new Pilot(PILOT_SKILLS.steady, 99);
    for (let i = 0; i < 30; i++) pilot.intent(w, cfg);
    expect(w.rng).toEqual(before);
  });
});
