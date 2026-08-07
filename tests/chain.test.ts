
import type { ChainDef, CombatConfig, Enemy, World } from '../src/sim/types';
import { playerAttackDef } from '../src/sim/types';
import { bareWorld, cfg, countOf, firstOf, intent, run, ticksFor } from './support/world';

const chainCfg = (over: Partial<ChainDef> = {}): CombatConfig => {
  const c = cfg();
  c.player.chain = {
    steps: [
      {
        ...c.player.attacks.light,
        pose: 'light',
        windupMs: 220,
        activeMs: 80,
        recoveryMs: 300,
        damage: 16,
        staminaCost: 10,
      },
      {
        ...c.player.attacks.light,
        pose: 'light',
        windupMs: 280,
        activeMs: 90,
        recoveryMs: 380,
        damage: 26,
        staminaCost: 12,
      },
      {
        ...c.player.attacks.heavy,
        pose: 'heavy',
        windupMs: 380,
        activeMs: 110,
        recoveryMs: 410,
        damage: 56,
        staminaCost: 20,
      },
    ],
    resetMs: 1200,
    persistThroughStep: true,
    persistThroughGuard: true,
    ...over,
  };
  return c;
};

const STEP_MS = (c: CombatConfig, i: number): number => {
  const s = c.player.chain!.steps[i];
  return s.windupMs + s.activeMs + s.recoveryMs;
};

const swing = (world: World, c: CombatConfig, i: number) => {
  const events = run(world, 1, intent({ lightPressed: true }), { combat: c });
  const step = c.player.chain!.steps[i];
  events.push(
    ...run(world, ticksFor(STEP_MS(c, i) + step.hitstopMs) + 5, intent(), { combat: c }),
  );
  return events;
};

const dummy = (world: World, at = { x: 1.5, y: 0 }): Enemy => {
  const enemy: Enemy = {
    id: 1,
    archetype: 'guard',
    pos: { ...at },
    vel: { x: 0, y: 0 },
    facing: Math.PI,
    hp: 900,
    maxHp: 900,
    poise: 1000,
    maxPoise: 1000,
    state: {
      kind: 'recovery',
      enteredTick: world.tick,
      elapsedMs: 0,
      attackIndex: 0,
      telegraphJitterMs: 0,
      struck: [],
    },
    attackCooldownMs: 0,
    frozenMs: 600_000,
  };
  world.enemies.push(enemy);
  world.nextId = 2;
  return enemy;
};

describe('the chain advances', () => {
  it('speaks steps 0, 1, 2 and wraps back to 0', () => {
    const c = chainCfg();
    const w = bareWorld(c);
    const steps: unknown[] = [];
    for (let i = 0; i < 4; i++) {
      const events = swing(w, c, i % 3);
      steps.push(firstOf(events, 'attack_started')?.data?.chainStep);
    }
    expect(steps).toEqual([0, 1, 2, 0]);
  });

  it("walks each phase on the step's clocks, not the pose's", () => {
    const c = chainCfg();
    const w = bareWorld(c);
    run(w, 1, intent({ lightPressed: true }), { combat: c });
    expect(w.players[0].state.kind).toBe('windup');

    run(w, ticksFor(150), intent(), { combat: c });
    expect(w.players[0].state.kind).toBe('windup');

    run(w, ticksFor(220 - 150) + 1, intent(), { combat: c });
    expect(w.players[0].state.kind).toBe('active');
  });

  it("lands each step's own damage", () => {
    const c = chainCfg();
    const w = bareWorld(c);
    const enemy = dummy(w);
    const damages: unknown[] = [];
    for (let i = 0; i < 3; i++) {
      enemy.pos = { x: 1.5, y: 0 };
      enemy.vel = { x: 0, y: 0 };
      const events = swing(w, c, i);
      const hit = firstOf(events, 'hit_landed');
      damages.push(hit?.data?.damage);
      expect(hit?.data?.chainStep).toBe(i);
    }
    expect(damages).toEqual([16, 26, 56]);
  });

  it('the heavy press speaks the same chain — the fold lives in the sim', () => {
    const c = chainCfg();
    const w = bareWorld(c);
    const events = run(w, 1, intent({ heavyPressed: true }), { combat: c });
    const started = firstOf(events, 'attack_started');
    expect(started?.data?.chainStep).toBe(0);
    expect(started?.data?.attack).toBe('light');
  });

  it("refuses a step it cannot pay for, at that step's own price", () => {
    const c = chainCfg();
    const w = bareWorld(c);
    w.players[0].stamina = 9;
    run(w, 1, intent({ lightPressed: true }), { combat: c });
    expect(w.players[0].state.kind).not.toBe('windup');
  });

  it('pre-charges whichever step is next when launched inside the riposte window', () => {
    const c = chainCfg();
    const w = bareWorld(c);
    w.players[0].riposteWindowMs = c.player.parry.riposteWindowMs;
    const events = run(w, 1, intent({ lightPressed: true }), { combat: c });
    const started = firstOf(events, 'attack_started');
    expect(started?.data?.riposte).toBe(true);
    expect(started?.data?.effectiveWindupMs).toBeCloseTo(
      220 * c.player.parry.riposteWindupScale,
      6,
    );
  });
});

describe('the chain resets', () => {
  it('returns to step 0 after resetMs of idle, and says so', () => {
    const c = chainCfg();
    const w = bareWorld(c);
    swing(w, c, 0);

    const events = run(w, ticksFor(c.player.chain!.resetMs) + 2, intent(), { combat: c });
    const reset = firstOf(events, 'chain_reset');
    expect(reset?.data?.reason).toBe('timeout');

    const next = swing(w, c, 0);
    expect(firstOf(next, 'attack_started')?.data?.chainStep).toBe(0);
  });

  it('emits nothing when a reset would reset nothing', () => {
    const c = chainCfg();
    const w = bareWorld(c);
    const events = run(w, ticksFor(c.player.chain!.resetMs * 3), intent(), { combat: c });
    expect(countOf(events, 'chain_reset')).toBe(0);
  });

  it('a stagger always kills the sequence', () => {
    const c = chainCfg();
    const w = bareWorld(c);
    swing(w, c, 0);
    w.players[0].state = {
      kind: 'stagger',
      enteredTick: w.tick,
      elapsedMs: 0,
      attack: null,
      struck: [],
    };
    const events = run(w, 1, intent(), { combat: c });
    expect(firstOf(events, 'chain_reset')?.data?.reason).toBe('stagger');
    expect(w.players[0].chainStep).toBe(0);
  });
});

describe('the persistence dials', () => {
  it('a dodge keeps the place when persistThroughStep is on', () => {
    const c = chainCfg();
    const w = bareWorld(c);
    swing(w, c, 0);

    run(w, 1, intent({ stepPressed: true }), { combat: c });
    run(w, ticksFor(c.player.step.durationMs + c.player.step.recoveryMs) + 2, intent(), {
      combat: c,
    });

    const events = swing(w, c, 1);
    expect(firstOf(events, 'attack_started')?.data?.chainStep).toBe(1);
  });

  it('a dodge resets it when persistThroughStep is off', () => {
    const c = chainCfg({ persistThroughStep: false });
    const w = bareWorld(c);
    swing(w, c, 0);

    const stepEvents = run(w, 1, intent({ stepPressed: true }), { combat: c });
    expect(firstOf(stepEvents, 'chain_reset')?.data?.reason).toBe('step');

    run(w, ticksFor(c.player.step.durationMs + c.player.step.recoveryMs) + 2, intent(), {
      combat: c,
    });
    const events = swing(w, c, 0);
    expect(firstOf(events, 'attack_started')?.data?.chainStep).toBe(0);
  });

  it('a guard press keeps or kills the place by persistThroughGuard', () => {
    const keep = chainCfg();
    const w1 = bareWorld(keep);
    swing(w1, keep, 0);
    run(w1, 3, intent({ guardPressed: true, guardHeld: true }), { combat: keep });
    run(w1, ticksFor(600), intent(), { combat: keep });
    expect(firstOf(swing(w1, keep, 1), 'attack_started')?.data?.chainStep).toBe(1);

    const kill = chainCfg({ persistThroughGuard: false });
    const w2 = bareWorld(kill);
    swing(w2, kill, 0);
    const guardEvents = run(w2, 3, intent({ guardPressed: true, guardHeld: true }), {
      combat: kill,
    });
    expect(firstOf(guardEvents, 'chain_reset')?.data?.reason).toBe('guard');
  });
});

describe('absence is inert', () => {
  it('a two-verb world never grows the chain keys and never resets', () => {
    const c = cfg();
    const w = bareWorld(c);
    const events = run(w, ticksFor(3000), intent({ lightPressed: true }), { combat: c });
    expect(w.players[0].chainStep).toBeUndefined();
    expect(w.players[0].chainIdleMs).toBeUndefined();
    expect(w.players[0].state.chainStep).toBeUndefined();
    expect(countOf(events, 'chain_reset')).toBe(0);
    for (const e of events) {
      if (e.type === 'attack_started' || e.type === 'hit_landed') {
        expect(e.data?.chainStep).toBeUndefined();
      }
    }
  });

  it('the resolver answers the pose def when no chain is equipped', () => {
    const c = cfg();
    const state = {
      kind: 'windup' as const,
      enteredTick: 0,
      elapsedMs: 0,
      attack: 'heavy' as const,
      struck: [],
    };
    expect(playerAttackDef(state, c.player)).toBe(c.player.attacks.heavy);
  });
});
