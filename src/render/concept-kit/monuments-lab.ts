import type { Palette } from '../palette';
import type { ConceptKitSpec } from '../../lab/concept-kit';
import { block, plinth, shadeHex, shape, type PropView } from './shape-lab';

export const MONUMENT_KINDS: ReadonlySet<ConceptKitSpec['kind']> = new Set([
  'obelisk',
  'plinth',
  'missing_object_plinth',
  'statue',
  'broken_statue',
  'memorial',
  'clock',
  'roll_of_names',
  'shield',
  'empty_frame',
]);

export const drawMonument = (
  ctx: CanvasRenderingContext2D,
  view: PropView,
  pal: Palette,
  kind: ConceptKitSpec['kind'],
): void => {
  const { p, z, line, accent } = view;
  if (kind === 'obelisk') {
    shape(ctx, [
      [p.x - 10 * z, p.y], [p.x + 10 * z, p.y],
      [p.x + 7 * z, p.y - 55 * z], [p.x, p.y - 67 * z], [p.x - 7 * z, p.y - 55 * z],
    ], pal.wall, accent, line);
    shape(ctx, [[p.x, p.y - 77 * z], [p.x + 8 * z, p.y - 67 * z], [p.x, p.y - 57 * z], [p.x - 8 * z, p.y - 67 * z]], accent, pal.garment, line);
  } else if (kind === 'plinth' || kind === 'missing_object_plinth') {
    plinth(ctx, p, z, pal.wall, accent, line, 38);
    block(
      ctx,
      { x: p.x, y: p.y - 16 * z },
      z,
      24,
      16,
      4,
      shadeHex(pal.wall, 0.82),
      accent,
      line,
    );
    if (kind === 'missing_object_plinth') {
      ctx.save();
      ctx.setLineDash([4 * z, 4 * z]);
      ctx.strokeStyle = 'rgba(180, 174, 166, 0.45)';
      ctx.beginPath();
      ctx.moveTo(p.x - 8 * z, p.y - 36 * z);
      ctx.lineTo(p.x - 5 * z, p.y - 52 * z);
      ctx.lineTo(p.x + 7 * z, p.y - 47 * z);
      ctx.lineTo(p.x + 8 * z, p.y - 35 * z);
      ctx.stroke();
      ctx.restore();
    }
  } else if (kind === 'statue' || kind === 'broken_statue') {
    plinth(ctx, p, z, pal.wall, accent, line, 38);
    shape(ctx, [
      [p.x - 13 * z, p.y - 55 * z], [p.x + 10 * z, p.y - 51 * z],
      [p.x + 8 * z, p.y - 17 * z], [p.x - 10 * z, p.y - 17 * z],
    ], shadeHex(pal.garment, 0.72), accent, line);
    shape(ctx, [
      [p.x - 13 * z, p.y - 55 * z],
      [p.x - 2 * z, p.y - 62 * z],
      [p.x + 10 * z, p.y - 51 * z],
      [p.x + 2 * z, p.y - 36 * z],
    ], shadeHex(pal.garment, 1.12), accent, line);
    ctx.fillStyle = shadeHex(pal.garment, 0.86);
    ctx.beginPath();
    ctx.arc(p.x - 1 * z, p.y - 67 * z, 7 * z, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.stroke();
    if (kind === 'broken_statue') {
      ctx.fillStyle = pal.floor;
      shape(ctx, [
        [p.x - 4 * z, p.y - 76 * z],
        [p.x + 16 * z, p.y - 68 * z],
        [p.x + 7 * z, p.y - 48 * z],
        [p.x - 1 * z, p.y - 54 * z],
      ], pal.floor, pal.floor, 0);
      for (const [x, y, scale] of [[18, -2, 1], [28, 1, 0.72], [-20, 1, 0.62]] as const) {
        shape(ctx, [
          [p.x + (x - 7 * scale) * z, p.y + (y - 5 * scale) * z],
          [p.x + (x + 5 * scale) * z, p.y + (y - 8 * scale) * z],
          [p.x + (x + 8 * scale) * z, p.y + y * z],
        ], shadeHex(pal.garment, 0.78), accent, line);
      }
    }
  } else if (kind === 'memorial') {
    plinth(ctx, p, z, pal.wall, accent, line, 42);
    block(
      ctx,
      { x: p.x, y: p.y - 16 * z },
      z,
      34,
      49,
      5,
      shadeHex(pal.wall, 0.88),
      accent,
      line,
    );
    shape(ctx, [
      [p.x - 12 * z, p.y - 58 * z],
      [p.x + 12 * z, p.y - 58 * z],
      [p.x + 12 * z, p.y - 24 * z],
      [p.x - 12 * z, p.y - 24 * z],
    ], shadeHex(pal.wall, 0.64), shadeHex(accent, 1.08), line);
    shape(ctx, [[p.x, p.y - 53 * z], [p.x + 7 * z, p.y - 41 * z], [p.x, p.y - 28 * z], [p.x - 7 * z, p.y - 41 * z]], pal.floor, accent, line);
    ctx.strokeStyle = 'rgba(216, 198, 151, 0.38)';
    for (const y of [-49, -34]) {
      ctx.beginPath();
      ctx.moveTo(p.x - 9 * z, p.y + y * z);
      ctx.lineTo(p.x + 9 * z, p.y + y * z);
      ctx.stroke();
    }
  } else if (kind === 'clock') {
    plinth(ctx, p, z, pal.wall, accent, line, 32);
    block(
      ctx,
      { x: p.x, y: p.y - 16 * z },
      z,
      24,
      51,
      5,
      shadeHex(pal.wall, 0.82),
      accent,
      line,
    );
    shape(ctx, [
      [p.x - 12 * z, p.y - 67 * z],
      [p.x, p.y - 82 * z],
      [p.x + 12 * z, p.y - 67 * z],
    ], shadeHex(pal.wall, 1.08), accent, line);
    ctx.fillStyle = '#17161b';
    ctx.beginPath();
    ctx.arc(p.x, p.y - 58 * z, 8 * z, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 58 * z);
    ctx.lineTo(p.x, p.y - 64 * z);
    ctx.moveTo(p.x, p.y - 58 * z);
    ctx.lineTo(p.x + 5 * z, p.y - 55 * z);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 45 * z);
    ctx.lineTo(p.x, p.y - 25 * z);
    ctx.stroke();
    ctx.fillStyle = '#a77a3e';
    ctx.beginPath();
    ctx.arc(p.x, p.y - 23 * z, 3 * z, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'roll_of_names') {
    plinth(ctx, p, z, pal.wall, accent, line, 58);
    block(
      ctx,
      { x: p.x, y: p.y - 15 * z },
      z,
      54,
      43,
      5,
      shadeHex(pal.wall, 0.76),
      accent,
      line,
    );
    for (const y of [-47, -31]) {
      for (const x of [-18, -6, 6, 18]) {
        shape(ctx, [
          [p.x + (x - 4) * z, p.y + (y - 1) * z],
          [p.x + x * z, p.y + (y - 6) * z],
          [p.x + (x + 4) * z, p.y + (y - 1) * z],
          [p.x + (x + 3) * z, p.y + (y + 7) * z],
          [p.x + (x - 3) * z, p.y + (y + 7) * z],
        ], '#24222a', shadeHex(accent, 0.88), line);
      }
    }
  } else if (kind === 'shield') {
    plinth(ctx, p, z, pal.wall, accent, line, 44);
    shape(ctx, [
      [p.x - 20 * z, p.y - 59 * z],
      [p.x + 20 * z, p.y - 59 * z],
      [p.x + 16 * z, p.y - 28 * z],
      [p.x, p.y - 10 * z],
      [p.x - 16 * z, p.y - 28 * z],
    ], shadeHex(pal.wall, 0.74), shadeHex(accent, 1.1), 3 * line);
    shape(ctx, [
      [p.x - 14 * z, p.y - 53 * z],
      [p.x + 14 * z, p.y - 53 * z],
      [p.x + 11 * z, p.y - 31 * z],
      [p.x, p.y - 17 * z],
      [p.x - 11 * z, p.y - 31 * z],
    ], shadeHex(pal.wall, 1.02), shadeHex(accent, 0.72), line);
    shape(ctx, [
      [p.x, p.y - 48 * z],
      [p.x + 8 * z, p.y - 35 * z],
      [p.x, p.y - 21 * z],
      [p.x - 8 * z, p.y - 35 * z],
    ], '#24212a', accent, line);
  } else if (kind === 'empty_frame') {
    plinth(ctx, p, z, pal.wall, accent, line, 46);
    block(
      ctx,
      { x: p.x, y: p.y - 16 * z },
      z,
      40,
      48,
      5,
      shadeHex(pal.wall, 0.72),
      accent,
      line,
    );
    ctx.fillStyle = '#26252a';
    ctx.strokeStyle = shadeHex(accent, 1.18);
    ctx.lineWidth = 4 * line;
    ctx.fillRect(p.x - 14 * z, p.y - 57 * z, 28 * z, 34 * z);
    ctx.strokeRect(p.x - 14 * z, p.y - 57 * z, 28 * z, 34 * z);
    ctx.fillStyle = 'rgba(205, 194, 170, 0.28)';
    ctx.fillRect(p.x - 10 * z, p.y - 34 * z, 9 * z, 7 * z);
  }
};
