
import type { EnemyConfig } from '../../sim/types';

export const bossLifecycle = (name: string): NonNullable<EnemyConfig['boss']> => ({
  name,
  entranceFallMs: 720,
  introRoarMs: 980,
  phaseTwoHpFraction: 0.5,
  phaseRoarMs: 920,
});
