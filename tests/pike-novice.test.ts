import { describe, expect, it } from 'vitest';
import { DEFAULT_COMBAT } from '../src/lab/config';
import { DEFAULT_MODELS } from '../src/render/cast/index-lab';
import { PUBLIC_MODELS } from '../src/render/cast/index-public';
import { ENCOUNTERS } from '../src/lab/encounters';

const pike = DEFAULT_COMBAT.enemies.pike_novice;
const player = DEFAULT_COMBAT.player;
const thrust = pike.attacks[0];

const standOffFloor = pike.preferredRange * 0.8;

describe('the gap is real', () => {
  it('holds a band the king cannot reach into from where he is standing', () => {
    expect(standOffFloor).toBeGreaterThan(player.attacks.heavy.range);
    expect(standOffFloor).toBeGreaterThan(player.attacks.light.range);
  });

  it('reaches the king from inside a band the king cannot reach back into', () => {
    expect(thrust.range).toBeGreaterThan(standOffFloor);
    expect(thrust.range).toBeGreaterThan(player.attacks.heavy.range);
  });

  it('opens a window long enough to answer, and closes the distance itself', () => {
    expect(pike.preferredRange - thrust.lungeDistance).toBeLessThan(player.attacks.heavy.range);
    expect(thrust.recoveryMs).toBeGreaterThan(player.attacks.heavy.windupMs);
  });
});

describe('the archetype spends nothing it was not given', () => {
  it('takes no telegraph jitter', () => {
    expect(thrust.telegraphJitterMs).toBe(0);
  });

  it('throws exactly one attack, and announces it as a thrust', () => {
    expect(pike.attacks).toHaveLength(1);
    expect(thrust.tell).toBe('thrust');
    expect(thrust.parryable).toBe(true);
  });

  it('turns more slowly than every mob it shares a room with', () => {
    for (const other of ['guard', 'duelist', 'archer'] as const) {
      expect(pike.turnRate).toBeLessThan(DEFAULT_COMBAT.enemies[other].turnRate);
    }
  });

  it('is not a boss', () => {
    expect(pike.boss).toBeUndefined();
  });
});

describe('it stays on the lab side of the distribution boundary', () => {
  it('has a silhouette in the lab bank and none in the public one', () => {
    expect(DEFAULT_MODELS.models.pike_novice.id).toBe('pike_novice');
    expect('pike_novice' in PUBLIC_MODELS.models).toBe(false);
  });
});

describe('the room asks the combination question, not the solo one', () => {
  const room = ENCOUNTERS.pike_line;

  it('spawns the pike alongside an enemy that closes', () => {
    const spawned = room.waves.flatMap((wave) => wave.spawns.map((spawn) => spawn.archetype));
    expect(spawned).toContain('pike_novice');
    expect(spawned).toContain('guard');
  });

  it('stays under the simultaneous-attacker cap', () => {
    const spawned = room.waves.flatMap((wave) => wave.spawns);
    expect(spawned.length).toBeLessThanOrEqual(DEFAULT_COMBAT.maxSimultaneousAttackers);
  });
});
