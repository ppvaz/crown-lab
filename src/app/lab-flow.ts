
import type { Vec2 } from '../sim/types';
import { NEUTRAL_INTENT } from '../sim/types';
import { angleOf } from '../sim/vec';
import { createWorld } from '../sim/encounter';
import { hashWorld, stepWorld } from '../sim/world';
import { LAB_FULL_PALETTE, labArchetypeColor } from '../render/palette-lab';
import { cameraOffsetFor } from '../render/iso';
import { cloneBank } from '../render/models';
import { MODEL_BANKS } from '../render/cast/banks-lab';
import { MATERIAL_PACKS } from '../render/materials-lab';
import { bossMusicBedForEncounter, labMusicBedForEncounter } from '../render/music-route';
import { COMBAT_PRESETS, SLOWMO_PRESETS } from '../lab/config';
import {
  ENCOUNTERS,
  ENCOUNTER_CONTENT_HASH,
  encounterForSeed,
  encounterOpensWithBoss,
} from '../lab/encounters';
import { hashEncounterDef } from '../lab/content';
import { MODE_PROFILE_IDS, modeProfile } from '../lab/modes';
import { orchestrationPolicyFor } from '../lab/orchestrator';
import { deriveMetrics } from '../lab/metrics';
import { deriveMastery } from '../lab/estimator';
import { decodeIntents, decodeValues } from '../lab/replay';
import { PRESENTATION_PRESETS, resolve, transformPalette } from '../lab/presentation';
import { FIRST_CROWN, routeNextNode, routeProgress } from '../game/route';
import {
  createRouteRun,
  currentNode,
  enterRoom,
  roomEncounter,
} from './route-run';
import type { LabState } from './lab-state';
import type { LabHarness, LabKit } from './lab-kit';

export interface LabFlowHooks {
  resize(): void;
}

export type LabFlow = ReturnType<typeof createLabFlow>;

export const createLabFlow = (
  lab: LabState,
  kit: LabKit,
  harness: LabHarness,
  hooks: LabFlowHooks,
) => {
  const {
    dials, audio, fx, cam, input, recorder, session, liveMastery,
    presentationOrchestrator, focusVignette, tutorialCoach, labCamera, feed, copy, operator,
    encounterIds,
  } = harness;

  const resetSelections = (): void => {
    reconfigure(() => dials.applyDefaults());
    lab.vignetteOverride = null;
    applyPresentation();
    audio.setPack(MATERIAL_PACKS[dials.packId()]);
    lab.notice = 'reset to defaults';
  };

  const applyMode = (id: string): void => {
    const profile = modeProfile(id);
    if (profile === undefined) {
      lab.notice = `unknown mode: ${id} (have: ${MODE_PROFILE_IDS.join(', ')})`;
      return;
    }
    reconfigure(() => dials.applyModeProfile(profile));
    applyPresentation();
    lab.notice = `mode: ${profile.name} — ${profile.question}`;
  };


  const applyPresentation = (): void => {
    const policy = orchestrationPolicyFor(dials.presentationId());
    const next =
      policy === null
        ? resolve(PRESENTATION_PRESETS[dials.presentationId()])
        : presentationOrchestrator.update(policy, liveMastery.estimate).presentation;
    const key = `${next.id}|${lab.run === null ? 'lab' : 'route'}`;
    if (key === lab.appliedPresentationKey) return;


    lab.pres = { ...next, visual: { ...next.visual, facingMarks: false } };
    lab.appliedPresentationKey = key;
    lab.pal = transformPalette({ ...LAB_FULL_PALETTE }, lab.pres.visual, lab.pres.preserveThreatColors);
    fx.configure(lab.pres, lab.pal, lab.apotheosis, labArchetypeColor);
    audio.applyPresentation(lab.pres);
  };


  const restart = (preserveProgress = false, playerSpawn?: Vec2, worldSeed?: number): void => {
    input.clearTouch();
    lab.replay = null;
    lab.replayStatus = '';
    lab.combat = structuredClone(COMBAT_PRESETS[dials.combatId()]);
    const builtFrom = worldSeed ?? dials.seed;
    const def = encounterForSeed(dials.encounterId(), builtFrom);
    lab.models = cloneBank(MODEL_BANKS[dials.modelBankId()]);
    if (!preserveProgress) {
      lab.run = null;
    }
    lab.attempt = session.nextAttempt(dials.combatId(), dials.encounterId(), dials.slowMoId());
    const routed = preserveProgress ? lab.run : null;
    lab.world = createWorld(routed === null ? def : roomEncounter(routed, ENCOUNTERS), lab.combat, builtFrom);
    if (routed !== null) enterRoom(routed, lab.world, lab.combat);
    else if (playerSpawn !== undefined) {
      lab.world.players[0].pos = { ...playerSpawn };
      const toCentre = { x: -playerSpawn.x, y: -playerSpawn.y };
      lab.world.players[0].facing = angleOf(toCentre);
    }
    cam.arena = lab.world.arena;
    tutorialCoach.reset(def, lab.combat.power, SLOWMO_PRESETS[dials.slowMoId()].mode);
    audio.setMusicBed(labMusicBedForEncounter(dials.encounterId()));
    audio.setMusicGate(!encounterOpensWithBoss(def, lab.combat));
    audio.resetMusicMuffle();
    liveMastery.reset();
    presentationOrchestrator.reset();
    focusVignette.reset();
    applyPresentation();

    recorder.begin({
      combatId: dials.combatId(),
      slowMoId: dials.slowMoId(),
      encounterId: dials.encounterId(),
      seed: builtFrom,
      attempt: lab.attempt,
      startedAt: new Date().toISOString(),
      presentationId: dials.presentationId(),
      aimMode: input.aimMode,
      materialPack: dials.packId(),
      modelBank: dials.modelBankId(),
      build: __CROWN_WATERMARK__.commit,
      inputDevice: kit.controlDevice(),
      ...operator,
      replayable: kit.unreplayableReason() === null,
      contentHash: ENCOUNTER_CONTENT_HASH,
      encounterHash: hashEncounterDef(def),
    });
    recorder.record(lab.world.events, 0);

    fx.reset();
    feed.reset();
    lab.pageControls?.showEncounter(dials.encounterId());
    lab.touchControls?.setAvailable(kit.availableTouchActions());
    const contentBox = kit.layoutFrame().content;
    cam.offset = cameraOffsetFor(cam, contentBox);
    cam.zoom = labCamera.zoomFor(def.arena, def.id, { w: contentBox.w, h: contentBox.h });
    labCamera.cut({ w: contentBox.w, h: contentBox.h });
  };

  const enterRouteNode = (worldSeed?: number): void => {
    if (lab.run === null) return;
    const node = currentNode(lab.run);
    const nextIndex = encounterIds.indexOf(node.encounterId);
    if (nextIndex < 0) return;
    dials.encounterIndex = nextIndex;
    restart(true, undefined, worldSeed);
    lab.notice = `${FIRST_CROWN.label} ${routeProgress(FIRST_CROWN, lab.run.route)} — ${node.label}`;
    const ahead = routeNextNode(FIRST_CROWN, lab.run.route);
    const aheadBed = ahead === null ? null : bossMusicBedForEncounter(ahead.encounterId);
    if (aheadBed !== null) audio.prefetchMusicBed(aheadBed);
  };

  const enterRoute = (): void => {
    lab.run = createRouteRun(ENCOUNTERS, copy.herald.leave);
    enterRouteNode();
  };

  const toggleRoute = (): void => {
    if (lab.run === null) {
      enterRoute();
      return;
    }
    lab.run = null;
    restart();
    lab.notice = 'left the route';
  };

  const reconfigure = (mutate: () => void): void => {
    mutate();
    restart();
  };


  const downloadEvidence = (): void => {
    recorder.download();
  };

  const finishRun = (): void => {
    recorder.end(lab.world.outcome, lab.world.encounter.elapsedMs, hashWorld(lab.world));
    const record = recorder.toJSON();
    if (record === null) return;
    lab.lastRecord = record;
    const metrics = deriveMetrics(record.events, {
      outcome: lab.world.outcome,
      ticks: lab.world.tick,
      pathLength: record.pathLength,
    });

    const history = session
      .forConfig(dials.combatId(), dials.encounterId(), dials.slowMoId())
      .map((a) => a.metrics);
    lab.lastMastery = deriveMastery(metrics, history);

    session.record({
      attempt: lab.attempt,
      combatId: dials.combatId(),
      slowMoId: dials.slowMoId(),
      encounterId: dials.encounterId(),
      seed: dials.seed,
      metrics,
    });
  };

  const startReplay = (): void => {
    if (lab.lastRecord === null || lab.lastRecord.intents.length === 0) {
      lab.replayStatus = 'no run to replay';
      return;
    }
    if (!lab.lastRecord.meta.replayable) {
      lab.replayStatus = 'run not replayable — cheats or a mid-run transition';
      return;
    }
    const meta = lab.lastRecord.meta;
    const ci = dials.combatIds.indexOf(meta.combatId);
    const si = dials.slowMoIds.indexOf(meta.slowMoId);
    const ei = encounterIds.indexOf(meta.encounterId);
    if (ci < 0 || si < 0 || ei < 0) {
      lab.replayStatus = 'recording references an unknown preset';
      return;
    }
    if (meta.contentHash !== undefined && meta.contentHash !== ENCOUNTER_CONTENT_HASH) {
      lab.replayStatus = 'recording was played on different content';
      return;
    }

    dials.combatIndex = ci;
    dials.slowMoIndex = si;
    dials.encounterIndex = ei;
    dials.seed = meta.seed;
    lab.attempt = meta.attempt;
    lab.combat = structuredClone(COMBAT_PRESETS[meta.combatId]);
    lab.world = createWorld(encounterForSeed(meta.encounterId, meta.seed), lab.combat, meta.seed);
    lab.models = cloneBank(MODEL_BANKS[dials.modelBankId()]);
    cam.arena = lab.world.arena;
    lab.pageControls?.showEncounter(meta.encounterId);
    lab.touchControls?.setAvailable(kit.availableTouchActions());
    hooks.resize();

    fx.reset();
    feed.reset();
    lab.replay = {
      intents: decodeIntents(lab.lastRecord.intents),
      slowMoIntensity: decodeValues(lab.lastRecord.conditions?.slowMoIntensity ?? []),
      cursor: 0,
      expectedHash: lab.lastRecord.finalHash,
    };
    lab.replayStatus = 'replaying';
  };

  const ABSORB_TAIL_TICKS = 120;

  const seekReplay = (target: number): void => {
    if (lab.replay === null || lab.lastRecord === null) return;
    const meta = lab.lastRecord.meta;
    const def = encounterForSeed(meta.encounterId, meta.seed);
    const clamped = Math.max(0, Math.min(target, lab.replay.intents.length));

    lab.world = createWorld(def, lab.combat, meta.seed);
    cam.arena = lab.world.arena;
    fx.reset();
    feed.reset();

    const base = SLOWMO_PRESETS[dials.slowMoId()];
    for (let i = 0; i < clamped; i++) {
      const slowMo = { ...base, intensity: lab.replay.slowMoIntensity[i] ?? base.intensity };
      stepWorld(lab.world, [lab.replay.intents[i] ?? NEUTRAL_INTENT], lab.combat, slowMo, def);
      if (i >= clamped - ABSORB_TAIL_TICKS) feed.absorb(lab.world.events);
    }

    lab.replay.cursor = clamped;
    kit.setPaused(true);



    labCamera.cut(kit.layoutFrame().content);
    lab.notice = `replay tick ${clamped} / ${lab.replay.intents.length}`;
  };

  return {
    resetSelections,
    applyMode,
    applyPresentation,
    restart,
    enterRouteNode,
    enterRoute,
    toggleRoute,
    reconfigure,
    downloadEvidence,
    finishRun,
    startReplay,
    seekReplay,
  };
};
