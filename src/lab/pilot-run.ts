
import type { CombatConfig, EncounterDef, SlowMoConfig } from '../sim/types';
import { TICK_MS } from '../sim/types';
import { createWorld } from '../sim/encounter';
import { hashWorld, stepWorld } from '../sim/world';
import { COMBAT_PRESETS, DEFAULT_SLOWMO_ID, SLOWMO_PRESETS } from './config';
import { ENCOUNTER_CONTENT_HASH, encounterForSeed } from './encounters';
export { GENERATED_ENCOUNTER_IDS, encounterForSeed } from './encounters';
import type { RunMetrics } from './metrics';
import { deriveMetrics } from './metrics';
import { DEFAULT_PILOT_SKILL_ID, PILOT_SKILLS, Pilot } from './pilot';
import { verifyReplay } from './replay';
export { MODE_PROFILES } from './modes';
import type { RunRecord } from './telemetry';
import { CHECKPOINT_INTERVAL, Recorder, UNRECORDED } from './telemetry';

export interface PilotRunOptions {
  encounterId: string;
  seed: number;
  pilotSeed?: number;
  skillId?: string;
  combatId?: string;
  slowMoId?: string;
  attempt?: number;
  startedAt: string;
  maxMs?: number;
}

export interface PilotRunResult {
  record: RunRecord;
  metrics: RunMetrics;
  replayOk: boolean;
  divergedAtTick: number | null;
}

const DEFAULT_MAX_MS = 180_000;

export const runPilotEncounter = (opts: PilotRunOptions): PilotRunResult => {
  const encounter: EncounterDef | undefined = encounterForSeed(opts.encounterId, opts.seed);
  if (encounter === undefined) throw new Error(`unknown encounter: ${opts.encounterId}`);

  const combatId = opts.combatId ?? 'Default';
  const slowMoId = opts.slowMoId ?? DEFAULT_SLOWMO_ID;
  const skillId = opts.skillId ?? DEFAULT_PILOT_SKILL_ID;
  const combatPreset: CombatConfig | undefined = COMBAT_PRESETS[combatId];
  const slowMo: SlowMoConfig | undefined = SLOWMO_PRESETS[slowMoId];
  const skill = PILOT_SKILLS[skillId];
  if (combatPreset === undefined) throw new Error(`unknown combat preset: ${combatId}`);
  if (slowMo === undefined) throw new Error(`unknown slow-motion preset: ${slowMoId}`);
  if (skill === undefined) throw new Error(`unknown pilot skill: ${skillId}`);

  const combat = structuredClone(combatPreset);
  const world = createWorld(encounter, combat, opts.seed);
  const pilot = new Pilot(skill, opts.pilotSeed ?? opts.seed);
  const recorder = new Recorder();

  recorder.begin({
    combatId,
    slowMoId,
    encounterId: opts.encounterId,
    seed: opts.seed,
    attempt: opts.attempt ?? 1,
    startedAt: opts.startedAt,
    presentationId: 'Full',
    aimMode: 'mouse',
    materialPack: 'headless',
    modelBank: 'headless',
    build: 'headless',
    inputDevice: 'headless',
    replayable: true,
    pilot: skill.id,
    participant: UNRECORDED,
    experimentId: UNRECORDED,
    conditionId: UNRECORDED,
    priorExposure: UNRECORDED,
    contentHash: ENCOUNTER_CONTENT_HASH,
  });

  const maxTicks = Math.ceil((opts.maxMs ?? DEFAULT_MAX_MS) / TICK_MS);
  for (let i = 0; i < maxTicks && world.outcome === 'running'; i++) {
    const intent = pilot.intent(world, combat);
    stepWorld(world, [intent], combat, slowMo, encounter);

    recorder.recordIntent(intent);
    recorder.recordConditions(slowMo.intensity, 'Full');
    recorder.record(world.events, world.tick);
    recorder.recordPosition(world.tick, world.players[0].pos);
    if (world.tick % CHECKPOINT_INTERVAL === 0) {
      recorder.checkpoint(world.tick, hashWorld(world));
    }
  }

  recorder.end(world.outcome, world.encounter.elapsedMs, hashWorld(world));
  const record = recorder.toJSON();
  if (record === null) throw new Error('the recorder produced nothing');

  const metrics = deriveMetrics(record.events, {
    outcome: world.outcome,
    ticks: world.tick,
    pathLength: record.pathLength,
  });
  const replay = verifyReplay(record, { combat, slowMo, encounter });

  return { record, metrics, replayOk: replay.ok, divergedAtTick: replay.divergedAtTick };
};
