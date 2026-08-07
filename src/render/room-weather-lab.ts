
import type { Vec2 } from '../sim/types';
import { scatterHash } from './room-light-lab';

export interface Weather {
  rain: number;
  lightning: number;
  wind: number;
}

export const WEATHER = {
  drops: 260,
  fallMs: 620,
  height: 9,
  spread: 7.6,
  windDir: [0.8, 0.6] as const,
  streak: 1.35,
  colour: 'rgb(198 216 232)',
  alpha: 0.34,
  width: 1.1,

  wetGain: 0.15,
  chop: 0.5,
  chopCell: 0.55,
  chopRate: 4.2,
} as const;

const WIND_DIR: Vec2 = (() => {
  const [x, y] = WEATHER.windDir;
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
})();

export const CLEAR: Weather = { rain: 0, lightning: 0, wind: 0 };

export const WEATHER_PRESETS: Readonly<Record<string, Weather>> = {
  clear: CLEAR,
  drizzle: { rain: 0.3, lightning: 0, wind: 0.1 },
  rain: { rain: 0.7, lightning: 0.18, wind: 0.22 },
  storm: { rain: 1, lightning: 0.45, wind: 0.36 },
};

export const WEATHER_IDS: readonly string[] = Object.keys(WEATHER_PRESETS);

let current: Weather = CLEAR;
let currentId = 'clear';

export const currentWeather = (): Weather => current;

export const currentWeatherId = (): string => currentId;

export const setWeather = (id: string): string => {
  current = WEATHER_PRESETS[id] ?? CLEAR;
  currentId = WEATHER_PRESETS[id] === undefined ? 'clear' : id;
  return currentId;
};

export interface RainStreak {
  at: Vec2;
  elevation: number;
  from: Vec2;
  fromElevation: number;
}

const source = (i: number): Vec2 => {
  const angle = scatterHash(i * 2.13) * Math.PI * 2;
  const radius = Math.sqrt(scatterHash(i * 2.13 + 1)) * WEATHER.spread;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
};

export const rainAt = (timeMs: number, weather: Weather = current): RainStreak[] => {
  const streaks: RainStreak[] = [];
  if (weather.rain <= 0) return streaks;
  const count = Math.round(WEATHER.drops * weather.rain);
  const drift = weather.wind * WEATHER.height;
  const back = WEATHER.streak / WEATHER.height;
  for (let i = 0; i < count; i++) {
    const at = source(i);
    const u = ((timeMs / WEATHER.fallMs) + scatterHash(i * 5.77 + 0.31)) % 1;
    const tail = Math.max(0, u - back);
    streaks.push({
      at: { x: at.x + WIND_DIR.x * drift * u, y: at.y + WIND_DIR.y * drift * u },
      elevation: WEATHER.height * (1 - u),
      from: { x: at.x + WIND_DIR.x * drift * tail, y: at.y + WIND_DIR.y * drift * tail },
      fromElevation: WEATHER.height * (1 - tail),
    });
  }
  return streaks;
};

export const filmStrength = (base: number, weather: Weather = current): number =>
  Math.max(0, Math.min(1, base + WEATHER.wetGain * weather.rain));
