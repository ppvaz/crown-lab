
import type { CombatConfig, World } from '../sim/types';
import type { BodyClipRole } from '../render/mesh-clips-lab';
import { enemyClipDrive, playerClipDrive } from '../render/mesh-clips-lab';
import type { CastMeshBody } from '../render/mesh-webgl-lab';
import { createCastMeshBody } from '../render/mesh-webgl-lab';
import type { CastMeshId } from '../render/cast-meshes-lab';
import { CAPE_SWAY, CAPE_SWAY_ORDER } from '../render/cape-lab';
import type { CapeSway } from '../render/cape-lab';
import { CAST_MESHES, CAST_MESH_IDS } from '../render/cast-meshes-lab';
import { meshDownloadAllowed, setHeavyLoading } from '../render/heavy-assets';
import type { ShardMeshBody } from '../render/prop-mesh-webgl-lab';
import { createShardMeshBody } from '../render/prop-mesh-webgl-lab';
import type { Camera } from '../render/iso';
import type { Palette } from '../render/palette';
import type { Enemy, Player } from '../sim/types';

const bodies = new Map<CastMeshId, CastMeshBody>();
const attempted = new Set<CastMeshId>();
let enabled = false;

export const castMeshPending = new Set<CastMeshId>();

export interface CastMeshStatus {
  wanted: boolean;
  id: CastMeshId;
  ready: boolean;
  loading: boolean;
  clips: readonly string[];
  unbound: readonly BodyClipRole[];
  showing: { clip: string; role: BodyClipRole | 'override'; at: number } | null;
  triangleCount: number;
}

export interface CastMeshHost {
  world: () => World;
  combat: () => CombatConfig;
  saturation: () => number;
}

let host: CastMeshHost | null = null;

export const configureCastMesh = (next: CastMeshHost): void => {
  host = next;
};

const loadBody = (id: CastMeshId): CastMeshBody | null => {
  if (host === null) return null;
  const ready = bodies.get(id);
  if (ready !== undefined) return ready;
  if (attempted.has(id)) return null;
  attempted.add(id);
  castMeshPending.add(id);
  const spec = CAST_MESHES[id];
  const notes: string[] = [];
  void createCastMeshBody(spec, {
    world: host.world,
    combat: host.combat,
    saturation: host.saturation,
    capeSway: () => CAPE_SWAY[capeSway],
    drive: (world, subject, bank) =>
      id === 'player'
        ? playerClipDrive(world, subject as Player, host!.combat(), bank, spec.attackPhases)
        : enemyClipDrive(world, subject as Enemy, host!.combat(), bank, spec.attackPhases),
    onFailure: (reason) => void notes.push(reason),
  }).then((built) => {
    if (built !== null) bodies.set(id, built);
    castMeshPending.delete(id);
    if (castMeshPending.size === 0) setHeavyLoading('meshes', false);
    const drew = built !== null;
    for (const note of notes) {
      console.warn(`[cast] ${id}${drew ? ' drew, with a note' : ' is not drawn as a mesh'}: ${note}`);
    }
    if (!drew) {
      console.warn(`[cast] run \`npm run cast:mesh -- --body=${id}\` to bake it into assets-cast/`);
    }
  });
  return null;
};

const meshFor = (id: CastMeshId): CastMeshBody | null =>
  enabled ? loadBody(id) : null;

export const playerMeshBody = (): CastMeshBody | null => meshFor('player');

export const enemyMeshBody = (archetype: string): CastMeshBody | null =>
  archetype in CAST_MESHES ? meshFor(archetype as CastMeshId) : null;

let shardBody: ShardMeshBody | null = null;
let shardAttempted = false;

const loadShard = (): ShardMeshBody | null => {
  if (host === null) return null;
  if (shardBody !== null) return shardBody;
  if (shardAttempted) return null;
  shardAttempted = true;
  void createShardMeshBody({
    saturation: host.saturation,
    onFailure: (reason) => console.warn(`[cast] shard is not drawn as a mesh: ${reason}`),
  }).then((built) => {
    shardBody = built;
  });
  return null;
};

export const shotMeshBody = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  world: World,
  shot: World['projectiles'][number],
  pal: Palette,
): boolean => {
  if (!enabled || shot.shardIntegrity === undefined) return false;
  const body = loadShard();
  if (body === null) return false;
  const maxIntegrity = Math.max(1, shot.shardMaxIntegrity ?? 1);
  body.draw(ctx, cam, world, {
    id: shot.id,
    pos: shot.pos,
    vel: shot.vel,
    reflected: shot.reflected === true,
    spent: Math.max(0, maxIntegrity - shot.shardIntegrity),
    critical: shot.shardIntegrity <= 0,
  }, pal);
  return true;
};

export const warmCastMeshes = (): void => {
  if (!meshDownloadAllowed()) return;
  for (const id of CAST_MESH_IDS) loadBody(id);
};

export const setCastMeshEnabled = (next: boolean): void => {
  enabled = next;
};

export const meshDressingEnabled = (): boolean => enabled;

let capeSway: CapeSway = 'off';

export const castCapeSway = (): CapeSway => capeSway;

export const cycleCastCapeSway = (): CapeSway => {
  const at = CAPE_SWAY_ORDER.indexOf(capeSway);
  capeSway = CAPE_SWAY_ORDER[(at + 1) % CAPE_SWAY_ORDER.length];
  return capeSway;
};

export const castCapeFromSearch = (search: string): CapeSway => {
  const value = new URLSearchParams(search).get('cape')?.trim().toLowerCase() ?? '';
  return CAPE_SWAY_ORDER.find((arm) => arm === value) ?? 'off';
};

export const setCastCapeSway = (next: CapeSway): CapeSway => {
  capeSway = next;
  return capeSway;
};

export const castMeshFromSearch = (search: string): boolean => {
  const params = new URLSearchParams(search);
  if (!params.has('cast')) return true;
  const value = params.get('cast')?.trim().toLowerCase() ?? '';
  return value === '' || value === 'mesh' || value === '1' || value === 'on' || value === 'true';
};

export const castMeshDrawn = (): { meshes: number; triangles: number } => {
  let triangles = 0;
  for (const body of bodies.values()) triangles += body.triangleCount;
  return { meshes: bodies.size, triangles };
};

export const castMeshActors = (world: World): number => {
  if (!enabled) return 0;
  let count = bodies.has('player') ? world.players.length : 0;
  for (const enemy of world.enemies) {
    if (enemy.state.kind === 'dead') continue;
    if (bodies.has(enemy.archetype as CastMeshId)) count += 1;
  }
  return count;
};

export const castMeshStatus = (id: CastMeshId = 'player'): CastMeshStatus => {
  const body = bodies.get(id) ?? null;
  return {
    wanted: enabled,
    id,
    ready: body !== null,
    loading: castMeshPending.size > 0,
    clips: body?.clipNames ?? [],
    unbound: body?.unbound ?? [],
    showing: body?.showing() ?? null,
    triangleCount: body?.triangleCount ?? 0,
  };
};

export const browseCastClip = (id: CastMeshId, clip: number | null, at = 0): void => {
  bodies.get(id)?.override(clip, at);
};
