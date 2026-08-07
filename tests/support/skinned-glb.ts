
export const invert4 = (m: ArrayLike<number>): Float64Array => {
  const a: number[][] = [];
  for (let row = 0; row < 4; row++) {
    const line: number[] = [];
    for (let col = 0; col < 4; col++) line.push(m[col * 4 + row]);
    for (let col = 0; col < 4; col++) line.push(col === row ? 1 : 0);
    a.push(line);
  }
  for (let col = 0; col < 4; col++) {
    let pivot = col;
    for (let row = col + 1; row < 4; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) throw new Error('singular matrix');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let k = 0; k < 8; k++) a[col][k] /= divisor;
    for (let row = 0; row < 4; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      if (factor === 0) continue;
      for (let k = 0; k < 8; k++) a[row][k] -= factor * a[col][k];
    }
  }
  const out = new Float64Array(16);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) out[col * 4 + row] = a[row][col + 4];
  }
  return out;
};

interface Trs {
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
}

export const composeTrs = (node: Trs): Float64Array => {
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const rotation = [
    1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qz * qw), 2 * (qx * qz - qy * qw),
    2 * (qx * qy - qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qx * qw),
    2 * (qx * qz + qy * qw), 2 * (qy * qz - qx * qw), 1 - 2 * (qx * qx + qy * qy),
  ];
  const scale = [sx, sy, sz];
  const out = new Float64Array(16);
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) out[col * 4 + row] = rotation[col * 3 + row] * scale[col];
  }
  out[12] = tx; out[13] = ty; out[14] = tz; out[15] = 1;
  return out;
};

export const multiply4 = (a: ArrayLike<number>, b: ArrayLike<number>): Float64Array => {
  const out = new Float64Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
};

export const quatAbout = (
  axis: [number, number, number],
  radians: number,
): [number, number, number, number] => {
  const length = Math.hypot(...axis) || 1;
  const half = radians / 2;
  const s = Math.sin(half) / length;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
};

interface BuiltGlb {
  glb: ArrayBuffer;
  bindGlobal: Float64Array[];
}

export interface SkinnedFixtureOptions {
  armatureScale?: number;
  clipRotation?: number;
  rawWeights?: boolean;
  withoutUv?: boolean;
}

export const buildSkinnedFixture = (options: SkinnedFixtureOptions = {}): BuiltGlb => {
  const armatureScale = options.armatureScale ?? 0.01;
  const clipRotation = options.clipRotation ?? Math.PI / 3;



  const up = 1 / armatureScale;
  const nodes = [
    { name: 'Armature', scale: [armatureScale, armatureScale, armatureScale], children: [1, 3] },
    { name: 'char', mesh: 0, skin: 0 },
    { name: 'bone_tip', translation: [0, up, 0] },
    { name: 'bone_root', translation: [0, 0, 0], children: [2] },
  ];

  const armature = composeTrs(nodes[0] as Trs);
  const root = multiply4(armature, composeTrs(nodes[3] as Trs));
  const tip = multiply4(root, composeTrs(nodes[2] as Trs));
  const bindGlobal = [root, tip];
  const joints = [2, 3];
  const inverseBind = [invert4(tip), invert4(root)];

  const positions = [
    0.2, 0, 0, -0.2, 0, 0,
    0.2, 2, 0, -0.2, 2, 0,
  ];
  const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
  const uvs = [0, 0, 1, 0, 0, 1, 1, 1];

  const jointIndices = [1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0];
  const weights = options.rawWeights === true
    ? [0.5, 0, 0, 0, 0.5, 0, 0, 0, 0.25, 0.25, 0, 0, 0.25, 0.25, 0, 0]
    : [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  const indices = [0, 1, 2, 2, 1, 3];

  const clipTime = [0, 1];
  const clipRot = [
    ...quatAbout([0, 0, 1], 0),
    ...quatAbout([0, 0, 1], clipRotation),
  ];
  const clipScaleTime = [0];
  const clipScale = [1, 1, 1];

  const chunks: { data: ArrayBufferView; align: number }[] = [];
  const bufferViews: Record<string, unknown>[] = [];
  const push = (data: ArrayBufferView): number => {
    chunks.push({ data, align: 4 });
    bufferViews.push({ buffer: 0, byteOffset: 0, byteLength: data.byteLength });
    return bufferViews.length - 1;
  };

  const bvPos = push(Float32Array.from(positions));
  const bvNrm = push(Float32Array.from(normals));
  const bvUv = push(Float32Array.from(uvs));
  const bvJoint = push(Uint8Array.from(jointIndices));
  const bvWeight = push(Float32Array.from(weights));
  const bvIndex = push(Uint16Array.from(indices));
  const bvIbm = push(Float32Array.from([...inverseBind[0], ...inverseBind[1]]));
  const bvClipTime = push(Float32Array.from(clipTime));
  const bvClipRot = push(Float32Array.from(clipRot));
  const bvScaleTime = push(Float32Array.from(clipScaleTime));
  const bvScale = push(Float32Array.from(clipScale));
  const bvImage = push(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]));

  const accessors: Record<string, unknown>[] = [
    { bufferView: bvPos, componentType: 5126, count: 4, type: 'VEC3',
      min: [-0.2, 0, 0], max: [0.2, 2, 0] },
    { bufferView: bvNrm, componentType: 5126, count: 4, type: 'VEC3' },
    { bufferView: bvUv, componentType: 5126, count: 4, type: 'VEC2' },
    { bufferView: bvJoint, componentType: 5121, count: 4, type: 'VEC4' },
    { bufferView: bvWeight, componentType: 5126, count: 4, type: 'VEC4' },
    { bufferView: bvIndex, componentType: 5123, count: 6, type: 'SCALAR' },
    { bufferView: bvIbm, componentType: 5126, count: 2, type: 'MAT4' },
    { bufferView: bvClipTime, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [1] },
    { bufferView: bvClipRot, componentType: 5126, count: 2, type: 'VEC4' },
    { bufferView: bvScaleTime, componentType: 5126, count: 1, type: 'SCALAR', min: [0], max: [0] },
    { bufferView: bvScale, componentType: 5126, count: 1, type: 'VEC3' },
  ];

  const attributes: Record<string, number> = {
    POSITION: 0, NORMAL: 1, JOINTS_0: 3, WEIGHTS_0: 4,
  };
  if (options.withoutUv !== true) attributes.TEXCOORD_0 = 2;

  const json = {
    asset: { version: '2.0', generator: 'crown-lab test fixture' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    meshes: [{ name: 'char', primitives: [{ attributes, indices: 5, material: 0 }] }],
    skins: [{ name: 'Armature', joints, inverseBindMatrices: 6 }],
    animations: [{
      name: 'Wave',
      channels: [
        { sampler: 0, target: { node: 2, path: 'rotation' } },
        { sampler: 1, target: { node: 2, path: 'scale' } },
      ],
      samplers: [
        { input: 7, output: 8, interpolation: 'LINEAR' },
        { input: 9, output: 10, interpolation: 'STEP' },
      ],
    }],
    materials: [{
      name: 'Material_1',
      pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
      emissiveFactor: [1, 1, 1],
    }],
    textures: [{ source: 0 }],
    images: [{ name: 'albedo', mimeType: 'image/png', bufferView: bvImage }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: 0 }],
  };

  let offset = 0;
  const parts: Uint8Array[] = [];
  chunks.forEach((chunk, i) => {
    const pad = (4 - (offset % 4)) % 4;
    if (pad > 0) {
      parts.push(new Uint8Array(pad));
      offset += pad;
    }
    (bufferViews[i] as { byteOffset: number }).byteOffset = offset;
    parts.push(new Uint8Array(chunk.data.buffer, chunk.data.byteOffset, chunk.data.byteLength));
    offset += chunk.data.byteLength;
  });
  const binLength = offset + ((4 - (offset % 4)) % 4);
  const bin = new Uint8Array(binLength);
  let at = 0;
  for (const part of parts) {
    bin.set(part, at);
    at += part.byteLength;
  }
  json.buffers[0].byteLength = binLength;

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadded = new Uint8Array(jsonBytes.byteLength + ((4 - (jsonBytes.byteLength % 4)) % 4));
  jsonPadded.fill(0x20);
  jsonPadded.set(jsonBytes);

  const total = 12 + 8 + jsonPadded.byteLength + 8 + bin.byteLength;
  const glb = new ArrayBuffer(total);
  const view = new DataView(glb);
  const bytes = new Uint8Array(glb);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonPadded.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(jsonPadded, 20);
  const binHeader = 20 + jsonPadded.byteLength;
  view.setUint32(binHeader, bin.byteLength, true);
  view.setUint32(binHeader + 4, 0x004e4942, true);
  bytes.set(bin, binHeader + 8);

  return { glb, bindGlobal };
};
