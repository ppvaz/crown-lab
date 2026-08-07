
import type { EnemyConfig } from '../../sim/types';
import { RAIN_BOSS } from './rain-boss';
import { bossLifecycle } from './boss-lifecycle';

export const CHANCELLOR: EnemyConfig = {
  ...RAIN_BOSS,
  archetype: 'chancellor',
  boss: bossLifecycle('THE CHANCELLOR'),
};
