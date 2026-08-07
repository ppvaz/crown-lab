import type { Palette } from '../palette';
import { shade } from '../palette';
import type { ConceptKitSpec } from '../../lab/concept-kit';

export type Point = readonly [number, number];

export interface PropView {
  p: { x: number; y: number };
  z: number;
  line: number;
  accent: string;
}

export const shape = (
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  fill: string | CanvasGradient,
  stroke: string,
  width: number,
): void => {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index][0], points[index][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
};

const SHADE_CACHE = new Map<string, string>();

export const shadeHex = (hex: string, amount: number): string => {
  const key = `${hex}:${amount}`;
  const cached = SHADE_CACHE.get(key);
  if (cached !== undefined) return cached;
  const shaded = shade(hex, amount);
  SHADE_CACHE.set(key, shaded);
  return shaded;
};

export const block = (
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number },
  z: number,
  width: number,
  height: number,
  depth: number,
  fill: string,
  stroke: string,
  line: number,
): void => {
  const half = width / 2;
  shape(ctx, [
    [p.x - half * z, p.y - height * z],
    [p.x + half * z, p.y - height * z],
    [p.x + half * z, p.y],
    [p.x - half * z, p.y],
  ], fill, stroke, line);
  shape(ctx, [
    [p.x + half * z, p.y - height * z],
    [p.x + (half + depth) * z, p.y - (height + depth * 0.45) * z],
    [p.x + (half + depth) * z, p.y - depth * 0.45 * z],
    [p.x + half * z, p.y],
  ], shadeHex(fill, 0.63), stroke, line);
  shape(ctx, [
    [p.x - half * z, p.y - height * z],
    [p.x + (-half + depth) * z, p.y - (height + depth * 0.45) * z],
    [p.x + (half + depth) * z, p.y - (height + depth * 0.45) * z],
    [p.x + half * z, p.y - height * z],
  ], shadeHex(fill, 1.22), stroke, line);
};

export const plinth = (
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number },
  z: number,
  fill: string,
  stroke: string,
  line: number,
  width = 34,
): void => {
  block(ctx, p, z, width, 7, 5, fill, stroke, line);
  block(ctx, { x: p.x, y: p.y - 7 * z }, z, width - 8, 9, 4, shadeHex(fill, 0.9), stroke, line);
};

export const clothGradient = (
  ctx: CanvasRenderingContext2D,
  x: number,
  width: number,
  base: string,
): CanvasGradient => {
  const gradient = ctx.createLinearGradient(x - width / 2, 0, x + width / 2, 0);
  gradient.addColorStop(0, shadeHex(base, 0.48));
  gradient.addColorStop(0.28, shadeHex(base, 1.12));
  gradient.addColorStop(0.52, shadeHex(base, 0.62));
  gradient.addColorStop(0.76, shadeHex(base, 1.03));
  gradient.addColorStop(1, shadeHex(base, 0.42));
  return gradient;
};

export const accentFor = (pal: Palette, accent: ConceptKitSpec['accent']): string => {
  if (accent === 'red') return '#7b3036';
  if (accent === 'violet') return '#75448d';
  if (accent === 'cold') return '#6e9ab5';
  return pal.playerAccent;
};
