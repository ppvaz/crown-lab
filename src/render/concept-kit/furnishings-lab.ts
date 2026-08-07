import type { Palette } from '../palette';
import type { ConceptKitSpec } from '../../lab/concept-kit';
import { block, clothGradient, plinth, shadeHex, shape, type PropView } from './shape-lab';

export const FURNISHING_KINDS: ReadonlySet<ConceptKitSpec['kind']> = new Set([
  'empty_chair',
  'curtained_empty_chair',
  'laid_table',
  'ledger_table',
  'untouched_table',
  'bucket',
  'rain_bucket',
  'cart',
  'covered_cart',
  'keys_seals',
  'basket',
  'service_stair',
]);

export const drawFurnishing = (
  ctx: CanvasRenderingContext2D,
  view: PropView,
  pal: Palette,
  kind: ConceptKitSpec['kind'],
): void => {
  const { p, z, line, accent } = view;
  if (kind === 'empty_chair') {
    ctx.fillStyle = '#302531'; ctx.strokeStyle = accent; ctx.lineWidth = line;
    ctx.fillRect(p.x - 13 * z, p.y - 42 * z, 26 * z, 37 * z); ctx.strokeRect(p.x - 13 * z, p.y - 42 * z, 26 * z, 37 * z);
    ctx.fillStyle = '#4b3448'; ctx.fillRect(p.x - 17 * z, p.y - 13 * z, 34 * z, 11 * z);
  } else if (
    kind === 'laid_table' ||
    kind === 'ledger_table' ||
    kind === 'untouched_table'
  ) {
    const wood = '#3b2d29';
    block(ctx, { x: p.x, y: p.y - 20 * z }, z, 54, 7, 8, wood, accent, line);
    for (const x of [-20, 20]) {
      block(
        ctx,
        { x: p.x + x * z, y: p.y },
        z,
        7,
        22,
        3,
        shadeHex(wood, 0.76),
        accent,
        line,
      );
    }
    if (kind === 'untouched_table') {
      shape(ctx, [
        [p.x - 10 * z, p.y - 30 * z],
        [p.x + 7 * z, p.y - 34 * z],
        [p.x + 10 * z, p.y - 14 * z],
        [p.x - 7 * z, p.y - 10 * z],
      ], clothGradient(ctx, p.x, 20 * z, '#6c2d34'), accent, line);
    }
    ctx.fillStyle = kind === 'ledger_table' ? '#6b5740' : '#d2c8b0';
    for (const x of [-11, 10]) {
      ctx.beginPath();
      ctx.ellipse(p.x + x * z, p.y - 29 * z, 7 * z, 3 * z, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = shadeHex(accent, 0.82);
      ctx.stroke();
    }
    if (kind === 'ledger_table') {
      ctx.fillStyle = '#8d7048';
      ctx.fillRect(p.x - 12 * z, p.y - 34 * z, 18 * z, 10 * z);
      ctx.strokeStyle = accent;
      ctx.strokeRect(p.x - 12 * z, p.y - 34 * z, 18 * z, 10 * z);
    }
  } else if (kind === 'bucket' || kind === 'rain_bucket') {
    const rim = kind === 'rain_bucket' ? '#7fb0cb' : accent;
    shape(ctx, [
      [p.x - 13 * z, p.y - 23 * z],
      [p.x + 13 * z, p.y - 23 * z],
      [p.x + 9 * z, p.y],
      [p.x - 9 * z, p.y],
    ], shadeHex(pal.wall, 0.82), rim, line);
    ctx.fillStyle = kind === 'rain_bucket' ? '#496d82' : '#17161b';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 23 * z, 13 * z, 5 * z, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rim;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y - 17 * z, 17 * z, Math.PI, Math.PI * 2);
    ctx.stroke();
    if (kind === 'rain_bucket') {
      ctx.fillStyle = 'rgba(82, 137, 169, 0.28)';
      ctx.beginPath();
      ctx.ellipse(p.x + 5 * z, p.y + 1 * z, 23 * z, 6 * z, 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'cart' || kind === 'covered_cart') {
    const cartBody = '#302733';
    block(ctx, { x: p.x, y: p.y - 5 * z }, z, 50, 27, 7, cartBody, accent, line);
    if (kind === 'covered_cart') {
      shape(ctx, [
        [p.x - 23 * z, p.y - 31 * z],
        [p.x - 18 * z, p.y - 53 * z],
        [p.x + 17 * z, p.y - 53 * z],
        [p.x + 25 * z, p.y - 31 * z],
      ], clothGradient(ctx, p.x, 48 * z, '#423748'), accent, line);
      ctx.strokeStyle = 'rgba(205, 169, 86, 0.5)';
      for (const x of [-10, 6]) {
        ctx.beginPath();
        ctx.moveTo(p.x + x * z, p.y - 51 * z);
        ctx.lineTo(p.x + (x + 2) * z, p.y - 32 * z);
        ctx.stroke();
      }
    }
    for (const x of [-17, 17]) {
      ctx.fillStyle = '#17161c';
      ctx.beginPath();
      ctx.arc(p.x + x * z, p.y, 9 * z, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.stroke();
      for (let index = 0; index < 6; index += 1) {
        const angle = (index * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(p.x + x * z, p.y);
        ctx.lineTo(
          p.x + x * z + Math.cos(angle) * 7 * z,
          p.y + Math.sin(angle) * 7 * z,
        );
        ctx.stroke();
      }
    }
  } else if (kind === 'curtained_empty_chair') {
    plinth(ctx, p, z, pal.wall, accent, line, 40);
    ctx.strokeStyle = '#8d765b';
    ctx.lineWidth = 3 * line;
    for (const x of [-21, 21]) {
      ctx.beginPath();
      ctx.moveTo(p.x + x * z, p.y - 8 * z);
      ctx.lineTo(p.x + x * z, p.y - 67 * z);
      ctx.stroke();
    }
    shape(ctx, [
      [p.x - 24 * z, p.y - 67 * z],
      [p.x, p.y - 76 * z],
      [p.x + 24 * z, p.y - 67 * z],
      [p.x + 18 * z, p.y - 57 * z],
      [p.x - 18 * z, p.y - 57 * z],
    ], clothGradient(ctx, p.x, 48 * z, '#45334f'), '#9b719e', line);
    ctx.fillStyle = '#302531';
    ctx.fillRect(p.x - 12 * z, p.y - 38 * z, 24 * z, 25 * z);
    ctx.strokeStyle = accent;
    ctx.strokeRect(p.x - 12 * z, p.y - 38 * z, 24 * z, 25 * z);
    for (const side of [-1, 1]) {
      shape(ctx, [
        [p.x + side * 22 * z, p.y - 59 * z],
        [p.x + side * 10 * z, p.y - 52 * z],
        [p.x + side * 14 * z, p.y - 8 * z],
        [p.x + side * 25 * z, p.y - 3 * z],
      ], clothGradient(ctx, p.x + side * 17 * z, 14 * z, '#403047'), '#8d658f', line);
    }
  } else if (kind === 'keys_seals') {
    block(ctx, { x: p.x, y: p.y - 4 * z }, z, 44, 6, 8, '#4a352c', accent, line);
    for (const x of [-15, 15]) {
      block(
        ctx,
        { x: p.x + x * z, y: p.y },
        z,
        5,
        24,
        3,
        '#352720',
        '#201a1a',
        line,
      );
    }
    ctx.strokeStyle = '#d0a94f';
    ctx.lineWidth = 2 * z;
    for (const x of [-9, 2]) {
      ctx.beginPath();
      ctx.ellipse(p.x + x * z, p.y - 35 * z, 4 * z, 2.5 * z, -0.35, 0, Math.PI * 2);
      ctx.moveTo(p.x + (x + 3) * z, p.y - 33 * z);
      ctx.lineTo(p.x + (x + 13) * z, p.y - 27 * z);
      ctx.lineTo(p.x + (x + 10) * z, p.y - 24 * z);
      ctx.stroke();
    }
    ctx.fillStyle = '#873b39';
    ctx.beginPath();
    ctx.ellipse(p.x + 12 * z, p.y - 35 * z, 6 * z, 4 * z, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c5775f';
    ctx.stroke();
    ctx.fillStyle = '#2b2220';
    ctx.fillRect(p.x + 10.5 * z, p.y - 37 * z, 3 * z, 3 * z);
  } else if (kind === 'basket') {
    const weave = ctx.createLinearGradient(
      p.x - 21 * z,
      p.y,
      p.x + 21 * z,
      p.y,
    );
    weave.addColorStop(0, '#382a20');
    weave.addColorStop(0.25, '#8b6843');
    weave.addColorStop(0.58, '#5d432e');
    weave.addColorStop(0.8, '#9a7650');
    weave.addColorStop(1, '#3d2d23');
    shape(ctx, [
      [p.x - 21 * z, p.y - 14 * z],
      [p.x + 21 * z, p.y - 14 * z],
      [p.x + 16 * z, p.y],
      [p.x - 16 * z, p.y],
    ], weave, accent, line);
    ctx.fillStyle = '#3b2c22';
    ctx.strokeStyle = accent;
    ctx.lineWidth = line;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 14 * z, 21 * z, 7 * z, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#776048';
    for (const [x, y, r] of [[-9, -17, 5], [0, -19, 6], [10, -16, 5]] as const) {
      ctx.beginPath();
      ctx.arc(p.x + x * z, p.y + y * z, r * z, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#a58255';
    ctx.lineWidth = 3 * z;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 16 * z, 15 * z, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = line;
    for (const x of [-12, -4, 4, 12]) {
      ctx.beginPath();
      ctx.moveTo(p.x + x * z, p.y - 13 * z);
      ctx.lineTo(p.x + x * 0.78 * z, p.y - 1 * z);
      ctx.stroke();
    }
    for (const y of [-9, -4]) {
      ctx.beginPath();
      ctx.moveTo(p.x - 18 * z, p.y + y * z);
      ctx.lineTo(p.x + 18 * z, p.y + y * z);
      ctx.stroke();
    }
  } else if (kind === 'service_stair') {
    for (let index = 0; index < 4; index += 1) {
      block(
        ctx,
        {
          x: p.x - index * 2.5 * z,
          y: p.y - index * 9 * z,
        },
        z,
        43 - index * 6,
        9,
        7,
        index % 2 === 0 ? shadeHex(pal.wall, 0.88) : shadeHex(pal.wall, 0.7),
        accent,
        line,
      );
    }
    shape(ctx, [
      [p.x - 6 * z, p.y - 37 * z],
      [p.x + 5 * z, p.y - 37 * z],
      [p.x + 12 * z, p.y],
      [p.x - 1 * z, p.y],
    ], clothGradient(ctx, p.x + 3 * z, 18 * z, '#58373c'), '#7c4a4e', line);
    ctx.strokeStyle = '#76563d';
    ctx.lineWidth = 3 * z;
    ctx.beginPath();
    ctx.moveTo(p.x - 22 * z, p.y - 9 * z);
    ctx.lineTo(p.x - 16 * z, p.y - 49 * z);
    ctx.lineTo(p.x - 4 * z, p.y - 49 * z);
    ctx.stroke();
  }
};
