
import { DEFAULT_COMBAT, SLOWMO_PRESETS } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import { telegraphProgress } from '../src/render/draw';
import { createWorld } from '../src/sim/encounter';
import type { Enemy, Intent, SimEvent, World } from '../src/sim/types';
import { NEUTRAL_INTENT } from '../src/sim/types';
import { stepWorld } from '../src/sim/world';

const combat = () => structuredClone(DEFAULT_COMBAT);
const encounter = ENCOUNTERS.captain;

const makeWorld = () => {
  const cfg = combat();
  const world = createWorld(encounter, cfg, 31);
  stepWorld(world, [NEUTRAL_INTENT], cfg, SLOWMO_PRESETS.none, encounter);
  const boss = world.enemies[0];
  if (boss?.archetype !== 'captain') {
    throw new Error('captain did not spawn its mechanical subject');
  }
  return { world, boss, cfg };
};

const armFeint = (world: World, boss: Enemy): void => {
  world.players[0].pos = { x: 0, y: 0 };
  world.players[0].facing = 0;
  boss.pos = { x: 1.7, y: 0 };
  boss.facing = Math.PI;
  boss.state = {
    kind: 'telegraph',
    enteredTick: world.tick,
    elapsedMs: 0,
    attackIndex: 1,
    telegraphJitterMs: 0,
    struck: [],
  };
  world.events.length = 0;
};

const step = (
  world: World,
  cfg: ReturnType<typeof combat>,
  input: Intent = NEUTRAL_INTENT,
): SimEvent[] => {
  stepWorld(world, [input], cfg, SLOWMO_PRESETS.none, encounter);
  return [...world.events];
};

const runUntilEvent = (
  world: World,
  cfg: ReturnType<typeof combat>,
  type: SimEvent['type'],
  input: Intent = NEUTRAL_INTENT,
  maxTicks = 300,
): SimEvent => {
  for (let i = 0; i < maxTicks; i++) {
    const found = step(world, cfg, input).find((event) => event.type === type);
    if (found !== undefined) return found;
  }
  throw new Error(`${type} did not occur within ${maxTicks} ticks`);
};

describe('the authored response pattern', () => {
  it('teaches the three honest reads before phase two introduces the feint', () => {
    const { world, cfg } = makeWorld();
    world.players[0].facing = -Math.PI / 2;
    const ids: string[] = [];
    let blocks = 0;
    const held: Intent = {
      ...NEUTRAL_INTENT,
      facing: -Math.PI / 2,
      guardHeld: true,
      guardPressed: true,
    };

    for (let i = 0; i < 1800 && blocks < 5; i++) {
      const events = step(world, cfg, held);
      for (const event of events) {
        if (event.type === 'enemy_telegraph') ids.push(String(event.data?.attackId));
        if (event.type === 'guard_success') blocks += 1;
      }
      held.guardPressed = false;
    }

    expect(ids).toEqual([
      'captain_direct',
      'captain_pressure',
      'captain_release',
      'captain_direct',
      'captain_pressure',
    ]);
    expect(blocks).toBe(5);
    expect(world.players[0].stamina).toBe(0);
    expect(world.players[0].state.kind).not.toBe('stagger');
  });

  it('lets a false-release parry and its lockout finish before the real hit', () => {
    const cfg = combat();
    const def = cfg.enemies.captain.attacks[1];
    const parry = cfg.player.parry;
    const attemptLifetime = parry.onsetMs + parry.perfectMs + parry.lateMs;
    const recoveryBudget = attemptLifetime + parry.whiffLockoutMs + parry.onsetMs;

    expect(def.feint).toBeDefined();
    expect(def.telegraphMs - (def.feint?.atMs ?? 0)).toBeGreaterThanOrEqual(recoveryBudget);
  });

  it('leaves a human response window after direct and feint visibly diverge', () => {
    const cfg = combat();
    const direct = cfg.enemies.captain.attacks[0];
    const feint = cfg.enemies.captain.attacks[1];
    const branchAtMs = feint.feint?.atMs ?? Number.POSITIVE_INFINITY;
    const readableBranchMs = 200 + cfg.player.parry.onsetMs;

    expect(direct.telegraphMs - branchAtMs).toBeGreaterThanOrEqual(readableBranchMs);
  });

  it('keeps even the fast read visible for at least 400ms and separates each beat', () => {
    const cfg = combat();
    const pressure = cfg.enemies.captain.attacks[2];

    expect(pressure.telegraphMs).toBeGreaterThanOrEqual(400);
    expect(pressure.recoveryMs).toBeGreaterThanOrEqual(200);
    expect(cfg.enemies.captain.attackCooldownMs).toBeGreaterThanOrEqual(300);
  });
});

describe('the four reads are separable by shape', () => {
  const attacks = () => combat().enemies.captain.attacks;
  const byId = (id: string) => {
    const def = attacks().find((a) => a.id === id);
    if (def === undefined) throw new Error(`${id} is not in the Captain's kit`);
    return def;
  };

  it('makes the jab visibly small and the punish visibly huge', () => {
    const pressure = byId('captain_pressure');
    const release = byId('captain_release');

    expect(release.range - pressure.range).toBeGreaterThan(1);
    expect(release.arcDeg - pressure.arcDeg).toBeGreaterThan(80);
  });

  it('orders the three honest reads by size with a gap at each step', () => {
    const ordered = ['captain_pressure', 'captain_direct', 'captain_release'].map(byId);

    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].range - ordered[i - 1].range).toBeGreaterThan(0.35);
      expect(ordered[i].arcDeg - ordered[i - 1].arcDeg).toBeGreaterThan(30);
    }
  });

  it('gives the feint the exact wedge of the strike it imitates', () => {
    const direct = byId('captain_direct');
    const feint = byId('captain_feint');

    expect(feint.range).toBe(direct.range);
    expect(feint.arcDeg).toBe(direct.arcDeg);
    expect(feint.lungeDistance).toBe(direct.lungeDistance);
    expect(feint.feint).toBeDefined();
    expect(direct.feint).toBeUndefined();
  });

  it('leaves even the smallest read able to land at the stand-off band', () => {
    const cfg = combat();
    const ecfg = cfg.enemies.captain;
    const smallest = byId('captain_pressure');

    expect(smallest.range + cfg.player.radius).toBeGreaterThan(ecfg.preferredRange);
  });
});

describe('the phase-two response pattern', () => {
  const reachPhaseTwo = (
    world: World,
    boss: Enemy,
    cfg: ReturnType<typeof combat>,
  ): void => {
    boss.hp = boss.maxHp * (cfg.enemies.captain.boss?.phaseTwoHpFraction ?? 0.5);
    for (let i = 0; i < 400 && boss.phase !== 2; i++) step(world, cfg);
    if (boss.phase !== 2) throw new Error('the response boss never reached phase two');
    world.players[0].hp = cfg.player.maxHp;
    world.players[0].stamina = cfg.player.maxStamina;
    world.players[0].parryLockoutMs = 0;
  };

  it('opens the new phrase at its own first slot rather than mid-cycle', () => {
    const { world, boss, cfg } = makeWorld();
    world.players[0].facing = -Math.PI / 2;
    for (let i = 0; i < 400; i++) step(world, cfg);
    expect(boss.patternStep ?? 0).toBeGreaterThan(0);

    reachPhaseTwo(world, boss, cfg);

    expect(boss.patternStep).toBe(0);
  });

  it('spends one more block than the bar can pay for, and breaks the held guard', () => {
    const { world, boss, cfg } = makeWorld();
    world.players[0].facing = -Math.PI / 2;
    reachPhaseTwo(world, boss, cfg);
    const ids: string[] = [];
    let blocks = 0;
    let broken: SimEvent | undefined;
    const held: Intent = {
      ...NEUTRAL_INTENT,
      facing: -Math.PI / 2,
      guardHeld: true,
      guardPressed: true,
    };

    for (let i = 0; i < 1800 && broken === undefined; i++) {
      for (const event of step(world, cfg, held)) {
        if (event.type === 'enemy_telegraph') ids.push(String(event.data?.attackId));
        if (event.type === 'guard_success') blocks += 1;
        if (event.type === 'guard_broken') broken = event;
      }
      held.guardPressed = false;
    }

    expect(ids).toEqual([
      'captain_direct',
      'captain_feint',
      'captain_pressure',
      'captain_pressure',
      'captain_pressure',
      'captain_release',
    ]);
    expect(blocks).toBe(5);
    expect(broken?.data?.attackId).toBe('captain_release');
    expect(world.players[0].state.kind).toBe('stagger');
  });

  it('leaves the phrase survivable for a player who parries instead of holding', () => {
    const { boss, cfg } = makeWorld();
    const phrase = cfg.enemies.captain.attackPatternPhaseTwo ?? [];
    const guardCost = cfg.player.guard.staminaPerHit * phrase.length;

    expect(phrase).toHaveLength(6);
    expect(guardCost).toBeGreaterThan(cfg.player.maxStamina);
    expect(cfg.player.parry.staminaReward).toBeGreaterThan(0);
    expect(boss.phase ?? 1).toBe(1);
  });
});

describe('the guard that only an earned swing passes', () => {
  const guard = () => combat().enemies.captain.defence!;

  const pin = (world: World, boss: Enemy, kind: Enemy['state']['kind'] = 'approach'): void => {
    world.players[0].pos = { x: 0, y: 0 };
    world.players[0].facing = 0;
    boss.pos = { x: 1.5, y: 0 };
    boss.facing = Math.PI;
    boss.attackCooldownMs = 5000;
    boss.state = {
      kind,
      enteredTick: world.tick,
      elapsedMs: 0,
      attackIndex: 0,
      telegraphJitterMs: 0,
      struck: [],
    };
    world.events.length = 0;
  };

  const makeNeutral = (kind: Enemy['state']['kind'] = 'approach') => {
    const { world, boss, cfg } = makeWorld();
    for (let i = 0; i < 900 && boss.state.kind === 'entrance_fall'; i++) step(world, cfg);
    for (let i = 0; i < 900 && boss.state.kind === 'entrance_roar'; i++) step(world, cfg);
    pin(world, boss, kind);
    return { world, boss, cfg };
  };

  const swing = (
    world: World,
    cfg: ReturnType<typeof combat>,
    kind: 'light' | 'heavy',
    maxTicks = 200,
  ): SimEvent[] => {
    const collected: SimEvent[] = [];
    const press: Intent = {
      ...NEUTRAL_INTENT,
      facing: 0,
      lightPressed: kind === 'light',
      heavyPressed: kind === 'heavy',
    };
    for (let i = 0; i < maxTicks; i++) {
      collected.push(...step(world, cfg, i === 0 ? press : { ...NEUTRAL_INTENT, facing: 0 }));
      if (
        collected.some(
          (e) =>
            e.type === 'enemy_blocked' || e.type === 'enemy_parried' || e.type === 'hit_landed',
        )
      ) {
        break;
      }
    }
    return collected;
  };

  it('absorbs an unearned light for chip and no poise', () => {
    const { world, boss, cfg } = makeNeutral();
    const light = cfg.player.attacks.light;
    const startHp = boss.hp;

    const blocked = swing(world, cfg, 'light').find((e) => e.type === 'enemy_blocked');

    expect(blocked).toBeDefined();
    expect(blocked?.data?.damage).toBeCloseTo(light.damage * guard().chipFraction);
    expect(startHp - boss.hp).toBeCloseTo(light.damage * guard().chipFraction);
    expect(boss.poise).toBe(boss.maxPoise);
  });

  it('absorbs an unearned heavy as well', () => {
    const { world, boss, cfg } = makeNeutral();
    const heavy = cfg.player.attacks.heavy;
    const startHp = boss.hp;

    const events = swing(world, cfg, 'heavy');

    expect(events.some((e) => e.type === 'hit_landed')).toBe(false);
    expect(startHp - boss.hp).toBeCloseTo(heavy.damage * guard().chipFraction);
    expect(boss.poise).toBe(boss.maxPoise);
  });

  it('lets the heavy a parry paid for land in full, at full poise', () => {
    const { world, boss, cfg } = makeNeutral();
    const heavy = cfg.player.attacks.heavy;
    world.players[0].riposteWindowMs = cfg.player.parry.riposteWindowMs;
    const startHp = boss.hp;

    const landed = swing(world, cfg, 'heavy').find((e) => e.type === 'hit_landed');

    expect(landed).toBeDefined();
    expect(startHp - boss.hp).toBeCloseTo(heavy.damage);
    expect(boss.maxPoise - boss.poise).toBeCloseTo(heavy.poiseDamage, 0);
  });

  it('lets a light thrown inside the same window land in full', () => {
    const { world, boss, cfg } = makeNeutral();
    world.players[0].riposteWindowMs = cfg.player.parry.riposteWindowMs;
    const startHp = boss.hp;

    const landed = swing(world, cfg, 'light').find((e) => e.type === 'hit_landed');

    expect(landed).toBeDefined();
    expect(startHp - boss.hp).toBeCloseTo(cfg.player.attacks.light.damage);
  });

  it('does not guard what it cannot see', () => {
    const { world, boss, cfg } = makeNeutral();
    boss.facing = 0;
    const startHp = boss.hp;

    const events = swing(world, cfg, 'light');

    expect(events.some((e) => e.type === 'enemy_blocked')).toBe(false);
    expect(startHp - boss.hp).toBeCloseTo(cfg.player.attacks.light.damage);
  });
});

describe('a committed Captain is punishable exactly as any other body', () => {
  const committed = ['telegraph', 'attack', 'recovery', 'stagger'] as const;

  for (const kind of committed) {
    it(`lets an unearned light land in full during ${kind}`, () => {
      const { world, boss, cfg } = makeWorld();
      world.players[0].pos = { x: 0, y: 0 };
      world.players[0].facing = 0;
      boss.pos = { x: 1.5, y: 0 };
      boss.facing = Math.PI;
      boss.attackCooldownMs = 5000;
      boss.state = {
        kind,
        enteredTick: world.tick,
        elapsedMs: 0,
        attackIndex: 0,
        telegraphJitterMs: 0,
        struck: [],
      };
      world.events.length = 0;
      const startHp = boss.hp;

      const press: Intent = { ...NEUTRAL_INTENT, facing: 0, lightPressed: true };
      const collected: SimEvent[] = [];
      for (let i = 0; i < 200; i++) {
        collected.push(...step(world, cfg, i === 0 ? press : { ...NEUTRAL_INTENT, facing: 0 }));
        if (collected.some((e) => e.type === 'hit_landed' || e.type === 'enemy_blocked')) break;
      }

      expect(collected.some((e) => e.type === 'enemy_blocked')).toBe(false);
      expect(collected.some((e) => e.type === 'hit_landed')).toBe(true);
      expect(startHp - boss.hp).toBeCloseTo(cfg.player.attacks.light.damage);
    });
  }
});

describe('every third absorption is answered', () => {
  const pin = (world: World, boss: Enemy): void => {
    world.players[0].pos = { x: 0, y: 0 };
    world.players[0].facing = 0;
    world.players[0].hp = 100;
    boss.pos = { x: 1.5, y: 0 };
    boss.facing = Math.PI;
    boss.attackCooldownMs = 5000;
    boss.state = {
      kind: 'approach',
      enteredTick: world.tick,
      elapsedMs: 0,
      attackIndex: 0,
      telegraphJitterMs: 0,
      struck: [],
    };
  };

  const pokeUntilAnswered = (
    world: World,
    boss: Enemy,
    cfg: ReturnType<typeof combat>,
  ): { events: SimEvent[]; blocks: number } => {
    let blocks = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      pin(world, boss);
      world.players[0].stamina = cfg.player.maxStamina;
      world.players[0].state = {
        kind: 'idle',
        enteredTick: world.tick,
        elapsedMs: 0,
        attack: null,
        struck: [],
      };
      const press: Intent = { ...NEUTRAL_INTENT, facing: 0, lightPressed: true };
      const collected: SimEvent[] = [];
      for (let i = 0; i < 200; i++) {
        collected.push(...step(world, cfg, i === 0 ? press : { ...NEUTRAL_INTENT, facing: 0 }));
        const answered = collected.find(
          (e) => e.type === 'enemy_parried' || e.type === 'enemy_blocked',
        );
        if (answered?.type === 'enemy_parried') return { events: collected, blocks };
        if (answered !== undefined) {
          blocks += 1;
          break;
        }
      }
    }
    throw new Error('the Captain never answered a poke');
  };

  it('parries the third one, taking no damage and no poise for it', () => {
    const { world, boss, cfg } = makeWorld();
    const startHp = boss.hp;
    const startPoise = boss.poise;

    const { events, blocks } = pokeUntilAnswered(world, boss, cfg);
    const parried = events.find((e) => e.type === 'enemy_parried');
    const chip = cfg.player.attacks.light.damage * cfg.enemies.captain.defence!.chipFraction;

    expect(blocks).toBe(2);
    expect(parried?.data?.absorbs).toBe(3);
    expect(parried?.data?.attack).toBe('light');
    expect(startHp - boss.hp).toBeCloseTo(chip * 2);
    expect(boss.poise).toBe(startPoise);
  });

  it('charges the king the bar, the stagger and the initiative', () => {
    const { world, boss, cfg } = makeWorld();
    const counter = cfg.enemies.captain.defence!.unearned!;

    const { events } = pokeUntilAnswered(world, boss, cfg);
    const parried = events.find((e) => e.type === 'enemy_parried');
    const king = world.players[0];

    expect(parried?.data?.staminaCost).toBe(counter.parryStaminaCost);
    expect(king.stamina).toBeCloseTo(
      cfg.player.maxStamina - cfg.player.attacks.light.staminaCost - counter.parryStaminaCost,
    );
    expect(king.state.kind).toBe('stagger');
    expect(boss.attackCooldownMs).toBeLessThanOrEqual(counter.counterCooldownMs);
  });

  it('keeps the king staggered instead of releasing him into a recovery', () => {
    const { world, boss, cfg } = makeWorld();
    const { events } = pokeUntilAnswered(world, boss, cfg);

    expect(events.some((e) => e.type === 'enemy_parried')).toBe(true);
    for (let i = 0; i < 20; i++) {
      step(world, cfg, { ...NEUTRAL_INTENT, facing: 0 });
      expect(world.players[0].state.kind).toBe('stagger');
    }
    expect(boss.hp).toBeGreaterThan(0);
  });
});

describe('the trade the punish window is supposed to be', () => {
  it('moves him a quarter as far as a full-mass body on the same heavy', () => {
    const { world, boss, cfg } = makeWorld();
    world.players[0].pos = { x: 0, y: 0 };
    world.players[0].facing = 0;
    boss.pos = { x: 1.5, y: 0 };
    boss.facing = Math.PI;
    boss.vel = { x: 0, y: 0 };
    boss.state = {
      kind: 'attack',
      enteredTick: world.tick,
      elapsedMs: 0,
      attackIndex: 0,
      telegraphJitterMs: 0,
      struck: [],
    };
    const scale = cfg.enemies.captain.knockbackScale ?? 1;

    const press: Intent = { ...NEUTRAL_INTENT, facing: 0, heavyPressed: true };
    let landed = false;
    for (let i = 0; i < 200 && !landed; i++) {
      landed = step(world, cfg, i === 0 ? press : { ...NEUTRAL_INTENT, facing: 0 }).some(
        (e) => e.type === 'hit_landed',
      );
    }

    expect(landed).toBe(true);
    expect(scale).toBeLessThan(1);
    expect(boss.vel.x).toBeGreaterThan(0);
    expect(boss.vel.x).toBeLessThanOrEqual(cfg.player.attacks.heavy.knockback * scale);
    expect(boss.vel.x).toBeLessThan(cfg.player.attacks.heavy.knockback * 0.5);
  });
});

describe('the call for help', () => {
  const call = () => combat().enemies.captain.summon!;

  const runPhrases = (
    world: World,
    cfg: ReturnType<typeof combat>,
    ticks: number,
  ): SimEvent[] => {
    const collected: SimEvent[] = [];
    for (let i = 0; i < ticks; i++) {
      world.players[0].hp = cfg.player.maxHp;
      collected.push(...step(world, cfg));
    }
    return collected;
  };

  const intoPhaseTwo = (world: World, boss: Enemy, cfg: ReturnType<typeof combat>): void => {
    boss.hp = boss.maxHp * (cfg.enemies.captain.boss?.phaseTwoHpFraction ?? 0.5);
    for (let i = 0; i < 600 && boss.phase !== 2; i++) {
      world.players[0].hp = cfg.player.maxHp;
      step(world, cfg);
    }
    if (boss.phase !== 2) throw new Error('the Captain never reached phase two');
  };

  it('calls nobody while phase one is still teaching the reads', () => {
    const { world, boss, cfg } = makeWorld();
    const phrase = cfg.enemies.captain.attackPattern ?? [];

    const events = runPhrases(world, cfg, 3000);

    expect(boss.phase ?? 1).toBe(1);
    expect((boss.patternStep ?? 0) / phrase.length).toBeGreaterThan(1);
    expect(events.some((e) => e.type === 'enemy_summoned')).toBe(false);
    expect(world.enemies).toHaveLength(1);
  });

  it('calls two guards once phase two has spoken a complete phrase', () => {
    const { world, boss, cfg } = makeWorld();
    intoPhaseTwo(world, boss, cfg);
    const phrase = cfg.enemies.captain.attackPatternPhaseTwo ?? [];

    let summoned: SimEvent | undefined;
    for (let i = 0; i < 3000 && summoned === undefined; i++) {
      world.players[0].hp = cfg.player.maxHp;
      summoned = step(world, cfg).find((e) => e.type === 'enemy_summoned');
    }

    expect(summoned).toBeDefined();
    expect(summoned?.actor).toBe(boss.id);
    expect(summoned?.data?.archetype).toBe('guard');
    expect(summoned?.data?.count).toBe(call().offsets.length);
    expect(summoned?.data?.phase).toBe(2);
    expect(Number(summoned?.data?.phrase)).toBeGreaterThanOrEqual(1);
    expect(boss.patternStep ?? 0).toBeGreaterThanOrEqual(phrase.length);

    const guards = world.enemies.filter((e) => e.archetype === 'guard');
    expect(guards).toHaveLength(2);
    for (const guard of guards) {
      const behind =
        (guard.pos.x - boss.pos.x) * Math.cos(boss.facing) +
        (guard.pos.y - boss.pos.y) * Math.sin(boss.facing);
      expect(behind).toBeLessThan(0);
      expect(Math.abs(guard.pos.x)).toBeLessThanOrEqual(world.arena.halfExtents.x);
      expect(Math.abs(guard.pos.y)).toBeLessThanOrEqual(world.arena.halfExtents.y);
      expect(guard.attackCooldownMs).toBeGreaterThan(0);
    }
  });

  it('does not stack a second pair while the first is standing', () => {
    const { world, boss, cfg } = makeWorld();
    intoPhaseTwo(world, boss, cfg);
    const events = runPhrases(world, cfg, 6000);
    const calls = events.filter((e) => e.type === 'enemy_summoned');

    expect(calls.length).toBeGreaterThan(0);
    expect(world.enemies.filter((e) => e.archetype === 'guard' && e.state.kind !== 'dead').length)
      .toBeLessThanOrEqual(call().maxAlive);
  });

  it('calls again once the room has been cleared of the last pair', () => {
    const { world, boss, cfg } = makeWorld();
    intoPhaseTwo(world, boss, cfg);
    runPhrases(world, cfg, 3000);
    const first = world.enemies.filter((e) => e.archetype === 'guard');
    expect(first.length).toBe(2);

    for (const guard of first) {
      guard.hp = 0;
      guard.state = {
        kind: 'dead',
        enteredTick: world.tick,
        elapsedMs: 0,
        attackIndex: 0,
        telegraphJitterMs: 0,
        struck: [],
      };
    }

    const events = runPhrases(world, cfg, 4000);

    expect(events.some((e) => e.type === 'enemy_summoned')).toBe(true);
    expect(world.enemies.filter((e) => e.archetype === 'guard').length).toBeGreaterThan(2);
  });
});

describe('the feint decision', () => {
  it('emits one factual false-release event and visibly retracts the telegraph', () => {
    const { world, boss, cfg } = makeWorld();
    armFeint(world, boss);
    const def = cfg.enemies.captain.attacks[1];
    const feint = def.feint!;
    const event = runUntilEvent(world, cfg, 'enemy_feint');

    expect(event.data?.attackId).toBe('captain_feint');
    expect(event.data?.remainingMs).toBeGreaterThan(500);
    expect(telegraphProgress(def, feint.atMs - 1)).toBeGreaterThan(0.9);
    expect(telegraphProgress(def, feint.atMs + feint.resetMs)).toBeCloseTo(0.2, 2);
    expect(telegraphProgress(def, def.telegraphMs)).toBe(1);
  });

  it('does not let one early tap cover the real hit, but lets its lockout expire in time', () => {
    const { world, boss, cfg } = makeWorld();
    armFeint(world, boss);
    runUntilEvent(world, cfg, 'enemy_feint');

    step(world, cfg, { ...NEUTRAL_INTENT, guardPressed: true });
    const hit = runUntilEvent(world, cfg, 'hit_received');

    expect(hit.data?.attackId).toBe('captain_feint');
    expect(hit.data?.reason).toBe('open');
    expect(world.players[0].parryLockoutMs).toBe(0);
  });

  it('allows an early feint reaction to recover and parry the real release', () => {
    const { world, boss, cfg } = makeWorld();
    armFeint(world, boss);
    const def = cfg.enemies.captain.attacks[1];
    runUntilEvent(world, cfg, 'enemy_feint');
    step(world, cfg, { ...NEUTRAL_INTENT, guardPressed: true });

    for (
      let i = 0;
      i < 120 &&
      boss.state.kind === 'telegraph' &&
      boss.state.elapsedMs < def.telegraphMs - 110;
      i++
    ) {
      step(world, cfg);
    }
    expect(world.players[0].parryLockoutMs).toBe(0);

    const held = { ...NEUTRAL_INTENT, guardHeld: true, guardPressed: true };
    step(world, cfg, held);
    held.guardPressed = false;
    const parried = runUntilEvent(world, cfg, 'parry_success', held, 40);

    expect(parried.data?.attackId).toBe('captain_feint');
  });

  it('lets the same early read become a costly safe block when guard stays held', () => {
    const { world, boss, cfg } = makeWorld();
    armFeint(world, boss);
    runUntilEvent(world, cfg, 'enemy_feint');
    const held = { ...NEUTRAL_INTENT, guardHeld: true, guardPressed: true };

    step(world, cfg, held);
    held.guardPressed = false;
    const blocked = runUntilEvent(world, cfg, 'guard_success', held);

    expect(blocked.data?.attackId).toBe('captain_feint');
    expect(blocked.data?.viaLateParry).toBe(false);
    expect(world.players[0].stamina).toBe(80);
    expect(world.players[0].hp).toBeCloseTo(100 - 20 * cfg.player.guard.chipFraction);
  });

  it('rewards the second read with a perfect parry and a riposte window', () => {
    const { world, boss, cfg } = makeWorld();
    armFeint(world, boss);
    const def = cfg.enemies.captain.attacks[1];
    boss.state.elapsedMs = def.telegraphMs - 110;
    world.players[0].stamina = 40;
    const held = { ...NEUTRAL_INTENT, guardHeld: true, guardPressed: true };

    step(world, cfg, held);
    held.guardPressed = false;
    const parried = runUntilEvent(world, cfg, 'parry_success', held, 40);

    expect(parried.data?.attackId).toBe('captain_feint');
    expect(world.players[0].stamina).toBe(65);
    expect(world.players[0].riposteWindowMs).toBeGreaterThan(0);
    expect(boss.poise).toBe(240 - cfg.player.parry.poiseDamage);
  });
});
