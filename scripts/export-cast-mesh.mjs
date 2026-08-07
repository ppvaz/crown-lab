
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { pngEncode, pngPixels } from './lib/png.mjs';
import { valueArg } from './lib/args.mjs';

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const expandHome = (path) =>
  path.startsWith('~/') ? resolve(homedir(), path.slice(2)) : resolve(path);

const parseGlb = (buffer) => {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('not a GLB (bad magic)');
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
  if (json === null || bin === null) throw new Error('GLB is missing a chunk');
  return { json, bin };
};

const downsample = (image, size) => {
  const out = Buffer.alloc(size * size * 3);
  const sx = image.width / size;
  const sy = image.height / size;
  for (let y = 0; y < size; y += 1) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < size; x += 1) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let v = y0; v < y1 && v < image.height; v += 1) {
        for (let u = x0; u < x1 && u < image.width; u += 1) {
          const [pr, pg, pb] = image.at(u, v);
          r += pr; g += pg; b += pb; n += 1;
        }
      }
      const i = (y * size + x) * 3;
      out[i] = Math.round(r / n);
      out[i + 1] = Math.round(g / n);
      out[i + 2] = Math.round(b / n);
    }
  }
  return out;
};

const replaceBufferView = (json, bin, index, bytes) => {
  const views = json.bufferViews;
  const order = views.map((_, i) => i).sort((a, b) => (views[a].byteOffset ?? 0) - (views[b].byteOffset ?? 0));
  const parts = [];
  let offset = 0;
  for (const i of order) {
    const view = views[i];
    const payload = i === index ? bytes : bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const pad = (4 - (offset % 4)) % 4;
    if (pad > 0) {
      parts.push(Buffer.alloc(pad));
      offset += pad;
    }
    view.byteOffset = offset;
    view.byteLength = payload.length;
    parts.push(Buffer.from(payload));
    offset += payload.length;
  }
  const tail = (4 - (offset % 4)) % 4;
  if (tail > 0) parts.push(Buffer.alloc(tail));
  const newBin = Buffer.concat(parts);
  json.buffers = [{ byteLength: newBin.length }];

  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + newBin.length, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(CHUNK_JSON, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(newBin.length, 0);
  binHeader.writeUInt32LE(CHUNK_BIN, 4);

  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, newBin]);
};

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

const verify = (source, rebuilt) => {
  const problems = [];
  const { json, bin } = parseGlb(rebuilt);

  for (const [index, accessor] of json.accessors.entries()) {
    if (accessor.bufferView === undefined) continue;
    const view = json.bufferViews[accessor.bufferView];
    const size = COMPONENT_BYTES[accessor.componentType] * TYPE_COMPONENTS[accessor.type];
    const end = (accessor.byteOffset ?? 0) + accessor.count * size;
    if (end > view.byteLength) {
      problems.push(`accessor ${index} reads ${end} bytes of a ${view.byteLength}-byte view`);
    }
    if ((view.byteOffset ?? 0) + view.byteLength > bin.length) {
      problems.push(`bufferView ${accessor.bufferView} runs past the end of the binary chunk`);
    }
  }

  const positionsOf = (parsed) => {
    const primitive = parsed.json.meshes[0].primitives[0];
    const accessor = parsed.json.accessors[primitive.attributes.POSITION];
    const view = parsed.json.bufferViews[accessor.bufferView];
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return parsed.bin.subarray(start, start + accessor.count * 12);
  };
  const before = positionsOf(parseGlb(source));
  const after = positionsOf({ json, bin });
  if (!before.equals(after)) {
    problems.push('vertex positions changed, and nothing here should touch geometry');
  }

  return problems;
};

const main = () => {
  const body = valueArg('body', 'king');
  const sourceDir = expandHome(valueArg('source', '~/Downloads/Meshy_AI_Crowned_King_biped'));
  const size = Number(valueArg('texture', '512'));
  const outDir = resolve(import.meta.dirname, `../assets-cast/${body}`);

  if (!/^[a-z][a-z0-9_-]*$/.test(body)) {
    console.error(`--body=${body} is not an id; it becomes a directory and a route.`);
    process.exit(1);
  }

  if (!existsSync(sourceDir)) {
    console.error(`No source directory at ${sourceDir}`);
    console.error('Pass --source=<dir> with the generator\'s .glb files in it.');
    process.exit(1);
  }
  if (!Number.isInteger(size) || size < 64 || size > 4096) {
    console.error(`--texture=${size} is not a sensible square size`);
    process.exit(1);
  }

  const files = readdirSync(sourceDir).filter((name) => name.toLowerCase().endsWith('.glb'));
  const candidates = files
    .map((name) => ({ name, path: resolve(sourceDir, name) }))
    .map((file) => {
      const { json } = parseGlb(readFileSync(file.path));
      return { ...file, clips: (json.animations ?? []).length };
    })
    .sort((a, b) => b.clips - a.clips);
  if (candidates.length === 0) {
    console.error(`No .glb files in ${sourceDir}`);
    process.exit(1);
  }
  const chosen = candidates[0];
  if (chosen.clips < 2) {
    console.warn(`! ${chosen.name} carries ${chosen.clips} clip(s) — is this the merged-animations export?`);
  }
  for (const skipped of candidates.slice(1)) {
    console.log(`  skipping ${skipped.name} (${skipped.clips} clips — the mesh is in the chosen file)`);
  }

  const original = readFileSync(chosen.path);
  const { json, bin } = parseGlb(original);

  const material = json.materials?.[0];
  const textureIndex = material?.pbrMetallicRoughness?.baseColorTexture?.index;
  const imageIndex = textureIndex === undefined ? undefined : json.textures?.[textureIndex]?.source;
  const image = imageIndex === undefined ? undefined : json.images?.[imageIndex];

  mkdirSync(outDir, { recursive: true });
  const outFile = resolve(outDir, `${body}.glb`);

  if (image?.bufferView === undefined) {
    console.warn('! no embedded base-colour texture found — copying the file through unchanged');
    copyFileSync(chosen.path, outFile);
  } else {
    const view = json.bufferViews[image.bufferView];
    const encoded = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const decoded = pngPixels(Buffer.from(encoded));
    console.log(`  albedo ${decoded.width}x${decoded.height}, ${kb(encoded.length)}`);
    if (decoded.width <= size && decoded.height <= size) {
      console.log(`  already at or under ${size} — left alone`);
      copyFileSync(chosen.path, outFile);
    } else {
      const rgb = downsample(decoded, size);
      const smaller = pngEncode({ width: size, height: size, rgb });
      const rebuilt = replaceBufferView(json, bin, image.bufferView, smaller);
      writeFileSync(outFile, rebuilt);
      console.log(`  albedo -> ${size}x${size}, ${kb(smaller.length)}`);
    }
  }

  const written = readFileSync(outFile);
  const problems = verify(original, written);
  if (problems.length > 0) {
    console.error('\nThe rebuilt file does not hold together:');
    for (const problem of problems) console.error(`  ✖ ${problem}`);
    process.exit(1);
  }

  const finalSize = written.length;
  console.log(`\n${chosen.name}`);
  console.log(`  ${kb(original.length)} -> ${kb(finalSize)}  (${(100 * finalSize / original.length).toFixed(0)}%)`);
  console.log(`  clips: ${(json.animations ?? []).map((a) => a.name).join(', ')}`);
  console.log(`\nwrote ${outFile}`);
  console.log(`Served in dev at /assets-cast/${body}/${body}.glb — never in a build.`);
  console.log(`Its entry in render/cast-meshes-lab.ts must name that exact route.`);
};

main();
