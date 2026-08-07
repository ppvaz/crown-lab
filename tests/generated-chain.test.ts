
import { arenaContains } from '../src/sim/arena';
import { createWorld } from '../src/sim/encounter';
import { DEFAULT_COMBAT } from '../src/lab/config';
import { encounterForSeed } from '../src/lab/encounters';
import {
  CHAIN_DOOR_REACH,
  chainDoorUnderKing,
  chainDoors,
  chainForwardOpen,
  chainHasBack,
  chainLabel,
  chainSeed,
} from '../src/lab/generated-chain';

const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);
const room = (seed: number) => encounterForSeed('generated_chambers', seed);
const worldAt = (seed: number) => createWorld(room(seed), DEFAULT_COMBAT, seed);

describe('the generated chain', () => {
  it('stands both doors on floor a king can reach', () => {
    for (const seed of SEEDS) {
      const def = room(seed);
      const doors = chainDoors(def.arena);
      expect(arenaContains(def.arena, doors.back, 0.45), `seed ${seed}`).toBe(true);
      expect(arenaContains(def.arena, doors.forward, 0.45), `seed ${seed}`).toBe(true);
      expect(doors.back.x).toBeCloseTo(def.playerStart.x, 9);
      expect(doors.back.y).toBeCloseTo(def.playerStart.y, 9);
      expect(Math.hypot(doors.forward.x - doors.back.x, doors.forward.y - doors.back.y)).toBeGreaterThan(
        CHAIN_DOOR_REACH * 2,
      );
    }
  });

  it('holds the way on until the room is empty', () => {
    for (const seed of SEEDS) {
      const world = worldAt(seed);
      const doors = chainDoors(world.arena);
      expect(chainForwardOpen(world), `seed ${seed}`).toBe(false);
      expect(chainDoorUnderKing(world.arena, world, doors.forward, seed)).toBeNull();

      world.outcome = 'cleared';
      expect(chainForwardOpen(world)).toBe(true);
      expect(chainDoorUnderKing(world.arena, world, doors.forward, seed)).toBe('forward');
    }
  });

  it('answers with the door under this king, and with nothing between them', () => {
    const world = worldAt(3);
    const doors = chainDoors(world.arena);
    expect(chainDoorUnderKing(world.arena, world, doors.back, 3)).toBe('back');
    expect(chainDoorUnderKing(world.arena, world, world.players[0].pos, 3)).toBe('back');
    const first = worldAt(1);
    expect(chainDoorUnderKing(first.arena, first, chainDoors(first.arena).back, 1)).toBeNull();
    const between = {
      x: (doors.back.x + doors.forward.x) / 2,
      y: (doors.back.y + doors.forward.y) / 2,
    };
    expect(chainDoorUnderKing(world.arena, world, between, 3)).toBeNull();
  });

  it('walks the seed, and cannot walk below the dial\'s own floor', () => {
    expect(chainSeed(7, 'forward')).toBe(8);
    expect(chainSeed(7, 'back')).toBe(6);
    expect(chainHasBack(1)).toBe(false);
    expect(chainHasBack(2)).toBe(true);
    expect(chainLabel(7, 'forward')).toBe('SALA 8');
    expect(chainLabel(2, 'back')).toBe('SALA 1');
  });

  it('never drops an arriving king onto the door he just used', () => {
    for (const seed of SEEDS) {
      const forwardTo = chainSeed(seed, 'forward');
      const arrived = worldAt(forwardTo);
      expect(chainDoorUnderKing(arrived.arena, arrived, arrived.players[0].pos, forwardTo)).toBe(
        'back',
      );

      const backTo = Math.max(1, chainSeed(seed, 'back'));
      const previous = worldAt(backTo);
      const landing = chainDoors(previous.arena).forward;
      expect(chainDoorUnderKing(previous.arena, previous, landing, backTo)).toBeNull();
    }
  });
});
