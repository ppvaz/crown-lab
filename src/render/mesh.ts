
import type { Camera } from './iso';
import { worldToScreen } from './iso';

export type Vec3 = [number, number, number];

export interface Face {
  v: number[];
  fill: string;
  part?:
    | 'body'
    | 'weapon'
    | 'shield'
    | 'legLead'
    | 'legTrail'
    | 'armLead'
    | 'armTrail'
    | 'cape';
}

export interface Mesh {
  verts: Vec3[];
  faces: Face[];
}

export const ISO_Z = 30;

export const box = (
  min: Vec3,
  max: Vec3,
  fill: string,
  part: Face['part'] = 'body',
): Mesh => {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  return {
    verts: [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y1, z0],
      [x0, y1, z0],
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ],
    faces: [
      { v: [4, 5, 6, 7], fill, part },
      { v: [3, 2, 1, 0], fill, part },
      { v: [0, 1, 5, 4], fill, part },
      { v: [2, 3, 7, 6], fill, part },
      { v: [1, 2, 6, 5], fill, part },
      { v: [3, 0, 4, 7], fill, part },
    ],
  };
};

export const frustum = (
  bottom: [number, number, number, number],
  top: [number, number, number, number],
  z0: number,
  z1: number,
  fill: string,
  part: Face['part'] = 'body',
): Mesh => {
  const [bx0, by0, bx1, by1] = bottom;
  const [tx0, ty0, tx1, ty1] = top;
  return {
    verts: [
      [bx0, by0, z0],
      [bx1, by0, z0],
      [bx1, by1, z0],
      [bx0, by1, z0],
      [tx0, ty0, z1],
      [tx1, ty0, z1],
      [tx1, ty1, z1],
      [tx0, ty1, z1],
    ],
    faces: [
      { v: [4, 5, 6, 7], fill, part },
      { v: [3, 2, 1, 0], fill, part },
      { v: [0, 1, 5, 4], fill, part },
      { v: [2, 3, 7, 6], fill, part },
      { v: [1, 2, 6, 5], fill, part },
      { v: [3, 0, 4, 7], fill, part },
    ],
  };
};

export const cylinder = (
  center: [number, number],
  radii: [number, number],
  z0: number,
  z1: number,
  fill: string,
  part: Face['part'] = 'body',
  segments = 10,
  topRadii: [number, number] = radii,
): Mesh => {
  const count = Math.max(3, Math.floor(segments));
  const verts: Vec3[] = [];
  for (const [z, r] of [
    [z0, radii],
    [z1, topRadii],
  ] as Array<[number, [number, number]]>) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      verts.push([
        center[0] + Math.cos(angle) * r[0],
        center[1] + Math.sin(angle) * r[1],
        z,
      ]);
    }
  }

  const faces: Face[] = [
    { v: Array.from({ length: count }, (_, i) => count - 1 - i), fill, part },
    { v: Array.from({ length: count }, (_, i) => count + i), fill, part },
  ];
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    faces.push({ v: [i, next, count + next, count + i], fill, part });
  }
  return { verts, faces };
};

export const ellipsoid = (
  center: Vec3,
  radii: Vec3,
  fill: string,
  part: Face['part'] = 'body',
  segments = 10,
  rings = 5,
): Mesh => {
  const segmentCount = Math.max(3, Math.floor(segments));
  const ringCount = Math.max(2, Math.floor(rings));
  const verts: Vec3[] = [[center[0], center[1], center[2] - radii[2]]];

  for (let ring = 1; ring < ringCount; ring++) {
    const latitude = -Math.PI / 2 + (ring / ringCount) * Math.PI;
    const radial = Math.cos(latitude);
    for (let i = 0; i < segmentCount; i++) {
      const longitude = (i / segmentCount) * Math.PI * 2;
      verts.push([
        center[0] + Math.cos(longitude) * radii[0] * radial,
        center[1] + Math.sin(longitude) * radii[1] * radial,
        center[2] + Math.sin(latitude) * radii[2],
      ]);
    }
  }

  const top = verts.length;
  verts.push([center[0], center[1], center[2] + radii[2]]);
  const faces: Face[] = [];
  for (let i = 0; i < segmentCount; i++) {
    const next = (i + 1) % segmentCount;
    faces.push({ v: [0, 1 + next, 1 + i], fill, part });
  }

  for (let ring = 0; ring < ringCount - 2; ring++) {
    const lower = 1 + ring * segmentCount;
    const upper = lower + segmentCount;
    for (let i = 0; i < segmentCount; i++) {
      const next = (i + 1) % segmentCount;
      faces.push({
        v: [lower + i, lower + next, upper + next, upper + i],
        fill,
        part,
      });
    }
  }

  const lastRing = 1 + (ringCount - 2) * segmentCount;
  for (let i = 0; i < segmentCount; i++) {
    const next = (i + 1) % segmentCount;
    faces.push({ v: [top, lastRing + i, lastRing + next], fill, part });
  }
  return { verts, faces };
};

const TOP_Z = new WeakMap<Mesh, number>();
export const meshTopZ = (mesh: Mesh): number => {
  const cached = TOP_Z.get(mesh);
  if (cached !== undefined) return cached;
  let top = 0;
  for (const face of mesh.faces) {
    if (face.part === 'weapon' || face.part === 'shield') continue;
    for (const i of face.v) top = Math.max(top, mesh.verts[i][2]);
  }
  const value = top > 0 ? top : 1;
  TOP_Z.set(mesh, value);
  return value;
};

export const merge = (...parts: Mesh[]): Mesh => {
  const verts: Vec3[] = [];
  const faces: Face[] = [];
  for (const part of parts) {
    const base = verts.length;
    verts.push(...part.verts);
    for (const f of part.faces) faces.push({ ...f, v: f.v.map((i) => i + base) });
  }
  return { verts, faces };
};


export const pitched = (mesh: Mesh, angle: number, pivot: Vec3): Mesh => ({
  faces: mesh.faces,
  verts: mesh.verts.map(([x, y, z]): Vec3 => {
    const dy = y - pivot[1];
    const dz = z - pivot[2];
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [x, pivot[1] + dy * c - dz * s, pivot[2] + dy * s + dz * c];
  }),
});

export const rolled = (mesh: Mesh, angle: number, pivot: Vec3): Mesh => ({
  faces: mesh.faces,
  verts: mesh.verts.map(([x, y, z]): Vec3 => {
    const dx = x - pivot[0];
    const dz = z - pivot[2];
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [pivot[0] + dx * c + dz * s, y, pivot[2] - dx * s + dz * c];
  }),
});

export const translated = (mesh: Mesh, delta: Vec3): Mesh => ({
  faces: mesh.faces,
  verts: mesh.verts.map(([x, y, z]): Vec3 => [x + delta[0], y + delta[1], z + delta[2]]),
});

export const pitchedPoint = ([x, y, z]: Vec3, angle: number, pivot: Vec3): Vec3 => {
  const dy = y - pivot[1];
  const dz = z - pivot[2];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x, pivot[1] + dy * c - dz * s, pivot[2] + dy * s + dz * c];
};

export interface MeshTexture {
  readonly worldPerTile: number;
  patternFor(spec: string, colour: string, lit: number): CanvasPattern | null;
}

export interface MeshDrawOpts {
  at: { x: number; y: number };
  facing: number;
  radius: number;
  height: number;
  lean: number;
  crouch: number;
  weapon: number;
  shield: number;
  gait: number;
  weaponPivot?: Vec3;
  shieldPivot?: Vec3;
  weaponArmPhase?: 'lead' | 'trail';
  powerArm?: number;
  hipPivot?: Vec3;
  capePivot?: Vec3;
  waistPivot?: Vec3;
  hiddenParts?: ReadonlySet<Face['part']>;
  armPivot?: Vec3;
  resolveFill: (spec: string) => string;
  texture?: MeshTexture;
}

const LIGHT: Vec3 = [-0.35, -0.5, 0.79];

const rotX = (p: Vec3, a: number): Vec3 => {
  if (a === 0) return p;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
};

const rotZ = (p: Vec3, a: number): Vec3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
};

const rotY = (p: Vec3, a: number): Vec3 => {
  if (a === 0) return p;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
};

const shadeHex = (hex: string, amount: number): string => {
  const v = parseInt(hex.slice(1), 16);
  const ch = (shift: number): number => {
    const c = (v >> shift) & 255;
    return Math.max(0, Math.min(255, Math.round(c * amount)));
  };
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
};

export const walkTerms = (
  gait: number,
): { legSwing: number; bob: number; roll: number } =>
  gait === 0
    ? { legSwing: 0, bob: 0, roll: 0 }
    : {
        legSwing: Math.sin(gait) * 0.42,
        bob: Math.abs(Math.cos(gait)) * 0.022,
        roll: Math.sin(gait) * 0.035,
      };

const HAND: Vec3 = [0.55, 0.1, 0.55];
const SHOULDER: Vec3 = [-0.55, 0, 0.62];
const HIP: Vec3 = [0, 0, 0.46];
const ARM: Vec3 = [0, 0, 1.2];
const CAPE: Vec3 = [0, -0.1, 1.25];

const ARM_SWING = 0.55;

const CAPE_LAG = 0.9;
const CAPE_SWING = 0.08;
const CAPE_LEAN_GAIN = 0.35;
const CAPE_MAX_SWING = 0.16;

export const drawMesh = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  mesh: Mesh,
  opts: MeshDrawOpts,
): void => {
  const { radius, height } = opts;

  const { legSwing, bob, roll } = walkTerms(opts.gait);
  const topZ = meshTopZ(mesh);

  const toWorld = (raw: Vec3, part: Face['part']): Vec3 => {
    let p = raw;
    const hand = opts.weaponPivot ?? HAND;
    const shoulder = opts.shieldPivot ?? SHOULDER;
    const hip = opts.hipPivot ?? HIP;
    const arm = opts.armPivot ?? ARM;
    if (part === 'weapon') {
      if (opts.weaponArmPhase !== undefined && legSwing !== 0) {
        const gaitSwing =
          (opts.weaponArmPhase === 'lead' ? legSwing : -legSwing) * ARM_SWING;
        p = [p[0] - arm[0], p[1] - arm[1], p[2] - arm[2]];
        p = rotX(p, gaitSwing);
        p = [p[0] + arm[0], p[1] + arm[1], p[2] + arm[2]];
      }
      if (opts.weapon !== 0) {
        p = [p[0] - hand[0], p[1] - hand[1], p[2] - hand[2]];
        p = rotX(p, opts.weapon);
        p = [p[0] + hand[0], p[1] + hand[1], p[2] + hand[2]];
      }
    } else if (part === 'shield' && opts.shield !== 0) {
      p = [p[0] - shoulder[0], p[1] - shoulder[1], p[2] - shoulder[2]];
      p = rotX(p, opts.shield);
      p = [p[0] + shoulder[0], p[1] + shoulder[1], p[2] + shoulder[2]];
    } else if ((part === 'legLead' || part === 'legTrail') && legSwing !== 0) {
      const swing = part === 'legLead' ? legSwing : -legSwing;
      p = [p[0] - hip[0], p[1] - hip[1], p[2] - hip[2]];
      p = rotX(p, swing);
      p = [p[0] + hip[0], p[1] + hip[1], p[2] + hip[2]];
    } else if (part === 'armLead' || part === 'armTrail') {
      if (legSwing !== 0) {
        const swing = (part === 'armLead' ? legSwing : -legSwing) * ARM_SWING;
        p = [p[0] - arm[0], p[1] - arm[1], p[2] - arm[2]];
        p = rotX(p, swing);
        p = [p[0] + arm[0], p[1] + arm[1], p[2] + arm[2]];
      }
      if (part === 'armLead' && opts.powerArm !== undefined && opts.powerArm !== 0) {
        p = [p[0] - arm[0], p[1] - arm[1], p[2] - arm[2]];
        p = rotX(p, opts.powerArm);
        p = [p[0] + arm[0], p[1] + arm[1], p[2] + arm[2]];
      }
    } else if (part === 'cape') {
      const pivot = opts.capePivot ?? CAPE;
      const trail = opts.gait === 0 ? 0 : Math.sin(opts.gait - CAPE_LAG) * CAPE_SWING;
      const kick = opts.lean * CAPE_LEAN_GAIN;
      const swing = Math.max(-CAPE_MAX_SWING, Math.min(CAPE_MAX_SWING, trail + kick));
      p = [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]];
      p = rotX(p, swing);
      p = [p[0] + pivot[0], p[1] + pivot[1], p[2] + pivot[2]];
    }
    if (opts.waistPivot !== undefined && part !== 'legLead' && part !== 'legTrail') {
      const wp = opts.waistPivot;
      p = [p[0] - wp[0], p[1] - wp[1], p[2] - wp[2]];
      p = rotX(p, opts.lean);
      p = [p[0] + wp[0], p[1] + wp[1], p[2] + wp[2]];
    } else if (opts.waistPivot === undefined) {
      p = rotX(p, opts.lean);
    }
    p = rotY(p, roll);
    p = [p[0] * radius, p[1] * radius, ((p[2] * opts.crouch) / topZ + bob) * height];
    p = rotZ(p, opts.facing - Math.PI / 2);
    return [p[0] + opts.at.x, p[1] + opts.at.y, p[2]];
  };

  const project = (p: Vec3): { x: number; y: number } => {
    const ground = worldToScreen(cam, { x: p[0], y: p[1] });
    return { x: ground.x, y: ground.y - p[2] * ISO_Z * cam.zoom };
  };

  const worldVerts = mesh.verts.map((v) => v);
  const drawable: Array<{
    depth: number;
    pts: Array<{ x: number; y: number }>;
    fill: string;
    pattern?: CanvasPattern;
    matrix?: [number, number, number, number, number, number];
  }> = [];

  const surfaceMatrix = (
    local: [Vec3, Vec3, Vec3],
    screen: Array<{ x: number; y: number }>,
    perTile: number,
  ): [number, number, number, number, number, number] | null => {
    const [l0, l1, l2] = local;
    const e1: Vec3 = [l1[0] - l0[0], l1[1] - l0[1], l1[2] - l0[2]];
    const e2: Vec3 = [l2[0] - l0[0], l2[1] - l0[1], l2[2] - l0[2]];
    const n: Vec3 = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const ax = Math.abs(n[0]);
    const ay = Math.abs(n[1]);
    const az = Math.abs(n[2]);
    const [i, j] = az >= ax && az >= ay ? [0, 1] : ax >= ay ? [1, 2] : [0, 2];

    const u1 = e1[i];
    const v1 = e1[j];
    const u2 = e2[i];
    const v2 = e2[j];
    const det = u1 * v2 - u2 * v1;
    if (Math.abs(det) < 1e-9) return null;

    const sx1 = screen[1].x - screen[0].x;
    const sy1 = screen[1].y - screen[0].y;
    const sx2 = screen[2].x - screen[0].x;
    const sy2 = screen[2].y - screen[0].y;

    const a = (sx1 * v2 - sx2 * v1) / det;
    const c = (u1 * sx2 - u2 * sx1) / det;
    const b = (sy1 * v2 - sy2 * v1) / det;
    const d = (u1 * sy2 - u2 * sy1) / det;

    const e = screen[0].x - (a * l0[i] + c * l0[j]);
    const f = screen[0].y - (b * l0[i] + d * l0[j]);
    return [a * perTile, b * perTile, c * perTile, d * perTile, e, f];
  };

  for (const face of mesh.faces) {
    if (opts.hiddenParts?.has(face.part)) continue;
    const world = face.v.map((i) => toWorld(worldVerts[i], face.part));
    const pts = world.map(project);

    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      area += a.x * b.y - b.x * a.y;
    }
    if (area <= 0) continue;

    const [p0, p1, p2] = world;
    const u: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const v: Vec3 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    const lambert = (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / len;
    const lit = 0.55 + 0.45 * Math.max(0, lambert);






    const depth =
      world.reduce((sum, p) => sum + p[0] + p[1] + p[2] * 0.35, 0) / world.length;

    const resolved = opts.resolveFill(face.fill);
    const entry: (typeof drawable)[number] = {
      depth,
      pts,
      fill: shadeHex(resolved, lit),
    };

    if (opts.texture !== undefined) {
      const pattern = opts.texture.patternFor(face.fill, resolved, lit);
      if (pattern !== null) {
        const matrix = surfaceMatrix(
          [worldVerts[face.v[0]], worldVerts[face.v[1]], worldVerts[face.v[2]]],
          pts,
          opts.texture.worldPerTile,
        );
        if (matrix !== null) {
          entry.pattern = pattern;
          entry.matrix = matrix;
        }
      }
    }

    drawable.push(entry);
  }

  drawable.sort((a, b) => a.depth - b.depth);

  const patternMatrix =
    opts.texture !== undefined && typeof DOMMatrix !== 'undefined' ? new DOMMatrix() : null;

  for (const face of drawable) {
    ctx.beginPath();
    ctx.moveTo(face.pts[0].x, face.pts[0].y);
    for (let i = 1; i < face.pts.length; i++) ctx.lineTo(face.pts[i].x, face.pts[i].y);
    ctx.closePath();
    if (face.pattern !== undefined && face.matrix !== undefined && patternMatrix !== null) {
      const [a, b, c, d, e, f] = face.matrix;
      patternMatrix.a = a;
      patternMatrix.b = b;
      patternMatrix.c = c;
      patternMatrix.d = d;
      patternMatrix.e = e;
      patternMatrix.f = f;
      face.pattern.setTransform(patternMatrix);
      ctx.fillStyle = face.pattern;
    } else {
      ctx.fillStyle = face.fill;
    }
    ctx.fill();
    ctx.strokeStyle = face.fill;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
};
