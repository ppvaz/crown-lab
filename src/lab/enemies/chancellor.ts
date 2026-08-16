
import type { EnemyConfig } from '../../sim/types';
import { RAIN_BOSS } from './rain-boss';
import { bossLifecycle } from './boss-lifecycle';

export const CHANCELLOR: EnemyConfig = {
  ...RAIN_BOSS,
  archetype: 'chancellor',
  boss: bossLifecycle('THE CHANCELLOR'),


  hazard: { kind: 'books', count: 5, phaseTwoCount: 7, speed: 3.6, damage: 8 },
};
