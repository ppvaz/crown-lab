import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import process from 'node:process';

import { CLIPS, POSES, resolveClip } from './lib/cast-poses.mjs';
import { resolveBlender } from './lib/blender.mjs';
import { valueArg, listArg, flag } from './lib/args.mjs';

const root = resolve(import.meta.dirname, '..');
const expandHome = (path) =>
  path.startsWith('~/') ? resolve(homedir(), path.slice(2)) : resolve(path);

const earlier = (power) => (at) => at ** power;

const BODIES = {
  king: {},

  first_blade: {
    amplitude: 0.94,
    tempo: 1.12,
    beat: earlier(1.3),
    stance: {
      hips: { swing: 4, turn: -6 },
      spine: { swing: 6, turn: 4 },
      head: { swing: 2 },
      kneeL: { swing: 8 },
      kneeR: { swing: 10 },
      shoulderR: { swing: 6 },
    },
    signature: {
      roar: {
        seconds: 2.1,
        keys: [
          { at: 0, pose: 'stand' },
          { at: 0.2, pose: 'roarGather' },
          { at: 0.38, pose: 'roarOpen', ease: 'linear' },
          { at: 0.62, pose: ['roarOpen', { spine: { swing: -6 }, head: { swing: -8 }, armL: { spread: 8 }, armR: { spread: 8 } }] },
          { at: 0.86, pose: ['roarOpen', { spine: { swing: 8 }, head: { swing: 10 } }] },
          { at: 1, pose: 'stand' },
        ],
      },
    },
  },
};

const body = valueArg('body', 'king');
const spec = BODIES[body];
if (spec === undefined) {
  console.error(`--body=${body} has no movement of its own here. Known: ${Object.keys(BODIES).join(', ')}`);
  console.error('A body absent from this list keeps the borrowed pack, which is not an error.');
  process.exit(1);
}

const dry = flag('dry');
const replace = flag('replace');
const glb = expandHome(valueArg('glb', `${root}/.crown-private/cast-source/${body}.glb`));
const outDir = expandHome(valueArg('out', `${root}/captures/cast-clips/${body}`));
const outFile = resolve(outDir, `${body}.glb`);

if (!existsSync(glb)) {
  console.error(`No rigged body at ${glb}`);
  console.error('This stage takes an already-rigged export; `npm run cast:rig` is what makes one.');
  process.exit(1);
}

const available = { ...CLIPS, ...(spec.signature ?? {}) };
const requestedRoles = listArg('roles', Object.keys(available));
const unknownRoles = requestedRoles.filter((role) => available[role] === undefined);
if (unknownRoles.length > 0) {
  console.error(`Unknown --roles: ${unknownRoles.join(', ')}. Known: ${Object.keys(available).join(', ')}`);
  process.exit(1);
}
const clips = {};
for (const [role, clip] of Object.entries(available)) {
  if (!requestedRoles.includes(role)) continue;
  clips[role] = resolveClip(clip, spec);
}

mkdirSync(outDir, { recursive: true });
const specPath = resolve(outDir, `${body}.clips.json`);
writeFileSync(specPath, JSON.stringify({ body, fps: 30, clips }, null, 1));

const blender = resolveBlender();
const result = spawnSync(blender, [
  '--background',
  '--python', resolve(root, 'tools/blender/cast_clips.py'),
  '--',
  `--glb=${glb}`,
  `--spec=${specPath}`,
  `--out=${outFile}`,
  ...(dry ? ['--dry=true'] : []),
  ...(replace ? ['--replace=true'] : []),
], { encoding: 'utf8' });

for (const line of (result.stdout ?? '').split('\n')) {
  if (line.startsWith('! ')) console.log(line);
}
const line = (result.stdout ?? '').split('\n').find((l) => l.startsWith('CAST_CLIPS '));
if (line === undefined) {
  console.error(result.stdout ?? '');
  console.error(result.stderr ?? '');
  console.error('cast_clips.py did not report a result');
  process.exit(1);
}
const report = JSON.parse(line.slice('CAST_CLIPS '.length));
if (result.status !== 0) {
  console.error(`\nBlender exited ${result.status} — see the findings above.`);
  process.exit(1);
}

const pct = (n) => `${(n * 100).toFixed(1)}%`;
console.log(`${body}: ${Object.keys(clips).length} clips, rig at ${report.unitScale} units/m, `
  + `head at ${report.bindHeadHeight} m in the bind pose`);
console.log(`  the rig still means what the vocabulary says: `
  + report.axisCheck.map((a) => `${a.term} on ${a.bone}${a.agrees ? '' : ' ✖'}`).join(', '));

const asym = Object.entries(report.restAsymmetry)
  .filter(([, v]) => v.lengthRatio > 1.2)
  .map(([k, v]) => `${k} ${v.lengthRatio}×`);
if (asym.length > 0) {
  console.log(`  this skeleton is not mirrored: ${asym.join(', ')}`);
}

console.log('\n  role           head/bind   footSkate   handClear   contact (declared → measured)');
for (const [role, m] of Object.entries(report.clips)) {
  const swing = m.swing === undefined ? ''
    : `${m.swing.declaredContact} → ${m.swing.measuredContact}`
      + (Math.abs(m.swing.contactDrift) > 0.06 ? `  ✖ drift ${m.swing.contactDrift}` : '');
  const loop = m.loopGap === undefined ? '' : `  loopGap ${m.loopGap}`;
  const skate = m.foot === undefined ? '     —'
    : m.foot.skating === null ? 'airborne ✖'
      : pct(m.foot.skating).padStart(6) + (m.foot.skating > 0.02 ? ' ✖' : '  ');
  console.log(`  ${role.padEnd(14)} ${pct(m.headHeight.ofBind).padStart(8)}`
    + `${skate.padStart(12)}${m.handClearance.toFixed(3).padStart(12)}   ${swing}${loop}`);
}

if (dry) {
  console.log('\n  --dry: nothing written. Drop it to bake a scratch body.');
} else {
  console.log(`\n  wrote ${outFile.replace(`${root}/`, '')}`);
  console.log(`  it carries: ${report.clipsInFile.join(', ')}`);
  console.log('\n  Now look at it — no number here says whether it has weight:');
  console.log(`    npm run cast:preview -- --file=${outFile.replace(`${root}/`, '')} --tag=${body}-authored \\`);
  console.log('      --clips=idle,walk,attackHeavy,parry --frames=8');
}
