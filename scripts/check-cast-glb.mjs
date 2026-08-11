import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import process from 'node:process';

import { valueArg } from './lib/args.mjs';

const root = resolve(import.meta.dirname, '..');
const expandHome = (path) =>
  path.startsWith('~/') ? resolve(homedir(), path.slice(2)) : resolve(path);

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TRIANGLES = 4;

const parseGlb = (buffer) => {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('not a GLB (bad magic)');
  if (view.getUint32(4, true) !== 2) throw new Error(`GLB version ${view.getUint32(4, true)}, expected 2`);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= buffer.length) {
    const length = view.getUint32(offset, true);
    const kind = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (kind === CHUNK_JSON) json = JSON.parse(buffer.subarray(body, body + length).toString('utf8'));
    if (kind === CHUNK_BIN) bin = buffer.subarray(body, body + length);
    offset = body + length + ((4 - (length % 4)) % 4);
  }
  if (json === null) throw new Error('GLB has no JSON chunk');
  if (bin === null) throw new Error('GLB has no BIN chunk');
  return { json, bin };
};

const trsMatrix = (node) => {
  const t = node.translation ?? [0, 0, 0];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const s = node.scale ?? [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
    2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
    2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
};

const multiply = (a, b) => {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    }
  }
  return out;
};

const inspect = (path) => {
  const problems = [];
  const notes = [];
  const buffer = readFileSync(path);
  const { json, bin } = parseGlb(buffer);
  const binView = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);

  const readAccessor = (index) => {
    const accessor = json.accessors[index];
    if (accessor.sparse !== undefined) problems.push(`accessor ${index} is sparse`);
    if (accessor.bufferView === undefined) problems.push(`accessor ${index} has no bufferView`);
    const view = json.bufferViews[accessor.bufferView];
    if (view.byteStride !== undefined) {
      problems.push(`bufferView ${accessor.bufferView} is interleaved (byteStride ${view.byteStride})`);
    }
    const size = COMPONENTS[accessor.type];
    if (size === undefined) problems.push(`accessor ${index} type ${accessor.type} is not read`);
    if (BYTES[accessor.componentType] === undefined) {
      problems.push(`accessor ${index} component type ${accessor.componentType} is not read`);
    }
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const count = accessor.count * (size ?? 0);
    const out = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const at = start + i * BYTES[accessor.componentType];
      if (at + BYTES[accessor.componentType] > bin.length) {
        problems.push(`accessor ${index} reads past the end of the binary chunk`);
        break;
      }
      out[i] = accessor.componentType === 5126 ? binView.getFloat32(at, true)
        : accessor.componentType === 5125 ? binView.getUint32(at, true)
          : accessor.componentType === 5123 ? binView.getUint16(at, true)
            : bin[at];
    }
    return out;
  };

  if ((json.buffers ?? []).length !== 1) {
    problems.push(`${(json.buffers ?? []).length} buffers; the reader needs exactly one embedded`);
  }
  json.nodes.forEach((node, index) => {
    if (node.matrix !== undefined) {
      problems.push(`node ${node.name ?? index} carries a matrix; only TRS is read`);
    }
  });

  const skinned = json.nodes.filter((n) => n.mesh !== undefined && n.skin !== undefined);
  if (skinned.length === 0) problems.push('the GLB holds no skinned mesh');
  if (skinned.length > 1) {
    problems.push(`${skinned.length} skinned meshes; the reader takes the first and draws only that`);
  }
  if (skinned.length === 0) return { problems, notes, path };

  const node = skinned[0];
  const mesh = json.meshes[node.mesh];
  let vertices = 0;
  for (const primitive of mesh.primitives) {
    if ((primitive.mode ?? TRIANGLES) !== TRIANGLES) {
      problems.push(`a primitive is mode ${primitive.mode}, not TRIANGLES`);
    }
    for (const attribute of ['POSITION', 'NORMAL', 'JOINTS_0', 'WEIGHTS_0']) {
      if (primitive.attributes[attribute] === undefined) {
        problems.push(`a primitive has no ${attribute}`);
      }
    }
    if (primitive.attributes.TEXCOORD_0 === undefined) {
      notes.push('a primitive has no TEXCOORD_0 — it will draw untextured');
    }
    vertices += json.accessors[primitive.attributes.POSITION]?.count ?? 0;
  }
  const materials = new Set(mesh.primitives.map((p) => p.material));
  if (materials.size > 1) {
    problems.push(`${materials.size} materials on one body; only the first primitive's albedo is read`);
  }

  const skin = json.skins[node.skin];
  if (skin.inverseBindMatrices === undefined) {
    notes.push('no inverseBindMatrices — the reader falls back to identities');
  }
  const parent = new Int32Array(json.nodes.length).fill(-1);
  json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => { parent[c] = i; }));
  const globalOf = (index) => {
    let m = trsMatrix(json.nodes[index]);
    for (let at = parent[index]; at !== -1; at = parent[at]) m = multiply(trsMatrix(json.nodes[at]), m);
    return m;
  };

  let worstIdentity = 0;
  if (skin.inverseBindMatrices !== undefined) {
    const ibm = readAccessor(skin.inverseBindMatrices);
    if (ibm.length / 16 !== skin.joints.length) {
      problems.push(`${skin.joints.length} joints against ${ibm.length / 16} bind matrices`);
    }
    skin.joints.forEach((joint, index) => {
      const product = multiply(globalOf(joint), Array.from(ibm.slice(index * 16, index * 16 + 16)));
      for (let k = 0; k < 16; k++) {
        worstIdentity = Math.max(worstIdentity, Math.abs(product[k] - (k % 5 === 0 ? 1 : 0)));
      }
    });
    if (worstIdentity > 1e-3) {
      problems.push(
        `bind pose is not the identity (worst ${worstIdentity.toExponential(2)}) — ` +
        'bindHeight and bindFoot are then measuring a posed body',
      );
    }
  }

  for (const animation of json.animations ?? []) {
    for (const sampler of animation.samplers) {
      if (sampler.interpolation === 'CUBICSPLINE') {
        problems.push(`clip ${animation.name} uses CUBICSPLINE, which is not read`);
      }
    }
  }

  const positions = readAccessor(mesh.primitives[0].attributes.POSITION);
  let low = [Infinity, Infinity, Infinity];
  let high = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < positions.length / 3; v++) {
    for (let c = 0; c < 3; c++) {
      low[c] = Math.min(low[c], positions[v * 3 + c]);
      high[c] = Math.max(high[c], positions[v * 3 + c]);
    }
  }

  const image = json.images?.[0];
  const imageBytes = image?.bufferView !== undefined
    ? json.bufferViews[image.bufferView].byteLength : 0;
  if (image !== undefined && image.mimeType === 'image/jpeg') {
    notes.push('the albedo is a JPEG; `cast:mesh` decodes PNG only and will throw on a re-bake');
  }

  return {
    path,
    problems,
    notes,
    joints: skin.joints.length,
    vertices,
    clips: (json.animations ?? []).map((a) => a.name),
    bindHeight: high[1] - low[1],
    bindFoot: low[1],
    worstIdentity,
    bytes: buffer.length,
    imageBytes,
    images: (json.images ?? []).length,
  };
};

const file = valueArg('file', null);
const only = valueArg('body', null);
const targets = [];
if (file !== null) {
  targets.push(expandHome(file));
} else {
  const dir = resolve(root, 'assets-cast');
  if (!existsSync(dir)) {
    console.error(`No ${dir}. Nothing is baked on this machine; run cast:rig and cast:mesh first.`);
    process.exit(1);
  }


  const vault = resolve(root, '.crown-private/cast-source');
  for (const name of readdirSync(dir)) {
    if (only !== null && name !== only) continue;
    const baked = resolve(dir, name, `${name}.glb`);
    const recipe = resolve(vault, `${name}.glb`);
    if (existsSync(baked)) targets.push(baked);
    else if (existsSync(recipe)) targets.push(recipe);
    else console.log(`! ${name}: baked as .cmb, and no .glb recipe on this machine — not checked`);
  }
}

if (targets.length === 0) {
  console.error(only === null ? 'No baked bodies found.' : `No baked body named ${only}.`);
  process.exit(1);
}

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
let failed = 0;
for (const target of targets) {
  const name = target.split('/').slice(-1)[0];
  let result;
  try {
    result = inspect(target);
  } catch (error) {
    console.log(`\n✖ ${name}: ${error.message}`);
    failed += 1;
    continue;
  }
  const mark = result.problems.length === 0 ? '✓' : '✖';
  console.log(`\n${mark} ${name}  ${kb(result.bytes)} (${kb(result.imageBytes)} albedo, ${result.images} image(s))`);
  console.log(`   ${result.vertices} vertices over ${result.joints} joints`);
  console.log(`   bind height ${result.bindHeight.toFixed(4)}, soles at ${result.bindFoot.toFixed(4)}, ` +
    `bind-pose identity within ${result.worstIdentity.toExponential(1)}`);
  console.log(`   clips: ${result.clips.join(', ') || '(none)'}`);
  for (const note of result.notes) console.log(`   ! ${note}`);
  for (const problem of result.problems) console.log(`   ✖ ${problem}`);
  if (result.problems.length > 0) failed += 1;
}

const fromVault = targets.filter((t) => t.includes('/.crown-private/cast-source/')).length;
console.log(failed === 0
  ? `\n${targets.length} body(ies) match what render/glb-lab.ts and mesh-body-lab.ts accept.`
  : `\n${failed} of ${targets.length} would not load.`);
if (fromVault > 0) {
  console.log(`${fromVault} of them were checked as the vault .glb recipe, not the shipped .cmb — ` +
    'this tool cannot parse .cmb yet.');
}
process.exit(failed === 0 ? 0 : 1);
