
import { TRIANGLES, bufferViewBytes, parseGlb, readAccessor } from './glb-lab';
import type { Gltf } from './glb-lab';

export const toRuntimeAxes = (
  gx: number, gy: number, gz: number,
): { x: number; y: number; elevation: number } => ({ x: gx, y: -gz, elevation: gy });

export type BodyChannel = 'translation' | 'rotation' | 'scale';

export interface BodyTrack {
  joint: number;
  path: BodyChannel;
  time: Float32Array;
  value: Float32Array;
  stride: number;
  step: boolean;
}

export interface BodyClip {
  name: string;
  durationSec: number;
  tracks: BodyTrack[];
}

export interface BodySkeleton {
  names: string[];
  parent: Int32Array;
  order: Int32Array;
  restT: Float32Array;
  restR: Float32Array;
  restS: Float32Array;
  jointNode: Int32Array;
  inverseBind: Float32Array;
}

export interface MeshBody {
  pos: Float32Array;
  nrm: Float32Array;
  uv: Float32Array;
  joint: Uint8Array;
  weight: Float32Array;
  index: Uint32Array;
  vertexCount: number;
  triangleCount: number;
  skeleton: BodySkeleton;
  clips: BodyClip[];
  albedo: { bytes: Uint8Array; mime: string } | null;
  bindHeight: number;
  bindFoot: number;

  forwardFacing?: number;

  forwardEvidence?: string;

  clipRoles?: Readonly<Record<string, number>>;
}

export interface MeshBodySource {
  glb: string;
}


const identityRow = (out: Float32Array, at: number): void => {
  for (let i = 0; i < 16; i++) out[at + i] = i % 5 === 0 ? 1 : 0;
};

const readSkeleton = (json: Gltf, bin: Uint8Array, skinIndex: number): BodySkeleton => {
  const skin = json.skins?.[skinIndex];
  if (skin === undefined) throw new Error(`no skin ${skinIndex}`);

  const parent = new Int32Array(json.nodes.length).fill(-1);
  json.nodes.forEach((node, index) => {
    for (const child of node.children ?? []) {
      if (parent[child] !== -1) throw new Error(`node ${child} has two parents`);
      parent[child] = index;
    }
  });

  const needed = new Set<number>();
  for (const joint of skin.joints) {
    for (let at = joint; at !== -1 && !needed.has(at); at = parent[at]) needed.add(at);
  }

  const depthOf = (index: number): number => {
    let depth = 0;
    for (let at = parent[index]; at !== -1; at = parent[at]) depth++;
    return depth;
  };
  const order = Int32Array.from([...needed].sort((a, b) => depthOf(a) - depthOf(b) || a - b));

  const names: string[] = [];
  const restT = new Float32Array(json.nodes.length * 3);
  const restR = new Float32Array(json.nodes.length * 4);
  const restS = new Float32Array(json.nodes.length * 3);
  json.nodes.forEach((node, index) => {
    names.push(node.name ?? `node${index}`);
    if (node.matrix !== undefined) {
      throw new Error(`node ${node.name ?? index} carries a matrix; only TRS is read here`);
    }
    const t = node.translation ?? [0, 0, 0];
    const r = node.rotation ?? [0, 0, 0, 1];
    const s = node.scale ?? [1, 1, 1];
    restT.set(t, index * 3);
    restR.set(r, index * 4);
    restS.set(s, index * 3);
  });

  const jointNode = Int32Array.from(skin.joints);
  const inverseBind = new Float32Array(jointNode.length * 16);
  if (skin.inverseBindMatrices === undefined) {
    for (let j = 0; j < jointNode.length; j++) identityRow(inverseBind, j * 16);
  } else {
    const values = readAccessor(json, bin, skin.inverseBindMatrices);
    if (values.length !== jointNode.length * 16) {
      throw new Error(`skin has ${jointNode.length} joints and ${values.length / 16} bind matrices`);
    }
    inverseBind.set(values);
  }

  return { names, parent, order, restT, restR, restS, jointNode, inverseBind };
};


const CHANNEL_STRIDE: Readonly<Record<string, number>> = {
  translation: 3, rotation: 4, scale: 3,
};

const readClips = (json: Gltf, bin: Uint8Array, skeleton: BodySkeleton): BodyClip[] => {
  const jointOfNode = new Map<number, number>();
  skeleton.jointNode.forEach((node, joint) => jointOfNode.set(node, joint));

  return (json.animations ?? []).map((animation, index) => {
    const tracks: BodyTrack[] = [];
    let durationSec = 0;
    for (const channel of animation.channels) {
      const stride = CHANNEL_STRIDE[channel.target.path];
      if (stride === undefined || channel.target.node === undefined) continue;
      const joint = jointOfNode.get(channel.target.node);
      if (joint === undefined) continue;
      const sampler = animation.samplers[channel.sampler];
      const interpolation = sampler.interpolation ?? 'LINEAR';
      if (interpolation === 'CUBICSPLINE') {
        throw new Error(`clip ${animation.name ?? index} uses CUBICSPLINE, which is not read here`);
      }
      const time = readAccessor(json, bin, sampler.input);
      const value = readAccessor(json, bin, sampler.output);
      if (value.length !== time.length * stride) {
        throw new Error(`clip ${animation.name ?? index} has a sampler of mismatched length`);
      }
      durationSec = Math.max(durationSec, time[time.length - 1] ?? 0);
      tracks.push({
        joint,
        path: channel.target.path as BodyChannel,
        time: Float32Array.from(time),
        value: Float32Array.from(value),
        stride,
        step: interpolation === 'STEP',
      });
    }
    return { name: animation.name ?? `clip${index}`, durationSec, tracks };
  });
};


export const buildMeshBody = (glb: ArrayBuffer): MeshBody => {
  const { json, bin } = parseGlb(glb);

  const skinnedNode = json.nodes.find((node) => node.mesh !== undefined && node.skin !== undefined);
  if (skinnedNode?.mesh === undefined || skinnedNode.skin === undefined) {
    throw new Error('the GLB holds no skinned mesh');
  }
  const skeleton = readSkeleton(json, bin, skinnedNode.skin);
  const clips = readClips(json, bin, skeleton);

  const mesh = json.meshes[skinnedNode.mesh];
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const joint: number[] = [];
  const weight: number[] = [];
  const index: number[] = [];
  let albedo: MeshBody['albedo'] = null;
  let bindTop = -Infinity;
  let bindFoot = Infinity;

  for (const primitive of mesh.primitives) {
    if ((primitive.mode ?? TRIANGLES) !== TRIANGLES) {
      throw new Error('the king has a primitive that is not triangles');
    }
    const { POSITION, NORMAL, TEXCOORD_0, JOINTS_0, WEIGHTS_0 } = primitive.attributes;
    for (const [name, accessor] of Object.entries({ POSITION, NORMAL, JOINTS_0, WEIGHTS_0 })) {
      if (accessor === undefined) throw new Error(`the king's mesh has no ${name}`);
    }
    const positions = readAccessor(json, bin, POSITION);
    const normals = readAccessor(json, bin, NORMAL);
    const uvs = TEXCOORD_0 === undefined ? null : readAccessor(json, bin, TEXCOORD_0);
    const joints = readAccessor(json, bin, JOINTS_0);
    const weights = readAccessor(json, bin, WEIGHTS_0);
    const count = positions.length / 3;

    const base = pos.length / 3;
    for (let v = 0; v < count; v++) {
      pos.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
      bindTop = Math.max(bindTop, positions[v * 3 + 1]);
      bindFoot = Math.min(bindFoot, positions[v * 3 + 1]);

      const nx = normals[v * 3];
      const ny = normals[v * 3 + 1];
      const nz = normals[v * 3 + 2];
      const length = Math.hypot(nx, ny, nz) || 1;
      nrm.push(nx / length, ny / length, nz / length);

      uv.push(uvs === null ? 0 : uvs[v * 2], uvs === null ? 0 : uvs[v * 2 + 1]);

      let sum = 0;
      for (let i = 0; i < 4; i++) sum += weights[v * 4 + i];
      const scale = sum > 1e-6 ? 1 / sum : 0;
      for (let i = 0; i < 4; i++) {
        joint.push(joints[v * 4 + i]);
        weight.push(scale === 0 ? (i === 0 ? 1 : 0) : weights[v * 4 + i] * scale);
      }
    }

    if (primitive.indices === undefined) {
      for (let i = 0; i < count; i++) index.push(base + i);
    } else {
      const indices = readAccessor(json, bin, primitive.indices);
      for (let i = 0; i < indices.length; i++) index.push(base + indices[i]);
    }

    if (albedo === null && primitive.material !== undefined) {
      albedo = readAlbedo(json, bin, primitive.material);
    }
  }

  if (index.length % 3 !== 0) throw new Error(`the king has ${index.length} indices`);

  return {
    pos: new Float32Array(pos),
    nrm: new Float32Array(nrm),
    uv: new Float32Array(uv),
    joint: Uint8Array.from(joint),
    weight: new Float32Array(weight),
    index: Uint32Array.from(index),
    vertexCount: pos.length / 3,
    triangleCount: index.length / 3,
    skeleton,
    clips,
    albedo,
    bindHeight: Math.max(1e-6, bindTop - bindFoot),
    bindFoot,
  };
};

const readAlbedo = (json: Gltf, bin: Uint8Array, material: number): MeshBody['albedo'] => {
  const source = json.materials?.[material] as
    { pbrMetallicRoughness?: { baseColorTexture?: { index: number } } } | undefined;
  const textureIndex = source?.pbrMetallicRoughness?.baseColorTexture?.index;
  if (textureIndex === undefined) return null;
  const image = json.images?.[json.textures?.[textureIndex]?.source ?? -1];
  if (image?.bufferView === undefined) return null;
  return {
    bytes: bufferViewBytes(json, bin, image.bufferView),
    mime: image.mimeType ?? 'image/png',
  };
};

export const buildMeshBodyFromCmb = (buffer: ArrayBuffer): MeshBody => {
  const bytes = new Uint8Array(buffer);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== 'CMB1') throw new Error(`not a baked body: ${magic}`);

  const jsonLen = new DataView(buffer).getUint32(4, true);
  const head = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + jsonLen)));
  const base = 8 + jsonLen;

  const view = <T>(Ctor: new (b: ArrayBuffer, o: number, n: number) => T, at: {at: number; len: number}, per: number): T =>
    new Ctor(buffer, base + at.at, at.len / per);

  const f32 = (at: {at: number; len: number}): Float32Array => view(Float32Array, at, 4);
  const i32 = (at: {at: number; len: number}): Int32Array => view(Int32Array, at, 4);


  const dequantPos = (at: { at: number; len: number; min: number[]; scale: number[] }): Float32Array => {
    const q = view(Int16Array, at, 2);
    const out = new Float32Array(q.length);
    for (let i = 0; i < q.length; i += 3) {
      for (let c = 0; c < 3; c++) out[i + c] = (q[i + c] + 32767) * at.scale[c] + at.min[c];
    }
    return out;
  };
  const dequantUnit = (
    q: Int8Array | Int16Array | Uint8Array | Uint16Array,
    range: number,
  ): Float32Array => {
    const out = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) out[i] = q[i] / range;
    return out;
  };

  const s = head.skeleton;
  const skeleton: BodySkeleton = {
    names: Array.from({ length: s.nodeCount }, (_, i) => `n${i}`),
    parent: i32(s.parent),
    order: i32(s.order),
    restT: f32(s.restT),
    restR: f32(s.restR),
    restS: f32(s.restS),
    jointNode: i32(s.jointNode),
    inverseBind: f32(s.inverseBind),
  };

  const roleOf = new Map<number, string>();
  for (const [role, index] of Object.entries(head.roles as Record<string, number>)) {
    if (!roleOf.has(index)) roleOf.set(index, role);
  }

  const clips: BodyClip[] = head.clips.map((clip: any, index: number) => ({
    name: roleOf.get(index) ?? `c${index}`,
    durationSec: clip.durationSec,
    tracks: clip.tracks.map((track: any) => ({
      joint: track.joint,
      path: track.path,
      stride: track.stride,
      step: track.step,
      time: f32(track.time),
      value: track.value.q === 'i16'
        ? dequantUnit(view(Int16Array, track.value, 2), 32767)
        : f32(track.value),
    })),
  }));

  const weight = dequantUnit(view(Uint8Array, head.weight, 1), 255);
  for (let v = 0; v < weight.length; v += 4) {
    const sum = weight[v] + weight[v + 1] + weight[v + 2] + weight[v + 3];
    const scale = sum > 1e-6 ? 1 / sum : 0;
    for (let c = 0; c < 4; c++) weight[v + c] *= scale;
  }

  return {
    pos: dequantPos(head.pos),
    nrm: dequantUnit(view(Int8Array, head.nrm, 1), 127),
    uv: dequantUnit(view(Uint16Array, head.uv, 2), 65535),
    joint: view(Uint8Array, head.joint, 1),
    weight,
    index: Uint32Array.from(view(Uint16Array, head.index, 2)),
    vertexCount: head.vertexCount,
    triangleCount: head.triangleCount,
    skeleton,
    clips,
    albedo:
      head.albedo === null
        ? null
        : { bytes: view(Uint8Array, head.albedo, 1), mime: head.albedo.mime },
    bindHeight: head.bindHeight,
    bindFoot: head.bindFoot,
    forwardFacing: head.forwardFacing ?? undefined,
    forwardEvidence: head.forwardEvidence ?? undefined,
    clipRoles: head.roles ?? undefined,
  };
};

export const loadMeshBody = async (
  source: MeshBodySource,
  onFailure: (reason: string) => void,
): Promise<MeshBody | null> => {
  try {
    const response = await fetch(source.glb);
    if (!response.ok) return (onFailure(`king mesh ${response.status}`), null);
    const buffer = await response.arrayBuffer();
    const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
    return magic === 'CMB1' ? buildMeshBodyFromCmb(buffer) : buildMeshBody(buffer);
  } catch (error) {
    onFailure(error instanceof Error ? error.message : String(error));
    return null;
  }
};
