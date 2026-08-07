import type { RoomTheme } from './theme';
import { lineOnGround, polygonOnGround } from './theme';

export const CONCEPT_PARALLAX_GALLERY: RoomTheme = {
  props: [
    ['column', 0.04, 0],
    ['arch', 0.15, 0],
    ['arch', 0.29, 1],
    ['banner', 0.42, 2],
    ['arch', 0.57, 3],
    ['arch', 0.7, 4],
    ['column', 0.84, 5],
    ['brazier', 0.95, 1],
  ],
  floorDress: { kind: 'runner', alpha: 0.035 },
  surface: { pattern: 'diamond', spacing: 2.8, alpha: 0.085 },
  air: { kind: 'draft', count: 6, at: { x: 0, y: -0.32 }, spread: { x: 8.4, y: 1.4 } },
  markings: (ctx, cam, h) => {
    for (const inset of [0.7, 1.35]) {
      polygonOnGround(ctx, cam, [
        { x: -h.x + inset, y: -h.y + inset },
        { x: h.x - inset, y: -h.y + inset },
        { x: h.x - inset, y: h.y - inset },
        { x: -h.x + inset, y: h.y - inset },
      ]);
      ctx.stroke();
    }
    for (const x of [-6, -2, 2, 6]) {
      lineOnGround(ctx, cam, [
        { x, y: -h.y + 0.9 },
        { x, y: -h.y + 2.2 },
      ]);
      ctx.stroke();
    }
  },
  accent: (pal) => pal.playerAccent,
};
