
import type { Radians, Vec2 } from './types';
import { atan2, cos, sin } from './trig';

const TAU = Math.PI * 2;

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });

export const scale = (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s });

export const len = (v: Vec2): number => Math.sqrt(v.x * v.x + v.y * v.y);

export const lenSq = (v: Vec2): number => v.x * v.x + v.y * v.y;

export const norm = (v: Vec2): Vec2 => {
  const l2 = v.x * v.x + v.y * v.y;
  if (l2 === 0) return { x: 0, y: 0 };
  const l = Math.sqrt(l2);
  return { x: v.x / l, y: v.y / l };
};

export const dist = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

export const distSq = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

export const angleOf = (v: Vec2): Radians => atan2(v.y, v.x);

export const fromAngle = (a: Radians, length = 1): Vec2 => ({
  x: cos(a) * length,
  y: sin(a) * length,
});

export const rotate = (v: Vec2, a: Radians): Vec2 => {
  const c = cos(a);
  const s = sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};

export const clamp = (v: Vec2, min: Vec2, max: Vec2): Vec2 => ({
  x: v.x < min.x ? min.x : v.x > max.x ? max.x : v.x,
  y: v.y < min.y ? min.y : v.y > max.y ? max.y : v.y,
});

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export const angleDelta = (a: Radians, b: Radians): Radians => {
  const d = (b - a) % TAU;
  if (d <= -Math.PI) return d + TAU;
  if (d > Math.PI) return d - TAU;
  return d;
};
