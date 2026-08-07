
import type { Palette } from './palette';
import type { Feat } from '../game/feats';
import type { Camera } from './iso';
import type { LayoutFrame, Rect } from './layout';
import { drawFittedText } from './text';
import { drawOverlayButton, hits } from './overlay-controls';
import { reportUiRect } from './ui-probe';
import {
  drawCrownMark,
  drawOrnamentalRule,
  UI_DISPLAY_FONT,
  UI_TEXT_FONT,
} from './ui-ornaments';

export const VICTORY_FADE_MS = 1500;

export interface VictoryFacts {
  attempts: number;
  escortAlive: boolean | null;
  feats: readonly Feat[];
}

export const victorySubtitle = (facts: VictoryFacts): string => {
  const attempt = facts.attempts <= 1 ? 'First attempt' : `${facts.attempts} attempts`;
  if (facts.escortAlive === null) return `${attempt} · walked alone`;
  return facts.escortAlive ? `${attempt} · Mara walked out with you` : `${attempt} · Mara did not`;
};

const featBox = (frame: LayoutFrame): { x: number; w: number } => {
  const { stick, cluster } = frame.reserved;
  if (frame.form !== 'landscape' || stick === null || cluster === null) return frame.content;
  const left = Math.max(frame.content.x, stick.x + stick.w);
  const right = Math.min(frame.content.x + frame.content.w, cluster.x);
  return { x: left, w: Math.max(0, right - left) };
};

export const drawVictory = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  frame: LayoutFrame,
  facts: VictoryFacts,
  elapsedMs: number,
): void => {
  const t = Math.max(0, Math.min(1, elapsedMs / VICTORY_FADE_MS));
  if (t <= 0) return;
  const eased = 1 - (1 - t) * (1 - t);
  const type = frame.type;
  const cx = cam.width / 2 + cam.offset.x;
  const cy = cam.height / 2 + cam.offset.y;



  const box = featBox(frame);
  const gap = type.base * 0.6;
  const centre = Math.min(Math.max(cx, box.x + box.w * 0.33), box.x + box.w * 0.67);
  const labelMax = centre - gap - box.x;
  const noteMax = box.x + box.w - (centre + gap);

  ctx.save();

  const wash = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(cam.width, cam.height) * 0.6);
  wash.addColorStop(0, `rgba(6, 5, 9, ${0.24 * eased})`);
  wash.addColorStop(1, `rgba(6, 5, 9, ${0.86 * eased})`);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, cam.width, cam.height);

  ctx.textAlign = 'center';
  ctx.globalAlpha = eased;

  const titleY = cy - type.base * 1.2;
  const ruleW = Math.min(cam.width * 0.32, 320) * eased;
  const ruleLeft = Math.max(box.x, cx - ruleW / 2);
  const ruleRight = Math.min(box.x + box.w, cx + ruleW / 2);
  ctx.globalAlpha = eased;
  for (const dy of [-type.base * 2.6, type.base * 2.4]) {
    drawOrnamentalRule(ctx, ruleLeft, ruleRight, titleY + dy, pal.playerAccent, 0.62);
  }
  const crownWidth = Math.min(box.w * 0.18, Math.max(42, type.base * 4.4));
  const emblem = drawCrownMark(
    ctx,
    Math.min(Math.max(cx, box.x + crownWidth / 2), box.x + box.w - crownWidth / 2),
    titleY - type.base * 5,
    crownWidth,
    pal.playerAccent,
    eased,
  );
  reportUiRect('victory.emblem', emblem.x, emblem.y, emblem.w, emblem.h);

  const centred = (id: 'victory.title' | 'victory.subtitle', text: string, at: number): void => {
    const width = Math.min(ctx.measureText(text).width, box.w);
    const half = width / 2;
    const x = Math.min(Math.max(cx, box.x + half), box.x + box.w - half);
    drawFittedText(ctx, id, text, box.w, x, at);
  };

  ctx.globalAlpha = eased;
  const title = 'THE CROWN IS YOURS';
  const desiredTitleSize = Math.round(type.base * 2.1);
  ctx.font = `${desiredTitleSize}px ${UI_DISPLAY_FONT}`;
  const naturalTitleWidth = ctx.measureText(title).width;
  const titleSize =
    naturalTitleWidth <= box.w
      ? desiredTitleSize
      : Math.max(type.base, Math.floor(desiredTitleSize * (box.w / naturalTitleWidth)));
  ctx.font = `${titleSize}px ${UI_DISPLAY_FONT}`;
  ctx.fillStyle = pal.playerAccent;
  centred('victory.title', title, titleY);

  ctx.font = `${type.base}px ${UI_TEXT_FONT}`;
  ctx.fillStyle = pal.hudText;
  centred('victory.subtitle', victorySubtitle(facts), titleY + type.base * 1.6);



  let row = 0;
  for (const feat of facts.feats) {
    const at = (elapsedMs - VICTORY_FADE_MS - row * 220) / 320;
    const appear = Math.max(0, Math.min(1, at));
    if (appear <= 0) break;
    const y = titleY + type.base * (4.4 + row * 1.55);
    const lift = (1 - appear) * 6;

    ctx.globalAlpha = appear * eased;
    ctx.font = `${type.base}px ${UI_DISPLAY_FONT}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = pal.playerAccent;
    drawFittedText(ctx, 'victory.feat.label', feat.label, labelMax, centre - gap, y + lift, feat.id);

    ctx.textAlign = 'left';
    ctx.font = `${type.small}px ${UI_TEXT_FONT}`;
    ctx.fillStyle = pal.hudDim;
    drawFittedText(ctx, 'victory.feat.note', feat.note, noteMax, centre + gap, y + lift, feat.id);
    row += 1;
  }

  ctx.restore();
};

export interface VictoryExitLayout {
  again: Rect;
  menu: Rect;
}

export const victoryExitLayout = (frame: LayoutFrame): VictoryExitLayout => {
  const box = featBox(frame);
  const { content, type } = frame;
  const height = Math.max(40, type.base * 2.1);
  const width = Math.min((box.w - type.base * 3) / 2, 190);
  const y = content.y + content.h - height - type.base * 1.4;
  const centre = box.x + box.w / 2;
  const gap = type.base * 0.75;
  return {
    again: { x: centre - gap - width, y, w: width, h: height },
    menu: { x: centre + gap, y, w: width, h: height },
  };
};

export const drawVictoryExits = (
  ctx: CanvasRenderingContext2D,
  frame: LayoutFrame,
  pal: Palette,
  opts: { elapsedMs: number; pointerAt: { x: number; y: number } | null; againLabel?: string },
): void => {
  if (opts.elapsedMs < VICTORY_FADE_MS * 2) return;
  const { again, menu } = victoryExitLayout(frame);
  const at = opts.pointerAt;
  ctx.save();
  ctx.globalAlpha = Math.min(1, (opts.elapsedMs - VICTORY_FADE_MS * 2) / 400);
  drawOverlayButton(ctx, again, pal, {
    label: opts.againLabel ?? 'NEW RUN',
    size: frame.type.base,
    hover: at !== null && hits(again, at),
  });
  drawOverlayButton(ctx, menu, pal, {
    label: 'MENU',
    size: frame.type.base,
    hover: at !== null && hits(menu, at),
  });
  ctx.restore();
};
