
export interface PanelLine {
  nx: number;
  ny: number;
  c: number;
}

export interface RunFit {
  line: PanelLine;
  inliers: [number, number][];
  rejected: number;
  rms: number;
  worst: number;
}

export interface EdgeRuns {
  frontLeft: PanelLine;
  frontRight: PanelLine;
  backLeft: PanelLine;
  backRight: PanelLine;
}

export interface RunWindow {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  side: 'front' | 'back';
}

export type PixelAt = (x: number, y: number) => [number, number, number];

export function fitLine(points: [number, number][]): PanelLine;
export function lineDistance(line: PanelLine, point: [number, number]): number;
export function slopeOf(line: PanelLine): number;
export function intersect(a: PanelLine, b: PanelLine): [number, number];
export function fitRun(points: [number, number][], tolerance?: number): RunFit;
export function cornersFromRuns(runs: EdgeRuns): {
  left: [number, number];
  right: [number, number];
  far: [number, number];
  near: [number, number];
};
export function parallelism(runs: EdgeRuns): {
  frontLeftVsBackRight: number;
  frontRightVsBackLeft: number;
};
export function columnRidges(
  at: PixelAt,
  x: number,
  y0: number,
  y1: number,
  threshold?: number,
): { centre: number; thickness: number; peak: number }[];
export function sampleRun(
  at: PixelAt,
  window: RunWindow,
  opts?: { minPeak?: number; maxThickness?: number },
): [number, number][];
