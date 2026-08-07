
import type { RoomTheme } from './theme';
import { lineOnGround, ringOnGround } from './theme';

export const CHANCELLERY: RoomTheme = {
  props: [['column', 0.04, 0], ['column', 0.19, 1], ['arch', 0.26, 0], ['banner', 0.34, 2], ['brazier', 0.54, 3], ['rubble', 0.69, 4], ['arch', 0.76, 1], ['column', 0.84, 5]],
  floorDress: { kind: 'medallion', alpha: 0.024 },
  surface: { pattern: 'diamond', spacing: 1.85, alpha: 0.1 },
  air: { kind: 'mortar', count: 6, at: { x: 0.34, y: -0.12 }, spread: { x: 2.4, y: 2.8 } },
  markings: (ctx, cam, h) => {
    for (const radius of [2.4, 3.6, 4.8]) {
      ringOnGround(ctx, cam, { x: 0, y: 0 }, radius);
      ctx.stroke();
    }
    ctx.lineWidth = 2;
    ringOnGround(ctx, cam, { x: 0, y: 0 }, 1.25);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    lineOnGround(ctx, cam, [
      { x: 0, y: -h.y + 0.7 },
      { x: 0, y: h.y - 0.7 },
    ]);
    ctx.stroke();
  },
  accent: (pal) => pal.chancellor ?? pal.playerAccent,
};
