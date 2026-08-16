
import type { World } from '../../sim/types';
import type { Camera } from '../iso';
import type { Palette } from '../palette';
import { GlBackend } from './backend';
import type { SunkBody } from './sink';

export interface GlRoomLayer {
  drawBehind: (ctx: CanvasRenderingContext2D, cam: Camera) => void;
  drawInFront: (ctx: CanvasRenderingContext2D, cam: Camera) => void;
  drawsPerFrame: number;
}

export const createGlBackend = (): GlBackend | null => {
  try {
    return new GlBackend();
  } catch (cause) {
    console.warn('[crown] WebGL2 unavailable, falling back to the Canvas2D renderer', cause);
    return null;
  }
};

export const glRoomLayer = (
  backend: GlBackend,
  liveWorld: () => World,
  pal: Palette,
  collected: SunkBody[],
): GlRoomLayer => ({
  drawBehind: (ctx: CanvasRenderingContext2D, cam: Camera): void => {
    collected.length = 0;
    backend.renderRoom(ctx, liveWorld(), cam, { floor: pal.floor, wall: pal.wall, gate: pal.wall });
  },
  drawInFront: (ctx: CanvasRenderingContext2D, cam: Camera): void => {
    backend.renderBodies(ctx, cam, collected);
  },
  drawsPerFrame: 2,
});
