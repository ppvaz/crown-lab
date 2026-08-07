
export const FORGED_SAMPLES: Readonly<Record<string, string>> = {
  'light.ogg': new URL('../assets/audio/forged/light.ogg', import.meta.url).href,
  'heavy.ogg': new URL('../assets/audio/forged/heavy.ogg', import.meta.url).href,
  'hit.ogg': new URL('../assets/audio/forged/hit.ogg', import.meta.url).href,
  'parry.ogg': new URL('../assets/audio/forged/parry.ogg', import.meta.url).href,
  'guard.ogg': new URL('../assets/audio/forged/guard.ogg', import.meta.url).href,
  'unparryable.ogg': new URL('../assets/audio/forged/unparryable.ogg', import.meta.url).href,
  'step.ogg': new URL('../assets/audio/forged/step.ogg', import.meta.url).href,
  'stagger.ogg': new URL('../assets/audio/forged/stagger.ogg', import.meta.url).href,
  'death.ogg': new URL('../assets/audio/forged/death.ogg', import.meta.url).href,
  'player_hurt.ogg': new URL('../assets/audio/forged/player_hurt.ogg', import.meta.url).href,
  'power.ogg': new URL('../assets/audio/forged/power.ogg', import.meta.url).href,
  'power_hit.ogg': new URL('../assets/audio/forged/power_hit.ogg', import.meta.url).href,
  'wave.ogg': new URL('../assets/audio/forged/wave.ogg', import.meta.url).href,
};

export const PUBLIC_MUSIC: Readonly<Record<string, string>> = {
  'bgm-06.webm': new URL('../assets/audio/music/bgm-06.webm', import.meta.url).href,
  'bgm-08.webm': new URL('../assets/audio/music/bgm-08.webm', import.meta.url).href,
  'bgm-03.webm': new URL('../assets/audio/music/bgm-03.webm', import.meta.url).href,
  'bgm-02.webm': new URL('../assets/audio/music/bgm-02.webm', import.meta.url).href,

  'bgm-01.webm': new URL('../assets/audio/music/bgm-01.webm', import.meta.url).href,
};

export const PUBLIC_AUDIO_MANIFEST: readonly string[] = [
  ...Object.values(FORGED_SAMPLES),
  ...Object.values(PUBLIC_MUSIC),
];

export const PUBLIC_BLOCKING_AUDIO: readonly string[] = Object.values(FORGED_SAMPLES);

export interface PreloadReport {
  loaded: number;
  total: number;
  failed: string[];
}

export const preloadAssets = async (
  manifest: readonly string[],
  onProgress?: (report: PreloadReport) => void,
): Promise<PreloadReport> => {
  const report: PreloadReport = { loaded: 0, total: manifest.length, failed: [] };
  await Promise.all(
    manifest.map(async (url) => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(String(response.status));
        await response.arrayBuffer();
        report.loaded += 1;
      } catch {
        report.failed.push(url);
      }
      onProgress?.({ ...report, failed: [...report.failed] });
    }),
  );
  return report;
};
