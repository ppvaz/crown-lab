
import type { Rect } from './layout';
import type { Palette } from './palette';
import { drawOrnamentalFrame, UI_TEXT_FONT } from './ui-ornaments';

export const hits = (rect: Rect, at: { x: number; y: number }): boolean =>
  at.x >= rect.x && at.x <= rect.x + rect.w && at.y >= rect.y && at.y <= rect.y + rect.h;

export interface OverlayButtonOptions {
  label: string;
  size: number;
  lit?: boolean;
  hover?: boolean;
}

export const drawOverlayButton = (
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  pal: Palette,
  opts: OverlayButtonOptions,
): void => {
  const lit = opts.lit ?? true;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = lit ? 1 : 0.38;
  if (lit && opts.hover === true) {
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = pal.playerAccent;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.globalAlpha = 1;
  }
  drawOrnamentalFrame(ctx, rect, lit ? pal.playerAccent : pal.hudDim, lit ? 0.9 : 0.5);
  ctx.fillStyle = lit ? pal.hudText : pal.hudDim;
  ctx.font = `${opts.size}px ${UI_TEXT_FONT}`;
  ctx.fillText(opts.label, rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.restore();
};
