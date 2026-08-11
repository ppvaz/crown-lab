







import os
import sys
from collections import defaultdict

import bpy
import bmesh
from mathutils import Matrix, Vector


"""Width over length of the painted stone: `wide = half * 0.44` in `draw-projectiles.ts`."""
PAINTED_ASPECT = 0.44


def clean_argv():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = {}
    for a in argv:
        key, _, value = a.lstrip('-').partition('=')
        out[key] = value if value else 'true'
    return out


def islands_of(mesh):
    n = len(mesh.vertices)
    parent = list(range(n))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for e in mesh.edges:
        a, b = find(e.vertices[0]), find(e.vertices[1])
        if a != b:
            parent[a] = b
    groups = defaultdict(list)
    for i in range(n):
        groups[find(i)].append(i)
    return sorted(groups.values(), key=len, reverse=True)


def principal_axis(points):
    centre = sum(points, Vector()) / len(points)
    axis = Vector((0, 0, 1))
    for _ in range(60):
        acc = Vector()
        for p in points:
            d = p - centre
            acc += d * d.dot(axis)
        axis = acc.normalized()
    return centre, axis


def extract_shard(src_object):
    mesh = src_object.data
    islands = islands_of(mesh)
    shard = None
    for isl in islands[1:]:
        cx = sum(mesh.vertices[i].co.x for i in isl) / len(isl)
        cz = sum(mesh.vertices[i].co.z for i in isl) / len(isl)
        if cx > 0.2 and cz > 0.3:
            shard = set(isl)
            break
    if shard is None:
        raise SystemExit('! no +x floating shard found — is this the Crystal Warden blend?')

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in shard], context='VERTS')
    bm.to_mesh(mesh)
    bm.free()

    points = [v.co.copy() for v in mesh.vertices]
    centre, axis = principal_axis(points)
    if axis.z < 0:
        axis = -axis
    rot = axis.rotation_difference(Vector((1, 0, 0))).to_matrix()
    for v in mesh.vertices:
        v.co = rot @ (v.co - centre)
    length = max(v.co.x for v in mesh.vertices) - min(v.co.x for v in mesh.vertices)
    for v in mesh.vertices:
        v.co /= length

    body_aspect = max(
        max(v.co.y for v in mesh.vertices) - min(v.co.y for v in mesh.vertices),
        max(v.co.z for v in mesh.vertices) - min(v.co.z for v in mesh.vertices),
    )
    fatten = PAINTED_ASPECT / body_aspect
    for v in mesh.vertices:
        v.co.y *= fatten
        v.co.z *= fatten
    print(f'  cross-section {body_aspect:.4f} -> {PAINTED_ASPECT:.4f} (x{fatten:.3f})')

    while mesh.uv_layers:
        mesh.uv_layers.remove(mesh.uv_layers[0])
    mesh.materials.clear()


def fracture(obj, planes, spread, wobble_deg):
    import math
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    for px, normal in planes:
        res = bmesh.ops.bisect_plane(
            bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
            plane_co=Vector((px, 0, 0)), plane_no=Vector(normal).normalized(),
            clear_inner=False, clear_outer=False)
        cut = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
        bmesh.ops.split_edges(bm, edges=cut)
        bmesh.ops.holes_fill(bm, edges=bm.edges[:], sides=12)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()

    for k, chunk in enumerate(islands_of(mesh)):
        points = [mesh.vertices[i].co.copy() for i in chunk]
        centre = sum(points, Vector()) / len(points)
        push = centre.normalized() * spread if centre.length > 1e-6 else Vector()
        angle = math.radians(wobble_deg) * (1 if k % 2 == 0 else -1)
        tilt = Matrix.Rotation(angle, 3, 'Y' if k % 2 == 0 else 'Z')
        for i in chunk:
            mesh.vertices[i].co = tilt @ (mesh.vertices[i].co - centre) + centre + push


def main():
    opt = clean_argv()
    bpy.ops.wm.open_mainfile(filepath=os.path.expanduser(opt['blend']))
    body = next(o for o in bpy.data.objects if o.type == 'MESH')
    extract_shard(body)

    states = [body]
    for name, planes, spread, wobble in [
        ('shard1', [(0.05, (1, 0, 0.35))], 0.012, 2.5),
        ('shard2', [(0.02, (1, 0, 0.3)), (-0.18, (1, 0.4, -0.25)), (0.22, (1, -0.35, 0.2))], 0.035, 7.0),
    ]:
        copy = body.copy()
        copy.data = body.data.copy()
        copy.name = name
        bpy.context.scene.collection.objects.link(copy)
        fracture(copy, planes, spread, wobble)
        states.append(copy)

    bpy.ops.object.select_all(action='DESELECT')
    arm_data = bpy.data.armatures.new('shard_states')
    arm = bpy.data.objects.new('shard_states', arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    for i in range(len(states)):
        bone = arm_data.edit_bones.new(f'state{i}')
        bone.head = (0, 0, i * 0.1)
        bone.tail = (0, 0, i * 0.1 + 0.05)
    bpy.ops.object.mode_set(mode='OBJECT')

    for i, obj in enumerate(states):
        group = obj.vertex_groups.new(name=f'state{i}')
        group.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')

    bpy.ops.object.select_all(action='DESELECT')
    for obj in states:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = states[0]
    bpy.ops.object.join()
    joined = states[0]
    joined.name = 'shard'

    joined.parent = arm
    modifier = joined.modifiers.new('skin', 'ARMATURE')
    modifier.object = arm

    bpy.ops.object.select_all(action='DESELECT')
    joined.select_set(True)
    bpy.context.view_layer.objects.active = joined
    if joined.data.has_custom_normals:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    for polygon in joined.data.polygons:
        polygon.use_smooth = False

    bpy.ops.object.select_all(action='DESELECT')
    joined.select_set(True)
    arm.select_set(True)
    out_path = os.path.expanduser(opt['out'])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out_path, export_format='GLB', use_selection=True,
        export_animations=False, export_skins=True, export_yup=True,
        export_image_format='NONE', export_apply=False,
    )
    counts = defaultdict(int)
    for v in joined.data.vertices:
        for g in v.groups:
            counts[joined.vertex_groups[g.group].name] += 1
    print('CAST_SHARD ' + str({'out': out_path, 'vertices': len(joined.data.vertices),
                               'per_state': dict(counts)}))


main()
