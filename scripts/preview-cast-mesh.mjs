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
const glb = file === null ? resolve(root, `assets-cast/${body}/${body}.glb`) : expandHome(file);
const tag = valueArg('tag', body);
const clips = valueArg('clips', 'Walking,Attack');
const frames = Number(valueArg('frames', '5'));
const outDir = expandHome(valueArg('out', resolve(root, `captures/cast/${tag}`)));

if (!existsSync(glb)) {
  console.error(`No baked body at ${glb}`);
  console.error('Bake one with `npm run cast:rig` then `npm run cast:mesh`, or pass --file=<path>.');
  process.exit(1);
}
if (!Number.isInteger(frames) || frames < 1 || frames > 24) {
  console.error(`--frames=${frames} is not a sensible sheet length`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const blender = resolveBlender();
const result = spawnSync(blender, [
  '--background',
  '--python', resolve(root, 'tools/blender/cast_preview.py'),
  '--',
  `--glb=${glb}`,
  `--out=${outDir}`,
  `--tag=${tag}`,
  `--clips=${clips}`,
  `--frames=${frames}`,
], { encoding: 'utf8' });

if (result.status !== 0) {
  console.error(result.stdout ?? '');
  console.error(result.stderr ?? '');
  console.error(`\nBlender exited ${result.status}`);
  process.exit(1);
}

for (const line of (result.stdout ?? '').split('\n')) {
  if (line.startsWith('! ')) console.log(line);
}
const line = (result.stdout ?? '').split('\n').find((l) => l.startsWith('CAST_PREVIEW '));
if (line === undefined) {
  console.error(result.stdout ?? '');
  console.error('cast_preview.py did not report a result');
  process.exit(1);
}
const report = JSON.parse(line.slice('CAST_PREVIEW '.length));

console.log(`${tag}: ${report.written.length} frames in ${outDir.replace(`${root}/`, '')}`);
console.log(`  the pack carries: ${report.clips.join(', ')}`);
console.log('  <tag>-rest-front/side carry the skeleton over the bind pose — if the bones are not');
console.log('  inside the limbs, no weighting can be right.');
