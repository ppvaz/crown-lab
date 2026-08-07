import type { RoomTheme } from './theme';
import { lineOnGround, polygonOnGround, ringOnGround } from './theme';

export const CONCEPT_BELL_COURT: RoomTheme = {
  props: [
    ['column', 0.03, 0],
    ['arch', 0.16, 0],
    ['banner', 0.24, 1],
    ['brazier', 0.39, 2],
    ['arch', 0.55, 1],
    ['banner', 0.66, 3],
    ['brazier', 0.78, 4],
    ['column', 0.91, 5],
  ],
  floorDress: { kind: 'medallion', alpha: 0.04 },
  surface: { pattern: 'ceremonial', spacing: 2.15, alpha: 0.11 },
  air: { kind: 'draft', count: 8, at: { x: 0, y: -0.38 }, spread: { x: 6, y: 2 } },
  markings: (ctx, cam, h) => {
    for (const radius of [1.45, 2.8, 4.15]) {
      ringOnGround(ctx, cam, { x: 0, y: -0.2 }, radius);
      ctx.stroke();
    }
    for (let index = 0; index < 8; index += 1) {
      const angle = Math.PI / 8 + (index * Math.PI) / 4;
      lineOnGround(ctx, cam, [
        { x: Math.cos(angle) * 4.5, y: -0.2 + Math.sin(angle) * 4.5 },
        {
          x: Math.cos(angle) * Math.min(h.x, 7.2),
          y: -0.2 + Math.sin(angle) * Math.min(h.y, 5.7),
        },
      ]);
      ctx.stroke();
    }
    polygonOnGround(ctx, cam, [
      { x: -2.1, y: -h.y + 0.75 },
      { x: 2.1, y: -h.y + 0.75 },
      { x: 1.25, y: -h.y + 1.55 },
      { x: -1.25, y: -h.y + 1.55 },
    ]);
    ctx.stroke();
  },
  accent: (pal) => pal.playerAccent,
};
