import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

import { resolveBlender, blenderVersion } from './lib/blender.mjs';
import { flag } from './lib/args.mjs';

const root = resolve(import.meta.dirname, '..');
const strArg = (name, fallback) => {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : fallback;
};

const room = strArg('room', 'concept_lantern_cloister');
const preset = strArg('render', 'blockout');
const contractPath = resolve(root, `tools/blender/contracts/${room}.json`);
const module_ = room.replace(/^concept_/, '');
const roomScript = resolve(root, `tools/blender/${module_}.py`);
const outPath = resolve(root, strArg('out', `tools/blender/build/${room}.blend`));

if (!['blockout', 'material'].includes(preset)) {
  console.error(`--render=${preset} is not one of: blockout, material`);
  process.exit(1);
}
for (const [label, path] of [['contract', contractPath], ['room script', roomScript]]) {
  if (!existsSync(path)) {
    console.error(`No ${label} at ${path.replace(`${root}/`, '')}`);
    if (label === 'contract') console.error('Run `npm run rooms:camera` first.');
    process.exit(1);
  }
}

const insideRepo = !relative(root, outPath).startsWith('..');
let tracked = false;
if (insideRepo) {
  try {
    execFileSync('git', ['check-ignore', '-q', outPath], { cwd: root, stdio: 'ignore' });
  } catch {
    tracked = true;
  }
}

const contractHash = createHash('sha256').update(readFileSync(contractPath)).digest('hex').slice(0, 12);

const bin = resolveBlender();
const version = blenderVersion(bin);
console.log(`Blender: ${version}`);
mkdirSync(dirname(outPath), { recursive: true });

const driver = `
import json, sys
sys.path.insert(0, ${JSON.stringify(resolve(root, 'tools/blender'))})
import bpy, crown_kit, ${module_} as room

argv = sys.argv[sys.argv.index("--") + 1:]
contract = json.load(open(argv[0], encoding="utf-8"))
out_path, preset = argv[1], argv[2]

bpy.ops.wm.read_factory_settings(use_empty=True)
cam, k, w, h, scale = crown_kit.build_camera(contract)
room.build(contract, k)
if preset == "material":
    crown_kit.setup_material_render()
else:
    crown_kit.setup_blockout_render()

# Best-effort: leave the 3D view looking through the export camera, so the first thing on screen is
# the framing that ships. Background Blender usually has no screens at all, in which case the file
# opens on whatever layout the reader's Blender defaults to and Numpad 0 is one keypress.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type != "VIEW_3D":
            continue
        space = area.spaces[0]
        region = getattr(space, "region_3d", None)
        if region is not None:
            region.view_perspective = "CAMERA"
        space.shading.type = "RENDERED" if preset == "material" else "SOLID"

bpy.ops.wm.save_as_mainfile(filepath=out_path, compress=True, check_existing=False)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
# Lights are reported for the same reason meshes are: the material pass adds nine of them and a
# mesh count cannot see one. A summary that only counts geometry says "nothing changed" about a
# preset whose whole content is lighting.
lights = [o for o in bpy.context.scene.objects if o.type == "LIGHT"]
print("<<<BLEND>>>" + json.dumps({
    "path": out_path,
    "raster": [w, h],
    "scale": scale,
    "preset": crown_kit.render_preset(),
    "collections": crown_kit.layer_names(),
    "meshes": len(meshes),
    "faces": sum(len(o.data.polygons) for o in meshes),
    "lights": [[o.name, o.data.type, round(o.data.energy, 1)] for o in lights],
    "viewTransform": bpy.context.scene.view_settings.view_transform,
    "materials": sorted(m.name for m in bpy.data.materials),
    "unassigned": sorted(
        o.name for o in meshes
        if not any(c.name in crown_kit.layer_names() for c in o.users_collection)
    ),
}) + "<<<END>>>")
`;

const stdout = execFileSync(
  bin,
  ['--background', '--factory-startup', '--python-expr', driver, '--', contractPath, outPath, preset],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);

const fenced = stdout.match(/<<<BLEND>>>(.*?)<<<END>>>/s);
if (fenced === null) {
  console.error('Blender saved no file summary:\n');
  console.error(stdout.slice(-2500));
  process.exit(1);
}
const info = JSON.parse(fenced[1]);

const mb = statSync(outPath).size / 1_048_576;
console.log(`\n${insideRepo ? relative(root, outPath) : outPath}  —  ${mb.toFixed(1)} MB`);
console.log(`room:        ${room} (${preset} preset, ${info.preset.engine})`);
console.log(`camera:      ${info.raster[0]}x${info.raster[1]} ortho at effective scale ${info.scale.toFixed(4)}`);
console.log(
  `geometry:    ${info.meshes} meshes, ${info.faces} faces, across ${info.collections.length} layer collections`,
);
console.log(`collections: ${info.collections.join(', ')}`);
console.log(`materials:   ${info.materials.length === 0 ? '(none — clay)' : info.materials.join(', ')}`);
console.log(`colour:      view transform ${info.viewTransform}`);
if (info.lights.length === 0) {
  console.log('lights:      (none — the blockout preset lights nothing)');
} else {
  const byEnergy = new Map();
  for (const [, kind, energy] of info.lights) {
    const key = `${energy}W ${kind.toLowerCase()}`;
    byEnergy.set(key, (byEnergy.get(key) ?? 0) + 1);
  }
  const grouped = [...byEnergy].map(([key, n]) => `${n}x ${key}`).join(', ');
  console.log(`lights:      ${info.lights.length} — ${grouped}`);
}
if (info.unassigned.length > 0) {
  console.log(`\n⚠ ${info.unassigned.length} mesh(es) in no exported collection: ${info.unassigned.join(', ')}`);
  console.log('  Those render in the whole-room pass and in no layer. See ASSET-PIPELINES-PLAN §5.4.');
}
console.log(`\nprovenance:  ${version}, preset ${preset}, contract ${contractHash}`);
if (tracked) {
  console.log(`SOURCE: ${relative(root, outPath)} is tracked, so it is the room now (ADR-046).`);
  console.log(`  \`tools/blender/${module_}.py\` keeps the camera, the contract and the materials`);
  console.log('  and stops owning the geometry. Edit this file; export with `npm run rooms:export`.');
  console.log('  Never render the layers by hand — one run, one camera object, or §5.4 stops holding.');
} else {
  console.log(`Derived, gitignored, and not the source: \`tools/blender/${module_}.py\` is.`);
  console.log('Edits made in this file are a fork the exporter will never see.');
}

if (flag('open')) {
  if ((process.env.DISPLAY ?? process.env.WAYLAND_DISPLAY ?? '') === '') {
    console.error('\n--open needs a DISPLAY or WAYLAND_DISPLAY, and there is neither.');
    process.exit(1);
  }
  const child = spawn(bin, [outPath], { detached: true, stdio: 'ignore' });
  child.unref();
  console.log('\nOpened in the Blender GUI. Numpad 0 for the export camera.');
}
