




import json
import os
import sys

import bpy


def clean_argv():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = {}
    for a in argv:
        key, _, value = a.lstrip('-').partition('=')
        out[key] = value if value else 'true'
    return out


def measure(obj):
    coords = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return {
        'vertices': len(coords),
        'min': [round(min(c[i] for c in coords), 4) for i in range(3)],
        'max': [round(max(c[i] for c in coords), 4) for i in range(3)],
    }


def main():
    opt = clean_argv()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.expanduser(opt['glb']), bone_heuristic='TEMPERANCE')

    mesh = next((o for o in bpy.data.objects if o.type == 'MESH'), None)
    if mesh is None:
        raise SystemExit('! no mesh in that file')
    before = measure(mesh)

    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    for modifier in [m for m in mesh.modifiers if m.type == 'ARMATURE']:
        mesh.modifiers.remove(modifier)
    for group in list(mesh.vertex_groups):
        mesh.vertex_groups.remove(group)
    mesh.parent = None
    mesh.matrix_world = mesh.matrix_world.copy()
    for obj in [o for o in bpy.data.objects if o is not mesh]:
        bpy.data.objects.remove(obj)

    bpy.context.view_layer.update()
    after = measure(mesh)
    moved = max(abs(a - b) for a, b in zip(before['min'] + before['max'], after['min'] + after['max']))

    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    out_path = os.path.expanduser(opt['out'])
    bpy.ops.export_scene.gltf(
        filepath=out_path, export_format='GLB', use_selection=True,
        export_animations=False, export_skins=False, export_yup=True,
        export_image_format='AUTO', export_apply=False,
    )

    print('CAST_STRIP ' + json.dumps({
        'out': out_path,
        'before': before,
        'after': after,
        'movedBy': round(moved, 6),
        'heightMetres': round(after['max'][2] - after['min'][2], 4),
    }))


main()
