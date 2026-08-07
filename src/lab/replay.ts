
import type { CombatConfig, EncounterDef, Intent, SlowMoConfig, Tick, World } from '../sim/types';
import { createWorld } from '../sim/encounter';
import { hashWorld, stepWorld } from '../sim/world';

export interface IntentRun {
  i: Intent;
  n: number;
}

export interface Checkpoint {
  tick: Tick;
  hash: number;
}

export interface ValueRun<T extends string | number> {
  v: T;
  n: number;
}

export const encodeValues = <T extends string | number>(values: readonly T[]): ValueRun<T>[] => {
  const out: ValueRun<T>[] = [];
  for (const value of values) {
    const last = out[out.length - 1];
    if (last !== undefined && last.v === value) last.n += 1;
    else out.push({ v: value, n: 1 });
  }
  return out;
};

export const decodeValues = <T extends string | number>(runs: readonly ValueRun<T>[]): T[] => {
  const out: T[] = [];
  for (const run of runs) for (let i = 0; i < run.n; i++) out.push(run.v);
  return out;
};

export const intentsEqual = (a: Intent, b: Intent): boolean =>
  a.move.x === b.move.x &&
  a.move.y === b.move.y &&
  a.facing === b.facing &&
  a.lightPressed === b.lightPressed &&
  a.heavyPressed === b.heavyPressed &&
  a.guardHeld === b.guardHeld &&
  a.guardPressed === b.guardPressed &&
  a.stepPressed === b.stepPressed &&
  a.focusPressed === b.focusPressed &&
  a.interactPressed === b.interactPressed &&
  a.powerPressed === b.powerPressed &&
  a.powerHeld === b.powerHeld &&
  a.aimDistance === b.aimDistance;

export const encodeIntents = (intents: readonly Intent[]): IntentRun[] => {
  const out: IntentRun[] = [];
  for (const intent of intents) {
    const last = out[out.length - 1];
    if (last !== undefined && intentsEqual(last.i, intent)) {
      last.n += 1;
      continue;
    }
    out.push({ i: { ...intent, move: { ...intent.move } }, n: 1 });
  }
  return out;
};

export const decodeIntents = (runs: readonly IntentRun[]): Intent[] => {
  const out: Intent[] = [];
  for (const run of runs) {
    for (let k = 0; k < run.n; k++) out.push({ ...run.i, move: { ...run.i.move } });
  }
  return out;
};

export const intentCount = (runs: readonly IntentRun[]): number =>
  runs.reduce((total, r) => total + r.n, 0);

export interface ReplayInput {
  meta: { seed: number };
  intents: IntentRun[];
  checkpoints: Checkpoint[];
  finalHash: number;
  conditions?: {
    slowMoIntensity: ValueRun<number>[];
  };
}

export interface ReplayConfigs {
  combat: CombatConfig;
  slowMo: SlowMoConfig;
  encounter: EncounterDef;
}

export interface ReplayResult {
  ok: boolean;
  expectedHash: number;
  actualHash: number;
  divergedAtTick: Tick | null;
  ticks: number;
  world: World;
}

export interface ReplayHooks {
  afterIntent?: (index: number, world: World) => void;
}

export const verifyReplay = (
  input: ReplayInput,
  cfgs: ReplayConfigs,
  hooks: ReplayHooks = {},
): ReplayResult => {
  const world = createWorld(cfgs.encounter, cfgs.combat, input.meta.seed);
  const intents = decodeIntents(input.intents);
  const checkpoints = new Map(input.checkpoints.map((c) => [c.tick, c.hash]));
  const intensities =
    input.conditions === undefined ? [] : decodeValues(input.conditions.slowMoIntensity);
  let divergedAtTick: Tick | null = null;

  for (let tick = 0; tick < intents.length; tick++) {
    const slowMo = {
      ...cfgs.slowMo,
      intensity: intensities[tick] ?? cfgs.slowMo.intensity,
    };
    stepWorld(world, [intents[tick]], cfgs.combat, slowMo, cfgs.encounter);
    hooks.afterIntent?.(tick, world);
    const expected = checkpoints.get(world.tick);
    if (expected !== undefined && divergedAtTick === null && hashWorld(world) !== expected) {
      divergedAtTick = world.tick;
    }
  }

  const actualHash = hashWorld(world);
  return {
    ok: divergedAtTick === null && actualHash === input.finalHash,
    expectedHash: input.finalHash,
    actualHash,
    divergedAtTick,
    ticks: world.tick,
    world,
  };
};
