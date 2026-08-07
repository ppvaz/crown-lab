
import type { PngImage } from './png.d.mts';

export interface DerivedShadowLayer {
  width: number;
  height: number;
  rgba: Uint8Array;
  covered: number;
  darkened: number;
  clamped: number;
  meanFactor: number;
}

export function deriveShadowLayer(
  whole: PngImage,
  statics: readonly PngImage[],
  opts?: { darkeningThreshold?: number },
): DerivedShadowLayer;
