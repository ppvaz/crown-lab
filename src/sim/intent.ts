
import type { Intent, Radians, Vec2 } from './types';

export const MOVE_STEPS = 1024;
export const FACING_STEPS = 65536;
export const AIM_STEPS = 256;

const TAU = Math.PI * 2;
const FACING_STEP = TAU / FACING_STEPS;

const snap = (value: number, steps: number): number => Math.round(value * steps) / steps;

const snapVec = (v: Vec2): Vec2 => ({ x: snap(v.x, MOVE_STEPS), y: snap(v.y, MOVE_STEPS) });

const snapAngle = (a: Radians): Radians => Math.round(a / FACING_STEP) * FACING_STEP;

export const quantizeIntent = (intent: Intent): Intent => ({
  move: snapVec(intent.move),
  facing: intent.facing === null ? null : snapAngle(intent.facing),
  lightPressed: intent.lightPressed,
  heavyPressed: intent.heavyPressed,
  guardHeld: intent.guardHeld,
  guardPressed: intent.guardPressed,
  stepPressed: intent.stepPressed,
  focusPressed: intent.focusPressed,
  interactPressed: intent.interactPressed,
  powerPressed: intent.powerPressed,
  powerHeld: intent.powerHeld,
  aimDistance: intent.aimDistance === null ? null : snap(intent.aimDistance, AIM_STEPS),
});

export const isQuantized = (intent: Intent): boolean => {
  const q = quantizeIntent(intent);
  return (
    q.move.x === intent.move.x &&
    q.move.y === intent.move.y &&
    q.facing === intent.facing &&
    q.aimDistance === intent.aimDistance
  );
};
