
export const MAX_CATCHUP_MS = 250;

export interface FrameMeterReading {
  fps: number;
  frameMs: number;
  worstFrameMs: number;
  longFrames: number;
}

export class FrameMeter {
  private smoothedFps = 60;
  private latestFrameMs = 1000 / 60;
  private recentFramesMs = [1000 / 60];
  private recentDurationMs = 1000 / 60;

  sample(dtRealMs: number): FrameMeterReading {
    const frameMs = Math.max(1, dtRealMs);
    this.latestFrameMs = frameMs;
    this.smoothedFps = this.smoothedFps * 0.9 + (1000 / frameMs) * 0.1;
    this.recentFramesMs.push(frameMs);
    this.recentDurationMs += frameMs;
    while (
      this.recentFramesMs.length > 1 &&
      this.recentDurationMs - this.recentFramesMs[0] >= 1000
    ) {
      this.recentDurationMs -= this.recentFramesMs.shift() ?? 0;
    }

    return this.reading;
  }

  reset(): void {
    this.recentFramesMs = [this.latestFrameMs];
    this.recentDurationMs = this.latestFrameMs;
  }

  get reading(): FrameMeterReading {
    return {
      fps: this.smoothedFps,
      frameMs: this.latestFrameMs,
      worstFrameMs: Math.max(...this.recentFramesMs),
      longFrames: this.recentFramesMs.filter((frameMs) => frameMs > 25).length,
    };
  }
}

export class FrameClock {
  private pendingMs = 0;

  add(dtRealMs: number): void {
    this.pendingMs = Math.min(MAX_CATCHUP_MS, this.pendingMs + dtRealMs);
  }

  budget(tickMs: number, oneTick = false): number {
    return oneTick ? tickMs : this.pendingMs;
  }

  spend(ms: number): void {
    this.pendingMs -= ms;
  }

  clear(): void {
    this.pendingMs = 0;
  }

  get pending(): number {
    return this.pendingMs;
  }
}
