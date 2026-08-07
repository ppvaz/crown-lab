
import type { Vec2, World } from '../sim/types';
import { COURT_ENCOUNTER } from './court';
import { dist } from '../sim/vec';
import {
  closeSpeaker,
  createSpeakerState,
  cycleSpeaker,
  openSpeaker,
  type SpeakerState,
} from './speaker';

export interface HeraldOffer {
  to: string | null;
  label: string;
  skipsLadder: boolean;
}

export const heraldLeave = (label: string): HeraldOffer => ({
  to: null,
  label,
  skipsLadder: false,
});

export interface Herald {
  name: string;
  at: Vec2;
  line: string;
  offers: readonly HeraldOffer[];
}

export const HERALD: Herald = {
  name: 'THE HERALD',
  at: { x: -6.5, y: -3.6 },
  line: 'I can take you now — and you will arrive unready.',
  offers: [
    { to: 'first_blade', label: 'THE FIRST BLADE', skipsLadder: true },
    { to: 'captain', label: 'THE CAPTAIN OF THE GUARD', skipsLadder: false },
    { to: 'chancellor', label: 'THE CHANCELLOR', skipsLadder: false },
    { to: 'glass_regent', label: 'THE GLASS REGENT', skipsLadder: false },
    { to: 'queen', label: 'THE QUEEN', skipsLadder: false },
    { to: 'thorn_marshal', label: 'THE THORN MARSHAL', skipsLadder: false },
  ],
};

export const HERALD_RADIUS = 0.45;

export const HERALD_REACH = 1.8;

export type HeraldState = SpeakerState;

export const createHeraldState = (): HeraldState => createSpeakerState();

export const nearHerald = (at: Vec2): boolean => dist(at, HERALD.at) <= HERALD_REACH;

export const heraldPresent = (world: World): boolean =>
  world.encounter.defId === COURT_ENCOUNTER;

export const heraldTalking = (state: HeraldState, world: World): boolean =>
  state.open &&
  heraldPresent(world) &&
  nearHerald((world.players[state.speaker] ?? world.players[0]).pos);

export const heraldPrompt = (
  state: HeraldState,
  at: Vec2,
  interact: string,
): string | null =>
  !state.open && nearHerald(at) ? `${interact}  SPEAK TO THE HERALD` : null;

export const openHerald = (state: HeraldState, axis: number, speaker = 0): void =>
  openSpeaker(state, axis, speaker);

export const closeHerald = (state: HeraldState): void => closeSpeaker(state);

export const cycleHerald = (state: HeraldState, axis: number, count: number): boolean =>
  cycleSpeaker(state, axis, count);

export const selectedOffer = (
  state: HeraldState,
  offers: readonly HeraldOffer[],
): HeraldOffer | null => offers[Math.min(state.selected, offers.length - 1)] ?? null;

export const heraldSpeaker = (
  state: HeraldState,
  offers: readonly HeraldOffer[],
): string =>
  offers.length < 2
    ? HERALD.name
    : `${HERALD.name}  ${Math.min(state.selected, offers.length - 1) + 1}/${offers.length}`;

export interface HeraldHintCopy {
  choose: string;
  go: string;
}

export const heraldHint = (
  offers: readonly HeraldOffer[],
  move: string,
  interact: string,
  words: HeraldHintCopy,
): string =>
  offers.length < 2
    ? `${interact}  ${words.go}`
    : `${move}  ${words.choose}    ${interact}  ${words.go}`;
