import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { resolveBlender, blenderVersion } from './lib/blender.mjs';
import { loadSim } from './bundle-sim.mjs';

const root = resolve(import.meta.dirname, '..');

const strArg = (name, fallback) => {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : fallback;
};

const room = strArg('room', 'concept_lantern_cloister');
const tolerance = Number(strArg('tolerance', '1'));

const contractPath = resolve(root, `tools/blender/contracts/${room}.json`);
if (!existsSync(contractPath)) {
  console.error(`No contract for "${room}" — run \`npm run rooms:camera\` first.`);
  process.exit(1);
}

const bin = resolveBlender();
console.log(`Blender: ${blenderVersion(bin)}`);
console.log(`Contract: tools/blender/contracts/${room}.json\n`);

const stdout = execFileSync(
  bin,
  [
    '--background',
    '--factory-startup',
    '--python',
    resolve(root, 'tools/blender/crown_kit.py'),
    '--',
    '--contract',
    contractPath,
    '--calibrate',
  ],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
);

const fenced = stdout.match(/<<<CROWN_CALIBRATION>>>\n([\s\S]*?)\n<<<END_CROWN_CALIBRATION>>>/);
if (fenced === null) {
  console.error('Blender produced no calibration block. Its output was:\n');
  console.error(stdout.slice(-2000));
  process.exit(1);
}
const report = JSON.parse(fenced[1]);

const { makeCamera, worldToScreenAtElevation } = await loadSim('src/render/iso.ts', 'iso');

const origin = JSON.parse(readFileSync(contractPath, 'utf8')).raster?.origin ?? {
  x: 0,
  y: 0,
  elevation: 0,
};

const cam = makeCamera(report.widthPx, report.heightPx);
cam.zoom = report.effectiveScale;
cam.center = { x: origin.x, y: origin.y };

const anchor = worldToScreenAtElevation(cam, { x: origin.x, y: origin.y }, origin.elevation);
const shift = { x: report.widthPx / 2 - anchor.x, y: report.heightPx / 2 - anchor.y };

console.log(`raster ${report.widthPx}x${report.heightPx} @ scale ${report.effectiveScale.toFixed(3)}`);
console.log(`zScale ${report.zScale.toFixed(6)} · orthoScale ${report.orthoScale.toFixed(4)}`);
console.log(
  `origin ${origin.x}, ${origin.y} at elevation ${origin.elevation} — ` +
    `the raster's centre pixel, ${shift.y.toFixed(1)} px off the floor's\n`,
);
console.log(
  `${'point'.padEnd(14)}${'runtime px'.padStart(20)}${'blender px'.padStart(20)}${'Δpx'.padStart(9)}`,
);

let worst = 0;
let failures = 0;
for (const p of report.points) {
  const raw = worldToScreenAtElevation(cam, { x: p.x, y: p.y }, p.h);
  const want = { x: raw.x + shift.x, y: raw.y + shift.y };
  const dx = p.blenderPx.x - want.x;
  const dy = p.blenderPx.y - want.y;
  const d = Math.hypot(dx, dy);
  if (d > worst) worst = d;
  const bad = d > tolerance;
  if (bad) failures += 1;
  console.log(
    p.label.padEnd(14) +
      `${want.x.toFixed(1)}, ${want.y.toFixed(1)}`.padStart(20) +
      `${p.blenderPx.x.toFixed(1)}, ${p.blenderPx.y.toFixed(1)}`.padStart(20) +
      `${d.toFixed(3)}`.padStart(9) +
      (bad ? '  ✖' : ''),
  );
}

console.log(`\nworst deviation ${worst.toFixed(3)} px against a ${tolerance} px budget`);
if (failures > 0) {
  console.error(
    `\n✖ CAMERA MATCH FAILED — ${failures} anchor(s) outside budget.\n` +
      '  CONCEPT-ART-FIDELITY-PLAN §3.2: stop and evaluate real-time WebGL/glTF rather than\n' +
      '  loosening this gate. Do not tune the Z scale by eye; it is derived, not fitted.',
  );
  process.exit(1);
}
console.log('✔ camera match within budget — the blockout has a verified camera to build against.');
