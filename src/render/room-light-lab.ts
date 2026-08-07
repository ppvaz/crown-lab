
import type { Vec2, World } from '../sim/types';
import { TICK_MS } from '../sim/types';
import type { Weather } from './room-weather-lab';

export type RGB = readonly [number, number, number];

export const RESPONSE = {
  threatSurge: 1.15,
  threatReach: 7,
  parryBloom: 0.55,
  woundFloor: 0.42,
  deathFadeMs: 900,
  deathDimTo: 0.16,
  deathColour: [1.0, 0.05, 0.02] as RGB,
  stormPeriodMs: 2600,
  skyPeriodMs: 5400,
  stormFlashMs: 150,
  stormGain: 4.5,
  stormColour: [0.52, 0.68, 1.0] as RGB,
  threatColour: [1.0, 0.42, 0.2] as RGB,
  parryColour: [0.78, 0.92, 1.0] as RGB,
} as const;

export interface RoomResponse {
  timeMs: number;
  bloom: number;
  chill: number;
  mourning: number;
  storm: number;
  threats: readonly { at: Vec2; weight: number }[];
}

export const scatterHash = (n: number): number => {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};

export const stormAt = (ms: number, periodMs: number = RESPONSE.stormPeriodMs): number => {
  const period = periodMs;
  const flash = RESPONSE.stormFlashMs;
  const current = Math.floor(ms / period);
  let peak = 0;
  for (const n of [current - 1, current]) {
    if (n < 0) continue;
    const dt = ms - (n * period + scatterHash(n) * (period - flash));
    if (dt < 0 || dt > flash) continue;
    const u = dt / flash;
    const leader = Math.max(0, 1 - u * 4.5);
    const returnStroke = u > 0.34 && u < 0.78 ? 0.8 * (1 - (u - 0.34) / 0.44) : 0;
    peak = Math.max(peak, leader, returnStroke);
  }
  return peak;
};

export const roomResponse = (world: World, weather?: Weather): RoomResponse => {
  const threats: { at: Vec2; weight: number }[] = [];
  for (const enemy of world.enemies) {
    if (enemy.state.kind === 'telegraph') threats.push({ at: enemy.pos, weight: 1 });
    else if (enemy.state.kind === 'attack') threats.push({ at: enemy.pos, weight: 0.45 });
  }

  let parrying = false;
  let health = 1;
  let anyoneStanding = world.players.length === 0;
  let fellAtTick: number | null = null;
  for (const player of world.players) {
    if (player.state.kind === 'parry') parrying = true;
    if (player.maxHp > 0) health = Math.min(health, Math.max(0, player.hp / player.maxHp));
    if (player.state.kind === 'dead' || player.hp <= 0) {
      fellAtTick = Math.max(fellAtTick ?? 0, player.state.enteredTick);
    } else {
      anyoneStanding = true;
    }
  }

  const chill = parrying ? 1 : 0;
  const lostForMs = anyoneStanding || fellAtTick === null
    ? -1
    : (world.tick - fellAtTick) * TICK_MS;
  const mourning = lostForMs < 0 ? 0 : Math.min(1, lostForMs / RESPONSE.deathFadeMs);
  const deathStorm = lostForMs < 0 ? 0 : stormAt(lostForMs) * mourning;
  const timeMs = world.tick * TICK_MS;
  const skyStorm = (weather?.lightning ?? 0) * stormAt(timeMs, RESPONSE.skyPeriodMs);
  const storm = Math.max(deathStorm, skyStorm);
  const bloom =
    (RESPONSE.woundFloor + (1 - RESPONSE.woundFloor) * health) *
    (1 + (parrying ? RESPONSE.parryBloom : 0)) *
    (1 - mourning * (1 - RESPONSE.deathDimTo));

  return { timeMs, bloom, chill, mourning, storm, threats };
};

export const lean = (
  threat: number,
  chill: number,
  mourning: number,
  storm: number,
): { tint: RGB; blend: number } => {
  const weights: readonly [number, RGB][] = [
    [threat * (1 - chill) * (1 - mourning) * (1 - storm), RESPONSE.threatColour],
    [chill * (1 - mourning) * (1 - storm), RESPONSE.parryColour],
    [mourning * (1 - storm), RESPONSE.deathColour],
    [storm, RESPONSE.stormColour],
  ];
  const blend = weights.reduce((sum, [weight]) => sum + weight, 0);
  if (blend <= 0) return { tint: [1, 1, 1], blend: 0 };
  const tint: [number, number, number] = [0, 0, 0];
  for (const [weight, colour] of weights) {
    for (let i = 0; i < 3; i++) tint[i] += (weight / blend) * colour[i];
  }
  return { tint, blend };
};

export const roomLean = (
  response: RoomResponse,
): { gain: number; tint: RGB; blend: number } => {
  let threat = 0;
  for (const t of response.threats) threat = Math.max(threat, t.weight);
  const surged = threat * (RESPONSE.threatSurge - 1);
  return {
    gain: response.bloom * (1 + surged) + response.storm * RESPONSE.stormGain,
    ...lean(threat, response.chill, response.mourning, response.storm),
  };
};


export const lampFlicker = (index: number, timeMs: number, depth: number): number => {
  const t = timeMs / 1000;
  return 1 + depth * (Math.sin(t * 7.3 + index * 2.1) * 0.6 + Math.sin(t * 17.9 + index) * 0.4);
};

export const FLICKER = { torch: 0.18, lantern: 0.06 } as const;

export const flickerDepth = (energy: number, reference: number): number =>
  energy > reference ? FLICKER.torch : FLICKER.lantern;
