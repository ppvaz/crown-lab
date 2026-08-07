import { vi } from 'vitest';

import { HERALD } from '../src/game/herald';
import { PALETTE } from '../src/render/palette';
import { drawHerald } from '../src/render/herald';
import { makeCamera, worldToScreen } from '../src/render/iso';

const stubCtx = () => {
  const translate = vi.fn();
  const fill = vi.fn();
  const target: Record<string, unknown> = {
    canvas: { width: 1280, height: 720 },
    globalAlpha: 1,
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    translate,
    fill,
  };
  const ctx = new Proxy(target, {
    get: (obj, prop: string) => (prop in obj ? obj[prop] : () => {}),
    set: (obj, prop: string, value) => {
      obj[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, translate, fill };
};

describe('the Herald figure', () => {
  it('builds a physical reliquary at the staff light', () => {
    const cam = makeCamera(1280, 720);
    const p = worldToScreen(cam, HERALD.at);
    const lamp = { x: p.x + 12 * cam.zoom, y: p.y - 62 * cam.zoom * 1.05 };
    const { ctx, translate, fill } = stubCtx();

    drawHerald(ctx, cam, { ...PALETTE }, 900);

    expect(translate).toHaveBeenCalledWith(lamp.x, lamp.y);
    expect(fill.mock.calls.length).toBeGreaterThanOrEqual(8);
  });
});
