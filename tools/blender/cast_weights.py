









import json
import math
import os
import sys

import bpy
from mathutils import Vector

NAMED = {
    'LeftHand': (0.95, 0.15, 0.15),
    'RightHand': (0.15, 0.45, 0.95),
    'LeftForeArm': (0.95, 0.55, 0.15),
    'RightForeArm': (0.20, 0.80, 0.85),
    'LeftArm': (0.80, 0.30, 0.55),
    'RightArm': (0.30, 0.55, 0.75),
    'Spine': (0.25, 0.85, 0.35),
    'Spine01': (0.35, 0.75, 0.30),
    'Spine02': (0.45, 0.65, 0.25),
    'Hips': (0.85, 0.85, 0.25),
    'Head': (0.95, 0.95, 0.95),
}

SUSPECT_METRES = 0.12

GREY = (0.30, 0.30, 0.32)


def clean_argv():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = {}
    for a in argv:
        key, _, value = a.lstrip('-').partition('=')
        out[key] = value if value else 'true'
    return out


def colour_for(name):
    if name in NAMED:
        return NAMED[name]
    h = 0
    for ch in name:
        h = (h * 131 + ord(ch)) & 0xFFFFFFFF
    hue = (h % 997) / 997.0
    import colorsys
    return colorsys.hsv_to_rgb(hue, 0.65, 0.9)


def to_segment(point, head, tail):
    span = tail - head
    length2 = span.length_squared
    if length2 < 1e-12:
        return (point - head).length
    t = max(0.0, min(1.0, (point - head).dot(span) / length2))
    return (point - (head + span * t)).length


def dominant_bone(vertex, groups):
    best = max(vertex.groups, key=lambda g: g.weight, default=None)
    return None if best is None else groups.get(best.group)


def paint(mesh, arm, mode):
    groups = {g.index: g.name for g in mesh.vertex_groups}
    segments = {b.name: (arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local)
                for b in arm.data.bones}
    layer = mesh.data.color_attributes.new(name='weights', type='FLOAT_COLOR', domain='POINT')

    tally = {}
    for v in mesh.data.vertices:
        bone = dominant_bone(v, groups)
        rgb = GREY
        if bone is not None:
            far = to_segment(mesh.matrix_world @ v.co, *segments[bone]) > SUSPECT_METRES
            if mode == 'dominant' or far:
                rgb = colour_for(bone)
            if far:
                tally[bone] = tally.get(bone, 0) + 1
        layer.data[v.index].color = (*rgb, 1.0)

    material = bpy.data.materials.new('weights')
    material.use_nodes = True
    tree = material.node_tree
    bsdf = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
    attr = tree.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'weights'
    tree.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 1.0
    mesh.data.materials.clear()
    mesh.data.materials.append(material)
    return tally


def frame(mesh, name, out_dir, tag, angle):
    scene = bpy.context.scene
    coords = [mesh.matrix_world @ v.co for v in mesh.data.vertices]
    centre = sum(coords, Vector()) / len(coords)
    height = max(c.z for c in coords) - min(c.z for c in coords)

    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = height * 1.15
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    distance = height * 3
    cam.location = centre + Vector((math.sin(angle) * distance, -math.cos(angle) * distance, 0))
    cam.rotation_euler = (math.pi / 2, 0, angle)
    scene.camera = cam

    light_data = bpy.data.lights.new('key', 'SUN')
    light_data.energy = 3
    light = bpy.data.objects.new('key', light_data)
    light.rotation_euler = (math.radians(55), 0, angle + math.radians(35))
    scene.collection.objects.link(light)

    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 720
    scene.render.resolution_y = 900
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new('w')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.5, 0.5, 0.5, 1)
    path = os.path.join(out_dir, f'{tag}-{name}.png')
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
    bpy.data.objects.remove(light)
    return path


def main():
    opt = clean_argv()
    mode = opt.get('mode', 'suspect')
    out_dir = os.path.expanduser(opt['out'])
    os.makedirs(out_dir, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.expanduser(opt['glb']), bone_heuristic='TEMPERANCE')
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    mesh = next(o for o in bpy.data.objects if o.type == 'MESH')
    arm.animation_data_clear()
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()

    tally = paint(mesh, arm, mode)
    written = [frame(mesh, n, out_dir, opt.get('tag', 'weights'), a)
               for n, a in (('front', 0.0), ('side', math.pi / 2), ('back', math.pi))]

    print('CAST_WEIGHTS ' + json.dumps({
        'mode': mode,
        'suspectByBone': dict(sorted(tally.items(), key=lambda kv: -kv[1])),
        'suspectTotal': sum(tally.values()),
        'vertices': len(mesh.data.vertices),
        'written': written,
    }))


main()
