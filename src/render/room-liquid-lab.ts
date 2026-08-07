
import type { Vec2, World } from '../sim/types';
import { TICK_MS } from '../sim/types';
import { scatterHash } from './room-light-lab';

export const LIQUID = {
  strength: 0.85,
  reflect: 0.38,
  darken: 0.34,
  waveLength: 0.62,
  waveSpeed: 2.6,
  waveLifeMs: 1900,
  waveAmplitude: 0.42,

  strideDistance: 0.85,
  stepStrength: 1,

  dripSources: 5,
  dripPeriodMs: 2300,
  dripHeight: 4.6,
  dripSpeed: 7.4,
  dripStrength: 0.45,
  dripSpread: 6.2,
} as const;

export const RIPPLE_SLOTS = 12;

const RESET_SLACK = 0;

export interface Ripple {
  at: Vec2;
  startMs: number;
  strength: number;
}

export interface Drip {
  at: Vec2;
  elevation: number;
}

const hash = scatterHash;

const dripSource = (i: number): Vec2 => {
  const angle = hash(i * 2) * Math.PI * 2;
  const radius = Math.sqrt(hash(i * 2 + 1)) * LIQUID.dripSpread;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
};

const dripReleasedAt = (i: number, k: number): number =>
  (k + hash(i * 7 + 3)) * LIQUID.dripPeriodMs;

const dripFallMs = (): number => (LIQUID.dripHeight / LIQUID.dripSpeed) * 1000;

export const dripsAt = (timeMs: number): Drip[] => {
  const drips: Drip[] = [];
  if (LIQUID.strength <= 0) return drips;
  const fall = dripFallMs();
  for (let i = 0; i < LIQUID.dripSources; i++) {
    const current = Math.floor(timeMs / LIQUID.dripPeriodMs);
    for (const k of [current - 1, current]) {
      if (k < 0) continue;
      const age = timeMs - dripReleasedAt(i, k);
      if (age < 0 || age > fall) continue;
      drips.push({
        at: dripSource(i),
        elevation: LIQUID.dripHeight * (1 - age / fall),
      });
    }
  }
  return drips;
};

export interface LiquidSurface {
  update: (world: World) => readonly Ripple[];
}

export const createLiquidSurface = (): LiquidSurface => {
  const ripples: Ripple[] = [];
  const lastStep = new Map<string, Vec2>();
  let lastTick = -1;
  const landed = new Map<number, number>();

  const add = (at: Vec2, startMs: number, strength: number): void => {
    if (ripples.length >= RIPPLE_SLOTS) ripples.shift();
    ripples.push({ at: { x: at.x, y: at.y }, startMs, strength });
  };

  const reset = (): void => {
    ripples.length = 0;
    lastStep.clear();
    landed.clear();
  };

  return {
    update: (world) => {
      if (LIQUID.strength <= 0) return ripples;
      const timeMs = world.tick * TICK_MS;
      if (world.tick < lastTick - RESET_SLACK) reset();
      lastTick = world.tick;

      const fall = dripFallMs();
      for (let i = 0; i < LIQUID.dripSources; i++) {
        const current = Math.floor(timeMs / LIQUID.dripPeriodMs);
        for (const k of [current - 1, current]) {
          if (k < 0) continue;
          const at = dripReleasedAt(i, k) + fall;
          if (at > timeMs) continue;
          if ((landed.get(i) ?? -1) >= k) continue;
          landed.set(i, k);
          add(dripSource(i), at, LIQUID.dripStrength);
        }
      }

      const bodies: { key: string; at: Vec2 }[] = [];
      world.players.forEach((player, i) => {
        if (player.state.kind === 'dead' || player.hp <= 0) return;
        bodies.push({ key: `p${i}`, at: player.pos });
      });
      world.enemies.forEach((enemy, i) => {
        if (enemy.hp <= 0) return;
        bodies.push({ key: `e${i}`, at: enemy.pos });
      });
      for (const body of bodies) {
        const previous = lastStep.get(body.key);
        if (previous === undefined) {
          lastStep.set(body.key, { x: body.at.x, y: body.at.y });
          continue;
        }
        if (Math.hypot(body.at.x - previous.x, body.at.y - previous.y) < LIQUID.strideDistance) {
          continue;
        }
        lastStep.set(body.key, { x: body.at.x, y: body.at.y });
        add(body.at, timeMs, LIQUID.stepStrength);
      }

      for (let i = ripples.length - 1; i >= 0; i--) {
        if (timeMs - ripples[i].startMs > LIQUID.waveLifeMs) ripples.splice(i, 1);
      }
      return ripples;
    },
  };
};
