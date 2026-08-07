import type { Palette } from '../palette';
import type { ConceptKitSpec } from '../../lab/concept-kit';
import { block, clothGradient, plinth, shadeHex, shape, type PropView } from './shape-lab';

export const ARMS_KINDS: ReadonlySet<ConceptKitSpec['kind']> = new Set([
  'sword',
  'mounted_sword',
  'weapon_rack',
  'barricade',
  'barred_door',
  'bound_pikes',
  'breached_plaster',
]);

export const drawArmsProp = (
  ctx: CanvasRenderingContext2D,
  view: PropView,
  pal: Palette,
  kind: ConceptKitSpec['kind'],
): void => {
  const { p, z, line, accent } = view;
  if (kind === 'sword' || kind === 'mounted_sword') {
    if (kind === 'mounted_sword') {
      block(ctx, p, z, 18, 12, 4, pal.wall, accent, line);
    }
    const tipX = p.x + 12 * z;
    const tipY = p.y - 69 * z;
    shape(ctx, [
      [p.x - 16 * z, p.y - 2 * z],
      [p.x - 10 * z, p.y - 1 * z],
      [tipX + 3 * z, tipY + 5 * z],
      [tipX, tipY],
      [tipX - 3 * z, tipY + 7 * z],
    ], shadeHex(pal.garment, 1.38), '#b9b3aa', line);
    ctx.strokeStyle = '#8c643d';
    ctx.lineWidth = 5 * line;
    ctx.beginPath();
    ctx.moveTo(p.x - 18 * z, p.y);
    ctx.lineTo(p.x - 9 * z, p.y - 20 * z);
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4 * line;
    ctx.beginPath();
    ctx.moveTo(p.x - 16 * z, p.y - 25 * z);
    ctx.lineTo(p.x + 7 * z, p.y - 13 * z);
    ctx.stroke();
  } else if (kind === 'weapon_rack') {
    ctx.strokeStyle = pal.garment; ctx.lineWidth = 2 * line;
    ctx.beginPath(); ctx.moveTo(p.x - 22 * z, p.y); ctx.lineTo(p.x - 22 * z, p.y - 48 * z); ctx.moveTo(p.x + 22 * z, p.y); ctx.lineTo(p.x + 22 * z, p.y - 48 * z); ctx.moveTo(p.x - 27 * z, p.y - 33 * z); ctx.lineTo(p.x + 27 * z, p.y - 33 * z); ctx.stroke();
    for (const x of [-14, 0, 14]) { ctx.beginPath(); ctx.moveTo(p.x + x * z, p.y - 5 * z); ctx.lineTo(p.x + x * z, p.y - 68 * z); ctx.stroke(); }
  } else if (kind === 'barricade') {
    block(ctx, p, z, 48, 46, 5, '#2e2728', '#5d5050', line);
    ctx.strokeStyle = '#704d31';
    ctx.lineWidth = 9 * z;
    ctx.beginPath();
    ctx.moveTo(p.x - 24 * z, p.y - 6 * z);
    ctx.lineTo(p.x + 23 * z, p.y - 43 * z);
    ctx.moveTo(p.x - 22 * z, p.y - 43 * z);
    ctx.lineTo(p.x + 24 * z, p.y - 7 * z);
    ctx.stroke();
    ctx.fillStyle = '#b08b4e';
    for (const [x, y] of [[-15, -14], [15, -14], [-15, -36], [15, -36]] as const) {
      ctx.beginPath();
      ctx.arc(p.x + x * z, p.y + y * z, 2 * z, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'barred_door') {
    shape(ctx, [
      [p.x - 25 * z, p.y],
      [p.x - 25 * z, p.y - 45 * z],
      [p.x, p.y - 74 * z],
      [p.x + 25 * z, p.y - 45 * z],
      [p.x + 25 * z, p.y],
    ], shadeHex(pal.wall, 0.76), accent, line);
    shape(ctx, [
      [p.x - 16 * z, p.y - 5 * z],
      [p.x - 16 * z, p.y - 42 * z],
      [p.x, p.y - 61 * z],
      [p.x + 16 * z, p.y - 42 * z],
      [p.x + 16 * z, p.y - 5 * z],
    ], '#211a1b', shadeHex(accent, 0.72), line);
    ctx.strokeStyle = '#4a3430';
    ctx.lineWidth = 2 * line;
    for (const x of [-10, 0, 10]) {
      ctx.beginPath();
      ctx.moveTo(p.x + x * z, p.y - 5 * z);
      ctx.lineTo(p.x + x * z, p.y - 49 * z);
      ctx.stroke();
    }
    ctx.strokeStyle = '#6e3d37';
    ctx.lineWidth = 8 * z;
    ctx.beginPath();
    ctx.moveTo(p.x - 17 * z, p.y - 47 * z);
    ctx.lineTo(p.x + 17 * z, p.y - 11 * z);
    ctx.moveTo(p.x + 17 * z, p.y - 47 * z);
    ctx.lineTo(p.x - 17 * z, p.y - 11 * z);
    ctx.stroke();
  } else if (kind === 'bound_pikes') {
    plinth(ctx, p, z, shadeHex(pal.wall, 0.78), accent, line, 31);
    ctx.strokeStyle = '#684f37';
    ctx.lineWidth = 4 * z;
    for (const [x, lean] of [[-9, -5], [0, 1], [9, 6]] as const) {
      ctx.beginPath();
      ctx.moveTo(p.x + x * z, p.y - 15 * z);
      ctx.lineTo(p.x + (x + lean) * z, p.y - 65 * z);
      ctx.stroke();
      const tipX = p.x + (x + lean) * z;
      shape(ctx, [
        [tipX, p.y - 76 * z],
        [tipX + 6 * z, p.y - 64 * z],
        [tipX, p.y - 60 * z],
        [tipX - 5 * z, p.y - 64 * z],
      ], shadeHex(pal.garment, 1.18), '#29252b', line);
    }
    ctx.strokeStyle = '#926c43';
    ctx.lineWidth = 7 * z;
    ctx.beginPath();
    ctx.moveTo(p.x - 14 * z, p.y - 38 * z);
    ctx.lineTo(p.x + 14 * z, p.y - 35 * z);
    ctx.stroke();
    ctx.strokeStyle = '#3a2c24';
    ctx.lineWidth = 1.5 * z;
    for (const offset of [-4, 0, 4]) {
      ctx.beginPath();
      ctx.moveTo(p.x - 14 * z, p.y + (-38 + offset) * z);
      ctx.lineTo(p.x + 14 * z, p.y + (-35 + offset) * z);
      ctx.stroke();
    }
  } else if (kind === 'breached_plaster') {
    block(
      ctx,
      p,
      z,
      43,
      52,
      6,
      shadeHex(pal.wall, 0.64),
      '#302a29',
      line,
    );
    ctx.strokeStyle = '#372c29';
    ctx.lineWidth = line;
    for (const y of [-43, -31, -19, -7]) {
      ctx.beginPath();
      ctx.moveTo(p.x - 21 * z, p.y + y * z);
      ctx.lineTo(p.x + 21 * z, p.y + y * z);
      ctx.stroke();
    }
    for (const [x, y0, y1] of [
      [-8, -52, -43], [10, -43, -31], [-13, -31, -19], [7, -19, -7], [-5, -7, 0],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(p.x + x * z, p.y + y0 * z);
      ctx.lineTo(p.x + x * z, p.y + y1 * z);
      ctx.stroke();
    }
    shape(ctx, [
      [p.x - 21 * z, p.y - 52 * z],
      [p.x + 15 * z, p.y - 52 * z],
      [p.x + 9 * z, p.y - 43 * z],
      [p.x + 15 * z, p.y - 34 * z],
      [p.x + 6 * z, p.y - 27 * z],
      [p.x + 11 * z, p.y - 17 * z],
      [p.x + 3 * z, p.y - 8 * z],
      [p.x + 8 * z, p.y],
      [p.x - 21 * z, p.y],
    ], clothGradient(ctx, p.x - 4 * z, 34 * z, '#756958'), '#a28e70', line);
    ctx.strokeStyle = '#252127';
    ctx.lineWidth = 1.4 * z;
    ctx.beginPath();
    ctx.moveTo(p.x + 8 * z, p.y - 42 * z);
    ctx.lineTo(p.x - 1 * z, p.y - 35 * z);
    ctx.lineTo(p.x + 4 * z, p.y - 28 * z);
    ctx.lineTo(p.x - 3 * z, p.y - 20 * z);
    ctx.stroke();
  }
};
