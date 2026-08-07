
import { describe, expect, it } from 'vitest';

import { drawProjectedGuardShield } from '../src/render/draw';
import { makeCamera } from '../src/render/iso';
import type { World } from '../src/sim/types';

const recordingContext = () => {
  const calls: string[] = [];
  const sets: Array<[string, unknown]> = [];
  const target: Record<string, unknown> = {
    canvas: { width: 1440, height: 900 },
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
  };
  const proxy = new Proxy(target, {
    get(object, property: string) {
      if (property in object) return object[property];
      return (...args: unknown[]) => {
        calls.push(`${property}(${args.map((a) => String(a)).join(',')})`);
      };
    },
    set(object, property: string, value) {
      sets.push([property, value]);
      object[property] = value;
      return true;
    },
  });
  return { ctx: proxy as unknown as CanvasRenderingContext2D, calls, sets, target };
};

const FLAT = { arena: { shape: 'rect', halfExtents: { x: 12, y: 12 } } } as unknown as World;

const shield = (intensity: number, zoom = 1) => {
  const { ctx, calls, sets, target } = recordingContext();
  const cam = { ...makeCamera(800, 360), zoom };
  drawProjectedGuardShield(ctx, cam, FLAT, { x: 0, y: 0 }, 0, 0.45, '#ffd479', intensity);
  return { calls, sets, target };
};

describe('the projected guard shield', () => {
  it('never asks the browser for a shadow — the guarded frame carries no live blur', () => {
    for (const intensity of [0.62, 1]) {
      const { sets } = shield(intensity);
      const shadowed = sets.filter(([property]) => property.startsWith('shadow'));
      expect(shadowed).toEqual([]);
    }
  });

  it('builds the glow from concentric contours of the one silhouette', () => {
    const { calls } = shield(1);
    const traces = calls.filter((call) => call === 'closePath()');
    expect(traces.length).toBeGreaterThanOrEqual(4);
    expect(calls.filter((call) => call.startsWith('lineTo')).length).toBeGreaterThanOrEqual(28);
  });

  it('paints additively, so the bands sum into a falloff instead of occluding each other', () => {
    const { sets } = shield(1);
    expect(sets.some(([p, v]) => p === 'globalCompositeOperation' && v === 'lighter')).toBe(true);
  });

  it('widens the halo with the camera, the way a blur radius used to', () => {
    const widthsAt = (zoom: number): number[] =>
      shield(1, zoom)
        .sets.filter(([property]) => property === 'lineWidth')
        .map(([, value]) => Number(value));
    const near = widthsAt(1);
    const far = widthsAt(2.5);
    expect(Math.max(...far)).toBeGreaterThan(Math.max(...near));
  });

  it('gives the parry a stronger halo than a held guard', () => {
    const haloAlpha = (intensity: number): number => {
      const sets = shield(intensity).sets;
      const alphas = sets
        .filter(([property]) => property === 'globalAlpha')
        .map(([, value]) => Number(value));
      return alphas[0];
    };
    expect(haloAlpha(1)).toBeGreaterThan(haloAlpha(0.62));
  });
});
