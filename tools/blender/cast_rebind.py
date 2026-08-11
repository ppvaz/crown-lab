
























import json
import os
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cast_kit import distance_to_segment, envelope_weights

FROM_BONES = ('LeftHand', 'LeftForeArm', 'LeftArm', 'RightForeArm', 'RightArm')

WEAPON_BONE = 'RightHand'

WEAPON_MARGIN_METRES = 0.03

WEAPON_REACH_METRES = 0.04

WEAPON_CAPSULE_METRES = 0.12

TO_BONES = ('Hips', 'Spine', 'Spine01', 'Spine02', 'LeftShoulder', 'RightShoulder')

CAPE_PARENT = 'Spine'

CAPE_PREFIX = 'Cape'

HANGING_METRES = 0.12

FADE_METRES = 0.10

WEAPON_DRAG_METRES = 0.10

SMOOTH_FACTOR = 0.5
SMOOTH_PASSES = 3


def clean_argv():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = {}
    for a in argv:
        key, _, value = a.lstrip('-').partition('=')
        out[key] = value if value else 'true'
    return out


def dominant(vertex, groups):
    best = max(vertex.groups, key=lambda g: g.weight, default=None)
    return None if best is None else groups.get(best.group)


def seed_from_box(mesh, box):


    co = [v.co for v in mesh.data.vertices]
    lo = Vector((min(c[i] for c in co) for i in range(3)))
    hi = Vector((max(c[i] for c in co) for i in range(3)))
    span = hi - lo

    def bound(key, default):
        return lo[key[0]] + span[key[0]] * float(box.get(key[1], default))

    limits = [
        (bound((0, 'xMin'), 0.0), bound((0, 'xMax'), 1.0)),
        (bound((1, 'yMin'), 0.0), bound((1, 'yMax'), 1.0)),
        (bound((2, 'zMin'), 0.0), bound((2, 'zMax'), 1.0)),
    ]
    return limits, [v.index for v in mesh.data.vertices
                    if all(limits[i][0] <= v.co[i] <= limits[i][1] for i in range(3))]


def blade_capsule(mesh, limits, seat, units):


    inside = [v.co.copy() for v in mesh.data.vertices
              if all(limits[i][0] <= v.co[i] <= limits[i][1] for i in range(3))]
    if not inside:
        return None
    tip = max(inside, key=lambda p: (p - seat).length)
    return seat, tip, WEAPON_CAPSULE_METRES * units


def sever_weapon(mesh, groups, box, seat, units):





    limits, _ = seed_from_box(mesh, box)

    def is_blade(co):
        return all(limits[i][0] <= co[i] <= limits[i][1] for i in range(3))

    hand = {v.index for v in mesh.data.vertices if dominant(v, groups) == WEAPON_BONE}

    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    layer = bm.faces.layers.int.new('crown_weapon')

    def held(vert):
        return vert.index in hand or is_blade(vert.co)

    for face in bm.faces:
        face[layer] = 1 if all(held(v) for v in face.verts) else 0
    boundary = [e for e in bm.edges
                if any(f[layer] for f in e.link_faces) and any(not f[layer] for f in e.link_faces)]
    bmesh.ops.split_edges(bm, edges=boundary)

    bm.verts.ensure_lookup_table()
    bm.verts.index_update()
    weapon = {v.index for v in bm.verts
              if v.link_faces and all(f[layer] for f in v.link_faces) and is_blade(v.co)}
    bm.faces.layers.int.remove(layer)
    bm.to_mesh(mesh.data)
    bm.free()
    return weapon, len(boundary)


def weapon_volume(mesh, groups, bone, box, seat, units, severed):




    if box is not None:
        limits, from_box = seed_from_box(mesh, box)
        seed_indices = sorted(severed) if severed is not None else from_box
        if len(seed_indices) < 8:
            raise SystemExit(f'! the stated weapon box picks {len(seed_indices)} vertices — '
                             'it does not describe a weapon on this body')
        near = min((mesh.data.vertices[i].co.copy() for i in seed_indices),
                   key=lambda p: (p - seat).length) if seat is not None else None
        return {
            'kind': 'set' if severed is not None else 'box',
            'members': severed,
            'limits': limits,
            'seat': seat,
            'near': near,
            'reach': WEAPON_REACH_METRES * units,
        }, seed_indices

    seed_indices = [v.index for v in mesh.data.vertices if dominant(v, groups) == bone]
    seed = [mesh.data.vertices[i].co.copy() for i in seed_indices]
    if len(seed) < 8:
        return None, seed_indices

    centre = sum(seed, Vector()) / len(seed)
    axis = Vector((0, 0, 1))
    for _ in range(60):
        acc = Vector()
        for p in seed:
            d = p - centre
            acc += d * d.dot(axis)
        if acc.length < 1e-9:
            break
        axis = acc.normalized()

    along = sorted((p - centre).dot(axis) for p in seed)
    across = sorted(((p - centre) - axis * (p - centre).dot(axis)).length for p in seed)
    return {
        'kind': 'capsule',
        'centre': centre,
        'axis': axis,
        'lo': along[0],
        'hi': along[-1],
        'radius': across[int(len(across) * 0.9)],
    }, seed_indices


def in_weapon(index, point, volume, margin):
    if volume is None:
        return False
    if volume['kind'] in ('box', 'set'):
        if volume['kind'] == 'set':
            if index in volume['members']:
                return True
        else:
            limits = volume['limits']
            if all(limits[i][0] <= point[i] <= limits[i][1] for i in range(3)):
                return True
        if volume['near'] is None:
            return False
        return distance_to_segment(point, volume['seat'], volume['near']) <= volume['reach']
    d = point - volume['centre']
    a = d.dot(volume['axis'])
    if a < volume['lo'] - margin or a > volume['hi'] + margin:
        return False
    return (d - volume['axis'] * a).length <= volume['radius'] + margin


def build_cape_chain(arm, mesh, cloth, links):



    points = [mesh.data.vertices[i].co for i in cloth]
    top = max(p.z for p in points)
    bottom = min(p.z for p in points)
    if top - bottom < 1e-6:
        return []

    edges = [top - (top - bottom) * (i / links) for i in range(links + 1)]
    joints = []
    for z in edges:
        band = [p for p in points if abs(p.z - z) <= (top - bottom) / (links * 1.5)]
        if not band:
            band = points
        joints.append(sum(band, band[0] * 0) / len(band))
        joints[-1].z = z

    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    parent = arm.data.edit_bones.get(CAPE_PARENT)
    made = []
    previous = parent
    for index in range(links):
        bone = arm.data.edit_bones.new(f'{CAPE_PREFIX}{index + 1:02d}')
        bone.head = joints[index]
        bone.tail = joints[index + 1]
        bone.parent = previous
        bone.use_connect = False
        bone.use_deform = True
        previous = bone
        made.append(bone.name)
    bpy.ops.object.mode_set(mode='OBJECT')

    for name in made:
        if mesh.vertex_groups.get(name) is None:
            mesh.vertex_groups.new(name=name)
    return [(b.name, b.head_local.copy(), b.tail_local.copy())
            for b in arm.data.bones if b.name in made]


def torn_components(mesh, seed, moved_indices):



    parent = list(range(len(mesh.data.vertices)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for edge in mesh.data.edges:
        ra, rb = find(edge.vertices[0]), find(edge.vertices[1])
        if ra != rb:
            parent[ra] = rb

    torn = {find(i) for i in moved_indices} & {find(i) for i in seed}
    return sorted(
        (sum(1 for i in seed if find(i) == root),
         sum(1 for i in moved_indices if find(i) == root))
        for root in torn
    )


def smooth_cloth(mesh, cloth, repeat=SMOOTH_PASSES, factor=SMOOTH_FACTOR):



    if not cloth:
        return
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='OBJECT')
    for v in mesh.data.vertices:
        v.select = False
    for index in cloth:
        mesh.data.vertices[index].select = True
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.object.vertex_group_smooth(group_select_mode='ALL', factor=factor, repeat=repeat)
    bpy.ops.object.mode_set(mode='OBJECT')


def census(mesh, groups):
    tally = {}
    for v in mesh.data.vertices:
        name = dominant(v, groups) or '(unweighted)'
        tally[name] = tally.get(name, 0) + 1
    return tally


def main():
    opt = clean_argv()
    out_path = os.path.expanduser(opt['out'])

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.expanduser(opt['glb']), bone_heuristic='TEMPERANCE')
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    mesh = next(o for o in bpy.data.objects if o.type == 'MESH')

    if any(b.name.startswith(CAPE_PREFIX) for b in arm.data.bones):
        raise SystemExit(f'! this rig already carries a {CAPE_PREFIX} chain — rebind the generator\'s '
                         'own export, not a file this tool has already written')

    vertices_before = len(mesh.data.vertices)
    groups = {g.index: g.name for g in mesh.vertex_groups}
    before = census(mesh, groups)

    to_segments = [(b.name, b.head_local.copy(), b.tail_local.copy())
                   for b in arm.data.bones
                   if b.name in TO_BONES and mesh.vertex_groups.get(b.name)]
    if not to_segments:
        raise SystemExit('! this rig has none of the torso bones a cloak would hang from')
    from_bones = tuple(opt['cloth'].split(',')) if opt.get('cloth', '') else FROM_BONES
    from_segments = {b.name: (b.head_local.copy(), b.tail_local.copy())
                     for b in arm.data.bones if b.name in from_bones}
    missing = [name for name in from_bones if name not in from_segments]
    if missing:
        raise SystemExit(f'! this rig has no bone named {", ".join(missing)} — the cloth list is '
                         'stated per body and must be stated against the rig in front of you')
    units = 1.0 / arm.scale.x
    hanging = HANGING_METRES * units

    weapon_arg = opt.get('weapon', '')
    weapon_box = None if weapon_arg in ('', 'none') else json.loads(weapon_arg)
    no_weapon = weapon_arg == 'none'
    seat_bone = arm.data.bones.get(WEAPON_BONE)
    seat = None if seat_bone is None else seat_bone.head_local.copy()
    severed, severed_edges = (sever_weapon(mesh, groups, weapon_box, seat, units)
                              if opt.get('sever', '') == '1' and weapon_box is not None
                              and seat is not None else (None, 0))
    groups = {g.index: g.name for g in mesh.vertex_groups}
    weapon, weapon_seed = ((None, []) if no_weapon else
                           weapon_volume(mesh, groups, WEAPON_BONE, weapon_box, seat, units, severed))
    limits_for_drag, _ = (seed_from_box(mesh, weapon_box)
                          if weapon_box is not None else (None, None))
    drag_capsule = (blade_capsule(mesh, limits_for_drag, seat, units)
                    if limits_for_drag is not None and seat is not None else None)
    drag = WEAPON_DRAG_METRES * units
    margin = WEAPON_MARGIN_METRES * units
    seed_census = {}
    for index in weapon_seed:
        name = dominant(mesh.data.vertices[index], groups) or '(unweighted)'
        seed_census[name] = seed_census.get(name, 0) + 1

    at_risk = set()
    for index in weapon_seed:
        bone = dominant(mesh.data.vertices[index], groups)
        if bone not in from_segments:
            continue
        head, tail = from_segments[bone]
        if distance_to_segment(mesh.data.vertices[index].co, head, tail) > hanging:
            at_risk.add(index)

    moved = {}
    protected = {}
    rescued = set()
    cloth = []
    fraction = {}
    was = {}
    fade = FADE_METRES * units
    for v in mesh.data.vertices:
        bone = dominant(v, groups)
        if bone not in from_segments:
            continue
        head, tail = from_segments[bone]
        if distance_to_segment(v.co, head, tail) <= hanging:
            continue
        if in_weapon(v.index, v.co, weapon, margin):
            protected[bone] = protected.get(bone, 0) + 1
            rescued.add(v.index)
            for group in mesh.vertex_groups:
                group.remove([v.index])
            mesh.vertex_groups[WEAPON_BONE].add([v.index], 1.0, 'REPLACE')
            continue
        far = distance_to_segment(v.co, head, tail)
        blend = min(1.0, (far - hanging) / max(fade, 1e-6))
        blend = blend * blend * (3.0 - 2.0 * blend)
        cloth.append(v.index)
        fraction[v.index] = blend
        was[v.index] = [(groups[g.group], g.weight) for g in v.groups if g.group in groups]
        moved[bone] = moved.get(bone, 0) + 1

    links = int(opt.get('cape', '0'))
    cape_segments = build_cape_chain(arm, mesh, cloth, links) if links > 0 and cloth else []
    targets = to_segments + cape_segments

    for index in cloth:
        blend = fraction[index]
        weights = {}
        for name, w in was[index]:
            weights[name] = weights.get(name, 0.0) + w * (1.0 - blend)
        for name, w in envelope_weights(mesh.data.vertices[index].co, targets):
            weights[name] = weights.get(name, 0.0) + w * blend
        if drag_capsule is not None:
            near = distance_to_segment(mesh.data.vertices[index].co,
                                       drag_capsule[0], drag_capsule[1]) - drag_capsule[2]
            if near < drag:
                hold = 1.0 - max(0.0, near) / drag
                hold = hold * hold * (3.0 - 2.0 * hold)
                weights = {name: w * (1.0 - hold) for name, w in weights.items()}
                weights[WEAPON_BONE] = weights.get(WEAPON_BONE, 0.0) + hold
        weights = {name: w for name, w in weights.items() if w > 1e-5}
        total = sum(weights.values())
        for group in mesh.vertex_groups:
            group.remove([index])
        for name, w in weights.items():
            mesh.vertex_groups[name].add([index], w / total, 'REPLACE')

    smooth_cloth(mesh, cloth)

    groups = {g.index: g.name for g in mesh.vertex_groups}
    after = census(mesh, groups)

    if weapon_box is None and not no_weapon and after.get(WEAPON_BONE, 0) < before.get(WEAPON_BONE, 0):
        raise SystemExit(f'! the weapon hand lost vertices: {before.get(WEAPON_BONE)} -> '
                         f'{after.get(WEAPON_BONE)}')

    lost = at_risk - rescued
    if lost:
        raise SystemExit(f'! {len(lost)} of the stated weapon\'s {len(at_risk)} at-risk vertices '
                         'were not held by the weapon volume — widen it, or it is not the weapon')

    torn = torn_components(mesh, weapon_seed, cloth)

    worst = 0.0
    for v in mesh.data.vertices:
        total = sum(g.weight for g in v.groups)
        if v.groups:
            worst = max(worst, abs(total - 1.0))

    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=out_path, export_format='GLB', use_selection=True,
        export_animations=True, export_skins=True, export_yup=True,
        export_image_format='AUTO', export_apply=False,
    )

    print('CAST_REBIND ' + json.dumps({
        'out': out_path,
        'movedByBone': dict(sorted(moved.items(), key=lambda kv: -kv[1])),
        'movedTotal': sum(moved.values()),
        'capeLinks': [name for name, _, _ in cape_segments],
        'weaponProtected': protected,
        'weaponSeed': {
            'from': 'box' if weapon_box is not None else f'bone {WEAPON_BONE}',
            'count': len(weapon_seed),
            'byBone': dict(sorted(seed_census.items(), key=lambda kv: -kv[1])),
        },
        'weaponVolume': None if weapon is None else (
            {
                'kind': weapon['kind'],
                'limitsUnits': [[round(a, 2), round(b, 2)] for a, b in weapon['limits']],
                'reachUnits': round(weapon['reach'], 2),
                'severedEdges': severed_edges,
            } if weapon['kind'] in ('box', 'set') else {
                'kind': 'capsule',
                'lengthUnits': round(weapon['hi'] - weapon['lo'], 2),
                'radiusUnits': round(weapon['radius'], 2),
            }
        ),
        'weaponAtRisk': len(at_risk),
        'weaponRescuedBeyondSeed': len(rescued - set(weapon_seed)),
        'weaponTorn': torn,
        'vertices': len(mesh.data.vertices),
        'verticesAdded': len(mesh.data.vertices) - vertices_before,
        'weaponHandUnchanged': before.get('RightHand', 0),
        'worstWeightSumError': round(worst, 6),
        'unitsPerMetre': round(units, 3),
        'hangingUnits': round(hanging, 3),
        'before': dict(sorted(before.items(), key=lambda kv: -kv[1])),
        'after': dict(sorted(after.items(), key=lambda kv: -kv[1])),
    }))


main()
