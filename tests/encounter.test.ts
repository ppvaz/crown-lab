
import type { CombatConfig, EncounterDef } from '../src/sim/types';
import { createWorld } from '../src/sim/encounter';
import { cfg, countOf, firstOf, intent, run, ticksFor } from './support/world';
import { ENCOUNTERS } from '../src/lab/encounters';

const durable = (): CombatConfig => {
  const c = cfg();
  c.player.maxHp = 1e6;
  return c;
};

const arena = { halfExtents: { x: 12, y: 9 } };

const def = (over: Partial<EncounterDef> = {}): EncounterDef => ({
  id: 'test_seq',
  description: 'scheduling fixture',
  arena,
  playerStart: { x: 0, y: 4 },
  waves: [],
  timeLimitMs: null,
  ...over,
});

const alive = (w: { enemies: Array<{ state: { kind: string } }> }): number =>
  w.enemies.filter((e) => e.state.kind !== 'dead').length;

describe('createWorld', () => {
  it('places the king facing the middle of the room', () => {
    const d = ENCOUNTERS.court_45s;
    const w = createWorld(d, durable(), 7);

    expect(w.players[0].pos).toEqual(d.playerStart);
    expect(w.players[0].facing).toBeCloseTo(
      Math.atan2(-d.playerStart.y, -d.playerStart.x),
      6,
    );
    expect(w.tick).toBe(0);
    expect(w.outcome).toBe('running');
  });

  it('announces the run with everything needed to reproduce it', () => {
    const w = createWorld(ENCOUNTERS.kernel_guard, durable(), 4242);
    const ev = firstOf(w.events, 'run_started');

    expect(ev?.data?.seed).toBe(4242);
    expect(ev?.data?.encounter).toBe('kernel_guard');
    expect(ev?.data?.combat).toBe(durable().id);
  });

  it('builds an independent world every time, so restart cannot leak', () => {
    const d = ENCOUNTERS.kernel_guard;
    const a = createWorld(d, durable(), 1);
    a.players[0].hp = 3;
    a.players[0].pos.x = 99;

    const b = createWorld(d, durable(), 1);

    expect(b.players[0].hp).toBe(b.players[0].maxHp);
    expect(b.players[0].pos.x).toBe(d.playerStart.x);
  });
});

describe('wave scheduling', () => {
  it('spawns an absolute-time wave even while the previous one is alive', () => {
    const c = durable();
    const d = def({
      waves: [
        { id: 'w1', atMs: 0, spawns: [{ archetype: 'guard', at: { x: 0, y: -3 } }] },
        { id: 'w2', atMs: 600, spawns: [{ archetype: 'archer', at: { x: 6, y: -3 } }] },
      ],
    });
    const w = createWorld(d, c, 1);

    run(w, 2, intent(), { combat: c, encounter: d });
    expect(alive(w)).toBe(1);

    run(w, ticksFor(700), intent(), { combat: c, encounter: d });

    expect(alive(w)).toBe(2);
    expect(w.encounter.spawnedWaves).toEqual(['w1', 'w2']);
  });

  it('holds a null-timed wave until the arena is clear', () => {
    const c = durable();
    const d = def({
      waves: [
        { id: 'w1', atMs: 0, spawns: [{ archetype: 'guard', at: { x: 0, y: -3 } }] },
        { id: 'w2', atMs: null, spawns: [{ archetype: 'duelist', at: { x: 4, y: -3 } }] },
      ],
    });
    const w = createWorld(d, c, 1);

    run(w, ticksFor(3000), intent(), { combat: c, encounter: d });
    expect(w.encounter.spawnedWaves).toEqual(['w1']);

    for (const e of w.enemies) e.state = { ...e.state, kind: 'dead' };
    run(w, 2, intent(), { combat: c, encounter: d });

    expect(w.encounter.spawnedWaves).toEqual(['w1', 'w2']);
  });

  it('does not chain a null-timed wave straight into the next one', () => {
    const c = durable();
    const d = def({
      waves: [
        { id: 'w1', atMs: null, spawns: [{ archetype: 'guard', at: { x: 0, y: -3 } }] },
        { id: 'w2', atMs: null, spawns: [{ archetype: 'guard', at: { x: 2, y: -3 } }] },
      ],
    });
    const w = createWorld(d, c, 1);

    run(w, 4, intent(), { combat: c, encounter: d });

    expect(w.encounter.spawnedWaves).toEqual(['w1']);
  });

  it('records the wave in telemetry as it lands', () => {
    const c = durable();
    const d = def({
      waves: [
        {
          id: 'opening',
          atMs: 0,
          spawns: [
            { archetype: 'guard', at: { x: -2, y: -3 } },
            { archetype: 'guard', at: { x: 2, y: -3 } },
          ],
        },
      ],
    });
    const w = createWorld(d, c, 1);

    const events = run(w, 2, intent(), { combat: c, encounter: d });
    const ev = firstOf(events, 'wave_spawned');

    expect(ev?.data?.wave).toBe('opening');
    expect(ev?.data?.count).toBe(2);
  });
});

describe('the verdict', () => {
  it('clears once every wave is out and nothing is standing', () => {
    const c = durable();
    const d = def({
      waves: [{ id: 'w1', atMs: 0, spawns: [{ archetype: 'guard', at: { x: 0, y: -3 } }] }],
    });
    const w = createWorld(d, c, 1);
    run(w, 2, intent(), { combat: c, encounter: d });

    for (const e of w.enemies) e.state = { ...e.state, kind: 'dead' };
    const events = run(w, 2, intent(), { combat: c, encounter: d });

    expect(w.outcome).toBe('cleared');
    expect(countOf(events, 'encounter_cleared')).toBe(1);
    expect(countOf(events, 'run_ended')).toBe(1);
  });

  it('ends the run when the king falls', () => {
    const c = cfg();
    const d = def({
      waves: [{ id: 'w1', atMs: 0, spawns: [{ archetype: 'guard', at: { x: 0, y: -3 } }] }],
    });
    const w = createWorld(d, c, 1);
    run(w, 2, intent(), { combat: c, encounter: d });

    w.players[0].hp = 0;
    const events = run(w, 3, intent(), { combat: c, encounter: d });

    expect(w.outcome).toBe('dead');
    expect(countOf(events, 'player_died')).toBe(1);
  });

  it('times out rather than stalling forever', () => {
    const c = durable();
    const d = def({
      timeLimitMs: 500,
      waves: [{ id: 'w1', atMs: 0, spawns: [{ archetype: 'guard', at: { x: 0, y: -6 } }] }],
    });
    const w = createWorld(d, c, 1);

    run(w, ticksFor(600), intent(), { combat: c, encounter: d });

    expect(w.outcome).toBe('timeout');
  });

  it('reports the ending exactly once and then stops', () => {
    const c = durable();
    const d = def({ waves: [] });
    const w = createWorld(d, c, 1);

    const events = run(w, 200, intent(), { combat: c, encounter: d });

    expect(w.outcome).toBe('cleared');
    expect(countOf(events, 'run_ended')).toBe(1);
  });

  it('freezes the encounter clock once the run is over', () => {
    const c = durable();
    const d = def({ waves: [] });
    const w = createWorld(d, c, 1);

    run(w, 5, intent(), { combat: c, encounter: d });
    const stopped = w.encounter.elapsedMs;
    run(w, 60, intent(), { combat: c, encounter: d });

    expect(w.encounter.elapsedMs).toBe(stopped);
  });
});

describe('a room hazard', () => {
  const bookish = (_over: Partial<NonNullable<CombatConfig['enemies']['guard']['hazard']>> = {}) =>
    def({
      waves: [{ id: 'occupant', atMs: 0, spawns: [{ archetype: 'guard', at: { x: 10, y: 8 } }] }],
      timeLimitMs: null,
    });

  const harmless = (
    over: Partial<NonNullable<CombatConfig['enemies']['guard']['hazard']>> = {},
  ): CombatConfig => {
    const c = durable();
    for (const attack of c.enemies.guard.attacks) attack.damage = 0;
    c.enemies.guard.hazard = { kind: 'books' as const, count: 3, speed: 4, damage: 8, ...over };
    return c;
  };

  const books = (w: { projectiles: Array<{ hazard?: boolean }> }): number =>
    w.projectiles.filter((shot) => shot.hazard === true).length;

  it('fills the room to its declared population and holds it there', () => {
    const c = harmless();
    const d = bookish();
    const w = createWorld(d, c, 1);

    run(w, 1, intent(), { combat: c, encounter: d });
    expect(books(w)).toBe(3);

    run(w, ticksFor(6000), intent(), { combat: c, encounter: d });
    expect(books(w)).toBe(3);
    expect(w.encounter.hazardsSpawned).toBeGreaterThan(3);
  });

  it('releases them inside the room, moving, and credited to nobody', () => {
    const c = harmless();
    const d = bookish();
    const w = createWorld(d, c, 1);

    run(w, 1, intent(), { combat: c, encounter: d });

    for (const shot of w.projectiles) {
      expect(Math.abs(shot.pos.x)).toBeLessThanOrEqual(arena.halfExtents.x);
      expect(Math.abs(shot.pos.y)).toBeLessThanOrEqual(arena.halfExtents.y);
      expect(Math.hypot(shot.vel.x, shot.vel.y)).toBeCloseTo(4);
      expect(shot.ownerId).toBeLessThan(0);
      expect(shot.hostileTo).toBe('player');
    }
  });

  it('scatters headings without drawing a single random number', () => {
    const c = harmless({ count: 8 });
    const d = bookish();
    const before = createWorld(d, c, 1);
    const rngBefore = before.rng.value;
    const dropBefore = before.dropRng.value;

    run(before, 1, intent(), { combat: c, encounter: d });

    const headings = before.projectiles.map((shot) =>
      Math.round(Math.atan2(shot.vel.y, shot.vel.x) * 1000),
    );
    expect(new Set(headings).size).toBe(8);
    expect(before.rng.value).toBe(rngBefore);
    expect(before.dropRng.value).toBe(dropBefore);
  });

  it('hurts the king, under its own attack id', () => {
    const c = harmless({ count: 1, speed: 6 });
    c.player.maxHp = 100;
    const d = bookish();
    const w = createWorld(d, c, 1);

    run(w, 1, intent(), { combat: c, encounter: d });
    const book = w.projectiles.find((shot) => shot.hazard === true);
    expect(book).toBeDefined();
    const heading = Math.atan2(book!.vel.y, book!.vel.x);
    w.players[0].pos = {
      x: book!.pos.x + Math.cos(heading) * 2,
      y: book!.pos.y + Math.sin(heading) * 2,
    };

    const events = run(w, ticksFor(1000), intent(), { combat: c, encounter: d });
    const struck = events.filter(
      (event) => event.type === 'hit_received' && event.data?.attackId === 'hazard_object',
    );

    expect(struck.length).toBeGreaterThan(0);
    expect(struck[0].data?.damage).toBe(8);
    expect(events.some((event) => event.data?.attackId === 'arrow')).toBe(false);
    expect(w.players[0].hp).toBeLessThan(100);
  });

  it('gets busier once the body that throws it reaches phase two, and only then', () => {
    const c = harmless({ count: 2, phaseTwoCount: 5 });
    const d = bookish();
    const w = createWorld(d, c, 1);

    run(w, 1, intent(), { combat: c, encounter: d });
    expect(books(w)).toBe(2);


    const thrower = w.enemies.find((enemy) => enemy.archetype === 'guard');
    expect(thrower).toBeDefined();
    thrower!.phase = 2;

    run(w, 1, intent(), { combat: c, encounter: d });
    expect(books(w)).toBe(5);
  });

  it('leaves a room with no hazard entirely empty', () => {
    const c = harmless();
    const d = def({ waves: [] });
    const w = createWorld(d, c, 1);

    run(w, ticksFor(3000), intent(), { combat: c, encounter: d });

    expect(w.projectiles).toHaveLength(0);
    expect(w.encounter.hazardsSpawned).toBe(0);
  });
});

describe('a paced room with a boss in it', () => {
  const pacedBoss = () =>
    def({
      waves: [
        { id: 'boss', atMs: 0, spawns: [{ archetype: 'first_blade', at: { x: 4, y: 0 } }] },
        { id: 'after', atMs: 400, spawns: [{ archetype: 'guard', at: { x: -4, y: 0 } }] },
      ],
      timeLimitMs: null,
    });

  it('holds the next wave while the boss is standing', () => {
    const c = durable();
    const d = pacedBoss();
    const w = createWorld(d, c, 1);

    run(w, ticksFor(3000), intent(), { combat: c, encounter: d });

    expect(w.encounter.elapsedMs).toBeGreaterThan(400);
    expect(w.encounter.spawnedWaves).toEqual(['boss']);
    expect(w.encounter.waveClockMs).toBeLessThan(w.encounter.elapsedMs);
  });

  it('releases it once he is down, one wave rather than a backlog', () => {
    const c = durable();
    const d = pacedBoss();
    const w = createWorld(d, c, 1);

    run(w, ticksFor(3000), intent(), { combat: c, encounter: d });
    for (const enemy of w.enemies) {
      enemy.hp = 0;
      enemy.state = { ...enemy.state, kind: 'dead' };
    }
    run(w, ticksFor(1200), intent(), { combat: c, encounter: d });


    expect(w.encounter.spawnedWaves).toEqual(['boss', 'after']);
  });
});
