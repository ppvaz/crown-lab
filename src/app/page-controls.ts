
import { setIcon } from './icons';

export interface PageControlsHost {
  audioInit(): void;
  restart(): void;
  paused(): boolean;
  setPaused(paused: boolean): void;
  notice(text: string): void;
  resize(): void;
}

export class PageControls {
  constructor(host: PageControlsHost) {
    const restartButton = document.getElementById('touch-restart');
    const pauseButton = document.getElementById('touch-pause');
    const fullscreenButton = document.getElementById(
      'touch-fullscreen',
    ) as HTMLButtonElement | null;

    restartButton?.addEventListener('click', () => {
      host.audioInit();
      host.restart();
    });
    const updatePauseButton = (): void => {
      setIcon(
        pauseButton,
        host.paused() ? 'play' : 'pause',
        host.paused() ? 'Resume' : 'Pause',
        host.paused(),
      );
    };
    pauseButton?.addEventListener('click', () => {
      host.audioInit();
      host.setPaused(!host.paused());
      updatePauseButton();
    });
    updatePauseButton();

    const updateFullscreenButton = (): void => {
      if (fullscreenButton === null) return;
      fullscreenButton.hidden = !document.fullscreenEnabled;
      const on = document.fullscreenElement !== null;
      setIcon(
        fullscreenButton,
        on ? 'fullscreen-exit' : 'fullscreen',
        on ? 'Exit fullscreen' : 'Fullscreen',
        on,
      );
    };
    fullscreenButton?.addEventListener('click', () => {
      host.audioInit();
      const request =
        document.fullscreenElement === null
          ? document.documentElement.requestFullscreen({ navigationUI: 'hide' })
          : document.exitFullscreen();
      void request.catch(() => {
        host.notice('tela cheia bloqueada pelo navegador');
      });
    });
    document.addEventListener?.('fullscreenchange', () => {
      updateFullscreenButton();
      host.resize();
    });
    updateFullscreenButton();
  }
}
