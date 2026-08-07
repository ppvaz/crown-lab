import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { pngPixels, pngEncode } from './lib/png.mjs';
import {
  cornersFromRuns,
  fitRun,
  parallelism,
  sampleRun,
  slopeOf,
} from './lib/panel-corners.mjs';

const root = resolve(import.meta.dirname, '..');
const strArg = (name, fallback) => {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : fallback;
};
const room = strArg('room', 'concept_lantern_cloister');
const write = process.argv.includes('--write');

const annPath = resolve(root, `tools/blender/panels/${room}.json`);
if (!existsSync(annPath)) {
  console.error(`No panel annotation at tools/blender/panels/${room}.json`);
  process.exit(1);
}
const ann = JSON.parse(readFileSync(annPath, 'utf8'));
if (!ann.runs) {
  console.error(
    `${room}.json has no "runs" block. Each of the four floor edges needs a search window:\n` +
      '  "runs": { "frontLeft": {"x0":..,"x1":..,"y0":..,"y1":..}, ... }\n' +
      'in crop pixels, chosen to sit inside the straight part of the run and clear of the chamfers.',
  );
  process.exit(1);
}

const panelPath = resolve(root, ann.panel);
if (!existsSync(panelPath)) {
  console.error(
    `Panel image not found: ${ann.panel}\n` +
      'The concept corpus is gitignored, so this tool only runs on a machine that has it. The\n' +
      'committed corners in the annotation are what `npm run rooms:arena` reads.',
  );
  process.exit(1);
}

const image = pngPixels(readFileSync(panelPath));
const [cx, cy, cx1, cy1] = ann.crop;
const width = cx1 - cx;
const height = cy1 - cy;
if (cx1 > image.width || cy1 > image.height) {
  throw new Error(`crop ${ann.crop} does not fit the ${image.width}x${image.height} panel`);
}
const at = (x, y) => image.at(cx + x, cy + y);

const SIDES = {
  frontLeft: 'front',
  frontRight: 'front',
  backLeft: 'back',
  backRight: 'back',
};

console.log(`room     ${room}`);
console.log(`panel    ${ann.panel}`);
console.log(`crop     ${ann.crop.join(', ')}  (${width}x${height})`);
console.log();

const fits = {};
for (const [name, side] of Object.entries(SIDES)) {
  const window = ann.runs[name];
  if (!window) throw new Error(`runs.${name} is missing from the annotation`);
  const points = sampleRun(at, { ...window, side });
  const fit = fitRun(points);
  fits[name] = { ...fit, points };
  console.log(
    `${name.padEnd(11)} ${String(points.length).padStart(3)} samples, ` +
      `${String(fit.rejected).padStart(2)} rejected   rms ${fit.rms.toFixed(3)} px   ` +
      `worst ${fit.worst.toFixed(3)} px   slope ${slopeOf(fit.line).toFixed(5)}`,
  );
}

const lines = {
  frontLeft: fits.frontLeft.line,
  frontRight: fits.frontRight.line,
  backLeft: fits.backLeft.line,
  backRight: fits.backRight.line,
};
const corners = cornersFromRuns(lines);
console.log();
for (const [name, [x, y]] of Object.entries(corners)) {
  console.log(`${name.padEnd(6)} [${x.toFixed(2)}, ${y.toFixed(2)}]`);
}

const par = parallelism(lines);
console.log('\nopposite runs, which any parallel projection keeps parallel:');
console.log(`  frontLeft vs backRight   ${(par.frontLeftVsBackRight * 100).toFixed(1)}% apart`);
console.log(`  frontRight vs backLeft   ${(par.frontRightVsBackLeft * 100).toFixed(1)}% apart`);
const skewed = Math.max(par.frontLeftVsBackRight, par.frontRightVsBackLeft);
if (skewed > 0.02) {
  console.log(
    '\n⚠ the panel is not drawn in a parallel projection, so no exact inversion of it exists.\n' +
      '  `npm run rooms:arena` will report a residual of about this size for that reason alone,\n' +
      '  and its two projection-independent readings are what the panel actually determines.',
  );
}

const rgb = Buffer.alloc(width * height * 3);
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const [r, g, b] = at(x, y);
    const i = (y * width + x) * 3;
    rgb[i] = r;
    rgb[i + 1] = g;
    rgb[i + 2] = b;
  }
}
const plot = (x, y, colour) => {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= width || py >= height) return;
  const i = (py * width + px) * 3;
  [rgb[i], rgb[i + 1], rgb[i + 2]] = colour;
};
for (const { line } of Object.values(fits)) {
  for (let x = 0; x < width; x += 1) plot(x, (line.c - line.nx * x) / line.ny, [255, 60, 60]);
}
for (const { points } of Object.values(fits)) {
  for (const [x, y] of points) plot(x, y, [0, 255, 0]);
}
for (const [x, y] of Object.values(corners)) {
  for (let d = -6; d <= 6; d += 1) {
    plot(x + d, y, [0, 255, 255]);
    plot(x, y + d, [0, 255, 255]);
  }
}
const overlay = `tools/blender/build/${room}-corners.png`;
writeFileSync(resolve(root, overlay), pngEncode({ width, height, rgb }));
console.log(`\noverlay  ${overlay}`);

const rounded = Object.fromEntries(
  Object.entries(corners).map(([k, [x, y]]) => [k, [Number(x.toFixed(2)), Number(y.toFixed(2))]]),
);
if (!write) {
  console.log('\ncorners (pass --write to put these in the annotation):');
  console.log(JSON.stringify(rounded, null, 2));
} else {
  ann.corners = rounded;
  writeFileSync(annPath, `${JSON.stringify(ann, null, 2)}\n`);
  console.log(`\nwrote corners into tools/blender/panels/${room}.json`);
}
