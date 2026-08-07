
export class HostFocus {
  private windowFocused = document.hasFocus?.() ?? true;

  constructor(
    private readonly opts: {
      audio: { setPaused(paused: boolean): void };
      paused: () => boolean;
      lockstepLive?: () => boolean;
      onWake: () => void;
    },
  ) {}

  pageInBackground(): boolean {
    return !this.windowFocused || document.visibilityState === 'hidden';
  }

  simulationInBackground(): boolean {
    return (
      document.visibilityState === 'hidden' ||
      (!this.windowFocused && this.opts.lockstepLive?.() !== true)
    );
  }

  syncAudioPause(): void {
    this.opts.audio.setPaused(this.opts.paused() || this.pageInBackground());
  }

  attach(): void {
    document.addEventListener?.('visibilitychange', () => {
      this.opts.onWake();
      this.syncAudioPause();
    });
    window.addEventListener('blur', () => {
      this.windowFocused = false;
      this.syncAudioPause();
    });
    window.addEventListener('focus', () => {
      this.windowFocused = true;
      this.opts.onWake();
      this.syncAudioPause();
    });
    window.addEventListener('pagehide', () => this.opts.audio.setPaused(true));
    window.addEventListener('pageshow', () => this.syncAudioPause());
  }
}
