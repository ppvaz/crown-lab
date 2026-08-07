
import { DEFAULT_COMBAT, SLOWMO_PRESETS } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import { createWorld } from '../src/sim/encounter';
import { spawnFallingProjectile, stepProjectiles } from '../src/sim/projectile';
import type { SimEvent, World } from '../src/sim/types';
import { NEUTRAL_INTENT, TICK_MS } from '../src/sim/types';
import { hashWorld, stepWorld } from '../src/sim/world';
import { bareWorld } from './support/world';

const combat = () => structuredClone(DEFAULT_COMBAT);
const encounter = ENCOUNTERS.projectile_rain_boss;

const makeWorld = () => {
  const cfg = combat();
  const world = createWorld(encounter, cfg, 47);
  stepWorld(world, [NEUTRAL_INTENT], cfg, SLOWMO_PRESETS.none, encounter);
  const boss = world.enemies[0];
  if (boss?.archetype !== 'rain_boss') {
    throw new Error('projectile_rain_boss did not spawn its mechanical subject');
  }
  return { world, boss, cfg };
};

const step = (world: World, cfg: ReturnType<typeof combat>): SimEvent[] => {
  stepWorld(world, [NEUTRAL_INTENT], cfg, SLOWMO_PRESETS.none, encounter);
  return [...world.events];
};

describe('the authored peripheral-attention phrase', () => {
  it('rotates cross, diagonal and ring against one focal strike without RNG choice', () => {
    const { world, cfg } = makeWorld();
    const ids: string[] = [];

    for (let i = 0; i < 1800 && ids.length < 6; i++) {
      for (const event of step(world, cfg)) {
        if (event.type === 'enemy_telegraph') ids.push(String(event.data?.attackId));
      }
    }

    expect(ids).toEqual([
      'rain_cross',
      'rain_focus',
      'rain_diagonal',
      'rain_focus',
      'rain_ring',
      'rain_focus',
    ]);
  });

  it('commits five visible cross targets around one sampled player position', () => {
    const { world, cfg } = makeWorld();
    world.players[0].pos = { x: 1, y: 0.5 };

    for (let i = 0; i < 300 && world.projectiles.length === 0; i++) step(world, cfg);

    expect(world.projectiles).toHaveLength(5);
    expect(world.projectiles.every((shot) => shot.kind === 'falling')).toBe(true);
    expect(world.projectiles.map((shot) => shot.pos)).toEqual([
      { x: 1, y: 0.5 },
      { x: -1.4, y: 0.5 },
      { x: 3.4, y: 0.5 },
      { x: 1, y: -1.9 },
      { x: 1, y: 2.9 },
    ]);
  });

  it('begins the focal read while all five committed impacts are still counting down', () => {
    const { world, cfg } = makeWorld();
    let focal: SimEvent | undefined;

    for (let i = 0; i < 500 && focal === undefined; i++) {
      focal = step(world, cfg).find(
        (event) => event.type === 'enemy_telegraph' && event.data?.attackId === 'rain_focus',
      );
    }

    expect(focal).toBeDefined();
    expect(world.projectiles).toHaveLength(5);
    expect(world.projectiles.every((shot) => shot.lifeMs > 0)).toBe(true);
    expect(Math.min(...world.projectiles.map((shot) => shot.lifeMs))).toBeGreaterThan(700);
  });

  it('leaves the sampled position safe inside the ring and closes the perimeter', () => {
    const cfg = combat();
    const ring = cfg.enemies.rain_boss.attacks.find((attack) => attack.id === 'rain_ring')?.rain;
    if (ring === undefined) throw new Error('rain_ring lost its authored field');
    const lethal = ring.impactRadius + cfg.player.radius;
    const offsets = ring.offsets;
    const gap = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
      Math.hypot(a.x - b.x, a.y - b.y);

    expect(offsets).toHaveLength(5);
    for (const offset of offsets) {
      expect(Math.hypot(offset.x, offset.y)).toBeGreaterThan(lethal + 0.5);
    }
    for (let i = 0; i < offsets.length; i++) {
      const neighbour = offsets[(i + 1) % offsets.length];
      expect(gap(offsets[i], neighbour)).toBeLessThan(2 * lethal + 0.15);
    }
  });

  it('holds a stationary player unharmed by the ring but not by the cross', () => {
    const cfg = combat();
    const fields = ['rain_ring', 'rain_cross'] as const;
    const damage = fields.map((id) => {
      const world = bareWorld(cfg);
      const rain = cfg.enemies.rain_boss.attacks.find((attack) => attack.id === id)?.rain;
      if (rain === undefined) throw new Error(`${id} lost its authored field`);
      world.players[0].pos = { x: 0, y: 0 };
      for (const offset of rain.offsets) {
        spawnFallingProjectile(world, offset, TICK_MS, rain.impactRadius, 18, 8);
      }
      stepProjectiles(world, cfg, TICK_MS);
      return cfg.player.maxHp - world.players[0].hp;
    });

    expect(damage[0]).toBe(0);
    expect(damage[1]).toBeGreaterThan(0);
  });

  it('compresses only the impact delay in phase two, leaving the shapes alone', () => {
    const cfg = combat();
    const rain = cfg.enemies.rain_boss;
    const pairs = [
      ['rain_cross', 'rain_cross_tight'],
      ['rain_diagonal', 'rain_diagonal_tight'],
      ['rain_ring', 'rain_ring_tight'],
    ] as const;
    const byId = (id: string) => rain.attacks.find((attack) => attack.id === id);

    expect(rain.attackPatternPhaseTwo?.map((index) => rain.attacks[index].id)).toEqual([
      'rain_cross_tight',
      'rain_focus',
      'rain_diagonal_tight',
      'rain_focus',
      'rain_ring_tight',
      'rain_focus',
    ]);
    for (const [slow, tight] of pairs) {
      const one = byId(slow)?.rain;
      const two = byId(tight)?.rain;
      expect(two?.offsets).toEqual(one?.offsets);
      expect(two?.impactRadius).toBe(one?.impactRadius);
      expect(byId(tight)?.damage).toBe(byId(slow)?.damage);
      expect(byId(tight)?.telegraphMs).toBe(byId(slow)?.telegraphMs);
      expect(two?.impactDelayMs).toBeLessThan(one?.impactDelayMs ?? 0);
    }
  });

  it('lands the compressed impacts after the focal read rather than during it', () => {
    const { world, boss, cfg } = makeWorld();
    boss.hp = boss.maxHp * (cfg.enemies.rain_boss.boss?.phaseTwoHpFraction ?? 0.5);
    for (let i = 0; i < 400 && boss.phase !== 2; i++) step(world, cfg);
    expect(boss.phase).toBe(2);

    let focal: SimEvent | undefined;
    for (let i = 0; i < 500 && focal === undefined; i++) {
      focal = step(world, cfg).find(
        (event) => event.type === 'enemy_telegraph' && event.data?.attackId === 'rain_focus',
      );
    }

    expect(focal).toBeDefined();
    expect(world.projectiles).toHaveLength(5);
    const remaining = Math.min(...world.projectiles.map((shot) => shot.lifeMs));
    const focus = cfg.enemies.rain_boss.attacks[1];
    expect(remaining).toBeGreaterThan(focus.telegraphMs);
    expect(remaining).toBeLessThan(focus.telegraphMs + focus.activeMs + 200);
  });

  it('replays to the same hash with the same seed and neutral intent stream', () => {
    const hashes = [1, 2].map(() => {
      const { world, cfg } = makeWorld();
      for (let i = 0; i < 500; i++) step(world, cfg);
      return hashWorld(world);
    });
    expect(hashes[0]).toBe(hashes[1]);
  });
});

describe('a committed falling impact', () => {
  it('ignores guard and parry because its answer is spatial', () => {
    const cfg = combat();
    const world = bareWorld(cfg);
    world.players[0].state = {
      kind: 'parry',
      enteredTick: world.tick,
      elapsedMs: cfg.player.parry.onsetMs + 10,
      attack: null,
      struck: [],
    };
    spawnFallingProjectile(world, { x: 0, y: 0 }, TICK_MS, 0.78, 18, 8);
    world.events.length = 0;

    stepProjectiles(world, cfg, TICK_MS);

    expect(world.players[0].hp).toBe(82);
    expect(world.events.find((event) => event.type === 'hit_received')?.data?.reason).toBe(
      'unparryable',
    );
    expect(world.events.some((event) => event.type === 'parry_success')).toBe(false);
    expect(world.events.some((event) => event.type === 'guard_success')).toBe(false);
  });

  it('misses after the player leaves the sampled target instead of homing', () => {
    const cfg = combat();
    const world = bareWorld(cfg);
    spawnFallingProjectile(world, { x: 0, y: 0 }, TICK_MS, 0.78, 18, 8);
    world.players[0].pos = { x: 2, y: 0 };
    world.events.length = 0;

    stepProjectiles(world, cfg, TICK_MS);

    expect(world.players[0].hp).toBe(100);
    expect(world.events.find((event) => event.type === 'projectile_impact')?.data?.outcome).toBe(
      'miss',
    );
  });
});
