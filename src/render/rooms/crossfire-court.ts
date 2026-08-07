
import type { RoomTheme } from './theme';
import { lineOnGround, ringOnGround } from './theme';

export const CROSSFIRE_COURT: RoomTheme = {
  props: [['target', 0.08, 0], ['target', 0.23, 1], ['brazier', 0.38, 2], ['arch', 0.52, 1], ['rubble', 0.62, 3], ['target', 0.82, 4]],
  floorDress: { kind: 'lanes', alpha: 0.026 },
  surface: { pattern: 'range', spacing: 2.15, alpha: 0.13 },
  air: { kind: 'draft', count: 5, at: { x: 0.38, y: 0.08 }, spread: { x: 4.2, y: 1.8 } },
  markings: (ctx, cam, h) => {
    const leftFrame = -h.x + 1.15;
    const rightFrame = h.x - 1.15;
    for (const y of [-2.4, 0, 2.4]) {
      lineOnGround(ctx, cam, [
        { x: -h.x + 0.55, y },
        { x: h.x - 0.55, y },
      ]);
      ctx.stroke();
      for (const x of [-h.x + 1.15, h.x - 1.15]) {
        ringOnGround(ctx, cam, { x, y }, 0.34);
        ctx.stroke();
      }
    }
    for (const x of [leftFrame, rightFrame]) {
      lineOnGround(ctx, cam, [
        { x, y: -2.4 },
        { x, y: 2.4 },
      ]);
      ctx.stroke();
    }
  },
  accent: (pal) => pal.archer,
};
