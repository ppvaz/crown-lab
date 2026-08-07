
import { DEFAULT_COMBAT } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import { resolveEnemyAttack, resolvePlayerAttack } from '../src/sim/combat';
import { createWorld } from '../src/sim/encounter';
import { stepEnemy } from '../src/sim/enemy';
import type { Enemy, World } from '../src/sim/types';
import { TICK_MS } from '../src/sim/types';
import { stepWorld } from '../src/sim/world';
import { intent, noSlowMo } from './support/world';

const makeFirstBladeWorld = (): { world: World; firstBlade: Enemy } => {
  const combat = structuredClone(DEFAULT_COMBAT);
  const def = ENCOUNTERS.first_blade;
  const world = createWorld(def, combat, 77);

  stepWorld(world, [intent()], combat, noSlowMo(), def);
  const firstBlade = world.enemies[0];
  if (firstBlade?.archetype !== 'first_blade') {
    throw new Error('first_blade did not spawn The First Blade');
  }
  return { world, firstBlade };
};

const armStrike = (world: World, firstBlade: Enemy, attackIndex: number): void => {
  world.players[0].pos = { x: 0, y: 0 };
  world.players[0].facing = 0;
  world.players[0].state = {
    kind: 'parry',
    enteredTick: world.tick,
    elapsedMs: 100,
    attack: null,
    struck: [],
  };
  firstBlade.pos = { x: 2, y: 0 };
  firstBlade.facing = Math.PI;
  firstBlade.state = {
    kind: 'attack',
    enteredTick: world.tick,
    elapsedMs: 1,
    attackIndex,
    telegraphJitterMs: 0,
    struck: [],
  };
};

describe('the authored entrance', () => {
  it('falls, remains invulnerable through the roar, then emits the fight-start fact', () => {
    const combat = structuredClone(DEFAULT_COMBAT);
    const def = ENCOUNTERS.first_blade;
    const world = createWorld(def, combat, 17);

    stepWorld(world, [intent()], combat, noSlowMo(), def);
    const firstBlade = world.enemies[0];
    if (firstBlade === undefined) throw new Error('The First Blade did not spawn');
    expect(firstBlade.state.kind).toBe('entrance_fall');

    world.players[0].pos = { ...firstBlade.pos };
    world.players[0].state = {
      kind: 'active',
      enteredTick: world.tick,
      elapsedMs: 1,
      attack: 'heavy',
      struck: [],
    };
    const hpBefore = firstBlade.hp;
    resolvePlayerAttack(world, world.players[0], combat);
    expect(firstBlade.hp).toBe(hpBefore);

    let landed = false;
    let roared = false;
    let started = false;
    let telegraphedBeforeStart = false;
    for (let i = 0; i < 500 && !started; i++) {
      stepWorld(world, [intent()], combat, noSlowMo(), def);
      for (const event of world.events) {
        if (event.type === 'boss_intro_landed') landed = true;
        if (event.type === 'boss_intro_roar_started') roared = true;
        if (event.type === 'enemy_telegraph' && !started) telegraphedBeforeStart = true;
        if (event.type === 'boss_fight_started') started = true;
      }
    }

    expect(landed).toBe(true);
    expect(roared).toBe(true);
    expect(started).toBe(true);
    expect(telegraphedBeforeStart).toBe(false);
    expect(firstBlade.state.kind).toBe('approach');
    expect(firstBlade.attackCooldownMs).toBe(combat.enemies.first_blade.attackCooldownMs);
  });
});

describe('the authored three-parry phrase', () => {
  it('advances after each correct parry and opens recovery only after the third', () => {
    const combat = structuredClone(DEFAULT_COMBAT);
    const { world, firstBlade } = makeFirstBladeWorld();
    firstBlade.sequenceStep = 0;
    firstBlade.sequenceAngle = 0;

    armStrike(world, firstBlade, 0);
    resolveEnemyAttack(world, firstBlade, world.players[0], combat);
    expect(firstBlade.state.kind).toBe('sequence_reposition');
    expect(firstBlade.sequenceStep).toBe(1);
    expect(world.players[0].parryStreak).toBe(1);

    armStrike(world, firstBlade, 1);
    resolveEnemyAttack(world, firstBlade, world.players[0], combat);
    expect(firstBlade.state.kind).toBe('sequence_reposition');
    expect(firstBlade.sequenceStep).toBe(2);
    expect(world.players[0].parryStreak).toBe(2);

    armStrike(world, firstBlade, 2);
    resolveEnemyAttack(world, firstBlade, world.players[0], combat);
    expect(firstBlade.state.kind).toBe('recovery');
    expect(firstBlade.sequenceStep).toBe(-1);
    expect(world.players[0].parryStreak).toBe(3);
    expect(firstBlade.poise).toBeGreaterThan(0);
  });

  it('moves the next two strikes around the player by authored 120-degree steps', () => {
    const combat = structuredClone(DEFAULT_COMBAT);
    const def = ENCOUNTERS.first_blade;
    const world = createWorld(def, combat, 77);
    const angles: number[] = [];
    const attacks: string[] = [];

    for (let tick = 0; tick < 1_500 && attacks.length < 3; tick++) {
      stepWorld(world, [intent()], combat, noSlowMo(), def);
      for (const event of world.events) {
        if (event.type === 'enemy_telegraph' && event.data?.archetype === 'first_blade') {
          attacks.push(String(event.data.attackId));
        }
        if (event.type === 'enemy_sequence_step') angles.push(Number(event.data?.angle));
      }
    }

    expect(attacks.slice(0, 3)).toEqual([
      'first_blade_sequence_open',
      'first_blade_sequence_turn',
      'first_blade_sequence_close',
    ]);
    expect(angles).toHaveLength(2);
    expect(angles[1] - angles[0]).toBeCloseTo((Math.PI * 2) / 3, 5);
    expect(world.tick * TICK_MS).toBeGreaterThan(0);
  });
});

describe('phase two — edge run into the longer glide phrase', () => {
  it('locks damage during a second roar, then assumes phase two at its end', () => {
    const combat = structuredClone(DEFAULT_COMBAT);
    const { world, firstBlade } = makeFirstBladeWorld();
    firstBlade.state = {
      kind: 'approach',
      enteredTick: world.tick,
      elapsedMs: 0,
      attackIndex: 0,
      telegraphJitterMs: 0,
      struck: [],
    };
    firstBlade.hp = firstBlade.maxHp * 0.5;

    stepEnemy(world, firstBlade, combat, TICK_MS);
    expect(firstBlade.state.kind).toBe('phase_roar');
    expect(firstBlade.phase).toBe(1);

    world.players[0].pos = { ...firstBlade.pos };
    world.players[0].state = {
      kind: 'active',
      enteredTick: world.tick,
      elapsedMs: 1,
      attack: 'heavy',
      struck: [],
    };
    const hpDuringRoar = firstBlade.hp;
    resolvePlayerAttack(world, world.players[0], combat);
    expect(firstBlade.hp).toBe(hpDuringRoar);

    for (let i = 0; i < 200 && firstBlade.state.kind === 'phase_roar'; i++) {
      stepEnemy(world, firstBlade, combat, TICK_MS);
    }
    expect(firstBlade.phase).toBe(2);
    expect(firstBlade.state.kind).toBe('edge_reposition');
    expect(world.events.some((event) => event.type === 'enemy_phase_changed')).toBe(true);
  });

  it('runs the edge, then crosses wall-to-wall through five committed player positions', () => {
    const combat = structuredClone(DEFAULT_COMBAT);
    combat.player.maxHp = 10_000;
    const def = ENCOUNTERS.first_blade;
    const world = createWorld(def, combat, 91);
    const attacks: string[] = [];
    const crossings: Array<{
      from: { x: number; y: number };
      through: { x: number; y: number };
      to: { x: number; y: number };
      landed: { x: number; y: number };
    }> = [];
    let phaseChanged = false;
    let touchedEdge = false;
    let active:
      | {
          from: { x: number; y: number };
          through: { x: number; y: number };
          to: { x: number; y: number };
        }
      | undefined;

    for (let tick = 0; tick < 4_000 && crossings.length < 5; tick++) {
      const beforeKind = world.enemies[0]?.state.kind;
      stepWorld(world, [intent()], combat, noSlowMo(), def);
      const firstBlade = world.enemies[0];
      if (firstBlade !== undefined && tick === 1) firstBlade.hp = firstBlade.maxHp * 0.45;
      if (firstBlade?.state.kind === 'edge_reposition') {
        const h = world.arena.halfExtents;
        touchedEdge ||= Math.abs(firstBlade.pos.x) >= h.x - 1 || Math.abs(firstBlade.pos.y) >= h.y - 1;
      }
      if (
        firstBlade?.state.kind === 'attack' &&
        beforeKind !== 'attack' &&
        firstBlade.glideTarget !== undefined
      ) {
        active = {
          from: { ...firstBlade.pos },
          through: { ...world.players[0].pos },
          to: { ...firstBlade.glideTarget },
        };
      } else if (firstBlade !== undefined && beforeKind === 'attack' && firstBlade.state.kind !== 'attack' && active) {
        crossings.push({ ...active, landed: { ...firstBlade.pos } });
        active = undefined;
      }
      for (const event of world.events) {
        if (event.type === 'enemy_phase_changed') phaseChanged = true;
        if (event.type === 'enemy_telegraph' && event.data?.archetype === 'first_blade') {
          attacks.push(String(event.data.attackId));
        }
      }
    }

    expect(phaseChanged).toBe(true);
    expect(touchedEdge).toBe(true);
    expect(crossings).toHaveLength(5);
    expect(attacks.slice(0, 5)).toEqual([
      'first_blade_glide_open',
      'first_blade_glide_chain',
      'first_blade_glide_chain',
      'first_blade_glide_chain',
      'first_blade_glide_close',
    ]);
    for (const crossing of crossings) {
      const dx = crossing.to.x - crossing.from.x;
      const dy = crossing.to.y - crossing.from.y;
      const lengthSq = dx * dx + dy * dy;
      const throughX = crossing.through.x - crossing.from.x;
      const throughY = crossing.through.y - crossing.from.y;
      const t = (throughX * dx + throughY * dy) / lengthSq;
      const nearest = {
        x: crossing.from.x + dx * t,
        y: crossing.from.y + dy * t,
      };
      const pathError = Math.hypot(nearest.x - crossing.through.x, nearest.y - crossing.through.y);

      expect(t, JSON.stringify(crossing)).toBeGreaterThan(0);
      expect(t).toBeLessThan(1);
      expect(pathError).toBeLessThan(0.02);
      expect(
        Math.hypot(crossing.landed.x - crossing.to.x, crossing.landed.y - crossing.to.y),
        JSON.stringify(crossing),
      ).toBeLessThan(0.02);
      const h = world.arena.halfExtents;
      expect(
        Math.abs(crossing.landed.x) >= h.x - combat.enemies.first_blade.radius - 0.02 ||
          Math.abs(crossing.landed.y) >= h.y - combat.enemies.first_blade.radius - 0.02,
      ).toBe(true);
    }
  });

  it('lets a successful parry resolve without stopping the flight before the far wall', () => {
    const combat = structuredClone(DEFAULT_COMBAT);
    const { world, firstBlade } = makeFirstBladeWorld();
    const boundary = world.arena.halfExtents.x - combat.enemies.first_blade.radius;

    world.players[0].pos = { x: 0, y: 0 };
    world.players[0].facing = Math.PI;
    world.players[0].state = {
      kind: 'parry',
      enteredTick: world.tick,
      elapsedMs: combat.player.parry.onsetMs,
      attack: null,
      struck: [],
    };
    firstBlade.phase = 2;
    firstBlade.sequenceStep = 0;
    firstBlade.pos = { x: -1, y: 0 };
    firstBlade.facing = 0;
    firstBlade.glideTarget = { x: boundary, y: 0 };
    firstBlade.state = {
      kind: 'attack',
      enteredTick: world.tick,
      elapsedMs: 1,
      attackIndex: 3,
      telegraphJitterMs: 0,
      struck: [],
    };

    resolveEnemyAttack(world, firstBlade, world.players[0], combat);
    expect(world.players[0].parryStreak).toBe(1);
    expect(firstBlade.state.kind).toBe('attack');

    for (let i = 0; i < 100 && firstBlade.state.kind === 'attack'; i++) {
      stepEnemy(world, firstBlade, combat, TICK_MS);
    }

    expect(firstBlade.state.kind).toBe('sequence_reposition');
    expect(firstBlade.pos.x).toBeCloseTo(boundary, 5);
  });

  it('lands close and staggers only after all five fly-bys are perfectly parried', () => {
    const combat = structuredClone(DEFAULT_COMBAT);
    const { world, firstBlade } = makeFirstBladeWorld();
    const boundary = world.arena.halfExtents.x - combat.enemies.first_blade.radius;
    const attackIndices = [3, 4, 4, 4, 5];

    firstBlade.phase = 2;
    firstBlade.sequenceParries = 0;
    world.players[0].pos = { x: 0, y: 0 };
    world.players[0].facing = Math.PI;

    for (let i = 0; i < attackIndices.length; i++) {
      world.players[0].state = {
        kind: 'parry',
        enteredTick: world.tick,
        elapsedMs: combat.player.parry.onsetMs,
        attack: null,
        struck: [],
      };
      firstBlade.sequenceStep = i;
      firstBlade.pos = { x: -1, y: 0 };
      firstBlade.facing = 0;
      firstBlade.glideTarget = { x: boundary, y: 0 };
      firstBlade.staggerAfterAttack = false;
      firstBlade.state = {
        kind: 'attack',
        enteredTick: world.tick,
        elapsedMs: 1,
        attackIndex: attackIndices[i],
        telegraphJitterMs: 0,
        struck: [],
      };

      resolveEnemyAttack(world, firstBlade, world.players[0], combat);
      expect(firstBlade.sequenceParries).toBe(i + 1);
      if (i < attackIndices.length - 1) {
        expect(firstBlade.glideTarget?.x).toBe(boundary);
        expect(firstBlade.staggerAfterAttack).toBe(false);
      }
    }

    const rewardedLanding = firstBlade.glideTarget;
    expect(rewardedLanding).toBeDefined();
    expect(Math.hypot(rewardedLanding!.x, rewardedLanding!.y)).toBeLessThan(3);
    expect(firstBlade.staggerAfterAttack).toBe(true);

    for (let i = 0; i < 100 && firstBlade.state.kind === 'attack'; i++) {
      stepEnemy(world, firstBlade, combat, TICK_MS);
    }
    expect(firstBlade.state.kind).toBe('stagger');
    expect(Math.hypot(firstBlade.pos.x - world.players[0].pos.x, firstBlade.pos.y - world.players[0].pos.y)).toBeLessThan(
      3,
    );
  });

  it('keeps the far-wall destination when any fly-by in the phrase was missed', () => {
    const combat = structuredClone(DEFAULT_COMBAT);
    const { world, firstBlade } = makeFirstBladeWorld();
    const boundary = world.arena.halfExtents.x - combat.enemies.first_blade.radius;

    firstBlade.phase = 2;
    firstBlade.sequenceStep = 4;
    firstBlade.sequenceParries = 3;
    firstBlade.pos = { x: -1, y: 0 };
    firstBlade.facing = 0;
    firstBlade.glideTarget = { x: boundary, y: 0 };
    firstBlade.state = {
      kind: 'attack',
      enteredTick: world.tick,
      elapsedMs: 1,
      attackIndex: 5,
      telegraphJitterMs: 0,
      struck: [],
    };
    world.players[0].pos = { x: 0, y: 0 };
    world.players[0].facing = Math.PI;
    world.players[0].state = {
      kind: 'parry',
      enteredTick: world.tick,
      elapsedMs: combat.player.parry.onsetMs,
      attack: null,
      struck: [],
    };

    resolveEnemyAttack(world, firstBlade, world.players[0], combat);
    expect(firstBlade.sequenceParries).toBe(4);
    expect(firstBlade.glideTarget).toEqual({ x: boundary, y: 0 });
    expect(firstBlade.staggerAfterAttack).toBe(false);
  });
});
