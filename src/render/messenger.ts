
import type { Vec2 } from '../sim/types';
import type { Palette } from './palette';
import type { Camera } from './iso';
import { groundEllipse, worldToScreen } from './iso';
import { drawDischargeGlow } from './lightning';

const TAU = Math.PI * 2;

export const drawMessenger = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  timeMs: number,
  at: Vec2,
  radius: number,
  robeTop: string,
): void => {
  const p = worldToScreen(cam, at);
  const z = cam.zoom;
  const h = 62 * z;

  const { rx, ry } = groundEllipse(cam, radius);
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  const robe = ctx.createLinearGradient(p.x - 14 * z, 0, p.x + 14 * z, 0);
  robe.addColorStop(0, robeTop);
  robe.addColorStop(0.35, pal.hudDim);
  robe.addColorStop(1, pal.floor);
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(p.x - 13 * z, p.y);
  ctx.lineTo(p.x - 7 * z, p.y - h * 0.72);
  ctx.lineTo(p.x, p.y - h * 0.86);
  ctx.lineTo(p.x + 7 * z, p.y - h * 0.72);
  ctx.lineTo(p.x + 13 * z, p.y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = pal.floor;
  ctx.globalAlpha = 0.72;
  ctx.beginPath();
  ctx.moveTo(p.x + 1 * z, p.y - h * 0.7);
  ctx.lineTo(p.x + 10 * z, p.y);
  ctx.lineTo(p.x + 2 * z, p.y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = pal.hudDim;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.moveTo(p.x - 2 * z, p.y - h * 0.68);
  ctx.lineTo(p.x - 5 * z, p.y);
  ctx.lineTo(p.x - 11 * z, p.y);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = pal.garment;
  ctx.globalAlpha = 0.68;
  ctx.beginPath();
  ctx.moveTo(p.x - 2 * z, p.y - h * 0.74);
  ctx.lineTo(p.x + 3 * z, p.y - h * 0.74);
  ctx.lineTo(p.x + 5 * z, p.y);
  ctx.lineTo(p.x - 4 * z, p.y);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = pal.garment;
  ctx.beginPath();
  ctx.moveTo(p.x - 8 * z, p.y - h * 0.7);
  ctx.lineTo(p.x, p.y - h);
  ctx.lineTo(p.x + 8 * z, p.y - h * 0.7);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#0b0a10';
  ctx.beginPath();
  ctx.moveTo(p.x - 4.5 * z, p.y - h * 0.73);
  ctx.lineTo(p.x, p.y - h * 0.91);
  ctx.lineTo(p.x + 4.5 * z, p.y - h * 0.73);
  ctx.lineTo(p.x, p.y - h * 0.67);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = pal.floor;
  ctx.beginPath();
  ctx.moveTo(p.x - 6 * z, p.y - h * 0.69);
  ctx.lineTo(p.x - 11 * z, p.y - h * 0.46);
  ctx.lineTo(p.x - 8 * z, p.y - h * 0.36);
  ctx.lineTo(p.x - 4 * z, p.y - h * 0.58);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = pal.hudDim;
  ctx.beginPath();
  ctx.moveTo(p.x + 6 * z, p.y - h * 0.69);
  ctx.lineTo(p.x + 13 * z, p.y - h * 0.57);
  ctx.lineTo(p.x + 14 * z, p.y - h * 0.43);
  ctx.lineTo(p.x + 9 * z, p.y - h * 0.48);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = pal.hudText;
  ctx.beginPath();
  ctx.ellipse(p.x + 13.5 * z, p.y - h * 0.47, 2.2 * z, 2.8 * z, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = pal.wall;
  ctx.lineWidth = Math.max(1.5, 2.5 * z);
  ctx.beginPath();
  ctx.moveTo(p.x + 15 * z, p.y);
  ctx.lineTo(p.x + 12 * z, p.y - h * 1.05);
  ctx.stroke();
  ctx.restore();

  const lamp = { x: p.x + 12 * z, y: p.y - h * 1.05 };
  const flicker = 0.82 + 0.18 * Math.sin(timeMs / 330);
  drawDischargeGlow(ctx, lamp, pal.playerAccent, 13 * z * flicker, 0.9);
  ctx.save();
  ctx.translate(lamp.x, lamp.y);
  ctx.strokeStyle = pal.hudText;
  ctx.fillStyle = pal.garment;
  ctx.lineWidth = Math.max(1, 1.4 * z);
  ctx.beginPath();
  ctx.moveTo(0, -6 * z);
  ctx.lineTo(5 * z, 0);
  ctx.lineTo(0, 7 * z);
  ctx.lineTo(-5 * z, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = pal.playerAccent;
  ctx.beginPath();
  ctx.moveTo(0, -3 * z);
  ctx.lineTo(2.5 * z, 0);
  ctx.lineTo(0, 3.5 * z);
  ctx.lineTo(-2.5 * z, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

