
import type { Rect } from './layout';

export const UI_DISPLAY_FONT = 'Georgia, "Times New Roman", serif';

export const UI_TEXT_FONT = 'Georgia, "Times New Roman", serif';

export const drawDiamond = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  filled = false,
): void => {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.lineTo(x + radius, y);
  ctx.lineTo(x, y + radius);
  ctx.lineTo(x - radius, y);
  ctx.closePath();
  if (filled) ctx.fill();
  else ctx.stroke();
  ctx.restore();
};

export const drawOrnamentalRule = (
  ctx: CanvasRenderingContext2D,
  left: number,
  right: number,
  y: number,
  color: string,
  alpha = 0.62,
): void => {
  if (right <= left) return;
  const centre = (left + right) / 2;
  const radius = Math.max(2, Math.min(4, (right - left) * 0.018));
  const gap = radius * 2.4;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(centre - gap, y);
  ctx.moveTo(centre + gap, y);
  ctx.lineTo(right, y);
  ctx.stroke();
  drawDiamond(ctx, centre, y, radius, color);
  ctx.restore();
};

export const drawOrnamentalFrame = (
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  color: string,
  alpha = 0.72,
): void => {
  const { x, y, w, h } = rect;
  const inset = Math.max(3, Math.min(6, Math.min(w, h) * 0.035));
  const tick = Math.max(5, Math.min(11, Math.min(w, h) * 0.07));

  ctx.save();
  const frameAlpha = ctx.globalAlpha * alpha;
  ctx.globalAlpha = frameAlpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
  ctx.globalAlpha = frameAlpha * 0.5;
  ctx.strokeRect(
    x + inset + 0.5,
    y + inset + 0.5,
    Math.max(0, w - inset * 2 - 1),
    Math.max(0, h - inset * 2 - 1),
  );

  ctx.globalAlpha = frameAlpha;
  ctx.beginPath();
  for (const [cx, cy, sx, sy] of [
    [x + inset, y + inset, 1, 1],
    [x + w - inset, y + inset, -1, 1],
    [x + inset, y + h - inset, 1, -1],
    [x + w - inset, y + h - inset, -1, -1],
  ] as const) {
    ctx.moveTo(cx, cy + sy * tick);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + sx * tick, cy);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + sx * tick * 0.42, cy + sy * tick * 0.42);
  }
  ctx.stroke();
  ctx.restore();
};

export const drawCrownMark = (
  ctx: CanvasRenderingContext2D,
  centreX: number,
  top: number,
  width: number,
  color: string,
  alpha = 1,
): Rect => {
  const height = width * 0.54;
  const left = centreX - width / 2;
  const baseY = top + height * 0.78;

  ctx.save();
  const markAlpha = ctx.globalAlpha * alpha;
  ctx.globalAlpha = markAlpha;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(left, top + height * 0.2);
  ctx.lineTo(left + width * 0.24, top + height * 0.56);
  ctx.lineTo(left + width * 0.42, top);
  ctx.lineTo(centreX, top + height * 0.5);
  ctx.lineTo(left + width * 0.72, top + height * 0.08);
  ctx.lineTo(left + width * 0.8, top + height * 0.56);
  ctx.lineTo(left + width, top + height * 0.24);
  ctx.lineTo(left + width * 0.9, baseY);
  ctx.lineTo(left + width * 0.12, baseY);
  ctx.closePath();
  ctx.globalAlpha = markAlpha * 0.28;
  ctx.fill();
  ctx.globalAlpha = markAlpha;
  ctx.stroke();

  ctx.globalAlpha = markAlpha * 0.34;
  ctx.beginPath();
  ctx.moveTo(left + width * 0.12, baseY);
  ctx.lineTo(left + width * 0.9, baseY);
  ctx.lineTo(left + width * 0.87, top + height);
  ctx.lineTo(left + width * 0.16, top + height);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = markAlpha;
  ctx.stroke();
  ctx.restore();

  return { x: left, y: top, w: width, h: height };
};
