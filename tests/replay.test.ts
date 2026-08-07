
import type { CombatConfig, EncounterDef, Intent } from '../src/sim/types';
import { createWorld } from '../src/sim/encounter';
import { hashWorld, stepWorld } from '../src/sim/world';
import { CHECKPOINT_INTERVAL, Recorder, UNRECORDED } from '../src/lab/telemetry';
import {
  decodeIntents,
  encodeIntents,
  intentCount,
  intentsEqual,
  verifyReplay,
} from '../src/lab/replay';
import { cfg, intent, noSlowMo, oneEnemy } from './support/world';
import { SLOWMO_PRESETS } from '../src/lab/config';

const durable = (): CombatConfig => {
  const c = cfg();
  c.player.maxHp = 1e6;
  c.enemies.duelist.maxHp = 1e6;
  return c;
};

const scripted = (t: number): Intent => ({
  move: { x: Math.sin(t * 0.09), y: Math.cos(t * 0.05) },
  facing: t % 17 === 0 ? null : Math.sin(t * 0.013) * Math.PI,
  lightPressed: t % 89 === 7,
  heavyPressed: t % 197 === 23,
  guardHeld: t % 61 < 24,
  guardPressed: t % 61 === 0,
  stepPressed: t % 151 === 37,
  focusPressed: false,
  interactPressed: t % 211 === 13,
  powerPressed: t % 113 === 19,
  powerHeld: t % 83 < 24,
  aimDistance: t % 31 === 0 ? null : (t % 53) / 10,
});

const SEED = 20260724;
const TICKS = 1200;

const captureRun = () => {
  const combat = durable();
  const slowMo = noSlowMo();
  const def = oneEnemy('duelist', { x: 3, y: 0 });
  const world = createWorld(def, combat, SEED);

  const recorder = new Recorder();
  recorder.begin({
    combatId: combat.id,
    slowMoId: 'none',
    encounterId: def.id,
    seed: SEED,
    attempt: 1,
    startedAt: '2026-07-24T00:00:00.000Z',
    presentationId: 'Full',
    aimMode: 'mouse',
    materialPack: 'none',
    modelBank: 'silhouette',
    build: 'test',
    inputDevice: 'pointer',
    replayable: true,
    participant: UNRECORDED,
    experimentId: UNRECORDED,
    conditionId: UNRECORDED,
    priorExposure: UNRECORDED,
  });
  recorder.record(world.events, 0);

  for (let t = 0; t < TICKS; t++) {
    const i = scripted(t);
    stepWorld(world, [i], combat, slowMo, def);
    recorder.recordIntent(i);
    recorder.record(world.events, world.tick);
    if (world.tick % CHECKPOINT_INTERVAL === 0) recorder.checkpoint(world.tick, hashWorld(world));
  }

  recorder.end(world.outcome, world.encounter.elapsedMs, hashWorld(world));
  const record = recorder.toJSON();
  if (record === null) throw new Error('recorder produced nothing');
  return { record, world, combat, slowMo, def };
};

const captureDynamicConditionRun = () => {
  const combat = durable();
  combat.maxSimultaneousAttackers = 2;
  combat.enemies.guard.maxHp = 1e6;
  const slowMo = structuredClone(SLOWMO_PRESETS.assist);
  slowMo.cooldownMs = 0;
  slowMo.maxPerEncounter = 20;
  slowMo.durationMs = 900;
  slowMo.blendMs = 0;
  const def: EncounterDef = {
    id: 'dynamic_replay',
    description: 'Two synchronized threats keep assist slow motion observable.',
    arena: { halfExtents: { x: 12, y: 9 } },
    playerStart: { x: 0, y: 0 },
    waves: [
      {
        id: 'pair',
        atMs: 0,
        spawns: [
          { archetype: 'guard', at: { x: -2.2, y: 0 } },
          { archetype: 'guard', at: { x: 2.2, y: 0 } },
        ],
      },
    ],
    timeLimitMs: null,
  };
  const world = createWorld(def, combat, SEED + 1);
  const recorder = new Recorder();
  recorder.begin({
    combatId: combat.id,
    slowMoId: 'assist',
    encounterId: def.id,
    seed: SEED + 1,
    attempt: 1,
    startedAt: '2026-07-24T00:00:00.000Z',
    presentationId: 'Adaptive_Stage',
    aimMode: 'mouse',
    materialPack: 'none',
    modelBank: 'silhouette',
    build: 'test',
    inputDevice: 'pointer',
    replayable: true,
    participant: UNRECORDED,
    experimentId: UNRECORDED,
    conditionId: UNRECORDED,
    priorExposure: UNRECORDED,
  });
  recorder.record(world.events, 0);

  for (let t = 0; t < 720; t++) {
    const input = intent();
    const intensity = Math.floor(t / 45) % 2 === 0 ? 0.2 : 0.9;
    stepWorld(world, [input], combat, { ...slowMo, intensity }, def);
    recorder.recordIntent(input);
    recorder.recordConditions(intensity, intensity < 0.5 ? 'Low' : 'High');
    recorder.record(world.events, world.tick);
    if (world.tick % CHECKPOINT_INTERVAL === 0) recorder.checkpoint(world.tick, hashWorld(world));
  }
  recorder.end(world.outcome, world.encounter.elapsedMs, hashWorld(world));
  const record = recorder.toJSON();
  if (record === null) throw new Error('dynamic recorder produced nothing');
  return { record, world, combat, slowMo, def };
};

describe('intent encoding', () => {
  it('compares every field of Intent', () => {
    const base = intent();
    const variants: Array<[string, Intent]> = [
      ['move.x', { ...base, move: { x: 0.5, y: base.move.y } }],
      ['move.y', { ...base, move: { x: base.move.x, y: 0.5 } }],
      ['facing', { ...base, facing: 1.23 }],
      ['lightPressed', { ...base, lightPressed: true }],
      ['heavyPressed', { ...base, heavyPressed: true }],
      ['guardHeld', { ...base, guardHeld: true }],
      ['guardPressed', { ...base, guardPressed: true }],
      ['stepPressed', { ...base, stepPressed: true }],
      ['focusPressed', { ...base, focusPressed: true }],
      ['interactPressed', { ...base, interactPressed: true }],
      ['powerPressed', { ...base, powerPressed: true }],
      ['powerHeld', { ...base, powerHeld: true }],
      ['aimDistance', { ...base, aimDistance: 3.5 }],
    ];

    expect(variants).toHaveLength(Object.keys(base).length + 1);
    for (const [field, variant] of variants) {
      expect(intentsEqual(base, variant), `intentsEqual ignores ${field}`).toBe(false);
    }
    expect(intentsEqual(base, { ...base, move: { ...base.move } })).toBe(true);
  });

  it('round-trips exactly', () => {
    const original = Array.from({ length: 400 }, (_, t) => scripted(t));
    const decoded = decodeIntents(encodeIntents(original));

    expect(decoded).toHaveLength(original.length);
    expect(decoded).toEqual(original);
  });

  it('collapses held input instead of storing every frame', () => {
    const still = Array.from({ length: 600 }, () => intent({ guardHeld: true }));
    const encoded = encodeIntents(still);

    expect(encoded).toHaveLength(1);
    expect(intentCount(encoded)).toBe(600);
  });

  it('does not alias the caller\'s intent object', () => {
    const live = intent({ guardHeld: false });
    const encoded = encodeIntents([live, { ...live, guardHeld: true }]);
    live.guardHeld = true;
    live.move.x = 99;

    expect(encoded[0].i.guardHeld).toBe(false);
    expect(encoded[0].i.move.x).toBe(0);
  });
});

describe('replay', () => {
  it('reproduces a recorded run bit-identically from seed and intents alone', () => {
    const { record, world, combat, slowMo, def } = captureRun();

    const result = verifyReplay(record, { combat: durable(), slowMo, encounter: def });

    expect(result.ok).toBe(true);
    expect(result.divergedAtTick).toBeNull();
    expect(result.actualHash).toBe(hashWorld(world));
    expect(result.ticks).toBe(world.tick);
    expect(result.world.players[0].pos).toEqual(world.players[0].pos);
    expect(result.world.players[0].hp).toBe(world.players[0].hp);
    expect(result.world.enemies.map((e) => e.hp)).toEqual(world.enemies.map((e) => e.hp));
    void combat;
  });

  it('records enough checkpoints to bisect a divergence', () => {
    const { record } = captureRun();
    expect(record.checkpoints.length).toBe(Math.floor(TICKS / CHECKPOINT_INTERVAL));
    expect(record.finalHash).not.toBe(0);
  });

  it('survives the JSON round-trip a saved run actually goes through', () => {
    const { record, def, slowMo } = captureRun();

    const revived = JSON.parse(JSON.stringify(record)) as typeof record;
    const result = verifyReplay(revived, { combat: durable(), slowMo, encounter: def });

    expect(result.ok).toBe(true);
  });

  it('replays the per-tick slow-motion intensity instead of recomputing live mastery', () => {
    const { record, world, combat, slowMo, def } = captureDynamicConditionRun();
    expect(record.version).toBe(4);
    expect(record.conditions.slowMoIntensity.length).toBeGreaterThan(1);

    const exact = verifyReplay(record, { combat, slowMo, encounter: def });
    expect(exact.ok).toBe(true);
    expect(exact.actualHash).toBe(hashWorld(world));

    const withoutRecordedCondition = structuredClone(record);
    withoutRecordedCondition.conditions.slowMoIntensity = [];
    const recomputed = verifyReplay(withoutRecordedCondition, { combat, slowMo, encounter: def });
    expect(recomputed.ok).toBe(false);
  });

  it('catches a corrupted recording and reports where it diverged', () => {
    const { record, def, slowMo } = captureRun();

    const start = Math.floor(record.intents.length * 0.4);
    for (let k = start; k < start + 40 && k < record.intents.length; k++) {
      const run = record.intents[k];
      run.i = { ...run.i, move: { x: -run.i.move.x, y: -run.i.move.y } };
    }

    const result = verifyReplay(record, { combat: durable(), slowMo, encounter: def });

    expect(result.ok).toBe(false);
    expect(result.actualHash).not.toBe(result.expectedHash);
    expect(result.divergedAtTick).not.toBeNull();
    expect(result.divergedAtTick).toBeGreaterThan(0);
  });

  it('reports a divergence when the run is replayed under different parameters', () => {
    const { record, def, slowMo } = captureRun();

    const different = durable();
    different.player.parry.perfectMs *= 2;

    const result = verifyReplay(record, { combat: different, slowMo, encounter: def });

    expect(result.ok).toBe(false);
  });
});
