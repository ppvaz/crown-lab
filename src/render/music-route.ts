
import { LAB_MUSIC } from './asset-registry-lab';
import {
  BLADE_OF_HEIR_ALT_MUSIC_BED,
  BLADE_OF_HEIR_MUSIC_BED,
  CAPTAIN_BLADE_OF_HEIR_MUSIC_BED,
  FIRST_BLADE_MUSIC_BED,
  MUSIC_BED,
  musicBedForEncounter,
  QUEEN_MUSIC_BED,
} from './soundbank';
import type { MusicBed } from './soundbank';

export const COURTLY_INTRIGUE_II_MUSIC_BED: MusicBed = {
  id: 'bgm-04',
  url: LAB_MUSIC['bgm-04.webm'],
  gain: 0.22,
};

export const COURTLY_INTRIGUE_III_MUSIC_BED: MusicBed = {
  id: 'bgm-05',
  url: LAB_MUSIC['bgm-05.webm'],
  gain: 0.17,
};

export const CAPTAIN_MUSIC_BED: MusicBed = {
  id: 'bgm-07',
  url: LAB_MUSIC['bgm-07.webm'],
  gain: 0.22,
};





export {
  BLADE_OF_HEIR_MUSIC_BED,
  BLADE_OF_HEIR_ALT_MUSIC_BED,
  CAPTAIN_BLADE_OF_HEIR_MUSIC_BED,
  QUEEN_MUSIC_BED,
};

export const MUSIC_BEDS: Readonly<Record<string, MusicBed>> = {
  [MUSIC_BED.id]: MUSIC_BED,
  [COURTLY_INTRIGUE_II_MUSIC_BED.id]: COURTLY_INTRIGUE_II_MUSIC_BED,
  [COURTLY_INTRIGUE_III_MUSIC_BED.id]: COURTLY_INTRIGUE_III_MUSIC_BED,
  [FIRST_BLADE_MUSIC_BED.id]: FIRST_BLADE_MUSIC_BED,
  [CAPTAIN_MUSIC_BED.id]: CAPTAIN_MUSIC_BED,
  [BLADE_OF_HEIR_MUSIC_BED.id]: BLADE_OF_HEIR_MUSIC_BED,
  [BLADE_OF_HEIR_ALT_MUSIC_BED.id]: BLADE_OF_HEIR_ALT_MUSIC_BED,
  [CAPTAIN_BLADE_OF_HEIR_MUSIC_BED.id]: CAPTAIN_BLADE_OF_HEIR_MUSIC_BED,
  [QUEEN_MUSIC_BED.id]: QUEEN_MUSIC_BED,
};

export const LAB_ONLY_BOSS_SCORING: ReadonlySet<string> = new Set([


]);

export const DEFAULT_BOSS_BED = BLADE_OF_HEIR_MUSIC_BED;

const BOSS_MUSIC_BEDS: Readonly<Record<string, MusicBed>> = {
  captain: CAPTAIN_BLADE_OF_HEIR_MUSIC_BED,
  captain_read: CAPTAIN_BLADE_OF_HEIR_MUSIC_BED,
  first_blade: FIRST_BLADE_MUSIC_BED,
  siege_10: BLADE_OF_HEIR_ALT_MUSIC_BED,
  siege_10_paced: BLADE_OF_HEIR_ALT_MUSIC_BED,
  eternal_siege: BLADE_OF_HEIR_ALT_MUSIC_BED,
  chancellor: BLADE_OF_HEIR_MUSIC_BED,
  queen: QUEEN_MUSIC_BED,
};

export const bossMusicBedForEncounter = (encounterId: string): MusicBed | null =>
  BOSS_MUSIC_BEDS[encounterId] ?? null;

export const bossMusicBedForArchetype = (archetype: string): MusicBed | null =>
  BOSS_MUSIC_BEDS[archetype] ?? null;

export const COURTLY_TAKES: readonly MusicBed[] = [
  MUSIC_BED,
  COURTLY_INTRIGUE_II_MUSIC_BED,
  COURTLY_INTRIGUE_III_MUSIC_BED,
];

let courtlyTake: MusicBed | null = null;

let drawIndex: () => number = () => Math.floor(Math.random() * COURTLY_TAKES.length);

export const setCourtlyDraw = (draw: () => number): void => {
  drawIndex = draw;
  courtlyTake = null;
};

export const forgetCourtlyTake = (): void => {
  courtlyTake = null;
};

export const labMusicBedForEncounter = (encounterId: string): MusicBed => {
  const boss = BOSS_MUSIC_BEDS[encounterId];
  if (boss !== undefined) {
    courtlyTake = null;
    return boss;
  }
  if (musicBedForEncounter(encounterId) !== MUSIC_BED) return musicBedForEncounter(encounterId);
  courtlyTake ??= COURTLY_TAKES[Math.min(COURTLY_TAKES.length - 1, Math.max(0, drawIndex()))];
  return courtlyTake;
};
