import { describe, expect, it, vi } from 'vitest';

import {
  canvasRenderScale,
  resizeCanvasBackingStore,
} from '../src/app/viewport';

describe('canvasRenderScale', () => {
  it('keeps native display density', () => {
    expect(canvasRenderScale(2)).toBe(2);
    expect(canvasRenderScale(3)).toBe(3);
    expect(canvasRenderScale(1.5)).toBe(1.5);
  });

  it('sanitizes an unavailable browser density', () => {
    expect(canvasRenderScale(0)).toBe(1);
    expect(canvasRenderScale(Number.NaN)).toBe(1);
  });
});

describe('resizeCanvasBackingStore', () => {
  it('sizes the buffer and keeps drawing in CSS pixels', () => {
    const canvas = { width: 0, height: 0 } as HTMLCanvasElement;
    const setTransform = vi.fn();
    const ctx = { setTransform } as unknown as CanvasRenderingContext2D;

    resizeCanvasBackingStore(canvas, ctx, 800, 360, 2);

    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(720);
    expect(setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  it('retains high-density backing stores away from touch devices', () => {
    const canvas = { width: 0, height: 0 } as HTMLCanvasElement;
    const setTransform = vi.fn();
    const ctx = { setTransform } as unknown as CanvasRenderingContext2D;

    resizeCanvasBackingStore(canvas, ctx, 1280, 720, 2);

    expect(canvas.width).toBe(2560);
    expect(canvas.height).toBe(1440);
    expect(setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });
});
