






import json
import math
import os
import sys

import bpy
from mathutils import Vector


def clean_argv():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = {}
    for a in argv:
        key, _, value = a.lstrip('-').partition('=')
        if value:
            out[key] = value
    return out


def flat(name, rgb):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    return material


def draw_skeleton(arm, colour):
    matrix = arm.matrix_world
    for bone in arm.data.bones:
        head = matrix @ bone.head_local
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.018, location=head)
        bpy.context.object.data.materials.append(colour)
        for child in bone.children:
            delta = (matrix @ child.head_local) - head
            if delta.length < 1e-4:
                continue
            bpy.ops.mesh.primitive_cylinder_add(
                radius=0.009, depth=delta.length, location=head + delta / 2)
            rod = bpy.context.object
            rod.rotation_mode = 'QUATERNION'
            rod.rotation_quaternion = delta.to_track_quat('Z', 'Y')
            rod.data.materials.append(colour)


def bounds_of(body):
    graph = bpy.context.evaluated_depsgraph_get()
    evaluated = body.evaluated_get(graph)
    mesh = evaluated.to_mesh()
    points = [body.matrix_world @ v.co for v in mesh.vertices]
    evaluated.to_mesh_clear()
    low = [min(p[i] for p in points) for i in range(3)]
    high = [max(p[i] for p in points) for i in range(3)]
    return low, high


def shoot(body, out_path, width, height, azimuth, margin=1.12):

    scene = bpy.context.scene
    low, high = bounds_of(body)
    mid = [(low[i] + high[i]) / 2 for i in range(3)]
    span = max(high[i] - low[i] for i in range(3))
    data = bpy.data.cameras.new('preview')
    data.type = 'ORTHO'
    data.ortho_scale = span * margin
    camera = bpy.data.objects.new('preview', data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    distance = span * 6
    camera.location = (mid[0] + math.sin(azimuth) * distance,
                       mid[1] - math.cos(azimuth) * distance,
                       mid[2])
    camera.rotation_euler = (math.radians(90), 0, azimuth)
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.filepath = out_path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera)


def main():
    opt = clean_argv()
    glb = opt['glb']
    out_dir = opt['out']
    tag = opt.get('tag', 'cast')
    clips = [c for c in opt.get('clips', '').split(',') if c]
    frames = int(opt.get('frames', '5'))
    width = int(opt.get('width', '360'))
    height = int(opt.get('height', '460'))
    os.makedirs(out_dir, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=glb, bone_heuristic='TEMPERANCE')
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    body = next(o for o in bpy.data.objects if o.type == 'MESH')

    world = bpy.data.worlds.new('preview')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = float(
        opt.get('light', '2.0'))
    scene.world = world
    scene.render.engine = 'BLENDER_EEVEE'

    written = []

    arm.animation_data_clear()
    for pose_bone in arm.pose.bones:
        pose_bone.matrix_basis.identity()
    bpy.context.view_layer.update()
    rod = flat('rod', (0.95, 0.1, 0.1))
    draw_skeleton(arm, rod)
    scene.display.shading.show_xray = True
    for name, azimuth in (('front', 0.0), ('side', math.radians(90))):
        path = os.path.join(out_dir, f'{tag}-rest-{name}.png')
        shoot(body, path, width * 2, height * 2, azimuth)
        written.append(path)
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o is not body:
            bpy.data.objects.remove(o)
    scene.display.shading.show_xray = False

    available = sorted(a.name for a in bpy.data.actions)
    if arm.animation_data is None:
        arm.animation_data_create()
    for clip in clips:
        action = bpy.data.actions.get(clip)
        if action is None:
            print(f'! no clip named {clip}; the pack has {", ".join(available)}')
            continue
        arm.animation_data.action = action
        if hasattr(action, 'slots') and len(action.slots):
            arm.animation_data.action_slot = action.slots[0]
        start, end = action.frame_range
        for step in range(frames):
            scene.frame_set(int(round(start + (end - start) * step / max(1, frames - 1))))
            path = os.path.join(out_dir, f'{tag}-{clip}-{step}.png')
            shoot(body, path, width, height, math.radians(25))
            written.append(path)

    print('CAST_PREVIEW ' + json.dumps({'written': written, 'clips': available}))


main()
