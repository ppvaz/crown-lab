
import type { WindowStyle } from './facade';
import type { RoomRegistry } from './rooms/theme';

export interface Ambience {
  skyHigh: string;
  skyHorizon: string;
  skyLow: string;
  key: string;
  fill: string;
  dust: number;
  fog: number;
  windowSpacing: number;
  windowStyle: WindowStyle;
  parallaxStyle: 'inhabited' | 'fortress' | 'ruin' | 'high_court';
  windowLight: number;
  wallCondition: 'plain' | 'kept' | 'fortified' | 'weathered' | 'damaged';
  glassStyle: 'clear' | 'amber' | 'frost' | 'smoke' | 'crimson';
  wallDisplay: 'none' | 'heraldry' | 'arms' | 'records' | 'service';
}

const DEFAULT_AMBIENCE: Ambience = {
  skyHigh: '#07070c',
  skyHorizon: '#141220',
  skyLow: '#050508',
  key: '#c8963c',
  fill: '#3a5878',
  dust: 46,
  fog: 0.6,
  windowSpacing: 3.4,
  windowStyle: 'court',
  parallaxStyle: 'inhabited',
  windowLight: 0.055,
  wallCondition: 'plain',
  glassStyle: 'clear',
  wallDisplay: 'none',
};

export const ambienceFor = (rooms: RoomRegistry, encounterId: string): Ambience => ({
  ...DEFAULT_AMBIENCE,
  ...rooms.ambience(encounterId),
});

export const hashNoise = (a: number, b: number): number => {
  const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return n - Math.floor(n);
};
