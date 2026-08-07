
import type { BodyClip, BodySkeleton, BodyTrack, MeshBody } from './mesh-body-lab';
import { toRuntimeAxes } from './mesh-body-lab';

export interface BodyPose {
  t: Float32Array;
  r: Float32Array;
  s: Float32Array;
}

export const createPose = (skeleton: BodySkeleton): BodyPose => ({
  t: Float32Array.from(skeleton.restT),
  r: Float32Array.from(skeleton.restR),
  s: Float32Array.from(skeleton.restS),
});

export const resetPose = (pose: BodyPose, skeleton: BodySkeleton): void => {
  pose.t.set(skeleton.restT);
  pose.r.set(skeleton.restR);
  pose.s.set(skeleton.restS);
};

const findKey = (time: Float32Array, at: number): { key: number; alpha: number } => {
  const last = time.length - 1;
  if (last <= 0 || at <= time[0]) return { key: 0, alpha: 0 };
  if (at >= time[last]) return { key: last - 1, alpha: 1 };
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (time[mid] <= at) lo = mid;
    else hi = mid;
  }
  const span = time[lo + 1] - time[lo];
  return { key: lo, alpha: span > 1e-9 ? (at - time[lo]) / span : 0 };
};

const blendQuat = (
  out: Float32Array, at: number,
  a: ArrayLike<number>, ai: number,
  b: ArrayLike<number>, bi: number,
  alpha: number,
): void => {
  const dot = a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2] + a[ai + 3] * b[bi + 3];
  const sign = dot < 0 ? -1 : 1;
  const inverse = 1 - alpha;
  let x = inverse * a[ai] + alpha * sign * b[bi];
  let y = inverse * a[ai + 1] + alpha * sign * b[bi + 1];
  let z = inverse * a[ai + 2] + alpha * sign * b[bi + 2];
  let w = inverse * a[ai + 3] + alpha * sign * b[bi + 3];
  const length = Math.hypot(x, y, z, w);
  if (length < 1e-9) {
    x = 0; y = 0; z = 0; w = 1;
  } else {
    x /= length; y /= length; z /= length; w /= length;
  }
  out[at] = x; out[at + 1] = y; out[at + 2] = z; out[at + 3] = w;
};

const applyTrack = (pose: BodyPose, skeleton: BodySkeleton, track: BodyTrack, at: number): void => {
  const node = skeleton.jointNode[track.joint];
  const { key, alpha } = findKey(track.time, at);
  const next = track.step ? key : key + 1;
  const blend = track.step ? 0 : alpha;
  const a = key * track.stride;
  const b = Math.min(next, track.time.length - 1) * track.stride;
  if (track.path === 'rotation') {
    blendQuat(pose.r, node * 4, track.value, a, track.value, b, blend);
    return;
  }
  const target = track.path === 'translation' ? pose.t : pose.s;
  for (let i = 0; i < 3; i++) {
    target[node * 3 + i] = track.value[a + i] * (1 - blend) + track.value[b + i] * blend;
  }
};

export const samplePose = (
  pose: BodyPose,
  skeleton: BodySkeleton,
  clip: BodyClip,
  seconds: number,
): void => {
  resetPose(pose, skeleton);
  for (const track of clip.tracks) applyTrack(pose, skeleton, track, seconds);
};

export const blendPoses = (from: BodyPose, to: BodyPose, alpha: number): void => {
  const t = Math.max(0, Math.min(1, alpha));
  if (t <= 0) return;
  if (t >= 1) {
    from.t.set(to.t); from.r.set(to.r); from.s.set(to.s);
    return;
  }
  for (let i = 0; i < from.t.length; i++) from.t[i] += (to.t[i] - from.t[i]) * t;
  for (let i = 0; i < from.s.length; i++) from.s[i] += (to.s[i] - from.s[i]) * t;
  for (let i = 0; i < from.r.length; i += 4) blendQuat(from.r, i, from.r, i, to.r, i, t);
};

const composeLocal = (out: Float32Array, at: number, pose: BodyPose, node: number): void => {
  const x = pose.r[node * 4];
  const y = pose.r[node * 4 + 1];
  const z = pose.r[node * 4 + 2];
  const w = pose.r[node * 4 + 3];
  const sx = pose.s[node * 3];
  const sy = pose.s[node * 3 + 1];
  const sz = pose.s[node * 3 + 2];

  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;

  out[at] = (1 - (yy + zz)) * sx;
  out[at + 1] = (xy + wz) * sx;
  out[at + 2] = (xz - wy) * sx;
  out[at + 3] = 0;
  out[at + 4] = (xy - wz) * sy;
  out[at + 5] = (1 - (xx + zz)) * sy;
  out[at + 6] = (yz + wx) * sy;
  out[at + 7] = 0;
  out[at + 8] = (xz + wy) * sz;
  out[at + 9] = (yz - wx) * sz;
  out[at + 10] = (1 - (xx + yy)) * sz;
  out[at + 11] = 0;
  out[at + 12] = pose.t[node * 3];
  out[at + 13] = pose.t[node * 3 + 1];
  out[at + 14] = pose.t[node * 3 + 2];
  out[at + 15] = 1;
};

const multiply = (
  out: Float32Array, at: number,
  a: ArrayLike<number>, ai: number,
  b: ArrayLike<number>, bi: number,
): void => {
  for (let col = 0; col < 4; col++) {
    const b0 = b[bi + col * 4];
    const b1 = b[bi + col * 4 + 1];
    const b2 = b[bi + col * 4 + 2];
    const b3 = b[bi + col * 4 + 3];
    for (let row = 0; row < 4; row++) {
      out[at + col * 4 + row] =
        a[ai + row] * b0 + a[ai + 4 + row] * b1 + a[ai + 8 + row] * b2 + a[ai + 12 + row] * b3;
    }
  }
};

export interface PoseScratch {
  global: Float32Array;
}

export const createScratch = (skeleton: BodySkeleton): PoseScratch => ({
  global: new Float32Array(skeleton.parent.length * 16),
});

export const jointMatrices = (
  out: Float32Array,
  skeleton: BodySkeleton,
  pose: BodyPose,
  scratch: PoseScratch,
): void => {
  const local = new Float32Array(16);
  for (let i = 0; i < skeleton.order.length; i++) {
    const node = skeleton.order[i];
    composeLocal(local, 0, pose, node);
    const parent = skeleton.parent[node];
    if (parent === -1) scratch.global.set(local, node * 16);
    else multiply(scratch.global, node * 16, scratch.global, parent * 16, local, 0);
  }
  for (let joint = 0; joint < skeleton.jointNode.length; joint++) {
    multiply(
      out, joint * 16,
      scratch.global, skeleton.jointNode[joint] * 16,
      skeleton.inverseBind, joint * 16,
    );
  }
};


const bindGlobals = (mesh: MeshBody): Float32Array => {
  const pose = createPose(mesh.skeleton);
  const scratch = createScratch(mesh.skeleton);
  jointMatrices(new Float32Array(mesh.skeleton.jointNode.length * 16), mesh.skeleton, pose, scratch);
  return scratch.global;
};

export interface ForwardMeasurement {
  facing: number;
  gltf: readonly [number, number, number];
  evidence: string;
  dissent: readonly string[];
}

export const measureForwardFacing = (mesh: MeshBody): ForwardMeasurement => {
  const g = bindGlobals(mesh);
  const { names, jointNode, parent } = mesh.skeleton;
  const at = (node: number) => ({ x: g[node * 16 + 12], y: g[node * 16 + 13], z: g[node * 16 + 14] });
  const lower = (node: number) => names[node].toLowerCase();

  const votes: { from: string; dir: [number, number, number] }[] = [];
  const push = (from: string, a: number, b: number): void => {
    const p = at(a);
    const q = at(b);
    const dir: [number, number, number] = [q.x - p.x, 0, q.z - p.z];
    if (Math.hypot(dir[0], dir[2]) > 1e-4) votes.push({ from, dir });
  };

  for (const node of jointNode) {
    const name = lower(node);
    const up = parent[node];
    if (up === -1) continue;
    if (name.includes('front') || name.includes('nose') || name.includes('face')) {
      push(`face marker ${names[node]}`, up, node);
    } else if (name.includes('toe')) {
      push(`foot ${names[up]} to ${names[node]}`, up, node);
    }
  }

  const heights = Array.from({ length: mesh.vertexCount }, (_, v) => mesh.pos[v * 3 + 1]);
  const top = Math.max(...heights);
  let ahead = 0;
  let behind = 0;
  for (let v = 0; v < mesh.vertexCount; v++) {
    const y = mesh.pos[v * 3 + 1];
    if (y < top * 0.5 || y > top * 0.8) continue;
    if (mesh.pos[v * 3 + 2] > 0) ahead++;
    else behind++;
  }
  if (ahead + behind > 0 && Math.abs(ahead - behind) > (ahead + behind) * 0.05) {
    votes.push({ from: 'torso mass (a cape hangs behind)', dir: [0, 0, ahead > behind ? -1 : 1] });
  }

  if (votes.length === 0) {
    const runtime = toRuntimeAxes(0, 0, -1);
    return {
      facing: Math.atan2(runtime.y, runtime.x),
      gltf: [0, 0, -1],
      evidence: 'no landmark found — glTF convention assumed, LOOK AT THIS BODY',
      dissent: [],
    };
  }

  const sum: [number, number] = [0, 0];
  for (const v of votes) {
    const len = Math.hypot(v.dir[0], v.dir[2]) || 1;
    sum[0] += v.dir[0] / len;
    sum[1] += v.dir[2] / len;
  }
  const face = votes.find((v) => v.from.startsWith('face marker'));
  const winner = face ?? { from: `${votes.length} landmarks`, dir: [sum[0], 0, sum[1]] as [number, number, number] };
  const wl = Math.hypot(winner.dir[0], winner.dir[2]) || 1;
  const gltf: [number, number, number] = [winner.dir[0] / wl, 0, winner.dir[2] / wl];

  const dissent = votes
    .filter((v) => {
      const len = Math.hypot(v.dir[0], v.dir[2]) || 1;
      return (v.dir[0] / len) * gltf[0] + (v.dir[2] / len) * gltf[2] < 0;
    })
    .map((v) => v.from);

  const runtime = toRuntimeAxes(gltf[0], gltf[1], gltf[2]);
  return {
    facing: Math.atan2(runtime.y, runtime.x),
    gltf,
    evidence: `${winner.from} (${votes.length - dissent.length}/${votes.length} landmarks agree)`,
    dissent,
  };
};

export interface SocketPose {
  at: { x: number; y: number };
  elevation: number;
  facing: number;
}

export const socketPose = (
  mesh: MeshBody,
  scratch: PoseScratch,
  jointName: string,
  model: Float32Array,
): SocketPose | null => {
  const node = mesh.skeleton.names.indexOf(jointName);
  if (node === -1 || mesh.skeleton.parent.length <= node) return null;

  const g = scratch.global;
  const base = node * 16;
  const through = (x: number, y: number, z: number) => ({
    x: model[0] * x + model[4] * y + model[8] * z + model[12],
    y: model[1] * x + model[5] * y + model[9] * z + model[13],
    z: model[2] * x + model[6] * y + model[10] * z + model[14],
  });
  const origin = through(g[base + 12], g[base + 13], g[base + 14]);
  const tipLocal = {
    x: g[base + 12] + g[base + 4],
    y: g[base + 13] + g[base + 5],
    z: g[base + 14] + g[base + 6],
  };
  const tip = through(tipLocal.x, tipLocal.y, tipLocal.z);
  const dx = tip.x - origin.x;
  const dy = tip.y - origin.y;

  return {
    at: { x: origin.x, y: origin.y },
    elevation: origin.z,
    facing: Math.hypot(dx, dy) < 1e-6 ? 0 : Math.atan2(dy, dx),
  };
};

export const missingSockets = (
  mesh: MeshBody,
  sockets: Readonly<Record<string, string | undefined>> | undefined,
): readonly string[] =>
  Object.entries(sockets ?? {})
    .filter(([, joint]) => joint !== undefined && !mesh.skeleton.names.includes(joint))
    .map(([slot, joint]) => `${slot} -> ${joint ?? ''}`);
