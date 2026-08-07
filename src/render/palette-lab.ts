
import type { EnemyArchetype } from '../sim/types';
import type { ArchetypeColor, Palette } from './palette';
import { PALETTE, publicArchetypeColor } from './palette';

const LAB_PALETTE = {
  captain: '#c94450',
  rainBoss: '#777d86',
  eliteGuard: '#6b8079',
  chancellor: '#a961e8',
  pikeNovice: '#4d9c94',
  pikeBoss: '#8a8490',

} as const;

export const LAB_FULL_PALETTE: Palette = { ...PALETTE, ...LAB_PALETTE };

export const labArchetypeColor: ArchetypeColor = (archetype: EnemyArchetype) => {
  switch (archetype) {
    case 'captain':
    case 'captain_read':
      return LAB_PALETTE.captain;
    case 'rain_boss':
      return LAB_PALETTE.rainBoss;
    case 'chancellor':
      return LAB_PALETTE.chancellor;
    case 'elite_guard':
      return LAB_PALETTE.eliteGuard;
    case 'mesh_guard':
      return publicArchetypeColor('guard');
    case 'pike_novice':
      return LAB_PALETTE.pikeNovice;
    case 'pike_boss':
      return LAB_PALETTE.pikeBoss;
    default:
      return publicArchetypeColor(archetype);
  }
};
