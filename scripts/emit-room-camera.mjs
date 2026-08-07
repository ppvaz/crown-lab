import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

import { loadSim } from './bundle-sim.mjs';

const root = resolve(import.meta.dirname, '..');

const strArg = (name, fallback) => {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : fallback;
};

const rooms = strArg('room', 'concept_lantern_cloister').split(',').filter(Boolean);
const draws = Number(strArg('draws', '4'));

const { cameraContract } = await loadSim('scripts/room-zoom.ts', 'room-zoom');

for (const room of rooms) {
  const contract = cameraContract(room, draws);

  const body = JSON.stringify(contract, null, 2);
  const contentHash = createHash('sha256').update(body).digest('hex').slice(0, 16);
  const stamped = { ...contract, contentHash };

  const out = resolve(root, `tools/blender/contracts/${room}.json`);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(stamped, null, 2)}\n`);

  const { raster, camera, budget } = contract;
  console.log(`${relative(root, out)}`);
  console.log(`  raster    ${raster.widthPx}x${raster.heightPx} @ scale ${raster.effectiveScale.toFixed(3)}`);
  console.log(`  driven by ${raster.drivenBy}`);
  console.log(`  push-in   ${camera.pushInCeiling.toFixed(2)}x (${camera.shortestReachArchetype})`);
  console.log(
    `  budget    ${budget.maxDrawsPerFrame} draws/frame, ` +
      `${budget.decodedMbCeiling.toFixed(0)} MB decoded`,
  );
  console.log(`  hash      ${contentHash}`);
}
