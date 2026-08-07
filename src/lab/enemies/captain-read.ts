
import type { EnemyConfig } from '../../sim/types';
import { CAPTAIN } from './captain';
import { bossLifecycle } from './boss-lifecycle';

export const CAPTAIN_READ: EnemyConfig = {
  ...CAPTAIN,
  archetype: 'captain_read',
  boss: bossLifecycle('THE CAPTAIN OF THE GUARD'),
  attacks: CAPTAIN.attacks.map((attack) => ({
    ...attack,
    telegraphJitterMs: attack.id === 'captain_release' ? 260 : 220,
  })),
};
