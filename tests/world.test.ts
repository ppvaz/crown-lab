
import type { CombatConfig, Enemy, Player, World } from '../src/sim/types';
import { TICK_MS } from '../src/sim/types';
import { hashWorld, stepPublicWorld, stepWorld } from '../src/sim/world';
import { SLOWMO_PRESETS } from '../src/lab/config';
import {
  PUBLIC_COMBAT,
  PUBLIC_ENCOUNTER,
  PUBLIC_ENCOUNTERS,
  PUBLIC_SLOWMO,
} from '../src/game/public-profile';
import {
  bareWorld,
  cfg,
  emptyEncounter,
  intent,
  noSlowMo,
  oneEnemy,
  run,
  ticksFor,
} from './support/world';
import { createWorld } from '../src/sim/encounter';

const step = (w: World, c: CombatConfig, over = {}): void => {
  stepWorld(w, [intent(over)], c, noSlowMo(), emptyEncounter());
};

const addGuard = (
  w: World,
  at = { x: 2, y: 0 },
  kind: 'telegraph' | 'approach' = 'telegraph',
): Enemy => {
  const e: Enemy = {
    id: w.nextId++,
    archetype: 'guard' as const,
    pos: { ...at },
    vel: { x: 0, y: 0 },
    facing: Math.PI,
    hp: 90,
    maxHp: 90,
    poise: 100,
    maxPoise: 100,
    state: {
      kind,
      enteredTick: w.tick,
      elapsedMs: 0,
      attackIndex: 0,
      telegraphJitterMs: 0,
      struck: [] as number[],
    },
    attackCooldownMs: 0,
  };
  w.enemies.push(e);
  return e;
};

describe('the tick', () => {
  it('clears events and advances the counter every tick', () => {
    const w = bareWorld();
    const c = cfg();
    const before = w.tick;

    step(w, c, { lightPressed: true });
    expect(w.tick).toBe(before + 1);
    const first = w.events.length;

    step(w, c);
    expect(w.events.length).toBeLessThanOrEqual(first + 1);
  });
});

describe('public kernel orchestrator', () => {
  const drive = (tick: number) =>
    intent({
      move: tick < 180 ? { x: 1, y: 0 } : { x: 0, y: 0 },
      guardPressed: tick % 170 === 0,
      guardHeld: tick % 170 < 20,
      lightPressed: tick % 240 === 80,
      heavyPressed: tick % 360 === 140,
      stepPressed: tick % 420 === 220,
      powerHeld: tick % 500 >= 280 && tick % 500 < 350,
    });



  for (const [id, def] of Object.entries(PUBLIC_ENCOUNTERS)) {
    it(`steps ${id} identically to the full orchestrator`, () => {
      const combat = structuredClone(PUBLIC_COMBAT);
      const full = createWorld(def, combat, 1);
      const kernel = structuredClone(full);

      for (let tick = 0; tick < 1_200; tick += 1) {
        const input = drive(tick);
        stepWorld(full, [input], combat, PUBLIC_SLOWMO, def);
        stepPublicWorld(kernel, [input], combat, PUBLIC_SLOWMO, def);
        expect(kernel, `tick ${tick}`).toEqual(full);
      }
    });
  }

  it('covers the default encounter through that sweep', () => {
    expect(Object.values(PUBLIC_ENCOUNTERS)).toContain(PUBLIC_ENCOUNTER);
  });
});

describe('hitstop', () => {
  it('freezes everything, not merely the two actors involved', () => {
    const w = bareWorld();
    const c = cfg();
    const bystander = addGuard(w, { x: 6, y: 0 });
    w.hitstopMs = 50;

    const playerBefore = w.players[0].state.elapsedMs;
    const enemyBefore = bystander.state.elapsedMs;
    step(w, c);

    expect(bystander.state.elapsedMs).toBe(enemyBefore);
    expect(w.players[0].state.elapsedMs).toBe(playerBefore);
    expect(w.encounter.elapsedMs).toBe(0);
  });

  it('freezes the pair and nobody else once a second king is present', () => {
    const w = bareWorld();
    const c = cfg();
    const struck = addGuard(w, { x: 1.2, y: 0 }, 'approach');
    const bystander = addGuard(w, { x: 8, y: 0 }, 'approach');
    const second: Player = { ...structuredClone(w.players[0]), id: w.nextId++, pos: { x: -6, y: 0 } };
    w.players.push(second);
    w.players[0].facing = 0;

    step(w, c, { heavyPressed: true });
    for (let i = 0; i < 60 && (w.players[0].hitstopMs ?? 0) === 0; i++) step(w, c);

    expect(w.hitstopMs).toBe(0);
    expect(w.players[0].hitstopMs ?? 0).toBeGreaterThan(0);
    expect(struck.hitstopMs ?? 0).toBeGreaterThan(0);
    expect(bystander.hitstopMs ?? 0).toBe(0);
    expect(second.hitstopMs ?? 0).toBe(0);

    const frozenBefore = w.players[0].state.elapsedMs;
    const partnerBefore = second.state.elapsedMs;
    const bystanderBefore = bystander.state.elapsedMs;
    step(w, c);

    expect(w.players[0].state.elapsedMs).toBe(frozenBefore);
    expect(second.state.elapsedMs).toBeGreaterThan(partnerBefore);
    expect(bystander.state.elapsedMs).toBeGreaterThan(bystanderBefore);
    expect(w.encounter.elapsedMs).toBeGreaterThan(0);
  });

  it('leaves a one-player world with no per-body freeze at all', () => {
    const w = bareWorld();
    const c = cfg();
    const enemy = addGuard(w, { x: 1.2, y: 0 }, 'approach');
    w.players[0].facing = 0;

    step(w, c, { heavyPressed: true });
    for (let i = 0; i < 60 && w.hitstopMs === 0; i++) step(w, c);

    expect(w.hitstopMs).toBeGreaterThan(0);
    expect('hitstopMs' in w.players[0]).toBe(false);
    expect('hitstopMs' in enemy).toBe(false);
  });

  it('decays by engine time and then releases', () => {
    const w = bareWorld();
    const c = cfg();
    w.hitstopMs = TICK_MS * 2;

    step(w, c);
    expect(w.hitstopMs).toBeCloseTo(TICK_MS, 6);
    step(w, c);
    expect(w.hitstopMs).toBe(0);

    const before = w.players[0].state.elapsedMs;
    step(w, c);
    expect(w.players[0].state.elapsedMs).toBeGreaterThan(before);
  });
});

describe('one intent per protagonist', () => {
  const secondKing = (w: World, at: { x: number; y: number }): Player => {
    const king: Player = { ...structuredClone(w.players[0]), id: w.nextId++, pos: { ...at } };
    w.players.push(king);
    return king;
  };

  it('drives each king from its own intent', () => {
    const w = bareWorld();
    const c = cfg();
    const second = secondKing(w, { x: 6, y: 0 });
    const firstStart = w.players[0].pos.x;
    const secondStart = second.pos.x;

    for (let i = 0; i < 30; i++) {
      stepWorld(
        w,
        [intent({ move: { x: 1, y: 0 } }), intent({ move: { x: -1, y: 0 } })],
        c,
        noSlowMo(),
        emptyEncounter(),
      );
    }

    expect(w.players[0].pos.x).toBeGreaterThan(firstStart);
    expect(second.pos.x).toBeLessThan(secondStart);
  });

  it('treats a missing intent as neutral rather than as the first king\'s', () => {
    const w = bareWorld();
    const c = cfg();
    const second = secondKing(w, { x: 6, y: 0 });
    const secondStart = { ...second.pos };

    for (let i = 0; i < 30; i++) {
      stepWorld(w, [intent({ move: { x: 1, y: 0 } })], c, noSlowMo(), emptyEncounter());
    }

    expect(w.players[0].pos.x).toBeGreaterThan(0);
    expect(second.pos.x).toBeCloseTo(secondStart.x, 6);
    expect(second.pos.y).toBeCloseTo(secondStart.y, 6);
  });
});

describe('time scales', () => {
  it('applies the player and world scales the director resolved', () => {
    const c = cfg();
    const d = oneEnemy('guard', { x: 8, y: 0 });
    const slow = structuredClone(SLOWMO_PRESETS.static);
    const w = createWorld(d, c, 1);

    w.slowMo.pending = 'perfect_parry';
    stepWorld(w, [intent()], c, slow, d);
    for (let i = 0; i < 30; i++) stepWorld(w, [intent()], c, slow, d);

    expect(w.slowMo.active).toBe(true);
    const scales = w.slowMo.scales;
    expect(scales.world).toBeLessThan(1);

    const playerBefore = w.players[0].state.elapsedMs;
    const enemyBefore = w.enemies[0].state.elapsedMs;
    stepWorld(w, [intent()], c, slow, d);

    const playerAdvance = w.players[0].state.elapsedMs - playerBefore;
    const enemyAdvance = w.enemies[0].state.elapsedMs - enemyBefore;
    expect(playerAdvance).toBeGreaterThan(enemyAdvance);
    expect(enemyAdvance).toBeCloseTo(TICK_MS * scales.world, 6);
  });
});

describe('separation', () => {
  it('pushes overlapping bodies apart', () => {
    const w = bareWorld();
    const c = cfg();
    const e = addGuard(w, { x: 0.1, y: 0 }, 'approach');

    step(w, c);

    const gap = Math.hypot(e.pos.x - w.players[0].pos.x, e.pos.y - w.players[0].pos.y);
    expect(gap).toBeGreaterThan(0.1);
  });

  it('resolves an exact overlap deterministically instead of producing NaN', () => {
    const a = bareWorld();
    const b = bareWorld();
    const c = cfg();
    addGuard(a, { x: 0, y: 0 }, 'approach');
    addGuard(b, { x: 0, y: 0 }, 'approach');

    step(a, c);
    step(b, c);

    expect(Number.isFinite(a.players[0].pos.x)).toBe(true);
    expect(Number.isFinite(a.enemies[0].pos.x)).toBe(true);
    expect(hashWorld(a)).toBe(hashWorld(b));
  });

  it('moves the king less than the crowd shoving him', () => {
    const w = bareWorld();
    const c = cfg();
    addGuard(w, { x: 0.3, y: 0 }, 'approach');
    const playerStart = { ...w.players[0].pos };
    const enemyStart = { ...w.enemies[0].pos };

    step(w, c);

    const playerMoved = Math.hypot(
      w.players[0].pos.x - playerStart.x,
      w.players[0].pos.y - playerStart.y,
    );
    const enemyMoved = Math.hypot(w.enemies[0].pos.x - enemyStart.x, w.enemies[0].pos.y - enemyStart.y);
    expect(playerMoved).toBeLessThan(enemyMoved);
  });

  it('lets a step pass through an enemy instead of shoving it', () => {
    const w = bareWorld();
    const c = cfg();
    const e = addGuard(w, { x: 1.3, y: 0 }, 'approach');
    e.frozenMs = 10_000;
    const enemyStart = { ...e.pos };

    run(w, ticksFor(c.player.step.durationMs), intent({ stepPressed: true, move: { x: 1, y: 0 } }), {
      combat: c,
    });

    expect(w.players[0].pos.x).toBeGreaterThan(e.pos.x);
    expect(e.pos).toEqual(enemyStart);
  });

  it('separates again on the tick the step ends, so a step into a crowd does not stay inside it', () => {
    const w = bareWorld();
    const c = cfg();
    const e = addGuard(w, { x: 3.0, y: 0 }, 'approach');
    e.frozenMs = 10_000;
    const reach = c.player.radius + c.enemies.guard.radius;

    run(w, ticksFor(c.player.step.durationMs), intent({ stepPressed: true, move: { x: 1, y: 0 } }), {
      combat: c,
    });
    expect(Math.abs(e.pos.x - w.players[0].pos.x)).toBeLessThan(reach);

    run(w, 4, intent(), { combat: c });
    expect(Math.hypot(e.pos.x - w.players[0].pos.x, e.pos.y - w.players[0].pos.y)).toBeGreaterThanOrEqual(
      reach - 1e-9,
    );
  });

  it('keeps everyone inside the arena', () => {
    const c = cfg();
    const d = oneEnemy('guard', { x: 1, y: 0 }, { x: 0, y: 0 });
    const w = createWorld(d, c, 1);
    w.arena.halfExtents = { x: 3, y: 3 };

    run(w, 400, intent({ move: { x: 1, y: 1 } }), { combat: c, encounter: d });

    expect(Math.abs(w.players[0].pos.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(w.players[0].pos.y)).toBeLessThanOrEqual(3);
    for (const e of w.enemies) {
      expect(Math.abs(e.pos.x)).toBeLessThanOrEqual(3);
      expect(Math.abs(e.pos.y)).toBeLessThanOrEqual(3);
    }
  });
});

describe('hashWorld', () => {
  it('reacts to anything that must replay identically', () => {
    const base = bareWorld();
    const h = hashWorld(base);

    const moved = bareWorld();
    moved.players[0].pos.x += 0.01;
    expect(hashWorld(moved)).not.toBe(h);

    const drawn = bareWorld();
    drawn.rng.value = base.rng.value + 1;
    expect(hashWorld(drawn)).not.toBe(h);

    const hurt = bareWorld();
    hurt.players[0].hp -= 1;
    expect(hashWorld(hurt)).not.toBe(h);
  });

  it('ignores differences far below anything a player could observe', () => {
    const a = bareWorld();
    const b = bareWorld();
    b.players[0].pos.x += 1e-9;

    expect(hashWorld(a)).toBe(hashWorld(b));
  });
});
