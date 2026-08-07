
import { describe, expect, it } from 'vitest';
import type { Enemy, Intent, World } from '../src/sim/types';
import { NEUTRAL_INTENT, TICK_MS } from '../src/sim/types';
import { createWorld } from '../src/sim/encounter';
import { stepWorld } from '../src/sim/world';
import { ENCOUNTERS } from '../src/lab/encounters';
import { PILOT_SKILLS, Pilot } from '../src/lab/pilot';
import { runPilotEncounter } from '../src/lab/pilot-run';
import { bareWorld, cfg, noSlowMo } from './support/world';

const STARTED_AT = '2026-07-27T09:00:00.000Z';

const guardAt = (
  w: World,
  id: number,
  bearingDeg: number,
  kind: Enemy['state']['kind'],
  elapsedMs = 0,
  distance = 2,
): Enemy => {
  const rad = (bearingDeg * Math.PI) / 180;
  const e: Enemy = {
    id,
    archetype: 'guard',
    pos: { x: Math.cos(rad) * distance, y: Math.sin(rad) * distance },
    vel: { x: 0, y: 0 },
    facing: rad + Math.PI,
    hp: 90,
    maxHp: 90,
    poise: 100,
    maxPoise: 100,
    state: {
      kind,
      enteredTick: w.tick,
      elapsedMs,
      attackIndex: 0,
      telegraphJitterMs: 0,
      struck: [],
    },
    attackCooldownMs: 0,
  };
  w.enemies.push(e);
  return e;
};

const telegraphingAt = (w: World, id: number, bearingDeg: number, elapsedMs: number): Enemy =>
  guardAt(w, id, bearingDeg, 'telegraph', elapsedMs);

const run = (encounterId: string, over: { seed?: number; skillId?: string; pilotSeed?: number } = {}) =>
  runPilotEncounter({
    encounterId,
    seed: over.seed ?? 1,
    skillId: over.skillId ?? 'steady',
    pilotSeed: over.pilotSeed,
    startedAt: STARTED_AT,
  });

describe('the pilot plays a real run', () => {
  it('clears the combat kernel and the record reproduces itself', () => {
    const result = run('kernel_guard');

    expect(result.metrics.outcome).toBe('cleared');
    expect(result.metrics.enemiesKilled).toBe(1);
    expect(result.replayOk).toBe(true);
    expect(result.divergedAtTick).toBeNull();
  });

  it('marks the record as scripted, so it can never be mistaken for a human attempt', () => {
    const record = run('kernel_guard').record;

    expect(record.meta.pilot).toBe('steady');
    expect(record.meta.replayable).toBe(true);
  });

  it('reproduces every encounter of the kernel ladder and the shape series', () => {
    const encounters = [
      'kernel_guard',
      'kernel_duelist',
      'spacing_archer',
      'court_45s',
      'shape_gallery',
      'shape_twin_bowls',
      'shape_combat_bowl',
      'shape_cramped_keep',
    ];

    for (const id of encounters) {
      const result = run(id);
      expect(result.metrics.outcome, id).not.toBe('running');
      expect(result.replayOk, id).toBe(true);
    }
  });
});

describe('the pilot is deterministic', () => {
  it('plays the same fight twice from the same seeds', () => {
    const a = run('court_45s');
    const b = run('court_45s');

    expect(b.record.finalHash).toBe(a.record.finalHash);
    expect(b.record.intents).toEqual(a.record.intents);
  });

  it('plays the same fight differently when only its own seed moves', () => {
    const a = run('court_45s', { pilotSeed: 11 });
    const b = run('court_45s', { pilotSeed: 12 });

    expect(b.record.meta.seed).toBe(a.record.meta.seed);
    expect(b.record.intents).not.toEqual(a.record.intents);
  });

  it('never draws from the world rng', () => {
    const combat = cfg();
    const encounter = ENCOUNTERS.spacing_archer;
    const world = createWorld(encounter, combat, 7);
    const pilot = new Pilot(PILOT_SKILLS.steady, 3);
    let intent: Intent = { ...NEUTRAL_INTENT };

    for (let tick = 0; tick < 2400 && world.outcome === 'running'; tick++) {
      const before = world.rng.value;
      intent = pilot.intent(world, combat);
      expect(world.rng.value).toBe(before);
      stepWorld(world, [intent], combat, noSlowMo(), encounter);
    }
  });
});

describe('skill is a dial', () => {
  it('separates the two pilots on the encounter built to punish greed', () => {
    const steady = run('court_45s', { skillId: 'steady' });
    const raw = run('court_45s', { skillId: 'raw' });

    expect(raw.metrics.damageTaken).toBeGreaterThan(steady.metrics.damageTaken);
  });

  it('does not swing into a wind-up it has already seen', () => {
    const result = run('kernel_guard', { skillId: 'steady' });

    expect(result.metrics.hitsTaken).toBe(0);
  });
});

describe('the pilot reads the Glass Regent floor', () => {
  it('runs toward a marked shelter after its ordinary reaction delay', () => {
    const combat = cfg();
    const world = bareWorld(combat);
    const regent = guardAt(world, 1, 0, 'telegraph', PILOT_SKILLS.steady.reactionMs, 4);
    regent.archetype = 'glass_regent';
    regent.warded = true;
    regent.state.attackIndex = combat.enemies.glass_regent.attacks.findIndex(
      (attack) => attack.kind === 'shockwave',
    );

    const out = new Pilot(PILOT_SKILLS.steady, 3).intent(world, combat);

    expect(out.move.x).toBeLessThan(0);
    expect(out.move.y).toBeLessThan(0);
    expect(out.guardPressed).toBeFalsy();
  });

  it('never schedules consecutive shard obligations inside one legal shield cycle', () => {
    const result = run('glass_regent');
    const impacts = result.record.events.filter(
      (event) => event.type === 'parry_success' || event.type === 'parry_failed',
    );
    const minimumGapMs = impacts.slice(1).reduce(
      (minimum, event, index) =>
        Math.min(minimum, (event.tick - impacts[index].tick) * TICK_MS),
      Number.POSITIVE_INFINITY,
    );
    const parry = cfg().player.parry;
    const legalCycleMs = parry.onsetMs + parry.perfectMs + parry.lateMs;

    expect(result.replayOk).toBe(true);
    expect(minimumGapMs).toBeGreaterThan(legalCycleMs);
  });
});

describe('the pilot reads the second blow, not only the nearest', () => {
  it('steps out of a pincer the shield cannot cover', () => {
    const combat = cfg();
    const world = bareWorld(combat);
    telegraphingAt(world, 1, 0, 600);
    telegraphingAt(world, 2, 180, 560);

    const out = new Pilot(PILOT_SKILLS.steady, 3).intent(world, combat);

    expect(out.stepPressed).toBe(true);
    expect(out.guardPressed).toBeFalsy();
  });

  it('still parries when both blows fall inside the shield', () => {
    const combat = cfg();
    const world = bareWorld(combat);
    telegraphingAt(world, 1, 0, 600);
    telegraphingAt(world, 2, 40, 560);

    const out = new Pilot(PILOT_SKILLS.steady, 3).intent(world, combat);

    expect(out.guardPressed).toBe(true);
    expect(out.stepPressed).toBeFalsy();
  });

  it('answers a duel exactly as it did before', () => {
    const combat = cfg();
    const world = bareWorld(combat);
    telegraphingAt(world, 1, 0, 600);

    const out = new Pilot(PILOT_SKILLS.steady, 3).intent(world, combat);

    expect(out.guardPressed).toBe(true);
    expect(out.stepPressed).toBeFalsy();
  });

  it('walks out of the pincer rather than standing in it when the step is unaffordable', () => {
    const combat = cfg();
    const world = bareWorld(combat);
    world.players[0].stamina = 0;
    telegraphingAt(world, 1, 0, 600);
    telegraphingAt(world, 2, 180, 560);

    const out = new Pilot(PILOT_SKILLS.steady, 3).intent(world, combat);

    expect(out.stepPressed).toBeFalsy();
    expect(out.move.x === 0 && out.move.y === 0).toBe(false);
  });

  it('still reproduces the encounter built out of overlapping waves', () => {
    const result = run('overlap_court');

    expect(result.metrics.outcome).not.toBe('running');
    expect(result.replayOk).toBe(true);
    expect(result.divergedAtTick).toBeNull();
  });
});

describe('the pilot stands off a swing it cannot parry', () => {
  const closingSpeed = (
    kind: Enemy['state']['kind'],
    archetype: 'guard' | 'duelist',
    distance: number,
  ) => {
    const combat = cfg();
    const world = bareWorld(combat);
    const enemy = guardAt(world, 1, 0, kind, 0, distance);
    enemy.archetype = archetype;
    return new Pilot(PILOT_SKILLS.steady, 3).intent(world, combat).move.x;
  };

  it('closes on a guard, whose every swing can be parried', () => {
    expect(closingSpeed('approach', 'guard', 3.3)).toBeGreaterThan(0);
  });

  it('gives ground to a duelist at that same distance, because of the sweep', () => {
    expect(closingSpeed('approach', 'duelist', 2.9)).toBeLessThan(0);
  });

  it('closes on the duelist at that distance when the pilot does not space', () => {
    const combat = cfg();
    const world = bareWorld(combat);
    const enemy = guardAt(world, 1, 0, 'approach', 0, 2.9);
    enemy.archetype = 'duelist';

    expect(new Pilot(PILOT_SKILLS.bold, 3).intent(world, combat).move.x).toBeGreaterThan(0);
  });

  it('closes on the duelist the moment it is open', () => {
    expect(closingSpeed('stagger', 'duelist', 3.3)).toBeGreaterThan(0);
  });
});

describe('a retreat from an unparryable swing survives the movement block', () => {
  it('walks away from the swing rather than orbiting into it', () => {
    const combat = cfg();
    const world = bareWorld(combat);
    const enemy = guardAt(world, 1, 0, 'telegraph', 300, 2.6);
    enemy.archetype = 'duelist';
    enemy.state.attackIndex = 1;

    const out = new Pilot(PILOT_SKILLS.steady, 3).intent(world, combat);

    expect(out.move.x).toBeLessThan(0);
    expect(out.guardPressed).toBeFalsy();
  });
});
