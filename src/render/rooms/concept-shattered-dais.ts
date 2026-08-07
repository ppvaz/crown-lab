import type { RoomTheme } from './theme';
import { lineOnGround, polygonOnGround, ringOnGround } from './theme';

export const CONCEPT_SHATTERED_DAIS: RoomTheme = {
  props: [
    ['rubble', 0.05, 1],
    ['column', 0.17, 0],
    ['banner', 0.29, 2],
    ['rubble', 0.43, 3],
    ['arch', 0.58, 0],
    ['rubble', 0.71, 5],
    ['column', 0.84, 4],
    ['brazier', 0.94, 1],
  ],
  floorDress: { kind: 'patches', alpha: 0.04 },
  surface: { pattern: 'patchwork', spacing: 2.35, alpha: 0.14 },
  air: { kind: 'mortar', count: 8, at: { x: 0.18, y: 0.08 }, spread: { x: 4.2, y: 3.2 } },
  markings: (ctx, cam, h) => {
    for (const radius of [1.72, 3.1, 5.2]) {
      ringOnGround(ctx, cam, { x: 0, y: 0 }, radius);
      ctx.stroke();
    }
    for (const [from, to] of [
      [{ x: -h.x + 0.8, y: 0.2 }, { x: -1.7, y: 0.1 }],
      [{ x: 1.7, y: -0.2 }, { x: h.x - 0.8, y: -0.45 }],
      [{ x: -0.2, y: -h.y + 0.7 }, { x: -0.05, y: -1.7 }],
      [{ x: 0.25, y: 1.7 }, { x: 0.55, y: h.y - 0.8 }],
    ] as const) {
      lineOnGround(ctx, cam, [from, to]);
      ctx.stroke();
    }
    for (const points of [
      [{ x: -3.2, y: 1.35 }, { x: -2.25, y: 0.9 }, { x: -2.55, y: 1.85 }],
      [{ x: 2.1, y: 1.45 }, { x: 3.15, y: 1.1 }, { x: 2.7, y: 2.1 }],
      [{ x: 1.15, y: -2.8 }, { x: 1.75, y: -2.1 }, { x: 0.8, y: -1.95 }],
    ]) {
      polygonOnGround(ctx, cam, points);
      ctx.stroke();
    }
  },
  accent: (pal) => pal.playerAccent,
};
