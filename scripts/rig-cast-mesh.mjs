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

const DONOR = resolve(root, 'assets-cast/king/king.glb');

const BODIES = {
  guard: {
    body: '~/Downloads/Meshy_AI_Crimson_Sentinel_0806214717_texture.blend',
    sole: -0.953,
    scale: 1.12,
    props: [
      {
        bone: 'RightHand',
        grip: [-0.30, 0.049, -0.139],
        gripRadius: 0.09,
        axis: [-0.305, 0.053],
        axisRadius: 0.055,
      },
    ],
  },
  archer: {
    body: '~/Downloads/Meshy_AI_Moonshadow_Archer_0806231849_texture.blend',
    sole: -0.953,
    scale: 0.9,
    tpose: true,
    weapons: [
      {
        mesh: '~/Downloads/Meshy_AI_Wooden_Bow_0806231838_texture.blend',
        bone: 'LeftHand',
        gripT: 0.0,
        length: 1.25,
        aim: 'arm',
      },
    ],
  },
  duelist: {
    body: '~/Downloads/Meshy_AI_Azure_Sentinel_0806231858_texture.blend',
    sole: -0.953,
    scale: 1.0,
    tpose: true,
    weapons: [
      {
        mesh: '~/Downloads/Meshy_AI_Sunring_Blade_0806231912_texture.blend',
        bone: 'RightHand',
        gripT: -0.32,
        length: 1.0,
        aim: [-1, 0, 0],
      },
    ],
  },
  first_blade: {
    body: '~/Downloads/Meshy_AI_Ember_Harvester_0806224658_texture.blend',
    sole: -0.953,
    scale: 0.83,
    props: [],
  },
};

const body = valueArg('body', 'guard');
const spec = BODIES[body];
if (spec === undefined) {
  console.error(`--body=${body} has no entry here. Known: ${Object.keys(BODIES).join(', ')}`);
  process.exit(1);
}

const bodyPath = expandHome(valueArg('mesh', spec.body));
const rigPath = expandHome(valueArg('rig', DONOR));
const scale = Number(valueArg('scale', String(spec.scale)));
const outDir = expandHome(valueArg('out', `~/Downloads/crown-cast-${body}-rigged`));

for (const [label, path] of [['body mesh', bodyPath], ['donor rig', rigPath]]) {
  if (!existsSync(path)) {
    console.error(`No ${label} at ${path}`);
    console.error('Both are generator output; the donor is the committed bake in assets-cast/.');
    process.exit(1);
  }
}
if (!Number.isFinite(scale) || scale <= 0) {
  console.error(`--scale=${scale} is not a positive number`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, `${body}.glb`);
const blender = resolveBlender();

const result = spawnSync(blender, [
  '--background',
  '--python', resolve(root, 'tools/blender/cast_rig.py'),
  '--',
  `--rig=${rigPath}`,
  `--body=${bodyPath}`,
  `--out=${outFile}`,
  `--name=${body}`,
  `--sole=${spec.sole}`,
  `--scale=${scale}`,
  `--tmp=${outDir}`,
  `--props=${JSON.stringify(spec.props ?? [])}`,
  `--weapons=${JSON.stringify(spec.weapons ?? [])}`,
  `--tpose=${spec.tpose ? 1 : 0}`,
], { encoding: 'utf8' });

if (result.status !== 0) {
  console.error(result.stdout ?? '');
  console.error(result.stderr ?? '');
  console.error(`\nBlender exited ${result.status}`);
  process.exit(1);
}

const line = (result.stdout ?? '').split('\n').find((l) => l.startsWith('CAST_RIG '));
if (line === undefined) {
  console.error(result.stdout ?? '');
  console.error('cast_rig.py did not report a result');
  process.exit(1);
}
const report = JSON.parse(line.slice('CAST_RIG '.length));

console.log(`${body}: ${report.vertices} vertices over ${report.joints} joints, scale ${report.scale}`);
for (const [bone, count] of Object.entries(report.propVertices)) {
  console.log(`  ${count} vertices bound rigidly to ${bone}`);
}
if (report.tpose) {
  console.log(`  T-pose retarget: every clip re-baked onto the new rest pose,`);
  console.log(`    worst joint error vs the donor ${report.retargetWorstError} world units`);
}
if (report.islands > 1) {
  console.log(`  ${report.islands} mesh islands — envelope-weighted ${report.repaired} vertices`);
  console.log('    that bone heat could not reach (it solves over connected surface)');
}
for (const w of report.weapons ?? []) {
  console.log(`  welded ${w.vertices} weapon vertices to ${w.bone} (measured axis ${w.axis.join(', ')})`);
  if (w.seat === 'hand centroid') {
    console.log(`    grip seated on ${w.seatVertices} hand vertices, ${w.seatGap} units off the bone head`);
  } else {
    console.log(`    ! grip fell back to the bone head: ${w.seatReason}`);
  }
  if (w.gripClamped !== w.gripT) {
    console.log(`    ! gripT ${w.gripT} is off the weapon: its extent about the centroid is `
      + `${w.gripRange[0]}..${w.gripRange[1]}, clamped to ${w.gripClamped}`);
  }
  if (w.haftOffset > 0) {
    console.log(`    grip snapped ${w.haftOffset} units across the axis, onto the haft`);
  }
  console.log(`    nearest weapon vertex to the seat: ${w.gripReach} units `
    + `(gripT ${w.gripClamped} of ${w.gripRange[0]}..${w.gripRange[1]})`);
}
if (report.atlas) console.log(`  ${report.materials} materials atlased into one image`);
console.log(`  clips: ${report.clips.join(', ')}`);
console.log(`  bodyTopFraction: ${report.bodyTopFraction}`);
console.log(`\nwrote ${outFile}`);
console.log(`Next: npm run cast:mesh -- --body=${body} --source=${outDir}`);
if (report.bodyTopFraction < 0.999) {
  console.log(
    `\nThis body's own crown is ${(report.bodyTopFraction * 100).toFixed(1)}% of the file's height —` +
    '\nits gear reaches past it. `bodyTopFraction` in render/cast-meshes-lab.ts must carry that' +
    '\nnumber, or the renderer scales the weapon to the height and the body comes out short.',
  );
}
