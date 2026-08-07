
import type { EnemyConfig } from '../../sim/types';

export const PIKE_NOVICE: EnemyConfig = {
  archetype: 'pike_novice',
  maxHp: 80,
  maxPoise: 90,
  poiseRegenPerSec: 14,
  moveSpeed: 2.4,
  acceleration: 14,
  turnRate: 2.2,
  radius: 0.5,
  preferredRange: 3.3,
  attackRange: 3.6,
  attacks: [
    {
      id: 'pike_novice_thrust',
      telegraphMs: 700,
      telegraphJitterMs: 0,
      activeMs: 90,
      recoveryMs: 640,
      range: 3.5,
      arcDeg: 34,
      damage: 15,
      lungeDistance: 1.4,
      parryable: true,
      kind: 'melee',
      tell: 'thrust',
    },
  ],
  attackCooldownMs: 1200,
  attackCooldownJitterMs: 260,
  staggerMs: 1400,
};
