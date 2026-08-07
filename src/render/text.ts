
import { reportUiText } from './ui-probe';
import type { UiElementId } from './ui-elements';

const FLOOR = 4;

export const fitText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string => {
  let out = text;
  while (out.length > FLOOR && ctx.measureText(out).width > maxWidth) {
    out = `${out.slice(0, out.length - 2).trimEnd()}…`;
  }
  return out;
};

export const wrapText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): { lines: string[]; overflowed: string | undefined } => {
  const lines: string[] = [];
  let rest = text;

  while (lines.length < maxLines - 1 && ctx.measureText(rest).width > maxWidth) {
    let cut = -1;
    for (let i = 0; i < rest.length; i += 1) {
      if (rest[i] !== ' ') continue;
      if (ctx.measureText(rest.slice(0, i)).width > maxWidth) break;
      cut = i;
    }
    if (cut <= 0) break;
    lines.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }

  const last = fitText(ctx, rest, maxWidth);
  lines.push(last);
  return { lines, overflowed: last === rest ? undefined : rest };
};

export const drawFittedText = (
  ctx: CanvasRenderingContext2D,
  id: UiElementId,
  text: string,
  maxWidth: number,
  x: number,
  y: number,
  instance?: string,
): string => {
  const fitted = fitText(ctx, text, maxWidth);
  ctx.fillText(fitted, x, y);
  reportUiText(ctx, id, fitted, x, y, { full: text, instance });
  return fitted;
};

export const drawFloatingLabel = (
  ctx: CanvasRenderingContext2D,
  id: UiElementId,
  text: string,
  box: { x: number; w: number },
  x: number,
  y: number,
  instance?: string,
): void => {
  const width = Math.min(ctx.measureText(text).width, box.w);
  const half = width / 2;
  const clamped = Math.min(Math.max(x, box.x + half), box.x + box.w - half);
  drawFittedText(ctx, id, text, box.w, clamped, y, instance);
};

export const drawWrappedText = (
  ctx: CanvasRenderingContext2D,
  id: UiElementId,
  text: string,
  maxWidth: number,
  maxLines: number,
  x: number,
  rowY: (index: number) => number,
): string[] => {
  const { lines, overflowed } = wrapText(ctx, text, maxWidth, maxLines);
  lines.forEach((line, i) => {
    const y = rowY(i);
    ctx.fillText(line, x, y);
    reportUiText(ctx, id, line, x, y, {
      instance: `row${i}`,
      full: i === lines.length - 1 ? overflowed : undefined,
    });
  });
  return lines;
};
