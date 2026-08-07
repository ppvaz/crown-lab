
import type { SimEvent } from '../sim/types';
import { FORGED_SAMPLES, PUBLIC_MUSIC } from './asset-registry';

export type AudioCue =
  | 'light'
  | 'heavy'
  | 'hit'
  | 'parry'
  | 'guard'
  | 'telegraph'
  | 'unparryable'
  | 'step'
  | 'stagger'
  | 'death'
  | 'player_hurt'
  | 'slowmo'
  | 'power'
  | 'power_hit'
  | 'roar'
  | 'wave';

export const ALL_CUES: AudioCue[] = [
  'light',
  'heavy',
  'hit',
  'parry',
  'guard',
  'telegraph',
  'unparryable',
  'step',
  'stagger',
  'death',
  'player_hurt',
  'slowmo',
  'power',
  'power_hit',
  'roar',
  'wave',
];

export const cueForEvent = (event: SimEvent): AudioCue | null => {
  switch (event.type) {
    case 'attack_started':
      return event.data?.attack === 'heavy' ? 'heavy' : 'light';
    case 'hit_landed':
      return 'hit';
    case 'parry_success':
      return 'parry';
    case 'guard_success':
    case 'enemy_blocked':
      return 'guard';
    case 'enemy_parried':
      return 'parry';
    case 'hit_received':
    case 'guard_broken':
      return 'player_hurt';
    case 'enemy_telegraph':
      return event.data?.parryable === false ? 'unparryable' : 'telegraph';
    case 'enemy_staggered':
      return 'stagger';
    case 'enemy_died':
      return 'death';
    case 'step_started':
      return 'step';
    case 'wave_spawned':
    case 'boss_fight_started':
    case 'enemy_summoned':
      return 'wave';
    case 'boss_intro_landed':
    case 'projectile_impact':
      return 'heavy';
    case 'boss_intro_roar_started':
    case 'boss_phase_roar_started':
      return 'roar';
    case 'power_used':
      return 'power';
    case 'power_hit':
      return 'power_hit';
    case 'pickup_taken':
      return 'power';
    default:
      return null;
  }
};

export const ESSENTIAL_CUES: ReadonlySet<AudioCue> = new Set<AudioCue>([
  'parry',
  'telegraph',
  'unparryable',
  'player_hurt',
  'roar',
]);

export interface TonalLayer {
  freq: number;
  toFreq: number;
  durationMs: number;
  gain: number;
  type: OscillatorType;
}

export interface TransientLayer {
  gain: number;
  freq: number;
  durationMs: number;
}

export interface CueDef {
  material: string | null;
  transient: TransientLayer | null;
  tonal: TonalLayer | null;
}

export const CUES: Record<AudioCue, CueDef> = {
  light: {
    material: 'light.ogg',
    transient: null,
    tonal: { freq: 420, toFreq: 260, durationMs: 90, gain: 0.14, type: 'triangle' },
  },
  heavy: {
    material: 'heavy.ogg',
    transient: null,
    tonal: { freq: 190, toFreq: 90, durationMs: 190, gain: 0.24, type: 'sawtooth' },
  },
  hit: {
    material: 'hit.ogg',
    transient: { gain: 0.26, freq: 900, durationMs: 70 },
    tonal: null,
  },
  ['parry']: {
    material: 'parry.ogg',
    transient: null,
    tonal: { freq: 880, toFreq: 1500, durationMs: 180, gain: 0.28, type: 'triangle' },
  },
  guard: {
    material: 'guard.ogg',
    transient: { gain: 0.14, freq: 400, durationMs: 80 },
    tonal: { freq: 240, toFreq: 180, durationMs: 90, gain: 0.16, type: 'square' },
  },
  ['telegraph']: {
    material: null,
    transient: null,
    tonal: { freq: 150, toFreq: 210, durationMs: 150, gain: 0.11, type: 'sine' },
  },
  unparryable: {
    material: 'unparryable.ogg',
    transient: null,
    tonal: { freq: 110, toFreq: 70, durationMs: 260, gain: 0.2, type: 'sawtooth' },
  },
  step: {
    material: 'step.ogg',
    transient: { gain: 0.04, freq: 600, durationMs: 50 },
    tonal: null,
  },
  ['stagger']: {
    material: 'stagger.ogg',
    transient: null,
    tonal: { freq: 320, toFreq: 520, durationMs: 240, gain: 0.18, type: 'triangle' },
  },
  death: {
    material: 'death.ogg',
    transient: null,
    tonal: { freq: 260, toFreq: 60, durationMs: 420, gain: 0.24, type: 'sawtooth' },
  },
  player_hurt: {
    material: 'player_hurt.ogg',
    transient: { gain: 0.22, freq: 300, durationMs: 120 },
    tonal: { freq: 200, toFreq: 80, durationMs: 300, gain: 0.26, type: 'sawtooth' },
  },
  slowmo: {
    material: 'slowmo.ogg',
    transient: null,
    tonal: { freq: 700, toFreq: 180, durationMs: 500, gain: 0.16, type: 'sine' },
  },
  power: {
    material: 'power.ogg',
    transient: null,
    tonal: { freq: 320, toFreq: 900, durationMs: 220, gain: 0.2, type: 'sawtooth' },
  },
  ['power_hit']: {
    material: 'power_hit.ogg',
    transient: { gain: 0.2, freq: 1200, durationMs: 90 },
    tonal: null,
  },
  roar: {
    material: null,
    transient: { gain: 0.36, freq: 155, durationMs: 380 },
    tonal: { freq: 105, toFreq: 42, durationMs: 900, gain: 0.3, type: 'sawtooth' },
  },
  wave: {
    material: 'wave.ogg',
    transient: null,
    tonal: { freq: 130, toFreq: 190, durationMs: 600, gain: 0.18, type: 'sine' },
  },
};

export interface MaterialPack {
  id: string;
  description: string;
  urls: Partial<Record<AudioCue, string>>;
}

export const packUrlsFrom = (
  samples: Readonly<Record<string, string>>,
  cues: readonly AudioCue[] = ALL_CUES,
): Partial<Record<AudioCue, string>> =>
  Object.fromEntries(
    cues
      .filter((c) => CUES[c].material !== null && samples[CUES[c].material as string] !== undefined)
      .map((c) => [c, samples[CUES[c].material as string]]),
  );

export const EMPTY_MATERIAL_PACK: MaterialPack = {
  id: 'none',
  description: 'Synthesis only.',
  urls: {},
};

export const PUBLIC_MATERIAL: MaterialPack = {
  id: 'forged',
  description: '',
  urls: packUrlsFrom(FORGED_SAMPLES),
};

export const DEFAULT_MATERIAL_PACK = 'forged';


export interface MusicBed {
  id: string;
  url: string;
  gain: number;
}

export const MUSIC_FADE_MS = 900;

export const MUSIC_OPEN_HZ = 20000;

export const MUSIC_STAGGER_HZ = 400;

export const MUSIC_STAGGER_ATTACK_MS = 60;

export const MUSIC_STAGGER_RELEASE_MS = 350;

export const MUSIC_BED: MusicBed = {
  id: 'bgm-06',
  url: PUBLIC_MUSIC['bgm-06.webm'],
  gain: 0.22,
};

export const FIRST_BLADE_MUSIC_BED: MusicBed = {
  id: 'bgm-08',
  url: PUBLIC_MUSIC['bgm-08.webm'],
  gain: 0.22,
};


export const BLADE_OF_HEIR_MUSIC_BED: MusicBed = {
  id: 'bgm-03',
  url: PUBLIC_MUSIC['bgm-03.webm'],
  gain: 0.26,
};

export const BLADE_OF_HEIR_ALT_MUSIC_BED: MusicBed = {
  id: 'bgm-02',
  url: PUBLIC_MUSIC['bgm-02.webm'],
  gain: 0.17,
};

export const CAPTAIN_BLADE_OF_HEIR_MUSIC_BED: MusicBed = {
  id: 'bgm-02-throne',
  url: PUBLIC_MUSIC['bgm-02.webm'],
  gain: 0.35,
};

export const QUEEN_MUSIC_BED: MusicBed = {
  id: 'bgm-01',
  url: PUBLIC_MUSIC['bgm-01.webm'],
  gain: 0.16,
};

const BOSS_MUSIC_BEDS: Readonly<Record<string, MusicBed>> = {
  first_blade: FIRST_BLADE_MUSIC_BED,
  captain: CAPTAIN_BLADE_OF_HEIR_MUSIC_BED,
  chancellor: BLADE_OF_HEIR_MUSIC_BED,
  siege_10: BLADE_OF_HEIR_ALT_MUSIC_BED,
  queen: QUEEN_MUSIC_BED,

};

export const musicBedForEncounter = (encounterId: string): MusicBed =>
  BOSS_MUSIC_BEDS[encounterId] ?? MUSIC_BED;
