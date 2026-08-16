
import type { CombatConfig, Ms } from './types';

export interface Sky {
  rain: number;
  lightning: number;
  wind: number;
  wetness: number;
  dripping: boolean;
}

export const CLEAR_SKY: Sky = { rain: 0, lightning: 0, wind: 0, wetness: 0, dripping: false };

export const AUTO_CYCLE_MS = 210_000;

export const AUTO_DRY_MS = 48_000;

export const AUTO_DRIP_RAIN = 0.55;

const skyHash = (n: number): number => {
  let h = Math.imul(Math.round(n * 1024) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x1_0000_0000;
};

const cycleShape = (cycle: number) => {
  const h = (salt: number): number => skyHash(cycle * 3.137 + salt);
  const dry = 0.34 + h(0.11) * 0.32;
  const wet = 1 - dry;
  const build = wet * (0.16 + h(0.29) * 0.14);
  const fade = wet * (0.36 + h(0.53) * 0.18);
  const hold = Math.max(0, wet - build - fade);
  const g = h(0.71);
  const peak = 0.28 + g * g * 0.72;
  return { dry, build, hold, fade, peak };
};

export const autoSkyAt = (timeMs: Ms): Sky => {
  const cycle = Math.floor(timeMs / AUTO_CYCLE_MS);
  const t = (timeMs - cycle * AUTO_CYCLE_MS) / AUTO_CYCLE_MS;
  const { dry, build, hold, fade, peak } = cycleShape(cycle);


  const lead = dry * 0.35;
  const buildAt = lead;
  const holdAt = buildAt + build;
  const fadeAt = holdAt + hold;

  let rain = 0;
  if (t >= buildAt && t < holdAt) rain = peak * ((t - buildAt) / Math.max(1e-6, build));
  else if (t >= holdAt && t < fadeAt) rain = peak;
  else if (t >= fadeAt) rain = peak * (1 - (t - fadeAt) / Math.max(1e-6, fade));
  rain = Math.max(0, Math.min(1, rain));

  const rainEndedAt = fadeAt + fade;
  const sinceEnd = t > rainEndedAt ? (t - rainEndedAt) * AUTO_CYCLE_MS : 0;
  const residue = t > rainEndedAt ? peak * Math.max(0, 1 - sinceEnd / AUTO_DRY_MS) : 0;

  return {
    rain,
    lightning: rain >= AUTO_DRIP_RAIN ? (rain - AUTO_DRIP_RAIN) * 0.6 : 0,
    wind: rain * 0.36,
    wetness: Math.max(rain, residue),
    dripping: peak >= AUTO_DRIP_RAIN && (rain > 0 || residue > 0.02),
  };
};

export const skyFor = (cfg: CombatConfig, tickMs: Ms): Sky => {
  const weather = cfg.weather ?? 'fixed';
  if (weather === 'auto') return autoSkyAt(tickMs);
  return CLEAR_SKY;
};

export const WEATHER_POWER_GAIN = 0.45;

export const weatherPowerScale = (sky: Sky, power: CombatConfig['power']): number => {
  if (power === 'lightning') return 1 + WEATHER_POWER_GAIN * sky.rain;
  if (power === 'incinerate') return 1 - WEATHER_POWER_GAIN * sky.rain;
  return 1;
};
