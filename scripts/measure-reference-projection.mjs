import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { pngPixels, pngEncode } from './lib/png.mjs';
import {
  measureRuns,
  projectionReport,
  projectionVerdict,
  silhouetteBottom,
} from './lib/reference-projection.mjs';

const root = resolve(import.meta.dirname, '..');
const strArg = (name, fallback) => {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : fallback;
};
const room = strArg('room', 'concept_lantern_cloister');
const write = process.argv.includes('--write');

const refPath = resolve(root, `tools/blender/references/${room}-generated.json`);
if (!existsSync(refPath)) {
  console.error(`No reference at tools/blender/references/${room}-generated.json`);
  process.exit(1);
}
const ref = JSON.parse(readFileSync(refPath, 'utf8'));

const contractPath = resolve(root, `tools/blender/contracts/${room}.json`);
if (!existsSync(contractPath)) {
  console.error(`No camera contract for ${room} — run \`npm run rooms:camera\` first.`);
  process.exit(1);
}
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));

console.log(`room       ${room}`);
console.log(`reference  ${ref.image}`);
console.log(`kind       ${ref.kind} · ${ref.status}`);
console.log();

const staleContract = ref.cameraContract?.contentHash !== contract.contentHash;
if (staleContract) {
  console.log(
    `· made against contract ${ref.cameraContract?.contentHash}, current is ` +
      `${contract.contentHash}. The camera moved under it — framing claims are stale, palette and\n` +
      `  materials are not.${write ? ' Re-stamping, since this run re-measures the picture.' : ''}`,
  );
}

const imagePath = resolve(root, ref.image);
if (!existsSync(imagePath)) {
  console.error(
    `Reference image not found: ${ref.image}\n` +
      'The reference is a capture, and `captures/` is gitignored (CLAUDE.md §4.3), so this tool\n' +
      'only runs on a machine that holds it. The committed `projection` block below is what\n' +
      'travels, and it is what the plan quotes.\n',
  );
  if (ref.projection) console.error(JSON.stringify(ref.projection, null, 2));
  process.exit(1);
}

const bytes = readFileSync(imagePath);
const sha256 = createHash('sha256').update(bytes).digest('hex');
if (ref.sha256 && sha256 !== ref.sha256) {
  console.error(
    `✖ the image on disk is not the one this reference describes.\n` +
      `  declared ${ref.sha256}\n  on disk  ${sha256}`,
  );
  process.exit(1);
}

const image = pngPixels(bytes);
if (image.width !== ref.raster.widthPx || image.height !== ref.raster.heightPx) {
  console.error(
    `✖ raster mismatch: the reference declares ${ref.raster.widthPx}x${ref.raster.heightPx}, ` +
      `the file is ${image.width}x${image.height}.`,
  );
  process.exit(1);
}
console.log(`bytes      sha256 ${sha256.slice(0, 16)}… matches · ${image.width}x${image.height}`);
console.log(`contract   ${contract.contentHash} matches · isoX ${contract.projection.isoX} ` +
  `isoY ${contract.projection.isoY}`);
console.log();

if (!ref.runs) {
  console.error(
    `${room}-generated.json has no "runs" block. Two of the floor's long straight edges need a\n` +
      'column window each, in image pixels, inside the straight part and clear of the chamfers:\n' +
      '  "runs": { "frontLeft": {"x0":..,"x1":..}, "frontRight": {"x0":..,"x1":..} }',
  );
  process.exit(1);
}

const silhouette = silhouetteBottom(image.at, image.width, image.height);
const measured = measureRuns(silhouette, ref.runs);
const report = projectionReport(measured, contract.projection);
const verdict = projectionVerdict(report);

console.log('THE ROOM\'S LONG FLOOR EDGES, fitted on the outer silhouette.');
console.log(
  `  ${'run'.padEnd(12)}${'slope'.padStart(9)}${'halves'.padStart(19)}` +
    `${'drift'.padStart(9)}${'rms'.padStart(8)}${'samples'.padStart(9)}`,
);
for (const [name, run] of Object.entries(measured)) {
  console.log(
    `  ${name.padEnd(12)}${run.slope.toFixed(5).padStart(9)}` +
      `${run.halves.map((h) => h.toFixed(4)).join(' ').padStart(19)}` +
      `${`${(100 * run.drift).toFixed(1)}%`.padStart(9)}` +
      `${run.rms.toFixed(3).padStart(8)}${String(run.samples).padStart(9)}`,
  );
}
console.log();

const line = (label, value, note) => console.log(`  ${label.padEnd(22)}${value.padStart(9)}   ${note}`);
console.log('PROJECTION');
line('the runtime draws at', report.expected.toFixed(5), 'isoY / isoX, from the contract');
line('the image is drawn at', report.ratio.toFixed(5), 'the mean of the fitted runs');
line(
  'deviation',
  `${(100 * report.deviation).toFixed(2)}%`,
  'every vertical dimension read off it, by this much',
);
line('asymmetry', `${(100 * report.asymmetry).toFixed(2)}%`, 'between the two runs; 0 for this iso');
line('worst drift', `${(100 * report.worstDrift).toFixed(2)}%`, 'within one run — curvature, not noise');
console.log();

if (verdict.readableForGeometry) {
  console.log('✔ the image is in the runtime\'s projection. A dimension read off it means what it');
  console.log('  says, to the tolerance above.');
} else {
  console.log('✖ THE ROOM\'S GEOMETRY MAY NOT BE READ OFF THIS IMAGE.');
  if (!verdict.ratioOk) {
    console.log(`  · Wrong axonometric. It is a picture of this room at ${report.ratio.toFixed(4)},`);
    console.log(`    not ${report.expected.toFixed(4)}, so every height and depth in it is off by`);
    console.log(`    ${(100 * report.deviation).toFixed(1)}% — consistently, which is why nothing in it looks bent.`);
  }
  if (!verdict.parallelOk) {
    console.log('  · Not a parallel projection. One run does not fit one line, so the edges');
    console.log('    converge and no single ratio describes the image. Every quantity taken from');
    console.log('    it is a bracket rather than a number (CLAUDE.md, the parallelism rule).');
  }
  console.log('  It remains usable as a look reference — palette, materials, lighting, ornament');
  console.log('  inventory — none of which this measurement touches.');
}

const { width, height } = image;
const rgb = Buffer.alloc(width * height * 3);
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const [r, g, b] = image.at(x, y);
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
for (const run of Object.values(measured)) {
  const { line: fitted, inliers } = run;
  const mid = inliers[Math.floor(inliers.length / 2)];
  const wanted = Math.sign(run.slope) * report.expected;
  for (let x = 0; x < width; x += 1) {
    plot(x, (fitted.c - fitted.nx * x) / fitted.ny, [255, 60, 60]);
    plot(x, mid[1] + wanted * (x - mid[0]), [0, 220, 255]);
  }
  for (const [x, y] of inliers) plot(x, y, [0, 255, 0]);
}
const overlay = `tools/blender/build/${room}-reference-projection.png`;
writeFileSync(resolve(root, overlay), pngEncode({ width, height, rgb }));
console.log(`\noverlay  ${overlay}`);

const round = (v, places = 5) => Number(v.toFixed(places));
const block = {
  measuredBy: 'npm run rooms:reference',
  edge: 'the outer silhouette of the floor slab, which carries the top face\'s slope',
  runs: Object.fromEntries(
    Object.entries(measured).map(([name, run]) => [
      name,
      {
        slope: round(run.slope),
        halves: run.halves.map((h) => round(h)),
        drift: round(run.drift, 4),
        rmsPx: round(run.rms, 3),
        samples: run.samples,
      },
    ]),
  ),
  ratio: round(report.ratio),
  expected: round(report.expected),
  deviation: round(report.deviation, 4),
  asymmetry: round(report.asymmetry, 4),
  worstDrift: round(report.worstDrift, 4),
  readableForGeometry: verdict.readableForGeometry,
};

if (!write) {
  console.log('\nprojection (pass --write to put this in the reference):');
  console.log(JSON.stringify(block, null, 2));
} else {
  ref.projection = block;
  if (staleContract) ref.cameraContract = { ...ref.cameraContract, contentHash: contract.contentHash };
  writeFileSync(refPath, `${JSON.stringify(ref, null, 2)}\n`);
  console.log(
    `\nwrote projection into tools/blender/references/${room}-generated.json` +
      (staleContract ? `, and re-stamped the contract hash to ${contract.contentHash}` : ''),
  );
}
