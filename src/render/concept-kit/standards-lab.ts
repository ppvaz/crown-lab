import type { Palette } from '../palette';
import type { ConceptKitSpec } from '../../lab/concept-kit';
import { clothGradient, plinth, shadeHex, shape, type PropView } from './shape-lab';

export const STANDARD_KINDS: ReadonlySet<ConceptKitSpec['kind']> = new Set([
  'bell_post',
  'standard',
  'torn_standard',
  'fallen_bell',
]);

export const drawStandard = (
  ctx: CanvasRenderingContext2D,
  view: PropView,
  pal: Palette,
  spec: ConceptKitSpec,
  kind: ConceptKitSpec['kind'],
): void => {
  const { p, z, line, accent } = view;
  if (kind === 'bell_post') {
    ctx.strokeStyle = pal.garment; ctx.lineWidth = 3 * line;
    ctx.beginPath(); ctx.moveTo(p.x - 15 * z, p.y); ctx.lineTo(p.x - 15 * z, p.y - 66 * z); ctx.lineTo(p.x + 15 * z, p.y - 66 * z); ctx.stroke();
    shape(ctx, [
      [p.x + 2 * z, p.y - 58 * z], [p.x + 22 * z, p.y - 58 * z],
      [p.x + 27 * z, p.y - 38 * z], [p.x - 3 * z, p.y - 38 * z],
    ], '#8b6335', accent, line);
  } else if (kind === 'standard' || kind === 'torn_standard') {
    plinth(ctx, { x: p.x - 12 * z, y: p.y }, z, pal.wall, accent, line, 18);
    ctx.strokeStyle = shadeHex(pal.garment, 1.16);
    ctx.lineWidth = 3 * line;
    ctx.beginPath();
    ctx.moveTo(p.x - 12 * z, p.y - 10 * z);
    ctx.lineTo(p.x - 12 * z, p.y - 83 * z);
    ctx.lineTo(p.x + 22 * z, p.y - 83 * z);
    ctx.stroke();
    shape(ctx, [
      [p.x - 12 * z, p.y - 94 * z],
      [p.x - 6 * z, p.y - 83 * z],
      [p.x - 18 * z, p.y - 83 * z],
    ], accent, shadeHex(accent, 1.22), line);
    const bottom = kind === 'torn_standard' ? p.y - 20 * z : p.y - 28 * z;
    const cloth = spec.accent === 'violet' ? '#4d2e5e' : '#692b31';
    shape(ctx, [
      [p.x - 8 * z, p.y - 77 * z], [p.x + 19 * z, p.y - 77 * z],
      [p.x + 16 * z, bottom], [p.x + 6 * z, bottom - 9 * z], [p.x - 8 * z, bottom],
    ], clothGradient(ctx, p.x + 5 * z, 30 * z, cloth), shadeHex(accent, 1.15), line);
    ctx.strokeStyle = 'rgba(225, 185, 100, 0.55)';
    ctx.lineWidth = line;
    for (const x of [-3, 8]) {
      ctx.beginPath();
      ctx.moveTo(p.x + x * z, p.y - 73 * z);
      ctx.lineTo(p.x + (x + 2) * z, bottom - 2 * z);
      ctx.stroke();
    }
    shape(ctx, [
      [p.x + 5 * z, p.y - 63 * z],
      [p.x + 11 * z, p.y - 51 * z],
      [p.x + 5 * z, p.y - 39 * z],
      [p.x - 1 * z, p.y - 51 * z],
    ], 'rgba(74, 43, 38, 0.5)', accent, line);
  } else if (kind === 'fallen_bell') {
    const bronze = '#795432';
    shape(ctx, [
      [p.x - 29 * z, p.y - 4 * z],
      [p.x + 19 * z, p.y - 16 * z],
      [p.x + 9 * z, p.y - 45 * z],
      [p.x - 22 * z, p.y - 33 * z],
    ], clothGradient(ctx, p.x, 50 * z, bronze), shadeHex(accent, 0.82), line);
    ctx.strokeStyle = shadeHex(bronze, 1.34);
    ctx.lineWidth = 4 * line;
    ctx.beginPath();
    ctx.moveTo(p.x - 28 * z, p.y - 5 * z);
    ctx.lineTo(p.x + 19 * z, p.y - 17 * z);
    ctx.stroke();
    ctx.fillStyle = '#3c2b22';
    ctx.beginPath();
    ctx.arc(p.x + 5 * z, p.y - 11 * z, 5 * z, 0, Math.PI * 2);
    ctx.fill();
    for (const [x, y] of [[-24, 1], [24, -2], [31, 2]] as const) {
      shape(ctx, [
        [p.x + (x - 5) * z, p.y + (y - 4) * z],
        [p.x + (x + 4) * z, p.y + (y - 6) * z],
        [p.x + (x + 6) * z, p.y + y * z],
      ], pal.wall, '#5d5a5f', line);
    }
  }
};
