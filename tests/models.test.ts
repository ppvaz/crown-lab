
import {
  DEFAULT_MODEL_BANK,
  MODEL_TURNTABLE_STATES,
  drawModel,
  modelTurntableMotion,
  poseAt,
  poseFor,
} from '../src/render/models';
import { FIRST_BLADE_CROWNED } from '../src/render/cast/first-blade-crowned';
import { MODEL_BANKS } from '../src/render/cast/banks-lab';
import { DEFAULT_MODELS } from '../src/render/cast/index-lab';
import { DEFAULT_COMBAT } from '../src/lab/config';
import type { ModelBank, ModelDef, ModelRole, ModelShape } from '../src/render/models';
import { groundEllipse, makeCamera, worldToScreen } from '../src/render/iso';
import { ISO_Z, box, drawMesh } from '../src/render/mesh';
import { PALETTE } from '../src/render/palette';

const shapesOf = (model: ModelDef, keep: (shape: ModelShape) => boolean): ModelShape[] =>
  model.shapes.filter(keep);

const topOf = (model: ModelDef): number =>
  Math.max(
    ...model.shapes
      .filter((shape) => shape.part !== 'weapon')
      .flatMap((shape) =>
        shape.points !== undefined
          ? shape.points.map(([, y]) => y)
          : [(shape.cy ?? 0) + (shape.ry ?? 0)],
      ),
  );

const peaks = (shape: ModelShape): number => {
  const ys = (shape.points ?? []).map(([, y]) => y);
  return ys.filter((y, i) => {
    const before = ys[(i - 1 + ys.length) % ys.length];
    const after = ys[(i + 1) % ys.length];
    return y > before && y > after;
  }).length;
};

const inView = (model: ModelDef, view: 'front' | 'back' | 'profile'): ModelShape[] =>
  model.shapes.filter((shape) => shape.side === undefined || shape.side === view);

const visibleFace = (model: ModelDef, view: 'front' | 'back' | 'profile'): ModelShape[] =>
  inView(model, view).filter((shape) => shape.kind === 'line' && shape.stroke === 'floor');

const king = DEFAULT_MODELS.models.player;
const captain = DEFAULT_MODELS.models.captain;
const guard = DEFAULT_MODELS.models.guard;
const duelist = DEFAULT_MODELS.models.duelist;
const archer = DEFAULT_MODELS.models.archer;
const firstBlade = DEFAULT_MODELS.models.first_blade;
const chancellor = DEFAULT_MODELS.models.chancellor;

describe('the default model bank', () => {
  it('starts the lab on the mesh models', () => {
    expect(DEFAULT_MODEL_BANK).toBe('mesh');
    expect(MODEL_BANKS[DEFAULT_MODEL_BANK]).toBeDefined();
  });
});

describe('the Captain of the Guard', () => {
  it('wears rank, not a crown', () => {
    const crest = shapesOf(captain, (shape) => shape.part === 'head' && shape.kind === 'poly')[0];
    const crown = shapesOf(king, (shape) => shape.fill === 'playerAccent' && shape.kind === 'poly')[0];

    expect(crest).toBeDefined();
    expect(crown).toBeDefined();
    expect(peaks(crest)).toBe(1);
    expect(peaks(crown)).toBe(3);
    expect(topOf(captain)).toBeLessThan(topOf(king));
  });

  it('carries no shield, unlike the guard he trained', () => {
    expect(shapesOf(captain, (shape) => shape.part === 'shield')).toHaveLength(0);
    expect(shapesOf(guard, (shape) => shape.part === 'shield').length).toBeGreaterThan(0);
  });

  it('inherits the palace guard one-line face', () => {
    expect(visibleFace(captain, 'front')).toHaveLength(1);
    expect(visibleFace(guard, 'front')).toHaveLength(1);
    expect(visibleFace(captain, 'profile')).toHaveLength(1);
    expect(visibleFace(guard, 'profile')).toHaveLength(1);
  });

  it('tapers where the guard is a straight wall', () => {
    const widthAt = (model: ModelDef, y: number): number => {
      const body = shapesOf(model, (shape) => shape.kind === 'poly' && shape.fill === 'tint')[0];
      const near = (body.points ?? []).filter(([, py]) => Math.abs(py - y) < 0.12);
      return Math.max(...near.map(([x]) => Math.abs(x))) * 2;
    };

    expect(widthAt(captain, 0.64)).toBeGreaterThan(widthAt(captain, 0));
    expect(widthAt(guard, 0.7)).toBeLessThan(widthAt(guard, 0));
  });
});

describe('the crown', () => {
  const headpieces = (model: ModelDef): ModelShape[] =>
    shapesOf(
      model,
      (shape) =>
        shape.part !== 'weapon' &&
        shape.kind === 'poly' &&
        (shape.fill === 'playerAccent' || shape.fill === 'firstBlade'),
    );

  it('is worn by the king and by nobody else in any bank', () => {
    for (const bank of Object.values(MODEL_BANKS)) {
      for (const [role, model] of Object.entries(bank.models)) {
        if (role === 'player') continue;
        for (const shape of headpieces(model)) {
          expect(
            peaks(shape),
            `${bank.id}/${role} grew a ${peaks(shape)}-point headpiece`,
          ).toBe(1);
        }
      }
    }
  });

  it('is still three points on the king, so the comparison means something', () => {
    const crown = shapesOf(king, (shape) => shape.fill === 'playerAccent' && shape.kind === 'poly')[0];
    expect(peaks(crown)).toBe(3);
  });

  it('gives the king the largest authored silhouette in the room', () => {
    for (const [role, model] of Object.entries(DEFAULT_MODELS.models)) {
      if (role === 'player') continue;
      expect(king.heightPx, role).toBeGreaterThan(model.heightPx);
    }
  });
});

describe('the dormant First Blade', () => {
  it('keeps the original silhouette intact', () => {
    expect(FIRST_BLADE_CROWNED.id).toBe('first_blade_crowned');
    const circlet = shapesOf(
      FIRST_BLADE_CROWNED,
      (shape) => shape.part === 'head' && shape.fill === 'firstBlade',
    )[0];
    expect(peaks(circlet)).toBe(3);
  });

  it('is wired into no bank, so restoring it stays a decision', () => {
    for (const bank of Object.values(MODEL_BANKS)) {
      for (const model of Object.values(bank.models)) {
        expect(model.id, `${bank.id} re-enlisted the crowned First Blade`).not.toBe(
          'first_blade_crowned',
        );
      }
    }
  });

  it('remains archived while the model in service uses the approved full-body redraw', () => {
    const active = DEFAULT_MODELS.models.first_blade;
    const activeCrest = active.shapes.find(
      (shape) => shape.part === 'head' && shape.fill === 'firstBlade',
    );

    expect(active.shapes).not.toEqual(FIRST_BLADE_CROWNED.shapes);
    expect(active.shapes.filter((shape) => shape.part === 'legLead').length).toBeGreaterThanOrEqual(2);
    expect(active.shapes.filter((shape) => shape.part === 'legTrail').length).toBeGreaterThanOrEqual(2);
    expect(active.shapes.filter((shape) => shape.part === 'weapon').length).toBeGreaterThanOrEqual(6);
    expect(peaks(activeCrest!)).toBe(1);
  });
});

describe('garments and architecture', () => {
  it('never dresses a model in the arena wall colour', () => {
    for (const bank of Object.values(MODEL_BANKS)) {
      for (const [role, model] of Object.entries(bank.models)) {
        for (const shape of model.shapes) {
          expect(shape.fill, `${bank.id}/${role} filled a body shape with wall`).not.toBe('wall');
          expect(shape.stroke, `${bank.id}/${role} stroked a body shape with wall`).not.toBe('wall');
        }
        for (const face of model.mesh?.faces ?? []) {
          expect(face.fill, `${bank.id}/${role} filled a mesh face with wall`).not.toBe('wall');
        }
      }
    }
  });

  it('keeps the dormant First Blade on the same rule', () => {
    for (const shape of FIRST_BLADE_CROWNED.shapes) {
      expect(shape.fill).not.toBe('wall');
      expect(shape.stroke).not.toBe('wall');
    }
  });
});

describe('the silhouette bank', () => {
  it('is fully authored, concept-backed for every boss', () => {
    expect(DEFAULT_MODELS.models.rain_boss.id).toBe('rain_boss_blade_orbit');
    expect(DEFAULT_MODELS.models.elite_guard.id).toBe('elite_guard_wall');
    expect(DEFAULT_MODELS.models.captain.id).toBe('captain_of_the_guard');
  });
});

describe('which way a body is turned', () => {
  const sided = (model: ModelDef, side: 'front' | 'back' | 'profile'): ModelShape[] =>
    shapesOf(model, (shape) => shape.side === side);

  it('hides the visor when a helmeted man walks away', () => {
    expect(visibleFace(guard, 'back')).toHaveLength(0);
    expect(sided(guard, 'back').length).toBeGreaterThan(0);
  });

  it('applies the same rule to the Captain, who wears the guard face', () => {
    expect(visibleFace(captain, 'back')).toHaveLength(0);
  });

  it('gives the king something to be seen from the side by', () => {
    expect(sided(king, 'profile').length).toBeGreaterThan(0);
  });

  it('replaces the king body by view instead of layering a profile over a front', () => {
    const sharedBody = king.shapes.filter(
      (shape) =>
        shape.side === undefined &&
        shape.part !== 'weapon' &&
        shape.part !== 'legLead' &&
        shape.part !== 'legTrail',
    );
    expect(sharedBody).toHaveLength(0);
  });

  it('narrows the king torso, head and crown in profile', () => {
    const width = (shape: ModelShape): number => {
      const xs =
        shape.points?.map(([x]) => x) ??
        [-(shape.rx ?? 0) + (shape.cx ?? 0), (shape.rx ?? 0) + (shape.cx ?? 0)];
      return Math.max(...xs) - Math.min(...xs);
    };
    const frontTorso = sided(king, 'front').find(
      (shape) => shape.kind === 'poly' && shape.fill === 'tint',
    );
    const profileTorso = sided(king, 'profile').find(
      (shape) => shape.kind === 'poly' && shape.fill === 'garment',
    );
    const frontHead = sided(king, 'front').find(
      (shape) => shape.part === 'head' && shape.fill === 'playerFace',
    );
    const profileHead = sided(king, 'profile').find(
      (shape) => shape.part === 'head' && shape.fill === 'playerFace',
    );
    const frontCrown = sided(king, 'front').find(
      (shape) => shape.part === 'head' && shape.fill === 'playerAccent',
    );
    const profileCrown = sided(king, 'profile').find(
      (shape) => shape.part === 'head' && shape.fill === 'playerAccent',
    );

    expect(width(profileTorso!)).toBeLessThan(width(frontTorso!));
    expect(width(profileHead!)).toBeLessThan(width(frontHead!));
    expect(width(profileCrown!)).toBeLessThan(width(frontCrown!));
  });

  it('moves the king weapon behind his body from the back', () => {
    const front = king.viewPartOrder?.front ?? [];
    const back = king.viewPartOrder?.back ?? [];
    expect(front.indexOf('weapon')).toBeGreaterThan(front.indexOf('body'));
    expect(back.indexOf('weapon')).toBeLessThan(back.indexOf('body'));
  });

  it('covers the king in his own cape from behind', () => {
    const back = sided(king, 'back');
    expect(back.length).toBeGreaterThan(0);
    expect(back.some((shape) => shape.fill === 'garment')).toBe(true);
  });

  it('never marks a shape with a side that is neither', () => {
    for (const bank of Object.values(MODEL_BANKS)) {
      for (const model of Object.values(bank.models)) {
        for (const shape of model.shapes) {
          if (shape.side === undefined) continue;
          expect(['front', 'back', 'profile'], `${bank.id}/${model.id}`).toContain(shape.side);
        }
      }
    }
  });

  it('foreshortens every remaining authored cast profile', () => {
    for (const model of [
      king,
      guard,
      duelist,
      archer,
      firstBlade,
      captain,
      chancellor,
      DEFAULT_MODELS.models.rain_boss,
      DEFAULT_MODELS.models.elite_guard,
    ]) {
      expect(model.viewWidthScale?.profile, model.id).toBeGreaterThan(0);
      expect(model.viewWidthScale?.profile, model.id).toBeLessThan(1);
      expect(model.profileDepth, `${model.id} has no profile thickness`).toBeGreaterThan(0);
      expect(model.viewPartOrder?.profile, `${model.id} has no profile occlusion order`).toBeDefined();
    }
  });
});

describe('the walk', () => {
  const legs = (model: ModelDef): ModelShape[] =>
    shapesOf(model, (shape) => shape.part === 'legLead' || shape.part === 'legTrail');

  it('gives every authored silhouette two legs that swing in opposition', () => {
    for (const role of [
      'player',
      'guard',
      'duelist',
      'archer',
      'first_blade',
      'captain',
      'rain_boss',
      'elite_guard',
    ] as const) {
      const model = DEFAULT_MODELS.models[role];
      const pair = legs(model);
      expect(pair.length, `${role} has no legs to walk on`).toBeGreaterThanOrEqual(2);
      expect(pair.filter((shape) => shape.part === 'legLead').length).toBeGreaterThanOrEqual(1);
      expect(pair.filter((shape) => shape.part === 'legTrail').length).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps the stride small enough not to be read as a pose', () => {
    for (const role of [
      'player',
      'guard',
      'duelist',
      'archer',
      'first_blade',
      'captain',
      'rain_boss',
      'elite_guard',
    ] as const) {
      for (const leg of legs(DEFAULT_MODELS.models[role])) {
        const limit =
          role === 'first_blade' || role === 'elite_guard'
            ? 0.55
            : role === 'guard' || role === 'rain_boss'
              ? 0.42
              : 0.4;
        for (const [x] of leg.points ?? []) expect(Math.abs(x)).toBeLessThan(limit);
      }
    }
  });
});

describe('mesh bodies stand to the height they declare', () => {
  const paint = (def: ModelDef, facing: number) => {
    const polys: Array<Array<{ x: number; y: number }>> = [];
    let cur: Array<{ x: number; y: number }> = [];
    const ctx = {
      fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
      beginPath() { cur = []; },
      moveTo(x: number, y: number) { cur.push({ x, y }); },
      lineTo(x: number, y: number) { cur.push({ x, y }); },
      closePath() {}, fill() { polys.push(cur.slice()); }, stroke() {},
      save() {}, restore() {}, translate() {}, ellipse() {},
    } as unknown as CanvasRenderingContext2D;
    const cam = makeCamera(1280, 720);
    drawMesh(ctx, cam, def.mesh!, {
      at: { x: 0, y: 0 }, facing, radius: 1, height: def.heightPx / ISO_Z,
      lean: 0, crouch: 1, weapon: 0, shield: 0, gait: 0,
      weaponPivot: def.meshPivots?.weapon, shieldPivot: def.meshPivots?.shield,
      hipPivot: def.meshPivots?.hip,
      resolveFill: () => '#ffffff',
    });
    const origin = worldToScreen(cam, { x: 0, y: 0 });
    const ys = polys.flat().map((p) => p.y);
    return { above: origin.y - Math.min(...ys) };
  };

  const meshBodies = Object.entries(MODEL_BANKS.mesh.models).filter(
    ([, def]) => def.mesh !== undefined,
  );

  it('has bodies to measure', () => {
    expect(meshBodies.length).toBeGreaterThan(5);
  });

  it('draws each body to its declared heightPx, from every facing', () => {
    for (const [role, def] of meshBodies) {
      for (let i = 0; i < 8; i++) {
        const { above } = paint(def, (i * Math.PI) / 4);
        expect(above, `${role} facing ${i} is shorter than it declares`).toBeGreaterThan(
          def.heightPx * 0.9,
        );
        expect(above, `${role} facing ${i} is stretched past its declared height`).toBeLessThan(
          def.heightPx * 1.55,
        );
      }
    }
  });

  it('swings the king s arms against the leg on their own side', () => {
    const mesh = MODEL_BANKS.mesh.models.player.mesh!;
    const anyOf = (part: string) => mesh.faces.some((f) => f.part === part);
    expect(anyOf('armLead'), 'the king has no armLead faces').toBe(true);
    expect(anyOf('armTrail'), 'the king has no armTrail faces').toBe(true);


    const probe = (part: string, gait: number): number => {
      const leg = part.startsWith('leg');
      const limb = box(
        [0.24, -0.06, leg ? 0.06 : 0.8],
        [0.32, 0.06, leg ? 0.5 : 1.2],
        'tint',
        part as never,
      );
      const polys: Array<Array<{ x: number; y: number }>> = [];
      let cur: Array<{ x: number; y: number }> = [];
      const ctx = {
        fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
        beginPath() { cur = []; },
        moveTo(x: number, y: number) { cur.push({ x, y }); },
        lineTo(x: number, y: number) { cur.push({ x, y }); },
        closePath() {}, fill() { polys.push(cur.slice()); }, stroke() {},
        save() {}, restore() {}, translate() {}, ellipse() {},
      } as unknown as CanvasRenderingContext2D;
      drawMesh(ctx, makeCamera(1280, 720), limb, {
        at: { x: 0, y: 0 }, facing: 0, radius: 1,
        height: MODEL_BANKS.mesh.models.player.heightPx / ISO_Z,
        lean: 0, crouch: 1, weapon: 0, shield: 0, gait,
        hipPivot: MODEL_BANKS.mesh.models.player.meshPivots?.hip,
        armPivot: MODEL_BANKS.mesh.models.player.meshPivots?.arm,
        resolveFill: () => '#ffffff',
      });
      const pts = polys.flat();
      return Math.max(...pts.map((p) => p.x));
    };
    const reach = probe;

    const quarter = Math.PI / 2;
    const drift = (leg: boolean): number =>
      reach(leg ? 'legControl' : 'body', quarter) - reach(leg ? 'legControl' : 'body', -quarter);
    const armDrift = drift(false);
    const legDrift = drift(true);
    const armLead = reach('armLead', quarter) - reach('armLead', -quarter) - armDrift;
    const legTrail = reach('legTrail', quarter) - reach('legTrail', -quarter) - legDrift;
    const armTrail = reach('armTrail', quarter) - reach('armTrail', -quarter) - armDrift;
    const legLead = reach('legLead', quarter) - reach('legLead', -quarter) - legDrift;

    expect(Math.abs(armLead), 'armLead does not move with the gait').toBeGreaterThan(0.5);
    expect(Math.abs(armTrail), 'armTrail does not move with the gait').toBeGreaterThan(0.5);
    expect(Math.sign(armLead), 'left arm swings with its own leg').not.toBe(Math.sign(legTrail));
    expect(Math.sign(armTrail), 'right arm swings with its own leg').not.toBe(Math.sign(legLead));
    expect(Math.abs(armLead)).toBeLessThan(Math.abs(legTrail));
  });

  it('gives the king a cape that trails the stride and kicks with the lean', () => {
    const mesh = MODEL_BANKS.mesh.models.player.mesh!;
    expect(
      mesh.faces.some((f) => f.part === 'cape'),
      'the king has no cape faces',
    ).toBe(true);

    const probe = (gait: number, lean: number): number => {
      const panel = box([-0.2, -0.15, 1.0], [0.2, -0.05, 1.28], 'tint', 'cape');
      const polys: Array<Array<{ x: number; y: number }>> = [];
      let cur: Array<{ x: number; y: number }> = [];
      const ctx = {
        fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
        beginPath() { cur = []; },
        moveTo(x: number, y: number) { cur.push({ x, y }); },
        lineTo(x: number, y: number) { cur.push({ x, y }); },
        closePath() {}, fill() { polys.push(cur.slice()); }, stroke() {},
        save() {}, restore() {}, translate() {}, ellipse() {},
      } as unknown as CanvasRenderingContext2D;
      drawMesh(ctx, makeCamera(1280, 720), panel, {
        at: { x: 0, y: 0 }, facing: 0, radius: 1,
        height: MODEL_BANKS.mesh.models.player.heightPx / ISO_Z,
        lean, crouch: 1, weapon: 0, shield: 0, gait,
        capePivot: MODEL_BANKS.mesh.models.player.meshPivots?.cape,
        resolveFill: () => '#ffffff',
      });
      const pts = polys.flat();
      return Math.max(...pts.map((p) => p.y));
    };

    const rest = probe(0, 0);
    expect(probe(Math.PI / 2, 0)).not.toBeCloseTo(rest, 3);
    const leaned = probe(0, 0.3);
    const bodyPanel = box([-0.2, -0.15, 1.0], [0.2, -0.05, 1.28], 'tint', 'body');
    const bodyPolys: Array<Array<{ x: number; y: number }>> = [];
    let bodyCur: Array<{ x: number; y: number }> = [];
    const bodyCtx = {
      fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
      beginPath() { bodyCur = []; },
      moveTo(x: number, y: number) { bodyCur.push({ x, y }); },
      lineTo(x: number, y: number) { bodyCur.push({ x, y }); },
      closePath() {}, fill() { bodyPolys.push(bodyCur.slice()); }, stroke() {},
      save() {}, restore() {}, translate() {}, ellipse() {},
    } as unknown as CanvasRenderingContext2D;
    drawMesh(bodyCtx, makeCamera(1280, 720), bodyPanel, {
      at: { x: 0, y: 0 }, facing: 0, radius: 1,
      height: MODEL_BANKS.mesh.models.player.heightPx / ISO_Z,
      lean: 0.3, crouch: 1, weapon: 0, shield: 0, gait: 0,
      resolveFill: () => '#ffffff',
    });
    const bodyLeaned = Math.max(...bodyPolys.flat().map((p) => p.y));
    expect(leaned).not.toBeCloseTo(bodyLeaned, 3);
  });

  it('swings the elite guard s shield and sword on their own pivots', () => {
    const def = MODEL_BANKS.mesh.models.elite_guard;
    const mesh = def.mesh!;
    expect(mesh.faces.some((f) => f.part === 'shield'), 'no shield faces').toBe(true);
    expect(mesh.faces.some((f) => f.part === 'weapon'), 'no weapon faces').toBe(true);

    const probe = (part: 'shield' | 'weapon', angle: number): number => {
      const pivot = (part === 'shield' ? def.meshPivots?.shield : def.meshPivots?.weapon)!;
      const panel = box(
        [pivot[0] - 0.3, pivot[1] - 0.05, pivot[2] - 0.3],
        [pivot[0] + 0.3, pivot[1] + 0.05, pivot[2] + 0.3],
        'tint',
        part,
      );
      const polys: Array<Array<{ x: number; y: number }>> = [];
      let cur: Array<{ x: number; y: number }> = [];
      const ctx = {
        fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
        beginPath() { cur = []; },
        moveTo(x: number, y: number) { cur.push({ x, y }); },
        lineTo(x: number, y: number) { cur.push({ x, y }); },
        closePath() {}, fill() { polys.push(cur.slice()); }, stroke() {},
        save() {}, restore() {}, translate() {}, ellipse() {},
      } as unknown as CanvasRenderingContext2D;
      drawMesh(ctx, makeCamera(1280, 720), panel, {
        at: { x: 0, y: 0 }, facing: 0, radius: 1, height: def.heightPx / ISO_Z,
        lean: 0, crouch: 1,
        weapon: part === 'weapon' ? angle : 0,
        shield: part === 'shield' ? angle : 0,
        gait: 0,
        weaponPivot: def.meshPivots?.weapon,
        shieldPivot: def.meshPivots?.shield,
        resolveFill: () => '#ffffff',
      });
      const pts = polys.flat();
      return Math.max(...pts.map((p) => p.y));
    };

    for (const part of ['shield', 'weapon'] as const) {
      const rest = probe(part, 0);
      const swung = probe(part, Math.PI / 3);
      expect(swung, `${part} does not move when posed`).not.toBeCloseTo(rest, 3);
    }
  });

  it('keeps the king the tallest body in the mesh bank, as in the flat one', () => {
    const king = paint(MODEL_BANKS.mesh.models.player, Math.PI / 2).above;
    for (const [role, def] of meshBodies) {
      if (role === 'player' || role === 'mesh_guard') continue;
      expect(def.heightPx, `${role} out-declares the king`).toBeLessThan(
        MODEL_BANKS.mesh.models.player.heightPx,
      );
    }
    expect(king).toBeGreaterThan(0);
  });
});

describe('the guard rebuilt from the concept sheet', () => {
  const def = MODEL_BANKS.mesh.models.guard;

  it('has geometry and paints to its declared heightPx, from every facing', () => {
    expect(def.mesh).toBeDefined();
    expect(def.mesh!.faces.length).toBeGreaterThan(0);

    const paint = (facing: number): number => {
      const polys: Array<Array<{ x: number; y: number }>> = [];
      let cur: Array<{ x: number; y: number }> = [];
      const ctx = {
        fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
        beginPath() { cur = []; },
        moveTo(x: number, y: number) { cur.push({ x, y }); },
        lineTo(x: number, y: number) { cur.push({ x, y }); },
        closePath() {}, fill() { polys.push(cur.slice()); }, stroke() {},
        save() {}, restore() {}, translate() {}, ellipse() {},
      } as unknown as CanvasRenderingContext2D;
      const cam = makeCamera(1280, 720);
      drawMesh(ctx, cam, def.mesh!, {
        at: { x: 0, y: 0 }, facing, radius: 1, height: def.heightPx / ISO_Z,
        lean: 0, crouch: 1, weapon: 0, shield: 0, gait: 0,
        weaponPivot: def.meshPivots?.weapon, shieldPivot: def.meshPivots?.shield,
        hipPivot: def.meshPivots?.hip,
        resolveFill: () => '#ffffff',
      });
      const origin = worldToScreen(cam, { x: 0, y: 0 });
      const ys = polys.flat().map((p) => p.y);
      return origin.y - Math.min(...ys);
    };

    for (let i = 0; i < 4; i++) {
      const above = paint((i * Math.PI) / 2);
      expect(above, `facing ${i} is shorter than declared`).toBeGreaterThan(def.heightPx * 0.9);
      expect(above, `facing ${i} is stretched past declared`).toBeLessThan(def.heightPx * 1.55);
    }
  });

  it('swings the shield on its own pivot, the way the detailed guard does', () => {
    expect(def.mesh!.faces.some((f) => f.part === 'shield'), 'no shield faces').toBe(true);

    const probe = (shieldAngle: number): number => {
      const panel = box([-0.56, -0.03, 0.4], [-0.44, 0.25, 1.05], 'tint', 'shield');
      const polys: Array<Array<{ x: number; y: number }>> = [];
      let cur: Array<{ x: number; y: number }> = [];
      const ctx = {
        fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
        beginPath() { cur = []; },
        moveTo(x: number, y: number) { cur.push({ x, y }); },
        lineTo(x: number, y: number) { cur.push({ x, y }); },
        closePath() {}, fill() { polys.push(cur.slice()); }, stroke() {},
        save() {}, restore() {}, translate() {}, ellipse() {},
      } as unknown as CanvasRenderingContext2D;
      drawMesh(ctx, makeCamera(1280, 720), panel, {
        at: { x: 0, y: 0 }, facing: 0, radius: 1,
        height: def.heightPx / ISO_Z,
        lean: 0, crouch: 1, weapon: 0, shield: shieldAngle, gait: 0,
        shieldPivot: def.meshPivots?.shield,
        resolveFill: () => '#ffffff',
      });
      const pts = polys.flat();
      return Math.max(...pts.map((p) => p.y));
    };

    const rest = probe(0);
    const raised = probe(Math.PI / 3);
    expect(raised).not.toBeCloseTo(rest, 3);
  });
});

describe('the duelist authored from the concept sheet', () => {
  const def = MODEL_BANKS.mesh.models.duelist;

  it('carries a rapier and an open hand, never a shield', () => {
    expect(def.mesh).toBeDefined();
    expect(def.mesh!.faces.some((f) => f.part === 'shield')).toBe(false);
    const bladeFaces = def.mesh!.faces.filter((f) => f.part === 'weapon' && f.fill === 'hudText');
    expect(bladeFaces.length).toBeGreaterThan(0);
    const bladeZs = bladeFaces.flatMap((f) => f.v.map((i) => def.mesh!.verts[i][2]));
    expect(Math.min(...bladeZs), 'the blade tip is not held low').toBeLessThan(0.1);
    expect(def.meshPivots?.weapon?.[2], 'the grip is not at mid-body').toBeGreaterThan(0.4);
  });

  it('wears the plume as its one piece of cloth, swept behind the skull', () => {
    const capeFaces = def.mesh!.faces.filter((f) => f.part === 'cape');
    expect(capeFaces.length, 'no plume').toBeGreaterThan(0);
    const pts = capeFaces.flatMap((f) => f.v.map((i) => def.mesh!.verts[i]));
    expect(Math.min(...pts.map((p) => p[2]))).toBeGreaterThan(1);
    expect(Math.min(...pts.map((p) => p[1]))).toBeLessThan(-0.4);
  });

  it('stands slimmer than the guard beside it, as the sheet draws the pair', () => {
    const bodyHalfWidth = (mesh: NonNullable<ModelDef['mesh']>): number =>
      Math.max(
        ...mesh.faces
          .filter((f) => f.part !== 'weapon' && f.part !== 'shield')
          .flatMap((f) => f.v.map((i) => Math.abs(mesh.verts[i][0]))),
      );
    expect(bodyHalfWidth(def.mesh!)).toBeLessThan(
      bodyHalfWidth(MODEL_BANKS.mesh.models.guard.mesh!),
    );
  });

  it('swings the rapier about its own grip, so a lunge reads as a lunge', () => {
    const probe = (weaponAngle: number): number => {
      const blade = box([0.29, 0.09, 0.05], [0.31, 0.11, 0.5], 'hudText', 'weapon');
      const polys: Array<Array<{ x: number; y: number }>> = [];
      let cur: Array<{ x: number; y: number }> = [];
      const ctx = {
        fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
        beginPath() { cur = []; },
        moveTo(x: number, y: number) { cur.push({ x, y }); },
        lineTo(x: number, y: number) { cur.push({ x, y }); },
        closePath() {}, fill() { polys.push(cur.slice()); }, stroke() {},
        save() {}, restore() {}, translate() {}, ellipse() {},
      } as unknown as CanvasRenderingContext2D;
      drawMesh(ctx, makeCamera(1280, 720), blade, {
        at: { x: 0, y: 0 }, facing: 0, radius: 1,
        height: def.heightPx / ISO_Z,
        lean: 0, crouch: 1, weapon: weaponAngle, shield: 0, gait: 0,
        weaponPivot: def.meshPivots?.weapon,
        resolveFill: () => '#ffffff',
      });
      return Math.max(...polys.flat().map((p) => p.y));
    };

    const rest = probe(0);
    const thrust = probe(Math.PI / 3);
    expect(thrust).not.toBeCloseTo(rest, 3);
  });
});

describe('the model turntable', () => {
  it('exposes every distinct combat tell as a selectable state', () => {
    const ids = new Set(MODEL_TURNTABLE_STATES.map((state) => state.id));
    expect(ids.has('windup')).toBe(true);
    expect(ids.has('active')).toBe(true);
    expect(ids.has('telegraph')).toBe(true);
    expect(ids.has('attack')).toBe(true);
    for (const beat of ['telegraph', 'attack']) {
      for (const tell of ['jab', 'chop', 'sweep', 'thrust']) {
        expect(ids.has(`${beat}-${tell}`), `${beat}:${tell} is missing`).toBe(true);
      }
    }
    expect(ids.size).toBe(MODEL_TURNTABLE_STATES.length);
  });

  it('runs locomotion through the production gait while keeping idle planted', () => {
    const move = MODEL_TURNTABLE_STATES.find((state) => state.id === 'move');
    const idle = MODEL_TURNTABLE_STATES.find((state) => state.id === 'idle');
    expect(move).toBeDefined();
    expect(idle).toBeDefined();
    expect(modelTurntableMotion(move!, 180).gaitPhase).not.toBe(0);
    expect(modelTurntableMotion(idle!, 180).gaitPhase).toBe(0);
  });

  it('animates pose interpolation and permits a reproducible fixed frame', () => {
    const sweep = MODEL_TURNTABLE_STATES.find((state) => state.id === 'telegraph-sweep');
    expect(sweep).toBeDefined();
    expect(modelTurntableMotion(sweep!, 0).poseProgress).toBe(0);
    expect(modelTurntableMotion(sweep!, 900).poseProgress).toBe(1);
    expect(modelTurntableMotion(sweep!, 900)).toEqual(modelTurntableMotion(sweep!, 900));
  });
});

describe('attack tells', () => {
  it('raises the weapon to coil and carries it through on release', () => {
    expect(poseFor('windup').weapon).toBeGreaterThan(0);
    expect(poseFor('telegraph').weapon).toBeGreaterThan(0);
    expect(poseFor('active').weapon).toBeLessThanOrEqual(0);
    expect(poseFor('attack').weapon).toBeLessThanOrEqual(0);
  });

  it('coils further the bigger the swing is', () => {
    const jab = poseFor('telegraph', 'jab');
    const chop = poseFor('telegraph', 'chop');
    const sweep = poseFor('telegraph', 'sweep');
    expect(Math.abs(jab.weapon)).toBeLessThan(Math.abs(chop.weapon));
    expect(Math.abs(chop.weapon)).toBeLessThan(Math.abs(sweep.weapon));
  });

  it('separates every tell it defines', () => {
    const seen = new Set(
      ['jab', 'chop', 'sweep', 'thrust'].map((tell) => JSON.stringify(poseFor('telegraph', tell))),
    );
    expect(seen.size).toBe(4);
  });

  it('falls back to the generic wind-up for an attack with no tell', () => {
    expect(poseFor('telegraph')).toEqual(poseFor('telegraph', 'not-a-tell'));
  });

  it('uses the same table for the player beat names and the enemy ones', () => {
    expect(poseFor('windup', 'sweep')).toEqual(poseFor('telegraph', 'sweep'));
    expect(poseFor('active', 'sweep')).toEqual(poseFor('attack', 'sweep'));
  });

  it('unwinds the body when a feint withdraws', () => {
    const coiled = poseFor('telegraph', 'chop');
    const nearRelease = poseAt(coiled, 0.94);
    const withdrawn = poseAt(coiled, 0.2);
    expect(Math.abs(withdrawn.weapon)).toBeLessThan(Math.abs(nearRelease.weapon));
    expect(poseAt(coiled, 1)).toEqual(coiled);
  });

  it('rests at zero progress, so a wind-up is a motion and not a stance', () => {
    const rest = poseAt(poseFor('telegraph', 'sweep'), 0);
    expect(rest.weapon).toBeCloseTo(0);
    expect(rest.lean).toBeCloseTo(0);
    expect(rest.crouch).toBeCloseTo(1);
  });
});

describe('flat model articulation', () => {
  const armedRoles = [
    'player',
    'guard',
    'duelist',
    'archer',
    'first_blade',
    'captain',
  ] as const;

  const rotate = (
    [x, y]: [number, number],
    [px, py]: [number, number],
    angle: number,
  ): [number, number] => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [px + (x - px) * c - (y - py) * s, py + (x - px) * s + (y - py) * c];
  };

  const articulatedY = (
    point: [number, number],
    model: ModelDef,
    state: string,
    tell?: string,
  ): number => {
    const pose = poseFor(state, tell);
    const articulation = model.flatArticulation?.weapon;
    const scale =
      pose.weapon < 0
        ? articulation!.releaseScale ?? articulation!.rotationScale ?? 1
        : articulation!.rotationScale ?? 1;
    const swung = rotate(
      point,
      articulation!.pivot,
      pose.weapon * scale,
    );
    return rotate(swung, [0, 0], pose.lean)[1] * pose.crouch;
  };

  it('declares a real weapon pivot for every armed authored silhouette', () => {
    for (const role of armedRoles) {
      const model = DEFAULT_MODELS.models[role];
      expect(
        model.flatArticulation?.weapon,
        `${role} still uses the cast-wide fallback hand`,
      ).toBeDefined();
    }
  });

  it('keeps authored weapons above the floor through production attack beats', () => {
    const sharedBeats = [
      ['idle'],
      ['windup'],
      ['active'],
      ['recovery'],
      ['telegraph'],
      ['attack'],
    ] as const;
    const captainTells = [
      ['telegraph', 'jab'],
      ['attack', 'jab'],
      ['telegraph', 'chop'],
      ['attack', 'chop'],
      ['telegraph', 'sweep'],
      ['attack', 'sweep'],
      ['telegraph', 'thrust'],
      ['attack', 'thrust'],
    ] as const;

    for (const role of armedRoles) {
      const model = DEFAULT_MODELS.models[role];
      const beats = role === 'captain' ? [...sharedBeats, ...captainTells] : sharedBeats;
      const points = shapesOf(model, (shape) => shape.part === 'weapon').flatMap(
        (shape) =>
          shape.points ?? ([[shape.cx ?? 0, shape.cy ?? 0]] as Array<[number, number]>),
      );
      for (const [state, tell] of beats) {
        const low = Math.min(
          ...points.map((point) => articulatedY(point, model, state, tell)),
        );
        expect(low, `${role} ${state}${tell === undefined ? '' : `:${tell}`}`).toBeGreaterThanOrEqual(
          -0.04,
        );
      }
    }
  });

  it('aims every authored silhouette weapon at the contacted body edge, not its centre', () => {
    const cam = makeCamera(800, 400);
    const body = { x: 1, y: 0 };
    const bodyHeightPx = 50;
    const contact = worldToScreen(cam, body);
    contact.y -= bodyHeightPx * 0.42;

    const armed = Object.entries(DEFAULT_MODELS.models).filter(
      ([, model]) =>
        model.flatArticulation?.weapon !== undefined &&
        model.shapes.some((shape) => shape.part === 'weapon'),
    );
    expect(armed.length).toBeGreaterThan(10);

    for (const [role, model] of armed) {
      const pathPoints: Array<[number, number]> = [];
      const target: Record<string, unknown> = {};
      const ctx = new Proxy(target, {
        get(object, property: string) {
          if (property === 'moveTo' || property === 'lineTo') {
            return (x: number, y: number): void => {
              pathPoints.push([x, y]);
            };
          }
          if (property in object) return object[property];
          return (): void => {};
        },
        set(object, property: string, value) {
          object[property] = value;
          return true;
        },
      }) as unknown as CanvasRenderingContext2D;

      drawModel(ctx, cam, DEFAULT_MODELS, role as ModelRole, {
        at: { x: 0, y: 0 },
        facing: 0,
        radius: 0.45,
        tint: PALETTE.player,
        outline: null,
        pal: PALETTE,
        showFacing: false,
        state: role === 'player' ? 'active' : 'attack',
        weaponContact: { at: body, heightPx: bodyHeightPx, radius: 0.45 },
      });

      const pose = poseFor(role === 'player' ? 'active' : 'attack');
      const articulation = model.flatArticulation!.weapon!;
      const pivot = articulation.pivot;
      const weaponPoints = model.shapes
        .filter((shape) => shape.part === 'weapon')
        .flatMap((shape) =>
          shape.points ?? ([[shape.cx ?? 0, shape.cy ?? 0]] as Array<[number, number]>),
        );
      const tip = weaponPoints.reduce((farthest, point) => {
        const distanceSq = (candidate: [number, number]): number =>
          (candidate[0] - pivot[0]) ** 2 + (candidate[1] - pivot[1]) ** 2;
        return distanceSq(point) > distanceSq(farthest) ? point : farthest;
      });
      const weaponScale =
        pose.weapon < 0
          ? articulation.releaseScale ?? articulation.rotationScale ?? 1
          : articulation.rotationScale ?? 1;
      const swungTip = rotate(tip, pivot, pose.weapon * weaponScale);
      const leanedGrip = rotate(pivot, [0, 0], pose.lean);
      const leanedTip = rotate(swungTip, [0, 0], pose.lean);
      const { rx } = groundEllipse(cam, 0.45);
      const halfW = rx * model.widthScale;
      const viewWidth = model.viewWidthScale?.front ?? 1;
      const grip = {
        x:
          400 +
          (leanedGrip[0] * viewWidth + pose.shift) * halfW,
        y: 200 - leanedGrip[1] * pose.crouch * model.heightPx,
      };
      const authoredTip = {
        x: 400 + (leanedTip[0] * viewWidth + pose.shift) * halfW,
        y: 200 - leanedTip[1] * pose.crouch * model.heightPx,
      };
      const authoredLength = Math.hypot(
        authoredTip.x - grip.x,
        authoredTip.y - grip.y,
      );
      const toCenter = { x: contact.x - grip.x, y: contact.y - grip.y };
      const centerDistance = Math.hypot(toCenter.x, toCenter.y);
      const direction = { x: toCenter.x / centerDistance, y: toCenter.y / centerDistance };
      const contactDistance = centerDistance - rx * 0.75;
      const lungeDistance = Math.min(
        Math.max(0, contactDistance - authoredLength),
        model.heightPx * 0.4,
      );
      const expectedTip = {
        x: grip.x + direction.x * (lungeDistance + authoredLength),
        y: grip.y + direction.y * (lungeDistance + authoredLength),
      };
      expect(
        pathPoints.some(
          ([x, y]) => Math.hypot(x - expectedTip.x, y - expectedTip.y) < 0.01,
        ),
        `${model.id} did not preserve and aim its authored reach`,
      ).toBe(true);
      expect(
        pathPoints.some(
          ([x, y]) => Math.abs(x - contact.x) < 0.001 && Math.abs(y - contact.y) < 0.001,
        ),
        `${model.id} still pulled its tip to the body's centre`,
      ).toBe(false);
    }
  });

  it('never grows a weapon to bridge a contact beyond its capped lunge', () => {
    const cam = makeCamera(800, 400);
    const bank: ModelBank = {
      id: 'rigid-contact-probe',
      description: 'A one-line weapon used to prove contact does not change its length.',
      models: {
        player: {
          id: 'rigid-contact-probe',
          heightPx: 50,
          widthScale: 1,
          flatArticulation: { weapon: { pivot: [0, 0.5] } },
          shapes: [
            { kind: 'line', points: [[0, 0.5], [1, 0.5]], part: 'weapon', stroke: 'hudText' },
          ],
        },
      } as ModelBank['models'],
    };
    const points: Array<[number, number]> = [];
    const target: Record<string, unknown> = {};
    const ctx = new Proxy(target, {
      get(object, property: string) {
        if (property === 'moveTo' || property === 'lineTo') {
          return (x: number, y: number): void => {
            points.push([x, y]);
          };
        }
        if (property in object) return object[property];
        return (): void => {};
      },
      set(object, property: string, value) {
        object[property] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;

    drawModel(ctx, cam, bank, 'player', {
      at: { x: 0, y: 0 },
      facing: 0,
      radius: 0.45,
      tint: PALETTE.player,
      outline: null,
      pal: PALETTE,
      showFacing: false,
      state: 'idle',
      weaponContact: { at: { x: 8, y: 0 }, heightPx: 50, radius: 0.45 },
    });

    expect(points).toHaveLength(2);
    const renderedLength = Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);
    expect(renderedLength).toBeCloseTo(groundEllipse(cam, 0.45).rx, 5);
    expect(Math.hypot(points[1][0] - 672, points[1][1] - 315)).toBeGreaterThan(100);
  });
});

describe('public cast identity anchors', () => {
  it('plants the First Blade and gives his polearm a concave crescent', () => {
    const legs = shapesOf(
      firstBlade,
      (shape) => shape.part === 'legLead' || shape.part === 'legTrail',
    );
    const blade = shapesOf(
      firstBlade,
      (shape) => shape.part === 'weapon' && shape.kind === 'poly' && shape.fill === 'hudText',
    )[0];
    expect(legs.length).toBeGreaterThanOrEqual(2);
    expect(blade.points?.length).toBeGreaterThanOrEqual(6);
  });

  it('gives the Guard a halberd head instead of a single pennant', () => {
    const heads = shapesOf(
      guard,
      (shape) => shape.part === 'weapon' && shape.kind === 'poly',
    );
    expect(heads.length).toBeGreaterThanOrEqual(2);
    expect(heads.some((shape) => shape.fill === 'hudText')).toBe(true);
  });

  it('anchors the archer bow and the duelist rapier to visible arms and guards', () => {
    expect(shapesOf(archer, (shape) => shape.part === 'weapon').length).toBeGreaterThanOrEqual(4);
    expect(
      shapesOf(duelist, (shape) => shape.part === 'weapon' && shape.stroke === 'playerAccent'),
    ).toHaveLength(1);
    expect(shapesOf(duelist, (shape) => shape.fill === 'garment').length).toBeGreaterThanOrEqual(2);
  });
});

describe('authored boss gesture', () => {
  it('carries the Captain sword beside the torso in idle', () => {
    const blade = shapesOf(
      captain,
      (shape) => shape.part === 'weapon' && shape.kind === 'line' && shape.stroke === 'hudText',
    )[0];
    expect(Math.min(...(blade.points ?? []).map(([x]) => x))).toBeGreaterThanOrEqual(0.25);
    expect(Math.min(...(blade.points ?? []).map(([, y]) => y))).toBeLessThan(0.4);
  });

  it('gives the unarmed Chancellor an articulated casting gesture and office seals', () => {
    expect(shapesOf(chancellor, (shape) => shape.part === 'weapon')).toHaveLength(0);
    expect(shapesOf(chancellor, (shape) => shape.part === 'gesture').length).toBeGreaterThanOrEqual(3);
    expect(
      shapesOf(
        chancellor,
        (shape) => shape.side === 'front' && shape.kind === 'poly' && shape.fill === 'hudText',
      ).length,
    ).toBeGreaterThanOrEqual(4);
  });
});

describe("the Captain's four reads", () => {
  const captainAttacks = DEFAULT_COMBAT.enemies.captain.attacks;

  it('gives the feint the strike it imitates, and nothing else the same', () => {
    const byId = Object.fromEntries(captainAttacks.map((a) => [a.id, a.tell]));
    expect(byId.captain_feint).toBe(byId.captain_direct);
    expect(new Set(Object.values(byId)).size).toBe(3);
  });

  it('matches the size of the tell to the length of the wind-up', () => {
    const byId = Object.fromEntries(captainAttacks.map((a) => [a.id, a]));
    expect(byId.captain_pressure.tell).toBe('jab');
    expect(byId.captain_pressure.telegraphMs).toBeLessThan(byId.captain_direct.telegraphMs);
    expect(byId.captain_release.tell).toBe('sweep');
    expect(byId.captain_release.arcDeg).toBeGreaterThan(byId.captain_direct.arcDeg);
  });
});
