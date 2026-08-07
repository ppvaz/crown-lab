
import { describe, expect, it } from 'vitest';

import type { Intent } from '../src/sim/types';
import { NEUTRAL_INTENT } from '../src/sim/types';
import {
  AIM_STEPS,
  FACING_STEPS,
  MOVE_STEPS,
  isQuantized,
  quantizeIntent,
} from '../src/sim/intent';
import { InputSource } from '../src/app/input';

const withValues = (over: Partial<Intent>): Intent => ({ ...NEUTRAL_INTENT, ...over });

describe('the intent grid', () => {
  it('snaps movement to a power-of-two grid', () => {
    const q = quantizeIntent(withValues({ move: { x: 0.123456789, y: -0.987654321 } }));
    expect(q.move.x).toBe(Math.round(0.123456789 * MOVE_STEPS) / MOVE_STEPS);
    expect(q.move.y).toBe(Math.round(-0.987654321 * MOVE_STEPS) / MOVE_STEPS);
    expect(Number.isInteger(q.move.x * MOVE_STEPS)).toBe(true);
    expect(Number.isInteger(q.move.y * MOVE_STEPS)).toBe(true);
  });

  it('snaps facing to a whole number of turn steps', () => {
    const step = (Math.PI * 2) / FACING_STEPS;
    const q = quantizeIntent(withValues({ facing: 1.2345678901234 }));
    expect(q.facing).not.toBeNull();
    expect(Number.isInteger(Math.round((q.facing as number) / step))).toBe(true);
    expect(Math.abs((q.facing as number) - 1.2345678901234)).toBeLessThan(step);
  });

  it('snaps aim distance', () => {
    const q = quantizeIntent(withValues({ aimDistance: 7.3333333 }));
    expect(q.aimDistance).toBe(Math.round(7.3333333 * AIM_STEPS) / AIM_STEPS);
  });

  it('leaves null facing and null aim distance alone', () => {
    const q = quantizeIntent(withValues({ facing: null, aimDistance: null }));
    expect(q.facing).toBeNull();
    expect(q.aimDistance).toBeNull();
  });

  it('passes every boolean through untouched', () => {
    const source = withValues({
      lightPressed: true,
      heavyPressed: true,
      guardHeld: true,
      guardPressed: true,
      stepPressed: true,
      focusPressed: true,
      interactPressed: true,
      powerPressed: true,
      powerHeld: true,
    });
    const q = quantizeIntent(source);
    for (const key of Object.keys(NEUTRAL_INTENT) as (keyof Intent)[]) {
      if (typeof NEUTRAL_INTENT[key] === 'boolean') expect(q[key]).toBe(source[key]);
    }
  });

  it('is idempotent over a wide sweep of values', () => {
    for (let i = -2000; i <= 2000; i++) {
      const intent = withValues({
        move: { x: i / 1997, y: -i / 3001 },
        facing: (i / 2000) * Math.PI,
        aimDistance: Math.abs(i) / 97,
      });
      const once = quantizeIntent(intent);
      const twice = quantizeIntent(once);
      expect(twice).toEqual(once);
      expect(isQuantized(once)).toBe(true);
    }
  });

  it('reports an off-grid intent as off-grid', () => {
    expect(isQuantized(withValues({ move: { x: 0.1234567, y: 0 } }))).toBe(false);
    expect(isQuantized(withValues({ facing: 0.1234567 }))).toBe(false);
    expect(isQuantized(withValues({ aimDistance: 0.1234567 }))).toBe(false);
    expect(isQuantized(NEUTRAL_INTENT)).toBe(true);
  });

  it('holds the grid steps at powers of two, so a binary encoding has integer fields', () => {
    for (const steps of [MOVE_STEPS, FACING_STEPS, AIM_STEPS]) {
      expect(Number.isInteger(Math.log2(steps))).toBe(true);
    }
  });
});

describe('the input boundary emits canonical intents', () => {
  it('quantizes the facing an aim resolver hands it', () => {
    const input = new InputSource({} as HTMLElement, { bufferMs: 120 });
    input.aimMode = 'auto_threat';
    input.autoAimResolver = () => 1.23456789012345;

    const intent = input.sample(true);

    expect(isQuantized(intent)).toBe(true);
    expect(intent.facing).not.toBe(1.23456789012345);
    expect(intent.facing).toBeCloseTo(1.23456789012345, 4);
  });

  it('quantizes a diagonal movement vector, whose normalized components are irrational', () => {
    const input = new InputSource({} as HTMLElement, { bufferMs: 120 });
    input.setTouchMove(1, 1);

    const intent = input.sample(true);

    expect(isQuantized(intent)).toBe(true);
    expect(intent.move.x === 0 && intent.move.y === 0).toBe(false);
    expect(Number.isInteger(intent.move.x * MOVE_STEPS)).toBe(true);
    expect(Number.isInteger(intent.move.y * MOVE_STEPS)).toBe(true);
  });
});
