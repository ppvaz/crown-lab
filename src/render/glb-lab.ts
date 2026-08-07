
export interface Gltf {
  asset?: { version?: string; generator?: string };
  scene?: number;
  scenes?: { name?: string; nodes: number[] }[];
  nodes: {
    name?: string;
    mesh?: number;
    skin?: number;
    children?: number[];
    matrix?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
  }[];
  meshes: {
    name?: string;
    primitives: {
      attributes: Record<string, number>;
      indices?: number;
      material?: number;
      mode?: number;
    }[];
  }[];
  skins?: { name?: string; joints: number[]; skeleton?: number; inverseBindMatrices?: number }[];
  animations?: {
    name?: string;
    channels: { sampler: number; target: { node?: number; path: string } }[];
    samplers: { input: number; output: number; interpolation?: string }[];
  }[];
  materials?: { name?: string }[];
  textures?: { source?: number; sampler?: number }[];
  images?: { name?: string; mimeType?: string; bufferView?: number; uri?: string }[];
  accessors: {
    bufferView?: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
    min?: number[];
    max?: number[];
    sparse?: unknown;
  }[];
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  buffers: { byteLength: number; uri?: string }[];
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export const TRIANGLES = 4;

export const parseGlb = (data: ArrayBuffer): { json: Gltf; bin: Uint8Array } => {
  const view = new DataView(data);
  if (data.byteLength < 12 || view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error('not a GLB (bad magic)');
  }
  const version = view.getUint32(4, true);
  if (version !== 2) throw new Error(`GLB version ${version}, expected 2`);

  let json: Gltf | null = null;
  let bin: Uint8Array | null = null;
  let offset = 12;
  while (offset + 8 <= data.byteLength) {
    const length = view.getUint32(offset, true);
    const kind = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (kind === CHUNK_JSON) {
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(data, body, length))) as Gltf;
    } else if (kind === CHUNK_BIN) {
      bin = new Uint8Array(data, body, length);
    }
    offset = body + length + ((4 - (length % 4)) % 4);
  }
  if (json === null) throw new Error('GLB has no JSON chunk');
  if (bin === null) throw new Error('GLB has no BIN chunk');
  if (json.buffers.length !== 1 || json.buffers[0].uri !== undefined) {
    throw new Error('GLB must hold exactly one embedded buffer');
  }
  return { json, bin };
};

const COMPONENTS: Readonly<Record<string, number>> = {
  SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16,
};

export const readAccessor = (gltf: Gltf, bin: Uint8Array, index: number): Float64Array => {
  const accessor = gltf.accessors[index];
  if (accessor === undefined) throw new Error(`no accessor ${index}`);
  if (accessor.sparse !== undefined) throw new Error('sparse accessors are not read here');
  if (accessor.bufferView === undefined) throw new Error('accessor without a bufferView');
  const size = COMPONENTS[accessor.type];
  if (size === undefined) throw new Error(`accessor type ${accessor.type} is not read here`);
  const view = gltf.bufferViews[accessor.bufferView];
  if (view.byteStride !== undefined) throw new Error('interleaved bufferViews are not read here');

  const base = bin.byteOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const total = accessor.count * size;
  const out = new Float64Array(total);
  const buffer = bin.buffer;
  const source = ((): ArrayLike<number> => {
    switch (accessor.componentType) {
      case 5126: return new Float32Array(buffer, base, total);
      case 5125: return new Uint32Array(buffer, base, total);
      case 5123: return new Uint16Array(buffer, base, total);
      case 5121: return new Uint8Array(buffer, base, total);
      default: throw new Error(`component type ${accessor.componentType} is not read here`);
    }
  })();
  for (let i = 0; i < total; i++) out[i] = source[i];
  return out;
};

export const bufferViewBytes = (gltf: Gltf, bin: Uint8Array, index: number): Uint8Array => {
  const view = gltf.bufferViews[index];
  if (view === undefined) throw new Error(`no bufferView ${index}`);
  const start = (view.byteOffset ?? 0);
  return bin.slice(start, start + view.byteLength);
};
