
import { describe, expect, it } from 'vitest';

import type { Intent } from '../src/sim/types';
import { NEUTRAL_INTENT } from '../src/sim/types';
import { hashWorld } from '../src/sim/world';
import { createWorld } from '../src/sim/encounter';
import { makeRng } from '../src/sim/rng';
import { COMBAT_PRESETS } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import {
  ENGINE_PROBE_VERSION,
  fingerprintWorld,
  probeEngine,
  probeMathSurface,
  probeSimSurface,
  syntheticIntent,
} from '../src/lab/engine-probe';

const combat = COMBAT_PRESETS['Default'] as NonNullable<(typeof COMBAT_PRESETS)['Default']>;
const encounter = ENCOUNTERS['kernel_guard'] as NonNullable<(typeof ENCOUNTERS)['kernel_guard']>;

describe('the exact fingerprint sees what the replay hash is built to ignore', () => {
  it('disagrees where hashWorld agrees, for a sub-quantum difference', () => {
    const world = createWorld(encounter, combat, 1);
    const quantizedBefore = hashWorld(world);
    const exactBefore = fingerprintWorld(world);

    world.players[0].pos.x += 1e-7;

    expect(hashWorld(world)).toBe(quantizedBefore);
    expect(fingerprintWorld(world)).not.toBe(exactBefore);
  });

  it('covers world state that hashWorld does not hash at all', () => {
    const world = createWorld(encounter, combat, 1);
    const quantizedBefore = hashWorld(world);
    const exactBefore = fingerprintWorld(world);

    world.dropRng.value = (world.dropRng.value + 1) >>> 0;

    expect(hashWorld(world)).toBe(quantizedBefore);
    expect(fingerprintWorld(world)).not.toBe(exactBefore);
  });

  it('is stable for a world rebuilt the same way', () => {
    const a = createWorld(encounter, combat, 7);
    const b = createWorld(encounter, combat, 7);
    expect(fingerprintWorld(b)).toBe(fingerprintWorld(a));
  });
});

describe('the synthetic intent stream', () => {
  it('is reproducible from its seed', () => {
    const left = makeRng(11);
    const right = makeRng(11);
    for (let i = 0; i < 200; i++) {
      expect(syntheticIntent(left)).toEqual(syntheticIntent(right));
    }
  });

  it('is not the same stream for a different seed', () => {
    const left = makeRng(11);
    const right = makeRng(12);
    const a = Array.from({ length: 200 }, () => syntheticIntent(left));
    const b = Array.from({ length: 200 }, () => syntheticIntent(right));
    expect(a).not.toEqual(b);
  });

  it('exercises every field of Intent that an encounter reads', () => {
    const rng = makeRng(3);
    const seen = new Set<keyof Intent>();
    for (let i = 0; i < 4000; i++) {
      const intent = syntheticIntent(rng);
      for (const key of Object.keys(NEUTRAL_INTENT) as (keyof Intent)[]) {
        if (key === 'move') {
          if (intent.move.x !== 0 && intent.move.y !== 0) seen.add(key);
        } else if (intent[key] !== NEUTRAL_INTENT[key]) {
          seen.add(key);
        }
      }
    }
    const unexercised = (Object.keys(NEUTRAL_INTENT) as (keyof Intent)[]).filter(
      (key) => !seen.has(key),
    );
    expect(unexercised).toEqual(['interactPressed']);
  });
});

describe('the math surface', () => {
  const surface = probeMathSurface();

  it('sweeps every approximated function the sim calls, plus controls', () => {
    expect(surface.map((sweep) => sweep.name)).toEqual([
      'Math.sin',
      'Math.cos',
      'Math.atan2',
      'Math.asin',
      'Math.hypot',
      'trig.sin',
      'trig.cos',
      'trig.atan2',
      'trig.asin',
      'Math.sqrt',
      'sim/rng.ts',
    ]);
    expect(surface.filter((sweep) => sweep.exactBySpec).map((s) => s.name)).toEqual([
      'trig.sin',
      'trig.cos',
      'trig.atan2',
      'trig.asin',
      'Math.sqrt',
      'sim/rng.ts',
    ]);
  });

  it('reports a bucket per sixteenth, so a mismatch names an input range', () => {
    for (const sweep of surface) {
      expect(sweep.buckets).toHaveLength(16);
      expect(sweep.samples).toBeGreaterThan(1000);
    }
  });

  it('is reproducible within one engine', () => {
    expect(probeMathSurface()).toEqual(surface);
  });
});

describe('the sim surface', () => {
  it('reproduces exactly when run twice in the same engine', () => {
    const options = { encounterId: 'kernel_guard', seed: 4, ticks: 400 };
    expect(probeSimSurface(options)).toEqual(probeSimSurface(options));
  });

  it('checkpoints both hashes as it goes, and finishes on the requested tick', () => {
    const report = probeSimSurface({ encounterId: 'kernel_guard', seed: 4, ticks: 400 });
    expect(report.ticks).toBe(400);
    expect(report.checkpoints.length).toBeGreaterThan(0);
    for (const checkpoint of report.checkpoints) {
      expect(Number.isInteger(checkpoint.quantized)).toBe(true);
      expect(Number.isInteger(checkpoint.exact)).toBe(true);
    }
  });

  it('does not draw from the world rng, so the sim owns its own stream', () => {
    const withProbe = probeSimSurface({ encounterId: 'kernel_guard', seed: 9, ticks: 200 });
    const world = createWorld(encounter, combat, 9);
    const stream = makeRng((9 + 0x9e3779b9) >>> 0);
    for (let i = 0; i < 200; i++) syntheticIntent(stream);
    expect(world.rng.value).toBe(9);
    expect(withProbe.ticks).toBe(200);
  });

  it('names a different room as a different report', () => {
    const a = probeSimSurface({ encounterId: 'kernel_guard', seed: 1, ticks: 200 });
    const b = probeSimSurface({ encounterId: 'kernel_duelist', seed: 1, ticks: 200 });
    expect(b.finalExact).not.toBe(a.finalExact);
  });

  it('refuses an encounter it does not have', () => {
    expect(() => probeSimSurface({ encounterId: 'no_such_room', seed: 1, ticks: 10 })).toThrow(
      /unknown encounter/,
    );
  });
});

describe('the whole report', () => {
  it('carries the version and content hash a comparison needs to be valid', () => {
    const report = probeEngine({ rooms: ['kernel_guard'], seeds: [1], ticks: 120 });
    expect(report.probeVersion).toBe(ENGINE_PROBE_VERSION);
    expect(Number.isInteger(report.contentHash)).toBe(true);
    expect(report.sim).toHaveLength(1);
    expect(report.math).toHaveLength(11);
  });

  it('runs every room against every seed', () => {
    const report = probeEngine({ rooms: ['kernel_guard', 'kernel_duelist'], seeds: [1, 2], ticks: 60 });
    expect(report.sim.map((run) => `${run.encounterId}/${run.seed}`)).toEqual([
      'kernel_guard/1',
      'kernel_guard/2',
      'kernel_duelist/1',
      'kernel_duelist/2',
    ]);
  });
});
