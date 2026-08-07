import type { RoomTheme } from './theme';
import { lineOnGround } from './theme';

export const CONCEPT_CLUTTER_GALLERY: RoomTheme = {
  props: [
    ['column', 0.06, 0],
    ['arch', 0.25, 1],
    ['arch', 0.75, 2],
    ['column', 0.94, 3],
  ],
  floorDress: { kind: 'runner', alpha: 0.018 },
  surface: { pattern: 'ashlar', spacing: 3.2, alpha: 0.045 },
  air: { kind: 'mortar', count: 4, at: { x: 0, y: 0.1 }, spread: { x: 8, y: 4 } },
  markings: (ctx, cam, h) => {
    lineOnGround(ctx, cam, [
      { x: -h.x + 1.4, y: 0 },
      { x: h.x - 1.4, y: 0 },
    ]);
    ctx.stroke();
    lineOnGround(ctx, cam, [
      { x: 0, y: -h.y + 1 },
      { x: 0, y: h.y - 1 },
    ]);
    ctx.stroke();
  },
  accent: (pal) => pal.playerAccent,
};
