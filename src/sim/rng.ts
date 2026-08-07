
import type { RngState } from './types';

export const makeRng = (seed: number): RngState => ({ seed, value: seed >>> 0 });

export const nextFloat = (rng: RngState): number => {
  rng.value = (rng.value + 0x6d2b79f5) >>> 0;
  let t = rng.value;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const nextRange = (rng: RngState, lo: number, hi: number): number =>
  lo + (hi - lo) * nextFloat(rng);

export const nextInt = (rng: RngState, lo: number, hiExclusive: number): number =>
  lo + Math.floor((hiExclusive - lo) * nextFloat(rng));

export const cloneRng = (rng: RngState): RngState => ({ seed: rng.seed, value: rng.value });
