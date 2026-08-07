
import type { LayoutFrame, Rect } from './layout';
import type { Palette } from './palette';
import { drawOrnamentalRule, UI_DISPLAY_FONT, UI_TEXT_FONT } from './ui-ornaments';
import { drawOverlayButton } from './overlay-controls';
import type { HeavyGroupId } from './heavy-assets';

export interface HeavyOffer {
  id: HeavyGroupId;
  label: string;
  bytes: number;
}

export const sizeLabel = (bytes: number): string => {
  const mb = bytes / 1_000_000;
  if (mb >= 10) return `${Math.round(mb)} MB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
};

export interface HeavyPromptLayout {
  panel: Rect;
  offers: readonly { id: HeavyGroupId; rect: Rect }[];
  confirm: Rect;
  cancel: Rect;
}

const ROW = (frame: LayoutFrame): number => Math.max(40, frame.type.base * 2.1);

export const heavyPromptLayout = (
  frame: LayoutFrame,
  offers: readonly HeavyOffer[],
): HeavyPromptLayout => {
  const { content, type } = frame;
  const width = Math.min(content.w * 0.72, 420);
  const row = ROW(frame);
  const gap = type.small * 0.7;
  const rows = Math.max(offers.length, 2);
  const height = type.base * 5 + rows * (row + gap);
  const panel: Rect = {
    x: content.x + (content.w - width) / 2,
    y: content.y + content.h * 0.5 - height / 2,
    w: width,
    h: height,
  };
  const inner = Math.min(width - type.base * 3, 300);
  const left = panel.x + (panel.w - inner) / 2;
  const top = panel.y + type.base * 4;
  return {
    panel,
    offers: offers.map((offer, i) => ({
      id: offer.id,
      rect: { x: left, y: top + i * (row + gap), w: inner, h: row },
    })),
    confirm: { x: left, y: top, w: inner, h: row },
    cancel: { x: left, y: top + row + gap, w: inner, h: row },
  };
};

export interface HeavyPromptView {
  offers: readonly HeavyOffer[];
  confirming: HeavyOffer | null;
  loading: HeavyOffer | null;
  pointerAt: { x: number; y: number } | null;
}

const within = (rect: Rect, at: { x: number; y: number } | null): boolean =>
  at !== null && at.x >= rect.x && at.x <= rect.x + rect.w && at.y >= rect.y && at.y <= rect.y + rect.h;

export const drawHeavyPrompt = (
  ctx: CanvasRenderingContext2D,
  frame: LayoutFrame,
  pal: Palette,
  view: HeavyPromptView,
): void => {
  const layout = heavyPromptLayout(frame, view.offers);
  const { panel } = layout;
  const { type } = frame;
  const centreX = panel.x + panel.w / 2;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = pal.floor;
  ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
  ctx.globalAlpha = 1;

  const heading = view.loading !== null
    ? `DOWNLOADING ${view.loading.label.toUpperCase()}`
    : view.confirming !== null
      ? `${sizeLabel(view.confirming.bytes)} OVER THIS CONNECTION`
      : 'DATA SAVER';
  ctx.fillStyle = pal.playerAccent;
  ctx.font = `${type.small}px ${UI_DISPLAY_FONT}`;
  ctx.fillText(heading, centreX, panel.y + type.base * 1.4);
  drawOrnamentalRule(ctx, panel.x, panel.x + panel.w, panel.y + type.base * 2.2, pal.playerAccent);

  if (view.loading !== null) {
    ctx.fillStyle = pal.hudDim;
    ctx.font = `${type.small}px ${UI_TEXT_FONT}`;
    ctx.fillText('this happens once', centreX, panel.y + panel.h / 2);
    ctx.restore();
    return;
  }

  if (view.confirming !== null) {
    ctx.fillStyle = pal.hudDim;
    ctx.font = `${type.small}px ${UI_TEXT_FONT}`;
    ctx.fillText(`Download the ${view.confirming.label}?`, centreX, panel.y + type.base * 3);
    drawOverlayButton(ctx, layout.confirm, pal, {
      label: 'DOWNLOAD',
      size: type.base,
      hover: within(layout.confirm, view.pointerAt),
    });
    drawOverlayButton(ctx, layout.cancel, pal, {
      label: 'NOT NOW',
      size: type.base,
      hover: within(layout.cancel, view.pointerAt),
    });
    ctx.restore();
    return;
  }

  for (const [i, slot] of layout.offers.entries()) {
    const offer = view.offers[i];
    drawOverlayButton(ctx, slot.rect, pal, {
      label: `${offer.label.toUpperCase()} · ${sizeLabel(offer.bytes)}`,
      size: type.small,
      hover: within(slot.rect, view.pointerAt),
    });
  }
  ctx.restore();
};

export const drawHeavyLoading = (
  ctx: CanvasRenderingContext2D,
  frame: LayoutFrame,
  pal: Palette,
  label: string,
  simTimeMs: number,
): void => {
  const { content, type } = frame;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(simTimeMs / 420));
  ctx.fillStyle = pal.hudDim;
  ctx.font = `${type.small}px ${UI_TEXT_FONT}`;
  ctx.fillText(`downloading ${label}…`, content.x, content.y + content.h - type.small);
  ctx.restore();
};
