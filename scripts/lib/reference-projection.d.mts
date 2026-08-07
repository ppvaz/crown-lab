
export interface FittedLine {
  nx: number;
  ny: number;
  c: number;
}

export interface MeasuredRun {
  slope: number;
  halves: [number, number];
  drift: number;
  rms: number;
  worst: number;
  samples: number;
  rejected: number;
  line: FittedLine;
  inliers: [number, number][];
}

export interface ProjectionReport {
  ratio: number;
  expected: number;
  deviation: number;
  asymmetry: number;
  worstDrift: number;
}

export interface ProjectionVerdict {
  ratioOk: boolean;
  parallelOk: boolean;
  readableForGeometry: boolean;
}

export function silhouetteBottom(
  at: (x: number, y: number) => [number, number, number],
  width: number,
  height: number,
  opts?: { voidLuminance?: number },
): [number, number][];

export function measureRuns(
  points: [number, number][],
  runs: Record<string, { x0: number; x1: number }>,
  opts?: { tolerance?: number },
): Record<string, MeasuredRun>;

export function projectionReport(
  measured: Record<string, { slope: number; drift: number }>,
  projection: { isoX: number; isoY: number },
): ProjectionReport;

export function projectionVerdict(
  report: ProjectionReport,
  opts?: { ratioTolerance?: number; driftTolerance?: number },
): ProjectionVerdict;
