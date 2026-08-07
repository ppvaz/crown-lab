import type { RoomTheme } from './theme';
import { lineOnGround, ringOnGround } from './theme';

export const CONCEPT_RAIN_BREACHED_HALL: RoomTheme = {
  props: [
    ['rubble', 0.04, 1],
    ['arch', 0.16, 2],
    ['column', 0.28, 0],
    ['rubble', 0.41, 4],
    ['arch', 0.55, 3],
    ['rubble', 0.69, 6],
    ['column', 0.81, 2],
    ['brazier', 0.94, 0],
  ],
  floorDress: { kind: 'patches', alpha: 0.055 },
  surface: { pattern: 'ashlar', spacing: 2.6, alpha: 0.15 },
  air: { kind: 'draft', count: 10, at: { x: -0.1, y: -0.52 }, spread: { x: 7.2, y: 1.8 } },
  markings: (ctx, cam, h) => {
    ctx.save();
    ctx.fillStyle = '#6f9fbd';
    ctx.globalAlpha = 0.075;
    for (const [x, y, radius] of [
      [-5.8, -3.9, 1.5],
      [0.2, -4.6, 1.25],
      [5.7, -3.6, 1.75],
      [-1.7, 1.6, 0.72],
    ] as const) {
      ringOnGround(ctx, cam, { x, y }, radius);
      ctx.fill();
    }
    ctx.restore();
    for (const x of [-3.7, 0, 3.7]) {
      lineOnGround(ctx, cam, [
        { x, y: -h.y + 0.55 },
        { x: x * 0.72, y: h.y - 0.65 },
      ]);
      ctx.stroke();
    }
  },
  accent: (pal) => pal.lightning,
};
