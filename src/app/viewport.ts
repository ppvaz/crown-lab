
import type { Insets } from '../render/layout';

const ZERO: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

export const canvasRenderScale = (devicePixelRatio: number): number =>
  Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;

export const resizeCanvasBackingStore = (
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  cssWidth: number,
  cssHeight: number,
  scale: number,
): void => {
  canvas.width = Math.round(cssWidth * scale);
  canvas.height = Math.round(cssHeight * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
};

export const readSafeAreaInsets = (): Insets => {
  if (
    typeof document === 'undefined' ||
    typeof document.createElement !== 'function' ||
    typeof document.body?.appendChild !== 'function'
  ) {
    return ZERO;
  }
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);' +
    'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const style = window.getComputedStyle?.(probe);
  const read = (value: string | undefined): number => {
    const parsed = Number.parseFloat(value ?? '0');
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const insets: Insets = {
    top: read(style?.paddingTop),
    right: read(style?.paddingRight),
    bottom: read(style?.paddingBottom),
    left: read(style?.paddingLeft),
  };
  probe.remove();
  return insets;
};
