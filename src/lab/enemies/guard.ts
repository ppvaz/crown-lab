
import type { EnemyConfig } from '../../sim/types';

export const GUARD: EnemyConfig = {
  archetype: 'guard',
  maxHp: 90,
  maxPoise: 100,
  poiseRegenPerSec: 14,
  moveSpeed: 2.6,
  acceleration: 14,
  turnRate: 3.2,
  radius: 0.5,
  preferredRange: 1.6,
  attackRange: 2.0,
  attacks: [
    {
      id: 'guard_chop',
      telegraphMs: 620,
      telegraphJitterMs: 0,
      activeMs: 90,
      recoveryMs: 520,
      range: 2.1,
      arcDeg: 90,
      damage: 16,
      lungeDistance: 0.5,
      turnRateDuringWindup: 1.4,
      parryable: true,
      kind: 'melee',
    },
  ],
  attackCooldownMs: 1100,
  attackCooldownJitterMs: 250,
  staggerMs: 1400,
};
