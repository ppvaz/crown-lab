
import type { LayoutFrame, Rect } from './layout';
import type { Palette } from './palette';
import { drawOrnamentalRule, UI_DISPLAY_FONT } from './ui-ornaments';
import { drawOverlayButton } from './overlay-controls';

export const pausePlateVisible = (state: {
  paused: boolean;
  instrumented: boolean;
}): boolean => state.paused && !state.instrumented;

export interface PauseLayout {
  panel: Rect;
  quit: Rect;
}

export const pauseLayout = (frame: LayoutFrame): PauseLayout => {
  const { content, type } = frame;
  const width = Math.min(content.w * 0.6, 380);
  const height = Math.min(content.h * 0.3, 168);
  const panel: Rect = {
    x: content.x + (content.w - width) / 2,
    y: content.y + content.h * 0.5 - height / 2,
    w: width,
    h: height,
  };
  const quitHeight = Math.max(42, type.base * 2.2);
  const quitWidth = Math.min(width * 0.6, 220);
  return {
    panel,
    quit: {
      x: panel.x + (panel.w - quitWidth) / 2,
      y: panel.y + panel.h - quitHeight - type.small,
      w: quitWidth,
      h: quitHeight,
    },
  };
};

export const drawPauseScreen = (
  ctx: CanvasRenderingContext2D,
  frame: LayoutFrame,
  pal: Palette,
  opts: { hover: boolean },
): void => {
  const { panel, quit } = pauseLayout(frame);
  const { type } = frame;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.globalAlpha = 0.55;
  ctx.fillStyle = pal.floor;
  ctx.fillRect(0, 0, frame.viewport.w, frame.viewport.h);
  ctx.globalAlpha = 1;

  const centreX = panel.x + panel.w / 2;
  ctx.fillStyle = pal.playerAccent;
  ctx.font = `${type.large}px ${UI_DISPLAY_FONT}`;
  ctx.fillText('PAUSED', centreX, panel.y + type.large);
  drawOrnamentalRule(ctx, panel.x, panel.x + panel.w, panel.y + type.large * 1.7, pal.playerAccent);

  drawOverlayButton(ctx, quit, pal, { label: 'QUIT', size: type.base, hover: opts.hover });
  ctx.restore();
};
