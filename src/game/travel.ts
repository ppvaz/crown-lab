
import type { Vec2 } from '../sim/types';
import { dist } from '../sim/vec';
import type { Locale } from './copy';
import { copyFor } from './copy';

export type TravelEncounterId = 'siege_10' | 'first_blade';

export interface TravelNpc {
  name: string;
  at: Vec2;
  line: string;
  to: TravelEncounterId;
  accept: string;
}

const npcsFor = (locale: Locale): Readonly<Record<TravelEncounterId, TravelNpc>> => {
  const t = copyFor(locale).travel;
  return {
    siege_10: { ...t.sentinel, at: { x: -7.5, y: 5.2 }, to: 'first_blade' },
    first_blade: { ...t.squire, at: { x: -7.5, y: 5.2 }, to: 'siege_10' },
  };
};

export const travelNpcFor = (
  encounterId: string,
  locale: Locale = 'en',
): TravelNpc | null =>
  encounterId === 'siege_10' || encounterId === 'first_blade'
    ? npcsFor(locale)[encounterId]
    : null;

export const TRAVEL_REACH = 2;

export const nearTravelNpc = (npc: TravelNpc, playerPos: Vec2): boolean =>
  dist(playerPos, npc.at) <= TRAVEL_REACH;

export interface TravelState {
  open: boolean;
}

export const createTravelState = (): TravelState => ({ open: false });

export const travelPrompt = (
  npc: TravelNpc | null,
  playerPos: Vec2,
  state: TravelState,
  verb: string,
  locale: Locale = 'en',
): string | null => {
  if (npc === null) return null;
  if (state.open) return `${verb}  ${npc.accept}`;
  const talkTo = copyFor(locale).travel.talkTo(npc.name);
  return nearTravelNpc(npc, playerPos) ? `${verb}  ${talkTo}` : null;
};

export const interactTravel = (
  npc: TravelNpc | null,
  playerPos: Vec2,
  state: TravelState,
): TravelEncounterId | null => {
  if (npc === null) return null;
  if (state.open) {
    state.open = false;
    return npc.to;
  }
  if (!nearTravelNpc(npc, playerPos)) return null;
  state.open = true;
  return null;
};

export const syncTravel = (
  npc: TravelNpc | null,
  playerPos: Vec2,
  state: TravelState,
): void => {
  if (npc === null || !nearTravelNpc(npc, playerPos)) state.open = false;
};
