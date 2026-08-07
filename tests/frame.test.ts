
import { describe, expect, it } from 'vitest';

import { FrameClock, FrameMeter, MAX_CATCHUP_MS } from '../src/app/frame';
import { TICK_MS } from '../src/sim/types';

const drain = (clock: FrameClock, oneTick = false): number => {
  const budget = clock.budget(TICK_MS, oneTick);
  let spent = 0;
  let ticks = 0;
  while (spent + TICK_MS <= budget) {
    spent += TICK_MS;
    ticks += 1;
  }
  clock.spend(spent);
  return ticks;
};

describe('FrameClock', () => {
  it('starts owing nothing', () => {
    expect(new FrameClock().pending).toBe(0);
  });

  it('affords no tick until a full one has elapsed', () => {
    const clock = new FrameClock();
    clock.add(TICK_MS - 0.001);
    expect(drain(clock)).toBe(0);
    expect(clock.pending).toBeCloseTo(TICK_MS - 0.001);
  });

  it('affords exactly one tick at the boundary', () => {
    const clock = new FrameClock();
    clock.add(TICK_MS);
    expect(drain(clock)).toBe(1);
    expect(clock.pending).toBe(0);
  });

  it('carries the remainder, so a 60Hz display still simulates at the tick rate', () => {
    const clock = new FrameClock();
    let ticks = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      clock.add(1000 / 60);
      ticks += drain(clock);
    }
    expect(ticks).toBe(120);
  });

  it('runs a second of 144Hz and a second of 60Hz to within one tick of each other', () => {


    const ticksOver = (hz: number): number => {
      const clock = new FrameClock();
      let ticks = 0;
      for (let frame = 0; frame < hz; frame += 1) {
        clock.add(1000 / hz);
        ticks += drain(clock);
      }
      return ticks;
    };
    expect(Math.abs(ticksOver(144) - ticksOver(60))).toBeLessThanOrEqual(1);
  });

  it('clamps a backgrounded tab rather than simulating its whole absence', () => {
    const clock = new FrameClock();
    clock.add(30_000);
    expect(clock.pending).toBe(MAX_CATCHUP_MS);
    expect(drain(clock)).toBe(Math.floor(MAX_CATCHUP_MS / TICK_MS));
  });

  it('clamps across repeated additions, not merely a single large one', () => {
    const clock = new FrameClock();
    for (let i = 0; i < 100; i += 1) clock.add(100);
    expect(clock.pending).toBe(MAX_CATCHUP_MS);
  });

  it('advances exactly one tick in single-step mode however much is owed', () => {
    const clock = new FrameClock();
    clock.add(MAX_CATCHUP_MS);
    expect(drain(clock, true)).toBe(1);
    expect(clock.pending).toBe(MAX_CATCHUP_MS - TICK_MS);
  });
});

describe('replacing the world', () => {
  it('carries no already-simulated time into the world that replaced it', () => {
    const clock = new FrameClock();
    clock.add(MAX_CATCHUP_MS);

    clock.spend(TICK_MS * 3);
    expect(clock.pending).toBeGreaterThan(0);

    clock.clear();
    expect(clock.pending).toBe(0);
    clock.add(TICK_MS);
    expect(drain(clock)).toBe(1);
  });

  it('is idempotent, so a path that clears twice is not a bug', () => {
    const clock = new FrameClock();
    clock.add(MAX_CATCHUP_MS);
    clock.clear();
    clock.clear();
    expect(clock.pending).toBe(0);
  });
});

describe('FrameMeter', () => {
  it('reports the hitch that average FPS would hide', () => {
    const meter = new FrameMeter();

    for (let i = 0; i < 58; i += 1) meter.sample(1000 / 60);
    const reading = meter.sample(50);

    expect(reading.fps).toBeGreaterThan(50);
    expect(reading.frameMs).toBe(50);
    expect(reading.worstFrameMs).toBe(50);
    expect(reading.longFrames).toBe(1);
  });

  it('starts a fresh diagnostic window without forgetting the display rate', () => {
    const meter = new FrameMeter();
    for (let i = 0; i < 60; i += 1) meter.sample(1000 / 60);
    const before = meter.reading.fps;

    meter.reset();

    expect(meter.reading.fps).toBeCloseTo(before);
    expect(meter.reading.longFrames).toBe(0);
  });
});
