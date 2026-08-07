
import type { RoomTheme } from './theme';
import { lineOnGround, ringOnGround } from './theme';

export const ASSEMBLY_HALL: RoomTheme = {
  props: [['column', 0.06, 0], ['banner', 0.22, 1], ['brazier', 0.38, 2], ['arch', 0.47, 0], ['banner', 0.56, 3], ['rubble', 0.72, 4], ['column', 0.88, 5]],
  floorDress: { kind: 'runner', alpha: 0.045 },
  surface: { pattern: 'ceremonial', spacing: 3.15, alpha: 0.12 },
  air: { kind: 'embers', count: 7, at: { x: 0.08, y: 0.36 }, spread: { x: 3.4, y: 2.8 } },
  markings: (ctx, cam, h) => {
    for (const centre of [
      { x: 0, y: 4.2 },
      { x: 0, y: -4.2 },
    ]) {
      ringOnGround(ctx, cam, centre, 1.1);
      ctx.stroke();
    }
    for (const x of [-0.72, 0.72]) {
      lineOnGround(ctx, cam, [
        { x, y: -3.1 },
        { x, y: 3.1 },
      ]);
      ctx.stroke();
    }
    for (const y of [-2.1, 0, 2.1]) {
      lineOnGround(ctx, cam, [
        { x: -0.72, y },
        { x: 0.72, y },
      ]);
      ctx.stroke();
    }
  },
  accent: (pal) => pal.guard,
};
