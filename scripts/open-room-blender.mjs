import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { resolveBlender, blenderVersion } from './lib/blender.mjs';

const root = resolve(import.meta.dirname, '..');
const strArg = (name, fallback) => {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : fallback;
};

const room = strArg('room', 'concept_lantern_cloister');
const contract = resolve(root, `tools/blender/contracts/${room}.json`);
const module_ = room.replace(/^concept_/, '');
const roomScript = resolve(root, `tools/blender/${module_}.py`);

for (const [label, path] of [['contract', contract], ['room script', roomScript]]) {
  if (!existsSync(path)) {
    console.error(`No ${label} at ${path.replace(`${root}/`, '')}`);
    if (label === 'contract') console.error('Run `npm run rooms:camera` first.');
    process.exit(1);
  }
}

if ((process.env.DISPLAY ?? process.env.WAYLAND_DISPLAY ?? '') === '') {
  console.error('No DISPLAY or WAYLAND_DISPLAY — this opens a window and there is nowhere to put it.');
  process.exit(1);
}

const bin = resolveBlender();
console.log(`Blender: ${blenderVersion(bin)}`);

const driver = `
import json, sys
sys.path.insert(0, ${JSON.stringify(resolve(root, 'tools/blender'))})
import bpy, crown_kit, ${module_} as room

contract = json.load(open(${JSON.stringify(contract)}, encoding="utf-8"))
bpy.ops.wm.read_factory_settings(use_empty=True)
cam, k, w, h, scale = crown_kit.build_camera(contract)
room.build(contract, k)
crown_kit.setup_material_render()

# Look through the export's own camera, so the first thing on screen is the framing that ships
# rather than Blender's default user view.
for area in bpy.context.screen.areas:
    if area.type == "VIEW_3D":
        area.spaces[0].region_3d.view_perspective = "CAMERA"
        area.spaces[0].shading.type = "RENDERED"

print("room open:", ${JSON.stringify(room)}, w, "x", h, "at scale", round(scale, 4))
`;

const child = spawn(bin, ['--factory-startup', '--python-expr', driver], {
  detached: true,
  stdio: 'ignore',
});
child.unref();

console.log(`room script: tools/blender/${module_}.py`);
console.log(`contract:    tools/blender/contracts/${room}.json`);
console.log('\nOpened in the Blender GUI, looking through the export camera in rendered shading.');
console.log('It is a viewer: edits in that window are not the source and are discarded on close.');
console.log(`Change tools/blender/${module_}.py, then \`npm run rooms:open\` again.`);
