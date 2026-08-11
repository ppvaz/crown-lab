
import type { EnemyArchetype, Vec2 } from '../sim/types';
import type { Palette } from './palette';
import { compilePartOrder, drawCommands } from './actor-stack';
import type { ActorCommand } from './actor-stack';
import type { Camera } from './iso';
import { groundEllipse, worldToScreen } from './iso';
import type { Face, Mesh, MeshTexture, Vec3 } from './mesh';
import { ISO_Z, drawMesh, walkTerms } from './mesh';

export type ModelRole = 'player' | EnemyArchetype;

export type ShapePart =
  | 'body'
  | 'weapon'
  | 'shield'
  | 'head'
  | 'gesture'
  | 'legLead'
  | 'legTrail';

export type ModelView = 'front' | 'back' | 'profile';

export interface ModelShape {
  part?: ShapePart;
  shade?: number;
  side?: ModelView;
  kind: 'poly' | 'ellipse' | 'line';
  points?: Array<[number, number]>;
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  fill?: string | null;
  stroke?: string | null;
  width?: number;
}

export interface ModelDef {
  id: string;
  heightPx: number;
  widthScale: number;
  shapes: ModelShape[];
  mesh?: Mesh;
  meshPivots?: {
    arm?: Vec3;
    weapon?: Vec3;
    shield?: Vec3;
    hip?: Vec3;
    cape?: Vec3;
    weaponArmPhase?: 'lead' | 'trail';
    waist?: Vec3;
  };
  flatArticulation?: Partial<
    Record<
      'weapon' | 'shield' | 'gesture',
      {
        pivot: [number, number];
        rotationScale?: number;
        releaseScale?: number;
      }
    >
  >;
  viewPartOrder?: Partial<Record<ModelView, ShapePart[]>>;
  viewWidthScale?: Partial<Record<ModelView, number>>;
  profileDepth?: number;
}

export interface ModelBank {
  id: string;
  description: string;
  models: Record<ModelRole, ModelDef>;
  texture?: () => MeshTexture | null;
}


export interface Pose {
  lean: number;
  crouch: number;
  weapon: number;
  shield: number;
  shift: number;
}

const REST: Pose = { lean: 0, crouch: 1, weapon: 0, shield: 0, shift: 0 };

export const POSES: Record<string, Pose> = {
  ['entrance_fall']: { ...REST, lean: 0.08, crouch: 1.08, weapon: 0.25 },
  ['entrance_roar']: { ...REST, lean: -0.18, crouch: 1.1, weapon: 1.2, shift: -0.08 },
  ['phase_roar']: { ...REST, lean: -0.18, crouch: 1.1, weapon: 1.2, shift: -0.08 },
  ['idle']: REST,
  ['move']: { ...REST, lean: 0.06 },
  ['approach']: { ...REST, lean: 0.08 },
  ['reposition']: { ...REST, lean: -0.05 },
  ['sequence_reposition']: { ...REST, lean: 0.24, crouch: 0.9, weapon: 0.35, shift: 0.22 },
  ['edge_reposition']: { ...REST, lean: 0.32, crouch: 0.82, weapon: 0.1, shift: 0.3 },
  ['glide']: { ...REST, lean: 0.48, crouch: 0.9, weapon: 0.18, shift: 0.34 },

  ['windup']: { ...REST, lean: -0.16, weapon: 1.35, crouch: 1.04, shift: -0.12 },
  ['telegraph']: { ...REST, lean: -0.16, weapon: 1.35, crouch: 1.04, shift: -0.12 },

  ['active']: { ...REST, lean: 0.34, weapon: -1.05, crouch: 0.94, shift: 0.3 },
  ['attack']: { ...REST, lean: 0.34, weapon: -1.05, crouch: 0.94, shift: 0.3 },

  ['recovery']: { ...REST, lean: 0.2, weapon: -0.5, crouch: 0.88, shift: 0.16 },

  guard: { ...REST, lean: 0.1, crouch: 0.92, shield: -0.5, weapon: 0.25, shift: 0.08 },
  ['parry']: { ...REST, lean: 0.16, crouch: 0.88, shield: -0.85, weapon: 0.3, shift: 0.14 },



  ['guard_impact']: { ...REST, lean: -0.22, crouch: 0.87, shield: -0.95, weapon: 0.55, shift: -0.16 },
  ['parry_impact']: { ...REST, lean: -0.32, crouch: 0.82, shield: -1.3, weapon: 0.9, shift: -0.28 },

  step: { ...REST, lean: 0.3, crouch: 0.8 },
  ['stagger']: { ...REST, lean: -0.45, crouch: 0.82, weapon: 0.45, shift: -0.3 },
  ['dead']: { ...REST, lean: -1.3, crouch: 0.35, weapon: 0.3, shift: -0.5 },
};

const TELL_POSES: Record<string, Pose> = {
  ['telegraph:jab']: { ...REST, lean: -0.06, weapon: 0.5, crouch: 0.98, shift: -0.04 },
  ['attack:jab']: { ...REST, lean: 0.24, weapon: -0.45, crouch: 0.96, shift: 0.22 },

  ['telegraph:chop']: { ...REST, lean: -0.16, weapon: 1.35, crouch: 1.04, shift: -0.12 },
  ['attack:chop']: { ...REST, lean: 0.34, weapon: -1.05, crouch: 0.94, shift: 0.3 },

  ['telegraph:sweep']: { ...REST, lean: -0.3, weapon: 1.65, crouch: 1.06, shift: -0.26 },
  ['attack:sweep']: { ...REST, lean: 0.46, weapon: -1.15, crouch: 0.88, shift: 0.42 },

  ['telegraph:thrust']: { ...REST, lean: -0.1, weapon: 0.1, crouch: 0.96, shift: -0.2 },
  ['attack:thrust']: { ...REST, lean: 0.4, weapon: -0.03, crouch: 0.92, shift: 0.46 },
};

export const poseFor = (state: string, tell?: string): Pose => {
  if (tell !== undefined) {
    const beat =
      state === 'windup' || state === 'telegraph'
        ? 'telegraph'
        : state === 'active' || state === 'attack'
          ? 'attack'
          : null;
    if (beat !== null) {
      const specialised = TELL_POSES[`${beat}:${tell}`];
      if (specialised !== undefined) return specialised;
    }
  }
  return POSES[state] ?? REST;
};

export const poseAt = (pose: Pose, t: number, from: Pose = REST): Pose => {
  const k = Math.max(0, Math.min(1, t));
  if (k === 1) return pose;
  return {
    lean: from.lean + (pose.lean - from.lean) * k,
    crouch: from.crouch + (pose.crouch - from.crouch) * k,
    weapon: from.weapon + (pose.weapon - from.weapon) * k,
    shield: from.shield + (pose.shield - from.shield) * k,
    shift: from.shift + (pose.shift - from.shift) * k,
  };
};

const POSE_FROM: Record<string, string> = {
  active: 'windup',
  attack: 'telegraph',
  recovery: 'active',
};

const poseFromFor = (state: string, tell?: string): Pose | undefined => {
  const prior = POSE_FROM[state];
  return prior === undefined ? undefined : poseFor(prior, tell);
};

const FOLD_AT_WAIST = new Set(['dead', 'stagger']);


export const DEFAULT_MODEL_BANK = 'mesh';


export interface ModelDrawOpts {
  at: Vec2;
  facing: number;
  radius: number;
  tint: string;
  outline: string | null;
  pal: Palette;
  showFacing: boolean;
  state: string;
  elevationPx?: number;
  shadowScale?: number;
  tell?: string;
  poseProgress?: number;
  gaitPhase?: number;
  weaponContact?: {
    at: Vec2;
    heightPx: number;
    radius: number;
    elevationPx?: number;
  };
  stack?: readonly ActorCommand[];
  hiddenParts?: ReadonlySet<Face['part']>;
  powerArm?: number;
}

const shade = (hex: string | null, amount: number | undefined): string | null => {
  if (hex === null || amount === undefined || amount === 1) return hex;
  const v = parseInt(hex.slice(1), 16);
  const ch = (shift: number): number => {
    const c = (v >> shift) & 255;
    return Math.max(0, Math.min(255, Math.round(amount > 1 ? c + (255 - c) * (amount - 1) : c * amount)));
  };
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
};

const drawFacingMark = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  opts: ModelDrawOpts,
): void => {
  const { at, facing, radius } = opts;
  const tipR = radius + 0.62;
  const baseR = radius + 0.12;
  const spread = 0.42;

  const pts = [
    { x: at.x + Math.cos(facing) * tipR, y: at.y + Math.sin(facing) * tipR },
    {
      x: at.x + Math.cos(facing + spread) * baseR,
      y: at.y + Math.sin(facing + spread) * baseR,
    },
    {
      x: at.x + Math.cos(facing - spread) * baseR,
      y: at.y + Math.sin(facing - spread) * baseR,
    },
  ].map((p) => worldToScreen(cam, p));

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.lineTo(pts[2].x, pts[2].y);
  ctx.closePath();

  ctx.globalAlpha = 0.85;
  ctx.fillStyle = opts.tint;
  ctx.fill();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = opts.pal.floor;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
};

const resolveColor = (spec: string | null | undefined, opts: ModelDrawOpts): string | null => {
  if (spec === null || spec === undefined) return null;
  if (spec === 'tint') return opts.tint;
  if (spec === 'outline') return opts.outline;
  const fromPalette = (opts.pal as Record<string, string>)[spec];
  return fromPalette ?? spec;
};

const facesRight = (facing: number): boolean => Math.cos(facing) - Math.sin(facing) >= 0;

const facesCamera = (facing: number): boolean => Math.cos(facing) + Math.sin(facing) >= 0;

export const viewOf = (facing: number): ModelView => {
  const acrossScreen = Math.abs(Math.cos(facing) - Math.sin(facing));
  const intoScreen = Math.abs(Math.cos(facing) + Math.sin(facing));
  if (acrossScreen > intoScreen) return 'profile';
  return facesCamera(facing) ? 'front' : 'back';
};

export const drawModel = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  bank: ModelBank,
  role: ModelRole,
  opts: ModelDrawOpts,
): void => {
  const def = bank.models[role];
  const p = worldToScreen(cam, opts.at);
  const { rx, ry } = groundEllipse(cam, opts.radius);
  const lift = (opts.elevationPx ?? 0) * cam.zoom;
  const shadowScale = opts.shadowScale ?? 1;

  ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rx * shadowScale, ry * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (opts.showFacing) drawFacingMark(ctx, cam, opts);

  const h = def.heightPx * cam.zoom;
  const halfW = rx * def.widthScale;
  const dir = facesRight(opts.facing) ? 1 : -1;

  const stack = opts.stack ?? [];

  if (def.mesh !== undefined) {
    const pose = poseAt(poseFor(opts.state, opts.tell), opts.poseProgress ?? 1, poseFromFor(opts.state, opts.tell));
    const weaponArticulation = def.flatArticulation?.weapon;
    const weaponScale =
      pose.weapon < 0
        ? weaponArticulation?.releaseScale ?? weaponArticulation?.rotationScale ?? 1
        : weaponArticulation?.rotationScale ?? 1;
    drawCommands([
      ...stack,
      {
        slot: 'body',
        draw: () => {
          ctx.save();
          ctx.translate(0, -lift);
          drawMesh(ctx, cam, def.mesh!, {
            at: opts.at,
            facing: opts.facing,
            radius: opts.radius / 0.45,
            height: def.heightPx / ISO_Z,
            lean: pose.lean,
            crouch: pose.crouch,
            weapon: pose.weapon * weaponScale,
            shield: pose.shield,
            gait: opts.gaitPhase ?? 0,
            weaponPivot: def.meshPivots?.weapon,
            shieldPivot: def.meshPivots?.shield,
            hipPivot: def.meshPivots?.hip,
            armPivot: def.meshPivots?.arm,
            capePivot: def.meshPivots?.cape,
            weaponArmPhase: def.meshPivots?.weaponArmPhase,
            waistPivot: FOLD_AT_WAIST.has(opts.state) ? def.meshPivots?.waist : undefined,
            hiddenParts: opts.hiddenParts,
            powerArm: opts.powerArm,
            resolveFill: (spec) => resolveColor(spec, opts) ?? opts.tint,
            texture: bank.texture?.() ?? undefined,
          });
          ctx.restore();
        },
      },
    ]);
    return;
  }

  const pose = poseAt(poseFor(opts.state, opts.tell), opts.poseProgress ?? 1, poseFromFor(opts.state, opts.tell));
  const view = viewOf(opts.facing);

  const HAND: [number, number] = [0.35, 0.55];
  const SHOULDER: [number, number] = [-0.5, 0.6];
  const HIP: [number, number] = [0, 0.3];

  const { legSwing, bob: bobPx, roll } = walkTerms(opts.gaitPhase ?? 0);

  const rotateAbout = (
    pt: [number, number],
    pivot: [number, number],
    angle: number,
  ): [number, number] => {
    if (angle === 0) return pt;
    const dx = pt[0] - pivot[0];
    const dy = pt[1] - pivot[1];
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [pivot[0] + dx * c - dy * s, pivot[1] + dx * s + dy * c];
  };

  const baseProject = (
    raw: [number, number],
    part: ShapePart,
    profileOffset = 0,
  ): { x: number; y: number } => {
    let pt = raw;
    if (part === 'weapon' && pose.weapon !== 0) {
      const articulation = def.flatArticulation?.weapon;
      const scale =
        pose.weapon < 0
          ? articulation?.releaseScale ?? articulation?.rotationScale ?? 1
          : articulation?.rotationScale ?? 1;
      pt = rotateAbout(
        pt,
        articulation?.pivot ?? HAND,
        pose.weapon * scale,
      );
    } else if (part === 'shield' && pose.shield !== 0) {
      const articulation = def.flatArticulation?.shield;
      pt = rotateAbout(
        pt,
        articulation?.pivot ?? SHOULDER,
        pose.shield * (articulation?.rotationScale ?? 1),
      );
    } else if (part === 'gesture' && pose.weapon !== 0) {
      const articulation = def.flatArticulation?.gesture;
      const scale =
        pose.weapon < 0
          ? articulation?.releaseScale ?? articulation?.rotationScale ?? 1
          : articulation?.rotationScale ?? 1;
      pt = rotateAbout(pt, articulation?.pivot ?? [0, 0.55], pose.weapon * scale);
    } else if (part === 'legLead' && legSwing !== 0) pt = rotateAbout(pt, HIP, legSwing);
    else if (part === 'legTrail' && legSwing !== 0) pt = rotateAbout(pt, HIP, -legSwing);
    if (pose.lean !== 0) pt = rotateAbout(pt, [0, 0], pose.lean);
    if (roll !== 0) pt = rotateAbout(pt, [0, 0], roll);
    const viewWidth = def.viewWidthScale?.[view] ?? 1;
    return {
      x: p.x + (pt[0] * viewWidth + pose.shift + profileOffset) * halfW * dir,
      y: p.y - lift - (pt[1] * pose.crouch + bobPx) * h,
    };
  };

  const visibleShapes = def.shapes.filter(
    (shape) => shape.side === undefined || shape.side === view,
  );


  const articulation =
    opts.weaponContact === undefined ? undefined : def.flatArticulation?.weapon;
  const weaponPoints =
    articulation === undefined
      ? []
      : visibleShapes
          .filter((shape) => shape.part === 'weapon')
          .flatMap((shape) =>
            shape.points ?? ([[shape.cx ?? 0, shape.cy ?? 0]] as Array<[number, number]>),
          );
  const weaponTip =
    articulation === undefined || weaponPoints.length === 0
      ? undefined
      : weaponPoints.reduce((farthest, point) => {
          const distanceSq =
            (point[0] - articulation.pivot[0]) ** 2 +
            (point[1] - articulation.pivot[1]) ** 2;
          const farthestSq =
            (farthest[0] - articulation.pivot[0]) ** 2 +
            (farthest[1] - articulation.pivot[1]) ** 2;
          return distanceSq > farthestSq ? point : farthest;
        });
  const gripScreen =
    articulation === undefined ? undefined : baseProject(articulation.pivot, 'weapon');
  const tipScreen = weaponTip === undefined ? undefined : baseProject(weaponTip, 'weapon');
  const contactCenter =
    opts.weaponContact === undefined
      ? undefined
      : (() => {
          const at = worldToScreen(cam, opts.weaponContact.at);
          return {
            x: at.x,
            y:
              at.y -
              ((opts.weaponContact.heightPx * 0.42) +
                (opts.weaponContact.elevationPx ?? 0)) *
                cam.zoom,
          };
        })();

  const contactTransform = (() => {
    if (
      opts.weaponContact === undefined ||
      gripScreen === undefined ||
      tipScreen === undefined ||
      contactCenter === undefined
    ) {
      return undefined;
    }
    const authored = {
      x: tipScreen.x - gripScreen.x,
      y: tipScreen.y - gripScreen.y,
    };
    const toCenter = {
      x: contactCenter.x - gripScreen.x,
      y: contactCenter.y - gripScreen.y,
    };
    const authoredLength = Math.hypot(authored.x, authored.y);
    const centerDistance = Math.hypot(toCenter.x, toCenter.y);
    if (authoredLength < 0.001 || centerDistance < 0.001) return undefined;

    const direction = { x: toCenter.x / centerDistance, y: toCenter.y / centerDistance };
    const nearEdgeInset = Math.min(
      centerDistance * 0.5,
      groundEllipse(cam, opts.weaponContact.radius).rx * 0.75,
    );
    const contactDistance = centerDistance - nearEdgeInset;
    const lungeDistance = Math.min(
      Math.max(0, contactDistance - authoredLength),
      h * 0.4,
    );
    const cos = (authored.x * direction.x + authored.y * direction.y) / authoredLength;
    const sin = (authored.x * direction.y - authored.y * direction.x) / authoredLength;
    return {
      cos,
      sin,
      lunge: { x: direction.x * lungeDistance, y: direction.y * lungeDistance },
    };
  })();

  const project = (
    raw: [number, number],
    part: ShapePart,
    profileOffset = 0,
  ): { x: number; y: number } => {
    const point = baseProject(raw, part, profileOffset);
    if (contactTransform === undefined || gripScreen === undefined) return point;
    if (part !== 'weapon') {
      const heightCarry = Math.max(
        0,
        Math.min(1, raw[1] / Math.max(0.001, articulation?.pivot[1] ?? 0.55)),
      );
      const carry =
        part === 'legLead' || part === 'legTrail'
          ? Math.min(0.3, heightCarry)
          : part === 'gesture'
            ? 0
            : heightCarry;
      return {
        x: point.x + contactTransform.lunge.x * carry,
        y: point.y + contactTransform.lunge.y * carry,
      };
    }

    const relative = {
      x: point.x - gripScreen.x,
      y: point.y - gripScreen.y,
    };
    return {
      x:
        gripScreen.x +
        contactTransform.lunge.x +
        relative.x * contactTransform.cos -
        relative.y * contactTransform.sin,
      y:
        gripScreen.y +
        contactTransform.lunge.y +
        relative.x * contactTransform.sin +
        relative.y * contactTransform.cos,
    };
  };

  const partOrder = def.viewPartOrder?.[view];
  if (partOrder !== undefined) {
    const rank = compilePartOrder(partOrder);
    visibleShapes.sort((a, b) => rank(a.part) - rank(b.part));
  }

  const traceShape = (shape: ModelShape, profileOffset = 0): boolean => {
    const part = shape.part ?? 'body';
    if (shape.kind === 'ellipse') {
      const c = project([shape.cx ?? 0, shape.cy ?? 0], part, profileOffset);
      ctx.beginPath();
      ctx.ellipse(
        c.x,
        c.y,
        (shape.rx ?? 0.2) * halfW * (def.viewWidthScale?.[view] ?? 1),
        (shape.ry ?? 0.1) * h * pose.crouch,
        0,
        0,
        Math.PI * 2,
      );
    } else {
      const pts = shape.points ?? [];
      if (pts.length === 0) return false;
      ctx.beginPath();
      const first = project(pts[0], part, profileOffset);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < pts.length; i++) {
        const q = project(pts[i], part, profileOffset);
        ctx.lineTo(q.x, q.y);
      }
      if (shape.kind === 'poly') ctx.closePath();
    }
    return true;
  };

  const paintShapes = (shapes: readonly ModelShape[]) => (): void => {
    for (const shape of shapes) {
      const fill = shade(resolveColor(shape.fill, opts), shape.shade);
      const stroke = shade(resolveColor(shape.stroke, opts), shape.shade);
      ctx.lineWidth = shape.width ?? 1.5;

      if (!traceShape(shape)) continue;

      if (fill !== null && shape.kind !== 'line') {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke !== null) {
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
    }
  };

  const commands: ActorCommand[] = [...stack];
  if (view === 'profile' && (def.profileDepth ?? 0) > 0) {
    commands.push({
      slot: 'body',
      depthBias: -1,
      draw: () => {
        const solidParts = new Set<ShapePart>(['body', 'head', 'legLead', 'legTrail']);
        for (const shape of visibleShapes) {
          const part = shape.part ?? 'body';
          if (shape.kind === 'line' || !solidParts.has(part)) continue;
          if (!traceShape(shape, -(def.profileDepth ?? 0))) continue;
          const rear = shade(resolveColor(shape.fill, opts), (shape.shade ?? 1) * 0.48);
          if (rear !== null) {
            ctx.fillStyle = rear;
            ctx.fill();
          }
        }
      },
    });
  }
  if (partOrder === undefined) {
    commands.push({ slot: 'body', draw: paintShapes(visibleShapes) });
  } else {
    const rank = compilePartOrder(partOrder);
    let group: ModelShape[] = [];
    let groupPart: ShapePart = 'body';
    const flush = (): void => {
      if (group.length === 0) return;
      commands.push({ slot: 'body', depthBias: rank(groupPart), part: groupPart, draw: paintShapes(group) });
      group = [];
    };
    for (const shape of visibleShapes) {
      const part = shape.part ?? 'body';
      if (group.length > 0 && part !== groupPart) flush();
      groupPart = part;
      group.push(shape);
    }
    flush();
  }
  drawCommands(commands);
};

export interface ModelTurntableState {
  id: string;
  state: string;
  tell?: string;
}

export const MODEL_TURNTABLE_STATES: readonly ModelTurntableState[] = [
  { id: 'idle', state: 'idle' },
  { id: 'move', state: 'move' },
  { id: 'approach', state: 'approach' },
  { id: 'reposition', state: 'reposition' },
  { id: 'sequence-reposition', state: 'sequence_reposition' },
  { id: 'edge-reposition', state: 'edge_reposition' },
  { id: 'glide', state: 'glide' },
  { id: 'guard', state: 'guard' },
  { id: 'parry', state: 'parry' },
  { id: 'guard-impact', state: 'guard_impact' },
  { id: 'parry-impact', state: 'parry_impact' },
  { id: 'step', state: 'step' },
  { id: 'windup', state: 'windup' },
  { id: 'telegraph', state: 'telegraph' },
  { id: 'telegraph-jab', state: 'telegraph', tell: 'jab' },
  { id: 'telegraph-chop', state: 'telegraph', tell: 'chop' },
  { id: 'telegraph-sweep', state: 'telegraph', tell: 'sweep' },
  { id: 'telegraph-thrust', state: 'telegraph', tell: 'thrust' },
  { id: 'active', state: 'active' },
  { id: 'attack', state: 'attack' },
  { id: 'attack-jab', state: 'attack', tell: 'jab' },
  { id: 'attack-chop', state: 'attack', tell: 'chop' },
  { id: 'attack-sweep', state: 'attack', tell: 'sweep' },
  { id: 'attack-thrust', state: 'attack', tell: 'thrust' },
  { id: 'recovery', state: 'recovery' },
  { id: 'stagger', state: 'stagger' },
  { id: 'dead', state: 'dead' },
  { id: 'entrance-fall', state: 'entrance_fall' },
  { id: 'entrance-roar', state: 'entrance_roar' },
] as const;

const LOCOMOTION_STATES = new Set([
  'move',
  'approach',
  'reposition',
  'sequence_reposition',
  'edge_reposition',
]);

export const modelTurntableMotion = (
  showcase: ModelTurntableState,
  elapsedMs: number,
): { gaitPhase: number; poseProgress: number } => {
  const time = Math.max(0, elapsedMs);
  const locomoting = LOCOMOTION_STATES.has(showcase.state);
  const gaitPhase = locomoting ? (time / 720) * Math.PI * 2 : 0;
  const poseProgress =
    showcase.state === 'idle' || locomoting || showcase.state === 'dead'
      ? 1
      : 0.5 - Math.cos((time / 1800) * Math.PI * 2) * 0.5;
  return { gaitPhase, poseProgress };
};

const TURNTABLE_DIRECTIONS = [
  { label: '+X', facing: 0 },
  { label: '+X +Y', facing: Math.PI / 4 },
  { label: '+Y', facing: Math.PI / 2 },
  { label: '-X +Y', facing: (Math.PI * 3) / 4 },
  { label: '-X', facing: Math.PI },
  { label: '-X -Y', facing: (Math.PI * 5) / 4 },
  { label: '-Y', facing: (Math.PI * 3) / 2 },
  { label: '+X -Y', facing: (Math.PI * 7) / 4 },
] as const;

export const drawModelTurntable = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  bank: ModelBank,
  role: ModelRole,
  pal: Palette,
  tint: string,
  outline: string | null,
  bounds: { x: number; y: number; w: number; h: number } = {
    x: 0,
    y: 0,
    w: cam.width,
    h: cam.height,
  },
  showcase: {
    pose?: ModelTurntableState;
    elapsedMs?: number;
  } = {},
): void => {
  const shownPose = showcase.pose ?? MODEL_TURNTABLE_STATES[0];
  const motion = modelTurntableMotion(shownPose, showcase.elapsedMs ?? 0);
  ctx.save();
  const backdrop = ctx.createRadialGradient(
    bounds.x + bounds.w / 2,
    bounds.y + bounds.h / 2,
    0,
    bounds.x + bounds.w / 2,
    bounds.y + bounds.h / 2,
    Math.hypot(bounds.w, bounds.h) * 0.62,
  );
  backdrop.addColorStop(0, pal.floorGrid);
  backdrop.addColorStop(1, pal.floor);
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, cam.width, cam.height);

  const zoom = Math.max(1.15, Math.min(1.7, bounds.h / 520));
  const titleSize = Math.max(12, bounds.h * 0.022);
  const labelSize = Math.max(10, titleSize * 0.72);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.hudText;
  ctx.font = `700 ${titleSize}px ui-monospace, monospace`;
  ctx.fillText(
    `${bank.models[role].id} — ${role}`,
    bounds.x + bounds.w / 2,
    bounds.y + bounds.h * 0.08,
  );
  ctx.fillStyle = pal.hudDim;
  ctx.font = `600 ${labelSize}px ui-monospace, monospace`;
  ctx.fillText(
    `${shownPose.id} — animated production pose`,
    bounds.x + bounds.w / 2,
    bounds.y + bounds.h * 0.115,
  );

  for (let index = 0; index < TURNTABLE_DIRECTIONS.length; index += 1) {
    const direction = TURNTABLE_DIRECTIONS[index];
    const column = index % 4;
    const row = Math.floor(index / 4);
    const x = bounds.x + bounds.w * (0.14 + column * 0.24);
    const y = bounds.y + bounds.h * (0.37 + row * 0.43);
    const localCam: Camera = {
      ...cam,
      center: { x: 0, y: 0 },
      offset: { x: x - cam.width / 2, y: y - cam.height / 2 },
      zoom,
    };
    drawModel(ctx, localCam, bank, role, {
      at: { x: 0, y: 0 },
      facing: direction.facing,
      radius: 0.45,
      tint,
      outline,
      pal,
      showFacing: true,
      state: shownPose.state,
      ...(shownPose.tell === undefined ? {} : { tell: shownPose.tell }),
      gaitPhase: motion.gaitPhase,
      poseProgress: motion.poseProgress,
    });
    ctx.fillStyle = pal.hudDim;
    ctx.font = `600 ${labelSize}px ui-monospace, monospace`;
    ctx.fillText(direction.label, x, y + bank.models[role].heightPx * zoom * 0.23);
  }
  ctx.restore();
};

export const cloneBank = (bank: ModelBank): ModelBank => ({
  id: bank.id,
  description: bank.description,
  models: bank.models,
  texture: bank.texture,
});
