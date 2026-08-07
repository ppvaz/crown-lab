
import type { RoomTheme } from './theme';
import { lineOnGround, ringOnGround } from './theme';

export const GUARD_HALL: RoomTheme = {
  props: [['column', 0.05, 0], ['target', 0.16, 0], ['brazier', 0.28, 1], ['rubble', 0.4, 1], ['column', 0.55, 2], ['arch', 0.66, 0], ['column', 0.78, 3]],
  floorDress: { kind: 'medallion', alpha: 0.03 },
  surface: { pattern: 'ashlar', spacing: 1.9, alpha: 0.14 },
  air: { kind: 'embers', count: 8, at: { x: -0.28, y: 0.28 }, spread: { x: 3.2, y: 2.4 } },
  markings: (ctx, cam, h) => {
    ringOnGround(ctx, cam, { x: 0, y: 0 }, 3.35);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1.5;
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      lineOnGround(ctx, cam, [
        { x: sx * 2.05, y: sy * 2.05 },
        { x: sx * 2.95, y: sy * 2.95 },
      ]);
      ctx.stroke();
    }
    lineOnGround(ctx, cam, [
      { x: -h.x + 0.7, y: h.y * 0.62 },
      { x: h.x - 0.7, y: h.y * 0.62 },
    ]);
    ctx.stroke();
  },
  accent: (pal) => pal.captain ?? pal.playerAccent,
};
