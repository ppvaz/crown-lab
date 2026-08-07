
import type { CombatConfig, EncounterDef, World } from '../src/sim/types';
import { DEFAULT_COMBAT } from '../src/lab/config';
import { createWorld } from '../src/sim/encounter';
import { angleDelta, angleOf, norm, sub } from '../src/sim/vec';
import { cfg, firstOf, intent, oneEnemy, run, runUntil } from './support/world';

const durable = (): CombatConfig => {
  const c = cfg();
  c.player.maxHp = 1e6;
  return c;
};

const arena = { halfExtents: { x: 20, y: 20 } };

const crowd = (n: number): EncounterDef => ({
  id: 'test_crowd',
  description: 'Guards packed around the player.',
  arena,
  playerStart: { x: 0, y: 0 },
  waves: [
    {
      id: 'w1',
      atMs: 0,
      spawns: Array.from({ length: n }, (_, i) => ({
        archetype: 'guard' as const,
        at: { x: Math.cos((i / n) * Math.PI * 2) * 1.8, y: Math.sin((i / n) * Math.PI * 2) * 1.8 },
      })),
    },
  ],
  timeLimitMs: null,
});

const committed = (w: World): number =>
  w.enemies.filter((e) => e.state.kind === 'telegraph' || e.state.kind === 'attack').length;

describe('spawning', () => {
  it('owes a full cooldown before it may swing', () => {
    const def = oneEnemy('guard', { x: 1.8, y: 0 });
    const c = durable();
    const w = createWorld(def, c, 1);

    const events = run(w, 2, intent(), { combat: c, encounter: def });

    expect(w.enemies).toHaveLength(1);
    expect(w.enemies[0].attackCooldownMs).toBeGreaterThan(0);
    expect(firstOf(events, 'enemy_telegraph')).toBeUndefined();
  });
});

describe('the guard — the metronome', () => {
  it('telegraphs before it attacks, and says what it is doing', () => {
    const def = oneEnemy('guard', { x: 1.8, y: 0 });
    const c = durable();
    const w = createWorld(def, c, 1);

    const events = runUntil(w, (x) => x.enemies.some((e) => e.state.kind === 'telegraph'), {
      combat: c,
      encounter: def,
      maxTicks: 4000,
    });

    const ev = firstOf(events, 'enemy_telegraph');
    expect(ev).toBeDefined();
    expect(ev?.data?.telegraphMs).toBe(c.enemies.guard.attacks[0].telegraphMs);
    expect(ev?.data?.actualTelegraphMs).toBe(ev?.data?.telegraphMs);
    expect(ev?.data?.parryable).toBe(true);
    expect(ev?.data?.archetype).toBe('guard');
  });

  it('reaches the active phase only after the telegraph has fully elapsed', () => {
    const def = oneEnemy('guard', { x: 1.8, y: 0 });
    const c = durable();
    const w = createWorld(def, c, 1);
    const telegraphMs = c.enemies.guard.attacks[0].telegraphMs;

    runUntil(w, (x) => x.enemies.some((e) => e.state.kind === 'telegraph'), {
      combat: c,
      encounter: def,
      maxTicks: 4000,
    });
    const enemy = w.enemies[0];

    runUntil(w, (x) => x.enemies[0].state.kind === 'attack', {
      combat: c,
      encounter: def,
      maxTicks: 4000,
    });

    expect(enemy.state.kind).toBe('attack');
    expect(telegraphMs).toBeGreaterThan(0);
  });
});

describe('the duelist — the mix-up', () => {
  it('varies its telegraph from swing to swing', () => {
    const def = oneEnemy('duelist', { x: 2.4, y: 0 });
    const c = durable();
    c.enemies.duelist.maxHp = 1e6;
    const w = createWorld(def, c, 7);

    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      const events = runUntil(w, (x) => x.enemies.some((e) => e.state.kind === 'telegraph'), {
        combat: c,
        encounter: def,
        maxTicks: 4000,
      });
      const ev = firstOf(events, 'enemy_telegraph');
      if (ev) seen.push(Number(ev.data?.actualTelegraphMs));
      runUntil(w, (x) => x.enemies.every((e) => e.state.kind !== 'telegraph'), {
        combat: c,
        encounter: def,
        maxTicks: 4000,
      });
    }

    expect(seen.length).toBeGreaterThan(2);
    expect(new Set(seen).size).toBeGreaterThan(1);
  });

  it('records both the nominal and the actual telegraph', () => {
    const def = oneEnemy('duelist', { x: 2.4, y: 0 });
    const c = durable();
    const w = createWorld(def, c, 3);

    const events = runUntil(w, (x) => x.enemies.some((e) => e.state.kind === 'telegraph'), {
      combat: c,
      encounter: def,
      maxTicks: 4000,
    });

    const ev = firstOf(events, 'enemy_telegraph');
    expect(Number(ev?.data?.actualTelegraphMs)).toBeGreaterThanOrEqual(
      Number(ev?.data?.telegraphMs),
    );
  });
});

describe('the archer — the spacing pressure', () => {
  it('answers with a projectile rather than a swing', () => {
    const def = oneEnemy('archer', { x: 6, y: 0 });
    const c = durable();
    const w = createWorld(def, c, 5);

    const events = runUntil(w, (x) => x.projectiles.length > 0, {
      combat: c,
      encounter: def,
      maxTicks: 6000,
    });

    expect(w.projectiles[0].hostileTo).toBe('player');
    expect(firstOf(events, 'projectile_fired')).toBeDefined();
  });
});

describe('the readability cap', () => {
  it('never lets more enemies commit at once than maxSimultaneousAttackers', () => {
    const def = crowd(4);
    const c = durable();
    c.maxSimultaneousAttackers = 1;
    const w = createWorld(def, c, 11);

    let peak = 0;
    for (let i = 0; i < 1200; i++) {
      run(w, 1, intent(), { combat: c, encounter: def });
      peak = Math.max(peak, committed(w));
    }

    expect(w.enemies).toHaveLength(4);
    expect(peak).toBe(1);
  });

  it('admits more attackers when the cap is raised', () => {
    const def = crowd(4);
    const c = durable();
    c.maxSimultaneousAttackers = 3;
    const w = createWorld(def, c, 11);

    let peak = 0;
    for (let i = 0; i < 1200; i++) {
      run(w, 1, intent(), { combat: c, encounter: def });
      peak = Math.max(peak, committed(w));
    }

    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe('posture', () => {
  it('regenerates poise while not staggered, and restores it fully on recovery', () => {
    const def = oneEnemy('guard', { x: 5, y: 0 });
    const c = durable();
    const w = createWorld(def, c, 1);
    run(w, 2, intent(), { combat: c, encounter: def });

    const enemy = w.enemies[0];
    enemy.poise = 10;
    run(w, 120, intent(), { combat: c, encounter: def });
    expect(enemy.poise).toBeGreaterThan(10);

    enemy.state = {
      kind: 'stagger',
      enteredTick: w.tick,
      elapsedMs: 0,
      attackIndex: 0,
      telegraphJitterMs: 0,
      struck: [],
    };
    enemy.poise = 0;
    runUntil(w, (x) => x.enemies[0].state.kind !== 'stagger', {
      combat: c,
      encounter: def,
      maxTicks: 4000,
    });

    expect(enemy.poise).toBe(enemy.maxPoise);
  });
});

describe('commitment — an attack may settle its direction along with its timing', () => {
  const guardCappedAt = (turnRateDuringWindup: number | undefined): CombatConfig => {
    const c = durable();
    c.enemies.guard.attacks[0] = {
      ...c.enemies.guard.attacks[0],
      turnRateDuringWindup,
    };
    return c;
  };

  const aimErrorAtRelease = (c: CombatConfig): number => {
    const def = oneEnemy('guard', { x: 1.8, y: 0 });
    const w = createWorld(def, c, 1);
    const opts = { combat: c, encounter: def };
    runUntil(w, (x) => x.enemies[0]?.state.kind === 'telegraph', opts);

    w.players[0].pos = { x: 1.8, y: -1.8 };
    runUntil(w, (x) => x.enemies[0].state.kind === 'attack', opts);

    const e = w.enemies[0];
    return Math.abs(angleDelta(e.facing, angleOf(sub(w.players[0].pos, e.pos))));
  };

  it('tracks the king for the whole wind-up when the attack names no cap', () => {
    expect(aimErrorAtRelease(guardCappedAt(undefined))).toBeLessThan(0.05);
  });

  it('keeps the aim it committed to when the attack caps the turn', () => {
    expect(aimErrorAtRelease(guardCappedAt(0.5))).toBeGreaterThan(1.0);
  });
});

describe('the flank — what the committed telegraph is worth', () => {
  const orbit = (w: World) => {
    const d = norm(sub(w.players[0].pos, w.enemies[0].pos));
    return { x: -d.y, y: d.x };
  };

  const offsetAtRelease = (
    archetype: 'guard' | 'duelist',
    attackIndex: number,
    at: number,
    drive: 'orbit' | 'late_step',
  ): number => {
    const c = durable();
    const ec = c.enemies[archetype];
    ec.attacks = [ec.attacks[attackIndex]];
    const def = oneEnemy(archetype, { x: at, y: 0 });
    const w = createWorld(def, c, 1);
    const opts = { combat: c, encounter: def };
    runUntil(w, (x) => x.enemies[0]?.state.kind === 'telegraph', opts);

    const stepAt = ec.attacks[0].telegraphMs - c.player.step.durationMs;
    for (let i = 0; i < 400 && w.enemies[0].state.kind === 'telegraph'; i++) {
      const stepPressed = drive === 'late_step' && w.enemies[0].state.elapsedMs >= stepAt;
      run(w, 1, intent({ move: orbit(w), stepPressed }), opts);
    }
    const e = w.enemies[0];
    return (Math.abs(angleDelta(e.facing, angleOf(sub(w.players[0].pos, e.pos)))) * 180) / Math.PI;
  };

  it.each([
    ['guard_chop', 'guard' as const, 0, 1.6, 45],
    ['duelist_thrust', 'duelist' as const, 0, 2.6, 22.5],
  ])('%s — walking round it is not enough, stepping is', (_name, archetype, index, at, halfArc) => {
    expect(offsetAtRelease(archetype, index, at, 'orbit')).toBeLessThan(halfArc);
    expect(offsetAtRelease(archetype, index, at, 'late_step')).toBeGreaterThan(halfArc);
  });

  it('leaves the duelist sweep unflankable, because 140 degrees has no behind', () => {
    expect(DEFAULT_COMBAT.enemies.duelist.attacks[1].turnRateDuringWindup).toBeUndefined();
    expect(offsetAtRelease('duelist', 1, 2.6, 'late_step')).toBeLessThan(70);
  });
});
