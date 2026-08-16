
export const WAVE_BANNER_MS = 2200;

export const WAVE_BANNER_FADE_MS = 600;

export class WaveBanner {
  private message: string | null = null;

  private remainingMs = 0;

  announce(message: string): void {
    this.message = message;
    this.remainingMs = WAVE_BANNER_MS;
  }

  update(dtRealMs: number): void {
    if (this.remainingMs <= 0) return;
    this.remainingMs = Math.max(0, this.remainingMs - dtRealMs);
    if (this.remainingMs === 0) this.message = null;
  }

  reset(): void {
    this.message = null;
    this.remainingMs = 0;
  }

  text(): string | null {
    return this.message;
  }

  opacity(): number {
    if (this.remainingMs <= 0) return 0;
    return Math.min(1, this.remainingMs / WAVE_BANNER_FADE_MS);
  }
}
