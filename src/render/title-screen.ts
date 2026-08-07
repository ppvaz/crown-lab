
import type { LayoutFrame, Rect } from './layout';
import type { Palette } from './palette';
import { drawOrnamentalFrame, drawOrnamentalRule, UI_DISPLAY_FONT } from './ui-ornaments';
import { drawOverlayButton } from './overlay-controls';

export const crossThresholdAtBoot = (search: string): boolean => {
  const params = new URLSearchParams(search);
  if (!params.has('play')) return false;
  const value = params.get('play')?.trim().toLowerCase() ?? '';
  return value === '' || value === '1' || value === 'on' || value === 'true';
};

export const thresholdFromSearch = (search: string): boolean => {
  const params = new URLSearchParams(search);
  if (!params.has('threshold')) return false;
  const value = params.get('threshold')?.trim().toLowerCase() ?? '';
  return value === '' || value === '1' || value === 'on' || value === 'true';
};

export interface TitleLayout {
  panel: Rect;
  play: Rect;
  tutorial: Rect;
}

export const titleLayout = (frame: LayoutFrame): TitleLayout => {
  const { content, type } = frame;
  const width = Math.min(content.w * 0.72, 460);
  const height = Math.min(content.h * 0.34, 190);
  const panel: Rect = {
    x: content.x + (content.w - width) / 2,
    y: content.y + content.h * 0.52 - height / 2,
    w: width,
    h: height,
  };
  const playHeight = Math.max(44, type.large * 2.2);
  const playWidth = Math.min(width * 0.62, 260);
  const tutorialHeight = Math.max(40, type.base * 2);
  const gap = type.small * 0.7;
  const x = panel.x + (panel.w - playWidth) / 2;
  const tutorialY = panel.y + panel.h - tutorialHeight - type.base;
  return {
    panel,
    play: { x, y: tutorialY - gap - playHeight, w: playWidth, h: playHeight },
    tutorial: { x, y: tutorialY, w: playWidth, h: tutorialHeight },
  };
};

export interface TitleScreenOptions {
  title: string;
  ready: boolean;
  hover: boolean;
  hoverTutorial: boolean;
}

export const drawTitleScreen = (
  ctx: CanvasRenderingContext2D,
  frame: LayoutFrame,
  pal: Palette,
  opts: TitleScreenOptions,
): void => {
  const { panel, play, tutorial } = titleLayout(frame);
  const { type } = frame;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.globalAlpha = 0.82;
  ctx.fillStyle = pal.floor;
  ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
  ctx.globalAlpha = 1;
  drawOrnamentalFrame(ctx, panel, pal.playerAccent);

  const titleY = panel.y - type.display * 0.9;
  ctx.fillStyle = pal.playerAccent;
  ctx.font = `${type.display}px ${UI_DISPLAY_FONT}`;
  ctx.fillText(opts.title, panel.x + panel.w / 2, titleY);
  drawOrnamentalRule(ctx, panel.x, panel.x + panel.w, titleY + type.display * 0.72, pal.playerAccent);

  drawOverlayButton(ctx, play, pal, {
    label: 'PLAY',
    size: type.large,
    lit: opts.ready,
    hover: opts.hover,
  });
  drawOverlayButton(ctx, tutorial, pal, {
    label: 'TRAINING YARD',
    size: type.base,
    lit: opts.ready,
    hover: opts.hoverTutorial,
  });
  ctx.restore();
};
