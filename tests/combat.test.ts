
import {
  applyDamageToPlayer,
  inArc,
  parryPhaseAt,
  resolvePlayerAttack,
} from '../src/sim/combat';
import type { Enemy, World } from '../src/sim/types';
import { PLAYER_ID } from '../src/sim/types';
import { bareWorld, cfg, firstOf } from './support/world';

const PI = Math.PI;

const hit = (over: Partial<Parameters<typeof applyDamageToPlayer>[3]> = {}) => ({
  amount: 20,
  sourceId: 1,
  fromPos: { x: 2, y: 0 },
  parryable: true,
  attackId: 'test_swing',
  ...over,
});

const parryingFor = (world: World, elapsedMs: number): void => {
  world.players[0].state = {
    kind: 'parry',
    enteredTick: world.tick,
    elapsedMs,
    attack: null,
    struck: [],
  };
};

const guarding = (world: World): void => {
  world.players[0].state = {
    kind: 'guard',
    enteredTick: world.tick,
    elapsedMs: 0,
    attack: null,
    struck: [],
  };
};

const dummy = (world: World, at = { x: 2, y: 0 }): Enemy => {
  const enemy: Enemy = {
    id: 1,
    archetype: 'guard',
    pos: { ...at },
    vel: { x: 0, y: 0 },
    facing: PI,
    hp: 90,
    maxHp: 90,
    poise: 100,
    maxPoise: 100,
    state: {
      kind: 'attack',
      enteredTick: world.tick,
      elapsedMs: 0,
      attackIndex: 0,
      telegraphJitterMs: 0,
      struck: [],
    },
    attackCooldownMs: 0,
  };
  world.enemies.push(enemy);
  world.nextId = 2;
  return enemy;
};


describe('inArc', () => {
  it('excludes a target one unit past the range and includes one exactly on it', () => {
    const o = { x: 0, y: 0 };
    expect(inArc(o, 0, { x: 2, y: 0 }, 2, 90)).toBe(true);
    expect(inArc(o, 0, { x: 2.0001, y: 0 }, 2, 90)).toBe(false);
  });

  it('includes the arc edge and excludes just past it', () => {
    const o = { x: 0, y: 0 };
    const onEdge = { x: Math.cos(PI / 4), y: Math.sin(PI / 4) };
    const past = { x: Math.cos(PI / 4 + 0.001), y: Math.sin(PI / 4 + 0.001) };
    expect(inArc(o, 0, onEdge, 2, 90)).toBe(true);
    expect(inArc(o, 0, past, 2, 90)).toBe(false);
  });

  it('wraps correctly across the +/-PI seam', () => {
    const o = { x: 0, y: 0 };
    expect(inArc(o, PI - 0.01, { x: -1, y: -0.01 }, 2, 30)).toBe(true);
  });

  it('treats a 360 arc as omnidirectional and a co-located target as inside', () => {
    const o = { x: 0, y: 0 };
    expect(inArc(o, 0, { x: -1, y: 0 }, 2, 360)).toBe(true);
    expect(inArc(o, 0, { x: -1, y: 0 }, 2, 90)).toBe(false);
    expect(inArc(o, 0, { x: 0, y: 0 }, 2, 1)).toBe(true);
  });
});

describe('parryPhaseAt', () => {
  const parry = cfg().player.parry;

  it('opens the perfect window bufferMs before the visible onset', () => {
    expect(parryPhaseAt(-1, parry)).toBe('perfect');
    expect(parryPhaseAt(0, parry)).toBe('perfect');
  });

  it('walks onset -> perfect -> late -> expired at the exact edges', () => {
    const strict = { ...parry, onsetMs: 60, perfectMs: 70, lateMs: 110, bufferMs: 40 };
    expect(parryPhaseAt(19.999, strict)).toBe('onset');
    expect(parryPhaseAt(20, strict)).toBe('perfect');
    expect(parryPhaseAt(129.999, strict)).toBe('perfect');
    expect(parryPhaseAt(130, strict)).toBe('late');
    expect(parryPhaseAt(239.999, strict)).toBe('late');
    expect(parryPhaseAt(240, strict)).toBe('expired');
  });

  it('makes the onset unreachable when the buffer swallows it', () => {
    const generous = { ...parry, onsetMs: 20, bufferMs: 120 };
    expect(parryPhaseAt(0, generous)).toBe('perfect');
    expect(parryPhaseAt(-99, generous)).toBe('perfect');
  });
});

describe('perfect parry', () => {
  it('takes no damage, feeds stamina, arms the riposte, and freezes the frame', () => {
    const w = bareWorld();
    const c = cfg();
    dummy(w);
    w.players[0].stamina = 40;
    parryingFor(w, c.player.parry.onsetMs + 10);

    const out = applyDamageToPlayer(w, w.players[0], c, hit());

    expect(out).toBe('parried');
    expect(w.players[0].hp).toBe(w.players[0].maxHp);
    expect(w.players[0].stamina).toBe(40 + c.player.parry.staminaReward);
    expect(w.players[0].riposteWindowMs).toBe(c.player.parry.riposteWindowMs);
    expect(w.players[0].parryStreak).toBe(1);
    expect(w.hitstopMs).toBe(c.player.parry.hitstopMs);
  });

  it('records a signed offset from the centre of the window, negative when early', () => {
    const c = cfg();
    const centre = c.player.parry.onsetMs + c.player.parry.perfectMs / 2;

    const early = bareWorld();
    dummy(early);
    parryingFor(early, centre - 30);
    applyDamageToPlayer(early, early.players[0], c, hit());
    expect(firstOf(early.events, 'parry_success')?.data?.offsetMs).toBeCloseTo(-30, 6);

    const late = bareWorld();
    dummy(late);
    parryingFor(late, centre + 25);
    applyDamageToPlayer(late, late.players[0], c, hit());
    const ev = firstOf(late.events, 'parry_success');
    expect(ev?.data?.offsetMs).toBeCloseTo(25, 6);
    expect(ev?.data?.windowMs).toBe(c.player.parry.perfectMs);
    expect(ev?.data?.pressLeadMs).toBeCloseTo(centre + 25, 6);
  });

  it('tears poise off the attacker and interrupts its swing even when poise survives', () => {
    const w = bareWorld();
    const c = cfg();
    const enemy = dummy(w);
    parryingFor(w, c.player.parry.onsetMs + 10);

    applyDamageToPlayer(w, w.players[0], c, hit());

    expect(enemy.poise).toBe(100 - c.player.parry.poiseDamage);
    expect(enemy.state.kind).toBe('recovery');
  });

  it('staggers the attacker when the parry breaks its poise', () => {
    const w = bareWorld();
    const c = cfg();
    const enemy = dummy(w);
    enemy.poise = 10;
    parryingFor(w, c.player.parry.onsetMs + 10);

    applyDamageToPlayer(w, w.players[0], c, hit());

    expect(enemy.state.kind).toBe('stagger');
    expect(enemy.poise).toBe(0);
    expect(firstOf(w.events, 'enemy_staggered')).toBeDefined();
  });

  it('fails on timing but reports the arc when the blow comes from behind', () => {
    const w = bareWorld();
    const c = cfg();
    dummy(w, { x: -2, y: 0 });
    parryingFor(w, c.player.parry.onsetMs + 10);

    const out = applyDamageToPlayer(w, w.players[0], c, hit({ fromPos: { x: -2, y: 0 } }));

    expect(firstOf(w.events, 'parry_failed')?.data?.reason).toBe('arc');
    expect(out).toBe('hit');
  });
});

describe('failed parry', () => {
  it('leaves the player fully exposed when pressed too early', () => {
    const w = bareWorld();
    const c = cfg();
    c.player.parry.bufferMs = 0;
    dummy(w);
    parryingFor(w, 5);

    const out = applyDamageToPlayer(w, w.players[0], c, hit());

    expect(out).toBe('hit');
    expect(w.players[0].hp).toBe(w.players[0].maxHp - 20);
    expect(firstOf(w.events, 'parry_failed')?.data?.reason).toBe('early');
  });

  it('blocks cleanly when late, and says the block came from a missed parry', () => {
    const w = bareWorld();
    const c = cfg();
    dummy(w);
    parryingFor(w, c.player.parry.onsetMs + c.player.parry.perfectMs + 10);

    const out = applyDamageToPlayer(w, w.players[0], c, hit());

    expect(out).toBe('blocked');
    expect(firstOf(w.events, 'parry_failed')?.data?.reason).toBe('late');
    expect(firstOf(w.events, 'guard_success')?.data?.viaLateParry).toBe(true);
    expect(w.players[0].hp).toBeCloseTo(100 - 20 * c.player.guard.chipFraction, 6);
  });

  it('resets the streak on any damage taken', () => {
    const w = bareWorld();
    const c = cfg();
    dummy(w);
    w.players[0].parryStreak = 4;
    applyDamageToPlayer(w, w.players[0], c, hit());
    expect(w.players[0].parryStreak).toBe(0);
  });
});

describe('guard', () => {
  it('chips, drains stamina, and holds', () => {
    const w = bareWorld();
    const c = cfg();
    dummy(w);
    guarding(w);
    w.players[0].stamina = 60;

    const out = applyDamageToPlayer(w, w.players[0], c, hit());

    expect(out).toBe('blocked');
    expect(w.players[0].stamina).toBe(60 - c.player.guard.staminaPerHit);
    expect(w.players[0].hp).toBeCloseTo(100 - 20 * c.player.guard.chipFraction, 6);
    expect(firstOf(w.events, 'guard_success')?.data?.viaLateParry).toBe(false);
  });

  it('breaks and staggers when stamina cannot pay for the block', () => {
    const w = bareWorld();
    const c = cfg();
    dummy(w);
    guarding(w);
    w.players[0].stamina = c.player.guard.staminaPerHit - 1;

    const out = applyDamageToPlayer(w, w.players[0], c, hit());

    expect(out).toBe('guard_broken');
    expect(w.players[0].stamina).toBe(0);
    expect(w.players[0].hp).toBe(80);
    expect(w.players[0].state.kind).toBe('stagger');
    expect(firstOf(w.events, 'guard_broken')).toBeDefined();
  });

  it('does not protect the back', () => {
    const w = bareWorld();
    const c = cfg();
    dummy(w, { x: -2, y: 0 });
    guarding(w);

    const out = applyDamageToPlayer(w, w.players[0], c, hit({ fromPos: { x: -2, y: 0 } }));

    expect(out).toBe('hit');
    expect(firstOf(w.events, 'hit_received')?.data?.reason).toBe('behind_guard');
  });
});

describe('unparryable attacks', () => {
  it('ignore both the shield and a perfectly timed window', () => {
    const w = bareWorld();
    const c = cfg();
    dummy(w);
    parryingFor(w, c.player.parry.onsetMs + 10);

    const out = applyDamageToPlayer(w, w.players[0], c, hit({ parryable: false }));

    expect(out).toBe('hit');
    expect(w.players[0].hp).toBe(80);
    expect(firstOf(w.events, 'hit_received')?.data?.reason).toBe('unparryable');
    expect(firstOf(w.events, 'parry_success')).toBeUndefined();
  });
});

describe('i-frames', () => {
  it('evade the hit entirely and log it as the attacker whiffing', () => {
    const w = bareWorld();
    const c = cfg();
    dummy(w);
    w.players[0].iframeMs = 50;

    const out = applyDamageToPlayer(w, w.players[0], c, hit());

    expect(out).toBe('evaded');
    expect(w.players[0].hp).toBe(100);
    expect(firstOf(w.events, 'attack_whiffed')?.data?.reason).toBe('iframe');
    expect(w.slowMo.pending).toBe('near_miss');
  });
});

describe('player attacks', () => {
  it('strikes each target once per swing and respects maxTargets', () => {
    const w = bareWorld();
    const c = cfg();
    for (let i = 0; i < 4; i++) {
      const e = dummy(w, { x: 1.5, y: -0.6 + i * 0.4 });
      e.id = 10 + i;
      e.state.kind = 'approach';
    }
    w.nextId = 20;
    c.player.attacks.heavy.maxTargets = 2;
    w.players[0].state = {
      kind: 'active',
      enteredTick: w.tick,
      elapsedMs: 0,
      attack: 'heavy',
      struck: [],
    };

    resolvePlayerAttack(w, w.players[0], c);
    const afterFirst = w.players[0].state.struck.length;
    resolvePlayerAttack(w, w.players[0], c);

    expect(afterFirst).toBe(2);
    expect(w.players[0].state.struck.length).toBe(2);
    expect(w.events.filter((e) => e.type === 'hit_landed')).toHaveLength(2);
  });

  it('requests last_enemy rather than lethal_heavy when the heavy kills the final target', () => {
    const w = bareWorld();
    const c = cfg();
    const enemy = dummy(w);
    enemy.state.kind = 'approach';
    enemy.hp = 1;
    w.players[0].state = {
      kind: 'active',
      enteredTick: w.tick,
      elapsedMs: 0,
      attack: 'heavy',
      struck: [],
    };

    resolvePlayerAttack(w, w.players[0], c);

    expect(enemy.state.kind).toBe('dead');
    expect(firstOf(w.events, 'enemy_died')?.actor).toBe(enemy.id);
    expect(w.slowMo.pending).toBe('last_enemy');
  });

  it('does not restart a stagger the next hit lands in', () => {
    const w = bareWorld();
    const c = cfg();
    const enemy = dummy(w);
    enemy.poise = 10;
    enemy.hp = 400;
    enemy.maxHp = 400;
    const swing = (): void => {
      w.players[0].state = {
        kind: 'active',
        enteredTick: w.tick,
        elapsedMs: 0,
        attack: 'heavy',
        struck: [],
      };
      resolvePlayerAttack(w, w.players[0], c);
    };

    swing();
    expect(enemy.state.kind).toBe('stagger');
    const brokenAt = enemy.state.enteredTick;
    enemy.state.elapsedMs = 400;
    w.tick += 48;
    w.events.length = 0;

    swing();

    expect(enemy.state.kind).toBe('stagger');
    expect(enemy.state.enteredTick).toBe(brokenAt);
    expect(enemy.state.elapsedMs).toBe(400);
    expect(firstOf(w.events, 'enemy_staggered')).toBeUndefined();
    expect(firstOf(w.events, 'hit_landed')?.data?.damage).toBe(c.player.attacks.heavy.damage);
  });

  it('carries enough payload on hit_landed to reconstruct the moment', () => {
    const w = bareWorld();
    const c = cfg();
    const enemy = dummy(w);
    enemy.state.kind = 'telegraph';
    w.players[0].state = {
      kind: 'active',
      enteredTick: w.tick,
      elapsedMs: 0,
      attack: 'light',
      struck: [],
    };

    resolvePlayerAttack(w, w.players[0], c);

    const ev = firstOf(w.events, 'hit_landed');
    expect(ev?.actor).toBe(PLAYER_ID);
    expect(ev?.target).toBe(enemy.id);
    expect(ev?.data?.enemyState).toBe('telegraph');
    expect(ev?.data?.damage).toBe(c.player.attacks.light.damage);
    expect(ev?.data?.poiseRemaining).toBe(100 - c.player.attacks.light.poiseDamage);
  });
});
