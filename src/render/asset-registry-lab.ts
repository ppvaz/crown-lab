
import { FORGED_SAMPLES } from './asset-registry';

export const FORGED_SAMPLES_LAB: Readonly<Record<string, string>> = {
  ...FORGED_SAMPLES,
  'slowmo.ogg': new URL('../assets/audio/forged/slowmo.ogg', import.meta.url).href,
};

export const ARCANE_SAMPLES: Readonly<Record<string, string>> = {
  'light.ogg': new URL('../assets/audio/arcane/light.ogg', import.meta.url).href,
  'heavy.ogg': new URL('../assets/audio/arcane/heavy.ogg', import.meta.url).href,
  'hit.ogg': new URL('../assets/audio/arcane/hit.ogg', import.meta.url).href,
  'parry.ogg': new URL('../assets/audio/arcane/parry.ogg', import.meta.url).href,
  'guard.ogg': new URL('../assets/audio/arcane/guard.ogg', import.meta.url).href,
  'unparryable.ogg': new URL('../assets/audio/arcane/unparryable.ogg', import.meta.url).href,
  'step.ogg': new URL('../assets/audio/arcane/step.ogg', import.meta.url).href,
  'stagger.ogg': new URL('../assets/audio/arcane/stagger.ogg', import.meta.url).href,
  'death.ogg': new URL('../assets/audio/arcane/death.ogg', import.meta.url).href,
  'player_hurt.ogg': new URL('../assets/audio/arcane/player_hurt.ogg', import.meta.url).href,
  'power.ogg': new URL('../assets/audio/arcane/power.ogg', import.meta.url).href,
  'power_hit.ogg': new URL('../assets/audio/arcane/power_hit.ogg', import.meta.url).href,
  'wave.ogg': new URL('../assets/audio/arcane/wave.ogg', import.meta.url).href,
  'slowmo.ogg': new URL('../assets/audio/arcane/slowmo.ogg', import.meta.url).href,
};

export const LAB_MUSIC: Readonly<Record<string, string>> = {
  'bgm-04.webm': new URL('../assets/audio/music/bgm-04.webm', import.meta.url).href,
  'bgm-05.webm': new URL('../assets/audio/music/bgm-05.webm', import.meta.url).href,
  'bgm-07.webm': new URL('../assets/audio/music/bgm-07.webm', import.meta.url).href,
};

export interface RoomPackageSource {
  manifest: string;
  layers: Readonly<Record<string, string>>;
  occluders: Readonly<Record<string, string>>;
}

export const LAB_ROOM_PACKAGES: Readonly<Record<string, RoomPackageSource>> = {};

export const LANTERN_CLOISTER_MESH = {
  glb: new URL('../assets/rooms/concept-lantern-cloister/mesh/concept_lantern_cloister.glb', import.meta.url).href,
  manifest: new URL('../assets/rooms/concept-lantern-cloister/mesh/room-mesh.json', import.meta.url).href,
} as const;

export const LAB_ROOM_MESHES: Readonly<Record<string, typeof LANTERN_CLOISTER_MESH>> = {
  concept_lantern_cloister_live: LANTERN_CLOISTER_MESH,
};

export const KING_MESH = {
  glb: '/assets-cast/king/king.cmb',
} as const;

export const LAB_AUDIO_MANIFEST: readonly string[] = [
  ...Object.values(FORGED_SAMPLES_LAB),
  ...Object.values(ARCANE_SAMPLES),
  ...Object.values(LAB_MUSIC),
];

export const LAB_BLOCKING_AUDIO: readonly string[] = [
  ...Object.values(FORGED_SAMPLES_LAB),
  ...Object.values(ARCANE_SAMPLES),
];
