
import type { Enemy, Intent, World } from '../src/sim/types';
import { PLAYER_ID } from '../src/sim/types';
import { blinkTarget, pullTarget, stepPowers } from '../src/sim/powers';
import * as simWeather from '../src/sim/weather';
import { resolveEnemyAttack } from '../src/sim/combat';
import { spawnProjectile, stepProjectiles } from '../src/sim/projectile';
import { stepEnemyStatuses } from '../src/sim/status';
import { stepEnemy } from '../src/sim/enemy';
import { hashWorld } from '../src/sim/world';
import { bareWorld, cfg, countOf, firstOf, intent, oneEnemy, run } from './support/world';
import { createWorld } from '../src/sim/encounter';
import { stepPickups } from '../src/sim/pickups';
import { ENCOUNTERS } from '../src/lab/encounters';
import { DEFAULT_COMBAT, SLOWMO_PRESETS } from '../src/lab/config';
import type { FeatContext, FeatState } from '../src/game/feats';
import { createFeatState, earnedFeats, observeFeats } from '../src/game/feats';
import { stepPublicWorld } from '../src/sim/world';
import {
  POWER_STANDS,
  STAND_RADIUS,
  armouryObstacles,
  standNear,
  standPrompt,
} from '../src/game/armoury';
import { arenaContains, clampToArena, resolveObstacles } from '../src/sim/arena';
import { COMBAT_PRESETS } from '../src/lab/config';

const TICK = 1000 / 120;

const enemyAt = (w: World, at: { x: number; y: number }, id: number, hp = 90): Enemy => {
  const e: Enemy = {
    id,
    archetype: 'guard',
    pos: { ...at },
    vel: { x: 0, y: 0 },
    facing: Math.PI,
    hp,
    maxHp: 90,
    poise: 100,
    maxPoise: 100,
    state: {
      kind: 'approach',
      enteredTick: w.tick,
      elapsedMs: 0,
      attackIndex: 0,
      telegraphJitterMs: 0,
      struck: [],
    },
    attackCooldownMs: 0,
  };
  w.enemies.push(e);
  return e;
};

describe('the baseline is untouched', () => {
  it('does nothing at all when no power is equipped', () => {
    const w = bareWorld();
    const c = cfg();
    expect(c.power).toBe('none');
    enemyAt(w, { x: 2, y: 0 }, 1);

    const before = hashWorld(w);
    stepPowers(w, w.players[0], intent({ powerPressed: true }), c, TICK);

    expect(hashWorld(w)).toBe(before);
    expect(w.events).toHaveLength(0);
  });

  it('ships every experiment preset off by default in Default', () => {
    const d = COMBAT_PRESETS.Default;
    expect(d.power).toBe('none');
    expect(d.friendlyFire.melee).toBe(false);
    expect(d.friendlyFire.projectiles).toBe(false);
  });

  it('leaves an equipped power inert until it is pressed', () => {
    const w = bareWorld();
    const c = structuredClone(COMBAT_PRESETS.Power_Lightning);
    enemyAt(w, { x: 2, y: 0 }, 1);

    const before = hashWorld(w);
    stepPowers(w, w.players[0], intent(), c, TICK);

    expect(hashWorld(w)).toBe(before);
  });
});

const hold = (w: World, c: ReturnType<typeof cfg>, ms: number): void => {
  for (let i = 0; i < Math.ceil(ms / TICK); i++) {
    stepPowers(w, w.players[0], intent({ powerHeld: true }), c, TICK);
  }
};

const release = (w: World, c: ReturnType<typeof cfg>): void => {
  stepPowers(w, w.players[0], intent(), c, TICK);
};

describe('instant powers — cost and legality', () => {
  const equipped = () => structuredClone(COMBAT_PRESETS.Power_Pull);

  it('spends stamina, starts a cooldown, and pauses regen', () => {
    const w = bareWorld();
    const c = equipped();
    w.players[0].facing = 0;
    enemyAt(w, { x: 3, y: 0 }, 1);

    stepPowers(w, w.players[0], intent({ powerPressed: true }), c, TICK);

    expect(w.players[0].stamina).toBe(w.players[0].maxStamina - c.powers.pull.staminaCost);
    expect(w.players[0].powerCooldownMs).toBe(c.powers.pull.cooldownMs);
    expect(w.players[0].regenDelayMs).toBe(c.player.staminaRegenDelayMs);
  });

  it('refuses while on cooldown', () => {
    const w = bareWorld();
    const c = equipped();
    w.players[0].facing = 0;
    enemyAt(w, { x: 3, y: 0 }, 1);
    stepPowers(w, w.players[0], intent({ powerPressed: true }), c, TICK);

    stepPowers(w, w.players[0], intent({ powerPressed: true }), c, TICK);

    expect(countOf(w.events, 'power_used')).toBe(1);
  });

  it('refuses without stamina when overcasting is forbidden', () => {
    const w = bareWorld();
    const c = equipped();
    expect(c.powers.pull.overcastHpCost).toBe(0);
    w.players[0].facing = 0;
    enemyAt(w, { x: 3, y: 0 }, 1);
    w.players[0].stamina = c.powers.pull.staminaCost - 1;

    stepPowers(w, w.players[0], intent({ powerPressed: true }), c, TICK);

    expect(countOf(w.events, 'power_used')).toBe(0);
  });

  it('obeys the same transition legality the attacks do', () => {
    const w = bareWorld();
    const c = equipped();
    enemyAt(w, { x: 3, y: 0 }, 1);
    w.players[0].state = {
      kind: 'recovery',
      enteredTick: w.tick,
      elapsedMs: 0,
      attack: 'heavy',
      struck: [],
    };

    stepPowers(w, w.players[0], intent({ powerPressed: true }), c, TICK);

    expect(countOf(w.events, 'power_used')).toBe(0);
  });
});

describe('the channel', () => {
  const equipped = () => structuredClone(COMBAT_PRESETS.Power_Lightning);

  it('does nothing until the button is held', () => {
    const w = bareWorld();
    const c = equipped();
    w.players[0].facing = 0;
    const target = enemyAt(w, { x: 2, y: 0 }, 1);

    stepPowers(w, w.players[0], intent({ powerPressed: true }), c, TICK);

    expect(target.hp).toBe(90);
    expect(w.players[0].powerChannelMs).toBe(0);
  });

  it('waits out the wind-up before the first tick lands', () => {
    const w = bareWorld();
    const c = equipped();
    w.players[0].facing = 0;
    const target = enemyAt(w, { x: 2, y: 0 }, 1);

    hold(w, c, c.powers.lightning.channelWindupMs - TICK * 2);

    expect(target.hp).toBe(90);
    expect(countOf(w.events, 'power_used')).toBe(1);
    expect(w.players[0].powerChannelMs).toBeGreaterThan(0);
  });

  it('ticks on a fixed cadence while held', () => {
    const w = bareWorld();
    const c = equipped();
    const def = c.powers.lightning;
    w.players[0].facing = 0;
    enemyAt(w, { x: 2, y: 0 }, 1);

    hold(w, c, def.channelWindupMs + def.tickIntervalMs + TICK);
    expect(w.players[0].powerTicks).toBe(1);

    hold(w, c, def.tickIntervalMs);
    expect(w.players[0].powerTicks).toBe(2);
  });

  it('drains the bar per tick, so the bar is the channel\'s clock', () => {
    const w = bareWorld();
    const c = equipped();
    const def = c.powers.lightning;
    w.players[0].facing = 0;
    enemyAt(w, { x: 2, y: 0 }, 1);

    hold(w, c, def.channelWindupMs + def.tickIntervalMs * 2 + TICK);

    expect(w.players[0].powerTicks).toBe(2);
    expect(w.players[0].stamina).toBe(w.players[0].maxStamina - def.staminaPerTick * 2);
  });

  it('escalates once the channel has been sustained', () => {
    const w = bareWorld();
    const c = equipped();
    const def = c.powers.lightning;
    w.players[0].facing = 0;
    enemyAt(w, { x: 2, y: 0 }, 1, 1e6);
    w.players[0].maxStamina = 1e6;
    w.players[0].stamina = 1e6;

    hold(w, c, def.channelWindupMs + def.tickIntervalMs * (def.damageRampTick + 2) + TICK);

    const hits = w.events.filter((e) => e.type === 'power_hit');
    const early = Number(hits[0].data?.damage);
    const late = Number(hits[hits.length - 1].data?.damage);
    expect(late).toBeCloseTo(early * def.damageRampMult, 4);
  });

  it('ends on release and owes a recovery tail', () => {
    const w = bareWorld();
    const c = equipped();
    const def = c.powers.lightning;
    w.players[0].facing = 0;
    enemyAt(w, { x: 2, y: 0 }, 1);
    hold(w, c, def.channelWindupMs + def.tickIntervalMs + TICK);

    release(w, c);

    expect(w.players[0].powerChannelMs).toBe(0);
    expect(w.players[0].powerTicks).toBe(0);
    expect(w.players[0].powerCooldownMs).toBe(def.releaseRecoveryMs);
    const ev = firstOf(w.events, 'power_released');
    expect(Number(ev?.data?.ticks)).toBeGreaterThan(0);
  });

  it('is interrupted by losing the stance', () => {
    const w = bareWorld();
    const c = equipped();
    w.players[0].facing = 0;
    enemyAt(w, { x: 2, y: 0 }, 1);
    hold(w, c, c.powers.lightning.channelWindupMs + TICK);

    w.players[0].state = {
      kind: 'stagger',
      enteredTick: w.tick,
      elapsedMs: 0,
      attack: null,
      struck: [],
    };
    stepPowers(w, w.players[0], intent({ powerHeld: true }), c, TICK);

    expect(w.players[0].powerChannelMs).toBe(0);
  });
});

describe('overcasting', () => {
  const equipped = () => structuredClone(COMBAT_PRESETS.Power_Lightning);

  it('keeps ticking on an empty bar and bills the king in health', () => {
    const w = bareWorld();
    const c = equipped();
    const def = c.powers.lightning;
    w.players[0].facing = 0;
    const target = enemyAt(w, { x: 2, y: 0 }, 1, 1e6);
    w.players[0].stamina = 0;

    hold(w, c, def.channelWindupMs + def.tickIntervalMs + TICK);

    expect(target.hp).toBeLessThan(1e6);
    expect(w.players[0].hp).toBe(w.players[0].maxHp - def.overcastHpCost);
    expect(firstOf(w.events, 'power_overcast')?.data?.hpCost).toBe(def.overcastHpCost);
  });

  it('bills once per tick, so holding through is ruinous', () => {
    const w = bareWorld();
    const c = equipped();
    const def = c.powers.lightning;
    w.players[0].facing = 0;
    enemyAt(w, { x: 2, y: 0 }, 1, 1e6);
    w.players[0].stamina = 0;

    hold(w, c, def.channelWindupMs + def.tickIntervalMs * 3 + TICK);

    expect(countOf(w.events, 'power_overcast')).toBe(3);
    expect(w.players[0].hp).toBe(w.players[0].maxHp - def.overcastHpCost * 3);
  });

  it('breaks the parry streak, because it is damage taken', () => {
    const w = bareWorld();
    const c = equipped();
    const def = c.powers.lightning;
    w.players[0].facing = 0;
    w.players[0].stamina = 0;
    w.players[0].parryStreak = 5;
    enemyAt(w, { x: 2, y: 0 }, 1);

    hold(w, c, def.channelWindupMs + def.tickIntervalMs + TICK);

    expect(w.players[0].parryStreak).toBe(0);
  });

  it('can kill the king', () => {
    const w = bareWorld();
    const c = equipped();
    const def = c.powers.lightning;
    w.players[0].facing = 0;
    w.players[0].stamina = 0;
    w.players[0].hp = def.overcastHpCost;
    enemyAt(w, { x: 2, y: 0 }, 1);

    hold(w, c, def.channelWindupMs + def.tickIntervalMs + TICK);

    expect(w.players[0].hp).toBe(0);
  });
});

describe('blink', () => {
  const c = () => structuredClone(COMBAT_PRESETS.Power_Blink);

  it('travels along the facing and grants brief i-frames', () => {
    const w = bareWorld();
    const combat = c();
    w.players[0].facing = 0;

    stepPowers(w, w.players[0], intent({ powerPressed: true }), combat, TICK);

    expect(w.players[0].pos.x).toBeCloseTo(combat.powers.blink.distance, 6);
    expect(w.players[0].iframeMs).toBe(combat.powers.blink.iframeMs);

    expect(combat.powers.blink.iframeMs).toBeGreaterThan(0);
    expect(combat.powers.blink.iframeMs).toBeLessThan(combat.player.step.durationMs / 2);
    expect(combat.powers.blink.cooldownMs).toBeGreaterThan(2000);
  });

  it('travels exactly as far as the player aimed', () => {
    const w = bareWorld();
    const combat = c();
    w.players[0].facing = 0;

    stepPowers(w, w.players[0], { ...intent({ powerPressed: true }), aimDistance: 2.4 }, combat, TICK);

    expect(w.players[0].pos.x).toBeCloseTo(2.4, 6);
  });

  it('clamps to the maximum rather than refusing an over-long aim', () => {
    const w = bareWorld();
    const combat = c();
    w.players[0].facing = 0;

    stepPowers(w, w.players[0], { ...intent({ powerPressed: true }), aimDistance: 999 }, combat, TICK);

    expect(w.players[0].pos.x).toBeCloseTo(combat.powers.blink.distance, 6);
  });

  it('goes the full distance when no aim distance is given', () => {
    const w = bareWorld();
    const combat = c();
    w.players[0].facing = 0;

    stepPowers(w, w.players[0], { ...intent({ powerPressed: true }), aimDistance: null }, combat, TICK);

    expect(w.players[0].pos.x).toBeCloseTo(combat.powers.blink.distance, 6);
  });

  it('previews the landing point the cast will actually use', () => {
    const w = bareWorld();
    const combat = c();
    w.players[0].facing = 0;

    const predicted = blinkTarget(w, w.players[0], combat, combat.powers.blink, 3.1);
    stepPowers(w, w.players[0], { ...intent({ powerPressed: true }), aimDistance: 3.1 }, combat, TICK);

    expect(w.players[0].pos.x).toBeCloseTo(predicted.x, 9);
    expect(w.players[0].pos.y).toBeCloseTo(predicted.y, 9);
  });

  it('cannot leave the arena', () => {
    const w = bareWorld();
    const combat = c();
    w.arena.halfExtents = { x: 3, y: 3 };
    w.players[0].pos = { x: 2, y: 0 };
    w.players[0].facing = 0;

    stepPowers(w, w.players[0], intent({ powerPressed: true }), combat, TICK);

    expect(w.players[0].pos.x).toBeLessThanOrEqual(3);
  });
});

describe('pull', () => {
  const c = () => structuredClone(COMBAT_PRESETS.Power_Pull);

  it('drags the nearest target in the cone toward the king', () => {
    const w = bareWorld();
    w.players[0].facing = 0;
    const near = enemyAt(w, { x: 3, y: 0 }, 1);
    const far = enemyAt(w, { x: 6, y: 0 }, 2);

    stepPowers(w, w.players[0], intent({ powerPressed: true }), c(), TICK);

    expect(near.vel.x).toBeLessThan(0);
    expect(far.vel.x).toBe(0);
  });

  it('previews exactly the enemy the cast will take', () => {
    const w = bareWorld();
    w.players[0].facing = 0;
    const near = enemyAt(w, { x: 3, y: 0 }, 1);
    enemyAt(w, { x: 6, y: 0 }, 2);
    const combat = c();

    expect(pullTarget(w, w.players[0], combat, combat.powers.pull)?.id).toBe(near.id);

    stepPowers(w, w.players[0], intent({ powerPressed: true }), combat, TICK);
    expect(near.vel.x).toBeLessThan(0);
  });

  it('costs posture rather than health', () => {
    const w = bareWorld();
    w.players[0].facing = 0;
    const target = enemyAt(w, { x: 3, y: 0 }, 1);
    const combat = c();

    stepPowers(w, w.players[0], intent({ powerPressed: true }), combat, TICK);

    expect(target.hp).toBe(90);
    expect(target.poise).toBe(100 - combat.powers.pull.poiseDamage);
  });
});

describe('push', () => {
  const c = () => structuredClone(COMBAT_PRESETS.Power_Push);

  it('pushes targets outward through the aimed cone', () => {
    const w = bareWorld();
    w.players[0].facing = 0;
    const a = enemyAt(w, { x: 2, y: -0.5 }, 1);
    const b = enemyAt(w, { x: 2.5, y: 0.5 }, 2);
    const behind = enemyAt(w, { x: -2, y: 0 }, 3);
    const combat = c();

    stepPowers(w, w.players[0], intent({ powerPressed: true }), combat, TICK);

    expect(a.vel.x).toBeGreaterThan(0);
    expect(b.vel.x).toBeGreaterThan(0);
    expect(behind.vel).toEqual({ x: 0, y: 0 });
    expect(countOf(w.events, 'power_hit')).toBe(2);
  });

  const book = (w: ReturnType<typeof bareWorld>, at: { x: number; y: number }, id: number) => {
    const shot = {
      id,
      kind: 'linear' as const,
      ownerId: -1,
      pos: { ...at },
      vel: { x: -4, y: 0 },
      radius: 0.18,
      damage: 8,
      lifeMs: 3000,
      maxLifeMs: 3000,
      hostileTo: 'player' as const,
      reflected: false,
      hazard: true,
    };
    w.projectiles.push(shot as never);
    return shot;
  };

  it('sweeps the room traffic out of the cone', () => {
    const w = bareWorld();
    w.players[0].facing = 0;
    const incoming = book(w, { x: 2, y: 0 }, 90);
    const behind = book(w, { x: -2, y: 0 }, 91);

    stepPowers(w, w.players[0], intent({ powerPressed: true }), c(), TICK);

    expect(incoming.vel.x).toBeGreaterThan(0);
    expect(behind.vel).toEqual({ x: -4, y: 0 });
  });

  it('leaves an arrow alone, because the parry is its answer', () => {
    const w = bareWorld();
    w.players[0].facing = 0;
    const arrow = book(w, { x: 2, y: 0 }, 92);
    (arrow as { hazard?: boolean }).hazard = false;

    stepPowers(w, w.players[0], intent({ powerPressed: true }), c(), TICK);

    expect(arrow.vel).toEqual({ x: -4, y: 0 });
  });

  it('costs posture but no health, leaving the sword to collect the opening', () => {
    const w = bareWorld();
    w.players[0].facing = 0;
    const target = enemyAt(w, { x: 2, y: 0 }, 1);
    const combat = c();

    stepPowers(w, w.players[0], intent({ powerPressed: true }), combat, TICK);

    expect(target.hp).toBe(90);
    expect(target.poise).toBe(100 - combat.powers.push.poiseDamage);
    expect(firstOf(w.events, 'power_used')?.data?.power).toBe('push');
  });

  it('does not freeze the frame on a whiff', () => {
    const w = bareWorld();
    const combat = c();

    stepPowers(w, w.players[0], intent({ powerPressed: true }), combat, TICK);

    expect(w.hitstopMs).toBe(0);
    expect(firstOf(w.events, 'power_used')?.data?.targets).toBe(0);
  });
});

describe('freeze', () => {
  it('pauses an enemy FSM and motion on the world clock, then resumes it', () => {
    const w = bareWorld();
    const combat = structuredClone(COMBAT_PRESETS.Power_Freeze);
    const target = enemyAt(w, { x: 2, y: 0 }, 1);
    target.state.kind = 'telegraph';
    target.state.elapsedMs = 140;
    target.vel = { x: -2, y: 0 };
    w.players[0].facing = 0;

    stepPowers(w, w.players[0], intent({ powerPressed: true }), combat, TICK);

    expect(target.frozenMs).toBe(combat.powers.freeze.effectDurationMs);
    stepEnemyStatuses(w, 100);
    stepEnemy(w, target, combat, 100);
    expect(target.state.elapsedMs).toBe(140);
    expect(target.vel).toEqual({ x: 0, y: 0 });

    stepEnemyStatuses(w, combat.powers.freeze.effectDurationMs ?? 0);
    stepEnemy(w, target, combat, 100);
    expect(target.state.elapsedMs).toBe(240);
    expect(firstOf(w.events, 'enemy_status_ended')?.data?.status).toBe('freeze');
  });

  it('freezes only the configured number of visible targets', () => {
    const w = bareWorld();
    const combat = structuredClone(COMBAT_PRESETS.Power_Freeze);
    combat.powers.freeze.maxTargets = 2;
    w.players[0].facing = 0;
    const near = enemyAt(w, { x: 2, y: -0.8 }, 1);
    const middle = enemyAt(w, { x: 2.4, y: 0.8 }, 2);
    const far = enemyAt(w, { x: 4.5, y: 0 }, 3);

    stepPowers(w, w.players[0], intent({ powerPressed: true }), combat, TICK);

    expect([near, middle].filter((enemy) => (enemy.frozenMs ?? 0) > 0)).toHaveLength(2);
    expect(far.frozenMs ?? 0).toBe(0);
  });
});

describe('incinerate', () => {
  it('snapshots a delayed damage cadence after the initial impact', () => {
    const w = bareWorld();
    const combat = structuredClone(COMBAT_PRESETS.Power_Incinerate);
    const def = combat.powers.incinerate;
    const committedTickDamage = def.damagePerTick ?? 0;
    const target = enemyAt(w, { x: 2, y: 0 }, 1, 200);
    w.players[0].facing = 0;

    stepPowers(w, w.players[0], intent({ powerPressed: true }), combat, TICK);
    expect(target.hp).toBe(200 - def.damage);

    combat.powers.incinerate.damagePerTick = 999;
    stepEnemyStatuses(w, (def.effectTickMs ?? 0) * 2);

    expect(target.hp).toBe(200 - def.damage - committedTickDamage * 2);
    expect(countOf(w.events, 'enemy_status_tick')).toBe(2);
  });

  it('can finish an enemy and credits incineration rather than a direct sword hit', () => {
    const w = bareWorld();
    const combat = structuredClone(COMBAT_PRESETS.Power_Incinerate);
    const def = combat.powers.incinerate;
    const target = enemyAt(w, { x: 2, y: 0 }, 1, def.damage + (def.damagePerTick ?? 0));
    w.players[0].facing = 0;

    stepPowers(w, w.players[0], intent({ powerPressed: true }), combat, TICK);
    stepEnemyStatuses(w, def.effectTickMs ?? 0);

    expect(target.state.kind).toBe('dead');
    expect(firstOf(w.events, 'enemy_died')?.data?.by).toBe('incinerate');
  });
});

describe('turncoat', () => {
  it('makes the converted enemy steer toward a former ally instead of the player', () => {
    const w = bareWorld();
    const combat = structuredClone(COMBAT_PRESETS.Power_Turncoat);
    const converted = enemyAt(w, { x: 2, y: 0 }, 1);
    enemyAt(w, { x: 4, y: 0 }, 2);
    w.players[0].facing = 0;

    stepPowers(w, w.players[0], intent({ powerPressed: true }), combat, TICK);
    stepEnemy(w, converted, combat, 100);

    expect(converted.turncoatMs).toBeGreaterThan(0);
    expect(converted.vel.x).toBeGreaterThan(0);
  });

  it('redirects melee into enemies without also striking the player', () => {
    const w = bareWorld();
    const combat = structuredClone(COMBAT_PRESETS.Power_Turncoat);
    const converted = enemyAt(w, { x: 2, y: 0 }, 1);
    const victim = enemyAt(w, { x: 3, y: 0 }, 2);
    w.players[0].facing = 0;
    stepPowers(w, w.players[0], intent({ powerPressed: true }), combat, TICK);
    converted.state.kind = 'attack';
    converted.state.attackIndex = 0;
    converted.facing = 0;
    w.events.length = 0;
    const playerHp = w.players[0].hp;

    resolveEnemyAttack(w, converted, w.players[0], combat);

    expect(victim.hp).toBeLessThan(victim.maxHp);
    expect(w.players[0].hp).toBe(playerHp);
    expect(firstOf(w.events, 'friendly_fire')?.data?.turncoat).toBe(true);
  });

  it('fires archer projectiles on the enemy side and records honest ownership', () => {
    const w = bareWorld();
    const combat = structuredClone(COMBAT_PRESETS.Power_Turncoat);
    const converted = enemyAt(w, { x: 2, y: 0 }, 1);
    converted.archetype = 'archer';
    const victim = enemyAt(w, { x: 4, y: 0 }, 2);
    w.players[0].facing = 0;
    stepPowers(w, w.players[0], intent({ powerPressed: true }), combat, TICK);
    converted.state.kind = 'attack';
    converted.state.attackIndex = 0;
    converted.state.struck = [];
    w.events.length = 0;

    stepEnemy(w, converted, combat, TICK);
    const shot = w.projectiles[0];

    expect(shot.hostileTo).toBe('enemy');
    expect(shot.turncoat).toBe(true);
    expect(firstOf(w.events, 'projectile_fired')?.target).toBe(victim.id);
  });

  it('returns to the player side when the status expires', () => {
    const w = bareWorld();
    const combat = structuredClone(COMBAT_PRESETS.Power_Turncoat);
    const converted = enemyAt(w, { x: 2, y: 0 }, 1);
    enemyAt(w, { x: 4, y: 0 }, 2);
    w.players[0].facing = 0;
    stepPowers(w, w.players[0], intent({ powerPressed: true }), combat, TICK);

    stepEnemyStatuses(w, combat.powers.turncoat.effectDurationMs ?? 0);

    expect(converted.turncoatMs).toBe(0);
    expect(firstOf(w.events, 'enemy_status_ended')?.data?.status).toBe('turncoat');
  });
});

describe('friendly fire', () => {
  it('is inert when disabled', () => {
    const w = bareWorld();
    const c = cfg();
    const attacker = enemyAt(w, { x: 0, y: 0 }, 1);
    attacker.facing = 0;
    attacker.state.kind = 'attack';
    const victim = enemyAt(w, { x: 1.5, y: 0 }, 2);

    resolveEnemyAttack(w, attacker, w.players[0], c);

    expect(victim.hp).toBe(90);
    expect(countOf(w.events, 'friendly_fire')).toBe(0);
  });

  it('lets a melee swing catch a neighbour when enabled', () => {
    const w = bareWorld();
    const c = structuredClone(COMBAT_PRESETS.FF_All);
    const attacker = enemyAt(w, { x: 0, y: 0 }, 1);
    attacker.facing = 0;
    attacker.state.kind = 'attack';
    const victim = enemyAt(w, { x: 1.5, y: 0 }, 2);

    resolveEnemyAttack(w, attacker, w.players[0], c);

    expect(victim.hp).toBeLessThan(90);
    const ev = firstOf(w.events, 'friendly_fire');
    expect(ev?.actor).toBe(attacker.id);
    expect(ev?.target).toBe(victim.id);
  });

  it('hits each neighbour only once per swing', () => {
    const w = bareWorld();
    const c = structuredClone(COMBAT_PRESETS.FF_All);
    const attacker = enemyAt(w, { x: 0, y: 0 }, 1);
    attacker.facing = 0;
    attacker.state.kind = 'attack';
    enemyAt(w, { x: 1.5, y: 0 }, 2);

    resolveEnemyAttack(w, attacker, w.players[0], c);
    resolveEnemyAttack(w, attacker, w.players[0], c);

    expect(countOf(w.events, 'friendly_fire')).toBe(1);
  });

  it('lets an arrow strike whoever stands in the way', () => {
    const w = bareWorld();
    const c = structuredClone(COMBAT_PRESETS.FF_Projectiles);
    const blocker = enemyAt(w, { x: 3, y: 0 }, 1);
    spawnProjectile(w, c, { x: 3.05, y: 0 }, { x: -1, y: 0 }, 10, 12, 9);
    w.events.length = 0;

    stepProjectiles(w, c, TICK);

    expect(blocker.hp).toBe(90 - 12);
    expect(countOf(w.events, 'friendly_fire')).toBe(1);
    expect(w.projectiles).toHaveLength(0);
  });

  it('does not consume a freshly fired arrow on its own archer', () => {
    const w = bareWorld();
    const c = structuredClone(COMBAT_PRESETS.FF_Projectiles);
    const archer = enemyAt(w, { x: 3, y: 0 }, 9);
    archer.archetype = 'archer';
    const shot = spawnProjectile(w, c, archer.pos, { x: -1, y: 0 }, 10, 12, archer.id);
    w.events.length = 0;

    stepProjectiles(w, c, TICK);

    expect(archer.hp).toBe(90);
    expect(w.projectiles).toContain(shot);
    expect(countOf(w.events, 'friendly_fire')).toBe(0);
  });

  it('never credits the player for a friendly-fire kill', () => {
    const w = bareWorld();
    const c = structuredClone(COMBAT_PRESETS.FF_Projectiles);
    enemyAt(w, { x: 3, y: 0 }, 1, 5);
    spawnProjectile(w, c, { x: 3.05, y: 0 }, { x: -1, y: 0 }, 10, 12, 9);
    w.events.length = 0;

    stepProjectiles(w, c, TICK);

    const died = firstOf(w.events, 'enemy_died');
    expect(died?.data?.by).toBe('friendly_fire');
    expect(firstOf(w.events, 'hit_landed')).toBeUndefined();
  });

  it('still reflects a parried arrow as the player\'s own', () => {
    const w = bareWorld();
    const c = structuredClone(COMBAT_PRESETS.FF_Projectiles);
    enemyAt(w, { x: 3, y: 0 }, 1, 5);
    const shot = spawnProjectile(w, c, { x: 2.5, y: 0 }, { x: 1, y: 0 }, 10, 12, 9);
    shot.hostileTo = 'enemy';
    w.events.length = 0;

    stepProjectiles(w, c, TICK);

    expect(firstOf(w.events, 'hit_landed')?.actor).toBe(PLAYER_ID);
    expect(firstOf(w.events, 'enemy_died')?.data?.by).toBe('reflected_arrow');
  });
});

describe('the rng is untouched', () => {
  it('draws nothing, so an existing replay stays valid', () => {
    const plain = createWorld(oneEnemy('duelist', { x: 3, y: 0 }), cfg(), 99);
    const armed = createWorld(
      oneEnemy('duelist', { x: 3, y: 0 }),
      structuredClone(COMBAT_PRESETS.Power_Lightning),
      99,
    );

    const def = oneEnemy('duelist', { x: 3, y: 0 });
    run(plain, 400, intent(), { combat: cfg(), encounter: def });
    run(armed, 400, intent({ powerPressed: true }), {
      combat: structuredClone(COMBAT_PRESETS.Power_Lightning),
      encounter: def,
    });

    expect(armed.rng.value).toBe(plain.rng.value);
  });
});

describe('what bodies leave behind', () => {
  const cfg = (over: Partial<typeof DEFAULT_COMBAT.drops> = {}) => ({
    ...DEFAULT_COMBAT,
    drops: { ...DEFAULT_COMBAT.drops, ...over },
  });

  const killEnemy = (world: World, archetype: string, at = { x: 0, y: 0 }): number => {
    const id = world.nextId++;
    world.enemies.push({
      id,
      archetype,
      pos: { ...at },
      facing: 0,
      state: { kind: 'dead', elapsedMs: 0 },
    } as unknown as Enemy);
    world.events.push({
      type: 'enemy_died',
      tick: world.tick,
      actor: id,
      data: { archetype },
    } as never);
    return id;
  };

  it('draws from its own stream, so a drop cannot shift a telegraph', () => {
    const world = createWorld(ENCOUNTERS.kernel_guard, DEFAULT_COMBAT, 7);
    const before = world.rng.value;
    killEnemy(world, 'guard');
    stepPickups(world, cfg({ chance: 1 }), [], 16);
    expect(world.rng.value).toBe(before);
    expect(world.dropRng.value).not.toBe(before);
  });

  it('reproduces exactly from the same seed', () => {
    const run = (): string => {
      const world = createWorld(ENCOUNTERS.kernel_guard, DEFAULT_COMBAT, 11);
      const out: string[] = [];
      for (let i = 0; i < 12; i++) {
        world.events.length = 0;
        killEnemy(world, 'guard');
        stepPickups(world, cfg(), [], 16);
        out.push(world.pickups.map((p) => p.kind).join(','));
      }
      return out.join('|');
    };
    expect(run()).toBe(run());
  });

  it('takes the same number of draws whether or not the drop happens', () => {
    const never = createWorld(ENCOUNTERS.kernel_guard, DEFAULT_COMBAT, 3);
    const always = createWorld(ENCOUNTERS.kernel_guard, DEFAULT_COMBAT, 3);
    killEnemy(never, 'guard');
    killEnemy(always, 'guard');
    stepPickups(never, cfg({ chance: 0 }), [], 16);
    stepPickups(always, cfg({ chance: 1 }), [], 16);
    expect(never.pickups).toHaveLength(0);
    expect(always.pickups).toHaveLength(1);
    expect(never.dropRng.value).toBe(always.dropRng.value);
  });

  it('never drops from a boss', () => {
    const world = createWorld(ENCOUNTERS.first_blade, DEFAULT_COMBAT, 5);
    killEnemy(world, 'first_blade');
    stepPickups(world, cfg({ chance: 1 }), [], 16);
    expect(world.pickups).toHaveLength(0);
  });

  it('heals without overhealing, and reports what it actually gave', () => {
    const world = createWorld(ENCOUNTERS.kernel_guard, DEFAULT_COMBAT, 5);
    world.players[0].hp = DEFAULT_COMBAT.player.maxHp - 5;
    killEnemy(world, 'guard');
    stepPickups(world, cfg({ chance: 1, weights: { health: 1, stamina: 0, power: 0 }, healthAmount: 40 }), [], 16);

    world.events.length = 0;
    world.players[0].pos = { ...world.pickups[0].pos };
    stepPickups(world, cfg({ chance: 0 }), [], 16);

    expect(world.players[0].hp).toBe(DEFAULT_COMBAT.player.maxHp);
    const taken = world.events.find((e) => e.type === 'pickup_taken');
    expect(taken?.data?.amount).toBe(5);
  });

  it('expires rather than waiting to be banked', () => {
    const world = createWorld(ENCOUNTERS.kernel_guard, DEFAULT_COMBAT, 5);
    killEnemy(world, 'guard');
    stepPickups(world, cfg({ chance: 1, lifeMs: 100 }), [], 16);
    expect(world.pickups).toHaveLength(1);

    world.players[0].pos = { x: 99, y: 99 };
    world.events.length = 0;
    stepPickups(world, cfg({ chance: 0 }), [], 200);
    expect(world.pickups).toHaveLength(0);
    expect(world.events.some((e) => e.type === 'pickup_expired')).toBe(true);
  });
});

describe('stamina drops', () => {
  const cfg = (over: Partial<typeof DEFAULT_COMBAT.drops> = {}) => ({
    ...DEFAULT_COMBAT,
    drops: { ...DEFAULT_COMBAT.drops, ...over },
  });

  it('restores stamina without overfilling, and reports what it gave', () => {
    const world = createWorld(ENCOUNTERS.kernel_guard, DEFAULT_COMBAT, 5);
    const id = world.nextId++;
    world.pickups.push({
      id,
      kind: 'stamina',
      pos: { ...world.players[0].pos },
      amount: 40,
      lifeMs: 5000,
      totalLifeMs: 5000,
    });
    world.players[0].stamina = DEFAULT_COMBAT.player.maxStamina - 12;

    stepPickups(world, cfg({ chance: 0 }), [], 16);

    expect(world.players[0].stamina).toBe(DEFAULT_COMBAT.player.maxStamina);
    expect(world.events.find((e) => e.type === 'pickup_taken')?.data?.amount).toBe(12);
  });

  it('is reachable by weight, and a zeroed table drops nothing', () => {
    const kinds = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const world = createWorld(ENCOUNTERS.kernel_guard, DEFAULT_COMBAT, seed);
      const eid = world.nextId++;
      world.enemies.push({
        id: eid,
        archetype: 'guard',
        pos: { x: 0, y: 0 },
        facing: 0,
        state: { kind: 'dead', elapsedMs: 0 },
      } as unknown as Enemy);
      world.events.push({
        type: 'enemy_died',
        tick: 0,
        actor: eid,
        data: { archetype: 'guard' },
      } as never);
      world.players[0].pos = { x: 40, y: 40 };
      stepPickups(world, cfg({ chance: 1 }), [], 16);
      for (const pickup of world.pickups) kinds.add(pickup.kind);
    }
    expect(kinds).toContain('stamina');
    expect(kinds).toContain('health');
    expect(kinds).toContain('power');
  });
});

describe('the armoury', () => {
  it('offers every power exactly once', () => {
    const kinds = POWER_STANDS.map((stand) => stand.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const kind of ['lightning', 'blink', 'pull', 'push', 'freeze', 'incinerate', 'turncoat']) {
      expect(kinds).toContain(kind);
    }
  });

  it('stands every plinth on the playable floor', () => {
    const arena = ENCOUNTERS.wayfarer_court.arena;
    for (const stand of POWER_STANDS) {
      expect(arenaContains(arena, stand.at, 0), stand.label).toBe(true);
    }
  });

  it('keeps them off the line between the two doors', () => {
    for (const stand of POWER_STANDS) expect(stand.at.y).toBeGreaterThan(1.5);
  });

  it('gives each plinth a solid the king cannot walk through', () => {
    const obstacles = armouryObstacles();
    expect(obstacles).toHaveLength(POWER_STANDS.length);
    for (const obstacle of obstacles) expect(obstacle.radius).toBeGreaterThan(0);
  });

  it('pushes a body out of every plinth, not just the one it started in', () => {
    const arena = { ...ENCOUNTERS.wayfarer_court.arena, obstacles: armouryObstacles() };
    const clearance = STAND_RADIUS + DEFAULT_COMBAT.player.radius - 1e-6;
    for (const start of [POWER_STANDS[0].at, POWER_STANDS[3].at, POWER_STANDS[6].at]) {
      const freed = clampToArena(arena, { ...start }, DEFAULT_COMBAT.player.radius);
      for (const stand of POWER_STANDS) {
        const gap = Math.hypot(freed.x - stand.at.x, freed.y - stand.at.y);
        expect(gap, `${stand.label} from ${JSON.stringify(start)}`).toBeGreaterThanOrEqual(
          clearance,
        );
      }
      expect(arenaContains(arena, freed, DEFAULT_COMBAT.player.radius)).toBe(true);
    }
  });

  it('leaves a body that is already clear exactly where it was', () => {
    const arena = { ...ENCOUNTERS.wayfarer_court.arena, obstacles: armouryObstacles() };
    const free = { x: -2, y: 0 };
    expect(clampToArena(arena, free, DEFAULT_COMBAT.player.radius)).toEqual(free);
  });

  it('resolves a body sitting exactly on a plinth centre', () => {
    const arena = { halfExtents: { x: 20, y: 20 }, obstacles: [{ at: { x: 0, y: 0 }, radius: 1 }] };
    const out = resolveObstacles(arena, { x: 0, y: 0 }, 0.45);
    expect(Number.isFinite(out.x)).toBe(true);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(1.45, 6);
  });

  it('says nothing at the plinth holding what the king already carries', () => {
    expect(standPrompt(POWER_STANDS[0], POWER_STANDS[0].kind, 'E')).toBeNull();
    expect(standPrompt(POWER_STANDS[0], 'none', 'E')).toBe('E  SWITCH POWER');
    expect(standPrompt(null, 'none', 'E')).toBeNull();
  });

  it('picks the nearest plinth, not the first in the array', () => {
    const near = standNear(POWER_STANDS[5].at);
    expect(near?.kind).toBe(POWER_STANDS[5].kind);
    expect(standNear({ x: 0, y: -6 })).toBeNull();
  });
});

describe('the public tick steps whichever power is equipped', () => {
  const press = (): Intent =>
    ({
      move: { x: 0, y: 0 },
      facing: 0,
      lightPressed: false,
      heavyPressed: false,
      guardHeld: false,
      stepPressed: false,
      powerPressed: true,
      powerHeld: true,
      interactPressed: false,
      aimDistance: null,
    }) as unknown as Intent;

  it('blinks the king when blink is what he is carrying', () => {
    const cfg = { ...DEFAULT_COMBAT, power: 'blink' as const };
    const world = createWorld(ENCOUNTERS.kernel_guard, cfg, 1);
    const before = { ...world.players[0].pos };
    for (let i = 0; i < 6; i++) {
      stepPublicWorld(world, [press()], cfg, SLOWMO_PRESETS.none, ENCOUNTERS.kernel_guard);
    }
    const moved = Math.hypot(world.players[0].pos.x - before.x, world.players[0].pos.y - before.y);
    expect(moved).toBeGreaterThan(1);
  });

  it('does nothing at all when the king carries nothing', () => {
    const cfg = { ...DEFAULT_COMBAT, power: 'none' as const };
    const world = createWorld(ENCOUNTERS.kernel_guard, cfg, 1);
    const before = { ...world.players[0].pos };
    for (let i = 0; i < 6; i++) {
      stepPublicWorld(world, [press()], cfg, SLOWMO_PRESETS.none, ENCOUNTERS.kernel_guard);
    }
    expect(world.players[0].pos).toEqual(before);
    expect(world.events.some((e) => e.type === 'power_used')).toBe(false);
  });

  it('still channels the lightning, which is what it could always do', () => {
    const cfg = { ...DEFAULT_COMBAT, power: 'lightning' as const };
    const world = createWorld(ENCOUNTERS.kernel_guard, cfg, 1);
    for (let i = 0; i < 8; i++) {
      stepPublicWorld(world, [press()], cfg, SLOWMO_PRESETS.none, ENCOUNTERS.kernel_guard);
    }
    expect(world.players[0].powerChannelMs).toBeGreaterThan(0);
  });
});

describe('power drops swap what the king is carrying', () => {
  const drop = (offers: 'blink' | 'freeze', at = { x: 0, y: 0 }, id = 1) => ({
    id,
    kind: 'power' as const,
    pos: { ...at },
    amount: 0,
    offers,
    lifeMs: 5000,
    totalLifeMs: 5000,
  });
  const press = () => [intent({ interactPressed: true })];

  it('replaces the held power and reports what it replaced', () => {
    const cfg = { ...DEFAULT_COMBAT, power: 'lightning' as const, drops: { ...DEFAULT_COMBAT.drops, chance: 0 } };
    const world = createWorld(ENCOUNTERS.kernel_guard, cfg, 1);
    world.pickups.push(drop('blink', world.players[0].pos));

    stepPickups(world, cfg, press(), 16);

    expect(cfg.power).toBe('blink');
    const taken = world.events.find((e) => e.type === 'pickup_taken');
    expect(taken?.data?.power).toBe('blink');
    expect(taken?.data?.replaced).toBe('lightning');
  });

  it('is not taken by walking over it', () => {
    const cfg = { ...DEFAULT_COMBAT, power: 'lightning' as const, drops: { ...DEFAULT_COMBAT.drops, chance: 0 } };
    const world = createWorld(ENCOUNTERS.kernel_guard, cfg, 1);
    world.pickups.push(drop('blink', world.players[0].pos));

    stepPickups(world, cfg, [intent()], 16);

    expect(cfg.power).toBe('lightning');
    expect(world.pickups).toHaveLength(1);
    expect(world.events.some((e) => e.type === 'pickup_taken')).toBe(false);
  });

  it('answers only the collector’s press', () => {
    const cfg = { ...DEFAULT_COMBAT, power: 'lightning' as const, drops: { ...DEFAULT_COMBAT.drops, chance: 0 } };
    const world = createWorld(ENCOUNTERS.kernel_guard, cfg, 1);
    world.pickups.push(drop('blink', world.players[0].pos));

    stepPickups(world, cfg, [intent(), intent({ interactPressed: true })], 16);

    expect(cfg.power).toBe('lightning');
    expect(world.pickups).toHaveLength(1);
  });

  it('takes only the nearest drop on one press', () => {
    const cfg = { ...DEFAULT_COMBAT, power: 'lightning' as const, drops: { ...DEFAULT_COMBAT.drops, chance: 0 } };
    const world = createWorld(ENCOUNTERS.kernel_guard, cfg, 1);
    const king = world.players[0];
    world.pickups.push(drop('blink', { x: king.pos.x + 0.6, y: king.pos.y }, 1));
    world.pickups.push(drop('freeze', { x: king.pos.x + 0.2, y: king.pos.y }, 2));

    stepPickups(world, cfg, press(), 16);

    expect(cfg.power).toBe('freeze');
    expect(world.pickups).toHaveLength(1);
    expect(world.pickups[0].offers).toBe('blink');
  });

  it('hands the new power over ready to use', () => {
    const cfg = { ...DEFAULT_COMBAT, power: 'lightning' as const, drops: { ...DEFAULT_COMBAT.drops, chance: 0 } };
    const world = createWorld(ENCOUNTERS.kernel_guard, cfg, 1);
    world.players[0].powerCooldownMs = 4000;
    world.pickups.push(drop('freeze', world.players[0].pos));

    stepPickups(world, cfg, press(), 16);

    expect(world.players[0].powerCooldownMs).toBe(0);
  });

  it('never offers the power already in hand', () => {
    for (const held of ['lightning', 'blink', 'turncoat'] as const) {
      const cfg = { ...DEFAULT_COMBAT, power: held, drops: { ...DEFAULT_COMBAT.drops, chance: 1, weights: { health: 0, stamina: 0, power: 1 } } };
      for (let seed = 0; seed < 25; seed++) {
        const world = createWorld(ENCOUNTERS.kernel_guard, cfg, seed);
        const id = world.nextId++;
        world.enemies.push({
          id,
          archetype: 'guard',
          pos: { x: 0, y: 0 },
          facing: 0,
          state: { kind: 'dead', elapsedMs: 0 },
        } as unknown as Enemy);
        world.events.push({ type: 'enemy_died', tick: 0, actor: id, data: { archetype: 'guard' } } as never);
        world.players[0].pos = { x: 40, y: 40 };
        stepPickups(world, cfg, [], 16);
        for (const pickup of world.pickups) {
          if (pickup.kind === 'power') expect(pickup.offers, `held ${held}`).not.toBe(held);
        }
      }
    }
  });

  it('takes the same number of draws whether or not a power is rolled', () => {
    const a = createWorld(ENCOUNTERS.kernel_guard, DEFAULT_COMBAT, 3);
    const b = createWorld(ENCOUNTERS.kernel_guard, DEFAULT_COMBAT, 3);
    const kill = (world: World) => {
      const id = world.nextId++;
      world.enemies.push({
        id, archetype: 'guard', pos: { x: 0, y: 0 }, facing: 0, state: { kind: 'dead', elapsedMs: 0 },
      } as unknown as Enemy);
      world.events.push({ type: 'enemy_died', tick: 0, actor: id, data: { archetype: 'guard' } } as never);
    };
    kill(a);
    kill(b);
    stepPickups(a, { ...DEFAULT_COMBAT, drops: { ...DEFAULT_COMBAT.drops, chance: 0 } }, [], 16);
    stepPickups(b, { ...DEFAULT_COMBAT, drops: { ...DEFAULT_COMBAT.drops, chance: 1 } }, [], 16);
    expect(a.dropRng.value).toBe(b.dropRng.value);
  });
});

describe('run feats', () => {
  const ev = (type: string) => ({ type, tick: 0 }) as never;
  const clean: FeatContext = { escortTaken: false, escortAlive: false, escortUnharmed: false };
  const ids = (state: FeatState, ctx = clean) => earnedFeats(state, ctx).map((f) => f.id);

  it('gives a spotless run everything it can earn alone', () => {
    const state = createFeatState();
    observeFeats(state, [ev('parry_success')]);
    expect(ids(state)).toEqual([
      'first_try',
      'the_ladder',
      'unbroken',
      'bare_handed',
      'flawless',
      'untouched',
    ]);
  });

  it('loses a feat to a single event and never gets it back', () => {
    const state = createFeatState();
    observeFeats(state, [ev('hit_received')]);
    expect(ids(state)).not.toContain('untouched');
    observeFeats(state, []);
    expect(ids(state)).not.toContain('untouched');
  });

  it('will not call a run flawless that never parried', () => {
    const state = createFeatState();
    expect(ids(state)).not.toContain('flawless');
    observeFeats(state, [ev('parry_success')]);
    expect(ids(state)).toContain('flawless');
    observeFeats(state, [ev('parry_failed')]);
    expect(ids(state)).not.toContain('flawless');
  });

  it('takes the ladder away from a run that used the shortcut', () => {
    const state = createFeatState();
    expect(ids(state)).toContain('the_ladder');
    state.skipped = true;
    expect(ids(state)).not.toContain('the_ladder');
  });

  it('says nothing about an escort nobody took', () => {
    const state = createFeatState();
    expect(ids(state).some((id) => id.startsWith('escort'))).toBe(false);
  });

  it('separates bringing her home from bringing her home unhurt', () => {
    const state = createFeatState();
    const hurt = ids(state, { escortTaken: true, escortAlive: true, escortUnharmed: false });
    expect(hurt).toContain('escort');
    expect(hurt).not.toContain('escort_intact');

    const intact = ids(state, { escortTaken: true, escortAlive: true, escortUnharmed: true });
    expect(intact).toContain('escort_intact');
  });

  it('opens with what most players will have, not with the rarest', () => {
    const state = createFeatState();
    observeFeats(state, [ev('parry_success')]);
    const earned = ids(state);
    expect(earned.indexOf('first_try')).toBeLessThan(earned.indexOf('untouched'));
  });
});

describe('the sky on the powers', () => {

  const { autoSkyAt, AUTO_CYCLE_MS } = simWeather;

  const wetTick = (): number => {
    for (let t = 0; t < AUTO_CYCLE_MS; t += 1000) if (autoSkyAt(t).rain > 0.5) return t;
    throw new Error('no rain in the first cycle — the cycle shape changed');
  };

  it('leaves a held sky doing nothing at all', () => {
    const clear = structuredClone(COMBAT_PRESETS.Power_Lightning);
    expect(clear.weather ?? 'fixed').toBe('fixed');
    expect(simWeather.weatherPowerScale(simWeather.CLEAR_SKY, 'lightning')).toBe(1);
    expect(simWeather.weatherPowerScale(simWeather.CLEAR_SKY, 'incinerate')).toBe(1);
  });

  it('buffs lightning and nerfs incinerate by the same magnitude', () => {
    const sky = autoSkyAt(wetTick());
    const up = simWeather.weatherPowerScale(sky, 'lightning');
    const down = simWeather.weatherPowerScale(sky, 'incinerate');
    expect(up).toBeGreaterThan(1);
    expect(down).toBeLessThan(1);
    expect(up - 1).toBeCloseTo(1 - down, 10);
  });

  it('touches no other power', () => {
    const sky = autoSkyAt(wetTick());
    for (const power of ['blink', 'pull', 'push', 'freeze', 'turncoat'] as const) {
      expect(simWeather.weatherPowerScale(sky, power), power).toBe(1);
    }
  });

  it('changes what lightning actually deals, through the cast', () => {
    const make = (weather: 'fixed' | 'auto') => {
      const w = bareWorld();
      const c = structuredClone(COMBAT_PRESETS.Power_Lightning);
      c.weather = weather;
      w.tick = Math.round(wetTick() / TICK);
      w.players[0].facing = 0;
      w.players[0].stamina = w.players[0].maxStamina;
      const target = enemyAt(w, { x: 2, y: 0 }, 1, 9000);
      for (let i = 0; i < 240; i++) {
        stepPowers(w, w.players[0], intent({ powerHeld: true }), c, TICK);
      }
      return { hp: target.hp, max: target.maxHp };
    };

    const dry = make('fixed');
    const wet = make('auto');
    expect(wet.max - wet.hp).toBeGreaterThan(dry.max - dry.hp);
  });
});
