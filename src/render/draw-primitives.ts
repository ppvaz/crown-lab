
import type { EnemyAttackDef, World } from '../sim/types';
import { TICK_MS } from '../sim/types';
import type { Camera } from './iso';
import { groundEllipse, worldToScreen, worldToScreenAtElevation } from './iso';
import { withAlpha } from './palette';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const sceneTimeMs = (world: World): number => world.tick * TICK_MS;

const WALK_STATES = new Set([
  'move',
  'approach',
  'reposition',
  'sequence_reposition',
  'edge_reposition',
  'step',
]);
const GAIT_CYCLE_MS = 620;
export const gaitPhaseFor = (world: World, state: string): number =>
  WALK_STATES.has(state)
    ? ((world.tick * TICK_MS) / GAIT_CYCLE_MS) * Math.PI * 2
    : 0;

export const screenPolygon = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  points: Array<{ x: number; y: number }>,
  elevation: number,
): void => {
  if (points.length === 0) return;
  const first = worldToScreenAtElevation(cam, points[0], elevation);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    const point = worldToScreenAtElevation(cam, points[i], elevation);
    ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
};

export const clipAtY = (
  polygon: readonly { x: number; y: number }[],
  y: number,
  keepBelow: boolean,
): Array<{ x: number; y: number }> => {
  const output: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const previous = polygon[(i + polygon.length - 1) % polygon.length];
    const currentInside = keepBelow ? current.y <= y : current.y >= y;
    const previousInside = keepBelow ? previous.y <= y : previous.y >= y;
    if (currentInside !== previousInside) {
      const t = (y - previous.y) / (current.y - previous.y);
      output.push({
        x: previous.x + (current.x - previous.x) * t,
        y,
      });
    }
    if (currentInside) output.push({ ...current });
  }
  return output;
};

export const spanAtY = (
  polygon: readonly { x: number; y: number }[],
  y: number,
): [number, number] | null => {
  const intersections: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (Math.abs(a.y - b.y) <= 1e-9) {
      if (Math.abs(y - a.y) <= 1e-9) intersections.push(a.x, b.x);
      continue;
    }
    const t = (y - a.y) / (b.y - a.y);
    if (t >= -1e-9 && t <= 1 + 1e-9) intersections.push(a.x + (b.x - a.x) * t);
  }
  if (intersections.length < 2) return null;
  return [Math.min(...intersections), Math.max(...intersections)];
};

export const telegraphProgress = (
  def: EnemyAttackDef,
  elapsedMs: number,
  jitterMs = 0,
): number => {
  const total = Math.max(1, def.telegraphMs + jitterMs);
  const elapsed = Math.max(0, Math.min(total, elapsedMs));
  if (def.feint === undefined) return elapsed / total;

  const at = Math.max(1, Math.min(total, def.feint.atMs));
  const resetEnd = Math.min(total, at + Math.max(1, def.feint.resetMs));
  if (elapsed <= at) return 0.94 * (elapsed / at);
  if (elapsed <= resetEnd) {
    const t = (elapsed - at) / Math.max(1, resetEnd - at);
    return 0.94 + (0.2 - 0.94) * t;
  }
  const t = (elapsed - resetEnd) / Math.max(1, total - resetEnd);
  return 0.2 + 0.8 * t;
};

export const mixHex = (a: string, b: string, t: number): string => {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const k = Math.max(0, Math.min(1, t));
  const ch = (shift: number): number => {
    const ca = (pa >> shift) & 255;
    return Math.round(ca + (((pb >> shift) & 255) - ca) * k);
  };
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
};


export const groundWedge = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  origin: { x: number; y: number },
  facing: number,
  range: number,
  arcDeg: number,
): void => {
  const half = (arcDeg * DEG) / 2;
  const steps = Math.max(6, Math.round(arcDeg / 6));
  ctx.beginPath();
  const o = worldToScreen(cam, origin);
  ctx.moveTo(o.x, o.y);
  for (let i = 0; i <= steps; i++) {
    const a = facing - half + (i / steps) * half * 2;
    const p = worldToScreen(cam, {
      x: origin.x + Math.cos(a) * range,
      y: origin.y + Math.sin(a) * range,
    });
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
};

export const drawSlashArc = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  fromElevation: number,
  toElevation: number,
): void => {
  const a = worldToScreenAtElevation(cam, from, fromElevation);
  const b = worldToScreenAtElevation(cam, to, toElevation);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = dy / len;
  const py = -dx / len;
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const bowFar = 0.34 * len;
  const bowNear = 0.2 * len;

  ctx.save();
  ctx.lineJoin = 'round';
  for (const [inflate, alpha, fill] of [
    [3 * cam.zoom, 0.55, '#0b0b12'],
    [0, 0.95, color],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(midX + px * (bowFar + inflate), midY + py * (bowFar + inflate), b.x, b.y);
    ctx.quadraticCurveTo(midX + px * (bowNear - inflate), midY + py * (bowNear - inflate), a.x, a.y);
    ctx.closePath();
    ctx.fillStyle = withAlpha(fill, alpha);
    ctx.fill();
  }
  ctx.restore();
};

export const footprint = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  at: { x: number; y: number },
  r: number,
): void => {
  const p = worldToScreen(cam, at);
  const { rx, ry } = groundEllipse(cam, r);
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rx, ry, 0, 0, TAU);
};
