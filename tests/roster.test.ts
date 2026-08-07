
import type { CombatConfig, Player } from '../src/sim/types';
import { PLAYER_ID } from '../src/sim/types';
import { nearestLivingPlayer } from '../src/sim/enemy';
import { addPlayer, createWorld } from '../src/sim/encounter';
import { hashWorld, stepWorld } from '../src/sim/world';
import { makeRng } from '../src/sim/rng';
import { COMBAT_PRESETS, SLOWMO_PRESETS } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import { syntheticIntent } from '../src/lab/engine-probe';

const PRE_ROSTER_HASHES: Readonly<Record<number, number>> = {
  300: 673380065,
  600: 3796861020,
  900: 3629059915,
};

const durable = (): CombatConfig => {
  const combat = structuredClone(COMBAT_PRESETS.Default);
  combat.player.maxHp = 1e6;
  combat.enemies.guard.maxHp = 1e6;
  return combat;
};

const playTo900 = (): Record<number, number> => {
  const combat = durable();
  const encounter = ENCOUNTERS.kernel_guard;
  const world = createWorld(encounter, combat, 7);
  const rng = makeRng(0x5eed);
  const seen: Record<number, number> = {};
  for (let t = 0; t < 900; t++) {
    stepWorld(world, [syntheticIntent(rng)], combat, SLOWMO_PRESETS.none, encounter);
    if (world.tick % 300 === 0) seen[world.tick] = hashWorld(world);
  }
  return seen;
};

describe('the roster', () => {
  it('holds exactly one player, and that player is the id telemetry filters on', () => {
    const world = createWorld(ENCOUNTERS.kernel_guard, COMBAT_PRESETS.Default, 7);

    expect(world.players).toHaveLength(1);
    expect(world.players[0].id).toBe(PLAYER_ID);
    expect(world.nextId).toBe(PLAYER_ID + 1);
  });

  it('hashes the kernel to the digest pinned for it', () => {
    expect(playTo900()).toEqual(PRE_ROSTER_HASHES);
  });

  it('leaves a dead player in the roster, so ids stay stable for the whole run', () => {
    const combat = structuredClone(COMBAT_PRESETS.Default);
    const encounter = ENCOUNTERS.kernel_guard;
    const world = createWorld(encounter, combat, 7);
    const rng = makeRng(0x5eed);

    world.players[0].hp = 0;
    for (let t = 0; t < 4; t++) {
      stepWorld(world, [syntheticIntent(rng)], combat, SLOWMO_PRESETS.none, encounter);
    }

    expect(world.players).toHaveLength(1);
    expect(world.players[0].state.kind).toBe('dead');
  });
});

describe('who an enemy fights', () => {
  const roster = (...bodies: Array<{ id: number; x: number; kind?: string }>): Player[] =>
    bodies.map(
      (b) =>
        ({
          id: b.id,
          pos: { x: b.x, y: 0 },
          state: { kind: b.kind ?? 'idle' },
        }) as unknown as Player,
    );

  it('picks the nearest living protagonist', () => {
    const players = roster({ id: 0, x: 10 }, { id: 1, x: 2 });
    expect(nearestLivingPlayer(players, { x: 0, y: 0 }).id).toBe(1);
    expect(nearestLivingPlayer(players, { x: 12, y: 0 }).id).toBe(0);
  });

  it('walks past a dead one however close it is standing', () => {
    const players = roster({ id: 0, x: 8 }, { id: 1, x: 1, kind: 'dead' });
    expect(nearestLivingPlayer(players, { x: 0, y: 0 }).id).toBe(0);
  });

  it('breaks an exact tie on the lower id, so two peers choose the same king', () => {
    const players = roster({ id: 7, x: 3 }, { id: 2, x: -3 });
    expect(nearestLivingPlayer(players, { x: 0, y: 0 }).id).toBe(2);
    expect(nearestLivingPlayer([...players].reverse(), { x: 0, y: 0 }).id).toBe(2);
  });

  it('returns the first body when every protagonist is down', () => {
    const players = roster({ id: 0, x: 8, kind: 'dead' }, { id: 1, x: 1, kind: 'dead' });
    expect(nearestLivingPlayer(players, { x: 0, y: 0 }).id).toBe(0);
  });
});

describe('a second protagonist entering an existing world', () => {
  it('takes an ordinary id from the same counter every other body draws from', () => {
    const combat = structuredClone(COMBAT_PRESETS.Default);
    const world = createWorld(ENCOUNTERS.kernel_guard, combat, 7);

    const second = addPlayer(world, combat, { x: 2, y: -1 });

    expect(world.players).toHaveLength(2);
    expect(second.id).toBe(PLAYER_ID + 1);
    expect(world.nextId).toBe(PLAYER_ID + 2);
  });

  it('starts them whole, facing the middle of the room', () => {
    const combat = structuredClone(COMBAT_PRESETS.Default);
    const world = createWorld(ENCOUNTERS.kernel_guard, combat, 7);

    const second = addPlayer(world, combat, { x: 4, y: 0 });

    expect(second.hp).toBe(combat.player.maxHp);
    expect(second.stamina).toBe(combat.player.maxStamina);
    expect(second.state.kind).toBe('idle');
    expect(second.slowMoUsedThisEncounter).toBe(0);
    expect(Math.abs(second.facing)).toBeCloseTo(Math.PI, 6);
  });

  it('leaves a world nobody joined byte-identical', () => {
    expect(playTo900()).toEqual(PRE_ROSTER_HASHES);
  });
});
