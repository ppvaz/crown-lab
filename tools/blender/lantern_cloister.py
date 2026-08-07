





import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import crown_kit


SLAB_DEPTH = 0.55
ARCHES_PER_WALL = 3
PIER_FRACTION = 0.30
PIER_DEPTH = 0.8
COPING_DEPTH = 0.95

LANTERN_SIZE = 0.54
LANTERN_HANG = 3.45
LANTERN_BODY_HEIGHT = 0.72
LANTERN_FRAME = 0.055
CHAIN_WIDTH = 0.024
CHAIN_LINKS = 5

BRAZIER_SIZE = 0.85
BRAZIER_HEIGHT = 1.15
BRAZIER_INSET = 1.1

ARCH_SEGMENTS = 9
ARCH_TRIM = 0.18
BANNER_WIDTH = 0.95
BANNER_TOP = 3.72
BANNER_BOTTOM = 1.85
FLOOR_RING_RADII = (3.25, 5.05, 6.15)
FLOOR_RING_WIDTH = 0.055



STONE = (0.058, 0.066, 0.100)
STONE_LIGHT = (0.105, 0.118, 0.160)
STONE_JOINT = (0.028, 0.032, 0.050)
FLOOR = (0.030, 0.030, 0.052)
FLOOR_JOINT = (0.016, 0.016, 0.030)
SLAB = (0.020, 0.023, 0.038)
WOOD = (0.148, 0.092, 0.052)
WOOD_JOINT = (0.070, 0.042, 0.024)
GOLD = (0.62, 0.44, 0.13)
DARK_METAL = (0.045, 0.034, 0.025)
CLOTH = (0.58, 0.52, 0.40)
FLAME = (1.0, 0.62, 0.22)
FLAME_HOT = (1.0, 0.88, 0.38)

LANTERN_ENERGY = 180.0
TORCH_ENERGY = 280.0

AMBIENT_FILL = (0.120, 0.144, 0.232)

FLAME_EMISSION = 3.2
FLAME_HOT_EMISSION = 4.6

def _materials():



    return {
        "stone": crown_kit.toon_material(
            "cloister-stone",
            STONE,
            joint=list(STONE_JOINT),
            pattern="courses",
            block=(1.15, 0.42),
            joint_size=0.030,
        ),
        "coping": crown_kit.toon_material(
            "cloister-coping",
            STONE_LIGHT,
            joint=list(STONE_JOINT),
            pattern="courses",
            block=(1.75, 0.55),
            joint_size=0.026,
        ),
        "floor": crown_kit.toon_material(
            "cloister-floor",
            FLOOR,
            joint=list(FLOOR_JOINT),
            pattern="tiles",
            block=(1.35, 1.35),
            joint_size=0.020,
            roughness=0.78,
        ),
        "slab": crown_kit.masonry_material(
            "cloister-slab",
            SLAB,
            SLAB,
            block=(0.8, 0.55),
            roughness=0.95,
        ),
        "wood": crown_kit.toon_material(
            "cloister-wood",
            WOOD,
            joint=list(WOOD_JOINT),
            pattern="planks",
            block=(3.2, 0.40),
            joint_size=0.018,
            roughness=0.84,
        ),
        "gold": crown_kit.metal_material("cloister-gold", GOLD),
        "iron": crown_kit.metal_material(
            "cloister-dark-metal", DARK_METAL, roughness=0.42, variation=0.16
        ),
        "cloth": crown_kit.toon_material(
            "cloister-banner-cloth", CLOTH, pattern="flat", roughness=0.94
        ),
        "flame": crown_kit.flame_material("cloister-flame", FLAME, strength=FLAME_EMISSION),
        "flame_hot": crown_kit.flame_material(
            "cloister-flame-hot", FLAME_HOT, strength=FLAME_HOT_EMISSION, scale=7.0
        ),
    }


def _ngon(cx, cy, radius, sides=8, rotation=math.pi / 8.0):
    return [
        (
            cx + math.cos(rotation + 2.0 * math.pi * i / sides) * radius,
            cy + math.sin(rotation + 2.0 * math.pi * i / sides) * radius,
        )
        for i in range(sides)
    ]


def _prism_part(poly, bottom_h, top_h, mat):
    n = len(poly)
    verts = [(x, y, top_h) for x, y in poly] + [(x, y, bottom_h) for x, y in poly]
    faces = [list(range(n)), [i + n for i in reversed(range(n))]]
    faces += [[i, (i + 1) % n, (i + 1) % n + n, i + n] for i in range(n)]
    return verts, faces, mat


def _box_part(cx, cy, sx, sy, bottom_h, top_h, mat):
    return _prism_part(
        [
            (cx - sx / 2.0, cy - sy / 2.0),
            (cx + sx / 2.0, cy - sy / 2.0),
            (cx + sx / 2.0, cy + sy / 2.0),
            (cx - sx / 2.0, cy + sy / 2.0),
        ],
        bottom_h,
        top_h,
        mat,
    )


def _frustum_part(cx, cy, bottom_radius, top_radius, bottom_h, top_h, mat, sides=8):
    bottom = _ngon(cx, cy, bottom_radius, sides)
    top = _ngon(cx, cy, top_radius, sides)
    verts = [(x, y, bottom_h) for x, y in bottom] + [(x, y, top_h) for x, y in top]
    faces = [[i, (i + 1) % sides, (i + 1) % sides + sides, i + sides] for i in range(sides)]
    faces += [[i for i in reversed(range(sides))], [i + sides for i in range(sides)]]
    return verts, faces, mat


def _oriented_box_part(cx, cy, ux, uy, length, width, bottom_h, top_h, mat):
    vx, vy = -uy, ux
    hl, hw = length / 2.0, width / 2.0
    return _prism_part(
        [
            (cx - ux * hl - vx * hw, cy - uy * hl - vy * hw),
            (cx + ux * hl - vx * hw, cy + uy * hl - vy * hw),
            (cx + ux * hl + vx * hw, cy + uy * hl + vy * hw),
            (cx - ux * hl + vx * hw, cy - uy * hl + vy * hw),
        ],
        bottom_h,
        top_h,
        mat,
    )


def _oriented_rect(cx, cy, ux, uy, length, width):
    vx, vy = -uy, ux
    hl, hw = length / 2.0, width / 2.0
    return [
        (cx - ux * hl - vx * hw, cy - uy * hl - vy * hw),
        (cx + ux * hl - vx * hw, cy + uy * hl - vy * hw),
        (cx + ux * hl + vx * hw, cy + uy * hl + vy * hw),
        (cx - ux * hl + vx * hw, cy - uy * hl + vy * hw),
    ]


def _wall_panel_part(cx, cy, tangent, inward, profile, back_offset, front_offset, mat):
    ux, uy = tangent
    nx, ny = inward
    back = [
        (cx + ux * u + nx * back_offset, cy + uy * u + ny * back_offset, h)
        for u, h in profile
    ]
    front = [
        (cx + ux * u + nx * front_offset, cy + uy * u + ny * front_offset, h)
        for u, h in profile
    ]
    n = len(profile)
    verts = back + front
    faces = [list(reversed(range(n))), [i + n for i in range(n)]]
    faces += [[i, (i + 1) % n, (i + 1) % n + n, i + n] for i in range(n)]
    return verts, faces, mat


def _annulus_part(cx, cy, radius, width, bottom_h, top_h, mat, sides=64):
    outer = _ngon(cx, cy, radius + width / 2.0, sides, rotation=0.0)
    inner = _ngon(cx, cy, radius - width / 2.0, sides, rotation=0.0)
    verts = (
        [(x, y, top_h) for x, y in outer]
        + [(x, y, top_h) for x, y in inner]
        + [(x, y, bottom_h) for x, y in outer]
        + [(x, y, bottom_h) for x, y in inner]
    )
    faces = []
    for i in range(sides):
        j = (i + 1) % sides
        faces += [
            [i, j, sides + j, sides + i],
            [i, sides * 2 + i, sides * 2 + j, j],
            [sides + i, sides + j, sides * 3 + j, sides * 3 + i],
            [sides * 2 + i, sides * 3 + i, sides * 3 + j, sides * 2 + j],
        ]
    return verts, faces, mat


def _star_points(cx, cy, outer, inner, points=4, rotation=math.pi / 4.0):
    return [
        (
            cx + math.cos(rotation + math.pi * i / points) * (outer if i % 2 == 0 else inner),
            cy + math.sin(rotation + math.pi * i / points) * (outer if i % 2 == 0 else inner),
        )
        for i in range(points * 2)
    ]


def _floor_plaque_parts(cx, cy, tangent, mats):
    ux, uy = tangent
    outer = _oriented_rect(cx, cy, ux, uy, 0.58, 0.42)
    inner = _oriented_rect(cx, cy, ux, uy, 0.46, 0.30)
    return [
        _prism_part(outer, 0.003, 0.014, mats["gold"]),
        _prism_part(inner, 0.014, 0.020, mats["floor"]),
        _prism_part(_star_points(cx, cy, 0.13, 0.045), 0.020, 0.027, mats["gold"]),
    ]


def _floor_inlays(centre, runs, k, into, mats):
    cx, cy = centre
    parts = [
        _annulus_part(
            cx, cy, radius, FLOOR_RING_WIDTH, 0.002, 0.014, mats["gold"]
        )
        for radius in FLOOR_RING_RADII
    ]
    parts += [
        _prism_part(_ngon(cx, cy, 0.86, 32, rotation=0.0), 0.003, 0.014, mats["gold"]),
        _prism_part(_ngon(cx, cy, 0.70, 32, rotation=0.0), 0.014, 0.020, mats["floor"]),
        _prism_part(_star_points(cx, cy, 0.48, 0.16, points=8), 0.020, 0.030, mats["gold"]),
    ]

    for dx, dy, tangent in (
        (4.45, 0.0, (0.0, 1.0)),
        (-4.45, 0.0, (0.0, 1.0)),
        (0.0, 4.45, (1.0, 0.0)),
        (0.0, -4.45, (1.0, 0.0)),
    ):
        parts.extend(_floor_plaque_parts(cx + dx, cy + dy, tangent, mats))

    for a, b in runs:
        span = math.hypot(b[0] - a[0], b[1] - a[1])
        tangent = ((b[0] - a[0]) / span, (b[1] - a[1]) / span)
        inward = _inward(a, b, centre)
        for t in (1.0 / 3.0, 2.0 / 3.0):
            px, py = crown_kit.lerp2(a, b, t)
            px += inward[0] * 1.05
            py += inward[1] * 1.05
            parts.extend(_floor_plaque_parts(px, py, tangent, mats))

    crown_kit.multipart_mesh_from_world("floor-inlays", parts, k, into)


def _arch_ring_parts(cx, cy, tangent, inward, inner_radius, spring_h, half_depth, mats):
    parts = []
    outer_radius = inner_radius + ARCH_TRIM
    for index in range(ARCH_SEGMENTS):
        a0 = math.pi * index / ARCH_SEGMENTS
        a1 = math.pi * (index + 1) / ARCH_SEGMENTS
        profile = [
            (math.cos(a0) * outer_radius, spring_h + math.sin(a0) * outer_radius),
            (math.cos(a1) * outer_radius, spring_h + math.sin(a1) * outer_radius),
            (math.cos(a1) * inner_radius, spring_h + math.sin(a1) * inner_radius),
            (math.cos(a0) * inner_radius, spring_h + math.sin(a0) * inner_radius),
        ]
        parts.append(
            _wall_panel_part(
                cx,
                cy,
                tangent,
                inward,
                profile,
                -half_depth,
                half_depth + 0.035,
                mats["coping"],
            )
        )
    crown = spring_h + outer_radius
    keystone = [
        (-0.12, crown - ARCH_TRIM * 1.20),
        (0.12, crown - ARCH_TRIM * 1.20),
        (0.18, crown + 0.10),
        (-0.18, crown + 0.10),
    ]
    parts.append(
        _wall_panel_part(
            cx,
            cy,
            tangent,
            inward,
            keystone,
            half_depth + 0.035,
            half_depth + 0.10,
            mats["gold"],
        )
    )
    return parts


def _banner_parts(cx, cy, tangent, inward, half_depth, mats):
    ux, uy = tangent
    nx, ny = inward
    front = half_depth + 0.085
    cloth = [
        (-BANNER_WIDTH / 2.0, BANNER_TOP),
        (BANNER_WIDTH / 2.0, BANNER_TOP),
        (BANNER_WIDTH / 2.0, BANNER_BOTTOM + 0.18),
        (0.0, BANNER_BOTTOM),
        (-BANNER_WIDTH / 2.0, BANNER_BOTTOM + 0.18),
    ]
    parts = [
        _wall_panel_part(
            cx, cy, tangent, inward, cloth, half_depth + 0.045, front, mats["cloth"]
        )
    ]
    rod_cx, rod_cy = cx + nx * (front + 0.02), cy + ny * (front + 0.02)
    parts.append(
        _oriented_box_part(
            rod_cx,
            rod_cy,
            ux,
            uy,
            BANNER_WIDTH + 0.30,
            0.055,
            BANNER_TOP + 0.08,
            BANNER_TOP + 0.14,
            mats["wood"],
        )
    )
    for sign in (-1.0, 1.0):
        ex = rod_cx + ux * (BANNER_WIDTH / 2.0 + 0.18) * sign
        ey = rod_cy + uy * (BANNER_WIDTH / 2.0 + 0.18) * sign
        parts.append(
            _prism_part(
                _ngon(ex, ey, 0.055),
                BANNER_TOP + 0.06,
                BANNER_TOP + 0.16,
                mats["gold"],
            )
        )
    star = _star_points(0.0, (BANNER_TOP + BANNER_BOTTOM) / 2.0, 0.19, 0.065)
    parts.append(
        _wall_panel_part(
            cx,
            cy,
            tangent,
            inward,
            star,
            front,
            front + 0.025,
            mats["gold"],
        )
    )
    return parts


def _flame_part(cx, cy, radius, bottom_h, tip_h, mat, lean=(0.0, 0.0), sides=6):
    shoulder_h = bottom_h + (tip_h - bottom_h) * 0.46
    bottom = _ngon(cx, cy, radius, sides, rotation=0.0)
    shoulder = _ngon(
        cx + lean[0] * 0.35,
        cy + lean[1] * 0.35,
        radius * 0.62,
        sides,
        rotation=math.pi / sides,
    )
    verts = (
        [(x, y, bottom_h) for x, y in bottom]
        + [(x, y, shoulder_h) for x, y in shoulder]
        + [(cx + lean[0], cy + lean[1], tip_h)]
    )
    tip = sides * 2
    faces = [[i for i in reversed(range(sides))]]
    faces += [[i, (i + 1) % sides, (i + 1) % sides + sides, i + sides] for i in range(sides)]
    faces += [[i + sides, (i + 1) % sides + sides, tip] for i in range(sides)]
    return verts, faces, mat


def _chain_parts(cx, cy, bottom_h, top_h, tangent, mat):
    ux0, uy0 = tangent
    link_h = (top_h - bottom_h) / CHAIN_LINKS
    parts = []
    for index in range(CHAIN_LINKS):
        ux, uy = (ux0, uy0) if index % 2 == 0 else (-uy0, ux0)
        link_bottom = bottom_h + index * link_h
        link_top = link_bottom + link_h * 1.08
        half_width = CHAIN_WIDTH * 1.35
        for sign in (-1.0, 1.0):
            parts.append(
                _box_part(
                    cx + ux * half_width * sign,
                    cy + uy * half_width * sign,
                    CHAIN_WIDTH,
                    CHAIN_WIDTH,
                    link_bottom + CHAIN_WIDTH,
                    link_top - CHAIN_WIDTH,
                    mat,
                )
            )
        for z in (link_bottom + CHAIN_WIDTH / 2.0, link_top - CHAIN_WIDTH / 2.0):
            parts.append(
                _oriented_box_part(
                    cx,
                    cy,
                    ux,
                    uy,
                    half_width * 2.0 + CHAIN_WIDTH,
                    CHAIN_WIDTH,
                    z - CHAIN_WIDTH / 2.0,
                    z + CHAIN_WIDTH / 2.0,
                    mat,
                )
            )
    return parts


def _detailed_lantern(name, cx, cy, bottom_h, top_h, chain_top_h, tangent, k, into, mats):
    core_bottom = bottom_h + 0.14
    core_top = top_h - 0.14
    half = LANTERN_SIZE * 0.36
    parts = [
        _prism_part(_ngon(cx, cy, half), core_bottom, core_top, mats["flame"]),
        _prism_part(_ngon(cx, cy, LANTERN_SIZE * 0.50), bottom_h, bottom_h + 0.10, mats["iron"]),
        _prism_part(
            _ngon(cx, cy, LANTERN_SIZE * 0.56),
            bottom_h + 0.08,
            bottom_h + 0.13,
            mats["gold"],
        ),
        _prism_part(
            _ngon(cx, cy, LANTERN_SIZE * 0.52),
            top_h - 0.13,
            top_h - 0.08,
            mats["gold"],
        ),
        _frustum_part(
            cx,
            cy,
            LANTERN_SIZE * 0.55,
            LANTERN_SIZE * 0.24,
            top_h - 0.09,
            top_h + 0.13,
            mats["iron"],
        ),
        _prism_part(
            _ngon(cx, cy, LANTERN_SIZE * 0.13),
            top_h + 0.13,
            top_h + 0.23,
            mats["gold"],
        ),
        _frustum_part(
            cx,
            cy,
            LANTERN_SIZE * 0.08,
            0.0,
            bottom_h - 0.13,
            bottom_h,
            mats["gold"],
        ),
    ]
    post_offset = LANTERN_SIZE * 0.32
    for dx, dy in (
        (-post_offset, -post_offset),
        (post_offset, -post_offset),
        (post_offset, post_offset),
        (-post_offset, post_offset),
    ):
        parts.append(
            _box_part(
                cx + dx,
                cy + dy,
                LANTERN_FRAME,
                LANTERN_FRAME,
                core_bottom - 0.02,
                core_top + 0.02,
                mats["iron"],
            )
        )
    parts.extend(_chain_parts(cx, cy, top_h + 0.21, chain_top_h, tangent, mats["gold"]))
    return crown_kit.emits(crown_kit.multipart_mesh_from_world(name, parts, k, into))


def _detailed_brazier(name, cx, cy, k, into, mats):

    s = BRAZIER_SIZE
    parts = [
        _box_part(cx, cy, s * 0.80, s * 0.80, 0.0, 0.10, mats["stone"]),
        _box_part(cx, cy, s * 0.62, s * 0.62, 0.10, 0.17, mats["gold"]),
        _box_part(cx, cy, s * 0.46, s * 0.46, 0.17, 0.88, mats["iron"]),
        _box_part(cx, cy, s * 0.58, s * 0.58, 0.88, 0.97, mats["gold"]),
        _box_part(cx, cy, s * 0.40, s * 0.40, 0.97, 1.03, mats["iron"]),
    ]
    parts += [
        _flame_part(cx, cy, s * 0.15, 1.02, BRAZIER_HEIGHT + 0.40, mats["flame"], (0.03, -0.04)),
        _flame_part(
            cx,
            cy - s * 0.03,
            s * 0.08,
            1.04,
            BRAZIER_HEIGHT + 0.16,
            mats["flame_hot"],
            (-0.03, 0.02),
        ),
    ]
    return crown_kit.multipart_mesh_from_world(name, parts, k, into)


def _polygon(contract):
    verts = contract["arena"].get("vertices")
    if verts:
        return [(float(v["x"]), float(v["y"])) for v in verts]
    h = contract["arena"]["halfExtents"]
    hx, hy = float(h["x"]), float(h["y"])
    return [(-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy)]


def _edges(poly):


    n = len(poly)
    depth = lambda i: poly[i][0] + poly[i][1] + poly[(i + 1) % n][0] + poly[(i + 1) % n][1]
    far = min(range(n), key=depth)
    near = max(range(n), key=depth)
    return {
        "far_chamfer": (poly[far], poly[(far + 1) % n]),
        "near_chamfer": (poly[near], poly[(near + 1) % n]),
        "runs": (
            (poly[(far - 1) % n], poly[far]),
            (poly[(far + 1) % n], poly[(far + 2) % n]),
        ),
    }


def _inward(a, b, centre):
    span = ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5
    nx, ny = -(b[1] - a[1]) / span, (b[0] - a[0]) / span
    mid = ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)
    if (centre[0] - mid[0]) * nx + (centre[1] - mid[1]) * ny < 0:
        return -nx, -ny
    return nx, ny


def _wall_run(name, a, b, wall_h, k, centre, into=None, mats=None):

    n = ARCHES_PER_WALL
    span = ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5
    nx, ny = _inward(a, b, centre)

    def at(t, off):
        p = crown_kit.lerp2(a, b, t)
        return (p[0] + nx * off, p[1] + ny * off)

    tangent = ((b[0] - a[0]) / span, (b[1] - a[1]) / span)
    pier_h = wall_h - COPING_DEPTH
    hw = PIER_FRACTION / (2.0 * n)
    hd = PIER_DEPTH / 2.0
    details = []
    for i in range(n + 1):
        t = i / n
        poly = [at(t - hw, -hd), at(t + hw, -hd), at(t + hw, hd), at(t - hw, hd)]
        crown_kit.paint(crown_kit.prism(f"{name}-pier-{i}", poly, 0.0, pier_h, k, into),
                        mats["stone"])
        cap_hw = hw * 1.16
        cap_hd = hd * 1.14
        cap = [
            at(t - cap_hw, -cap_hd),
            at(t + cap_hw, -cap_hd),
            at(t + cap_hw, cap_hd),
            at(t - cap_hw, cap_hd),
        ]
        details += [
            _prism_part(cap, 0.0, 0.18, mats["coping"]),
            _prism_part(cap, 0.18, 0.235, mats["gold"]),
            _prism_part(cap, pier_h - 0.25, pier_h - 0.19, mats["gold"]),
            _prism_part(cap, pier_h - 0.19, pier_h, mats["coping"]),
        ]

    coping = [at(0.0, -hd), at(1.0, -hd), at(1.0, hd), at(0.0, hd)]
    crown_kit.paint(crown_kit.prism(f"{name}-coping", coping, pier_h, wall_h, k, into),
                    mats["coping"])
    cornice = [
        at(-0.012, -hd * 1.10),
        at(1.012, -hd * 1.10),
        at(1.012, hd * 1.10),
        at(-0.012, hd * 1.10),
    ]
    details += [
        _prism_part(cornice, pier_h + 0.08, pier_h + 0.145, mats["gold"]),
        _prism_part(cornice, wall_h - 0.16, wall_h, mats["wood"]),
    ]

    bay = span / n
    pier_width = bay * PIER_FRACTION
    inner_radius = (bay - pier_width) / 2.0
    spring_h = pier_h - inner_radius - ARCH_TRIM - 0.12
    for i in range(n):
        cx, cy = at((i + 0.5) / n, 0.0)
        details.extend(
            _arch_ring_parts(
                cx,
                cy,
                tangent,
                (nx, ny),
                inner_radius,
                spring_h,
                hd,
                mats,
            )
        )

    for i in (1, 2):
        cx, cy = at(i / n, 0.0)
        details.extend(_banner_parts(cx, cy, tangent, (nx, ny), hd, mats))

    crown_kit.multipart_mesh_from_world(f"{name}-architectural-detail", details, k, into)

    for i in range(n):
        t = (i + 0.5) / n
        cx, cy = at(t, 0.0)
        body_bottom = LANTERN_HANG - LANTERN_BODY_HEIGHT / 2.0
        body_top = LANTERN_HANG + LANTERN_BODY_HEIGHT / 2.0
        lamp = _detailed_lantern(
            f"{name}-lantern-{i}",
            cx,
            cy,
            body_bottom,
            body_top,
            pier_h,
            tangent,
            k,
            into,
            mats,
        )
        crown_kit.area_light(f"{name}-lantern-light-{i}", cx, cy, LANTERN_HANG,
                             k, energy=LANTERN_ENERGY, size=1.8, lamp=lamp)


def build(contract, k):
    poly = _polygon(contract)
    wall_h = float(contract["projection"]["wallUnits"])
    mats = _materials()

    crown_kit.world_fill(AMBIENT_FILL)

    architecture = crown_kit.layer("backgroundArchitecture")
    floor = crown_kit.layer("playableFloor")
    props = crown_kit.layer("solidProps")
    occluders = crown_kit.layer("foregroundOccluders")

    crown_kit.paint(crown_kit.prism("floor-slab", poly, -SLAB_DEPTH, -0.02, k, floor), mats["slab"])
    crown_kit.paint(crown_kit.prism("floor-plane", poly, -0.02, 0.0, k, floor), mats["floor"])

    centre = (
        sum(p[0] for p in poly) / len(poly),
        sum(p[1] for p in poly) / len(poly),
    )
    edges = _edges(poly)
    (west, north) = edges["runs"]
    _floor_inlays(centre, edges["runs"], k, floor, mats)
    _wall_run("west", west[0], west[1], wall_h, k, centre, architecture, mats)
    _wall_run("north", north[0], north[1], wall_h, k, centre, architecture, mats)

    a, b = edges["far_chamfer"]
    cnx, cny = _inward(a, b, centre)
    d = PIER_DEPTH
    crown_kit.paint(
        crown_kit.prism(
            "corner-pier",
            [a, b, (b[0] + cnx * d, b[1] + cny * d), (a[0] + cnx * d, a[1] + cny * d)],
            0.0,
            wall_h,
            k,
            architecture,
        ),
        mats["stone"],
    )

    chamfer_span = math.hypot(b[0] - a[0], b[1] - a[1])
    chamfer_tangent = ((b[0] - a[0]) / chamfer_span, (b[1] - a[1]) / chamfer_span)
    mx, my = ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)
    corner_dress = []
    for sign in (-1.0, 1.0):
        corner_dress.extend(
            _banner_parts(
                mx + chamfer_tangent[0] * 1.15 * sign,
                my + chamfer_tangent[1] * 1.15 * sign,
                chamfer_tangent,
                (cnx, cny),
                d - 0.02,
                mats,
            )
        )
    corner_dress.append(
        _wall_panel_part(
            mx,
            my,
            chamfer_tangent,
            (cnx, cny),
            _star_points(0.0, (BANNER_TOP + BANNER_BOTTOM) / 2.0 + 0.10, 0.42, 0.145),
            d + 0.02,
            d + 0.07,
            mats["gold"],
        )
    )
    px = mx + cnx * (PIER_DEPTH + 0.82)
    py = my + cny * (PIER_DEPTH + 0.82)
    ux, uy = chamfer_tangent
    corner_dress += [
        _prism_part(_oriented_rect(px, py, ux, uy, 1.18, 0.74), 0.0, 0.12, mats["stone"]),
        _prism_part(_oriented_rect(px, py, ux, uy, 0.98, 0.60), 0.12, 0.20, mats["gold"]),
        _prism_part(_oriented_rect(px, py, ux, uy, 0.74, 0.46), 0.20, 0.76, mats["wood"]),
        _prism_part(_oriented_rect(px, py, ux, uy, 0.86, 0.54), 0.76, 0.84, mats["gold"]),
        _wall_panel_part(
            px,
            py,
            chamfer_tangent,
            (cnx, cny),
            [(-0.30, 0.84), (0.30, 0.84), (0.26, 1.38), (-0.26, 1.38)],
            -0.16,
            0.16,
            mats["iron"],
        ),
        _wall_panel_part(
            px,
            py,
            chamfer_tangent,
            (cnx, cny),
            _star_points(0.0, 1.10, 0.16, 0.055),
            0.16,
            0.19,
            mats["gold"],
        ),
    ]
    crown_kit.multipart_mesh_from_world("corner-dressing", corner_dress, k, architecture)
    spots = []
    for label, (ra, rb) in (("left", west), ("right", north)):
        free, inner = (ra, rb) if label == "left" else (rb, ra)
        span = ((inner[0] - free[0]) ** 2 + (inner[1] - free[1]) ** 2) ** 0.5
        ux, uy = (inner[0] - free[0]) / span, (inner[1] - free[1]) / span
        bnx, bny = _inward(ra, rb, centre)
        spots.append((label, (free[0] + ux * BRAZIER_INSET + bnx * BRAZIER_INSET,
                              free[1] + uy * BRAZIER_INSET + bny * BRAZIER_INSET)))
    na, nb = edges["near_chamfer"]
    spots.append(("front", ((na[0] + nb[0]) / 2.0, (na[1] + nb[1]) / 2.0)))

    for label, (bx, by) in spots:
        into = occluders if label == "front" else props
        torch = _detailed_brazier(f"torch-{label}", bx, by, k, into, mats)
        crown_kit.area_light(f"torch-{label}-light", bx, by, BRAZIER_HEIGHT + 0.4,
                             k, energy=TORCH_ENERGY, size=2.4, lamp=torch)
