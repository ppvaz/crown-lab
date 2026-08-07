
import type { RoomTheme } from './theme';
import { lineOnGround, polygonOnGround, ringOnGround } from './theme';

export const TRAINING_COURT: RoomTheme = {
  props: [['column', 0.08, 0], ['column', 0.33, 1], ['banner', 0.43, 0], ['arch', 0.52, 0], ['brazier', 0.68, 2], ['column', 0.83, 3]],
  floorDress: { kind: 'medallion', alpha: 0.035 },
  surface: { pattern: 'ashlar', spacing: 2.25, alpha: 0.13 },
  air: { kind: 'draft', count: 6, at: { x: -0.42, y: -0.18 }, spread: { x: 3.4, y: 2.2 } },
  markings: (ctx, cam, h) => {
    for (const radius of [1.55, 3.1]) {
      ringOnGround(ctx, cam, { x: 0, y: 0 }, radius);
      ctx.stroke();
    }
    const courtRadius = Math.min(h.x, h.y) * 0.55;
    polygonOnGround(
      ctx,
      cam,
      Array.from({ length: 8 }, (_, index) => {
        const angle = Math.PI / 8 + index * Math.PI / 4;
        return { x: Math.cos(angle) * courtRadius, y: Math.sin(angle) * courtRadius };
      }),
    );
    ctx.stroke();
    for (const [from, to] of [
      [{ x: -4.5, y: 0 }, { x: -3.55, y: 0 }],
      [{ x: 3.55, y: 0 }, { x: 4.5, y: 0 }],
      [{ x: 0, y: -4.5 }, { x: 0, y: -3.55 }],
      [{ x: 0, y: 3.55 }, { x: 0, y: 4.5 }],
    ]) {
      lineOnGround(ctx, cam, [from, to]);
      ctx.stroke();
    }
  },
  accent: (pal) => pal.playerAccent,
};
