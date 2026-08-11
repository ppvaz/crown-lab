import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

import { resolveBlender } from './lib/blender.mjs';
import { valueArg } from './lib/args.mjs';

const root = resolve(import.meta.dirname, '..');
const expandHome = (p) => (p.startsWith('~/') ? resolve(homedir(), p.slice(2)) : resolve(p));

const WEAPONS = {
  king: null,
};

const CLOTH = {
  king: [
    'LeftHand', 'LeftForeArm', 'LeftArm', 'RightForeArm', 'RightArm',
    'RightUpLeg', 'LeftUpLeg', 'RightLeg', 'LeftLeg',
  ],
};

const body = valueArg('body', 'king');
const file = valueArg('file', null);
const armed = resolve(root, `.crown-private/cast-source/armed/${body}.glb`);
const donor = resolve(root, `.crown-private/cast-source/donor/${body}.glb`);
const glb = file !== null ? expandHome(file)
  : [armed, donor].find(existsSync) ?? resolve(root, `.crown-private/cast-source/${body}.glb`);
const out = expandHome(valueArg('out', resolve(root, `.crown-private/cast-source/rebound/${body}.glb`)));
const cape = valueArg('cape', '0');

if (!existsSync(glb)) {
  console.error(`No rigged body at ${glb}`);
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });

const optional = [
  ['weapon', WEAPONS[body] === undefined ? '' : WEAPONS[body] === null ? 'none'
    : JSON.stringify(WEAPONS[body])],
  ['cloth', valueArg('cloth', (CLOTH[body] ?? []).join(','))],
  ['sever', valueArg('sever', '')],
].filter(([, value]) => value !== '').map(([name, value]) => `--${name}=${value}`);

const result = spawnSync(resolveBlender(), [
  '--background', '--python', resolve(root, 'tools/blender/cast_rebind.py'),
  '--', `--glb=${glb}`, `--out=${out}`, `--cape=${cape}`, ...optional,
], { encoding: 'utf8' });

for (const line of (result.stdout ?? '').split('\n')) if (line.startsWith('! ')) console.log(line);
const line = (result.stdout ?? '').split('\n').find((l) => l.startsWith('CAST_REBIND '));
if (line === undefined) {
  console.error(result.stdout ?? '');
  console.error(result.stderr ?? '');
  process.exit(1);
}
const r = JSON.parse(line.slice('CAST_REBIND '.length));
console.log(`${body}: moved ${r.movedTotal} of ${r.vertices} vertices onto the torso`);
for (const [bone, n] of Object.entries(r.movedByBone)) console.log(`  from ${bone.padEnd(14)} ${n}`);
const protectedTotal = Object.values(r.weaponProtected ?? {}).reduce((a, b) => a + b, 0);
const guarding = r.weaponVolume !== null && r.weaponVolume !== undefined;
if (guarding) {
  console.log(`  weapon: ${r.weaponHandUnchanged} -> ${r.after.RightHand} vertices `
    + `(${protectedTotal} rescued from the cloth rule)`);
}
if (guarding && r.weaponSeed !== undefined) {
  const census = Object.entries(r.weaponSeed.byBone).map(([b, n]) => `${b}:${n}`).join(' ');
  console.log(`  seeded from ${r.weaponSeed.from}: ${r.weaponSeed.count} vertices — ${census}`);
}
if (r.weaponVolume?.kind === 'capsule') {
  console.log(`  blade capsule ${r.weaponVolume.lengthUnits} long, `
    + `${r.weaponVolume.radiusUnits} across (armature units)`);
} else if (r.weaponVolume !== null && r.weaponVolume !== undefined) {
  const box = r.weaponVolume.limitsUnits.map(([a, b]) => `${a}..${b}`).join(' × ');
  console.log(`  weapon box ${box}, reach ${r.weaponVolume.reachUnits} to the hand (armature units)`);
  if (r.weaponVolume.severedEdges > 0) {
    console.log(`  cut ${r.weaponVolume.severedEdges} edges where the weapon was modelled welded `
      + `into cloth — ${r.verticesAdded} vertices added, none moved`);
  }
}
if (guarding) {
  console.log(`  ${r.weaponAtRisk} of the weapon matched the cloth rule and all of it was held`
    + `, plus ${r.weaponRescuedBeyondSeed} beyond the stated volume (the grip under the cloak)`);
}
const torn = guarding ? (r.weaponTorn ?? []) : [];
if (torn.length > 0) {
  const weapon = torn.reduce((a, [n]) => a + n, 0);
  console.log(`  ${weapon} of the weapon's vertices share a mesh island with cloth that moved, `
    + `over ${torn.length} island(s) — welded in the export, not by this tool`);
}
if (r.capeLinks?.length > 0) console.log(`  cape chain: ${r.capeLinks.join(', ')}`);
console.log(`  worst weight-sum error ${r.worstWeightSumError} (must be 0)`);
console.log(`\n  wrote ${r.out.replace(`${root}/`, '')}`);
console.log('  Look at both before believing it: npm run cast:weights -- --file=<each> --tag=<name>');
