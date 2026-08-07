
import type { EnemyConfig } from '../../sim/types';
import { GUARD } from './guard';

export const MESH_GUARD_ENEMY: EnemyConfig = {
  ...GUARD,
  archetype: 'mesh_guard',
  attacks: GUARD.attacks.map((attack) => ({ ...attack })),
};
