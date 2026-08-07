
import { DEFAULT_COMBAT } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import { createWorld } from '../src/sim/encounter';
import { arenaContains } from '../src/sim/arena';
import { hashWorld, stepWorld } from '../src/sim/world';
import { NEUTRAL_INTENT } from '../src/sim/types';
import { SLOWMO_PRESETS } from '../src/lab/config';
import { fingerprintWorld } from '../src/lab/engine-probe';
import {
  nextWorldSeed,
  partCoopRoster,
  roomWorldSeed,
  seatCoopRoster,
  seatIdentities,
} from '../src/app/coop-world';
import type { KingIdentityId } from '../src/render/king-identities';
import type { World } from '../src/sim/types';
import { partyAt } from '../src/game/party';

const court = () => createWorld(ENCOUNTERS.wayfarer_court, DEFAULT_COMBAT, 1);

describe('the seed a session builds its first world from', () => {
  it('is the same number on both machines, because the room code is', () => {
    expect(roomWorldSeed('ABC234')).toBe(roomWorldSeed('ABC234'));
  });

  it('separates rooms, so two sessions are not handed the same fight', () => {
    const codes = ['ABC234', 'ABC235', 'BCA234', 'ZZZZZZ'];
    expect(new Set(codes.map(roomWorldSeed)).size).toBe(codes.length);
  });

  it('never returns 0, which is the one value an integer PRNG cannot start from', () => {
    expect(roomWorldSeed('')).toBeGreaterThan(0);
    for (const code of ['ABC234', 'QQQQQQ', '234567']) expect(roomWorldSeed(code)).toBeGreaterThan(0);
  });
});

describe('the seed a transition builds the next world from', () => {
  it('is derived from the world being left, so both machines derive it identically', () => {
    const a = court();
    const b = court();
    expect(nextWorldSeed(a, 'court_to_passage')).toBe(nextWorldSeed(b, 'court_to_passage'));
  });

  it('moves when the world does, which is what makes it a derivation and not a constant', () => {
    const world = court();
    const before = nextWorldSeed(world, 'court_to_passage');
    stepWorld(world, [NEUTRAL_INTENT], DEFAULT_COMBAT, SLOWMO_PRESETS.none, ENCOUNTERS.wayfarer_court);
    expect(nextWorldSeed(world, 'court_to_passage')).not.toBe(before);
  });

  it('separates two doors out of the same world at the same tick', () => {
    const world = court();
    expect(nextWorldSeed(world, 'court_to_passage')).not.toBe(nextWorldSeed(world, 'failed_return'));
  });

  it('reads every bit of the world, not the quantized digest a replay compares', () => {
    const world = court();
    const before = nextWorldSeed(world, 'court_to_passage');
    const quantized = hashWorld(world);
    world.players[0].pos.x += 1e-9;

    expect(hashWorld(world)).toBe(quantized);
    expect(nextWorldSeed(world, 'court_to_passage')).not.toBe(before);
  });
});

describe('seating the roster a rebuilt world needs', () => {
  it('leaves a solo world exactly as the encounter built it', () => {
    const world = court();
    const before = fingerprintWorld(world);

    seatCoopRoster(world, DEFAULT_COMBAT, 1);

    expect(world.players).toHaveLength(1);
    expect(fingerprintWorld(world)).toBe(before);
  });

  it('seats the missing kings and nobody else', () => {
    const world = court();
    seatCoopRoster(world, DEFAULT_COMBAT, 3);
    expect(world.players).toHaveLength(3);
    seatCoopRoster(world, DEFAULT_COMBAT, 3);
    expect(world.players).toHaveLength(3);
  });

  it('produces the identical world on two machines', () => {
    const a = court();
    const b = court();
    seatCoopRoster(a, DEFAULT_COMBAT, 3);
    seatCoopRoster(b, DEFAULT_COMBAT, 3);
    expect(fingerprintWorld(a)).toBe(fingerprintWorld(b));
  });

  it('puts every king inside the arena, from a spawn authored for one', () => {
    for (const id of ['wayfarer_court', 'overlap_court', 'upper_hall'] as const) {
      const world = createWorld(ENCOUNTERS[id], DEFAULT_COMBAT, 1);
      world.players[0].pos = { x: -6, y: -4 };
      seatCoopRoster(world, DEFAULT_COMBAT, 3);
      for (const king of world.players) {
        expect(arenaContains(world.arena, king.pos, DEFAULT_COMBAT.player.radius)).toBe(true);
      }
    }
  });
});

describe('parting a roster whose other half left', () => {
  const seated = (size: number) => {
    const world = court();
    seatCoopRoster(world, DEFAULT_COMBAT, size);
    return world;
  };
  const step = (world: World) =>
    stepWorld(world, [], DEFAULT_COMBAT, SLOWMO_PRESETS.none, ENCOUNTERS.wayfarer_court);

  it('leaves a solo world alone, which is every run that never opened a room', () => {
    const world = court();
    expect(partCoopRoster(world, [], [], 0)).toBe(0);
    expect(world.players.length).toBe(1);
    expect(world.players[0].hp).toBeGreaterThan(0);
  });

  it('moves the survivor into seat 0, so the room is not lost to a verdict about a stranger', () => {
    const world = seated(2);
    const survivor = world.players[1];
    expect(partCoopRoster(world, [], [], 1)).toBe(0);
    expect(world.players[0]).toBe(survivor);
    expect(world.players[0].hp).toBeGreaterThan(0);
    step(world);
    expect(world.outcome).toBe('running');
  });

  it('fells the abandoned king through the simulation rather than around it', () => {
    const world = seated(2);
    const left = world.players[0];
    partCoopRoster(world, [], [], 1);
    expect(left.state.kind).not.toBe('dead');
    step(world);
    expect(left.state.kind).toBe('dead');
  });

  it('opens the doors again, which is the whole reason he falls', () => {
    const world = seated(2);
    const survivor = world.players[1];
    const door = { ...survivor.pos };
    world.players[0].pos = { x: door.x + 4, y: door.y + 4 };
    expect(partyAt(world, door)).toBe(false);
    partCoopRoster(world, [], [], 1);
    step(world);
    expect(partyAt(world, door)).toBe(true);
  });

  it('carries each king his own cloak across the swap', () => {
    const identities: KingIdentityId[] = seatIdentities('ABC234', 2);
    const worn = identities[1];
    const world = seated(2);
    partCoopRoster(world, identities, [], 1);
    expect(identities[0]).toBe(worn);
  });

  it('remaps every seat a conversation was holding', () => {
    const world = seated(2);
    const herald = { speaker: 1 };
    const envoy = { speaker: 0 };
    partCoopRoster(world, [], [herald, envoy], 1);
    expect(herald.speaker).toBe(0);
    expect(envoy.speaker).toBe(1);
  });

  it('needs no swap when the survivor already holds seat 0', () => {
    const world = seated(2);
    const survivor = world.players[0];
    const speaker = { speaker: 0 };
    expect(partCoopRoster(world, [], [speaker], 0)).toBe(0);
    expect(world.players[0]).toBe(survivor);
    expect(speaker.speaker).toBe(0);
    step(world);
    expect(world.players[1].state.kind).toBe('dead');
    expect(survivor.state.kind).not.toBe('dead');
  });

  it('refuses a seat outside the roster instead of felling the room over it', () => {
    const world = seated(2);
    expect(partCoopRoster(world, [], [], 4)).toBe(4);
    step(world);
    for (const king of world.players) expect(king.state.kind).not.toBe('dead');
  });
});
