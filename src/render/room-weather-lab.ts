
import type { Vec2 } from '../sim/types';
export { AUTO_CYCLE_MS, AUTO_DRIP_RAIN, AUTO_DRY_MS, autoSkyAt } from '../sim/weather';
import { AUTO_DRIP_RAIN, autoSkyAt as simAutoSkyAt } from '../sim/weather';
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
  spread: 10.9,
  windDir: [0.8, 0.6] as const,
  streak: 1.35,
  colour: 'rgb(198 216 232)',
  alpha: 0.34,
  width: 1.1,

  douseRain: 0.35,

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

export const AUTO_ID = 'auto';

export const WEATHER_PRESETS: Readonly<Record<string, Weather>> = {
  clear: CLEAR,
  drizzle: { rain: 0.3, lightning: 0, wind: 0.1 },
  rain: { rain: 0.7, lightning: 0.18, wind: 0.22 },
  storm: { rain: 1, lightning: 0.45, wind: 0.36 },
};

export const WEATHER_IDS: readonly string[] = [...Object.keys(WEATHER_PRESETS), AUTO_ID];

let current: Weather = CLEAR;

let currentId = AUTO_ID;

export const currentWeather = (): Weather => current;

export const currentWeatherId = (): string => currentId;

export const setWeather = (id: string): string => {
  if (id === AUTO_ID) {
    currentId = AUTO_ID;
    return AUTO_ID;
  }
  current = WEATHER_PRESETS[id] ?? CLEAR;
  currentId = WEATHER_PRESETS[id] === undefined ? 'clear' : id;
  return currentId;
};









export interface AutoSky {
  weather: Weather;
  wetness: number;
  dripping: boolean;
}

export const skyAt = (timeMs: number): AutoSky => {
  if (currentId === AUTO_ID) {
    const sky = simAutoSkyAt(timeMs);
    return {
      weather: { rain: sky.rain, lightning: sky.lightning, wind: sky.wind },
      wetness: sky.wetness,
      dripping: sky.dripping,
    };
  }
  const weather = current;
  return {
    weather,
    wetness: weather.rain,
    dripping: weather.rain >= AUTO_DRIP_RAIN,
  };
};

export interface RainStreak {
  at: Vec2;
  elevation: number;
  from: Vec2;
  fromElevation: number;
}

const source = (i: number, drift = 0, spread: number = WEATHER.spread): Vec2 => {
  const angle = scatterHash(i * 2.13) * Math.PI * 2;
  const radius = Math.sqrt(scatterHash(i * 2.13 + 1)) * spread;

  return {
    x: Math.cos(angle) * radius - WIND_DIR.x * drift * 0.5,
    y: Math.sin(angle) * radius - WIND_DIR.y * drift * 0.5,
  };
};

export const rainAt = (
  timeMs: number,
  weather: Weather = current,
  spread: number = WEATHER.spread,
): RainStreak[] => {
  const streaks: RainStreak[] = [];
  if (weather.rain <= 0) return streaks;

  const area = (spread / WEATHER.spread) ** 2;
  const count = Math.round(WEATHER.drops * weather.rain * Math.max(1, area));
  const drift = weather.wind * WEATHER.height;
  const back = WEATHER.streak / WEATHER.height;
  for (let i = 0; i < count; i++) {
    const at = source(i, drift, spread);
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
