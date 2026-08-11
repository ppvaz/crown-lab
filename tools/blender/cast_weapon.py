










import json
import os
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cast_rig
from cast_rig import (
    bind_rigid, grip_seat, import_donor, merge_materials, place_weapon, restore_action,
)

ATLAS_PIXELS = 1024

ATLAS_SHARES = (0.78, 0.08, 0.14)


def clean_argv():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = {}
    for a in argv:
        key, _, value = a.lstrip('-').partition('=')
        out[key] = value if value else 'true'
    return out


def mitten_material():
    material = bpy.data.materials.new('cast_gloves')
    material.use_nodes = True
    bsdf = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (0.025, 0.02, 0.018, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.72
    return material


def join_rigid(body, part, bone):
    first = len(body.data.vertices)
    bpy.ops.object.select_all(action='DESELECT')
    part.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    added = list(range(first, len(body.data.vertices)))
    bind_rigid(body, added, bone)
    return added


def make_mitten(body, arm, side, spec, units):
    hand_name = f'{side}Hand'
    fore_name = f'{side}ForeArm'
    hand = arm.data.bones[hand_name]
    fore = arm.data.bones[fore_name]
    centre, _ = grip_seat(body, hand_name, hand.head_local, hand.tail_local)
    axis = centre - hand.head_local
    if axis.length < units * 0.03:
        axis = hand.head_local - fore.head_local
    axis.normalize()
    material = mitten_material()

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=centre)
    mitten = bpy.context.object
    mitten.name = f'cast_{side.lower()}_mitten'
    mitten.rotation_mode = 'QUATERNION'
    mitten.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(axis)
    mitten.scale = (spec['radius'] * units, spec['radius'] * units,
                    spec['length'] * units / 2)
    mitten.data.materials.append(material)
    bpy.context.view_layer.objects.active = mitten
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    inward = Vector((-1, 0, 0)) if side == 'Left' else Vector((1, 0, 0))
    thumb_axis = (inward * 0.85 + axis * 0.3).normalized()
    thumb_centre = centre + inward * spec['radius'] * units * 0.72
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=thumb_centre)
    thumb = bpy.context.object
    thumb.rotation_mode = 'QUATERNION'
    thumb.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(thumb_axis)
    thumb.scale = (spec['thumbRadius'] * units, spec['thumbRadius'] * units,
                   spec['thumbLength'] * units / 2)
    thumb.data.materials.append(material)
    bpy.context.view_layer.objects.active = thumb
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    bpy.ops.object.select_all(action='DESELECT')
    mitten.select_set(True)
    thumb.select_set(True)
    bpy.context.view_layer.objects.active = mitten
    bpy.ops.object.join()
    added = join_rigid(body, mitten, hand_name)
    return centre, {'vertices': len(added), 'centre': [round(v, 4) for v in centre]}


def replace_hands(body, arm, spec, units):
    if not spec:
        return {}, {}
    centres, report = {}, {}
    for side in ('Left', 'Right'):
        centre, finding = make_mitten(body, arm, side, spec, units)
        centres[f'{side}Hand'] = centre
        report[side.lower()] = finding
    return centres, report


def dominant(mesh, index):
    groups = {g.index: g.name for g in mesh.vertex_groups}
    best = max(mesh.data.vertices[index].groups, key=lambda g: g.weight, default=None)
    return None if best is None else groups.get(best.group)


def components(bm):
    bm.verts.ensure_lookup_table()
    seen = set()
    out = []
    for start in bm.verts:
        if start.index in seen:
            continue
        stack = [start]
        seen.add(start.index)
        group = []
        while stack:
            vert = stack.pop()
            group.append(vert)
            for edge in vert.link_edges:
                other = edge.other_vert(vert)
                if other.index not in seen:
                    seen.add(other.index)
                    stack.append(other)
        out.append(group)
    return out


def box_limits(mesh, box, key=None):

    if key is not None:
        box = box.get(key, box)
    co = [v.co for v in mesh.data.vertices]
    lo = [min(c[i] for c in co) for i in range(3)]
    hi = [max(c[i] for c in co) for i in range(3)]
    span = [hi[i] - lo[i] for i in range(3)]
    keys = (('xMin', 'xMax'), ('yMin', 'yMax'), ('zMin', 'zMax'))
    return [(lo[i] + span[i] * float(box.get(keys[i][0], 0.0)),
             lo[i] + span[i] * float(box.get(keys[i][1], 1.0))) for i in range(3)]


def fill_hole(bm, boundary):


    if not boundary:
        return 0
    uv_layer = bm.loops.layers.uv.active
    samples = [loop[uv_layer].uv.copy() for edge in boundary for loop in edge.link_loops]
    mean = Vector((0.0, 0.0))
    for sample in samples:
        mean += sample
    if samples:
        mean /= len(samples)

    result = bmesh.ops.triangle_fill(bm, edges=boundary, use_beauty=True)
    faces = [g for g in result.get('geom', []) if isinstance(g, bmesh.types.BMFace)]
    for face in faces:
        face.material_index = 0
        for loop in face.loops:
            loop[uv_layer].uv = mean
    return len(faces)


def remove_old_weapon(mesh, box):


    limits = box_limits(mesh, box)

    def inside(vert):
        return all(limits[i][0] <= vert.co[i] <= limits[i][1] for i in range(3))

    reach = box_limits(mesh, box, key='reach')

    def in_reach(vert):
        return all(reach[i][0] <= vert.co[i] <= reach[i][1] for i in range(3))

    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    was_open = bm.edges.layers.int.new('crown_was_open')
    for edge in bm.edges:
        edge[was_open] = 1 if edge.is_boundary else 0

    keep_bones = set(json.loads(box['islandBones'])) if 'islandBones' in box else None
    doomed_faces = set()
    taken = []
    for group in components(bm):
        if not all(in_reach(v) for v in group):
            continue
        if keep_bones is not None and not all(dominant(mesh, v.index) in keep_bones for v in group):
            continue
        taken.append(len(group))
        doomed_faces.update(f for v in group for f in v.link_faces)
    islands = len(doomed_faces)
    if box.get('deleteWelded'):
        doomed_faces.update(f for f in bm.faces if all(inside(v) for v in f.verts))
    doomed = list(doomed_faces)
    removed = len(doomed)
    bmesh.ops.delete(bm, geom=doomed, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    boundary = [e for e in bm.edges if e.is_boundary and not e[was_open]]
    made = fill_hole(bm, boundary)
    bm.edges.layers.int.remove(was_open)
    bm.to_mesh(mesh.data)
    bm.free()
    return {'facesRemoved': removed, 'strayVertices': len(loose),
            'boundaryEdges': len(boundary), 'facesFilled': made,
            'facesFromIslands': islands, 'islandsTaken': sorted(taken, reverse=True)}


def bind_bounds(mesh):

    co = [v.co for v in mesh.data.vertices]
    lo = [min(c[i] for c in co) for i in range(3)]
    hi = [max(c[i] for c in co) for i in range(3)]
    return {'height': round(hi[2] - lo[2], 4), 'sole': round(lo[2], 4),
            'headroom': round(hi[2], 4)}


def main():
    opt = clean_argv()
    out_path = os.path.expanduser(opt['out'])

    bpy.ops.wm.read_factory_settings(use_empty=True)
    arm, mesh, held = import_donor(os.path.expanduser(opt['glb']))

    before = len(mesh.data.vertices)
    cut = remove_old_weapon(mesh, json.loads(opt['box'])) if opt.get('box', '') else {}

    units = 1.0 / arm.scale.x
    glove_centres, gloves = replace_hands(mesh, arm, json.loads(opt.get('gloves', '{}')), units)
    spec = json.loads(opt['weapon'])
    if spec['bone'] in glove_centres:
        spec['seatPoint'] = list(glove_centres[spec['bone']])
    placed = place_weapon(mesh, arm, spec, units, 1.0)
    cast_rig.ATLAS = ATLAS_PIXELS
    shares = list(ATLAS_SHARES[:len(mesh.data.materials)])
    atlas = merge_materials(mesh, os.path.expanduser(opt['tmp']), shares=shares)
    restore_action(arm, held)

    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=out_path, export_format='GLB', use_selection=True,
        export_animations=True, export_skins=True, export_yup=True,
        export_image_format='AUTO', export_apply=False,
    )

    print('CAST_WEAPON ' + json.dumps({
        'out': out_path,
        'verticesBefore': before,
        'verticesAfter': len(mesh.data.vertices),
        'clips': len(bpy.data.actions),
        'cut': cut,
        'gloves': gloves,
        'weapon': placed,
        'atlas': atlas,
        'bind': bind_bounds(mesh),
    }))


if __name__ == '__main__':
    main()
