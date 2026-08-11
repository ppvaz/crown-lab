import os

import bmesh
import bpy

import crown_kit

PROPS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "build", "meshy-room")


def available(prop):
    return os.path.exists(os.path.join(PROPS_DIR, f"{prop}-meshy.glb"))


def place(prop, x, y, k, *, height, yaw=0.0, into=None, ground=0.0, material=None):
    import math

    path = os.path.join(PROPS_DIR, f"{prop}-meshy.glb")
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    arrived = [o for o in bpy.context.scene.objects if o not in before]
    meshes = [o for o in arrived if o.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"{prop}: glb imported no meshes")

    for o in arrived:
        o.select_set(o in meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = f"prop-{prop}"
    for o in arrived:
        if o.type != "MESH" and o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)

    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    lo = [min(v.co[i] for v in obj.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in obj.data.vertices) for i in range(3)]
    s = height / max(hi[2] - lo[2], 1e-6)
    obj.scale = (s, s, s * k)
    obj.rotation_euler = (0.0, 0.0, -yaw)
    bpy.ops.object.transform_apply(rotation=True, scale=True)

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()

    lo = [min(v.co[i] for v in obj.data.vertices) for i in range(3)]
    target = crown_kit.to_blender(x, y, ground, k)
    cx = (lo[0] + max(v.co[0] for v in obj.data.vertices)) / 2.0
    cy = (lo[1] + max(v.co[1] for v in obj.data.vertices)) / 2.0
    obj.location = (target.x - cx, target.y - cy, target.z - lo[2])

    if material is not None:
        obj.data.materials.clear()
        obj.data.materials.append(material)

    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

    if into is not None:
        for coll in list(obj.users_collection):
            coll.objects.unlink(obj)
        into.objects.link(obj)
    return obj
