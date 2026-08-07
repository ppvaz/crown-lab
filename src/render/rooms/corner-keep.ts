
import type { RoomTheme } from './theme';
import { lineOnGround, polygonOnGround } from './theme';

export const CORNER_KEEP: RoomTheme = {
  props: [['column', 0.06, 0], ['column', 0.22, 1], ['rubble', 0.38, 2], ['arch', 0.47, 0], ['brazier', 0.56, 3], ['rubble', 0.72, 4], ['column', 0.88, 5]],
  floorDress: { kind: 'patches', alpha: 0.028 },
  surface: { pattern: 'patchwork', spacing: 2.8, alpha: 0.14 },
  air: { kind: 'mortar', count: 8, at: { x: 0.22, y: 0.18 }, spread: { x: 2.8, y: 3.2 } },
  markings: (ctx, cam, h) => {
    for (const room of [
      [
        { x: -9.1, y: -7.1 },
        { x: -1.8, y: -7.1 },
        { x: -1.8, y: -0.9 },
        { x: -9.1, y: -0.9 },
      ],
      [
        { x: 0.9, y: 2.4 },
        { x: 9.1, y: 2.4 },
        { x: 9.1, y: 7.1 },
        { x: 0.9, y: 7.1 },
      ],
    ]) {
      polygonOnGround(ctx, cam, room);
      ctx.stroke();
      const centre = room.reduce(
        (sum, point) => ({ x: sum.x + point.x / room.length, y: sum.y + point.y / room.length }),
        { x: 0, y: 0 },
      );
      polygonOnGround(
        ctx,
        cam,
        room.map((point) => ({
          x: point.x + Math.sign(centre.x - point.x) * 0.48,
          y: point.y + Math.sign(centre.y - point.y) * 0.48,
        })),
      );
      ctx.stroke();
    }
    lineOnGround(ctx, cam, [
      { x: -5.2, y: -4 },
      { x: 1.5, y: -1.5 },
      { x: 1.5, y: 4.7 },
      { x: 5.2, y: 4.7 },
    ]);
    ctx.lineWidth = 2;
    ctx.stroke();
  },
  accent: (pal) => pal.playerAccent,
};
