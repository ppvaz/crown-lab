
import type { UiElementId } from './ui-elements';
import type { LayoutFrame } from './layout';

export interface UiRect {
  id: UiElementId;
  instance?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontPx?: number;
  capPx?: number;
  text?: string;
  full?: string;
  t: number;
}

export type UiProbeSink = (rect: UiRect) => void;

let sink: UiProbeSink | null = null;
let reportedFrame: LayoutFrame | null = null;

export const reportUiFrame = (frame: LayoutFrame): void => {
  if (sink === null) return;
  reportedFrame = frame;
};

export const lastReportedFrame = (): LayoutFrame | null => reportedFrame;

export const setUiProbe = (next: UiProbeSink | null): void => {
  sink = next;
};

export const uiProbeActive = (): boolean => sink !== null;

const now = (): number =>
  typeof performance === 'undefined' ? 0 : performance.now();

export const reportUiRect = (
  id: UiElementId,
  x: number,
  y: number,
  w: number,
  h: number,
  instance?: string,
): void => {
  if (sink === null) return;
  sink({ id, instance, x, y, w, h, t: now() });
};

const FONT_PX = /(\d+(?:\.\d+)?)px/;

export const reportUiText = (
  ctx: CanvasRenderingContext2D,
  id: UiElementId,
  text: string,
  x: number,
  y: number,
  opts?: {
    instance?: string;
    full?: string;
  },
): void => {
  if (sink === null) return;

  const metrics = ctx.measureText(text);
  const fontPx = Number(FONT_PX.exec(ctx.font)?.[1] ?? 0);
  const ascent = metrics.actualBoundingBoxAscent;
  const descent = metrics.actualBoundingBoxDescent;
  const inked = typeof ascent === 'number' && typeof descent === 'number';
  const h = inked ? ascent + descent : fontPx * 0.72;
  const w = metrics.width;
  const capAscent = ctx.measureText('H').actualBoundingBoxAscent;
  const capPx = typeof capAscent === 'number' ? capAscent : undefined;

  const align = ctx.textAlign;
  const left = align === 'center' ? x - w / 2 : align === 'right' || align === 'end' ? x - w : x;

  const baseline = ctx.textBaseline;
  const top =
    baseline === 'top' || baseline === 'hanging'
      ? y
      : baseline === 'middle'
        ? y - h / 2
        : y - (inked ? ascent : h);

  sink({
    id,
    instance: opts?.instance,
    x: left,
    y: top,
    w,
    h,
    fontPx,
    capPx,
    text,
    full: opts?.full !== undefined && opts.full !== text ? opts.full : undefined,
    t: now(),
  });
};
