import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import process from 'node:process';

import { resolveBlender } from './lib/blender.mjs';
import { valueArg } from './lib/args.mjs';

const root = resolve(import.meta.dirname, '..');
const expandHome = (path) =>
  path.startsWith('~/') ? resolve(homedir(), path.slice(2)) : resolve(path);

const body = valueArg('body', 'king');
const file = valueArg('file', null);
const glb = file === null ? resolve(root, `.crown-private/cast-source/${body}.glb`) : expandHome(file);
const tag = valueArg('tag', body);
const mode = valueArg('mode', 'suspect');
const outDir = expandHome(valueArg('out', resolve(root, 'captures/cast/weights')));

if (!existsSync(glb)) {
  console.error(`No rigged body at ${glb}`);
  process.exit(1);
}
if (mode !== 'suspect' && mode !== 'dominant') {
  console.error(`--mode=${mode} is neither "suspect" nor "dominant"`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const result = spawnSync(resolveBlender(), [
  '--background',
  '--python', resolve(root, 'tools/blender/cast_weights.py'),
  '--',
  `--glb=${glb}`, `--out=${outDir}`, `--tag=${tag}`, `--mode=${mode}`,
], { encoding: 'utf8' });

const line = (result.stdout ?? '').split('\n').find((l) => l.startsWith('CAST_WEIGHTS '));
if (line === undefined) {
  console.error(result.stdout ?? '');
  console.error(result.stderr ?? '');
  process.exit(1);
}
const report = JSON.parse(line.slice('CAST_WEIGHTS '.length));

const share = (n) => `${((100 * n) / report.vertices).toFixed(1)}%`;
console.log(`${tag}: ${report.suspectTotal} of ${report.vertices} vertices (${share(report.suspectTotal)}) `
  + 'sit further from their own bone than a hand is long');
for (const [bone, count] of Object.entries(report.suspectByBone).slice(0, 8)) {
  console.log(`  ${bone.padEnd(15)} ${String(count).padStart(4)}`);
}
console.log(`\n  ${report.written.length} views in ${outDir.replace(`${root}/`, '')}`);
console.log('  A limb\'s colour spreading across cloth is cloth riding on that limb. A prop held in');
console.log('  a hand is *meant* to be that hand\'s colour — one coherent shape, not a wash.');
