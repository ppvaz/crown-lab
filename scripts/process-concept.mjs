
import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { flag, valueArg } from './lib/args.mjs';
import { validateConceptManifest } from './lib/concept-plan.mjs';
import { pngSize } from './lib/png.mjs';

const root = resolve(import.meta.dirname, '..');
const manifestRelative = valueArg('manifest', '.crown-private/concept-art/manifest.json');
const manifest = JSON.parse(await readFile(resolve(root, manifestRelative), 'utf8'));
const problems = validateConceptManifest(manifest);
if (problems.length > 0) fail(problems.map((p) => `${p.id}.${p.field}: ${p.reason}`).join('\n'));

const id = valueArg('id', '');
const entry = manifest.entries[id];
if (!entry) fail(`no concept called "${id}" in ${manifestRelative}`);
const wire = flag('wire');
if (wire && !flag('approve')) fail('--wire requires --approve; approval is the design review gate');

const stagingRelative = `.crown-private/concept-art/staging/${id}.png`;
const inputRelative = valueArg('input', wire ? stagingRelative : '');
if (!inputRelative) fail(`--input=<generated.png> is required`);
const input = resolve(root, inputRelative);
const bytes = await readFile(input);
const raster = pngSize(bytes);
if (raster.width < 512 || raster.height < 512) fail(`${inputRelative} is ${raster.width}x${raster.height}; concept sheets must be at least 512x512`);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const stagedRecord = wire && inputRelative === stagingRelative
  ? await readJson(resolve(root, `.crown-private/concept-art/staging/${id}.json`), null)
  : null;
const provenance = {
  ...entry.provenance,
  ...(stagedRecord?.provenance ?? {}),
  ...argumentProvenance(),
};

if (!wire) {
  const staging = resolve(root, stagingRelative);
  await atomicCopy(input, staging, true);
  await atomicJson(resolve(root, `.crown-private/concept-art/staging/${id}.json`), record('review', stagingRelative));
  console.log(`ingested ${id}: ${raster.width}x${raster.height}, sha256 ${sha256}`);
  console.log(`review ${stagingRelative}`);
  const replacing = await exists(resolve(root, entry.output)) ? ' --force' : '';
  console.log(`wire with: npm run concept:wire -- --id=${id} --approve${replacing}`);
} else {
  const output = resolve(root, entry.output);
  if (input !== output || !(await exists(output))) await atomicCopy(input, output, flag('force'));
  entry.status = 'approved';
  entry.provenance = provenance;
  await atomicJson(resolve(root, manifestRelative), manifest);
  const approved = record('approved', entry.output);
  const recordRelative = `.crown-private/concept-art/records/${id}.json`;
  await atomicJson(resolve(root, recordRelative), approved);

  const registryPath = resolve(root, '.crown-private/concept-art/registry.json');
  const registry = await readJson(registryPath, { version: 1, entries: {} });
  registry.entries[id] = {
    kind: entry.kind,
    title: entry.title,
    asset: entry.output,
    record: recordRelative,
    handoff: entry.downstream.handoff,
    sha256,
    width: raster.width,
    height: raster.height,
    panels: entry.panels.map((panel) => ({ id: panel.id, order: panel.order, state: panel.state })),
  };
  await atomicJson(registryPath, registry);
  await atomicJson(resolve(root, entry.downstream.handoff), {
    version: 1,
    conceptId: id,
    kind: entry.kind,
    approvedAsset: entry.output,
    target: entry.downstream.target,
    pipeline: entry.downstream.pipeline,
    sources: entry.sources,
    panels: entry.panels,
    ...(entry.character ? { character: entry.character } : {}),
    ...(entry.prop ? { prop: entry.prop } : {}),
    ...(entry.room ? { room: entry.room } : {}),
  });
  console.log(`wired ${id} -> ${entry.downstream.pipeline}:${entry.downstream.target}`);
  console.log(`private registry: .crown-private/concept-art/registry.json`);
  console.log(`handoff: ${entry.downstream.handoff}`);
}

function record(status, asset) {
  return {
    version: 1, id, kind: entry.kind, status, asset, sha256,
    raster, prompt: entry.prompt, provenance,
    panels: entry.panels, downstream: entry.downstream,
  };
}

function argumentProvenance() {
  const names = {
    service: 'service', modelVersion: 'model-version', generationId: 'generation-id',
    generatedAt: 'generated-at', licence: 'licence', evidence: 'evidence',
  };
  return Object.fromEntries(Object.entries(names)
    .map(([field, arg]) => [field, valueArg(arg, '')])
    .filter(([, value]) => value !== ''));
}

async function atomicCopy(from, to, overwrite) {
  if (!overwrite && await exists(to)) fail(`${to.slice(root.length + 1)} exists; pass --force to replace it`);
  await mkdir(dirname(to), { recursive: true });
  const part = `${to}.part`;
  await copyFile(from, part);
  await rename(part, to);
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const part = `${path}.part`;
  await writeFile(part, `${JSON.stringify(value, null, 2)}\n`);
  await rename(part, path);
}

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
