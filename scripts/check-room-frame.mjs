import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import {
  budgetReport,
  fitAffineFrame,
  fitRuntimeFrame,
  floorCornerPairs,
} from './lib/panel-frame.mjs';

const root = resolve(import.meta.dirname, '..');
const strArg = (name, fallback) => {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : fallback;
};
const room = strArg('room', 'concept_lantern_cloister');
const budget = Number(strArg('budget', '0.02'));
const assert = process.argv.includes('--assert');

const annPath = resolve(root, `tools/blender/panels/${room}.json`);
const contractPath = resolve(root, `tools/blender/contracts/${room}.json`);
for (const [label, path, hint] of [
  ['panel annotation', annPath, 'Run `npm run rooms:panel -- --write` on a machine with the corpus.'],
  ['contract', contractPath, 'Run `npm run rooms:camera` first.'],
]) {
  if (!existsSync(path)) {
    console.error(`No ${label} at ${path.replace(`${root}/`, '')}\n${hint}`);
    process.exit(1);
  }
}
const ann = JSON.parse(readFileSync(annPath, 'utf8'));
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));

const [cx0, cy0, cx1, cy1] = ann.crop;
const [frameW, frameH] = [cx1 - cx0, cy1 - cy0];
const shorter = Math.min(frameW, frameH);

const pairs = floorCornerPairs(ann.corners, contract.arena.halfExtents);
const runtime = fitRuntimeFrame(pairs, contract.projection);
const affine = fitAffineFrame(pairs);
const report = budgetReport(runtime, affine, shorter, budget);

const pct = (px) => `${((100 * px) / shorter).toFixed(2)}%`;
const table = (frame) => {
  console.log(
    `  ${'point'.padEnd(8)}${'panel px'.padStart(18)}${'fitted px'.padStart(18)}` +
      `${'Δpx'.padStart(9)}${'Δ'.padStart(8)}`,
  );
  for (const p of frame.points) {
    console.log(
      `  ${p.name.padEnd(8)}` +
        `${p.panel.map((v) => v.toFixed(2)).join(', ')}`.padStart(18) +
        `${p.fitted.map((v) => v.toFixed(2)).join(', ')}`.padStart(18) +
        `${p.d.toFixed(2)}`.padStart(9) +
        `${pct(p.d)}`.padStart(8),
    );
  }
};

console.log(`room     ${room}`);
console.log(`panel    ${ann.panel}`);
console.log(`arena    ${contract.arena.halfExtents.x} x ${contract.arena.halfExtents.y}` +
  `  ·  projection isoX ${contract.projection.isoX} isoY ${contract.projection.isoY}`);
console.log(`frame    ${frameW}x${frameH} (the annotated crop)` +
  `  ·  shorter side ${shorter} px  ·  budget ${(100 * budget).toFixed(2)}%`);
console.log(`points   ${pairs.length} (the floor corners)`);
console.log();

console.log('RUNTIME FRAME — zoom and pan, which is all the camera has (3 parameters).');
console.log(`  fitted zoom ${runtime.scale.toFixed(5)} · origin ` +
  `${runtime.origin[0].toFixed(2)}, ${runtime.origin[1].toFixed(2)}`);
table(runtime);
console.log(`  worst ${runtime.worst.toFixed(2)} px = ${pct(runtime.worst)}` +
  `  ·  rms ${runtime.rms.toFixed(2)} px`);
console.log();

console.log('AFFINE FRAME — plus shear, rotation and split axis scales, which it has not.');
console.log('  Not a proposal: a floor. What this cannot fit, no blockout can remove.');
table(affine);
console.log(`  worst ${affine.worst.toFixed(2)} px = ${pct(affine.worst)}` +
  `  ·  rms ${affine.rms.toFixed(2)} px`);
if (pairs.length === 4 && affine.residualSpread < 1e-9) {
  console.log('  Every corner reports the same residual, which is structure and not agreement:');
  console.log('  four corners of a parallelogram leave the fit one number to spend, so this says');
  console.log('  nothing about which corner is right. `npm run rooms:panel` is what excludes a');
  console.log('  mis-picked one, at 0.09-0.14 px rms per edge.');
}
console.log();

const budgetLine = (label, value, note) =>
  console.log(`  ${label.padEnd(20)}${value.padStart(7)}   ${note}`);
console.log('BUDGET');
budgetLine('the gate allows', `${(100 * budget).toFixed(2)}%`, 'total');
budgetLine('the art costs', pct(affine.worst), 'before the model is asked for anything');
budgetLine(
  'left for the model',
  `${(100 * report.available).toFixed(2)}%`,
  `= ${report.availablePx.toFixed(2)} px in this frame`,
);
budgetLine('measured deviation', pct(runtime.worst), 'through the frame the runtime can reach');
const spanPx = Math.hypot(
  ann.corners.right[0] - ann.corners.left[0],
  ann.corners.right[1] - ann.corners.left[1],
);
console.log(
  `  against the room's own ${spanPx.toFixed(0)} px width instead of the crop: ` +
    `art ${((100 * affine.worst) / spanPx).toFixed(2)}%, ` +
    `deviation ${((100 * runtime.worst) / spanPx).toFixed(2)}%`,
);
console.log();

if (!report.reachable) {
  console.log('✖ THE FLOOR IS ABOVE THE BUDGET. This panel cannot be compared to the runtime at');
  console.log('  this tolerance by any model — the departure is the art\'s, not the blockout\'s.');
  console.log('  That is a designer decision (tolerance, comparison frame, or an accepted');
  console.log('  deviation recorded as one), and this tool does not take it.');
} else if (!report.passes) {
  console.log('✖ OVER BUDGET through the runtime frame, but the floor is under it, so some of');
  console.log('  this is reachable. On four floor corners the excess is shape and projection —');
  console.log('  there is no geometry here yet for a blockout to have got wrong.');
} else {
  console.log('✔ within budget on the points annotated so far.');
}
if (pairs.length === 4) {
  console.log();
  console.log('  Four corners is the floor rectangle and nothing else. Phase 1\'s gate is about');
  console.log('  landmarks — lantern centres, arch spring points, the wall/floor boundary — and');
  console.log('  none are annotated yet, so this is the frame the gate would use and not the gate.');
}

if (assert && !report.passes) process.exit(1);
