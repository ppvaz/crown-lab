import type { RoomTheme } from './theme';
import { lineOnGround, ringOnGround } from './theme';

export const CONCEPT_PROP_GALLERY: RoomTheme = {
  props: [
    ['column', 0.08, 0],
    ['arch', 0.25, 0],
    ['banner', 0.48, 1],
    ['arch', 0.72, 2],
    ['column', 0.91, 3],
  ],
  floorDress: { kind: 'medallion', alpha: 0.022 },
  surface: { pattern: 'ceremonial', spacing: 2.5, alpha: 0.075 },
  air: { kind: 'mortar', count: 4, at: { x: 0, y: 0.12 }, spread: { x: 5, y: 2.6 } },
  markings: (ctx, cam, h) => {
    ringOnGround(ctx, cam, { x: 0, y: 0.1 }, 2.2);
    ctx.stroke();
    lineOnGround(ctx, cam, [
      { x: -7.5, y: 2.2 },
      { x: 0, y: 5.85 },
      { x: 7.5, y: 2.2 },
    ]);
    ctx.stroke();
    for (const x of [-6.5, -4, -1.4, 1.4, 4, 6.5]) {
      lineOnGround(ctx, cam, [
        { x, y: 3.45 + (6.5 - Math.abs(x)) * 0.12 },
        { x, y: 3.85 + (6.5 - Math.abs(x)) * 0.12 },
      ]);
      ctx.stroke();
    }
    lineOnGround(ctx, cam, [
      { x: -h.x + 1, y: -h.y + 1 },
      { x: h.x - 1, y: -h.y + 1 },
    ]);
    ctx.stroke();
  },
  accent: (pal) => pal.playerAccent,
};
