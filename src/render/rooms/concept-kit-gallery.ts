import type { RoomTheme } from './theme';
import { lineOnGround } from './theme';

export const CONCEPT_KIT_GALLERY: RoomTheme = {
  props: [
    ['column', 0.06, 0],
    ['arch', 0.25, 1],
    ['arch', 0.75, 2],
    ['column', 0.94, 3],
  ],
  floorDress: { kind: 'patches', alpha: 0.018 },
  surface: { pattern: 'ashlar', spacing: 3.2, alpha: 0.045 },
  air: { kind: 'mortar', count: 4, at: { x: 0, y: 0.2 }, spread: { x: 8, y: 4 } },
  markings: (ctx, cam, h) => {
    for (const y of [-0.8, 2, 4.4]) {
      lineOnGround(ctx, cam, [
        { x: -h.x + 1.4, y },
        { x: h.x - 1.4, y },
      ]);
      ctx.stroke();
    }
  },
  accent: (pal) => pal.playerAccent,
};
