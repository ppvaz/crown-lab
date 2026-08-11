
import { ISO_Z } from './mesh';
import { MESH_KING_BELL } from './cast/king-bell-mesh-lab';
import { POLISHED_FIRST_BLADE } from './cast/first-blade';
import { MESH_DUELIST } from './cast/duelist-mesh-lab';
import { MESH_GLASS_REGENT } from './cast/glass-regent-mesh-lab';
import type { AttackPhases, BodyClipRole } from './mesh-clips-lab';

export type CastMeshId = 'player' | 'guard' | 'first_blade' | 'duelist' | 'archer' | 'glass_regent';

export interface CastMeshSpec {
  id: CastMeshId;
  glb: string;
  heightPx: number;
  forwardFacing?: number;
  bodyTopFraction?: number;
  hover?: {
    lift: number;
    breath: number;
    sway: number;
  };
  clipNames?: Partial<Record<BodyClipRole, readonly string[]>>;
  attackPhases?: AttackPhases;
  sockets?: {
    weapon?: string;
    shield?: string;
  };
}

export const heightUnits = (spec: CastMeshSpec): number => spec.heightPx / ISO_Z;

export const bodyScale = (spec: CastMeshSpec, bindHeight: number): number =>
  heightUnits(spec) / (bindHeight * (spec.bodyTopFraction ?? 1));

export const modelTopUnits = (spec: CastMeshSpec): number =>
  heightUnits(spec) / (spec.bodyTopFraction ?? 1);

export const CAST_MESHES: Readonly<Record<CastMeshId, CastMeshSpec>> = {
  player: {
    id: 'player',
    glb: '/assets-cast/king/king.cmb',
    heightPx: MESH_KING_BELL.heightPx,
    clipNames: {
      attackLight: ['left_slash', 'slash', 'attack'],
      attackHeavy: ['attack'],
      power: ['power'],
    },
  },

  guard: {
    id: 'guard',
    glb: '/assets-cast/guard/guard.cmb',
    heightPx: 52,
    bodyTopFraction: 0.72895,
    clipNames: { run: ['walking'] },
  },

  first_blade: {
    id: 'first_blade',
    glb: '/assets-cast/first_blade/first_blade.cmb',
    heightPx: POLISHED_FIRST_BLADE.heightPx,
    clipNames: { run: ['walking'] },
  },

  duelist: {
    id: 'duelist',
    glb: '/assets-cast/duelist/duelist.cmb',
    heightPx: MESH_DUELIST.heightPx,
    clipNames: { run: ['walking'] },
  },

  archer: {
    id: 'archer',
    glb: '/assets-cast/archer/archer.cmb',
    heightPx: 42,
    clipNames: { run: ['walking'] },
  },

  glass_regent: {
    id: 'glass_regent',
    glb: '/assets-cast/glass_regent/glass_regent.cmb',
    heightPx: MESH_GLASS_REGENT.heightPx,
    hover: { lift: 0.8, breath: 0.16, sway: 0.13 },
    clipNames: {
      idle: ['hit_reaction_with_bow'],
      walk: ['hit_reaction_with_bow'],
      run: ['hit_reaction_with_bow'],
      step: ['hit_reaction_with_bow'],
      attackHeavy: ['shield_push'],
      parry: ['block10'],
      roar: ['left_slash'],
    },
  },
};

export const CAST_MESH_IDS: readonly CastMeshId[] =
  ['player', 'guard', 'first_blade', 'duelist', 'archer', 'glass_regent'];
