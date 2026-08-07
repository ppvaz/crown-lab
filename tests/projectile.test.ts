
import type { CombatConfig, World } from '../src/sim/types';
import { PLAYER_ID } from '../src/sim/types';
import { spawnProjectile, stepProjectiles } from '../src/sim/projectile';
import { bareWorld, cfg, countOf, firstOf, ticksFor } from './support/world';

const TICK = 1000 / 120;

const arrowAt = (w: World, c: CombatConfig, from = { x: 3, y: 0 }, dir = { x: -1, y: 0 }) =>
  spawnProjectile(w, c, from, dir, 10, 12, 1);

const parrying = (w: World, elapsedMs: number): void => {
  w.players[0].state = {
    kind: 'parry',
    enteredTick: w.tick,
    elapsedMs,
    attack: null,
    struck: [],
  };
};

const advance = (w: World, c: CombatConfig, ms: number): void => {
  for (let i = 0; i < ticksFor(ms); i++) stepProjectiles(w, c, TICK);
};

describe('flight', () => {
  it('announces itself when fired, with enough payload to attribute the shot', () => {
    const w = bareWorld();
    const c = cfg();
    const shot = arrowAt(w, c);

    const ev = firstOf(w.events, 'projectile_fired');
    expect(ev?.actor).toBe(1);
    expect(ev?.target).toBe(PLAYER_ID);
    expect(ev?.data?.projectile).toBe(shot.id);
    expect(shot.ownerId).toBe(1);
    expect(shot.hostileTo).toBe('player');
    expect(shot.reflected).toBe(false);
  });

  it('travels at the speed it was given', () => {
    const w = bareWorld();
    const c = cfg();
    const shot = arrowAt(w, c, { x: 6, y: 0 });

    stepProjectiles(w, c, TICK);

    expect(shot.pos.x).toBeCloseTo(6 - 10 * (TICK / 1000), 6);
  });

  it('despawns when it leaves the arena instead of orbiting forever', () => {
    const w = bareWorld();
    const c = cfg();
    arrowAt(w, c, { x: 0, y: 0 }, { x: 0, y: 1 });

    advance(w, c, 4000);

    expect(w.projectiles).toHaveLength(0);
  });

  it('despawns when its lifetime expires', () => {
    const w = bareWorld();
    const c = cfg();
    w.arena.halfExtents = { x: 500, y: 500 };
    const shot = arrowAt(w, c, { x: 0, y: 0 }, { x: 0, y: 1 });
    shot.lifeMs = 100;

    advance(w, c, 200);

    expect(w.projectiles).toHaveLength(0);
  });
});

describe('impact on the player', () => {
  it('damages an unguarded king and is consumed', () => {
    const w = bareWorld();
    const c = cfg();
    arrowAt(w, c, { x: 0.3, y: 0 });

    stepProjectiles(w, c, TICK);

    expect(w.players[0].hp).toBe(w.players[0].maxHp - 12);
    expect(w.projectiles).toHaveLength(0);
    expect(firstOf(w.events, 'hit_received')?.data?.attackId).toBe('arrow');
  });

  it('is consumed by an i-frame rather than striking again next tick', () => {
    const w = bareWorld();
    const c = cfg();
    w.players[0].iframeMs = 100;
    arrowAt(w, c, { x: 0.3, y: 0 });

    stepProjectiles(w, c, TICK);

    expect(w.players[0].hp).toBe(w.players[0].maxHp);
    expect(w.projectiles).toHaveLength(0);
  });
});

describe('reflection', () => {
  it('turns a perfectly parried arrow against the enemies', () => {
    const w = bareWorld();
    const c = cfg();
    w.players[0].facing = 0;
    parrying(w, c.player.parry.onsetMs + 10);
    const shot = arrowAt(w, c, { x: 0.3, y: 0 });

    stepProjectiles(w, c, TICK);

    expect(w.players[0].hp).toBe(w.players[0].maxHp);
    expect(w.projectiles).toHaveLength(1);
    expect(shot.hostileTo).toBe('enemy');
    expect(shot.reflected).toBe(true);
    expect(firstOf(w.events, 'projectile_reflected')?.data?.projectile).toBe(shot.id);
  });

  it('returns a counter rather than the arrow, and says so', () => {
    const w = bareWorld();
    const c = cfg();
    w.players[0].facing = 0;
    parrying(w, c.player.parry.onsetMs + 10);
    const shot = arrowAt(w, c, { x: 0.3, y: 0 });
    const back = c.player.parry.reflect;

    stepProjectiles(w, c, TICK);

    expect(shot.damage).toBe(12 * back.damageScale);
    expect(Math.hypot(shot.vel.x, shot.vel.y)).toBeCloseTo(10 * back.speedScale, 6);

    const ev = firstOf(w.events, 'projectile_reflected');
    expect(ev?.data?.damage).toBe(12 * back.damageScale);
    expect(ev?.data?.speed).toBeCloseTo(10 * back.speedScale, 6);
    expect(ev?.data?.poiseDamage).toBe(back.poiseDamage);
  });

  it('sends it along the king\'s facing, not back down its own path', () => {
    const w = bareWorld();
    const c = cfg();
    w.players[0].facing = Math.PI / 2;
    parrying(w, c.player.parry.onsetMs + 10);
    const shot = arrowAt(w, c, { x: 0.3, y: 0 });
    const speedBefore = Math.hypot(shot.vel.x, shot.vel.y);

    stepProjectiles(w, c, TICK);

    expect(shot.vel.x).toBeCloseTo(0, 6);
    expect(shot.vel.y).toBeCloseTo(speedBefore * c.player.parry.reflect.speedScale, 6);
  });

  it('is not reflected by a merely-held guard', () => {
    const w = bareWorld();
    const c = cfg();
    w.players[0].state = {
      kind: 'guard',
      enteredTick: w.tick,
      elapsedMs: 0,
      attack: null,
      struck: [],
    };
    arrowAt(w, c, { x: 0.3, y: 0 });

    stepProjectiles(w, c, TICK);

    expect(w.projectiles).toHaveLength(0);
    expect(firstOf(w.events, 'guard_success')).toBeDefined();
  });

  it('clears the player before turning around', () => {
    const w = bareWorld();
    const c = cfg();
    w.players[0].facing = 0;
    parrying(w, c.player.parry.onsetMs + 10);
    const shot = arrowAt(w, c, { x: 0.3, y: 0 });

    stepProjectiles(w, c, TICK);

    const d = Math.hypot(shot.pos.x - w.players[0].pos.x, shot.pos.y - w.players[0].pos.y);
    expect(d).toBeGreaterThan(c.player.radius + c.projectileRadius);
  });
});

const archerAt = (w: World, hp = 50, poise = 45): void => {
  w.enemies.push({
    id: 5,
    archetype: 'archer',
    pos: { x: 1, y: 0 },
    vel: { x: 0, y: 0 },
    facing: Math.PI,
    hp,
    maxHp: 50,
    poise,
    maxPoise: 45,
    state: {
      kind: 'approach',
      enteredTick: 0,
      elapsedMs: 0,
      attackIndex: 0,
      telegraphJitterMs: 0,
      struck: [],
    },
    attackCooldownMs: 0,
  });
};

describe('a reflected arrow against the archer', () => {
  it('damages an enemy and is consumed', () => {
    const w = bareWorld();
    const c = cfg();
    archerAt(w);
    const shot = arrowAt(w, c, { x: 0.9, y: 0 }, { x: 1, y: 0 });
    shot.hostileTo = 'enemy';
    shot.reflected = true;

    stepProjectiles(w, c, TICK);

    expect(w.enemies[0].hp).toBe(50 - 12);
    expect(w.projectiles).toHaveLength(0);
    const ev = firstOf(w.events, 'hit_landed');
    expect(ev?.actor).toBe(PLAYER_ID);
    expect(ev?.data?.attack).toBe('reflected_arrow');
  });

  it('breaks the posture of what it strikes', () => {
    const w = bareWorld();
    const c = cfg();
    archerAt(w);
    const shot = arrowAt(w, c, { x: 0.9, y: 0 }, { x: 1, y: 0 });
    shot.hostileTo = 'enemy';
    shot.reflected = true;

    stepProjectiles(w, c, TICK);

    expect(firstOf(w.events, 'hit_landed')?.data?.poiseDamage).toBe(c.player.parry.reflect.poiseDamage);
    expect(w.enemies[0].state.kind).toBe('stagger');
    expect(countOf(w.events, 'enemy_staggered')).toBe(1);
  });

  it('leaves posture alone when the shot is a turncoat\'s rather than the king\'s', () => {
    const w = bareWorld();
    const c = cfg();
    archerAt(w);
    const shot = arrowAt(w, c, { x: 0.9, y: 0 }, { x: 1, y: 0 });
    shot.hostileTo = 'enemy';
    shot.turncoat = true;

    stepProjectiles(w, c, TICK);

    expect(w.enemies[0].poise).toBe(45);
    expect(w.enemies[0].state.kind).not.toBe('stagger');
    expect(firstOf(w.events, 'friendly_fire')?.data?.poiseDamage).toBe(0);
  });

  it('kills, and says what killed', () => {
    const w = bareWorld();
    const c = cfg();
    archerAt(w, 5);
    const shot = arrowAt(w, c, { x: 0.9, y: 0 }, { x: 1, y: 0 });
    shot.hostileTo = 'enemy';

    stepProjectiles(w, c, TICK);

    expect(w.enemies[0].state.kind).toBe('dead');
    expect(countOf(w.events, 'enemy_died')).toBe(1);
    expect(firstOf(w.events, 'enemy_died')?.data?.by).toBe('reflected_arrow');
  });
});
