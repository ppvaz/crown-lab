
import type { Vec2 } from '../sim/types';
import type { Camera } from './iso';
import { withAlpha } from './palette';
import { groundEllipse, worldToScreen } from './iso';
import { drawDischargeGlow, noise } from './lightning';

const TAU = Math.PI * 2;


const groundRing = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  at: Vec2,
  radius: number,
  color: string,
  width: number,
  alpha: number,
): void => {
  const p = worldToScreen(cam, at);
  const { rx, ry } = groundEllipse(cam, radius);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rx, ry, 0, 0, TAU);
  ctx.stroke();
};

export const drawPushWave = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  at: Vec2,
  radius: number,
  color: string,
  t: number,
): void => {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const fade = 1 - t;
  for (let i = 0; i < 3; i++) {
    const trail = Math.max(0, radius - i * radius * 0.16);
    groundRing(ctx, cam, at, trail, color, (3 - i) * cam.zoom, fade * (i === 0 ? 0.9 : 0.3));
  }
  const p = worldToScreen(cam, at);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + noise(i, 1) * 0.4;
    const inner = radius * 0.72;
    const from = worldToScreen(cam, { x: at.x + Math.cos(a) * inner, y: at.y + Math.sin(a) * inner });
    const to = worldToScreen(cam, { x: at.x + Math.cos(a) * radius, y: at.y + Math.sin(a) * radius });
    ctx.globalAlpha = fade * 0.7;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * cam.zoom * fade;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  drawDischargeGlow(ctx, p, color, 20 * cam.zoom * fade, fade);
  ctx.restore();
};

export const drawPullHooks = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  from: Vec2,
  to: Vec2,
  color: string,
  t: number,
): void => {
  const fade = 1 - t;
  const origin = worldToScreen(cam, from);
  const head = worldToScreen(cam, to);
  const dx = head.x - origin.x;
  const dy = head.y - origin.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const slack = length * 0.26 * (1 - t);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';

  for (let i = 0; i < 3; i++) {
    const bow = slack * (i - 1) * 0.85;
    const mid = {
      x: origin.x + dx * 0.5 + nx * bow,
      y: origin.y + dy * 0.5 + ny * bow,
    };
    for (const [width, alpha] of [
      [5, 0.14],
      [2, 0.5],
    ] as const) {
      ctx.globalAlpha = alpha * fade;
      ctx.strokeStyle = color;
      ctx.lineWidth = width * cam.zoom;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.quadraticCurveTo(mid.x, mid.y, head.x, head.y);
      ctx.stroke();
    }

    for (let c = 0; c < 3; c++) {
      const at = ((c / 3 + t * 1.6) % 1);
      const u = 1 - at;
      const px = (1 - u) * (1 - u) * origin.x + 2 * (1 - u) * u * mid.x + u * u * head.x;
      const py = (1 - u) * (1 - u) * origin.y + 2 * (1 - u) * u * mid.y + u * u * head.y;
      const size = 5 * cam.zoom * fade * (0.5 + at * 0.5);
      const ang = Math.atan2(origin.y - py, origin.x - px);
      ctx.globalAlpha = 0.75 * fade * at;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8 * cam.zoom;
      ctx.beginPath();
      ctx.moveTo(px + Math.cos(ang + 2.5) * size, py + Math.sin(ang + 2.5) * size);
      ctx.lineTo(px, py);
      ctx.lineTo(px + Math.cos(ang - 2.5) * size, py + Math.sin(ang - 2.5) * size);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 0.6 * fade;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * cam.zoom;
  const grip = 16 * cam.zoom * (1 - t * 0.55);
  ctx.beginPath();
  ctx.ellipse(head.x, head.y, grip, grip * 0.45, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();

  drawDischargeGlow(ctx, origin, color, 14 * cam.zoom * fade, fade * 0.7);
};

export const drawBlinkTrail = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  from: Vec2,
  to: Vec2,
  color: string,
  t: number,
): void => {
  const fade = 1 - t;
  const a = worldToScreen(cam, from);
  const b = worldToScreen(cam, to);
  const lift = 20 * cam.zoom;
  const originAt = { x: a.x, y: a.y - lift };
  const arriveAt = { x: b.x, y: b.y - lift };
  const dx = arriveAt.x - originAt.x;
  const dy = arriveAt.y - originAt.y;
  const run = Math.hypot(dx, dy) || 1;
  const travel = 1 - (1 - Math.min(1, t * 1.7)) * (1 - Math.min(1, t * 1.7));

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';

  const collapse = Math.max(0, 1 - t * 2.4);
  if (collapse > 0) {
    ctx.globalAlpha = 0.8 * collapse;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5 * cam.zoom;
    const r = 30 * cam.zoom * collapse;
    ctx.beginPath();
    ctx.ellipse(originAt.x, originAt.y, r, r * 1.25, 0, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * TAU;
      ctx.globalAlpha = 0.5 * collapse;
      ctx.lineWidth = 1.4 * cam.zoom;
      ctx.beginPath();
      ctx.moveTo(originAt.x + Math.cos(ang) * r * 1.5, originAt.y + Math.sin(ang) * r * 1.75);
      ctx.lineTo(originAt.x + Math.cos(ang) * r * 0.5, originAt.y + Math.sin(ang) * r * 0.6);
      ctx.stroke();
    }
  }

  const shear = (dx / run) * 9 * cam.zoom;
  for (let i = 0; i <= 7; i++) {
    const k = i / 7;
    if (k > travel) break;
    const x = originAt.x + dx * k;
    const y = originAt.y + dy * k;
    const weight = (1 - k) * fade;
    ctx.globalAlpha = 0.42 * weight;
    ctx.fillStyle = color;
    ctx.save();
    ctx.translate(x, y);
    ctx.transform(1, 0, shear / (18 * cam.zoom), 1, 0, 0);
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.5 * cam.zoom * (1 - k * 0.55), 15 * cam.zoom * (1 - k * 0.4), 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  const arrive = Math.max(0, Math.min(1, (t - 0.25) / 0.75));
  if (arrive > 0) {
    const out = 34 * cam.zoom * arrive;
    ctx.globalAlpha = 0.9 * (1 - arrive);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3 * cam.zoom * (1 - arrive);
    ctx.beginPath();
    ctx.ellipse(arriveAt.x, arriveAt.y, out, out * 0.5, 0, 0, TAU);
    ctx.stroke();

    const heading = Math.atan2(dy, dx);
    for (let i = 0; i < 7; i++) {
      const spread = (noise(i, 2) - 0.5) * 1.5;
      const ang = heading + spread;
      const length = 26 * cam.zoom * arrive * (0.5 + noise(i, 4) * 0.8);
      ctx.globalAlpha = 0.7 * (1 - arrive);
      ctx.lineWidth = 2 * cam.zoom * (1 - arrive);
      ctx.beginPath();
      ctx.moveTo(arriveAt.x + Math.cos(ang) * out * 0.5, arriveAt.y + Math.sin(ang) * out * 0.25);
      ctx.lineTo(
        arriveAt.x + Math.cos(ang) * (out * 0.5 + length),
        arriveAt.y + Math.sin(ang) * (out * 0.25 + length * 0.5),
      );
      ctx.stroke();
    }
  }
  ctx.restore();

  drawDischargeGlow(ctx, originAt, color, 20 * cam.zoom * collapse, collapse);
  drawDischargeGlow(ctx, arriveAt, color, 24 * cam.zoom * fade, fade);
};

export const drawFrostShards = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  at: Vec2,
  liftPx: number,
  color: string,
  hold: number,
): void => {
  const ground = worldToScreen(cam, at);
  const centre = { x: ground.x, y: ground.y - liftPx * 0.5 };
  const grow = Math.min(1, (1 - hold) * 5);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = color;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + noise(i, 3) * 0.5;
    const r = liftPx * (0.35 + noise(i, 5) * 0.4) * grow;
    const tip = { x: centre.x + Math.cos(a) * r, y: centre.y + Math.sin(a) * r * 0.75 };
    const w = 3.2 * cam.zoom * grow;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(centre.x - Math.sin(a) * w, centre.y + Math.cos(a) * w);
    ctx.lineTo(centre.x + Math.sin(a) * w, centre.y - Math.cos(a) * w);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = withAlpha(color, 0.5);
  ctx.beginPath();
  ctx.ellipse(centre.x, centre.y, liftPx * 0.5 * grow, liftPx * 0.6 * grow, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
};

export const drawBurning = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  at: Vec2,
  liftPx: number,
  color: string,
  timeMs: number,
  seed: number,
): void => {
  const ground = worldToScreen(cam, at);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const phase = ((timeMs / 520 + noise(seed + i, 2)) % 1);
    const x = ground.x + (noise(seed + i, 7) - 0.5) * liftPx * 0.7;
    const y = ground.y - phase * liftPx * 1.5;
    const size = (1 - phase) * 6 * cam.zoom;
    ctx.globalAlpha = (1 - phase) * 0.8;
    ctx.fillStyle = i % 2 === 0 ? color : '#ffd9a0';
    ctx.beginPath();
    ctx.moveTo(x, y - size * 1.8);
    ctx.quadraticCurveTo(x + size, y - size * 0.6, x, y);
    ctx.quadraticCurveTo(x - size, y - size * 0.6, x, y - size * 1.8);
    ctx.closePath();
    ctx.fill();
  }
  drawDischargeGlow(ctx, { x: ground.x, y: ground.y - liftPx * 0.4 }, color, liftPx * 0.9, 0.6);
  ctx.restore();
};

export const drawTurncoatRing = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  at: Vec2,
  liftPx: number,
  color: string,
  timeMs: number,
  hold: number,
  half: 'far' | 'near',
): void => {
  const ground = worldToScreen(cam, at);
  const centre = { x: ground.x, y: ground.y - liftPx * 0.5 };
  const spin = timeMs / 380;
  const grip = Math.min(1, (1 - Math.max(0, Math.min(1, hold))) * 5);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let band = 0; band < 2; band += 1) {
    const count = band === 0 ? 8 : 6;
    const r = liftPx * (0.72 - grip * 0.16 - band * 0.18);
    const squash = band === 0 ? 0.42 : 0.34;
    const start = half === 'far' ? Math.PI : 0;
    const end = half === 'far' ? TAU : Math.PI;
    ctx.globalAlpha = (half === 'far' ? 0.18 : 0.48) * (band === 0 ? 1 : 0.72);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.8, (band === 0 ? 1.8 : 1.1) * cam.zoom);
    ctx.beginPath();
    ctx.ellipse(centre.x, centre.y, r, r * squash, 0, start, end);
    ctx.stroke();

    for (let i = 0; i < count; i++) {
      const a = spin * (band === 0 ? 1 : -0.72) + (i / count) * TAU;
      const x = centre.x + Math.cos(a) * r;
      const y = centre.y + Math.sin(a) * r * squash;
      const behind = Math.sin(a) < 0;
      if ((half === 'far') !== behind) continue;
      ctx.globalAlpha = (behind ? 0.25 : 0.82) * (band === 0 ? 1 : 0.7);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, (band === 0 ? 2.4 : 1.7) * cam.zoom, 0, TAU);
      ctx.fill();
    }
  }
  if (half === 'near') {
    const crown = { x: centre.x, y: centre.y - liftPx * 0.58 };
    const rx = liftPx * (0.23 - grip * 0.035);
    const ry = rx * 0.34;
    ctx.globalAlpha = 0.78;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, 1.6 * cam.zoom);
    ctx.beginPath();
    ctx.ellipse(crown.x, crown.y, rx, ry, 0, 0, TAU);
    ctx.stroke();
    for (let point = 0; point < 4; point += 1) {
      const a = (point / 4) * TAU;
      ctx.beginPath();
      ctx.moveTo(crown.x + Math.cos(a) * rx, crown.y + Math.sin(a) * ry);
      ctx.lineTo(
        crown.x + Math.cos(a) * rx * 1.28,
        crown.y + Math.sin(a) * ry * 1.9,
      );
      ctx.stroke();
    }
  }
  if (half === 'near') drawDischargeGlow(ctx, centre, color, liftPx * 0.8, 0.35);
  ctx.restore();
};
