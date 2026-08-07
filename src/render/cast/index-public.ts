
import type { ModelBank } from '../models';
import { POLISHED_ARCHER } from './archer';
import { POLISHED_CAPTAIN } from './captain';
import { POLISHED_CHANCELLOR } from './chancellor';
import { POLISHED_DUELIST } from './duelist';
import { POLISHED_FIRST_BLADE } from './first-blade';
import { POLISHED_GLASS_REGENT } from './glass-regent';
import { POLISHED_GUARD } from './guard';
import { POLISHED_KING } from './king';
import { POLISHED_QUEEN } from './queen';
import { POLISHED_THORN_MARSHAL } from './thorn-marshal';

export const PUBLIC_MODELS = {
  id: 'game',
  description: '',
  models: {
    player: POLISHED_KING,
    guard: POLISHED_GUARD,
    duelist: POLISHED_DUELIST,
    archer: POLISHED_ARCHER,
    first_blade: POLISHED_FIRST_BLADE,
    captain: POLISHED_CAPTAIN,
    chancellor: POLISHED_CHANCELLOR,
    glass_regent: POLISHED_GLASS_REGENT,
    queen: POLISHED_QUEEN,
    thorn_marshal: POLISHED_THORN_MARSHAL,
  },
} as unknown as ModelBank;
