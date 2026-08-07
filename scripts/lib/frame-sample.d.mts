
export interface FrameSample {
  n: number;
  mean: number;
  p95: number;
}

export interface TierTimings {
  means: number[];
  p95s: number[];
  fpss: number[];
}

export interface TimingEstimate {
  mean: number;
  p95: number;
  fps: number;
  spread: number;
}

export function summarizeFrames(frames: readonly number[]): FrameSample | null;

export function estimateTiming(record: TierTimings | undefined): TimingEstimate | null;
