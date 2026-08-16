
import type { Enemy, Player, SlowMoConfig, World } from '../src/sim/types';
import { requestSlowMo, stepSlowMo } from '../src/sim/slowmo';
import { TICK_MS } from '../src/sim/types';
import { SLOWMO_PRESETS } from '../src/lab/config';
import { bareWorld, cfg, intent } from './support/world';

const preset = (id: string): SlowMoConfig => structuredClone(SLOWMO_PRESETS[id]);

const secondKing = (world: World): Player => {
  const second: Player = { ...structuredClone(world.players[0]), id: world.nextId++ };
  world.players.push(second);
  return second;
};

const enemyIn = (world: World, kind: Enemy['state']['kind'], id: number): Enemy => {
  const e: Enemy = {
    id,
    archetype: 'guard',
    pos: { x: 2, y: 0 },
    vel: { x: 0, y: 0 },
    facing: Math.PI,
    hp: 90,
    maxHp: 90,
    poise: 100,
    maxPoise: 100,
    state: {
      kind,
      enteredTick: world.tick,
      elapsedMs: 0,
      attackIndex: 0,
      telegraphJitterMs: 0,
      struck: [],
    },
    attackCooldownMs: 0,
  };
  world.enemies.push(e);
  return e;
};

const tick = (world: World, config: SlowMoConfig, over = {}): void => {
  stepSlowMo(world, config, cfg(), [intent(over)], TICK_MS);
};

describe('the control condition', () => {
  it('never touches the clocks in mode none', () => {
    const w = bareWorld();
    const none = preset('none');
    requestSlowMo(w, w.players[0], 'perfect_parry');

    tick(w, none);

    expect(w.slowMo.active).toBe(false);
    expect(w.slowMo.scales).toEqual({ world: 1, player: 1 });
    expect(w.events).toHaveLength(0);
  });
});

describe('activation', () => {
  it('fires on a requested trigger it is configured to listen for', () => {
    const w = bareWorld();
    const s = preset('static');
    requestSlowMo(w, w.players[0], 'perfect_parry');

    tick(w, s);

    expect(w.slowMo.active).toBe(true);
    expect(w.slowMo.lastTrigger).toBe('perfect_parry');
    const ev = w.events.find((e) => e.type === 'slowmo_started');
    expect(ev?.data?.trigger).toBe('perfect_parry');
    expect(ev?.data?.worldScale).toBeCloseTo(s.worldScale);
  });

  it('ignores a trigger it is not configured for', () => {
    const w = bareWorld();
    const s = preset('static');
    requestSlowMo(w, w.players[0], 'near_miss');

    tick(w, s);

    expect(w.slowMo.active).toBe(false);
  });

  it('clears the pending request whether or not it fired', () => {
    const w = bareWorld();
    requestSlowMo(w, w.players[0], 'near_miss');
    tick(w, preset('static'));
    expect(w.slowMo.pending).toBeNull();
  });

  it('will not fire while the player is dead', () => {
    const w = bareWorld();
    w.players[0].state = { kind: 'dead', enteredTick: 0, elapsedMs: 0, attack: null, struck: [] };
    requestSlowMo(w, w.players[0], 'perfect_parry');

    tick(w, preset('static'));

    expect(w.slowMo.active).toBe(false);
  });
});

describe('trigger precedence', () => {
  it('keeps the stronger moment when two are raised on the same tick', () => {
    const a = bareWorld();
    requestSlowMo(a, a.players[0], 'near_miss');
    requestSlowMo(a, a.players[0], 'perfect_parry');
    expect(a.slowMo.pending).toBe('perfect_parry');

    const b = bareWorld();
    requestSlowMo(b, b.players[0], 'perfect_parry');
    requestSlowMo(b, b.players[0], 'near_miss');
    expect(b.slowMo.pending).toBe('perfect_parry');
  });
});

describe('the blend', () => {
  it('eases in and back out rather than snapping', () => {
    const w = bareWorld();
    const s = preset('static');
    requestSlowMo(w, w.players[0], 'perfect_parry');
    tick(w, s);

    const scales: number[] = [w.slowMo.scales.world];
    for (let i = 0; i < Math.ceil(s.durationMs / TICK_MS) + 4; i++) {
      tick(w, s);
      scales.push(w.slowMo.scales.world);
    }

    expect(scales[0]).toBe(1);
    expect(Math.min(...scales)).toBeCloseTo(s.worldScale, 5);
    expect(scales[scales.length - 1]).toBe(1);
    expect(w.slowMo.active).toBe(false);
    expect(w.events.some((e) => e.type === 'slowmo_ended')).toBe(true);
  });

  it('scales the player less than the world', () => {
    const w = bareWorld();
    const s = preset('static');
    requestSlowMo(w, w.players[0], 'perfect_parry');
    tick(w, s);
    for (let i = 0; i < 30; i++) tick(w, s);

    expect(w.slowMo.scales.player).toBeGreaterThan(w.slowMo.scales.world);
  });
});

describe('rationing', () => {
  it('holds a cooldown between activations', () => {
    const w = bareWorld();
    const s = preset('static');
    requestSlowMo(w, w.players[0], 'perfect_parry');
    tick(w, s);
    for (let i = 0; i < Math.ceil(s.durationMs / TICK_MS) + 2; i++) tick(w, s);
    expect(w.slowMo.active).toBe(false);

    requestSlowMo(w, w.players[0], 'perfect_parry');
    tick(w, s);

    expect(w.slowMo.active).toBe(false);
    expect(w.players[0].slowMoCooldownMs).toBeGreaterThan(0);
  });

  it('stops at maxPerEncounter', () => {
    const w = bareWorld();
    const s = preset('static');
    s.cooldownMs = 0;
    s.maxPerEncounter = 2;

    for (let round = 0; round < 5; round++) {
      requestSlowMo(w, w.players[0], 'perfect_parry');
      tick(w, s);
      for (let i = 0; i < Math.ceil(s.durationMs / TICK_MS) + 2; i++) tick(w, s);
    }

    expect(w.players[0].slowMoUsedThisEncounter).toBe(2);
  });
});

describe('one intention per Instante Real', () => {
  it('ends early when the player commits to a decisive action', () => {
    const w = bareWorld();
    const s = preset('static');
    requestSlowMo(w, w.players[0], 'perfect_parry');
    tick(w, s);
    for (let i = 0; i < 20; i++) tick(w, s);
    const before = w.slowMo.remainingMs;

    tick(w, s, { heavyPressed: true });

    expect(w.slowMo.remainingMs).toBeLessThan(before);
    expect(w.slowMo.remainingMs).toBeLessThanOrEqual(s.blendMs);
  });

  it('does not end on movement or guard', () => {
    const w = bareWorld();
    const s = preset('static');
    requestSlowMo(w, w.players[0], 'perfect_parry');
    tick(w, s);
    for (let i = 0; i < 20; i++) tick(w, s);
    const before = w.slowMo.remainingMs;

    tick(w, s, { move: { x: 1, y: 0 }, guardHeld: true });

    expect(w.slowMo.remainingMs).toBeGreaterThan(s.blendMs);
    expect(w.slowMo.remainingMs).toBeLessThan(before);
  });
});

describe('variant C — assist', () => {
  it('reads overload from the world rather than from a request', () => {
    const w = bareWorld();
    const s = preset('assist');
    enemyIn(w, 'telegraph', 1);
    enemyIn(w, 'attack', 2);

    tick(w, s);

    expect(w.slowMo.active).toBe(true);
    expect(w.slowMo.lastTrigger).toBe('multi_threat');
  });

  it('stays quiet against a single committed enemy', () => {
    const w = bareWorld();
    enemyIn(w, 'telegraph', 1);
    tick(w, preset('assist'));
    expect(w.slowMo.active).toBe(false);
  });
});

describe('variant D — player focus', () => {
  it('banks charge from perfect parries and spends it on demand', () => {
    const w = bareWorld();
    const s = preset('player_focus');

    for (let i = 0; i < s.chargePerActivation; i++) {
      requestSlowMo(w, w.players[0], 'perfect_parry');
      tick(w, s);
      expect(w.slowMo.active).toBe(false);
    }
    expect(w.slowMo.charge).toBe(s.chargePerActivation);

    tick(w, s, { focusPressed: true });

    expect(w.slowMo.active).toBe(true);
    expect(w.slowMo.lastTrigger).toBe('manual');
    expect(w.slowMo.charge).toBe(0);
  });

  it('refuses to fire on an empty meter', () => {
    const w = bareWorld();
    const s = preset('player_focus');

    tick(w, s, { focusPressed: true });

    expect(w.slowMo.active).toBe(false);
    expect(w.slowMo.charge).toBe(0);
  });
});

describe('real time', () => {
  it('measures its duration in engine time, not in the time it is slowing', () => {
    const w = bareWorld();
    const s = preset('static');
    requestSlowMo(w, w.players[0], 'perfect_parry');
    tick(w, s);

    let ticks = 0;
    while (w.slowMo.active && ticks < 1000) {
      tick(w, s);
      ticks += 1;
    }

    expect(ticks * TICK_MS).toBeCloseTo(s.durationMs, 0);
    void cfg;
  });
});

describe('the budget and the cooldown belong to the player', () => {
  it("does not spend one king's cooldown on the other's parry", () => {
    const w = bareWorld();
    const second = secondKing(w);
    const s = preset('static');

    requestSlowMo(w, w.players[0], 'perfect_parry');
    tick(w, s);
    expect(w.slowMo.active).toBe(true);
    expect(w.players[0].slowMoCooldownMs).toBeGreaterThan(0);
    expect(second.slowMoCooldownMs).toBe(0);
    expect(second.slowMoUsedThisEncounter).toBe(0);

    for (let i = 0; i < Math.ceil(s.durationMs / TICK_MS) + 2; i++) tick(w, s);
    expect(w.slowMo.active).toBe(false);

    expect(w.players[0].slowMoCooldownMs).toBeGreaterThan(0);
    requestSlowMo(w, second, 'perfect_parry');
    tick(w, s);

    expect(w.slowMo.active).toBe(true);
    expect(second.slowMoUsedThisEncounter).toBe(1);
  });

  it('gives each king their own maxPerEncounter rather than a shared six', () => {
    const w = bareWorld();
    const second = secondKing(w);
    const s = preset('static');
    s.cooldownMs = 0;
    s.maxPerEncounter = 1;

    const fire = (owner: Player): void => {
      requestSlowMo(w, owner, 'perfect_parry');
      tick(w, s);
      for (let i = 0; i < Math.ceil(s.durationMs / TICK_MS) + 2; i++) tick(w, s);
    };

    fire(w.players[0]);
    fire(w.players[0]);
    expect(w.players[0].slowMoUsedThisEncounter).toBe(1);

    fire(second);
    expect(second.slowMoUsedThisEncounter).toBe(1);
  });

  it('resolves one set of scales for the tick, so the partner is carried inside it', () => {
    const w = bareWorld();
    const second = secondKing(w);
    const s = preset('static');

    requestSlowMo(w, second, 'perfect_parry');
    tick(w, s);
    expect(w.slowMo.scales.world).toBe(1);
    for (let i = 0; i < Math.ceil(s.blendMs / TICK_MS); i++) tick(w, s);

    expect(w.slowMo.scales.world).toBeLessThan(1);
    expect(w.players[0].slowMoUsedThisEncounter).toBe(0);
  });
});

describe('first contact — the teaching trigger', () => {
  const teaching = (): SlowMoConfig => ({
    ...preset('shipped'),
    triggers: ['first_contact'],
  });

  it('fires on the first telegraph of an attack and not on the second', () => {
    const w = bareWorld();
    const c = teaching();
    enemyIn(w, 'telegraph', 1);

    tick(w, c);
    expect(w.slowMo.active).toBe(true);
    expect(w.slowMo.lastTrigger).toBe('first_contact');
    const taught = cfg().enemies.guard.attacks[0].id;
    expect(w.slowMo.seenAttacks).toEqual([taught]);

    w.slowMo.active = false;
    w.slowMo.remainingMs = 0;
    w.slowMo.lastTrigger = null;
    w.players[0].slowMoCooldownMs = 0;
    tick(w, c);

    expect(w.slowMo.active).toBe(false);
  });

  it('teaches per attack, not per body', () => {
    const w = bareWorld();
    const c = teaching();
    const e = enemyIn(w, 'telegraph', 1);
    tick(w, c);
    expect(w.slowMo.seenAttacks).toHaveLength(1);

    w.slowMo.active = false;
    w.slowMo.remainingMs = 0;
    w.players[0].slowMoCooldownMs = 0;
    e.state = { ...e.state, kind: 'telegraph', attackIndex: 1, elapsedMs: 0 };
    tick(w, c);

    const second = cfg().enemies.guard.attacks[1]?.id;
    if (second !== undefined && second !== cfg().enemies.guard.attacks[0].id) {
      expect(w.slowMo.active).toBe(true);
      expect(w.slowMo.seenAttacks).toHaveLength(2);
    }
  });

  it('marks nothing while the trigger is off', () => {
    const w = bareWorld();
    enemyIn(w, 'telegraph', 1);
    tick(w, preset('none'));

    expect(w.slowMo.seenAttacks).toEqual([]);
    expect(w.slowMo.active).toBe(false);
  });

  it('does not spend the lesson on a tick the cooldown refuses', () => {
    const w = bareWorld();
    const c = teaching();
    enemyIn(w, 'telegraph', 1);
    w.players[0].slowMoCooldownMs = 5000;

    tick(w, c);

    expect(w.slowMo.active).toBe(false);
    expect(w.slowMo.seenAttacks).toEqual([]);
  });
});
