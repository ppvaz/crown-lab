
import type { CombatConfig, Enemy, World } from '../src/sim/types';
import { NEUTRAL_INTENT, enemyIsInvulnerable } from '../src/sim/types';
import { spawnVolleyShard, stepProjectiles } from '../src/sim/projectile';
import { stepEnemy } from '../src/sim/enemy';
import { stepPlayer } from '../src/sim/player';
import { dist } from '../src/sim/vec';
import { resolvePlayerAttack } from '../src/sim/combat';
import { bareWorld, cfg, countOf, firstOf, ticksFor } from './support/world';

const TICK = 1000 / 120;

const regentWorld = (): { w: World; c: CombatConfig; boss: Enemy } => {
  const c = cfg();
  const w = bareWorld(c);
  w.players[0].pos = { x: 6, y: 0 };
  const ecfg = c.enemies.glass_regent;
  const boss: Enemy = {
    id: 99,
    archetype: 'glass_regent',
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    facing: 0,
    hp: ecfg.maxHp,
    maxHp: ecfg.maxHp,
    poise: ecfg.maxPoise,
    maxPoise: ecfg.maxPoise,
    state: { kind: 'idle', enteredTick: 0, elapsedMs: 0, attackIndex: 0, telegraphJitterMs: 0, struck: [] },
    attackCooldownMs: 0,
    phase: 1,
    patternStep: 0,
    warded: true,
  };
  w.enemies.push(boss);
  return { w, c, boss };
};

const serve = (w: World, c: CombatConfig, boss: Enemy, at = { x: 1, y: 0 }) =>
  spawnVolleyShard(w, c, boss.pos, at, 8, 16, boss.id, c.enemies.glass_regent.volley!);

const parrying = (w: World, elapsedMs: number): void => {
  w.players[0].state = {
    kind: 'parry',
    enteredTick: w.tick,
    elapsedMs,
    attack: null,
    struck: [],
  };
};

const perfectMs = (c: CombatConfig): number =>
  c.player.parry.onsetMs + c.player.parry.perfectMs / 2;

describe('the ward', () => {
  it('makes him untouchable while it is up, and touchable the moment it is not', () => {
    const { boss } = regentWorld();
    expect(enemyIsInvulnerable(boss)).toBe(true);
    boss.warded = false;
    expect(enemyIsInvulnerable(boss)).toBe(false);
  });

  it('leaves every other body in the cast exactly as it was', () => {
    const { boss } = regentWorld();
    const guard: Enemy = { ...boss, archetype: 'guard', warded: undefined };
    expect(enemyIsInvulnerable(guard)).toBe(false);
  });
});

describe('the fuse', () => {
  it('spends one point of integrity per return and speeds the shard up', () => {
    const { w, c, boss } = regentWorld();
    const volley = c.enemies.glass_regent.volley!;
    const shard = serve(w, c, boss);
    expect(shard.shardIntegrity).toBe(volley.integrity);

    const before = Math.hypot(shard.vel.x, shard.vel.y);
    parrying(w, perfectMs(c));
    shard.pos = { ...w.players[0].pos };
    stepProjectiles(w, c, TICK);

    expect(shard.shardIntegrity).toBe(volley.integrity - 1);
    const after = Math.hypot(shard.vel.x, shard.vel.y);
    expect(after).toBeGreaterThan(before);
    expect(after / before).toBeCloseTo(volley.speedScalePerReturn, 5);
  });

  it('never falls below zero, so a spent shard keeps travelling instead of going negative', () => {
    const { w, c, boss } = regentWorld();
    const shard = serve(w, c, boss);
    shard.shardIntegrity = 0;
    parrying(w, perfectMs(c));
    shard.pos = { ...w.players[0].pos };
    stepProjectiles(w, c, TICK);
    expect(shard.shardIntegrity).toBe(0);
  });
});

describe('the rebuke, which is a picture and not a rule', () => {

  it('starts the beat when he sends a shard back', () => {
    const { w, c, boss } = regentWorld();
    const volley = c.enemies.glass_regent.volley!;
    const shard = serve(w, c, boss);
    expect(boss.rebukeMs ?? 0).toBe(0);

    shard.pos = { ...boss.pos };
    shard.hostileTo = 'enemy';
    stepProjectiles(w, c, TICK);

    expect(boss.rebukeMs).toBe(volley.rebukeMs);
  });

  it('does not start on the king\'s own return, which is a parry and has its own state', () => {
    const { w, c, boss } = regentWorld();
    const shard = serve(w, c, boss);
    parrying(w, perfectMs(c));
    shard.pos = { ...w.players[0].pos };
    stepProjectiles(w, c, TICK);

    expect(shard.reflected).toBe(true);
    expect(boss.rebukeMs ?? 0).toBe(0);
  });

  it('runs down on the dt it is given, so slow motion slows it', () => {
    const { w, c, boss } = regentWorld();
    const volley = c.enemies.glass_regent.volley!;
    boss.rebukeMs = volley.rebukeMs;
    stepEnemy(w, boss, c, TICK / 2);
    expect(boss.rebukeMs).toBeCloseTo(volley.rebukeMs - TICK / 2, 6);
  });

  it('ends, and never goes negative', () => {
    const { w, c, boss } = regentWorld();
    boss.rebukeMs = 4;
    stepEnemy(w, boss, c, TICK);
    expect(boss.rebukeMs).toBe(0);
  });

  it('gates nothing: he answers the next shard mid-rebuke exactly as he would without one', () => {
    const { w, c, boss } = regentWorld();
    const volley = c.enemies.glass_regent.volley!;
    const shard = serve(w, c, boss);
    boss.rebukeMs = volley.rebukeMs;
    const before = shard.shardIntegrity;
    shard.pos = { ...boss.pos };
    shard.hostileTo = 'enemy';
    stepProjectiles(w, c, TICK);
    expect(shard.shardIntegrity).toBe((before ?? 0) - 1);
  });
});

describe('the shatter, and who it lands on', () => {
  it('breaks on the Regent when the king returns a spent shard, and staggers him for it', () => {
    const { w, c, boss } = regentWorld();
    const volley = c.enemies.glass_regent.volley!;
    const shard = serve(w, c, boss);
    shard.shardIntegrity = 0;
    shard.hostileTo = 'enemy';
    shard.pos = { ...boss.pos };
    w.events.length = 0;
    stepProjectiles(w, c, TICK);

    const broke = firstOf(w.events, 'volley_shattered');
    expect(broke?.data?.on).toBe('enemy');
    expect(boss.state.kind).toBe('stagger');
    expect(boss.staggerOverrideMs).toBe(volley.shatterStaggerMs);
    expect(boss.warded).toBe(false);
    expect(enemyIsInvulnerable(boss)).toBe(false);
  });

  it('breaks on the king when he fails to answer it, and does not stagger the Regent', () => {
    const { w, c, boss } = regentWorld();
    const shard = serve(w, c, boss);
    shard.shardIntegrity = 0;
    shard.pos = { ...w.players[0].pos };
    const hpBefore = w.players[0].hp;
    w.events.length = 0;
    stepProjectiles(w, c, TICK);

    const broke = firstOf(w.events, 'volley_shattered');
    expect(broke?.data?.on).toBe('player');
    expect(boss.state.kind).not.toBe('stagger');
    expect(w.players[0].hp).toBeLessThan(hpBefore);
  });

  it('charges the shatter *instead of* the contact hit, never both', () => {
    const { w, c, boss } = regentWorld();
    const volley = c.enemies.glass_regent.volley!;
    const shard = serve(w, c, boss);
    shard.shardIntegrity = 0;
    shard.pos = { ...w.players[0].pos };
    const hpBefore = w.players[0].hp;
    stepProjectiles(w, c, TICK);
    const taken = hpBefore - w.players[0].hp;
    expect(taken).toBeCloseTo(volley.shatterDamage, 5);
    expect(taken).not.toBeCloseTo(volley.shatterDamage + shard.damage, 5);
  });

  it('cannot be answered by a staggered Regent — a second shard punishes him while he is down', () => {
    const { w, c, boss } = regentWorld();
    const shard = serve(w, c, boss);
    shard.shardIntegrity = 3;
    shard.hostileTo = 'enemy';
    shard.pos = { ...boss.pos };
    boss.state = { ...boss.state, kind: 'stagger', elapsedMs: 0 };
    w.events.length = 0;
    stepProjectiles(w, c, TICK);
    expect(countOf(w.events, 'volley_returned')).toBe(0);
    expect(firstOf(w.events, 'volley_shattered')?.data?.on).toBe('enemy');
  });
});

describe('the serve', () => {
  it('refuses to leave while the act already has its allowance in the air', () => {
    const { w, c, boss } = regentWorld();
    const volley = c.enemies.glass_regent.volley!;
    for (let i = 0; i < volley.maxLive[0]; i++) serve(w, c, boss);
    const before = w.projectiles.length;

    boss.attackCooldownMs = 0;
    for (let i = 0; i < ticksFor(4000); i++) stepEnemy(w, boss, c, TICK);
    expect(w.projectiles.length).toBe(before);
  });

  it('allows only one live rally in either act', () => {
    const { c } = regentWorld();
    expect(c.enemies.glass_regent.volley!.maxLive).toEqual([1, 1]);
  });
});

describe('the shockwave', () => {
  it('shelters a king standing in a corner and strikes one standing in the open', () => {
    const { w, c, boss } = regentWorld();
    const wave = c.enemies.glass_regent.volley!.shockwave;
    const slam = c.enemies.glass_regent.attacks.findIndex((a) => a.kind === 'shockwave');
    expect(slam).toBeGreaterThanOrEqual(0);

    boss.hasSlammed = true;

    const h = w.arena.halfExtents;
    w.players[0].pos = { x: h.x, y: h.y };
    boss.state = { kind: 'attack', enteredTick: 0, elapsedMs: 0, attackIndex: slam, telegraphJitterMs: 0, struck: [] };
    const shelteredHp = w.players[0].hp;
    stepEnemy(w, boss, c, TICK);
    expect(w.players[0].hp).toBe(shelteredHp);

    w.players[0].pos = { x: 4, y: 0 };
    boss.state = { kind: 'attack', enteredTick: 0, elapsedMs: 0, attackIndex: slam, telegraphJitterMs: 0, struck: [] };
    stepEnemy(w, boss, c, TICK);
    expect(w.players[0].hp).toBeLessThan(shelteredHp);
    expect(shelteredHp - w.players[0].hp).toBeCloseTo(wave.damage, 5);
  });

  it('opens with a harmless throw to shelter rather than a hit', () => {
    const { w, c, boss } = regentWorld();
    const slam = c.enemies.glass_regent.attacks.findIndex((a) => a.kind === 'shockwave');
    w.players[0].pos = { x: 4, y: 0 };
    const hpBefore = w.players[0].hp;
    boss.state = { kind: 'attack', enteredTick: 0, elapsedMs: 0, attackIndex: slam, telegraphJitterMs: 0, struck: [] };
    w.events.length = 0;
    stepEnemy(w, boss, c, TICK);

    expect(w.players[0].hp).toBe(hpBefore);
    expect(firstOf(w.events, 'volley_ward_pushed')?.data?.teaching).toBe(1);
    expect(w.players[0].shoveMs).toBeGreaterThan(0);
    expect(w.players[0].shoveVel).toBeDefined();

    const promised = {
      x: Number(firstOf(w.events, 'volley_ward_pushed')?.data?.x),
      y: Number(firstOf(w.events, 'volley_ward_pushed')?.data?.y),
    };
    for (let i = 0; i < ticksFor(800); i++) {
      stepPlayer(w, w.players[0], { ...NEUTRAL_INTENT, move: { x: 0, y: 0 } }, c, TICK);
    }
    expect(dist(w.players[0].pos, promised)).toBeLessThan(0.02);
    const corner = {
      x: Math.sign(promised.x) * w.arena.halfExtents.x,
      y: Math.sign(promised.y) * w.arena.halfExtents.y,
    };
    expect(dist(w.players[0].pos, corner)).toBeLessThanOrEqual(
      c.enemies.glass_regent.volley!.shockwave.cornerRadius,
    );
  });

  it('prompts a damaging floor warning when the king leaves shelter', () => {
    const { w, c, boss } = regentWorld();
    boss.hasSlammed = true;
    boss.state = { kind: 'approach', enteredTick: 0, elapsedMs: 0, attackIndex: 0, telegraphJitterMs: 0, struck: [] };
    w.players[0].pos = { x: 6, y: 0 };

    stepEnemy(w, boss, c, TICK);

    expect(boss.state.kind).toBe('telegraph');
    expect(c.enemies.glass_regent.attacks[boss.state.attackIndex].kind).toBe('shockwave');
  });

  it('serves instead of pulsing the floor while the king remains sheltered', () => {
    const { w, c, boss } = regentWorld();
    boss.hasSlammed = true;
    boss.state = { kind: 'approach', enteredTick: 0, elapsedMs: 0, attackIndex: 0, telegraphJitterMs: 0, struck: [] };
    const h = w.arena.halfExtents;
    w.players[0].pos = { x: h.x, y: h.y };

    stepEnemy(w, boss, c, TICK);

    expect(boss.state.kind).toBe('telegraph');
    expect(c.enemies.glass_regent.attacks[boss.state.attackIndex].kind).toBe('volley');
  });

  it('keeps the opening lesson spent when a stagger ends', () => {
    const { w, c, boss } = regentWorld();
    boss.hasSlammed = true;
    boss.warded = false;
    boss.patternStep = 3;
    boss.state = { kind: 'stagger', enteredTick: 0, elapsedMs: 0, attackIndex: 0, telegraphJitterMs: 0, struck: [] };
    boss.staggerOverrideMs = 40;
    for (let i = 0; i < ticksFor(200); i++) stepEnemy(w, boss, c, TICK);
    expect(boss.warded).toBe(true);
    expect(boss.hasSlammed).toBe(true);
    expect(boss.patternStep).toBe(0);
  });
});

describe('the punish window', () => {
  it('keeps the Regent at his station when a heavy lands during the stagger', () => {
    const { w, c, boss } = regentWorld();
    boss.warded = false;
    boss.state = { kind: 'stagger', enteredTick: 0, elapsedMs: 0, attackIndex: 0, telegraphJitterMs: 0, struck: [] };
    w.players[0].pos = { x: -1, y: 0 };
    w.players[0].facing = 0;
    w.players[0].state = {
      kind: 'active',
      enteredTick: 0,
      elapsedMs: 0,
      attack: 'heavy',
      struck: [],
    };

    resolvePlayerAttack(w, w.players[0], c);

    expect(boss.hp).toBeLessThan(boss.maxHp);
    expect(boss.vel).toEqual({ x: 0, y: 0 });
  });
});
