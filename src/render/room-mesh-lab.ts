
import type { Arena, Vec2 } from '../sim/types';
import { arenaVertices } from '../sim/arena';
import { TRIANGLES, parseGlb, readAccessor } from './glb-lab';

export type RGB = readonly [number, number, number];

export interface Range {
  first: number;
  count: number;
}

export interface Mass {
  at: Vec2;
  range: Range;
  bounds: { min: Vec2; max: Vec2; top: number };
}

export interface Light {
  at: Vec2;
  elevation: number;
  colour: RGB;
  energy: number;
  lamp: number;
}

export type SurfaceKind = 'ashlar' | 'flagstone' | 'metal' | 'flame' | 'plain';

export interface SurfaceDescription {
  name?: string;
  kind: SurfaceKind;
  colour: RGB;
  joint?: RGB;
  block?: readonly [number, number];
  mortar?: number;
  texture?: {
    slot: number;
    worldSize: readonly [number, number];
    strength: number;
    tint: RGB;
  };
}

interface ManifestLight {
  name: string;
  lamp: string;
  at: { x: number; y: number };
  elevation: number;
  energy: number;
  colour: number[];
  size: number;
}

interface ManifestMass {
  name: string;
  layer: string;
  at: { x: number; y: number };
  bounds: { min: { x: number; y: number }; max: { x: number; y: number }; top: number };
}

export interface RoomMeshManifest {
  room: string;
  cameraContract: { contentHash: string };
  space: { yMirror: boolean; heightScale: number };
  projection: { isoX: number; isoY: number; elevationY: number; wallUnits: number };
  arena: { halfExtents?: { x: number; y: number }; vertices?: { x: number; y: number }[] };
  materials: Record<string, {
    kind: string;
    colour: number[];
    joint?: number[];
    block?: number[];
    mortar?: number;
    roughness?: number;
    strength?: number;
  }>;
  layers: Record<string, string[]>;
  masses: ManifestMass[];
  lights: ManifestLight[];
  ambient?: number[] | null;
  lightExposure?: number | null;
}

export interface RoomMeshSource {
  glb: string;
  manifest: string;
  liquid?: boolean;
  textures?: readonly {
    url: string;
    materials: readonly string[];
    worldSize: readonly [number, number];
    strength: number;
    tint?: RGB;
  }[];
}

export interface LoadedRoomMesh {
  pos: Float32Array;
  nrm: Float32Array;
  col: Float32Array;
  srf: Float32Array;
  behind: Range;
  masses: Mass[];
  massesRange: Range;
  lights: Light[];
  surfaces: SurfaceDescription[];
  ambient: RGB;
  lightExposure: number;
  manifest: RoomMeshManifest;
}


const KINDS: readonly SurfaceKind[] = ['ashlar', 'flagstone', 'metal', 'flame', 'plain'];

const rgb = (values: number[] | undefined, fallback: RGB): RGB =>
  values !== undefined && values.length >= 3 ? [values[0], values[1], values[2]] : fallback;

const arenaAgrees = (manifest: RoomMeshManifest, arena: Arena): string | null => {
  const baked = manifest.arena.vertices ?? null;
  const live = arenaVertices(arena);
  if (baked === null) {
    const half = manifest.arena.halfExtents;
    if (half === undefined) return 'the manifest states no arena';
    const wide = Math.max(...live.map((v) => Math.abs(v.x)));
    const tall = Math.max(...live.map((v) => Math.abs(v.y)));
    return Math.abs(wide - half.x) < 1e-3 && Math.abs(tall - half.y) < 1e-3
      ? null
      : `baked on ${half.x}x${half.y}, running on ${wide}x${tall}`;
  }
  if (baked.length !== live.length) {
    return `baked on ${baked.length} vertices, running on ${live.length}`;
  }
  for (let i = 0; i < baked.length; i++) {
    if (Math.abs(baked[i].x - live[i].x) > 1e-3 || Math.abs(baked[i].y - live[i].y) > 1e-3) {
      return `vertex ${i} baked at (${baked[i].x}, ${baked[i].y}), running at ` +
        `(${live[i].x}, ${live[i].y})`;
    }
  }
  return null;
};

export const buildRoomMesh = (
  glb: ArrayBuffer,
  manifest: RoomMeshManifest,
  onNote: (reason: string) => void = () => {},
): LoadedRoomMesh => {
  const { json, bin } = parseGlb(glb);
  const k = manifest.space.heightScale;
  if (!(k > 0)) throw new Error(`manifest height scale ${k} is not positive`);

  const names = Object.keys(manifest.materials).sort();
  const surfaces: SurfaceDescription[] = names.map((name) => {
    const described = manifest.materials[name];
    const kind = KINDS.find((candidate) => candidate === described.kind);
    if (kind === undefined) {
      onNote(`material ${name} has kind "${described.kind}", which this renderer has no case for`);
    }
    return {
      name,
      kind: kind ?? 'plain',
      colour: rgb(described.colour, [0.5, 0.5, 0.5]),
      joint: described.joint === undefined ? undefined : rgb(described.joint, [0, 0, 0]),
      block: described.block === undefined
        ? undefined
        : [described.block[0], described.block[1]] as const,
      mortar: described.mortar,
    };
  });
  const surfaceOf = new Map(names.map((name, index) => [name, index]));
  const LAMP_BASE = surfaces.length;

  const lampOfNode = new Map<string, number>();
  const lights: Light[] = manifest.lights.map((light, index) => {
    if (light.lamp !== '') lampOfNode.set(light.lamp, index);
    return {
      at: { x: light.at.x, y: light.at.y },
      elevation: light.elevation,
      colour: rgb(light.colour, [1, 0.8, 0.5]),
      energy: light.energy,
      lamp: light.lamp === '' ? -1 : index,
    };
  });

  const massByName = new Map(manifest.masses.map((mass) => [mass.name, mass]));
  const nodeIndexByName = new Map<string, number>();
  json.nodes.forEach((node, index) => {
    if (node.name !== undefined) nodeIndexByName.set(node.name, index);
  });

  const behindNames: string[] = [];
  for (const members of Object.values(manifest.layers)) {
    for (const name of members) if (!massByName.has(name)) behindNames.push(name);
  }
  const massNames = manifest.masses.map((mass) => mass.name);

  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const srf: number[] = [];

  const emitNode = (name: string): Range => {
    const first = pos.length / 3;
    const nodeIndex = nodeIndexByName.get(name);
    if (nodeIndex === undefined) throw new Error(`the manifest names ${name}, the mesh has no such node`);
    const node = json.nodes[nodeIndex];
    if (node.matrix !== undefined || node.translation !== undefined ||
        node.rotation !== undefined || node.scale !== undefined) {
      throw new Error(`node ${name} carries a transform, which is not read here`);
    }
    if (node.mesh === undefined) throw new Error(`node ${name} has no mesh`);
    const mesh = json.meshes[node.mesh];

    for (const primitive of mesh.primitives) {
      if ((primitive.mode ?? TRIANGLES) !== TRIANGLES) {
        throw new Error(`node ${name} has a primitive that is not triangles`);
      }
      const materialName = primitive.material === undefined
        ? undefined
        : json.materials?.[primitive.material]?.name;
      const described = materialName === undefined ? undefined : surfaceOf.get(materialName);
      if (described === undefined) {
        onNote(`node ${name} uses material "${materialName ?? '(none)'}", which the manifest does not describe`);
      }
      const material = described ?? 0;
      const surface = surfaces[material];

      let attribute = material;
      if (surface.kind === 'flame') {
        const lamp = lampOfNode.get(name);
        if (lamp === undefined) {
          onNote(`node ${name} is painted with a flame no light names — its body cannot react`);
        } else {
          attribute = LAMP_BASE + lamp;
        }
      }

      const positions = readAccessor(json, bin, primitive.attributes.POSITION);
      const normals = primitive.attributes.NORMAL === undefined
        ? null
        : readAccessor(json, bin, primitive.attributes.NORMAL);
      if (normals === null) throw new Error(`node ${name} has a primitive without normals`);
      const indices = primitive.indices === undefined
        ? null
        : readAccessor(json, bin, primitive.indices);
      const count = indices === null ? positions.length / 3 : indices.length;
      if (count % 3 !== 0) throw new Error(`node ${name} has a primitive of ${count} vertices`);

      const colour = surface.colour;
      const push = (vertex: number): void => {
        const p = vertex * 3;
        pos.push(positions[p], -positions[p + 1], positions[p + 2] / k);
        const nx = normals[p];
        const ny = -normals[p + 1];
        const nz = normals[p + 2] * k;
        const length = Math.hypot(nx, ny, nz) || 1;
        nrm.push(nx / length, ny / length, nz / length);
        col.push(colour[0], colour[1], colour[2]);
        srf.push(attribute);
      };
      for (let i = 0; i < count; i += 3) {
        const a = indices === null ? i : indices[i];
        const b = indices === null ? i + 1 : indices[i + 1];
        const c = indices === null ? i + 2 : indices[i + 2];
        push(a);
        push(c);
        push(b);
      }
    }
    return { first, count: pos.length / 3 - first };
  };

  const behindFrom = pos.length / 3;
  for (const name of behindNames) emitNode(name);
  const behind = { first: behindFrom, count: pos.length / 3 - behindFrom };

  const massesFrom = pos.length / 3;
  const masses: Mass[] = massNames.map((name) => {
    const record = massByName.get(name);
    if (record === undefined) throw new Error(`no mass record for ${name}`);
    return {
      at: { x: record.at.x, y: record.at.y },
      range: emitNode(name),
      bounds: {
        min: { x: record.bounds.min.x, y: record.bounds.min.y },
        max: { x: record.bounds.max.x, y: record.bounds.max.y },
        top: record.bounds.top,
      },
    };
  });
  const massesRange = { first: massesFrom, count: pos.length / 3 - massesFrom };

  return {
    pos: new Float32Array(pos),
    nrm: new Float32Array(nrm),
    col: new Float32Array(col),
    srf: new Float32Array(srf),
    behind,
    masses,
    massesRange,
    lights,
    surfaces,
    ambient: rgb(manifest.ambient ?? undefined, [0.03, 0.036, 0.058]),
    lightExposure:
      typeof manifest.lightExposure === 'number' && Number.isFinite(manifest.lightExposure) &&
      manifest.lightExposure >= 0
        ? manifest.lightExposure
        : 1,
    manifest,
  };
};

export const loadRoomMesh = async (
  source: RoomMeshSource,
  arena: Arena,
  onFailure: (reason: string) => void,
): Promise<LoadedRoomMesh | null> => {
  try {
    const [glbResponse, manifestResponse] = await Promise.all([
      fetch(source.glb),
      fetch(source.manifest),
    ]);
    if (!glbResponse.ok) return (onFailure(`mesh ${glbResponse.status}`), null);
    if (!manifestResponse.ok) return (onFailure(`manifest ${manifestResponse.status}`), null);
    const manifest = await manifestResponse.json() as RoomMeshManifest;
    const drift = arenaAgrees(manifest, arena);
    if (drift !== null) {
      onFailure(`baked on a different arena than the one running: ${drift} — re-run rooms:mesh`);
      return null;
    }
    const room = buildRoomMesh(await glbResponse.arrayBuffer(), manifest, (note) => {
      onFailure(note);
    });
    source.textures?.forEach((texture, slot) => {
      for (const material of texture.materials) {
        const surface = room.surfaces.find((candidate) => candidate.name === material);
        if (surface === undefined) {
          onFailure(`texture ${slot} names material "${material}", which the manifest does not describe`);
          continue;
        }
        surface.texture = {
          slot,
          worldSize: texture.worldSize,
          strength: texture.strength,
          tint: texture.tint ?? [1, 1, 1],
        };
      }
    });
    return room;
  } catch (error) {
    onFailure(error instanceof Error ? error.message : String(error));
    return null;
  }
};
