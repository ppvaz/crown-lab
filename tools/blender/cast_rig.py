
















import bpy
import bmesh
import json
import math
import os
import sys

import numpy as np
from mathutils import Matrix, Vector


def clean_argv():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = {}
    for a in argv:
        key, _, value = a.lstrip('-').partition('=')
        if value:
            out[key] = value
    return out


def link_mesh(path):

    scn = bpy.context.scene
    with bpy.data.libraries.load(path) as (src, dst):
        dst.objects = list(src.objects)
    got = [o for o in dst.objects if o is not None and o.type == 'MESH']
    for o in got:
        scn.collection.objects.link(o)
    if not got:
        raise RuntimeError(f'no mesh object in {path}')
    if len(got) > 1:
        bpy.ops.object.select_all(action='DESELECT')
        for o in got:
            o.select_set(True)
        bpy.context.view_layer.objects.active = got[0]
        bpy.ops.object.join()
    return got[0]


def import_donor(rig_path):

    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=rig_path, bone_heuristic='TEMPERANCE')
    fresh = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in fresh if o.type == 'ARMATURE')
    meshes = [o for o in fresh if o.type == 'MESH']
    donor = next((m for m in meshes if any(md.type == 'ARMATURE' for md in m.modifiers)), None)
    for o in fresh:
        if o.type not in ('ARMATURE', 'MESH') or (o.type == 'MESH' and o is not donor):
            bpy.data.objects.remove(o)

    held = None
    if arm.animation_data is not None:
        held = (arm.animation_data.action, getattr(arm.animation_data, 'action_slot', None))
        arm.animation_data.action = None
    for pose_bone in arm.pose.bones:
        pose_bone.matrix_basis.identity()
    bpy.context.view_layer.update()
    return arm, donor, held


def restore_action(arm, held):
    if held is None:
        return
    action, slot = held
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = action
    if slot is not None and hasattr(arm.animation_data, 'action_slot'):
        arm.animation_data.action_slot = slot



ARM_CHAIN = (
    ('LeftArm', 'LeftHand', 1),
    ('RightArm', 'RightHand', -1),
)

ARM_FALLBACK = {1: (1, 0, 0), -1: (-1, 0, 0)}


def measure_arm_directions(body, arm, scale, units, sole):




    k = scale * units
    into_body = lambda p: Vector((p.x / k, p.y / k, (p.z + sole * k) / k))

    targets, measures = {}, {}
    for side, shoulder_name, hand_name in ((1, 'LeftArm', 'LeftHand'),
                                           (-1, 'RightArm', 'RightHand')):
        label = 'left' if side == 1 else 'right'
        if shoulder_name not in arm.pose.bones or hand_name not in arm.pose.bones:
            targets[side] = ARM_FALLBACK[side]
            measures[label] = {'fallback': 'rig has no arm chain'}
            continue
        shoulder = into_body(arm.pose.bones[shoulder_name].matrix.translation)
        hand = into_body(arm.pose.bones[hand_name].matrix.translation)
        reach = (hand - shoulder).length
        if reach < 1e-6:
            targets[side] = ARM_FALLBACK[side]
            measures[label] = {'fallback': 'zero-length arm chain'}
            continue

        shell = [v.co.copy() for v in body.data.vertices
                 if (v.co.x - shoulder.x) * side > 0
                 and abs((v.co - shoulder).length - reach) < 0.18 * reach]
        if len(shell) < 24:
            targets[side] = ARM_FALLBACK[side]
            measures[label] = {'fallback': f'only {len(shell)} vertices at arm reach'}
            continue

        shell.sort(key=lambda p: (p.x - shoulder.x) * side, reverse=True)
        tip = shell[: max(4, len(shell) // 10)]
        centre = Vector((0, 0, 0))
        for point in tip:
            centre += point
        centre /= len(tip)
        direction = (centre - shoulder).normalized()
        targets[side] = tuple(direction)
        measures[label] = {
            'direction': [round(c, 4) for c in direction],
            'degreesBelowHorizontal': round(
                math.degrees(math.asin(max(-1.0, min(1.0, -direction.z)))), 2),
            'shellVertices': len(shell),
        }
    return targets, measures


def retarget_arms(src, targets):


    actions = sorted(bpy.data.actions, key=lambda a: a.name)

    bpy.ops.object.select_all(action='DESELECT')
    src.select_set(True)
    bpy.context.view_layer.objects.active = src
    bpy.ops.object.duplicate()
    arm = bpy.context.object
    arm.animation_data_clear()

    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE')
    for name, hand, side in ARM_CHAIN:
        if name not in arm.pose.bones or hand not in arm.pose.bones:
            continue
        pose_bone, hand_bone = arm.pose.bones[name], arm.pose.bones[hand]
        current = hand_bone.matrix.translation - pose_bone.matrix.translation
        if current.length < 1e-6:
            continue
        turn = current.normalized().rotation_difference(Vector(targets[side]))
        pivot = pose_bone.matrix.translation.copy()
        pose_bone.matrix = (Matrix.Translation(pivot) @ turn.to_matrix().to_4x4()
                            @ Matrix.Translation(-pivot) @ pose_bone.matrix)
        bpy.context.view_layer.update()
    bpy.ops.pose.armature_apply()
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.update()

    for pose_bone in arm.pose.bones:
        constraint = pose_bone.constraints.new('COPY_TRANSFORMS')
        constraint.target = src
        constraint.subtarget = pose_bone.name

    baked = []
    for action in actions:
        src.animation_data.action = action
        if hasattr(action, 'slots') and len(action.slots):
            src.animation_data.action_slot = action.slots[0]
        start, end = action.frame_range
        bpy.ops.object.select_all(action='DESELECT')
        arm.select_set(True)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode='POSE')
        bpy.ops.pose.select_all(action='SELECT')
        bpy.ops.nla.bake(
            frame_start=int(math.floor(start)), frame_end=int(math.ceil(end)),
            only_selected=False, visual_keying=True, clear_constraints=False,
            clear_parents=False, use_current_action=False, bake_types={'POSE'},
        )
        bpy.ops.object.mode_set(mode='OBJECT')
        fresh = arm.animation_data.action
        fresh.name = f'{action.name}__retargeted'
        baked.append(fresh)

    for pose_bone in arm.pose.bones:
        for constraint in list(pose_bone.constraints):
            pose_bone.constraints.remove(constraint)

    probes = [n for n in ('LeftHand', 'RightHand', 'LeftFoot', 'RightFoot', 'Head', 'Hips')
              if n in arm.pose.bones and n in src.pose.bones]
    scene = bpy.context.scene
    if arm.animation_data is None:
        arm.animation_data_create()
    worst = 0.0
    for action, fresh in zip(actions, baked):
        src.animation_data.action = action
        if hasattr(action, 'slots') and len(action.slots):
            src.animation_data.action_slot = action.slots[0]
        arm.animation_data.action = fresh
        if hasattr(fresh, 'slots') and len(fresh.slots):
            arm.animation_data.action_slot = fresh.slots[0]
        start, end = action.frame_range
        for step in range(9):
            scene.frame_set(int(round(start + (end - start) * step / 8)))
            bpy.context.view_layer.update()
            for name in probes:
                a = src.matrix_world @ src.pose.bones[name].matrix.translation
                b = arm.matrix_world @ arm.pose.bones[name].matrix.translation
                worst = max(worst, (a - b).length)

    bpy.data.objects.remove(src)
    for action in actions:
        bpy.data.actions.remove(action)
    for fresh in baked:
        fresh.name = fresh.name[: -len('__retargeted')]
    arm.animation_data.action = baked[0] if baked else None
    return arm, worst



def mesh_islands(mesh):
    neighbours = {}
    for edge in mesh.edges:
        a, b = edge.vertices
        neighbours.setdefault(a, []).append(b)
        neighbours.setdefault(b, []).append(a)
    seen, islands = set(), []
    for index in range(len(mesh.vertices)):
        if index in seen:
            continue
        stack, island = [index], []
        seen.add(index)
        while stack:
            current = stack.pop()
            island.append(current)
            for other in neighbours.get(current, ()):
                if other not in seen:
                    seen.add(other)
                    stack.append(other)
        islands.append(island)
    islands.sort(key=len, reverse=True)
    return islands


def repair_islands(obj, arm):

    mesh = obj.data
    islands = mesh_islands(mesh)
    if len(islands) < 2:
        return {'islands': len(islands), 'repaired': 0}

    segments = [(b.name, b.head_local.copy(), b.tail_local.copy())
                for b in arm.data.bones if b.use_deform and obj.vertex_groups.get(b.name)]

    def distance_to(point, head, tail):
        along = tail - head
        length = along.length_squared
        t = 0.0 if length < 1e-12 else max(0.0, min(1.0, (point - head).dot(along) / length))
        return (point - (head + along * t)).length

    repaired = 0
    for island in islands[1:]:
        for index in island:
            point = mesh.vertices[index].co
            nearest = sorted((distance_to(point, h, t), name) for name, h, t in segments)[:3]
            weights = [(name, 1.0 / max(d, 1e-4) ** 2) for d, name in nearest]
            total = sum(w for _, w in weights)
            for group in obj.vertex_groups:
                group.remove([index])
            for name, w in weights:
                obj.vertex_groups[name].add([index], w / total, 'REPLACE')
            repaired += 1
    return {'islands': len(islands), 'repaired': repaired}


def prop_vertices(mesh, grip, grip_radius, axis_xy, axis_radius):

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()

    centre = Vector(grip)
    severed = {f.index for f in bm.faces if (f.calc_center_median() - centre).length < grip_radius}

    seen, components = set(), []
    for face in bm.faces:
        if face.index in seen or face.index in severed:
            continue
        stack, component = [face], []
        seen.add(face.index)
        while stack:
            current = stack.pop()
            component.append(current)
            for edge in current.edges:
                for neighbour in edge.link_faces:
                    if neighbour.index in seen or neighbour.index in severed:
                        continue
                    seen.add(neighbour.index)
                    stack.append(neighbour)
        components.append(component)
    components.sort(key=len, reverse=True)

    found = set()
    if len(components) > 1:
        found = {v.index for f in components[1] for v in f.verts}
    axis = Vector((axis_xy[0], axis_xy[1], 0.0))
    for vert in bm.verts:
        if vert.co.z < centre.z and (Vector((vert.co.x, vert.co.y, 0.0)) - axis).length < axis_radius:
            found.add(vert.index)
    bm.free()
    return found


def bind_rigid(obj, indices, bone):
    group = obj.vertex_groups.get(bone) or obj.vertex_groups.new(name=bone)
    for other in obj.vertex_groups:
        if other.name != bone:
            other.remove(list(indices))
    group.add(list(indices), 1.0, 'REPLACE')



def long_axis(points):

    centre = sum(points, Vector()) / len(points)
    axis = Vector((1, 0, 0))
    for _ in range(80):
        acc = Vector()
        for p in points:
            d = p - centre
            acc += d * d.dot(axis)
        if acc.length < 1e-12:
            break
        axis = acc.normalized()
    return centre, axis


def haft_at(points, centre, axis, reach, station, span):




    half = max(0.02 * span, 1e-9)
    slab = [p for p, r in zip(points, reach) if abs(r - station) <= half]
    if len(slab) < 6:
        half = 0.06 * span
        slab = [p for p, r in zip(points, reach) if abs(r - station) <= half]
    on_axis = centre + axis * station
    if len(slab) < 3:
        return on_axis, 0.0

    across = [(p - on_axis) - axis * (p - on_axis).dot(axis) for p in slab]

    spread = max(across, key=lambda v: v.length)
    if spread.length < 1e-9:
        return on_axis, 0.0
    line = spread.normalized()
    order = sorted(range(len(across)), key=lambda i: across[i].dot(line))
    coords = [across[i].dot(line) for i in order]
    cut = max(range(1, len(order)), key=lambda i: coords[i] - coords[i - 1]) if len(order) > 1 else 1
    lower, upper = order[:cut], order[cut:]
    chosen = lower if len(lower) >= len(upper) else upper

    local = Vector((0, 0, 0))
    for i in chosen:
        local += across[i]
    local /= len(chosen)
    return on_axis + local, local.length


def arm_direction(arm, bone):


    side = 'Left' if bone.startswith('Left') else 'Right'
    shoulder = arm.data.bones.get(f'{side}Arm')
    hand = arm.data.bones.get(f'{side}Hand')
    if shoulder is None or hand is None:
        return None
    along = hand.head_local - shoulder.head_local
    return along.normalized() if along.length > 1e-6 else None


def grip_seat(body, bone, bone_head):




    group = body.vertex_groups.get(bone)
    if group is None:
        return bone_head, {'seat': 'bone head', 'seatReason': f'no vertex group for {bone}'}

    held = []
    for vertex in body.data.vertices:
        for element in vertex.groups:
            if element.group == group.index and element.weight > 0.5:
                held.append(vertex.co.copy())
                break
    if len(held) < 8:
        return bone_head, {'seat': 'bone head',
                           'seatReason': f'{bone} drives only {len(held)} vertices above 0.5'}

    centre = Vector((0, 0, 0))
    for point in held:
        centre += point
    centre /= len(held)
    return centre, {'seat': 'hand centroid', 'seatVertices': len(held),
                    'seatGap': round((centre - bone_head).length, 4)}


def place_weapon(body, arm, spec, units, scale):

    weapon = link_mesh(os.path.expanduser(spec['mesh']))
    weapon.name = 'cast_weapon'
    points = [v.co.copy() for v in weapon.data.vertices]
    centre, axis = long_axis(points)
    reach = [(p - centre).dot(axis) for p in points]
    span = max(reach) - min(reach)
    low, high = min(reach) / span, max(reach) / span
    grip_t = spec.get('gripT', 0.0)
    clamped = max(low, min(high, grip_t))
    grip, offset = haft_at(points, centre, axis, reach, clamped * span, span)

    factor = (spec['length'] / span) * scale * units
    declared = spec['aim']
    if declared == 'arm':
        aim = arm_direction(arm, spec['bone'])
        if aim is None:
            raise RuntimeError(f"aim 'arm' needs a {spec['bone'][:5]}Arm/Hand chain on the donor")
    else:
        aim = Vector(declared).normalized()
    turn = axis.rotation_difference(aim).to_matrix().to_4x4()
    bone_head = arm.data.bones[spec['bone']].head_local.copy()
    joint, seat = grip_seat(body, spec['bone'], bone_head)
    weapon.data.transform(
        Matrix.Translation(joint) @ turn @ Matrix.Scale(factor, 4) @ Matrix.Translation(-grip))
    weapon.matrix_world = body.matrix_world.copy()

    first = len(body.data.vertices)
    bpy.ops.object.select_all(action='DESELECT')
    weapon.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    welded = list(range(first, len(body.data.vertices)))
    bind_rigid(body, welded, spec['bone'])
    near = min((body.data.vertices[i].co - joint).length for i in welded)
    return {'bone': spec['bone'], 'vertices': len(welded),
            'axis': [round(v, 4) for v in axis], 'span': round(span, 4),
            'gripReach': round(near, 4),
            'gripT': grip_t, 'gripClamped': round(clamped, 4),
            'gripRange': [round(low, 4), round(high, 4)],
            'aim': [round(c, 4) for c in aim], 'aimDeclared': declared,
            'haftOffset': round(offset * factor, 4), **seat}


ATLAS = 2048


def albedo_of(material):
    tree = material.node_tree
    bsdf = next((n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        return None
    links = bsdf.inputs['Base Color'].links
    return links[0].from_node.image if links else None


def merge_materials(body, tmp_dir):


    materials = list(body.data.materials)
    if len(materials) < 2:
        return {'materials': len(materials), 'atlas': False}

    slots = len(materials)
    strip = ATLAS // slots
    buffer = np.zeros((ATLAS, ATLAS, 4), dtype=np.float32)
    buffer[:, :, 3] = 1.0
    for index, material in enumerate(materials):
        image = albedo_of(material) if material else None
        if image is None:
            continue
        scaled = image.copy()
        scaled.scale(ATLAS, strip)
        pixels = np.zeros(ATLAS * strip * 4, dtype=np.float32)
        scaled.pixels.foreach_get(pixels)
        buffer[index * strip:(index + 1) * strip, :, :] = pixels.reshape((strip, ATLAS, 4))
        bpy.data.images.remove(scaled)

    atlas = bpy.data.images.new('cast_atlas', ATLAS, ATLAS, alpha=False)
    atlas.pixels.foreach_set(buffer.reshape(-1))
    atlas.update()

    uv = body.data.uv_layers.active
    for poly in body.data.polygons:
        base = poly.material_index / slots
        for loop in poly.loop_indices:
            u, v = uv.data[loop].uv
            uv.data[loop].uv = (u, v / slots + base)

    merged = bpy.data.materials.new('cast')
    merged.use_nodes = True
    tree = merged.node_tree
    bsdf = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
    texture = tree.nodes.new('ShaderNodeTexImage')
    texture.image = atlas
    tree.links.new(texture.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Emission Strength'].default_value = 0.0
    body.data.materials.clear()
    body.data.materials.append(merged)
    for poly in body.data.polygons:
        poly.material_index = 0

    as_png(atlas, os.path.join(tmp_dir, 'atlas.png'))
    return {'materials': slots, 'atlas': True}


def as_png(image, path):

    image.file_format = 'PNG'
    image.filepath_raw = path
    image.save()
    image.source = 'FILE'
    image.filepath = path
    image.reload()
    image.pack()


def single_texture(body, tmp_dir):

    tree = body.data.materials[0].node_tree
    bsdf = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
    links = bsdf.inputs['Base Color'].links
    if not links:
        return
    base_name = links[0].from_node.name

    for name in [n.name for n in tree.nodes]:
        node = tree.nodes.get(name)
        if node is None:
            continue
        drop = node.type in ('NORMAL_MAP', 'SEPARATE_COLOR')
        drop = drop or (node.type == 'TEX_IMAGE' and name != base_name)
        if drop:
            tree.nodes.remove(node)
    bsdf = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Emission Strength'].default_value = 0.0
    image = tree.nodes[base_name].image
    if image is not None:
        as_png(image, os.path.join(tmp_dir, 'albedo.png'))



def main():
    opt = clean_argv()
    out_path = opt['out']
    scale = float(opt.get('scale', '1.0'))
    sole = float(opt['sole'])
    tmp_dir = opt.get('tmp', os.path.dirname(out_path))
    props = json.loads(opt.get('props', '[]'))
    weapons = json.loads(opt.get('weapons', '[]'))
    tpose = opt.get('tpose', '0') == '1'

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    report = {}

    arm, donor, held_action = import_donor(opt['rig'])
    if donor is not None:
        bpy.data.objects.remove(donor)
    units = 1.0 / arm.scale.x

    body = link_mesh(os.path.expanduser(opt['body']))
    body.name = opt.get('name', 'cast_body')

    if tpose:
        targets, swing = measure_arm_directions(body, arm, scale, units, sole)
        report['armSwing'] = swing
        for label, measured in swing.items():
            if 'fallback' in measured:
                print(f'! {label} arm fell back to a 90° T: {measured["fallback"]}')
            else:
                print(f'  {label} arm measured {measured["degreesBelowHorizontal"]}° below '
                      f'horizontal, from {measured["shellVertices"]} vertices at arm reach')
        arm, worst = retarget_arms(arm, targets)
        held_action = (arm.animation_data.action,
                       getattr(arm.animation_data, 'action_slot', None))
        arm.animation_data.action = None
        for pose_bone in arm.pose.bones:
            pose_bone.matrix_basis.identity()
        bpy.context.view_layer.update()
        report['retargetWorstError'] = round(worst, 8)

    prop_sets = []
    for prop in props:
        prop_sets.append((prop['bone'], prop_vertices(
            body.data, prop['grip'], prop['gripRadius'], prop['axis'], prop['axisRadius'])))

    is_prop = set().union(*[s for _, s in prop_sets]) if prop_sets else set()
    body_top = max(v.co.z for v in body.data.vertices if v.index not in is_prop)
    bbox_top = max(v.co.z for v in body.data.vertices)
    top_fraction = (body_top - sole) / (bbox_top - sole)

    body.scale = (scale * units,) * 3
    body.location = (0, 0, -sole * scale * units)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)

    rest_scale = arm.scale.copy()
    arm.scale = (1, 1, 1)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    arm.scale = rest_scale
    bpy.context.view_layer.update()

    report.update(repair_islands(body, arm))

    for bone, indices in prop_sets:
        if not indices:
            print(f'! prop bound to {bone} matched no vertices')
        bind_rigid(body, indices, bone)

    report['weapons'] = [place_weapon(body, arm, w, units, scale) for w in weapons]
    if report['weapons']:
        report.update(merge_materials(body, tmp_dir))
    else:
        single_texture(body, tmp_dir)
    restore_action(arm, held_action)

    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    arm.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=out_path, export_format='GLB', use_selection=True,
        export_animations=True, export_skins=True, export_yup=True,
        export_image_format='AUTO', export_apply=False,
    )

    report.update({
        'out': out_path,
        'vertices': len(body.data.vertices),
        'joints': len(arm.data.bones),
        'clips': sorted(a.name for a in bpy.data.actions),
        'propVertices': {bone: len(idx) for bone, idx in prop_sets},
        'bodyTopFraction': round(top_fraction, 5),
        'scale': scale,
        'tpose': tpose,
    })
    print('CAST_RIG ' + json.dumps(report))


main()
