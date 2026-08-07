
import type { EnemyConfig } from '../../sim/types';

export const ARCHER: EnemyConfig = {
  archetype: 'archer',
  maxHp: 50,
  maxPoise: 45,
  poiseRegenPerSec: 10,
  moveSpeed: 3.0,
  acceleration: 16,
  turnRate: 4,
  radius: 0.4,
  preferredRange: 7.5,
  attackRange: 11,
  attacks: [
    {
      id: 'archer_shot',
      telegraphMs: 800,
      telegraphJitterMs: 200,
      activeMs: 40,
      recoveryMs: 500,
      range: 12,
      arcDeg: 12,
      damage: 12,
      lungeDistance: 0,
      parryable: true,
      kind: 'projectile',
      projectileSpeed: 11,
    },
  ],
  attackCooldownMs: 1800,
  attackCooldownJitterMs: 500,
  staggerMs: 1200,
};
