
import { FORGED_SAMPLES } from './asset-registry';
import type { RoomMeshSource } from './room-mesh-lab';

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

export const HOLLOW_SAMPLES: Readonly<Record<string, string>> = {
  'light.ogg': new URL('../assets/audio/hollow/light.ogg', import.meta.url).href,
  'heavy.ogg': new URL('../assets/audio/hollow/heavy.ogg', import.meta.url).href,
  'hit.ogg': new URL('../assets/audio/hollow/hit.ogg', import.meta.url).href,
  'parry.ogg': new URL('../assets/audio/hollow/parry.ogg', import.meta.url).href,
  'guard.ogg': new URL('../assets/audio/hollow/guard.ogg', import.meta.url).href,
  'unparryable.ogg': new URL('../assets/audio/hollow/unparryable.ogg', import.meta.url).href,
  'step.ogg': new URL('../assets/audio/hollow/step.ogg', import.meta.url).href,
  'stagger.ogg': new URL('../assets/audio/hollow/stagger.ogg', import.meta.url).href,
  'death.ogg': new URL('../assets/audio/hollow/death.ogg', import.meta.url).href,
  'player_hurt.ogg': new URL('../assets/audio/hollow/player_hurt.ogg', import.meta.url).href,
  'power.ogg': new URL('../assets/audio/hollow/power.ogg', import.meta.url).href,
  'power_hit.ogg': new URL('../assets/audio/hollow/power_hit.ogg', import.meta.url).href,
  'wave.ogg': new URL('../assets/audio/hollow/wave.ogg', import.meta.url).href,
  'slowmo.ogg': new URL('../assets/audio/hollow/slowmo.ogg', import.meta.url).href,
};

export const TEMPERED_SAMPLES: Readonly<Record<string, string>> = {
  'light.ogg': new URL('../assets/audio/tempered/light.ogg', import.meta.url).href,
  'heavy.ogg': new URL('../assets/audio/tempered/heavy.ogg', import.meta.url).href,
  'hit.ogg': new URL('../assets/audio/tempered/hit.ogg', import.meta.url).href,
  'parry.ogg': new URL('../assets/audio/tempered/parry.ogg', import.meta.url).href,
  'guard.ogg': new URL('../assets/audio/tempered/guard.ogg', import.meta.url).href,
  'unparryable.ogg': new URL('../assets/audio/tempered/unparryable.ogg', import.meta.url).href,
  'step.ogg': new URL('../assets/audio/tempered/step.ogg', import.meta.url).href,
  'stagger.ogg': new URL('../assets/audio/tempered/stagger.ogg', import.meta.url).href,
  'death.ogg': new URL('../assets/audio/tempered/death.ogg', import.meta.url).href,
  'player_hurt.ogg': new URL('../assets/audio/tempered/player_hurt.ogg', import.meta.url).href,
  'power.ogg': new URL('../assets/audio/tempered/power.ogg', import.meta.url).href,
  'power_hit.ogg': new URL('../assets/audio/tempered/power_hit.ogg', import.meta.url).href,
  'wave.ogg': new URL('../assets/audio/tempered/wave.ogg', import.meta.url).href,
  'slowmo.ogg': new URL('../assets/audio/tempered/slowmo.ogg', import.meta.url).href,
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
  liquid: true,
} as const satisfies RoomMeshSource;

export const KERNEL_GUARD_MESH = {
  glb: new URL('../assets/rooms/kernel-guard/mesh/kernel_guard.glb', import.meta.url).href,
  manifest: new URL('../assets/rooms/kernel-guard/mesh/room-mesh.json', import.meta.url).href,
  textures: [
    {
      url: new URL('../assets/rooms/kernel-guard/textures/wall-ashlar-albedo-v1.webp', import.meta.url).href,
      materials: ['guard-stone', 'guard-coping', 'guard-slab'],
      worldSize: [5, 2.25],
      strength: 0.96,
      tint: [0.40, 0.52, 0.82],
    },
    {
      url: new URL('../assets/rooms/kernel-guard/textures/floor-flagstone-albedo-v1.webp', import.meta.url).href,
      materials: ['guard-floor'],
      worldSize: [5.4, 5.4],
      strength: 0.72,
    },
    {
      url: new URL('../assets/rooms/kernel-guard/textures/wood-planks-albedo-v1.webp', import.meta.url).href,
      materials: ['guard-wood'],
      worldSize: [5.6, 5.6],
      strength: 0.65,
    },
  ],
} as const satisfies RoomMeshSource;

export const KERNEL_DUELIST_MESH = {
  glb: new URL('../assets/rooms/kernel-duelist/mesh/kernel_duelist.glb', import.meta.url).href,
  manifest: new URL('../assets/rooms/kernel-duelist/mesh/room-mesh.json', import.meta.url).href,
  textures: [
    {
      url: new URL('../assets/rooms/kernel-duelist/textures/wall-ashlar-albedo-v2.webp', import.meta.url).href,
      materials: ['duel-stone', 'duel-coping', 'duel-slab'],
      worldSize: [5, 2.25],
      strength: 0.96,
      tint: [0.40, 0.52, 0.82],
    },
    {
      url: new URL('../assets/rooms/kernel-duelist/textures/floor-diagonal-albedo-v2.webp', import.meta.url).href,
      materials: ['duel-floor'],
      worldSize: [5.4, 5.4],
      strength: 0.72,
    },
  ],
} as const satisfies RoomMeshSource;

export const LAB_ROOM_MESHES: Readonly<Record<string, RoomMeshSource>> = {
  concept_lantern_cloister_live: LANTERN_CLOISTER_MESH,
  kernel_guard: KERNEL_GUARD_MESH,
  kernel_duelist: KERNEL_DUELIST_MESH,
};

export const KING_MESH = {
  glb: '/assets-cast/king/king.cmb',
} as const;

export const LAB_AUDIO_MANIFEST: readonly string[] = [
  ...Object.values(FORGED_SAMPLES_LAB),
  ...Object.values(ARCANE_SAMPLES),
  ...Object.values(HOLLOW_SAMPLES),
  ...Object.values(TEMPERED_SAMPLES),
  ...Object.values(LAB_MUSIC),
];

export const LAB_BLOCKING_AUDIO: readonly string[] = [
  ...Object.values(FORGED_SAMPLES_LAB),
  ...Object.values(ARCANE_SAMPLES),
  ...Object.values(HOLLOW_SAMPLES),
  ...Object.values(TEMPERED_SAMPLES),
];
