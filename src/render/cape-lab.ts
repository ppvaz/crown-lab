
import type { BodyPose } from './mesh-pose-lab';
import type { BodySkeleton } from './mesh-body-lab';

const CAPE_PREFIX = 'Cape';

export const CAPE_SWAY = Object.freeze({
  off: 0,
  subtle: 0.55,
  full: 1,
});

export type CapeSway = keyof typeof CAPE_SWAY;

export const CAPE_SWAY_ORDER: readonly CapeSway[] = ['off', 'subtle', 'full'];

const TRAIL_DEGREES = 26;

const LAG_CURVE = 2;

const FULL_TRAIL_SPEED = 3.2;

const IDLE_DEGREES = 1.8;
const IDLE_PERIOD_MS = 3400;

export interface CapeChain {
  nodes: number[];
}

export const findCapeChain = (skeleton: BodySkeleton): CapeChain => {
  const nodes = skeleton.names
    .map((name, node) => ({ name, node }))
    .filter((entry) => entry.name.startsWith(CAPE_PREFIX))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => entry.node);
  return { nodes };
};

const rotateNode = (
  pose: BodyPose, node: number,
  ax: number, ay: number, az: number, radians: number,
): void => {
  const half = radians / 2;
  const s = Math.sin(half);
  const bx = ax * s;
  const by = ay * s;
  const bz = az * s;
  const bw = Math.cos(half);

  const i = node * 4;
  const x = pose.r[i];
  const y = pose.r[i + 1];
  const z = pose.r[i + 2];
  const w = pose.r[i + 3];

  pose.r[i] = w * bx + x * bw + y * bz - z * by;
  pose.r[i + 1] = w * by - x * bz + y * bw + z * bx;
  pose.r[i + 2] = w * bz + x * by - y * bx + z * bw;
  pose.r[i + 3] = w * bw - x * bx - y * by - z * bz;
};

export const driveCape = (
  pose: BodyPose,
  chain: CapeChain,
  tick: number,
  vel: { x: number; y: number } | null,
  facing: number,
  sway: number,
): void => {
  if (chain.nodes.length === 0 || sway <= 0) return;

  const speed = vel === null ? 0 : Math.hypot(vel.x, vel.y);
  const travel = Math.min(1, speed / FULL_TRAIL_SPEED);

  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  const ahead = speed < 1e-6 || vel === null ? 0 : (cos * vel.x + sin * vel.y) / speed;
  const across = speed < 1e-6 || vel === null ? 0 : (-sin * vel.x + cos * vel.y) / speed;

  const sceneMs = tick * (1000 / 60);
  const breath = Math.sin((sceneMs / IDLE_PERIOD_MS) * Math.PI * 2);

  const links = chain.nodes.length;
  for (let index = 0; index < links; index++) {
    const depth = ((index + 1) / links) ** LAG_CURVE;
    const trail = (TRAIL_DEGREES * Math.PI) / 180 * travel * depth * sway;
    const idle = (IDLE_DEGREES * Math.PI) / 180 * depth * sway * breath * (1 - travel);

    rotateNode(pose, chain.nodes[index], 0, 1, 0, -trail * ahead + idle);
    if (Math.abs(across) > 1e-6) rotateNode(pose, chain.nodes[index], 1, 0, 0, trail * across);
  }
};
