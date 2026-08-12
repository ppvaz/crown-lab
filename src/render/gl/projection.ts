
import type { Camera } from '../iso';
import { ELEVATION_Y, ISO_X, ISO_Y } from '../iso';

export const DEPTH_RANGE = 48;

export const isoProjection = (cam: Camera): Float32Array => {
  const ex = ISO_X * cam.zoom;
  const ey = ISO_Y * cam.zoom;
  const ez = ELEVATION_Y * cam.zoom;
  const w = cam.width;
  const h = cam.height;
  const a = w / 2 + cam.offset.x + cam.shake.x - cam.center.x * ex + cam.center.y * ex;
  const b = h / 2 + cam.offset.y + cam.shake.y - cam.center.y * ey - cam.center.x * ey;
  const d = -1 / DEPTH_RANGE;
  return new Float32Array([
    (2 * ex) / w, (-2 * ey) / h, d, 0,
    (-2 * ex) / w, (-2 * ey) / h, d, 0,
    0, (2 * ez) / h, d, 0,
    (2 * a) / w - 1, 1 - (2 * b) / h, 0, 1,
  ]);
};
