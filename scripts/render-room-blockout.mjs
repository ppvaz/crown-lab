import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { resolveBlender, blenderVersion } from './lib/blender.mjs';

const root = resolve(import.meta.dirname, '..');
const strArg = (name, fallback) => {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : fallback;
};

const room = strArg('room', 'concept_lantern_cloister');
const outDir = resolve(root, strArg('out', 'tools/blender/build'));
const contract = resolve(root, `tools/blender/contracts/${room}.json`);
const module_ = room.replace(/^concept_/, '').replace(/_/g, '_');
const roomScript = resolve(root, `tools/blender/${module_}.py`);

for (const [label, path] of [['contract', contract], ['room script', roomScript]]) {
  if (!existsSync(path)) {
    console.error(`No ${label} at ${path}`);
    if (label === 'contract') console.error('Run `npm run rooms:camera` first.');
    process.exit(1);
  }
}
mkdirSync(outDir, { recursive: true });

const bin = resolveBlender();
console.log(`Blender: ${blenderVersion(bin)}`);

const driver = `
import json, os, sys
sys.path.insert(0, ${JSON.stringify(resolve(root, 'tools/blender'))})
import bpy, crown_kit, ${module_} as room

argv = sys.argv[sys.argv.index("--") + 1:]
contract = json.load(open(argv[0], encoding="utf-8"))
out = argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
cam, k, w, h, scale = crown_kit.build_camera(contract)
room.build(contract, k)
crown_kit.setup_blockout_render()
crown_kit.render_to(out)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
tris = sum(len(o.data.loop_triangles) for o in meshes for _ in [o.data.calc_loop_triangles()])
print("<<<BLOCKOUT>>>" + json.dumps({
    "objects": len(meshes), "triangles": tris, "raster": [w, h], "zScale": k,
}) + "<<<END>>>")
`;

const outPath = resolve(outDir, `${room}-blockout.png`);
const stdout = execFileSync(
  bin,
  ['--background', '--factory-startup', '--python-expr', driver, '--', contract, outPath],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
);

const fenced = stdout.match(/<<<BLOCKOUT>>>(.*?)<<<END>>>/s);
if (fenced === null) {
  console.error('Blender produced no blockout summary:\n');
  console.error(stdout.slice(-2500));
  process.exit(1);
}
const info = JSON.parse(fenced[1]);
console.log(`room script: tools/blender/${module_}.py`);
console.log(`objects ${info.objects} · triangles ${info.triangles} · raster ${info.raster.join('x')}`);
console.log(`wrote ${outPath.replace(`${root}/`, '')}`);
