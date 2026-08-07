import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { resolveBlender, blenderVersion } from './lib/blender.mjs';
import { coverageOf, partitionReport, recomposeReport } from './lib/layer-coverage.mjs';
import { deriveShadowLayer } from './lib/light-layers.mjs';
import { pngEncode, pngPixels } from './lib/png.mjs';
import { REQUIRED_LAYERS, OPTIONAL_LAYERS } from './lib/room-package.mjs';

const root = resolve(import.meta.dirname, '..');
const strArg = (name, fallback) => {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : fallback;
};

const room = strArg('room', 'concept_lantern_cloister');
const outRoot = resolve(root, strArg('out', 'tools/blender/build/packages'));
const contractPath = resolve(root, `tools/blender/contracts/${room}.json`);
const module_ = room.replace(/^concept_/, '');
const roomScript = resolve(root, `tools/blender/${module_}.py`);

for (const [label, path] of [['contract', contractPath], ['room script', roomScript]]) {
  if (!existsSync(path)) {
    console.error(`No ${label} at ${path.replace(`${root}/`, '')}`);
    if (label === 'contract') console.error('Run `npm run rooms:camera` first.');
    process.exit(1);
  }
}

const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const outDir = resolve(outRoot, room);
mkdirSync(outDir, { recursive: true });

const bin = resolveBlender();
console.log(`Blender: ${blenderVersion(bin)}`);

const DERIVED = { occlusionMask: 'foregroundOccluders' };
const SINGLE_CHANNEL = ['occlusionMask'];
const LIGHT_LAYERS = ['shadow', 'lighting'];
const COMPOSITE_ORDER = [
  'backgroundArchitecture',
  'playableFloor',
  'solidProps',
  'foregroundOccluders',
];
const wanted = [...REQUIRED_LAYERS, ...OPTIONAL_LAYERS];

const preamble = `
import json, sys
sys.path.insert(0, ${JSON.stringify(resolve(root, 'tools/blender'))})
import bpy, crown_kit, ${module_} as room

argv = sys.argv[sys.argv.index("--") + 1:]
contract = json.load(open(argv[0], encoding="utf-8"))
out_dir, wanted, single, derived = argv[1], json.loads(argv[2]), json.loads(argv[3]), json.loads(argv[4])
ROOM = ${JSON.stringify(room)}

bpy.ops.wm.read_factory_settings(use_empty=True)
cam, k, w, h, scale = crown_kit.build_camera(contract)
room.build(contract, k)
crown_kit.setup_material_render()
`;

const layerDriver = `${preamble}
crown_kit.shadows(False)
made = crown_kit.render_layers(wanted, out_dir, ROOM, single, derived)
crown_kit.shadows(True)
made.update(crown_kit.render_light_layers(wanted, out_dir, ROOM))
whole = crown_kit.render_to(out_dir + "/" + ROOM + "-whole.png")

print("<<<LAYERS>>>" + json.dumps({
    "layers": made,
    "collections": crown_kit.layer_names(),
    "raster": [w, h],
    "preset": crown_kit.render_preset(),
    "meshes": len([o for o in bpy.context.scene.objects if o.type == "MESH"]),
    # Where every flame is, so a compositor can put a live glow back on a baked lantern.
    "lamps": crown_kit.lamp_records(k),
}) + "<<<END>>>")
`;

const spriteDriver = `${preamble}
crown_kit.shadows(False)
sprites = crown_kit.render_sorted_sprites(["solidProps", "foregroundOccluders"], out_dir, ROOM)
print("<<<LAYERS>>>" + json.dumps({"occluders": sprites}) + "<<<END>>>")
`;

const run = (driver, what) => {
  const stdout = execFileSync(
    bin,
    [
      '--background',
      '--factory-startup',
      '--python-expr',
      driver,
      '--',
      contractPath,
      outDir,
      JSON.stringify(wanted),
      JSON.stringify(SINGLE_CHANNEL),
      JSON.stringify(DERIVED),
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const fenced = stdout.match(/<<<LAYERS>>>(.*?)<<<END>>>/s);
  if (fenced === null) {
    console.error(`Blender produced no summary for the ${what} pass:\n`);
    console.error(stdout.slice(-2500));
    process.exit(1);
  }
  return JSON.parse(fenced[1]);
};

const info = run(layerDriver, 'layer');
console.log('layers rendered; sprites follow in a second process');
info.occluders = run(spriteDriver, 'sprite').occluders;

const decode = (file) => pngPixels(readFileSync(resolve(outDir, file)));

const shadowSources = COMPOSITE_ORDER.filter((name) => info.layers[name] !== undefined);
if (shadowSources.length > 0) {
  const derived = deriveShadowLayer(
    decode(`${room}-whole.png`),
    shadowSources.map((name) => decode(info.layers[name].file)),
  );
  const file = `${room}-shadow.png`;
  writeFileSync(
    resolve(outDir, file),
    pngEncode({ width: derived.width, height: derived.height, rgba: derived.rgba }),
  );
  info.layers.shadow = { file, objects: 0 };
  const share = (n) => `${((100 * n) / Math.max(1, derived.covered)).toFixed(2)}%`;
  console.log(
    `\nshadow derived from ${shadowSources.length} unshadowed layers against the whole render\n` +
      `  darkens                      ${derived.darkened} of ${derived.covered} px  ${share(derived.darkened)}\n` +
      `  mean factor where it covers  ${derived.meanFactor.toFixed(3)}\n` +
      `  ratios above 1, clamped      ${derived.clamped} channels`,
  );
  if (derived.darkened === 0) {
    console.error(
      '\n✖ THE SHADOW LAYER DARKENS NOTHING. The two renders agree, which means the geometry\n' +
        '  layers were not rendered with `use_shadows = False` — so the room is right and the\n' +
        '  actors receive nothing, which is the whole reason the term was separated.',
    );
    process.exit(1);
  }
}

const stray = info.collections.filter((c) => !wanted.includes(c));
if (stray.length > 0) {
  console.error(
    `✖ ${module_}.py creates collection(s) no layer is named after: ${stray.join(', ')}\n` +
      `  The vocabulary is REQUIRED_LAYERS in scripts/lib/room-package.mjs: ${wanted.join(', ')}`,
  );
  process.exit(1);
}

const manifest = {
  id: room,
  contractHash: contract.contentHash,
  widthPx: contract.raster.widthPx,
  heightPx: contract.raster.heightPx,
  colorSpace: 'srgb',
  premultipliedAlpha: false,
  maxDrawsPerFrame: contract.budget.maxDrawsPerFrame,
  collisionVersion: createHash('sha256')
    .update(JSON.stringify(contract.arena))
    .digest('hex')
    .slice(0, 16),
  projection: {
    isoX: contract.projection.isoX,
    isoY: contract.projection.isoY,
    elevationY: contract.projection.elevationY,
    effectiveScale: contract.raster.effectiveScale,
    origin: contract.raster.origin,
  },
  layers: Object.fromEntries(Object.entries(info.layers).map(([name, l]) => [name, l.file])),
  composite: {
    backgroundArchitecture: 'source-over',
    playableFloor: 'source-over',
    solidProps: 'source-over',
    foregroundOccluders: 'source-over',
    occlusionMask: 'source-over',
    shadow: 'multiply',
    lighting: 'lighter',
  },
  staticLayersUnshadowed: true,
  occluders: info.occluders,
  lamps: info.lamps,
  provenance: {
    source: `tools/blender/${module_}.py`,
    stage: 'dressed',
    blender: blenderVersion(bin),
    preset: info.preset,
  },
};

console.log(`room script: tools/blender/${module_}.py`);
console.log(`raster ${info.raster.join('x')} · contract ${contract.contentHash}\n`);
for (const name of wanted) {
  const made = info.layers[name];
  const tag = REQUIRED_LAYERS.includes(name) ? 'required' : 'optional';
  const what = LIGHT_LAYERS.includes(name)
    ? `${manifest.composite[name]} term`
    : `${made ? made.objects : 0} objects`;
  console.log(
    made
      ? `  ✔ ${name.padEnd(22)} ${what.padStart(14)}  ${made.file}`
      : `  · ${name.padEnd(22)} ${tag}, not produced`,
  );
}

const missing = REQUIRED_LAYERS.filter((n) => !info.layers[n]);
if (missing.length > 0) {
  console.log(
    `\n${missing.length} required layer(s) absent: ${missing.join(', ')}.\n` +
      'Inventing one is how a package passes its validator while missing part of what it promises;\n' +
      '`npm run rooms:check` is what says so, and it is the work list.',
  );
}
const owned = Object.entries(info.layers)
  .filter(([name]) => !(name in DERIVED) && !LIGHT_LAYERS.includes(name))
  .reduce((sum, [, l]) => sum + l.objects, 0);
if (owned !== info.meshes) {
  console.error(
    `\n✖ ${owned} of ${info.meshes} meshes are in an exported layer.\n` +
      (owned < info.meshes
        ? `  ${info.meshes - owned} mass(es) belong to no collection. They are in the scene and in\n` +
          '  no export, and no downstream check opens a layer to notice.'
        : `  ${owned - info.meshes} mass(es) are in two collections.`),
  );
  process.exit(1);
}
console.log(`\nevery one of ${info.meshes} meshes is in exactly one layer.`);

const cover = (file) => coverageOf(decode(file));
const whole = cover(`${room}-whole.png`);
const parts = Object.entries(info.layers)
  .filter(([name]) => !(name in DERIVED) && !LIGHT_LAYERS.includes(name))
  .map(([, l]) => cover(l.file));
const partition = partitionReport(whole, parts);

const share = (n) => `${((100 * n) / partition.covered).toFixed(3)}%`;
console.log('\nWHAT THE PIXELS ADD (not completeness — see above)');
console.log(`  covered by the whole render  ${partition.covered} px`);
console.log(`  its silhouette               ${partition.perimeter} px  ${share(partition.perimeter)} — where antialiasing lives`);
console.log(`  · uncovered by any layer     ${partition.dropped} px  ${share(partition.dropped)} — weak signal, see above`);
console.log(`  ✖ outside the whole render   ${partition.outside} px  ${share(partition.outside)}`);
console.log(`  · overlapped, order decides  ${partition.overlapped} px  ${share(partition.overlapped)}`);

if (partition.outside > partition.perimeter) {
  console.error(
    '\n✖ A LAYER DRAWS WHERE THE ROOM DOES NOT. Same camera, same geometry, so this is not\n' +
      '  antialiasing: a layer was rendered under different settings from the pass it is being\n' +
      '  compared against — flat shading leaking into a shaded export, for instance.',
  );
  process.exit(1);
}

if (info.layers.shadow !== undefined) {
  const statics = COMPOSITE_ORDER.filter((name) => info.layers[name] !== undefined).map((name) =>
    decode(info.layers[name].file),
  );
  const identity = recomposeReport(
    decode(`${room}-whole.png`),
    statics,
    decode(info.layers.shadow.file),
  );
  const pct = (n) => `${((100 * n) / 255).toFixed(2)}%`;
  const relError = identity.meanBase > 0 ? identity.meanAbsError / identity.meanBase : 0;
  console.log('\nDOES merged × shadow REBUILD THE ROOM?');
  console.log(`  interior pixels compared     ${identity.compared}`);
  console.log(`  mean per-channel error       ${identity.meanAbsError.toFixed(2)} / 255  ${pct(identity.meanAbsError)}`);
  console.log(`  as a share of the base       ${(100 * relError).toFixed(2)}% of a mean base of ${identity.meanBase.toFixed(1)}`);
  console.log(`  worst per-channel error      ${identity.maxAbsError.toFixed(0)} / 255  ${pct(identity.maxAbsError)}`);

  const CEILING = 0.02;
  if (identity.compared === 0) {
    console.error('\n✖ NOTHING WAS COMPARED. Every pixel was silhouette, which cannot be true.');
    process.exit(1);
  }
  if (relError > CEILING) {
    console.error(
      `\n✖ THE LAYERS DO NOT REBUILD THE ROOM (${(100 * relError).toFixed(2)}% > ${100 * CEILING}% of the base).\n` +
        '  The shadow layer was derived from these same two pictures, so this is not the art: it is\n' +
        '  the clamp, the quantization, the encoder, or this script and `mergeStatic` disagreeing\n' +
        '  about the order the static layers go in.',
    );
    process.exit(1);
  }
}

writeFileSync(resolve(outDir, 'room-package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\nwrote ${resolve(outDir, 'room-package.json').replace(`${root}/`, '')}`);

console.log(`\nValidate: npm run rooms:check -- --dir=${outRoot.replace(`${root}/`, '')}`);
