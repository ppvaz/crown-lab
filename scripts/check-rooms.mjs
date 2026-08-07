import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';

import { pngSize } from './lib/png.mjs';
import { validateRoomPackage } from './lib/room-package.mjs';

const root = resolve(import.meta.dirname, '..');

const strArg = (name, fallback) => {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : fallback;
};

const roomsDir = resolve(root, strArg('dir', 'src/assets/rooms'));
const contractsDir = resolve(root, 'tools/blender/contracts');
const referencesDir = resolve(root, 'tools/blender/references');

let referenceFailures = 0;
if (existsSync(referencesDir)) {
  for (const file of (await readdir(referencesDir)).filter((f) => f.endsWith('.json'))) {
    const ref = JSON.parse(await readFile(join(referencesDir, file), 'utf8'));
    const contractPath = join(contractsDir, `${ref.room}.json`);
    if (!existsSync(contractPath)) {
      console.error(`✖ references/${file}: no camera contract for "${ref.room}"`);
      referenceFailures += 1;
      continue;
    }
    const contract = JSON.parse(await readFile(contractPath, 'utf8'));
    if (ref.cameraContract?.contentHash !== contract.contentHash) {
      console.log(
        `· references/${file}: made against contract ${ref.cameraContract?.contentHash}, ` +
          `current is ${contract.contentHash}. The camera moved under it, so its framing is stale ` +
          '— its palette and materials are not. Re-run `npm run rooms:reference -- --write`.',
      );
    }
    if (ref.projection && ref.projection.readableForGeometry === false && ref.standing !== 'look-only') {
      console.error(
        `✖ references/${file}: standing is "${ref.standing}", but the measured projection ` +
          'says the room\'s geometry cannot be read off it. Run `npm run rooms:reference`.',
      );
      referenceFailures += 1;
    }
  }
}

if (existsSync(roomsDir)) {
  for (const entry of (await readdir(roomsDir, { withFileTypes: true })).filter((e) => e.isDirectory())) {
    const meshManifest = join(roomsDir, entry.name, 'mesh', 'room-mesh.json');
    if (!existsSync(meshManifest)) continue;
    const mesh = JSON.parse(await readFile(meshManifest, 'utf8'));
    const contractPath = join(contractsDir, `${mesh.room}.json`);
    if (!existsSync(contractPath)) continue;
    const contract = JSON.parse(await readFile(contractPath, 'utf8'));
    if (mesh.cameraContract?.contentHash !== contract.contentHash) {
      console.log(
        `· ${entry.name}/mesh: baked against contract ${mesh.cameraContract?.contentHash}, ` +
          `current is ${contract.contentHash}. Re-run \`npm run rooms:mesh\`.`,
      );
    }
  }
}

const noPackages = () => {
  console.log('No room packages yet — nothing to check.');
  process.exit(referenceFailures > 0 ? 1 : 0);
};

if (!existsSync(roomsDir)) noPackages();

const entries = (await readdir(roomsDir, { withFileTypes: true })).filter((e) => e.isDirectory());
if (entries.length === 0) noPackages();

let failures = referenceFailures;
let checked = 0;

const packageDirs = [];
for (const entry of entries) {
  const dir = join(roomsDir, entry.name);
  if (existsSync(join(dir, 'room-package.json'))) {
    packageDirs.push(dir);
    continue;
  }
  const versions = (await readdir(dir, { withFileTypes: true })).filter((v) => v.isDirectory());
  const withManifest = versions
    .map((v) => join(dir, v.name))
    .filter((v) => existsSync(join(v, 'room-package.json')));
  if (withManifest.length === 0) {
    if (versions.some((v) => existsSync(join(dir, v.name, 'room-mesh.json')))) continue;
    console.error(
      `✖ ${relative(root, dir)}: holds neither a room-package.json nor a room-mesh.json`,
    );
    failures += 1;
    continue;
  }
  packageDirs.push(...withManifest);
}

for (const dir of packageDirs) {
  const manifestPath = join(dir, 'room-package.json');

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const contractPath = join(contractsDir, `${manifest.id}.json`);
  if (!existsSync(contractPath)) {
    console.error(
      `✖ ${relative(root, dir)}: no camera contract for "${manifest.id}" — run \`npm run rooms:camera\``,
    );
    failures += 1;
    continue;
  }
  const contract = JSON.parse(await readFile(contractPath, 'utf8'));

  /** @type {Record<string, {width: number, height: number, colorType: number, bytes: number} | null>} */
  const found = {};
  for (const [name, file] of Object.entries(manifest.layers ?? {})) {
    const path = join(dir, file);
    if (!existsSync(path)) {
      found[name] = null;
      continue;
    }
    try {
      const buffer = await readFile(path);
      const { width, height, colorType } = pngSize(buffer);
      found[name] = { width, height, colorType, bytes: buffer.length };
    } catch (error) {
      console.error(`✖ ${relative(root, path)}: ${error.message}`);
      failures += 1;
      found[name] = null;
    }
  }

  const problems = validateRoomPackage(manifest, contract, found);
  checked += 1;
  const errors = problems.filter((p) => p.severity !== 'warning');
  const warnings = problems.filter((p) => p.severity === 'warning');
  if (errors.length === 0) {
    console.log(`✔ ${manifest.id}${warnings.length > 0 ? ` (${warnings.length} warning)` : ''}`);
  } else {
    failures += errors.length;
    console.error(`✖ ${manifest.id}`);
    for (const p of errors) console.error(`    [${p.code}] ${p.message}`);
  }
  for (const p of warnings) console.log(`    · [${p.code}] ${p.message}`);
}

if (failures > 0) {
  console.error(`\n${failures} problem(s) across ${checked} package(s).`);
  process.exit(1);
}
console.log(`${checked} room package(s) verified.`);
