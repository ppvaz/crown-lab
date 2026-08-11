import math

import crown_kit
import prop_kit

SLAB_DEPTH = 0.55
PIER_DEPTH = 0.8
CAP_DEPTH = 0.30
PLINTH_H = 0.55
KERB_H = 0.22
KERB_DEPTH = 0.5

WINDOW_W = 1.35
WINDOW_H = 2.45
WINDOW_SILL = 1.65

GATE_T = 0.72
GATE_HALF_SPAN = 1.05
GATE_POST = 0.52
GATE_POST_H = 1.95
PORTCULLIS_H = 1.55

BANNER_W = 0.95
BANNER_TOP = 3.6
BANNER_BOTTOM = 1.9

PEDESTAL_INSET = 1.0
FLAME_H = 0.55

RING_RADII = (1.05, 2.6, 3.4, 4.6)
RING_WIDTH = 0.06

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
CLOTH = (0.075, 0.095, 0.175)
WINDOW_GLOW = (0.25, 0.08, 0.015)
FLAME = (1.0, 0.62, 0.22)

AMBIENT_FILL = (0.120, 0.144, 0.232)
SCONCE_ENERGY = 150.0
PEDESTAL_ENERGY = 120.0
WINDOW_ENERGY = 24.0
LIGHT_EXPOSURE = 0.35
FLAME_EMISSION = 2.4


def _materials():
    return {
        "stone": crown_kit.toon_material(
            "guard-stone", STONE, joint=list(STONE_JOINT), pattern="courses",
            block=(1.15, 0.42), joint_size=0.030,
        ),
        "coping": crown_kit.toon_material(
            "guard-coping", STONE_LIGHT, joint=list(STONE_JOINT), pattern="courses",
            block=(1.75, 0.55), joint_size=0.026,
        ),
        "floor": crown_kit.toon_material(
            "guard-floor", FLOOR, joint=list(FLOOR_JOINT), pattern="tiles",
            block=(1.35, 1.35), joint_size=0.020, roughness=0.78,
        ),
        "slab": crown_kit.masonry_material("guard-slab", SLAB, SLAB, block=(0.8, 0.55), roughness=0.95),
        "wood": crown_kit.toon_material(
            "guard-wood", WOOD, joint=list(WOOD_JOINT), pattern="planks",
            block=(3.2, 0.40), joint_size=0.018, roughness=0.84,
        ),
        "gold": crown_kit.toon_material("guard-gold", GOLD, pattern="flat", roughness=0.72),
        "iron": crown_kit.metal_material("guard-dark-metal", DARK_METAL, roughness=0.42, variation=0.16),
        "cloth": crown_kit.toon_material("guard-banner-cloth", CLOTH, pattern="flat", roughness=0.94),
        "window": crown_kit.flame_material("guard-window-glow", WINDOW_GLOW, strength=0.25, scale=3.0),
        "flame": crown_kit.flame_material("guard-flame", FLAME, strength=FLAME_EMISSION),
    }



def _prism_part(poly, bottom_h, top_h, mat):
    n = len(poly)
    verts = [(x, y, bottom_h) for (x, y) in poly] + [(x, y, top_h) for (x, y) in poly]
    faces = [list(range(n))[::-1], list(range(n, 2 * n))]
    faces += [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    return (verts, faces, mat)


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
    hx, hy = sx / 2.0, sy / 2.0
    return _prism_part(
        [(cx - hx, cy - hy), (cx + hx, cy - hy), (cx + hx, cy + hy), (cx - hx, cy + hy)],
        bottom_h, top_h, mat,
    )


def _wall_panel_part(cx, cy, tangent, inward, profile, back_offset, front_offset, mat):
    ux, uy = tangent
    nx, ny = inward
    verts, faces = [], []
    n = len(profile)
    for off in (back_offset, front_offset):
        for (a, h) in profile:
            verts.append((cx + ux * a + nx * off, cy + uy * a + ny * off, h))
    faces.append(list(range(n))[::-1])
    faces.append(list(range(n, 2 * n)))
    faces += [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    return (verts, faces, mat)


def _star_points(cx, h, outer, inner, points=4, rotation=math.pi / 4.0):
    out = []
    for i in range(points * 2):
        r = outer if i % 2 == 0 else inner
        a = rotation + math.pi * i / points
        out.append((cx + math.cos(a) * r, h + math.sin(a) * r))
    return out


def _ring_part(cx, cy, radius, width, h, mat, sides=64):
    inner = radius - width / 2.0
    outer = radius + width / 2.0
    verts, faces = [], []
    for i in range(sides):
        a = 2.0 * math.pi * i / sides
        verts.append((cx + math.cos(a) * inner, cy + math.sin(a) * inner, h))
        verts.append((cx + math.cos(a) * outer, cy + math.sin(a) * outer, h))
    for i in range(sides):
        j = (i + 1) % sides
        faces.append([2 * j, 2 * j + 1, 2 * i + 1, 2 * i])
    return (verts, faces, mat)


def _flame_part(cx, cy, radius, bottom_h, tip_h, mat, sides=6):
    verts = [
        (cx + math.cos(2.0 * math.pi * i / sides) * radius,
         cy + math.sin(2.0 * math.pi * i / sides) * radius,
         bottom_h)
        for i in range(sides)
    ] + [(cx, cy, tip_h)]
    faces = [list(range(sides))[::-1]] + [[i, (i + 1) % sides, sides] for i in range(sides)]
    return (verts, faces, mat)



def _ccw(poly):
    area = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
               for i in range(len(poly)))
    return poly if area > 0 else poly[::-1]


def _polygon(contract):
    verts = contract["arena"].get("vertices")
    if verts:
        return [(float(v["x"]), float(v["y"])) for v in verts]
    h = contract["arena"]["halfExtents"]
    hx, hy = float(h["x"]), float(h["y"])
    return [(-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy)]


def _edges_by_depth(poly):
    n = len(poly)
    edges = [(poly[i], poly[(i + 1) % n]) for i in range(n)]
    return sorted(edges, key=lambda e: e[0][0] + e[0][1] + e[1][0] + e[1][1])


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
        return (a[0] + (b[0] - a[0]) * t + nx * off, a[1] + (b[1] - a[1]) * t + ny * off)

    return (ux, uy), (nx, ny), span, at


def _solid_wall(name, a, b, wall_h, k, centre, windows, into, mats, sconces=()):
    (ux, uy), (nx, ny), span, at = _frame(a, b, centre)
    hd = PIER_DEPTH / 2.0
    body = _ccw([at(0.0, -hd), at(1.0, -hd), at(1.0, hd), at(0.0, hd)])
    plinth = _ccw([at(0.0, -hd * 1.25), at(1.0, -hd * 1.25), at(1.0, hd * 1.25), at(0.0, hd * 1.25)])
    crown_kit.paint(crown_kit.prism(f"{name}-plinth", plinth, 0.0, PLINTH_H, k, into), mats["stone"])
    crown_kit.paint(
        crown_kit.prism(f"{name}-body", body, PLINTH_H, wall_h - CAP_DEPTH, k, into), mats["stone"])
    crown_kit.paint(
        crown_kit.prism(f"{name}-cornice", plinth, wall_h - CAP_DEPTH, wall_h, k, into),
        mats["coping"])

    details = []
    for t in windows:
        cx, cy = at(t, 0.0)
        w, hw = WINDOW_W, WINDOW_W / 2.0
        frame = [(-hw - 0.12, WINDOW_SILL - 0.12), (hw + 0.12, WINDOW_SILL - 0.12),
                 (hw + 0.12, WINDOW_SILL + WINDOW_H * 0.78),
                 (0.0, WINDOW_SILL + WINDOW_H + 0.10),
                 (-hw - 0.12, WINDOW_SILL + WINDOW_H * 0.78)]
        details.append(_wall_panel_part(cx, cy, (ux, uy), (nx, ny), frame, hd + 0.02, hd + 0.06,
                                        mats["coping"]))
        arch = [(-hw, WINDOW_SILL), (hw, WINDOW_SILL), (hw, WINDOW_SILL + WINDOW_H * 0.78),
                (0.0, WINDOW_SILL + WINDOW_H), (-hw, WINDOW_SILL + WINDOW_H * 0.78)]
        pane = crown_kit.multipart_mesh_from_world(
            f"{name}-window-pane-{t:.2f}",
            [_wall_panel_part(cx, cy, (ux, uy), (nx, ny), arch, hd + 0.06, hd + 0.085,
                              mats["window"])],
            k, into)
        crown_kit.area_light(f"{name}-window-light-{t:.2f}", *at(t, hd + 0.5),
                             WINDOW_SILL + WINDOW_H / 2.0, k,
                             energy=WINDOW_ENERGY, size=1.8, lamp=pane)
    if details:
        crown_kit.multipart_mesh_from_world(f"{name}-windows", details, k, into)

    if sconces:
        for t in sconces:
            sx, sy = at(t, hd + 0.15)
            lamp_parts = [
                _box_part(sx, sy, 0.10, 0.10, 2.9, 3.35, mats["iron"]),
                _flame_part(sx, sy, 0.13, 3.32, 3.72, mats["flame"]),
            ]
            lamp = crown_kit.multipart_mesh_from_world(f"{name}-sconce-{t:.2f}", lamp_parts, k, into)
            crown_kit.area_light(f"{name}-sconce-light-{t:.2f}", sx, sy, 3.2, k,
                                 energy=SCONCE_ENERGY, size=1.4, lamp=lamp)


def _pier(name, v, wall_h, k, into, mats):
    crown_kit.paint(
        crown_kit.box(f"{name}", v[0], v[1], PIER_DEPTH * 1.35, PIER_DEPTH * 1.35,
                      0.0, wall_h, k, into), mats["stone"])
    cap = _box_part(v[0], v[1], PIER_DEPTH * 1.6, PIER_DEPTH * 1.6, wall_h, wall_h + 0.22,
                    mats["coping"])
    crown_kit.multipart_mesh_from_world(f"{name}-cap", [cap], k, into)


def build(contract, k):
    poly = _polygon(contract)
    wall_h = float(contract["projection"]["wallUnits"])
    mats = _materials()
    crown_kit.world_fill(AMBIENT_FILL)
    crown_kit.light_exposure(LIGHT_EXPOSURE)

    architecture = crown_kit.layer("backgroundArchitecture")
    floor = crown_kit.layer("playableFloor")
    props = crown_kit.layer("solidProps")
    occluders = crown_kit.layer("foregroundOccluders")

    centre = (sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly))

    crown_kit.paint(crown_kit.prism("floor-slab", poly, -SLAB_DEPTH, -0.02, k, floor), mats["slab"])
    crown_kit.paint(crown_kit.prism("floor-plane", poly, -0.02, 0.0, k, floor), mats["floor"])

    inlay_h = 0.02
    inlays = [_ring_part(centre[0], centre[1], r, RING_WIDTH, inlay_h, mats["gold"]) for r in RING_RADII]
    star = _star_points(0.0, 0.0, 0.62, 0.20)
    inlays.append((
        [(centre[0] + a, centre[1] + h, inlay_h) for (a, h) in star],
        [list(range(len(star)))[::-1]],
        mats["gold"],
    ))
    crown_kit.multipart_mesh_from_world("floor-court", inlays, k, floor)

    edges = _edges_by_depth(poly)
    walls, open_edges = edges[:5], edges[5:]
    far_chamfer = walls[0]

    for i, (a, b) in enumerate(walls):
        span = math.hypot(b[0] - a[0], b[1] - a[1])
        if (a, b) == far_chamfer:
            windows, sconces = [], []
        elif span > 8.0:
            windows, sconces = (0.30, 0.62), (0.16, 0.46, 0.80)
        else:
            windows, sconces = (0.5,), []
        _solid_wall(f"wall-{i}", a, b, wall_h, k, centre, windows, architecture, mats,
                    sconces=sconces)

    wall_verts = {}
    for (a, b) in walls:
        for v in (a, b):
            wall_verts[v] = wall_verts.get(v, 0) + 1
    for j, (v, count) in enumerate(sorted(wall_verts.items())):
        if count == 2:
            _pier(f"pier-{j}", v, wall_h, k, architecture, mats)

    (fu, fv), (fnx, fny), fspan, fat = _frame(far_chamfer[0], far_chamfer[1], centre)
    tx, ty = fat(0.5, PIER_DEPTH + 0.55)
    throne = [
        _box_part(tx, ty, 2.1, 1.5, 0.0, 0.22, mats["stone"]),
        _box_part(tx, ty, 1.7, 1.15, 0.22, 0.42, mats["coping"]),
        _box_part(tx, ty, 0.95, 0.75, 0.42, 0.95, mats["cloth"]),
        (_prism_part(_oriented_rect(tx - fnx * 0.28, ty - fny * 0.28, fu, fv, 1.05, 0.28),
                     0.42, 2.35, mats["stone"])),
        (_prism_part(_oriented_rect(tx - fnx * 0.28, ty - fny * 0.28, fu, fv, 0.55, 0.10),
                     2.35, 2.5, mats["gold"])),
    ]
    crown_kit.multipart_mesh_from_world("throne", throne, k, architecture)
    bx, by = fat(0.5, PIER_DEPTH * 0.5 + 0.03)
    banner = [
        _wall_panel_part(bx, by, (fu, fv), (fnx, fny),
                         [(-BANNER_W / 2, BANNER_TOP), (BANNER_W / 2, BANNER_TOP),
                          (BANNER_W / 2, BANNER_BOTTOM + 0.35), (0.0, BANNER_BOTTOM),
                          (-BANNER_W / 2, BANNER_BOTTOM + 0.35)],
                         0.0, 0.05, mats["cloth"]),
        _wall_panel_part(bx, by, (fu, fv), (fnx, fny),
                         _star_points(0.0, (BANNER_TOP + BANNER_BOTTOM) / 2.0 + 0.15, 0.30, 0.105),
                         0.05, 0.09, mats["gold"]),
    ]
    crown_kit.multipart_mesh_from_world("throne-banner", banner, k, architecture)

    side_walls = [e for e in walls if math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1]) > 6.0]
    left = min(side_walls, key=lambda e: (e[0][0] + e[1][0]) / 2.0 - (e[0][1] + e[1][1]) / 2.0)
    right = max(side_walls, key=lambda e: math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1]))

    def _prop(prop, x, y, *, height, material, facing=None, into=props, ground=0.0):
        yaw = 0.0 if facing is None else math.atan2(facing[1], facing[0]) - math.pi / 4.0
        return prop_kit.place(
            prop, x, y, k, height=height, yaw=yaw, into=into, ground=ground,
            material=material,
        )

    generated_props = (
        "shield-rack", "kite-shield", "spear-stand", "chest", "duty-table",
        "padded-stool", "bucket", "belt-gloves", "wall-targe", "candle-plinth",
        "standing-banner",
    )
    dressed = all(prop_kit.available(prop) for prop in generated_props)

    (lu, lv), (lnx, lny), lspan, lat = _frame(left[0], left[1], centre)
    if dressed:
        _prop("shield-rack", *lat(0.42, PIER_DEPTH / 2.0 + 0.55), height=1.5,
              material=mats["wood"], facing=(lnx, lny))
        _prop("kite-shield", *lat(0.62, PIER_DEPTH / 2.0 + 0.40), height=1.3,
              material=mats["cloth"], facing=(lnx, lny))
        _prop("spear-stand", *lat(0.16, PIER_DEPTH / 2.0 + 0.50), height=2.3,
              material=mats["wood"], facing=(lnx, lny))
    rack_parts = []
    rx, ry = lat(0.42, PIER_DEPTH / 2.0 + 0.45)
    rack_parts.append(_prism_part(_oriented_rect(rx, ry, lu, lv, 3.4, 0.28), 0.0, 0.14, mats["wood"]))
    for i in range(4):
        t = (i - 1.5) * 0.78
        sx, sy = rx + lu * t, ry + lv * t
        rack_parts.append(_prism_part(
            _oriented_rect(sx + lnx * 0.10, sy + lny * 0.10, lu, lv, 0.62, 0.10),
            0.12, 1.35, mats["iron"]))
    px, py = lat(0.16, PIER_DEPTH / 2.0 + 0.35)
    rack_parts.append(_prism_part(_oriented_rect(px, py, lu, lv, 0.07, 0.07), 0.0, 2.9, mats["wood"]))
    rack_parts.append(_flame_part(px, py, 0.09, 2.9, 3.35, mats["iron"]))
    if not dressed:
        crown_kit.multipart_mesh_from_world("shield-rack", rack_parts, k, props)

    (ru, rv), (rnx, rny), rspan, rat = _frame(right[0], right[1], centre)
    if dressed:
        _prop("chest", *rat(0.34, PIER_DEPTH / 2.0 + 0.60), height=0.9,
              material=mats["wood"], facing=(rnx, rny))
        _prop("duty-table", *rat(0.52, PIER_DEPTH / 2.0 + 0.55), height=0.85,
              material=mats["wood"], facing=(rnx, rny))
        _prop("padded-stool", *rat(0.63, PIER_DEPTH / 2.0 + 0.80), height=0.45,
              material=mats["wood"], facing=(rnx, rny))
        _prop("bucket", *rat(0.71, PIER_DEPTH / 2.0 + 0.45), height=0.5,
              material=mats["wood"])
        _prop("belt-gloves", *rat(0.585, PIER_DEPTH / 2.0 + 1.05), height=0.16,
              material=mats["iron"])
        _prop("wall-targe", *rat(0.80, PIER_DEPTH / 2.0 + 0.16), height=0.95,
              material=mats["cloth"], ground=1.35, facing=(rnx, rny), into=architecture)
    kit = []
    cx, cy = rat(0.34, PIER_DEPTH / 2.0 + 0.6)
    kit.append(_box_part(cx, cy, 1.35, 0.85, 0.0, 0.62, mats["wood"]))
    kit.append(_box_part(cx, cy, 1.15, 0.70, 0.62, 0.80, mats["wood"]))
    tx2, ty2 = rat(0.56, PIER_DEPTH / 2.0 + 0.55)
    kit.append(_box_part(tx2, ty2, 1.6, 0.7, 0.62, 0.74, mats["wood"]))
    for sx2 in (-0.62, 0.62):
        for sy2 in (-0.22, 0.22):
            kit.append(_box_part(tx2 + ru * sx2, ty2 + rv * sy2 + rnx * 0.0, 0.10, 0.10,
                                 0.0, 0.62, mats["wood"]))
    kit.append(_box_part(tx2, ty2, 0.22, 0.22, 0.74, 1.05, mats["gold"]))
    st, sv = rat(0.68, PIER_DEPTH / 2.0 + 0.55)
    kit.append(_box_part(st, sv, 0.42, 0.42, 0.0, 0.4, mats["wood"]))
    shx, shy = rat(0.82, PIER_DEPTH / 2.0 + 0.35)
    kit.append(_prism_part(
        [(shx + (math.cos(2 * math.pi * i / 10)) * 0.12 + ru * (math.sin(2 * math.pi * i / 10)) * 0.55,
          shy + rv * (math.sin(2 * math.pi * i / 10)) * 0.55)
         for i in range(10)],
        0.05, 1.15, mats["cloth"]))
    if not dressed:
        crown_kit.multipart_mesh_from_world("duty-kit", kit, k, props)

    gate_edge = max(open_edges, key=lambda e: math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1]))
    for i, (a, b) in enumerate(open_edges):
        (ou, ov), (onx, ony), ospan, oat = _frame(a, b, centre)
        segs = [(0.0, 1.0)]
        if (a, b) == gate_edge:
            g0 = GATE_T - GATE_HALF_SPAN / ospan
            g1 = GATE_T + GATE_HALF_SPAN / ospan
            segs = [(0.0, g0), (g1, 1.0)]
        for j, (t0, t1) in enumerate(segs):
            kerb = _ccw([oat(t0, -KERB_DEPTH / 2), oat(t1, -KERB_DEPTH / 2),
                         oat(t1, KERB_DEPTH / 2), oat(t0, KERB_DEPTH / 2)])
            crown_kit.paint(crown_kit.prism(f"kerb-{i}-{j}", kerb, 0.0, KERB_H, k, occluders),
                            mats["coping"])
        if (a, b) == gate_edge:
            gparts = []
            for tp in (GATE_T - GATE_HALF_SPAN / ospan, GATE_T + GATE_HALF_SPAN / ospan):
                gx, gy = oat(tp, 0.0)
                gparts.append(_box_part(gx, gy, GATE_POST, GATE_POST, 0.0, GATE_POST_H, mats["stone"]))
                gparts.append(_flame_part(gx, gy, GATE_POST * 0.62, GATE_POST_H,
                                          GATE_POST_H + 0.38, mats["coping"]))
            n_bars = 6
            for bi in range(n_bars + 1):
                tb = GATE_T + (bi / n_bars - 0.5) * (2 * GATE_HALF_SPAN / ospan)
                gx, gy = oat(tb, 0.0)
                gparts.append(_box_part(gx, gy, 0.05, 0.05, 0.0, PORTCULLIS_H, mats["iron"]))
            for h in (0.35, 0.85, 1.35):
                rail = _oriented_rect(*oat(GATE_T, 0.0), ou, ov, 2 * GATE_HALF_SPAN, 0.05)
                gparts.append(_prism_part(rail, h, h + 0.06, mats["iron"]))
            crown_kit.multipart_mesh_from_world("gate", gparts, k, occluders)
            sx3, sy3 = oat(GATE_T, -KERB_DEPTH - 0.45)
            step = _oriented_rect(sx3, sy3, ou, ov, 2 * GATE_HALF_SPAN * 0.9, 0.9)
            crown_kit.multipart_mesh_from_world(
                "gate-step", [_prism_part(step, -SLAB_DEPTH, -0.18, mats["coping"])], k, occluders)

    tips = sorted(poly, key=lambda p: p[0] - p[1])
    for label, tip in (("left", tips[0]), ("right", tips[-1])):
        ux2, uy2 = centre[0] - tip[0], centre[1] - tip[1]
        d = math.hypot(ux2, uy2)
        px2, py2 = tip[0] + ux2 / d * PEDESTAL_INSET, tip[1] + uy2 / d * PEDESTAL_INSET
        if dressed:
            lamp = _prop("candle-plinth", px2, py2, height=1.35, material=mats["stone"])
            lamp.name = f"pedestal-{label}"
        else:
            parts = [
                _box_part(px2, py2, 0.78, 0.78, 0.0, 0.22, mats["stone"]),
                _box_part(px2, py2, 0.55, 0.55, 0.22, 0.95, mats["stone"]),
                _box_part(px2, py2, 0.70, 0.70, 0.95, 1.08, mats["coping"]),
                _flame_part(px2, py2, 0.11, 1.08, 1.08 + FLAME_H * 0.75, mats["flame"]),
            ]
            lamp = crown_kit.multipart_mesh_from_world(f"pedestal-{label}", parts, k, props)
        crown_kit.area_light(f"pedestal-{label}-light", px2, py2, 1.7, k,
                             energy=PEDESTAL_ENERGY, size=1.4, lamp=lamp)

    gu, gv = _inward(gate_edge[0], gate_edge[1], centre)
    bx2, by2 = centre[0] + 4.8, centre[1] + 3.6
    pole = [
        _box_part(bx2, by2, 0.30, 0.30, 0.0, 0.10, mats["stone"]),
        _box_part(bx2, by2, 0.06, 0.06, 0.0, 2.6, mats["wood"]),
        _prism_part(_oriented_rect(bx2, by2, gu, gv, 1.0, 0.05), 2.5, 2.58, mats["wood"]),
        _wall_panel_part(bx2, by2, (gu, gv), (gv, -gu),
                         [(-0.38, 2.5), (0.38, 2.5), (0.38, 1.35), (0.0, 1.12), (-0.38, 1.35)],
                         0.0, 0.04, mats["cloth"]),
    ]
    if dressed:
        _prop("standing-banner", bx2, by2, height=2.7, material=mats["cloth"])
    else:
        crown_kit.multipart_mesh_from_world("standing-banner", pole, k, props)
