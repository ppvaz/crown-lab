















import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

LEFT = Vector((1, 0, 0))
FRONT = Vector((0, -1, 0))
UP = Vector((0, 0, 1))

TERM_AXIS = {
    'swing': (LEFT, -1.0),
    'spread': (FRONT, 1.0),
    'turn': (UP, 1.0),
}

AXIS_PROBES = (
    ('swing', 'RightArm', 'RightHand', FRONT),
    ('swing', 'LeftArm', 'LeftHand', FRONT),
    ('spread', 'LeftArm', 'LeftHand', LEFT),
    ('spread', 'LeftUpLeg', 'LeftToeBase', LEFT),
    ('turn', 'Spine02', 'RightHand', FRONT),
)

ROOT_BONE = 'Hips'

TRANSLATION_AXIS = {'push': FRONT, 'drift': LEFT, 'lift': UP}


def clean_argv():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = {}
    for a in argv:
        key, _, value = a.lstrip('-').partition('=')
        out[key] = value if value else 'true'
    return out


def find_armature():
    arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
    if arm is None:
        raise SystemExit('! the file has no armature, so there is nothing to pose')
    return arm


def clear_pose(arm):
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()


def world_of(arm, bone):
    return arm.matrix_world @ arm.pose.bones[bone].matrix.translation



def basis_for(arm, bone, terms):
    rotation = Matrix.Identity(3)
    for term in ('turn', 'spread', 'swing'):
        degrees = terms.get(term, 0.0)
        if abs(degrees) < 1e-9:
            continue
        axis, sign = TERM_AXIS[term]
        rotation = Matrix.Rotation(math.radians(degrees) * sign, 3, axis) @ rotation

    local = arm.data.bones[bone].matrix_local.to_3x3()
    basis = (local.inverted() @ rotation @ local).to_4x4()

    twist = terms.get('twist', 0.0)
    if abs(twist) > 1e-9:
        basis = basis @ Matrix.Rotation(math.radians(twist), 4, 'Y')
    return basis


def apply_pose(arm, key, unit_scale):
    clear_pose(arm)
    for bone, terms in key['bones'].items():
        if bone not in arm.pose.bones:
            raise SystemExit(f'! the vocabulary names {bone}, which this rig does not have')
        arm.pose.bones[bone].matrix_basis = basis_for(arm, bone, terms)

    root = key.get('root') or {}
    if root:
        offset = Vector((0, 0, 0))
        for term, metres in root.items():
            if term not in TRANSLATION_AXIS:
                raise SystemExit(f'! {term} is not a root translation')
            offset = offset + TRANSLATION_AXIS[term] * metres
        pb = arm.pose.bones[ROOT_BONE]
        local = arm.data.bones[ROOT_BONE].matrix_local.to_3x3()
        pb.location = local.inverted() @ (offset * unit_scale)
    bpy.context.view_layer.update()


def action_fcurves(action):

    legacy = getattr(action, 'fcurves', None)
    if legacy is not None:
        return list(legacy)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                curves.extend(bag.fcurves)
    return curves


def key_action(arm, action, clip, unit_scale, fps):
    arm.animation_data.action = action
    slots = getattr(action, 'slots', None)
    if slots is not None:
        slot = slots.new(id_type='OBJECT', name=arm.name) if len(slots) == 0 else slots[0]
        arm.animation_data.action_slot = slot

    frames = max(2, int(round(clip['seconds'] * fps)))
    written = []
    for key in clip['keys']:
        frame = 1 + key['at'] * (frames - 1)
        apply_pose(arm, key, unit_scale)
        for pb in arm.pose.bones:
            pb.keyframe_insert('rotation_quaternion', frame=frame, group=pb.name)
        arm.pose.bones[ROOT_BONE].keyframe_insert('location', frame=frame, group=ROOT_BONE)
        written.append((frame, key.get('ease', 'smooth')))

    for curve in action_fcurves(action):
        for point in curve.keyframe_points:
            ease = next((e for f, e in written if abs(f - point.co.x) < 1e-4), 'smooth')
            point.interpolation = 'LINEAR' if ease == 'linear' else 'BEZIER'

    return 1, frames



def verify_axes(arm):
    clear_pose(arm)
    findings = []
    for term, bone, landmark, expect in AXIS_PROBES:
        rest = world_of(arm, landmark)
        arm.pose.bones[bone].matrix_basis = basis_for(arm, bone, {term: 20.0})
        bpy.context.view_layer.update()
        delta = world_of(arm, landmark) - rest
        clear_pose(arm)
        along = delta.dot(expect)
        findings.append({
            'term': term,
            'bone': bone,
            'landmark': landmark,
            'alongExpected': round(along, 4),
            'travelled': round(delta.length, 4),
            'agrees': along > 0 and along > delta.length * 0.5,
        })
    return findings


def plant_keys(arm, clip, unit_scale, rest_toe):

    solved = {}
    for index, key in enumerate(clip['keys']):
        sides = key.get('plant') or []
        if not sides:
            continue
        solve_root(arm, key, unit_scale, sides, rest_toe)
        solved[index] = solve_plant(arm, key, unit_scale, sides, rest_toe)
    return solved


def solve_root(arm, key, unit_scale, sides, rest_toe):

    apply_pose(arm, key, unit_scale)
    excess = min(world_of(arm, TOE[s]).z - rest_toe[s] for s in sides)
    if abs(excess) < 1e-4:
        return 0.0
    root = key.setdefault('root', {})
    root['lift'] = root.get('lift', 0.0) - excess
    return excess


def sample_clip(arm, clip, unit_scale, frames):
    out = []
    for i in range(frames):
        at = i / max(1, frames - 1)
        key = interpolate(clip['keys'], at)
        apply_pose(arm, key, unit_scale)
        joints = {n: world_of(arm, n) for n in (
            'Head', 'Hips', 'LeftHand', 'RightHand', 'LeftToeBase', 'RightToeBase')}
        out.append((at, joints))
    return out


def interpolate(keys, at):

    if at <= keys[0]['at']:
        return keys[0]
    if at >= keys[-1]['at']:
        return keys[-1]
    for a, b in zip(keys, keys[1:]):
        if a['at'] <= at <= b['at']:
            span = max(1e-9, b['at'] - a['at'])
            t = (at - a['at']) / span
            bones = {}
            for bone in set(a['bones']) | set(b['bones']):
                terms = {}
                for term in set(a['bones'].get(bone, {})) | set(b['bones'].get(bone, {})):
                    lo = a['bones'].get(bone, {}).get(term, 0.0)
                    hi = b['bones'].get(bone, {}).get(term, 0.0)
                    terms[term] = lo + (hi - lo) * t
                bones[bone] = terms
            root = {}
            for term in set(a.get('root') or {}) | set(b.get('root') or {}):
                lo = (a.get('root') or {}).get(term, 0.0)
                hi = (b.get('root') or {}).get(term, 0.0)
                root[term] = lo + (hi - lo) * t
            return {'bones': bones, 'root': root}
    return keys[-1]


def measure_clip(arm, role, clip, unit_scale, bind, rest_toe, samples=24):
    walk = sample_clip(arm, clip, unit_scale, samples)
    heads = [j['Head'].z for _, j in walk]
    report = {
        'headHeight': {
            'min': round(min(heads), 4),
            'max': round(max(heads), 4),
            'ofBind': round(sum(heads) / len(heads) / max(1e-9, bind['head']), 4),
        },
        'handClearance': round(min(
            min((j['LeftHand'] - j['Hips']).length, (j['RightHand'] - j['Hips']).length)
            for _, j in walk), 4),
    }
    if clip.get('gait') is True:
        report['foot'] = foot_skate(walk, rest_toe)
    if clip.get('phases') is not None:
        report['swing'] = measure_swing(walk, clip['phases'])
    if clip.get('loop') is True:
        first, last = walk[0][1], walk[-1][1]
        report['loopGap'] = round(max((first[n] - last[n]).length for n in first), 5)
    return report


TOE = {'L': 'LeftToeBase', 'R': 'RightToeBase'}
KNEE = {'L': 'LeftLeg', 'R': 'RightLeg'}

GROUND_MARGIN = 0.03

PLANT_TOLERANCE = 0.005


def solve_plant(arm, key, unit_scale, sides, rest_toe):



    solved = {}
    for side in sides:
        knee, toe = KNEE[side], TOE[side]
        terms = key['bones'].setdefault(knee, {})
        authored = terms.get('swing', 0.0)

        def toe_z(swing):
            terms['swing'] = swing
            apply_pose(arm, key, unit_scale)
            return world_of(arm, toe).z

        target = rest_toe[side]
        span = [-140.0 + i * (180.0 / 60) for i in range(61)]
        heights = [toe_z(a) - target for a in span]
        crossings = [(span[i], span[i + 1]) for i in range(len(span) - 1)
                     if heights[i] == 0 or heights[i] * heights[i + 1] < 0]
        if not crossings:
            terms['swing'] = authored
            nearest = min(heights, key=abs)
            solved[side] = {
                'reached': abs(nearest) <= PLANT_TOLERANCE,
                'authored': round(authored, 1),
                'nearest': round(nearest, 4),
            }
            continue
        lo, hi = min(crossings, key=lambda c: abs((c[0] + c[1]) / 2 - authored))
        for _ in range(24):
            mid = (lo + hi) / 2
            if (toe_z(lo) - target) * (toe_z(mid) - target) <= 0:
                hi = mid
            else:
                lo = mid
        terms['swing'] = (lo + hi) / 2
        solved[side] = {
            'reached': True,
            'authored': round(authored, 1),
            'solved': round(terms['swing'], 1),
        }
    return solved


def foot_skate(walk, rest_toe):


    contacts = 0
    wrong = 0
    for (_, a), (_, b) in zip(walk, walk[1:]):
        forward = (b['Hips'] - a['Hips']).dot(FRONT.to_3d())
        for side, toe in TOE.items():
            if min(a[toe].z, b[toe].z) >= rest_toe[side] + GROUND_MARGIN:
                continue
            if b[toe].z - a[toe].z > 0.002:
                continue
            contacts += 1
            travel = (b[toe] - a[toe]).dot(FRONT.to_3d()) - forward
            if travel > 1e-4:
                wrong += 1
    return {'contacts': contacts, 'skating': round(wrong / contacts, 4) if contacts else None}


def measure_swing(walk, phases):


    reach = [j['RightHand'] for _, j in walk]
    at = [a for a, _ in walk]
    speeds = [(reach[i + 1] - reach[i]).length for i in range(len(reach) - 1)]
    if not speeds or max(speeds) <= 1e-9:
        return {'declaredContact': phases['contact'], 'measuredContact': None, 'contactDrift': None}

    peak = max(range(len(speeds)), key=lambda i: speeds[i])
    top = speeds[peak]

    def first_below(fraction, start):
        for i in range(start, len(speeds)):
            if speeds[i] < top * fraction:
                return at[i]
        return at[-1]

    contact = first_below(0.5, peak)
    settle = first_below(0.1, peak)
    return {
        'declaredContact': phases['contact'],
        'measuredContact': round(contact, 3),
        'contactDrift': round(contact - phases['contact'], 3),
        'declaredSettle': phases['settle'],
        'measuredSettle': round(settle, 3),
        'peakSpeedAt': round(at[peak], 3),
    }


def rest_asymmetry(arm):
    out = {}
    for left in [b.name for b in arm.data.bones if b.name.startswith('Left')]:
        right = 'Right' + left[len('Left'):]
        if right not in arm.data.bones:
            continue
        a, b = arm.data.bones[left], arm.data.bones[right]
        longer, shorter = max(a.length, b.length), min(a.length, b.length)
        out[left[len('Left'):]] = {
            'lengthRatio': round(longer / max(1e-9, shorter), 3),
            'headMirrorError': round(
                (a.head_local - Vector((-b.head_local.x, b.head_local.y, b.head_local.z))).length, 3),
        }
    return out



def main():
    opt = clean_argv()
    spec = json.load(open(os.path.expanduser(opt['spec'])))
    out_path = os.path.expanduser(opt['out']) if 'out' in opt else None
    replace = opt.get('replace') == 'true'

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.expanduser(opt['glb']), bone_heuristic='TEMPERANCE')
    arm = find_armature()
    fps = int(spec.get('fps', 30))
    bpy.context.scene.render.fps = fps

    borrowed = [a.name for a in bpy.data.actions]
    arm.animation_data_clear()
    arm.animation_data_create()
    clear_pose(arm)

    unit_scale = 1.0 / arm.scale.x
    bind = {'head': world_of(arm, 'Head').z}
    rest_toe = {side: world_of(arm, name).z for side, name in TOE.items()}

    axes = verify_axes(arm)
    disagree = [f'{f["term"]} on {f["bone"]}' for f in axes if not f['agrees']]

    report = {
        'body': spec.get('body', '?'),
        'fps': fps,
        'borrowed': borrowed,
        'bindHeadHeight': round(bind['head'], 4),
        'restToe': {k: round(v, 4) for k, v in rest_toe.items()},
        'unitScale': round(unit_scale, 4),
        'axisCheck': axes,
        'restAsymmetry': rest_asymmetry(arm),
        'clips': {},
    }

    if disagree:
        print('! the vocabulary and this rig disagree about: ' + ', '.join(disagree))
        print('CAST_CLIPS ' + json.dumps(report))
        raise SystemExit(2)

    for role, clip in spec['clips'].items():
        planted = plant_keys(arm, clip, unit_scale, rest_toe)
        unreachable = [f'{role} key {i} {s}' for i, sides in planted.items()
                       for s, r in sides.items() if not r['reached']]
        if unreachable:
            print('! a planted foot could not reach the floor: ' + ', '.join(unreachable))
        report['clips'][role] = measure_clip(arm, role, clip, unit_scale, bind, rest_toe)
        report['clips'][role]['planted'] = planted

    if opt.get('dry') == 'true':
        clear_pose(arm)
        print('CAST_CLIPS ' + json.dumps(report))
        return

    if replace:
        for name in borrowed:
            action = bpy.data.actions.get(name)
            if action is not None:
                bpy.data.actions.remove(action)

    written = []
    for role, clip in spec['clips'].items():
        action = bpy.data.actions.new(role)
        action.use_fake_user = True
        start, end = key_action(arm, action, clip, unit_scale, fps)
        written.append({'role': role, 'frames': [start, end]})
    report['written'] = written

    clear_pose(arm)
    arm.animation_data.action = None

    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=out_path, export_format='GLB', use_selection=True,
        export_animations=True, export_skins=True, export_yup=True,
        export_image_format='AUTO', export_apply=False,
    )
    report['out'] = out_path
    report['clipsInFile'] = sorted(a.name for a in bpy.data.actions)
    print('CAST_CLIPS ' + json.dumps(report))


main()
