import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

import { resolveBlender } from './lib/blender.mjs';
import { valueArg } from './lib/args.mjs';

const root = resolve(import.meta.dirname, '..');
const expandHome = (p) => (p.startsWith('~/') ? resolve(homedir(), p.slice(2)) : resolve(p));

const SWAPS = {
  king: {
    gloves: {
      length: 0.19,
      radius: 0.09,
      thumbLength: 0.085,
      thumbRadius: 0.045,
    },
    weapon: {
      mesh: '.crown-private/cast-source/Meshy_AI_Golden_Oathblade_0811125931_texture.blend',
      bone: 'RightHand',
      flip: true,
      gripT: -0.34,
      length: 1.15,
      aim: [-0.22, -0.77, -0.60],
    },
  },
};

const body = valueArg('body', 'king');
const spec = SWAPS[body];
if (spec === undefined) {
  console.error(`--body=${body} has no entry here. Known: ${Object.keys(SWAPS).join(', ')}`);
  process.exit(1);
}

const glb = expandHome(valueArg('file', resolve(root, `.crown-private/cast-source/donor/${body}.glb`)));
const out = expandHome(valueArg('out', resolve(root, `.crown-private/cast-source/armed/${body}.glb`)));
const weapon = { ...spec.weapon, mesh: expandHome(valueArg('mesh', spec.weapon.mesh)) };

for (const [label, path] of [['body', glb], ['weapon mesh', weapon.mesh]]) {
  if (!existsSync(path)) {
    console.error(`No ${label} at ${path}`);
    process.exit(1);
  }
}
mkdirSync(dirname(out), { recursive: true });

const result = spawnSync(resolveBlender(), [
  '--background', '--python', resolve(root, 'tools/blender/cast_weapon.py'),
  '--', `--glb=${glb}`, `--out=${out}`, `--tmp=${dirname(out)}`,
  ...(spec.box === undefined ? [] : [`--box=${JSON.stringify(spec.box)}`]),
  `--gloves=${JSON.stringify(spec.gloves ?? {})}`,
  `--weapon=${JSON.stringify(weapon)}`,
], { encoding: 'utf8' });

for (const line of (result.stdout ?? '').split('\n')) if (line.startsWith('! ')) console.log(line);
const line = (result.stdout ?? '').split('\n').find((l) => l.startsWith('CAST_WEAPON '));
if (line === undefined) {
  console.error(result.stdout ?? '');
  console.error(result.stderr ?? '');
  process.exit(1);
}
const r = JSON.parse(line.slice('CAST_WEAPON '.length));
console.log(`${body}: ${r.verticesBefore} -> ${r.verticesAfter} vertices, ${r.clips} clips kept`);
for (const [side, glove] of Object.entries(r.gloves ?? {})) {
  console.log(`  covered the generated ${side} hand with a ${glove.vertices}-vertex low-poly mitten`);
}
if (r.cut.facesRemoved !== undefined) {
  console.log(`  cut out ${r.cut.facesRemoved} faces of modelled-in weapon `
    + `(${r.cut.facesFromIslands} of them whole islands of ${r.cut.islandsTaken.join('/')} verts — `
    + `the hilt), `
    + `filled ${r.cut.facesFilled} to close the ${r.cut.boundaryEdges} boundary edges it opened`);
}
console.log(`  welded ${r.weapon.vertices} weapon vertices to ${r.weapon.bone}`);
console.log(`  grip reaches within ${r.weapon.gripReach} of the ${r.weapon.seat} `
  + `(gripT ${r.weapon.gripT}, usable range ${r.weapon.gripRange.join('..')})`);
console.log(`  aim ${r.weapon.aimDeclared} -> ${r.weapon.aim.join(', ')}`);
if (r.atlas.atlas) {
  console.log(`  atlased ${r.atlas.materials} materials into one ${r.atlas.pixels}px albedo `
    + `— strips ${r.atlas.strips.join('/')} tall, ${r.atlas.pad}px of inset against seam bleed`);
}
console.log(`  bind height ${r.bind.height}, sole at ${r.bind.sole} `
  + `(a sole below 0 is the weapon through the floor)`);
console.log(`\n  wrote ${r.out.replace(`${root}/`, '')}`);
console.log('  Look at it: npm run cast:preview -- --file=<that> --tag=armed');
