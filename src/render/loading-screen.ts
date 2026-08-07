
import type { LayoutFrame } from './layout';
import type { Palette } from './palette';
import { UI_TEXT_FONT } from './ui-ornaments';

export const drawLoadingScreen = (
  ctx: CanvasRenderingContext2D,
  frame: LayoutFrame,
  pal: Palette,
): void => {
  ctx.save();
  ctx.fillStyle = pal.floor;
  ctx.fillRect(0, 0, frame.viewport.w, frame.viewport.h);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.hudDim;
  ctx.font = `${frame.type.large}px ${UI_TEXT_FONT}`;
  ctx.fillText(
    'entering',
    frame.content.x + frame.content.w / 2,
    frame.content.y + frame.content.h / 2,
  );
  ctx.restore();
};
