import math

import crown_kit


SLAB_DEPTH = 0.50
WALL_DEPTH = 0.76
PLINTH_H = 0.48
CAP_DEPTH = 0.28
KERB_H = 0.20
KERB_DEPTH = 0.46

WINDOW_W = 1.05
WINDOW_H = 2.55
WINDOW_SILL = 1.35

STONE = (0.045, 0.052, 0.082)
STONE_LIGHT = (0.080, 0.094, 0.132)
STONE_JOINT = (0.018, 0.022, 0.038)
FLOOR = (0.025, 0.030, 0.050)
FLOOR_JOINT = (0.012, 0.015, 0.028)
SLAB = (0.016, 0.019, 0.032)
GOLD = (0.50, 0.34, 0.095)
IRON = (0.035, 0.030, 0.030)
CLOTH = (0.035, 0.060, 0.130)
FROST = (0.20, 0.36, 0.58)
FLAME = (1.0, 0.58, 0.18)

AMBIENT_FILL = (0.080, 0.108, 0.180)
LIGHT_EXPOSURE = 0.30
WINDOW_ENERGY = 24.0
SCONCE_ENERGY = 105.0
BRAZIER_ENERGY = 110.0


def _materials():
    return {
        "stone": crown_kit.toon_material(
            "duel-stone", STONE, joint=list(STONE_JOINT), pattern="courses",
            block=(1.0, 0.38), joint_size=0.026,
        ),
        "coping": crown_kit.toon_material(
            "duel-coping", STONE_LIGHT, joint=list(STONE_JOINT), pattern="courses",
            block=(1.45, 0.48), joint_size=0.024,
        ),
        "floor": crown_kit.toon_material(
            "duel-floor", FLOOR, joint=list(FLOOR_JOINT), pattern="tiles",
            block=(1.45, 1.45), joint_size=0.016, roughness=0.82,
        ),
        "slab": crown_kit.masonry_material(
            "duel-slab", SLAB, SLAB, block=(0.8, 0.55), roughness=0.95,
        ),
        "gold": crown_kit.toon_material("duel-gold", GOLD, pattern="flat", roughness=0.76),
        "iron": crown_kit.metal_material("duel-dark-metal", IRON, roughness=0.48, variation=0.10),
        "cloth": crown_kit.toon_material("duel-banner-cloth", CLOTH, pattern="flat", roughness=0.94),
        "window": crown_kit.flame_material("duel-window-frost", FROST, strength=0.32, scale=3.0),
        "flame": crown_kit.flame_material("duel-flame", FLAME, strength=2.2),
    }


def _polygon(contract):
    verts = contract["arena"].get("vertices")
    if verts:
        return [(float(v["x"]), float(v["y"])) for v in verts]
    h = contract["arena"]["halfExtents"]
    hx, hy = float(h["x"]), float(h["y"])
    return [(-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy)]


def _ccw(poly):
    area = sum(
        poly[i][0] * poly[(i + 1) % len(poly)][1]
        - poly[(i + 1) % len(poly)][0] * poly[i][1]
        for i in range(len(poly))
    )
    return poly if area > 0 else poly[::-1]


def _inward(a, b, centre):
    span = math.hypot(b[0] - a[0], b[1] - a[1])
    nx, ny = -(b[1] - a[1]) / span, (b[0] - a[0]) / span
    mid = ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)
    if (centre[0] - mid[0]) * nx + (centre[1] - mid[1]) * ny < 0:
        return -nx, -ny
    return nx, ny


def _frame(a, b, centre):
    span = math.hypot(b[0] - a[0], b[1] - a[1])
    ux, uy = (b[0] - a[0]) / span, (b[1] - a[1]) / span
    nx, ny = _inward(a, b, centre)

    def at(t, off=0.0):
        return (
            a[0] + (b[0] - a[0]) * t + nx * off,
            a[1] + (b[1] - a[1]) * t + ny * off,
        )

    return (ux, uy), (nx, ny), span, at


def _edges_by_depth(poly):
    edges = [(poly[i], poly[(i + 1) % len(poly)]) for i in range(len(poly))]
    return sorted(edges, key=lambda edge: sum(p[0] + p[1] for p in edge))


def _prism_part(poly, bottom_h, top_h, mat):
    n = len(poly)
    verts = [(x, y, bottom_h) for x, y in poly] + [(x, y, top_h) for x, y in poly]
    faces = [list(range(n))[::-1], list(range(n, 2 * n))]
    faces += [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    return verts, faces, mat


def _oriented_rect(cx, cy, ux, uy, length, width):
    vx, vy = -uy, ux
    hl, hw = length / 2.0, width / 2.0
    return [
        (cx - ux * hl - vx * hw, cy - uy * hl - vy * hw),
        (cx + ux * hl - vx * hw, cy + uy * hl - vy * hw),
        (cx + ux * hl + vx * hw, cy + uy * hl + vy * hw),
        (cx - ux * hl + vx * hw, cy - uy * hl + vy * hw),
    ]


def _box_part(cx, cy, sx, sy, bottom_h, top_h, mat):
    return _prism_part(
        [(cx - sx / 2, cy - sy / 2), (cx + sx / 2, cy - sy / 2),
         (cx + sx / 2, cy + sy / 2), (cx - sx / 2, cy + sy / 2)],
        bottom_h, top_h, mat,
    )


def _wall_panel_part(cx, cy, tangent, inward, profile, back, front, mat):
    ux, uy = tangent
    nx, ny = inward
    verts = []
    for off in (back, front):
        for along, h in profile:
            verts.append((cx + ux * along + nx * off, cy + uy * along + ny * off, h))
    n = len(profile)
    faces = [list(range(n))[::-1], list(range(n, 2 * n))]
    faces += [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    return verts, faces, mat


def _flat_polygon(points, h, mat):
    return [(x, y, h) for x, y in points], [list(range(len(points)))[::-1]], mat


def _line_part(a, b, width, h, mat):
    dx, dy = b[0] - a[0], b[1] - a[1]
    span = math.hypot(dx, dy)
    return _flat_polygon(
        _oriented_rect((a[0] + b[0]) / 2, (a[1] + b[1]) / 2,
                       dx / span, dy / span, span, width),
        h, mat,
    )


def _flame_part(cx, cy, radius, bottom_h, tip_h, mat, sides=6):
    verts = [
        (cx + math.cos(2 * math.pi * i / sides) * radius,
         cy + math.sin(2 * math.pi * i / sides) * radius, bottom_h)
        for i in range(sides)
    ] + [(cx, cy, tip_h)]
    faces = [list(range(sides))[::-1]] + [[i, (i + 1) % sides, sides] for i in range(sides)]
    return verts, faces, mat


def _wall(name, a, b, centre, wall_h, windows, sconces, k, into, mats):
    tangent, inward, _, at = _frame(a, b, centre)
    ux, uy = tangent
    nx, ny = inward
    half = WALL_DEPTH / 2
    body = _ccw([at(0, -half), at(1, -half), at(1, half), at(0, half)])
    base = _ccw([at(0, -half * 1.22), at(1, -half * 1.22),
                 at(1, half * 1.22), at(0, half * 1.22)])
    crown_kit.paint(crown_kit.prism(f"{name}-plinth", base, 0, PLINTH_H, k, into), mats["stone"])
    crown_kit.paint(
        crown_kit.prism(f"{name}-body", body, PLINTH_H, wall_h - CAP_DEPTH, k, into),
        mats["stone"],
    )
    crown_kit.paint(
        crown_kit.prism(f"{name}-cornice", base, wall_h - CAP_DEPTH, wall_h, k, into),
        mats["coping"],
    )

    frames = []
    for index, t in enumerate(windows):
        cx, cy = at(t, 0)
        hw = WINDOW_W / 2
        outer = [
            (-hw - 0.12, WINDOW_SILL - 0.12),
            (hw + 0.12, WINDOW_SILL - 0.12),
            (hw + 0.12, WINDOW_SILL + WINDOW_H * 0.72),
            (0, WINDOW_SILL + WINDOW_H + 0.12),
            (-hw - 0.12, WINDOW_SILL + WINDOW_H * 0.72),
        ]
        pane_profile = [
            (-hw, WINDOW_SILL), (hw, WINDOW_SILL),
            (hw, WINDOW_SILL + WINDOW_H * 0.72),
            (0, WINDOW_SILL + WINDOW_H),
            (-hw, WINDOW_SILL + WINDOW_H * 0.72),
        ]
        frames.append(_wall_panel_part(cx, cy, tangent, inward, outer, half + 0.01,
                                       half + 0.05, mats["coping"]))
        pane = crown_kit.multipart_mesh_from_world(
            f"{name}-window-pane-{index}",
            [_wall_panel_part(cx, cy, tangent, inward, pane_profile, half + 0.05,
                              half + 0.075, mats["window"])],
            k, into,
        )
        crown_kit.area_light(
            f"{name}-window-light-{index}", *at(t, half + 0.42),
            WINDOW_SILL + WINDOW_H / 2, k, energy=WINDOW_ENERGY, size=1.55, lamp=pane,
        )
    if frames:
        crown_kit.multipart_mesh_from_world(f"{name}-window-frames", frames, k, into)

    for index, t in enumerate(sconces):
        sx, sy = at(t, half + 0.12)
        lamp = crown_kit.multipart_mesh_from_world(
            f"{name}-sconce-{index}",
            [_box_part(sx, sy, 0.10, 0.10, 2.45, 2.92, mats["iron"]),
             _flame_part(sx, sy, 0.12, 2.88, 3.25, mats["flame"])],
            k, into,
        )
        crown_kit.area_light(
            f"{name}-sconce-light-{index}", sx, sy, 2.8, k,
            energy=SCONCE_ENERGY, size=1.25, lamp=lamp,
        )


def _brazier(name, x, y, k, into, mats):
    parts = [
        _box_part(x, y, 0.70, 0.70, 0.0, 0.18, mats["stone"]),
        _box_part(x, y, 0.48, 0.48, 0.18, 0.82, mats["stone"]),
        _box_part(x, y, 0.68, 0.68, 0.82, 0.98, mats["coping"]),
        _flame_part(x, y, 0.13, 0.98, 1.45, mats["flame"]),
    ]
    lamp = crown_kit.multipart_mesh_from_world(name, parts, k, into)
    crown_kit.area_light(
        f"{name}-light", x, y, 1.40, k, energy=BRAZIER_ENERGY, size=1.3, lamp=lamp,
    )


def build(contract, k):
    poly = _polygon(contract)
    centre = (sum(x for x, _ in poly) / len(poly), sum(y for _, y in poly) / len(poly))
    hx = (max(x for x, _ in poly) - min(x for x, _ in poly)) / 2
    hy = (max(y for _, y in poly) - min(y for _, y in poly)) / 2
    wall_h = float(contract["projection"]["wallUnits"])
    mats = _materials()

    crown_kit.world_fill(AMBIENT_FILL)
    crown_kit.light_exposure(LIGHT_EXPOSURE)

    architecture = crown_kit.layer("backgroundArchitecture")
    floor = crown_kit.layer("playableFloor")
    props = crown_kit.layer("solidProps")
    occluders = crown_kit.layer("foregroundOccluders")

    crown_kit.paint(crown_kit.prism("floor-slab", poly, -SLAB_DEPTH, -0.02, k, floor), mats["slab"])
    crown_kit.paint(crown_kit.prism("floor-plane", poly, -0.02, 0.0, k, floor), mats["floor"])

    marks = []
    h = 0.02
    for scale in (1.0, 0.72, 0.44):
        points = [
            (centre[0], centre[1] - hy * 0.82 * scale),
            (centre[0] + hx * 0.62 * scale, centre[1]),
            (centre[0], centre[1] + hy * 0.82 * scale),
            (centre[0] - hx * 0.62 * scale, centre[1]),
        ]
        for i in range(4):
            marks.append(_line_part(points[i], points[(i + 1) % 4], 0.055, h, mats["gold"]))
    marks.append(_line_part(
        (centre[0] - hx * 0.72, centre[1] - hy * 0.72),
        (centre[0] + hx * 0.72, centre[1] + hy * 0.72),
        0.045, h, mats["gold"],
    ))
    centre_mark = [
        (centre[0], centre[1] - 0.34), (centre[0] + 0.34, centre[1]),
        (centre[0], centre[1] + 0.34), (centre[0] - 0.34, centre[1]),
    ]
    marks.append(_flat_polygon(centre_mark, h, mats["gold"]))
    crown_kit.multipart_mesh_from_world("floor-diamond-court", marks, k, floor)

    edges = _edges_by_depth(poly)
    walls, open_edges = edges[:2], edges[2:]
    for index, (a, b) in enumerate(walls):
        _wall(f"wall-{index}", a, b, centre, wall_h,
              windows=(0.24, 0.68), sconces=(0.47, 0.86),
              k=k, into=architecture, mats=mats)

    for index, vertex in enumerate(sorted({v for edge in walls for v in edge})):
        crown_kit.paint(
            crown_kit.box(f"pier-{index}", vertex[0], vertex[1],
                          WALL_DEPTH * 1.35, WALL_DEPTH * 1.35, 0, wall_h, k, architecture),
            mats["stone"],
        )
        crown_kit.paint(
            crown_kit.box(f"pier-{index}-cap", vertex[0], vertex[1],
                          WALL_DEPTH * 1.60, WALL_DEPTH * 1.60,
                          wall_h, wall_h + 0.20, k, architecture),
            mats["coping"],
        )

    tangent, inward, _, at = _frame(walls[0][0], walls[0][1], centre)
    mx, my = at(0.56, WALL_DEPTH / 2 + 0.06)
    mirror_outer = [(-0.66, 0.72), (0.66, 0.72), (0.66, 3.10),
                    (0, 3.55), (-0.66, 3.10)]
    mirror_inner = [(-0.48, 0.90), (0.48, 0.90), (0.48, 2.96),
                    (0, 3.31), (-0.48, 2.96)]
    mirror = crown_kit.multipart_mesh_from_world(
        "cracked-mirror",
        [_wall_panel_part(mx, my, tangent, inward, mirror_outer,
                          WALL_DEPTH / 2 + 0.02, WALL_DEPTH / 2 + 0.07, mats["gold"]),
         _wall_panel_part(mx, my, tangent, inward, mirror_inner,
                          WALL_DEPTH / 2 + 0.07, WALL_DEPTH / 2 + 0.10, mats["window"])],
        k, architecture,
    )
    crown_kit.area_light(
        "cracked-mirror-light", *at(0.56, WALL_DEPTH / 2 + 0.30),
        (0.72 + 3.55) / 2, k, energy=WINDOW_ENERGY * 0.35, size=1.1, lamp=mirror,
    )

    tangent2, inward2, _, at2 = _frame(walls[1][0], walls[1][1], centre)
    banner_parts = []
    for t in (0.50, 0.82):
        bx, by = at2(t, WALL_DEPTH / 2 + 0.04)
        banner_parts.append(_wall_panel_part(
            bx, by, tangent2, inward2,
            [(-0.42, 3.55), (0.42, 3.55), (0.42, 1.65),
             (0, 1.40), (-0.42, 1.65)],
            WALL_DEPTH / 2 + 0.02, WALL_DEPTH / 2 + 0.07, mats["cloth"],
        ))
    crown_kit.multipart_mesh_from_world("wall-standards", banner_parts, k, architecture)

    rubble = []
    for index, (t, off, size) in enumerate(((0.14, 0.72, 0.34), (0.18, 0.92, 0.24),
                                             (0.88, 0.72, 0.30), (0.92, 0.96, 0.20))):
        rx, ry = at(t, off)
        rubble.append(_box_part(rx, ry, size, size * 0.85, 0, size * 0.65, mats["stone"]))
    crown_kit.multipart_mesh_from_world("wall-rubble", rubble, k, props)

    cx, cy = at2(0.90, 0.80)
    carpet = [_prism_part(
        [(cx + math.cos(2 * math.pi * i / 12) * 0.28,
          cy + math.sin(2 * math.pi * i / 12) * 0.28) for i in range(12)],
        0, 0.75, mats["cloth"],
    )]
    crown_kit.multipart_mesh_from_world("rolled-carpet", carpet, k, props)

    sx, sy = centre[0] + hx * 0.62, centre[1] + hy * 0.48
    sword_parts = [_box_part(sx, sy, 1.25, 0.35, 0, 0.18, mats["stone"])]
    for dx in (-0.36, 0, 0.36):
        sword_parts.append(_box_part(sx + dx, sy, 0.07, 0.07, 0.18, 1.65, mats["iron"]))
    crown_kit.multipart_mesh_from_world("blade-stand", sword_parts, k, props)

    for index, (a, b) in enumerate(open_edges):
        _, _, _, oat = _frame(a, b, centre)
        kerb = _ccw([oat(0, -KERB_DEPTH / 2), oat(1, -KERB_DEPTH / 2),
                     oat(1, KERB_DEPTH / 2), oat(0, KERB_DEPTH / 2)])
        crown_kit.paint(
            crown_kit.prism(f"kerb-{index}", kerb, 0, KERB_H, k, occluders),
            mats["coping"],
        )

    tips = sorted(poly, key=lambda point: point[0] - point[1])
    for label, tip in (("left", tips[0]), ("right", tips[-1])):
        dx, dy = centre[0] - tip[0], centre[1] - tip[1]
        span = math.hypot(dx, dy)
        _brazier(f"brazier-{label}", tip[0] + dx / span * 0.85,
                 tip[1] + dy / span * 0.85, k, props, mats)

