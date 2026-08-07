








import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import crown_kit

LADDER = [1.0, 5.0, 10.0, 20.0, 30.0, 50.0]

SCALE_PERCENT = 50


def _srgb(linear):

    x = min(max(linear, 0.0), 1.0)
    encoded = 12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055
    return 255.0 * encoded


def parse(argv):
    args = argv[argv.index("--") + 1 :] if "--" in argv else []
    out = {"contract": None, "room": "lantern_cloister", "ladder": LADDER, "ambient": [1.0], "flame": [1.0]}
    for i, token in enumerate(args):
        if token == "--contract":
            out["contract"] = args[i + 1]
        elif token == "--room":
            out["room"] = args[i + 1]
        elif token == "--ambient":
            out["ambient"] = [float(x) for x in args[i + 1].split(",")]
        elif token == "--flame":
            out["flame"] = [float(x) for x in args[i + 1].split(",")]
        elif token == "--ladder":
            out["ladder"] = [float(x) for x in args[i + 1].split(",")]
    return out


MASKS = {
    "floor": ("playableFloor",),
    "architecture": ("backgroundArchitecture",),
    "props": ("solidProps", "foregroundOccluders"),
}


def rung_stats(module, contract, multiplier, percent, ambient=1.0, flame=1.0):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    module.LANTERN_ENERGY = BASE_LANTERN * multiplier
    module.TORCH_ENERGY = BASE_TORCH * multiplier
    module.AMBIENT_FILL = tuple(c * ambient for c in BASE_AMBIENT)
    module.FLAME_EMISSION = BASE_FLAME * flame
    module.FLAME_HOT_EMISSION = BASE_FLAME_HOT * flame
    cam, k, w, h, _ = crown_kit.build_camera(contract)
    module.build(contract, k)
    crown_kit.setup_material_render(samples=16)
    crown_kit.shadows(True)
    scene = bpy.context.scene
    scene.render.resolution_percentage = percent

    meshes = [o for o in scene.objects if o.type == "MESH"]
    coverage = {name: _coverage(scene, meshes, layers) for name, layers in MASKS.items()}
    for obj in meshes:
        obj.hide_render = False
    lit = _render_pixels(scene)

    row = {
        "multiplier": multiplier,
        "ambient": ambient,
        "flame": flame,
        "lanternW": module.LANTERN_ENERGY,
        "torchW": module.TORCH_ENERGY,
    }
    for name, mask in coverage.items():
        row[name] = _read(lit, mask)
    return row


def _coverage(scene, meshes, layers):
    members = set()
    for name in layers:
        collection = bpy.data.collections.get(name)
        if collection is not None:
            members |= set(collection.all_objects)
    for obj in meshes:
        obj.hide_render = obj not in members
    mask = _render_pixels(scene)
    return [i for i in range(0, len(mask), 4) if mask[i + 3] >= 0.5]


def _read(lit, mask):

    if not mask:
        return {"px": 0, "meanOf255": 0.0, "belowPct": 0.0, "clippedPct": 0.0}
    total = 0.0
    clipped = 0
    below = 0
    for i in mask:
        value = (lit[i] + lit[i + 1] + lit[i + 2]) / 3.0
        encoded = _srgb(value)
        total += encoded
        if value >= 0.999:
            clipped += 1
        if encoded < 20.0:
            below += 1
    n = len(mask)
    return {
        "px": n,
        "meanOf255": round(total / n, 2),
        "belowPct": round(100.0 * below / n, 3),
        "clippedPct": round(100.0 * clipped / n, 3),
    }


def _render_pixels(scene, path="/tmp/crown-light-sweep.png"):

    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    image = bpy.data.images.load(path)
    pixels = list(image.pixels)
    bpy.data.images.remove(image)
    return pixels


if __name__ == "__main__":
    opts = parse(sys.argv)
    with open(opts["contract"], encoding="utf-8") as fh:
        contract = json.load(fh)
    room = __import__(opts["room"])
    BASE_LANTERN = 90.0
    BASE_TORCH = 140.0
    BASE_AMBIENT = tuple(room.AMBIENT_FILL)
    BASE_FLAME = room.FLAME_EMISSION
    BASE_FLAME_HOT = room.FLAME_HOT_EMISSION

    rows = [
        rung_stats(room, contract, m, SCALE_PERCENT, a, f)
        for f in opts["flame"]
        for a in opts["ambient"]
        for m in opts["ladder"]
    ]

    print(
        f"\n{'rung':>6}{'fill':>6}{'flame':>7} {'lantern':>8} {'torch':>7} |"
        f"{'floor':>7}{'<20':>7} |{'arch':>7}{'<20':>7} |{'props':>7}{'>=250':>7}"
    )
    for row in rows:
        print(
            f"{'x' + str(row['multiplier']):>6}{'x' + str(row['ambient']):>6}"
            f"{'x' + str(row['flame']):>7}"
            f" {row['lanternW']:>8.0f} {row['torchW']:>7.0f} |"
            f"{row['floor']['meanOf255']:>7.1f}{row['floor']['belowPct']:>6.1f}% |"
            f"{row['architecture']['meanOf255']:>7.1f}{row['architecture']['belowPct']:>6.1f}% |"
            f"{row['props']['meanOf255']:>7.1f}{row['props']['clippedPct']:>6.1f}%"
        )
    print("<<<SWEEP>>>" + json.dumps(rows, indent=1) + "<<<END>>>")
