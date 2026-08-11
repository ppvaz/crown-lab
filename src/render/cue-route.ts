
import type { SimEvent } from '../sim/types';
import { cueForEvent } from './soundbank';
import type { AudioCue } from './soundbank';

export const labCueForEvent = (event: SimEvent): AudioCue | null => {
  switch (event.type) {
    case 'friendly_fire':
      return 'hit';
    case 'enemy_feint':
      return 'telegraph';
    case 'slowmo_started':
      return 'slowmo';
    case 'volley_served':
      return 'power';
    case 'volley_returned':
      return 'glass_strain';
    case 'volley_shattered':
      return 'power_hit';
    case 'volley_ward_pushed':
      return 'power';
    default:
      return cueForEvent(event);
  }
};
