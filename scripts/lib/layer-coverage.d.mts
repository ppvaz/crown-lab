
import type { PngImage } from './png.d.mts';

export interface Coverage {
  width: number;
  height: number;
  mask: Uint8Array;
}

export interface PartitionReport {
  covered: number;
  dropped: number;
  overlapped: number;
  outside: number;
  perimeter: number;
}

export interface RecomposeReport {
  compared: number;
  meanAbsError: number;
  maxAbsError: number;
  meanBase: number;
}

export function coverageOf(image: PngImage, threshold?: number): Coverage;

export function partitionReport(whole: Coverage, parts: Coverage[]): PartitionReport;

export function recomposeReport(
  whole: PngImage,
  statics: readonly PngImage[],
  shadow: PngImage,
  opts?: { opaque?: number },
): RecomposeReport;
