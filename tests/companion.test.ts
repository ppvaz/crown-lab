import { DEFAULT_COMBAT, SLOWMO_PRESETS } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import { createWorld } from '../src/sim/encounter';
import { applyDamageToCompanion, spawnCompanion } from '../src/sim/companion';
import { NEUTRAL_INTENT } from '../src/sim/types';
import { stepWorld } from '../src/sim/world';
import { resolveEnemyAttack } from '../src/sim/combat';

describe('escort companion simulation', () => {
  it('follows the king as a clamped simulation body', () => {
    const world = createWorld(ENCOUNTERS.wayfarer_court, DEFAULT_COMBAT, 1);
    world.players[0].pos = { x: 5, y: 0 };
    const companion = spawnCompanion(world, 'MARA', 90, 90, { x: -5, y: 0 });
    const before = companion.pos.x;

    for (let i = 0; i < 60; i++) {
      stepWorld(
        world,
        [NEUTRAL_INTENT],
        DEFAULT_COMBAT,
        SLOWMO_PRESETS.none,
        ENCOUNTERS.wayfarer_court,
      );
    }

    expect(companion.pos.x).toBeGreaterThan(before);
    expect(companion.state).toBe('following');
  });

  it('emits protection facts and can be downed', () => {
    const world = createWorld(ENCOUNTERS.wayfarer_court, DEFAULT_COMBAT, 1);
    const companion = spawnCompanion(world, 'MARA', 12, 12, { x: 0, y: 0 });

    applyDamageToCompanion(world, 5, 99, 'test_strike');
    expect(companion.hp).toBe(7);
    expect(world.events.at(-1)?.type).toBe('companion_hit');

    applyDamageToCompanion(world, 20, 99, 'test_strike');
    expect(companion.state).toBe('downed');
    expect(world.events.at(-1)?.type).toBe('companion_downed');
  });

  it('can be struck by the same authored melee geometry as the king', () => {
    const world = createWorld(ENCOUNTERS.kernel_guard, DEFAULT_COMBAT, 1);
    stepWorld(
      world,
      [NEUTRAL_INTENT],
      DEFAULT_COMBAT,
      SLOWMO_PRESETS.none,
      ENCOUNTERS.kernel_guard,
    );
    const enemy = world.enemies[0];
    enemy.pos = { x: 0, y: 0 };
    enemy.facing = 0;
    enemy.state.kind = 'attack';
    enemy.state.attackIndex = 0;
    enemy.state.struck = [];
    const companion = spawnCompanion(world, 'MARA', 90, 90, { x: 1, y: 0 });

    resolveEnemyAttack(world, enemy, world.players[0], DEFAULT_COMBAT);

    expect(companion.hp).toBeLessThan(companion.maxHp);
    expect(enemy.state.struck).toContain(companion.id);
  });
});
