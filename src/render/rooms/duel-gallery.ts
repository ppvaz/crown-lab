
import type { RoomTheme } from './theme';
import { lineOnGround, polygonOnGround } from './theme';

export const DUEL_GALLERY: RoomTheme = {
  props: [['column', 0.13, 0], ['banner', 0.37, 1], ['arch', 0.51, 0], ['brazier', 0.63, 2], ['rubble', 0.73, 0], ['column', 0.87, 3]],
  floorDress: { kind: 'diamond', alpha: 0.03 },
  surface: { pattern: 'diamond', spacing: 2.6, alpha: 0.12 },
  air: { kind: 'mortar', count: 6, at: { x: 0.26, y: -0.24 }, spread: { x: 2.2, y: 2.8 } },
  markings: (ctx, cam, h) => {
    for (const scale of [1, 0.72, 0.44]) {
      polygonOnGround(ctx, cam, [
        { x: 0, y: -h.y * 0.82 * scale },
        { x: h.x * 0.62 * scale, y: 0 },
        { x: 0, y: h.y * 0.82 * scale },
        { x: -h.x * 0.62 * scale, y: 0 },
      ]);
      ctx.stroke();
    }
    for (const [x, y] of [
      [0, -h.y * 0.93],
      [h.x * 0.72, 0],
      [0, h.y * 0.93],
      [-h.x * 0.72, 0],
    ] as const) {
      const radius = 0.34;
      polygonOnGround(ctx, cam, [
        { x, y: y - radius },
        { x: x + radius, y },
        { x, y: y + radius },
        { x: x - radius, y },
      ]);
      ctx.stroke();
    }
    lineOnGround(ctx, cam, [
      { x: -h.x * 0.78, y: -h.y * 0.78 },
      { x: h.x * 0.78, y: h.y * 0.78 },
    ]);
    ctx.stroke();
  },
  accent: (pal) => pal.duelist,
};
