
import type { EnemyConfig } from '../../sim/types';
import { PIKE_BOSS } from './pike-boss';
import { bossLifecycle } from './boss-lifecycle';

export const THORN_MARSHAL: EnemyConfig = {
  ...PIKE_BOSS,
  archetype: 'thorn_marshal',
  boss: bossLifecycle('THORN MARSHAL'),
};
