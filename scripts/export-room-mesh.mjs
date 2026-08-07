import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import process from 'node:process';

import { resolveBlender, blenderVersion } from './lib/blender.mjs';

const root = resolve(import.meta.dirname, '..');
const strArg = (name, fallback) => {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : fallback;
};

const room = strArg('room', 'concept_lantern_cloister');
const contractPath = resolve(root, `tools/blender/contracts/${room}.json`);
const module_ = room.replace(/^concept_/, '');
const roomScript = resolve(root, `tools/blender/${module_}.py`);
const outDir = resolve(root, strArg('out', `src/assets/rooms/${room.replace(/_/g, '-')}/mesh`));
const glbPath = resolve(outDir, `${room}.glb`);
const manifestPath = resolve(outDir, 'room-mesh.json');

for (const [label, path] of [['contract', contractPath], ['room script', roomScript]]) {
  if (!existsSync(path)) {
    console.error(`No ${label} at ${relative(root, path)}`);
    if (label === 'contract') console.error('Run `npm run rooms:camera` first.');
    process.exit(1);
  }
}

const bin = resolveBlender();
console.log(`Blender: ${blenderVersion(bin)}`);
mkdirSync(outDir, { recursive: true });

const driver = `
import json, sys
sys.path.insert(0, ${JSON.stringify(resolve(root, 'tools/blender'))})
import bpy, crown_kit, ${module_} as room

argv = sys.argv[sys.argv.index("--") + 1:]
contract = json.load(open(argv[0], encoding="utf-8"))
glb_path, manifest_path = argv[1], argv[2]

bpy.ops.wm.read_factory_settings(use_empty=True)
# The camera is built and then not exported. It is here because \`build_camera\` is what returns the
# height pre-scale \`k\` every vertex is authored through, and a mesh baked at a different \`k\` from
# the one the manifest states is a room that lands at the wrong height and looks like art.
cam, k, w, h, scale = crown_kit.build_camera(contract)
room.build(contract, k)

manifest = crown_kit.export_room_mesh(glb_path, contract, k)
with open(manifest_path, "w", encoding="utf-8") as fh:
    json.dump(manifest, fh, indent=1)
    fh.write("\\n")

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
print("<<<MESH>>>" + json.dumps({
    "meshes": len(meshes),
    "faces": sum(len(o.data.polygons) for o in meshes),
    "verts": sum(len(o.data.vertices) for o in meshes),
    "materials": sorted(manifest["materials"]),
    "layers": {name: len(names) for name, names in manifest["layers"].items()},
    "masses": [m["name"] for m in manifest["masses"]],
    "lights": len(manifest["lights"]),
    "unlit": [l["name"] for l in manifest["lights"] if l["lamp"] == ""],
    "heightScale": manifest["space"]["heightScale"],
    # The defect this pipeline has already had twice, in another layer: a mass in no exported
    # collection renders in the whole-room pass and appears in none of the parts. Here it would
    # arrive as a prop the king can walk through, because nothing sorts it.
    "unassigned": sorted(
        o.name for o in meshes
        if not any(c.name in crown_kit.layer_names() for c in o.users_collection)
    ),
}) + "<<<END>>>")
`;

const stdout = execFileSync(
  bin,
  ['--background', '--factory-startup', '--python-expr', driver, '--',
    contractPath, glbPath, manifestPath],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);

const fenced = stdout.match(/<<<MESH>>>(.*?)<<<END>>>/s);
if (fenced === null) {
  console.error('Blender exported no mesh summary:\n');
  console.error(stdout.slice(-2500));
  process.exit(1);
}
const info = JSON.parse(fenced[1]);

const kb = (path) => `${(statSync(path).size / 1024).toFixed(0)} kB`;
console.log(`\n${relative(root, glbPath)}  —  ${kb(glbPath)}`);
console.log(`${relative(root, manifestPath)}  —  ${kb(manifestPath)}`);
console.log(`room:        ${room}`);
console.log(`geometry:    ${info.meshes} meshes, ${info.faces} faces, ${info.verts} vertices`);
console.log(`layers:      ${Object.entries(info.layers).map(([n, c]) => `${n} (${c})`).join(', ')}`);
console.log(`masses:      ${info.masses.length === 0 ? '(none)' : info.masses.join(', ')}`);
console.log(`materials:   ${info.materials.join(', ')}`);
console.log(`lights:      ${info.lights}, height pre-scale ${info.heightScale}`);
if (info.unlit.length > 0) {
  console.log(`\n⚠ ${info.unlit.length} light(s) name no housing: ${info.unlit.join(', ')}`);
  console.log('  Their lamp bodies cannot answer the light they cast. Pass `lamp=` to area_light.');
}
if (info.unassigned.length > 0) {
  console.log(`\n⚠ ${info.unassigned.length} mesh(es) in no layer collection: ${info.unassigned.join(', ')}`);
  console.log('  Nothing sorts those, so the king walks through them. See ASSET-PIPELINES-PLAN §5.4.');
}
console.log('\nDerived, and not the source: `tools/blender/' + module_ + '.py` is. Re-export, do not edit.');
