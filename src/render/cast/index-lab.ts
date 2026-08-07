
import type { ModelBank } from '../models';
import { POLISHED_ARCHER } from './archer';
import { POLISHED_CAPTAIN } from './captain';
import { POLISHED_CHANCELLOR } from './chancellor';
import { POLISHED_DUELIST } from './duelist';
import { POLISHED_ELITE_GUARD } from './elite-guard';
import { POLISHED_FIRST_BLADE } from './first-blade';
import { POLISHED_GLASS_REGENT } from './glass-regent';
import { POLISHED_GUARD } from './guard';
import { MESH_GUARD } from './guard-mesh-lab';
import { POLISHED_KING } from './king';
import { POLISHED_PIKE_BOSS } from './pike-boss';
import { POLISHED_PIKE_NOVICE } from './pike-novice';
import { POLISHED_QUEEN } from './queen';
import { POLISHED_RAIN_BOSS } from './rain-boss';
import { POLISHED_THORN_MARSHAL } from './thorn-marshal';

export const DEFAULT_MODELS: ModelBank = {
  id: 'silhouette',
  description: 'Full-body polished primitives from the approved concept sheets.',
  models: {
    player: POLISHED_KING,
    guard: POLISHED_GUARD,
    duelist: POLISHED_DUELIST,
    archer: POLISHED_ARCHER,
    first_blade: POLISHED_FIRST_BLADE,
    captain: POLISHED_CAPTAIN,
    captain_read: POLISHED_CAPTAIN,
    rain_boss: POLISHED_RAIN_BOSS,
    chancellor: POLISHED_CHANCELLOR,
    elite_guard: POLISHED_ELITE_GUARD,
    pike_novice: POLISHED_PIKE_NOVICE,
    pike_boss: POLISHED_PIKE_BOSS,
    thorn_marshal: POLISHED_THORN_MARSHAL,
    queen: POLISHED_QUEEN,
    glass_regent: POLISHED_GLASS_REGENT,

    mesh_guard: MESH_GUARD,
  },
};
