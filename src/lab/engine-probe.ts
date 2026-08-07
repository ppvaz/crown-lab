
import type { EncounterDef, Intent, RngState } from '../sim/types';
import { FNV_OFFSET, fingerprintWorld, mixDouble } from '../sim/fingerprint';
import { createWorld } from '../sim/encounter';
import { hashWorld, stepWorld } from '../sim/world';
import { makeRng, nextFloat, nextRange } from '../sim/rng';
import { asin as pinnedAsin, atan2 as pinnedAtan2, cos as pinnedCos, sin as pinnedSin } from '../sim/trig';
import { COMBAT_PRESETS, DEFAULT_SLOWMO_ID, SLOWMO_PRESETS } from './config';
import { ENCOUNTER_CONTENT_HASH, ENCOUNTERS } from './encounters';
import { CHECKPOINT_INTERVAL } from './telemetry';

export const ENGINE_PROBE_VERSION = 2;


export { fingerprintWorld } from '../sim/fingerprint';


export interface MathSweepReport {
  name: string;
  inputs: string;
  samples: number;
  hash: number;
  buckets: number[];
  exactBySpec: boolean;
}

const BUCKETS = 16;

interface Sweep {
  name: string;
  inputs: string;
  exactBySpec: boolean;
  run: (emit: (value: number) => void) => void;
}

const SWEEPS: Sweep[] = [
  {
    name: 'Math.sin',
    inputs: '8192 points over [-16, 16) step 1/256, then 1024 points over [-8π, 8π) step π/64',
    exactBySpec: false,
    run: (emit) => {
      for (let i = 0; i < 8192; i++) emit(Math.sin((i - 4096) / 256));
      for (let i = 0; i < 1024; i++) emit(Math.sin((Math.PI * (i - 512)) / 64));
    },
  },
  {
    name: 'Math.cos',
    inputs: '8192 points over [-16, 16) step 1/256, then 1024 points over [-8π, 8π) step π/64',
    exactBySpec: false,
    run: (emit) => {
      for (let i = 0; i < 8192; i++) emit(Math.cos((i - 4096) / 256));
      for (let i = 0; i < 1024; i++) emit(Math.cos((Math.PI * (i - 512)) / 64));
    },
  },
  {
    name: 'Math.atan2',
    inputs: '128 x 128 grid of (y, x) over [-8, 8) step 1/8',
    exactBySpec: false,
    run: (emit) => {
      for (let j = 0; j < 128; j++) {
        for (let i = 0; i < 128; i++) emit(Math.atan2((j - 64) / 8, (i - 64) / 8));
      }
    },
  },
  {
    name: 'Math.asin',
    inputs: '8192 points over [-1, 1] step 1/4096',
    exactBySpec: false,
    run: (emit) => {
      for (let i = 0; i <= 8192; i++) emit(Math.asin((i - 4096) / 4096));
    },
  },
  {
    name: 'Math.hypot',
    inputs: '128 x 128 grid of (dx, dy) over [-8, 8) step 1/8',
    exactBySpec: false,
    run: (emit) => {
      for (let j = 0; j < 128; j++) {
        for (let i = 0; i < 128; i++) emit(Math.hypot((j - 64) / 8, (i - 64) / 8));
      }
    },
  },
  {
    name: 'trig.sin',
    inputs: 'pinned — same sweep as Math.sin',
    exactBySpec: true,
    run: (emit) => {
      for (let i = 0; i < 8192; i++) emit(pinnedSin((i - 4096) / 256));
      for (let i = 0; i < 1024; i++) emit(pinnedSin((Math.PI * (i - 512)) / 64));
    },
  },
  {
    name: 'trig.cos',
    inputs: 'pinned — same sweep as Math.cos',
    exactBySpec: true,
    run: (emit) => {
      for (let i = 0; i < 8192; i++) emit(pinnedCos((i - 4096) / 256));
      for (let i = 0; i < 1024; i++) emit(pinnedCos((Math.PI * (i - 512)) / 64));
    },
  },
  {
    name: 'trig.atan2',
    inputs: 'pinned — same grid as Math.atan2',
    exactBySpec: true,
    run: (emit) => {
      for (let j = 0; j < 128; j++) {
        for (let i = 0; i < 128; i++) emit(pinnedAtan2((j - 64) / 8, (i - 64) / 8));
      }
    },
  },
  {
    name: 'trig.asin',
    inputs: 'pinned — same sweep as Math.asin',
    exactBySpec: true,
    run: (emit) => {
      for (let i = 0; i <= 8192; i++) emit(pinnedAsin((i - 4096) / 4096));
    },
  },
  {
    name: 'Math.sqrt',
    inputs: 'control — 8192 points over [0, 128) step 1/64',
    exactBySpec: true,
    run: (emit) => {
      for (let i = 0; i < 8192; i++) emit(Math.sqrt(i / 64));
    },
  },
  {
    name: 'sim/rng.ts',
    inputs: 'control — 16384 successive nextFloat draws from seed 1',
    exactBySpec: true,
    run: (emit) => {
      const rng = makeRng(1);
      for (let i = 0; i < 16384; i++) emit(nextFloat(rng));
    },
  },
];

export const probeMathSurface = (): MathSweepReport[] =>
  SWEEPS.map((sweep) => {
    const outputs: number[] = [];
    sweep.run((value) => outputs.push(value));

    let hash = FNV_OFFSET;
    const buckets = new Array<number>(BUCKETS).fill(FNV_OFFSET);
    const span = Math.ceil(outputs.length / BUCKETS);
    for (let i = 0; i < outputs.length; i++) {
      const value = outputs[i] as number;
      hash = mixDouble(hash, value);
      const bucket = Math.min(BUCKETS - 1, Math.floor(i / span));
      buckets[bucket] = mixDouble(buckets[bucket] as number, value);
    }

    return {
      name: sweep.name,
      inputs: sweep.inputs,
      samples: outputs.length,
      hash,
      buckets,
      exactBySpec: sweep.exactBySpec,
    };
  });


export const syntheticIntent = (rng: RngState): Intent => ({
  move: { x: nextRange(rng, -1, 1), y: nextRange(rng, -1, 1) },
  facing: nextFloat(rng) < 0.25 ? null : nextRange(rng, -Math.PI, Math.PI),
  lightPressed: nextFloat(rng) < 0.09,
  heavyPressed: nextFloat(rng) < 0.04,
  guardHeld: nextFloat(rng) < 0.2,
  guardPressed: nextFloat(rng) < 0.07,
  stepPressed: nextFloat(rng) < 0.05,
  focusPressed: nextFloat(rng) < 0.01,
  interactPressed: false,
  powerPressed: nextFloat(rng) < 0.02,
  powerHeld: nextFloat(rng) < 0.03,
  aimDistance: nextFloat(rng) < 0.5 ? null : nextRange(rng, 0, 8),
});

export interface SimCheckpoint {
  tick: number;
  quantized: number;
  exact: number;
}

export interface SimSweepReport {
  encounterId: string;
  seed: number;
  ticks: number;
  checkpoints: SimCheckpoint[];
  finalQuantized: number;
  finalExact: number;
  outcome: string;
}

export interface SimSweepOptions {
  encounterId: string;
  seed: number;
  ticks: number;
  combatId?: string;
  slowMoId?: string;
}

export const probeSimSurface = (options: SimSweepOptions): SimSweepReport => {
  const encounter: EncounterDef | undefined = ENCOUNTERS[options.encounterId];
  if (encounter === undefined) throw new Error(`unknown encounter: ${options.encounterId}`);
  const combat = COMBAT_PRESETS[options.combatId ?? 'Default'];
  const slowMo = SLOWMO_PRESETS[options.slowMoId ?? DEFAULT_SLOWMO_ID];
  if (combat === undefined) throw new Error(`unknown combat preset: ${options.combatId}`);
  if (slowMo === undefined) throw new Error(`unknown slow-motion preset: ${options.slowMoId}`);

  const world = createWorld(encounter, combat, options.seed);
  const intents = makeRng((options.seed + 0x9e3779b9) >>> 0);
  const checkpoints: SimCheckpoint[] = [];

  for (let tick = 0; tick < options.ticks; tick++) {
    stepWorld(world, [syntheticIntent(intents)], combat, slowMo, encounter);
    if (world.tick % CHECKPOINT_INTERVAL === 0) {
      checkpoints.push({
        tick: world.tick,
        quantized: hashWorld(world),
        exact: fingerprintWorld(world),
      });
    }
  }

  return {
    encounterId: options.encounterId,
    seed: options.seed,
    ticks: options.ticks,
    checkpoints,
    finalQuantized: hashWorld(world),
    finalExact: fingerprintWorld(world),
    outcome: world.outcome,
  };
};


export interface EngineProbeReport {
  probeVersion: number;
  contentHash: number;
  math: MathSweepReport[];
  sim: SimSweepReport[];
}

export interface EngineProbeOptions {
  rooms: readonly string[];
  seeds: readonly number[];
  ticks: number;
}

export const probeEngine = (options: EngineProbeOptions): EngineProbeReport => {
  const sim: SimSweepReport[] = [];
  for (const encounterId of options.rooms) {
    for (const seed of options.seeds) {
      sim.push(probeSimSurface({ encounterId, seed, ticks: options.ticks }));
    }
  }
  return {
    probeVersion: ENGINE_PROBE_VERSION,
    contentHash: ENCOUNTER_CONTENT_HASH,
    math: probeMathSurface(),
    sim,
  };
};
