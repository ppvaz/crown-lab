
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { SIM_DEFINE, loadSim } from './bundle-sim.mjs';

const root = resolve(import.meta.dirname, '..');
const scripts = join(root, 'scripts');
const failures = [];

const TOOL_ENTRIES = [
  ['src/lab/engine-probe.ts', 'npm run verify:engines'],
  ['src/net/lockstep.ts', 'npm run soak:lockstep'],
  ['src/sim/intent.ts', 'npm run soak:lockstep'],
  ['src/sim/rng.ts', 'npm run soak:lockstep'],
  ['src/lab/bench-kit.ts', 'npm run bench:sim'],
  ['src/app/frame.ts', 'npm run bench:sim'],
  ['src/lab/pilot-run.ts', 'npm run pilot'],
  ['scripts/room-zoom.ts', 'npm run measure:room-zoom and npm run rooms:camera'],
];

const direct = readdirSync(scripts)
  .filter((name) => name.endsWith('.mjs') && name !== 'bundle-sim.mjs')
  .filter((name) => /^import [^\n]*from 'esbuild';/m.test(readFileSync(join(scripts, name), 'utf8')));
for (const name of direct) {
  failures.push(`scripts/${name} bundles src/ itself instead of through bundle-sim.mjs`);
}

if (SIM_DEFINE.__CROWN_LAB__ !== 'true') {
  failures.push('SIM_DEFINE no longer substitutes __CROWN_LAB__, which every headless bundle needs');
}

for (const [entry, tool] of TOOL_ENTRIES) {
  try {
    const loaded = await loadSim(entry, `boot-${entry.replace(/[^a-z0-9]+/gi, '-')}`);
    if (Object.keys(loaded).length === 0) {
      failures.push(`${entry} bundled to nothing — ${tool} would import an empty module`);
    }
  } catch (error) {
    failures.push(`${entry} does not evaluate, so ${tool} cannot start: ${error.message}`);
  }
}

if (failures.length > 0) {
  console.error('Headless tooling is broken:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`Headless tooling verified: ${TOOL_ENTRIES.length} entries evaluate, one bundler.`);
