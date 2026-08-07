import type { Palette } from '../palette';
import type { ConceptKitSpec } from '../../lab/concept-kit';
import { block, clothGradient, plinth, shadeHex, shape, type PropView } from './shape-lab';

export const HEARTH_KINDS: ReadonlySet<ConceptKitSpec['kind']> = new Set([
  'brazier',
  'ash_brazier',
  'candles',
  'votive_candles',
  'broom_lantern',
]);

export const drawHearthProp = (
  ctx: CanvasRenderingContext2D,
  view: PropView,
  pal: Palette,
  spec: ConceptKitSpec,
  kind: ConceptKitSpec['kind'],
  timeMs: number,
): void => {
  const { p, z, line, accent } = view;
  if (kind === 'brazier' || kind === 'ash_brazier') {
    plinth(ctx, p, z, pal.wall, accent, line, 32);
    shape(ctx, [
      [p.x - 16 * z, p.y - 18 * z],
      [p.x + 16 * z, p.y - 18 * z],
      [p.x + 11 * z, p.y - 34 * z],
      [p.x - 11 * z, p.y - 34 * z],
    ], shadeHex(pal.wall, 0.72), accent, line);
    ctx.fillStyle = '#17151a';
    ctx.strokeStyle = accent;
    ctx.lineWidth = line;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 34 * z, 13 * z, 5 * z, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (kind === 'ash_brazier') {
      ctx.fillStyle = 'rgba(142, 139, 135, 0.48)';
      ctx.beginPath();
      ctx.ellipse(p.x - 8 * z, p.y + 1 * z, 21 * z, 5 * z, -0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    const flame = 8 + Math.sin(timeMs / 170 + spec.at.x) * 2;
    if (kind !== 'ash_brazier') {
      const glow = ctx.createRadialGradient(
        p.x,
        p.y - 37 * z,
        1,
        p.x,
        p.y - 37 * z,
        28 * z,
      );
      glow.addColorStop(0, 'rgba(255, 194, 91, 0.34)');
      glow.addColorStop(1, 'rgba(255, 126, 42, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(p.x - 30 * z, p.y - 68 * z, 60 * z, 60 * z);
      shape(ctx, [[p.x, p.y - 34 * z], [p.x + 8 * z, p.y - 45 * z], [p.x + 2 * z, p.y - (52 + flame) * z], [p.x - 8 * z, p.y - 44 * z]], '#ed7c2e', '#ffc665', line);
    }
  } else if (kind === 'candles' || kind === 'votive_candles') {
    if (kind === 'votive_candles') {
      shape(ctx, [
        [p.x - 22 * z, p.y],
        [p.x - 22 * z, p.y - 43 * z],
        [p.x, p.y - 68 * z],
        [p.x + 22 * z, p.y - 43 * z],
        [p.x + 22 * z, p.y],
      ], shadeHex(pal.wall, 0.72), accent, line);
      shape(ctx, [
        [p.x - 14 * z, p.y - 5 * z],
        [p.x - 14 * z, p.y - 39 * z],
        [p.x, p.y - 56 * z],
        [p.x + 14 * z, p.y - 39 * z],
        [p.x + 14 * z, p.y - 5 * z],
      ], '#15131a', shadeHex(accent, 0.86), line);
      block(ctx, p, z, 34, 7, 4, pal.wall, accent, line);
    }
    const glow = ctx.createRadialGradient(
      p.x,
      p.y - 18 * z,
      1,
      p.x,
      p.y - 18 * z,
      32 * z,
    );
    glow.addColorStop(0, 'rgba(255, 205, 111, 0.36)');
    glow.addColorStop(1, 'rgba(255, 161, 70, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(p.x - 34 * z, p.y - 53 * z, 68 * z, 60 * z);
    for (let index = -1; index <= 1; index += 1) {
      const x = p.x + index * 9 * z;
      ctx.fillStyle = '#d8c8a2';
      ctx.fillRect(x - 2 * z, p.y - (12 + Math.abs(index) * 5) * z, 4 * z, 13 * z);
      ctx.fillStyle = '#ffc46b';
      ctx.beginPath();
      ctx.arc(x, p.y - (15 + Math.abs(index) * 5) * z, 3 * z, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'broom_lantern') {
    const glow = ctx.createRadialGradient(
      p.x + 12 * z,
      p.y - 19 * z,
      1,
      p.x + 12 * z,
      p.y - 19 * z,
      31 * z,
    );
    glow.addColorStop(0, 'rgba(255, 211, 113, 0.38)');
    glow.addColorStop(1, 'rgba(255, 174, 62, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x + 12 * z, p.y - 19 * z, 31 * z, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#765638';
    ctx.lineWidth = 5 * z;
    ctx.beginPath();
    ctx.moveTo(p.x - 20 * z, p.y);
    ctx.lineTo(p.x - 4 * z, p.y - 57 * z);
    ctx.stroke();
    shape(ctx, [
      [p.x - 29 * z, p.y],
      [p.x - 12 * z, p.y],
      [p.x - 15 * z, p.y - 20 * z],
      [p.x - 20 * z, p.y - 17 * z],
    ], clothGradient(ctx, p.x - 20 * z, 20 * z, '#7a6042'), '#b08a55', line);
    ctx.strokeStyle = '#473523';
    ctx.lineWidth = line;
    for (const x of [-25, -20, -15]) {
      ctx.beginPath();
      ctx.moveTo(p.x + x * z, p.y - 1 * z);
      ctx.lineTo(p.x + (x + 3) * z, p.y - 17 * z);
      ctx.stroke();
    }
    shape(ctx, [
      [p.x + 2 * z, p.y - 31 * z],
      [p.x + 19 * z, p.y - 31 * z],
      [p.x + 17 * z, p.y - 3 * z],
      [p.x + 4 * z, p.y - 3 * z],
    ], clothGradient(ctx, p.x + 11 * z, 19 * z, '#c78931'), '#f0c66d', line);
    ctx.strokeStyle = '#2e2926';
    ctx.lineWidth = 2 * z;
    ctx.strokeRect(p.x + 5 * z, p.y - 29 * z, 12 * z, 24 * z);
    ctx.beginPath();
    ctx.moveTo(p.x + 11 * z, p.y - 29 * z);
    ctx.lineTo(p.x + 11 * z, p.y - 5 * z);
    ctx.stroke();
  }
};
