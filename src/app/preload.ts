
import { preloadAssets } from '../render/asset-registry';
import { parallaxPending, warmParallax } from '../render/sky';

export interface Preload {
  done(): boolean;
}

export const createPreload = (audioManifest: readonly string[]): Preload => {
  let audioSettled = false;
  void preloadAssets(audioManifest).then((report) => {
    audioSettled = true;
    if (report.failed.length > 0) {
      console.warn(`[preload] ${report.failed.length} audio files did not load:`, report.failed);
    }
  });

  warmParallax();

  return { done: () => audioSettled && parallaxPending() === 0 };
};
