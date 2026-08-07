
import type { Vec2 } from '../sim/types';
import type { Camera } from './iso';
import { worldToScreen } from './iso';

export const noise = (a: number, b: number): number => {
  const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return n - Math.floor(n);
};

const mix = (from: string, to: string, t: number): string => {
  const a = Number.parseInt(from.slice(1), 16);
  const b = Number.parseInt(to.slice(1), 16);
  const ch = (shift: number): number => {
    const x = (a >> shift) & 255;
    const y = (b >> shift) & 255;
    return Math.round(x + (y - x) * t);
  };
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
};

const CORE = '#ffffff';

export const boltPath = (
  from: Vec2,
  to: Vec2,
  seed: number,
  segments: number,
  amplitude: number,
): Vec2[] => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;

  const points: Vec2[] = [{ ...from }];
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const envelope = Math.sin(t * Math.PI);
    const offset = (noise(seed + i * 3.7, i) - 0.5) * 2 * amplitude * envelope;
    points.push({
      x: from.x + dx * t + nx * offset,
      y: from.y + dy * t + ny * offset,
    });
  }
  points.push({ ...to });
  return points;
};

export const strokeBolt = (
  ctx: CanvasRenderingContext2D,
  points: readonly Vec2[],
  color: string,
  width: number,
  alpha = 1,
): void => {
  if (points.length < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const [scale, stroke, a] of [
    [4.5, mix(color, '#000000', 0.35), 0.18 * alpha],
    [1.9, color, 0.5 * alpha],
    [0.7, mix(color, CORE, 0.75), 0.95 * alpha],
  ] as const) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(0.6, width * scale);
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }
  ctx.restore();
};

export const drawForkedBolt = (
  ctx: CanvasRenderingContext2D,
  from: Vec2,
  to: Vec2,
  color: string,
  seed: number,
  width: number,
  alpha = 1,
): void => {
  const SEGMENTS = 9;
  const spread = Math.hypot(to.x - from.x, to.y - from.y) * 0.13;
  const points = boltPath(from, to, seed, SEGMENTS, spread);

  for (let i = 0; i < points.length - 1; i++) {
    const t = i / (points.length - 1);
    strokeBolt(ctx, [points[i], points[i + 1]], color, width * (1 - t * 0.72), alpha);
  }

  for (let branch = 0; branch < 2; branch++) {
    const at = 2 + Math.floor(noise(seed + branch * 11, 3) * (points.length - 4));
    const root = points[at];
    const run = 0.3 + noise(seed + branch, 5) * 0.35;
    const angle = (noise(seed + branch, 7) - 0.5) * 1.6;
    const dx = to.x - root.x;
    const dy = to.y - root.y;
    const tip = {
      x: root.x + (dx * Math.cos(angle) - dy * Math.sin(angle)) * run,
      y: root.y + (dx * Math.sin(angle) + dy * Math.cos(angle)) * run,
    };
    const twig = boltPath(root, tip, seed + branch * 31, 4, spread * 0.5);
    strokeBolt(ctx, twig, color, width * 0.45, alpha * 0.6);
  }
};

export const drawDischargeGlow = (
  ctx: CanvasRenderingContext2D,
  at: Vec2,
  color: string,
  radiusPx: number,
  alpha = 1,
): void => {
  if (radiusPx <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const gradient = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, radiusPx);
  gradient.addColorStop(0, mix(color, CORE, 0.7));
  gradient.addColorStop(0.35, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.55 * alpha;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(at.x, at.y, radiusPx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

export const drawLightningField = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  origin: Vec2,
  facing: number,
  range: number,
  arcDeg: number,
  color: string,
  timeMs: number,
  intensity = 1,
  targets: readonly { at: Vec2; liftPx: number }[] = [],
  liftPx = 0,
): void => {
  const half = (arcDeg * Math.PI) / 360;
  const ground = worldToScreen(cam, origin);
  const o = { x: ground.x, y: ground.y - liftPx };
  const frame = Math.floor(timeMs / 60);

  const pulse = 0.85 + 0.15 * Math.sin(timeMs / 90);
  drawDischargeGlow(ctx, o, color, 22 * cam.zoom * intensity * pulse, intensity);

  if (targets.length > 0) {
    for (let i = 0; i < targets.length; i++) {
      const ground = worldToScreen(cam, targets[i].at);
      const tip = { x: ground.x, y: ground.y - targets[i].liftPx };
      for (let strand = 0; strand < 2; strand++) {
        drawForkedBolt(
          ctx,
          o,
          tip,
          color,
          i * 23.7 + strand * 5.1 + frame * 3.3,
          (strand === 0 ? 2 : 1.2) * cam.zoom,
          intensity * (strand === 0 ? 1 : 0.7),
        );
      }
      drawDischargeGlow(ctx, tip, color, 15 * cam.zoom * intensity, intensity * 0.9);
      drawShockedBody(ctx, tip, targets[i].liftPx, color, timeMs, i, intensity);
    }
    return;
  }

  const bolts = Math.max(3, Math.round(5 * intensity));
  for (let i = 0; i < bolts; i++) {
    const aim = facing - half + ((i + 0.5) / bolts) * half * 2;
    const reach = range * (0.72 + noise(i, frame) * 0.28);
    const tip = worldToScreen(cam, {
      x: origin.x + Math.cos(aim) * reach,
      y: origin.y + Math.sin(aim) * reach,
    });
    drawForkedBolt(ctx, o, tip, color, i * 17.3 + frame * 2.7, 1.6 * cam.zoom, intensity);
  }
};

export const drawShockedBody = (
  ctx: CanvasRenderingContext2D,
  centre: Vec2,
  liftPx: number,
  color: string,
  timeMs: number,
  seed: number,
  intensity = 1,
): void => {
  const half = Math.max(6, liftPx * 0.9);
  const frame = Math.floor(timeMs / 34);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.5 * intensity;
  const halo = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, half * 1.5);
  halo.addColorStop(0, color);
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(centre.x, centre.y, half * 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  for (let i = 0; i < 3; i++) {
    const a = noise(seed * 5.3 + i, frame) * Math.PI * 2;
    const b = noise(seed * 5.3 + i, frame + 91) * Math.PI * 2;
    const r = half * (0.45 + noise(i, frame + seed) * 0.5);
    const from = { x: centre.x + Math.cos(a) * r * 0.7, y: centre.y + Math.sin(a) * r };
    const to = { x: centre.x + Math.cos(b) * r * 0.7, y: centre.y + Math.sin(b) * r };
    strokeBolt(ctx, boltPath(from, to, seed + i * 13 + frame, 4, r * 0.35), color, 1.1, intensity);
  }
};
