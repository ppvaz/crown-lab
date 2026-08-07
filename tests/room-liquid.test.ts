
import { describe, expect, it } from 'vitest';

import { LIQUID, RIPPLE_SLOTS, createLiquidSurface, dripsAt } from '../src/render/room-liquid-lab';
import type { World } from '../src/sim/types';
import { TICK_MS } from '../src/sim/types';

const worldAt = (tick: number, bodies: { x: number; y: number }[] = []): World =>
  ({
    tick,
    players: bodies.map((at) => ({ pos: at, hp: 100, maxHp: 100, state: { kind: 'idle' } })),
    enemies: [],
  }) as unknown as World;

describe('drips are a condition, not an accumulator', () => {
  it('says where every drop is as a pure function of simulation time', () => {
    let at = -1;
    for (let t = 0; t < LIQUID.dripPeriodMs * 2 && at < 0; t += 17) {
      if (dripsAt(t).length > 0) at = t;
    }
    expect(at).toBeGreaterThanOrEqual(0);
    expect(dripsAt(at)).toEqual(dripsAt(at));
    expect(dripsAt(at).length).toBeGreaterThan(0);
  });

  it('keeps every drop between the leak and the floor', () => {
    for (let t = 0; t < LIQUID.dripPeriodMs * 3; t += 37) {
      for (const drip of dripsAt(t)) {
        expect(drip.elevation).toBeGreaterThanOrEqual(0);
        expect(drip.elevation).toBeLessThanOrEqual(LIQUID.dripHeight);
      }
    }
  });

  it('scatters the leaks without ever repeating one position', () => {
    const seen = new Set<string>();
    for (let t = 0; t < LIQUID.dripPeriodMs * 2; t += 25) {
      for (const drip of dripsAt(t)) seen.add(`${drip.at.x},${drip.at.y}`);
    }
    expect(seen.size).toBe(LIQUID.dripSources);
    const radii = [...seen].map((k) => {
      const [x, y] = k.split(',').map(Number);
      return Math.hypot(x, y);
    });
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0.5);
  });
});

describe('rings outlive the tick that caused them, and are cleaned up for it', () => {
  it('rings where a body has walked a full stride, and not where it has shuffled', () => {
    const water = createLiquidSurface();
    water.update(worldAt(0, [{ x: 0, y: 0 }]));
    const shuffled = water.update(worldAt(1, [{ x: LIQUID.strideDistance * 0.2, y: 0 }]));
    const fromSteps = (rings: readonly { strength: number }[]) =>
      rings.filter((r) => r.strength === LIQUID.stepStrength);
    expect(fromSteps(shuffled)).toHaveLength(0);

    const walked = water.update(worldAt(2, [{ x: LIQUID.strideDistance * 1.5, y: 0 }]));
    expect(fromSteps(walked)).toHaveLength(1);
  });

  it('drops the last run\'s rings when the world restarts', () => {
    const water = createLiquidSurface();
    water.update(worldAt(0, [{ x: 0, y: 0 }]));
    const late = water.update(worldAt(40, [{ x: 4, y: 0 }]));
    expect(late.length).toBeGreaterThan(0);

    const restarted = water.update(worldAt(0, [{ x: 0, y: 0 }]));
    expect(restarted).toHaveLength(0);
  });

  it('never exceeds the slot count the shader was compiled for', () => {
    const water = createLiquidSurface();
    let rings: readonly unknown[] = [];
    for (let tick = 0; tick < 400; tick++) {
      rings = water.update(worldAt(tick, [{ x: tick * LIQUID.strideDistance * 1.2, y: 0 }]));
      expect(rings.length).toBeLessThanOrEqual(RIPPLE_SLOTS);
    }
  });

  it('retires a ring once it has outlived its own life', () => {
    const water = createLiquidSurface();
    water.update(worldAt(0, [{ x: 0, y: 0 }]));
    water.update(worldAt(1, [{ x: LIQUID.strideDistance * 2, y: 0 }]));
    const past = Math.ceil((LIQUID.waveLifeMs * 2) / TICK_MS);
    const rings = water.update(worldAt(past, [{ x: LIQUID.strideDistance * 2, y: 0 }]));
    for (const ring of rings) {
      expect((past * TICK_MS) - ring.startMs).toBeLessThanOrEqual(LIQUID.waveLifeMs);
    }
  });

  it('lands exactly one ring per drop, however often it is asked', () => {
    const water = createLiquidSurface();
    const tick = Math.ceil((LIQUID.dripPeriodMs * 2) / TICK_MS);
    const first = water.update(worldAt(tick)).length;
    const second = water.update(worldAt(tick)).length;
    expect(second).toBe(first);
  });
});
