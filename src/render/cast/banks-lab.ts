
import type { ModelBank, ModelDef } from '../models';
import { DEFAULT_MODELS } from './index-lab';

import type { Mesh } from '../mesh';
import { box as meshBox, merge } from '../mesh';
import { MESH_DUELIST } from './duelist-mesh-lab';
import { MESH_ELITE_GUARD } from './elite-guard-mesh-lab';
import { MESH_GUARD } from './guard-mesh-lab';
import { MESH_GUARD_CONCEPT } from './guard-concept-mesh-lab';
import { MESH_KING_BELL } from './king-bell-mesh-lab';
import { MESH_PIKE_NOVICE } from './pike-novice-mesh-lab';
import { MESH_THORN_MARSHAL } from './thorn-marshal-mesh-lab';
import { MESH_GLASS_REGENT } from './glass-regent-mesh-lab';
import { MESH_QUEEN } from './queen-mesh-lab';


const pillar = (heightPx: number): ModelDef => ({
  id: 'pillar',
  heightPx,
  widthScale: 1.05,
  shapes: [
    {
      kind: 'poly',
      points: [
        [-0.55, 0],
        [-0.4, 1],
        [0.4, 1],
        [0.55, 0],
      ],
      fill: 'tint',
      stroke: 'outline',
      width: 2,
    },
  ],
});



const meshArcher = (): Mesh =>
  merge(
    meshBox([-0.34, -0.24, 0], [0.34, 0.24, 1.05], 'tint'),
    meshBox([-0.28, -0.22, 1.05], [0.28, 0.22, 1.34], 'tint'),
    meshBox([0.38, -0.05, 0.15], [0.48, 0.05, 1.2], 'projectile', 'weapon'),
  );

const meshFirstBlade = (): Mesh =>
  merge(
    meshBox([-0.62, -0.36, 0], [0.62, 0.36, 1.5], 'tint'),
    meshBox([-0.32, -0.28, 1.5], [0.32, 0.28, 1.78], 'tint'),
    meshBox([-1.45, -0.06, 0.72], [1.45, 0.08, 0.86], 'hudText', 'weapon'),
  );

const meshModel = (id: string, height: number, mesh: Mesh): ModelDef => ({
  id,
  heightPx: height * 30,
  widthScale: 1,
  shapes: [],
  mesh,
});

const createMeshBank = (): ModelBank => ({
  id: 'mesh',
  description: 'Real 3D meshes — they turn, self-occlude, and show facing from any angle.',
  models: {
    player: MESH_KING_BELL,
    guard: MESH_GUARD_CONCEPT,
    duelist: MESH_DUELIST,
    archer: meshModel('mesh_archer', 1.7, meshArcher()),
    first_blade: meshModel('mesh_first_blade', 1.8, meshFirstBlade()),
    captain: pillar(56),
    captain_read: pillar(56),
    rain_boss: pillar(56),
    chancellor: pillar(56),
    elite_guard: MESH_ELITE_GUARD,
    pike_novice: MESH_PIKE_NOVICE,
    pike_boss: pillar(56),
    thorn_marshal: MESH_THORN_MARSHAL,
    queen: MESH_QUEEN,
    glass_regent: MESH_GLASS_REGENT,
    mesh_guard: MESH_GUARD,
  },
});

export const MODEL_BANKS: Record<string, ModelBank> = /* @__PURE__ */ (() => ({
  silhouette: DEFAULT_MODELS,
  mesh: createMeshBank(),
}))();
