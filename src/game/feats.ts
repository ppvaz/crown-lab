
import type { SimEvent } from '../sim/types';

export interface FeatState {
  hitsTaken: number;
  guardsBroken: number;
  parriesFailed: number;
  parriesLanded: number;
  powersUsed: number;
  deaths: number;
  skipped: boolean;
}

export interface Feat {
  id: string;
  label: string;
  note: string;
}

export const createFeatState = (): FeatState => ({
  hitsTaken: 0,
  guardsBroken: 0,
  parriesFailed: 0,
  parriesLanded: 0,
  powersUsed: 0,
  deaths: 0,
  skipped: false,
});

export const observeFeats = (state: FeatState, events: readonly SimEvent[]): void => {
  for (const event of events) {
    switch (event.type) {
      case 'hit_received':
        state.hitsTaken += 1;
        break;
      case 'guard_broken':
        state.guardsBroken += 1;
        break;
      case 'parry_failed':
        state.parriesFailed += 1;
        break;
      case 'parry_success':
        state.parriesLanded += 1;
        break;
      case 'power_used':
        state.powersUsed += 1;
        break;
      case 'player_died':
        state.deaths += 1;
        break;
      default:
        break;
    }
  }
};

export interface FeatContext {
  escortTaken: boolean;
  escortAlive: boolean;
  escortUnharmed: boolean;
}

export const earnedFeats = (state: FeatState, context: FeatContext): Feat[] => {
  const feats: Feat[] = [];

  if (state.deaths === 0) {
    feats.push({ id: 'first_try', label: 'FIRST TRY', note: 'Never fell' });
  }
  if (!state.skipped) {
    feats.push({ id: 'the_ladder', label: 'THE LADDER', note: 'Walked every room' });
  }
  if (context.escortTaken && context.escortAlive) {
    feats.push({ id: 'escort', label: 'ESCORT', note: 'Mara walked out with you' });
  }
  if (context.escortTaken && context.escortUnharmed) {
    feats.push({ id: 'escort_intact', label: 'UNTOUCHED ESCORT', note: 'She was never hurt' });
  }
  if (state.guardsBroken === 0) {
    feats.push({ id: 'unbroken', label: 'UNBROKEN', note: 'Your guard never broke' });
  }
  if (state.powersUsed === 0) {
    feats.push({ id: 'bare_handed', label: 'BARE-HANDED', note: 'The blade and nothing else' });
  }
  if (state.parriesLanded > 0 && state.parriesFailed === 0) {
    feats.push({ id: 'flawless', label: 'FLAWLESS', note: 'Every parry was clean' });
  }
  if (state.hitsTaken === 0) {
    feats.push({ id: 'untouched', label: 'UNTOUCHED', note: 'Nothing landed on you' });
  }

  return feats;
};
