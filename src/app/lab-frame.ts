
import { NEUTRAL_INTENT, TICK_MS } from '../sim/types';
import { hashWorld, stepWorld } from '../sim/world';
import { fingerprintWorld } from '../lab/engine-probe';
import { SLOWMO_PRESETS } from '../lab/config';
import { encounterForSeed, encounterOpensWithBoss, isGeneratedEncounter } from '../lab/encounters';
import { CHECKPOINT_INTERVAL } from '../lab/telemetry';
import { applyMasteryTaper, taperPolicyFor } from '../lab/taper';
import { chainDoorUnderKing, chainDoors, chainSeed } from '../lab/generated-chain';
import { chainFloorPads } from '../render/chain-pads-lab';
import { FIRST_CROWN, routeReadout } from '../game/route';
import { retryHintFor } from '../game/controls';
import { labArchetypeColor } from '../render/palette-lab';
import { LAB_ROOMS } from '../render/rooms/index-lab';
import { drawScene } from '../render/draw';
import { WaveBanner } from '../render/wave-banner';
import { waveGatePads } from '../render/wave-gates-lab';
import { bossMusicBedForArchetype, bossMusicBedForEncounter } from '../render/music-route';
import type { MusicBed } from '../render/soundbank';
import { ETERNAL_SIEGE_ID } from '../lab/eternal-siege';
import { glRoomFor, rendererId } from './lab-gl';
import { withBodySink } from '../render/gl/sink';
import type { SunkBody } from '../render/gl/sink';
import { drawPickupPrompt } from '../render/draw-projectiles';
import { conceptArenaGround, conceptArenaScene } from '../render/concept-arenas-lab';
import { drawHud } from '../render/hud';
import { drawDebug, panelText } from '../render/debug';
import {
  advanceVictory,
  applyRouteIntents,
  drawRoom,
  gateRouteIntents,
  observeRoom,
  roomSceneOpts,
  type RouteEffect,
} from './route-run';
import { arenaExceedsScreen, clampCameraToArena, cameraOffsetFor } from '../render/iso';
import { ROOM_WALL_HEIGHT } from '../render/atmosphere';
import { canvasRenderScale, resizeCanvasBackingStore } from './viewport';
import { labRenderScaleFromSearch } from '../render/render-scale-lab';
import { neutralizeContextState, restoreContextState } from '../render/context-state-lab';
import { apotheosisFromSearch } from '../render/apotheosis/config';
import { apotheosisProbe } from '../render/apotheosis/probe-lab';
import { createSweep, sweepProbesFromSearch, type SweepReport, type SweepStep } from '../lab/sweep';
import { screenHorizontal, screenVertical } from './input';
import { nextWorldSeed } from './coop-world';
import {
  roomPackagesPending,
  roomPainterFor,
  setRoomMsaa,
  webglRoomFor,
  webglRoomsPending,
} from './lab-rooms';
import { setRoomScale } from '../render/room-webgl-lab';
import {
  castCapeSway,
  castMeshActors,
  castMeshDrawn,
  castMeshPending,
  castMeshStatus,
  roomDressingEnabled,
  enemyMeshBody,
  shotMeshBody,
} from './lab-cast-mesh';
import { drawLoadingScreen } from '../render/loading-screen';
import { drawTitleScreen, thresholdFromSearch } from '../render/title-screen';
import { drawPauseScreen, pausePlateVisible } from '../render/pause-screen';
import { heavyLoading } from '../render/heavy-assets';
import { drawHeavyLoading } from '../render/heavy-prompt';
import { preloadLab } from './lab-preload';
import { currentWeatherId } from '../render/room-weather-lab';
import type { LabState } from './lab-state';
import type { LabHarness, LabKit } from './lab-kit';
import type { LabFlow } from './lab-flow';

export type LabFrame = ReturnType<typeof createLabFrame>;

export const createLabFrame = (
  lab: LabState,
  kit: LabKit,
  harness: LabHarness,
  flow: LabFlow,
) => {
  const {
    dials, audio, fx, cam, input, recorder, session, liveMastery, focusVignette,
    tutorialCoach, labCoop, labCamera, feed, showcase, clock, frameMeter, focus, coopControls,
    copy, operator, captureShot, signalingUrl, canvas, ctx, panel,
    panelReadout, fpsMeterOutput, fpsMeterButton, buildWatermark,
  } = harness;

  const syncFpsMeter = (): void => {
    fpsMeterButton?.setAttribute('aria-pressed', String(lab.flags.showFpsMeter));
    if (fpsMeterOutput === null) return;
    fpsMeterOutput.hidden = !lab.flags.showFpsMeter;
    if (!lab.flags.showFpsMeter) return;
    fpsMeterOutput.textContent = `${Math.round(lab.frameReading.fps)} FPS\n` +
      `${lab.frameReading.frameMs.toFixed(1)} ms\n` +
      `max ${lab.frameReading.worstFrameMs.toFixed(1)} · +${lab.frameReading.longFrames}`;
  };

  const simulate = (dtRealMs: number): void => {
    if (focus.simulationInBackground()) return;
    if (lab.flags.paused && !lab.stepOnce) return;

    if (
      encounterOpensWithBoss(kit.encounterDef(), lab.combat) &&
      lab.world.tick === 0 &&
      !audio.musicReady
    ) {
      clock.clear();
      return;
    }

    clock.add(dtRealMs);

    const def = kit.encounterDef();
    const wasRunning = lab.world.outcome === 'running';

    const budget = clock.budget(TICK_MS, lab.stepOnce);
    let spent = 0;
    let transitioned = false;

    while (spent + TICK_MS <= budget) {
      if (lab.replay !== null && lab.replay.cursor >= lab.replay.intents.length) break;

      if (lab.replay === null) {
        const king = kit.localKing();
        if (lab.flags.invincible) king.hp = king.maxHp;
        if (lab.flags.infiniteStamina) king.stamina = king.maxStamina;
      }

      const replayTick = lab.replay?.cursor ?? 0;
      const sampled =
        lab.replay !== null
          ? (lab.replay.intents[lab.replay.cursor++] ?? NEUTRAL_INTENT)
          : input.sample(kit.acceptsCommands(lab.world));
      lab.aimDistance = sampled.aimDistance;


      const intent = sampled;

      const baseSlowMo = SLOWMO_PRESETS[dials.slowMoId()];
      const slowMo =
        lab.replay !== null
          ? {
              ...baseSlowMo,
              intensity: lab.replay.slowMoIntensity[replayTick] ?? baseSlowMo.intensity,
            }
          : applyMasteryTaper(baseSlowMo, liveMastery.estimate, taperPolicyFor(dials.slowMoId()));



      const intents = labCoop.playing ? (labCoop.session?.advance(intent) ?? null) : [intent];
      if (intents === null) break;

      let routed: RouteEffect = { change: null, envoy: 'none' };
      if (lab.run !== null && lab.replay === null) {
        routed = applyRouteIntents(
          lab.run,
          lab.world,
          lab.combat,
          intents,
          (i) => screenVertical(i.move),
          { state: labCoop.state, available: signalingUrl !== '' },
          (i) => screenHorizontal(i.move),
        );
        kit.applyEnvoyAction(routed.envoy);
        if (routed.change !== null) {
          lab.run.arriveFrom = routed.change.from;
          flow.enterRouteNode(
            labCoop.playing ? nextWorldSeed(lab.world, routed.change.node.id) : undefined,
          );
          transitioned = true;
          break;
        }
      }


      if (lab.run === null && lab.replay === null && isGeneratedEncounter(dials.encounterId())) {
        const pressed = intents.some((candidate) => candidate?.interactPressed === true);
        const use = pressed
          ? chainDoorUnderKing(lab.world.arena, lab.world, lab.world.players[0].pos, dials.seed)
          : null;
        if (use !== null) {
          dials.seed = chainSeed(dials.seed, use);
          const arrival =
            use === 'forward'
              ? undefined
              : chainDoors(encounterForSeed(dials.encounterId(), dials.seed).arena).forward;
          flow.restart(false, arrival);
          transitioned = true;
          break;
        }
      }

      const stepped = lab.run !== null && lab.replay === null ? gateRouteIntents(lab.run, lab.world, intents) : intents;
      stepWorld(lab.world, stepped, lab.combat, slowMo, def);
      tutorialCoach.update(intent, lab.world.events);

      if (lab.replay === null) {
        recorder.recordIntent(stepped[lab.localPlayer] ?? intent);
        recorder.recordConditions(slowMo.intensity, lab.pres.id);
        recorder.record(lab.world.events, lab.world.tick);
        recorder.recordPosition(lab.world.tick, lab.world.players[0].pos);
        const history = session
          .forConfig(dials.combatId(), dials.encounterId(), dials.slowMoId())
          .map((entry) => entry.metrics);
        liveMastery.update(recorder.eventsSoFar, lab.world.tick, recorder.pathLengthSoFar, history);
        flow.applyPresentation();
        if (lab.world.tick % CHECKPOINT_INTERVAL === 0) {
          recorder.checkpoint(lab.world.tick, hashWorld(lab.world));
          labCoop.session?.checkpoint(lab.world.tick, fingerprintWorld(lab.world));
        }
      }

      feed.absorb(lab.world.events);


      for (const event of lab.world.events) {
        if (event.type !== 'wave_spawned') continue;
        const wave = String(event.data?.wave ?? '');
        const boss = lab.world.enemies.find(
          (enemy) =>
            enemy.state.kind !== 'dead' && lab.combat.enemies[enemy.archetype].boss !== undefined,
        );
        waveBanner.announce(
          boss === undefined
            ? `${copy.hud.wave.toUpperCase()} ${wave.replace(/^w/, '')}`
            : copy.hud.bossWave,
        );
      }
      fx.consume(lab.world.events, lab.world);

      spent += TICK_MS;
      if (lab.stepOnce) break;
    }

    clock.spend(spent);
    lab.stepOnce = false;
    if (transitioned) {
      clock.clear();
      return;
    }

    if (lab.replay !== null && lab.replay.cursor >= lab.replay.intents.length) {
      const actual = hashWorld(lab.world);
      lab.replayStatus =
        actual === lab.replay.expectedHash
          ? `replay ok (${lab.replay.intents.length} ticks)`
          : `REPLAY DIVERGED expected ${lab.replay.expectedHash.toString(16)} got ${actual.toString(16)}`;
      lab.replay = null;
    } else if (wasRunning && lab.world.outcome !== 'running' && lab.replay === null) {
      if (lab.run !== null) observeRoom(lab.run, lab.world, lab.combat);
      flow.finishRun();
    }
  };

  const render = (dtRealMs: number): void => {
    let routePrompted = false;

    lab.touchControls?.setAvailable(kit.availableTouchActions());


    fx.update(captureShot === null && !stoodOnTick() ? dtRealMs : 0);
    if (captureShot === null && !stoodOnTick()) {
      fx.applyShake(cam);
    } else {
      cam.shake = { x: 0, y: 0 };
    }
    cam.arena = lab.world.arena;

    const frame = kit.layoutFrame();
    const box = { w: frame.content.w, h: frame.content.h };
    if (labCamera.eases()) {
      labCamera.advance(box, dtRealMs);
      if (arenaExceedsScreen(lab.world.arena)) {
        cam.center = clampCameraToArena(lab.world.arena, cam.center, cam.zoom, box, ROOM_WALL_HEIGHT);
      }
    } else if (labCamera.cutsToAction()) {
      labCamera.cutToAction(box);
      if (arenaExceedsScreen(lab.world.arena)) {
        cam.center = clampCameraToArena(lab.world.arena, cam.center, cam.zoom, box, ROOM_WALL_HEIGHT);
      }
    } else {
      cam.center = labCamera.look(box);
    }

    if (showcase.draw(ctx, cam, lab.models, lab.pal, lab.pres, frame.content, dtRealMs)) return;

    const meshDressing = roomDressingEnabled();
    const collected: SunkBody[] = [];
    const glRoom = glRoomFor(() => lab.world, lab.pal, collected);
    const room =
      glRoom !== null
        ?
          { painter: glRoom, occluders: [] }
        : meshDressing
          ? webglRoomFor(lab.world.encounter.defId, lab.world.arena, () => lab.world) ??
            roomPainterFor(lab.world.encounter.defId, () => lab.world)
          : null;
    const conceptScene = conceptArenaScene(ctx, lab.world, cam, lab.pal);
    const paintScene = (): void => {
      drawScene(ctx, lab.world, cam, {
        ...(room === null
          ? {}
          : {
              roomLayers: room.painter,
              roomOccluders: room.occluders.map((occluder) => ({
                at: occluder.at,
                draw: () => occluder.draw(ctx, cam),
              })),
            }),
        localPlayer: lab.localPlayer,
        cfg: lab.combat,
        pal: lab.pal,
        pres: lab.pres,
        apotheosis: lab.apotheosis,
        archetypeColor: labArchetypeColor,
        rooms: LAB_ROOMS,
        models: lab.models,
        kingDressing: kit.kingDressings(),
        enemyBody: (archetype) => enemyMeshBody(archetype)?.draw ?? null,
        shotBody: shotMeshBody,
        showHitboxes: lab.flags.showHitboxes,
        aimDistance: lab.aimDistance,
        mazePortalDirection: lab.mazePortalDirection,
        groundFx: () => {
          conceptArenaGround(ctx, lab.world, cam, lab.pal);
          fx.drawGround(ctx, cam, lab.world);
        },
        ...conceptScene,



        floorPads: waveGatePads(ctx, lab.world, cam, lab.pal, kit.encounterDef()),
        ...(lab.run === null && isGeneratedEncounter(dials.encounterId())
          ? {
              floorPads: chainFloorPads(
                ctx,
                lab.world,
                cam,
                lab.pal,
                frame,
                lab.world.rng.seed,
                copy.controls[kit.controlDevice()].interact,
              ),
            }
          : {}),
        ...(lab.run === null
          ? {}
          : roomSceneOpts(lab.run, lab.world, lab.combat, {
              ctx,
              cam,
              pal: lab.pal,
              frame,
              simTimeMs: lab.world.tick * TICK_MS,
            })),
      });
    };
    if (glRoom === null) paintScene();
    else withBodySink((body) => collected.push(body), paintScene);
    if (lab.run === null) {
      drawPickupPrompt(
        ctx,
        lab.world,
        cam,
        lab.pal,
        frame,
        lab.combat,
        kit.localKing(),
        copy.controls[kit.controlDevice()].interact,
      );
    }
    if (lab.run !== null) {
      routePrompted = drawRoom(
        ctx,
        lab.run,
        lab.world,
        cam,
        lab.pal,
        frame,
        lab.combat,
        copy.controls[kit.controlDevice()].interact,
        lab.world.tick * TICK_MS,
        lab.attempt,
        copy.controls[kit.controlDevice()].move,
        copy.herald,
        { state: labCoop.state, room: labCoop.room, available: signalingUrl !== '' },
        copy.puzzle,
        lab.localPlayer,
      );
    }
    fx.drawAir(ctx, cam);
    focusVignette.draw(ctx, cam, lab.world, lab.localPlayer, LAB_ROOMS, {
      dtMs: captureShot === null ? dtRealMs : 0,
      layer: lab.pres.vignette,
      override: lab.vignetteOverride,
      simTimeMs: lab.world.tick * TICK_MS,
    });
    drawHud(ctx, lab.world, {
      waveAnnouncement: waveBanner.text(),
      archetypeColor: labArchetypeColor,
      localPlayer: lab.localPlayer,
      cfg: lab.combat,
      copy,
      pal: lab.pal,
      pres: lab.pres,
      attempt: lab.attempt,
      replaying: lab.replay !== null,
      viewW: cam.width,
      viewH: cam.height,
      waveCount: kit.encounterDef().waves.length,
      touchControls: kit.touchActive(),
      frame,
      tutorialPrompt: tutorialCoach.prompt,
      routePrompted,
      retryHint: retryHintFor(kit.controlDevice()),
    });
    drawDebug(ctx, lab.world, cam, {
      localPlayer: lab.localPlayer,
      cfg: lab.combat,
      showTimeline: lab.flags.showTimeline,
      showStates: lab.flags.showStates,
      recentOffsets: feed.offsets,
      mastery: lab.lastMastery,
      vignette:
        lab.vignetteOverride !== null || lab.pres.vignette.amount > 0 || focusVignette.amount > 0
          ? { amount: focusVignette.amount, held: lab.vignetteOverride !== null }
          : null,
      frame,
      railUp: lab.flags.showPanel,
    });
  };

  const kingReadout = (): string[] => {
    const king = castMeshStatus();
    const body = !king.wanted
      ? 'primitives'
      : king.ready
        ? 'mesh — skinned, scrubbed by the simulation'
        : king.loading
          ? 'mesh — still loading'
          : 'primitives (wanted mesh, no file — run npm run cast:mesh)';
    const lines = [`  king body    ${body} (\` toggle)`];
    if (king.ready && castCapeSway() !== 'off') {
      lines.push(`  cape         ${castCapeSway()} sway, closed-form`);
    }
    if (king.ready && king.showing !== null) {
      const showing = king.showing;
      const held = showing.role === 'override';
      lines.push(
        `  king clip    ${showing.clip} ${(showing.at * 100).toFixed(0)}%` +
          `${held ? ' — HELD by the browser (shift+`)' : ` — ${showing.role}`}` +
          (king.unbound.length === 0 ? '' : `  [no clip for: ${king.unbound.join(', ')}]`),
      );
    }
    return lines;
  };

  const updatePanel = (): void => {
    lab.pageControls?.syncMazePortal();
    panel.hidden = !lab.flags.showPanel;
    if (!lab.flags.showPanel) return;
    coopControls?.update({
      available: signalingUrl !== '',
      session: labCoop.state,
      room: labCoop.room,
      lobby: labCoop.session?.lobby ?? null,
    });
    const lines = [
      `build       ${buildWatermark.recipient} / ${buildWatermark.id}${
        buildWatermark.signed ? ' / signed' : ' / local'
      }`,
      ...labCoop.statusLines(),
      '',
      panelText(lab.world, lab.combat, {
        localPlayer: lab.localPlayer,
        combatId: dials.combatId(),
        slowMoId: dials.slowMoId(),
        encounterId: dials.encounterId(),
        seed: dials.seed,
        attempt: lab.attempt,
        hash: hashWorld(lab.world),
        fps: lab.frameReading.fps,
        paused: lab.flags.paused,
        invincible: lab.flags.invincible,
        infiniteStamina: lab.flags.infiniteStamina,
        recentEvents: feed.tail,
        mastery: lab.lastMastery,
      }),
      '',
      'conditions',
      `  session      ${operator.participant} / exp ${operator.experimentId} / cond ${operator.conditionId} / exposure ${operator.priorExposure}`,
      `  build        ${__CROWN_WATERMARK__.commit}${__CROWN_WATERMARK__.dirty ? ' (dirty)' : ''}`,
      ...dials.modeReadout(),
      `  presentation ${dials.presentationId()}${lab.pres.id === dials.presentationId() ? '' : ` -> ${lab.pres.id}`}`,
      `  apotheosis   ${lab.apotheosis.tier} (0 cycle)`,
      `  camera       ${labCamera.eases() ? 'action' : labCamera.motion === 'action' ? 'static (forced)' : 'static'} (/ toggle)`,
      `  aim          ${input.aimMode}`,
      `  material     ${dials.packId()} (${audio.loadedCount} cues)`,
      `  music        ${audio.musicStatus}`,
      `  models       ${dials.modelBankId()}`,
      `  turntable    ${showcase.role() ?? 'off'} / ${showcase.state().id} (8 role / 9 state)`,
      `  maze portal  steps ${lab.mazePortalDirection} (U toggle)`,
      `  room render  ${
        !roomDressingEnabled()
          ? 'drawn — primitives (room dressing off)'
          : webglRoomFor(lab.world.encounter.defId, lab.world.arena, () => lab.world) !== null
          ? 'live — webgl, lit by the fight'
          : webglRoomsPending.has(lab.world.encounter.defId)
            ? 'live — mesh still loading'
            : roomPainterFor(lab.world.encounter.defId) !== null
              ? 'baked — blender layers'
              : roomPackagesPending.has(lab.world.encounter.defId)
                ? 'baked — package still decoding'
                : 'drawn — primitives'
      }`,
      ...kingReadout(),
      `  fps meter    ${lab.flags.showFpsMeter ? 'on' : 'off'}`,
      `  weather      ${currentWeatherId()}`,
      `  power        ${lab.combat.power}`,
      `  tutorial     ${tutorialCoach.currentId ?? '-'}`,
      `  friendly     melee ${lab.combat.friendlyFire.melee ? 'on' : 'off'} / arrows ${lab.combat.friendlyFire.projectiles ? 'on' : 'off'}`,
      `  replayable   ${kit.unreplayableReason() === null ? 'yes' : `NO (${kit.unreplayableReason()})`}`,
      '',
      ...(lab.run === null
        ? []
        : [
            ...routeReadout(
              FIRST_CROWN,
              lab.run.route,
              lab.world,
              copy.controls[kit.controlDevice()].interact,
            ),
            '',
          ]),
      `replay      ${lab.replay !== null ? `${lab.replay.cursor}/${lab.replay.intents.length}` : lab.replayStatus || '-'}`,
      lab.notice === '' ? '' : `note        ${lab.notice}`,
      '',
      'session',
      ...session.summary(dials.combatId(), dials.encounterId(), dials.slowMoId()),
    ];
    panelReadout.textContent = lines.join('\n');
  };


  const sweepProbes = sweepProbesFromSearch(location.search);
  const applySweepStep = (step: SweepStep): void => {
    const config =
      apotheosisProbe(step.apotheosis) ?? apotheosisFromSearch(`?apotheosis=${step.apotheosis}`);
    lab.apotheosis = config;
    document.documentElement.dataset.apotheosis = config.tier;
    fx.configure(lab.pres, lab.pal, config, labArchetypeColor);
    restoreContextState(ctx);
    const shadowed = neutralizeContextState(ctx, step.compositing);
    document.documentElement.dataset.labCompositing = shadowed > 0 ? step.compositing : 'none';
    setRoomMsaa(step.room?.msaa ?? true);
    setRoomScale(step.room?.scale ?? 1);
  };
  const postSweep = (report: SweepReport): void => {
    lab.notice = 'sweep done — posting';
    void fetch('/lab-sweep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    }).then(
      () => {
        lab.notice = `sweep written · drift ${report.controlDriftMs?.toFixed(1) ?? '?'}ms`;
      },
      (error: Error) => {
        console.log('[sweep]', JSON.stringify(report));
        lab.notice = `sweep not posted (${error.message}) — see console`;
      },
    );
  };
  const sweep =
    sweepProbes === null
      ? null
      : createSweep({
          probes: sweepProbes,
          reps: 3,
          settleMs: 900,
          sampleMs: 2500,
          apply: applySweepStep,
          report: postSweep,
          now: () => new Date().toISOString(),
          environment: () => ({
            userAgent: navigator.userAgent,
            devicePixelRatio: window.devicePixelRatio || 1,
            viewport: { width: canvas.clientWidth, height: canvas.clientHeight },
            liveRoom:
              roomDressingEnabled() &&
              webglRoomFor(lab.world.encounter.defId, lab.world.arena, () => lab.world) !== null,
          }),
        });

  let preload: ReturnType<typeof preloadLab> | null = null;
  const startPreload = (): ReturnType<typeof preloadLab> =>
    preload ??= preloadLab(() => lab.world);
  const showThreshold = thresholdFromSearch(location.search);



  let framesDrawn = 0;

  const stoodOnTick = (): boolean => lab.replay !== null && lab.flags.paused;



  const publishRunState = (): void => {
    if (
      lab.replay === null ||
      roomPackagesPending.size > 0 ||
      webglRoomsPending.size > 0 ||
      castMeshPending.size > 0
    ) {
      return;
    }
    const root = document.documentElement;
    root.dataset.runReady = 'true';
    root.dataset.runTick = String(lab.replay.cursor);
    root.dataset.runTicks = String(lab.replay.intents.length);
    root.dataset.runPaused = String(lab.flags.paused);
    root.dataset.runEncounter = dials.encounterId();

    root.dataset.runPresentation = dials.presentationId();
  };

  let siegeBedInForce: MusicBed | null = null;

  const waveBanner = new WaveBanner();

  let bannerWorld = lab.world;

  const frame = (nowMs: number): void => {
    framesDrawn += 1;
    const bootPreload = startPreload();
    const dtRealMs = Math.min(250, nowMs - lab.lastFrameMs);
    if (lab.run !== null) advanceVictory(lab.run, dtRealMs);
    lab.lastFrameMs = nowMs;
    lab.frameReading = frameMeter.sample(dtRealMs);
    if (sweep !== null && webglRoomsPending.size === 0 && sweep.tick(dtRealMs)) {
      lab.notice = sweep.status();
    }



    if (dials.encounterId() === ETERNAL_SIEGE_ID) {
      const boss = lab.world.enemies.find(
        (enemy) =>
          enemy.state.kind !== 'dead' && lab.combat.enemies[enemy.archetype].boss !== undefined,
      );
      const wanted =
        boss === undefined
          ? bossMusicBedForEncounter(ETERNAL_SIEGE_ID)
          : bossMusicBedForArchetype(boss.archetype);

      const same =
        siegeBedInForce !== null &&
        wanted !== null &&
        wanted.url === siegeBedInForce.url &&
        wanted.gain === siegeBedInForce.gain;
      if (wanted !== null && !same) {
        siegeBedInForce = wanted;
        audio.setMusicBed(wanted);
      }
    }

    if (lab.world !== bannerWorld) {
      bannerWorld = lab.world;
      waveBanner.reset();
    }
    waveBanner.update(dtRealMs);
    input.update(dtRealMs);


    if (!bootPreload.done()) {
      clock.clear();
      drawLoadingScreen(ctx, kit.layoutFrame(), lab.pal);
    } else {
      simulate(dtRealMs);
      render(dtRealMs);

      if (pausePlateVisible({
        paused: lab.flags.paused,
        instrumented: captureShot !== null || showcase.active || stoodOnTick(),
      })) {
        drawPauseScreen(ctx, kit.layoutFrame(), lab.pal, { hover: false });
      }
      if (heavyLoading()) {
        drawHeavyLoading(ctx, kit.layoutFrame(), lab.pal, 'cast', lab.world.tick * TICK_MS);
      }
      if (showThreshold) {
        drawTitleScreen(ctx, kit.layoutFrame(), lab.pal, {
          title: 'CROWN LAB',
          ready: true,
          hover: false,
          hoverTutorial: false,
        });
      }
    }

    lab.panelDueMs -= dtRealMs;
    if (lab.panelDueMs <= 0) {
      document.documentElement.dataset.runFrames = String(framesDrawn);
      publishRunState();
      updatePanel();
      syncFpsMeter();
      lab.panelDueMs = 100;
    }

    if (
      captureShot !== null &&
      roomPackagesPending.size === 0 &&
      webglRoomsPending.size === 0 &&
      castMeshPending.size === 0 &&
      document.documentElement.dataset.captureReady !== 'true'
    ) {
      document.documentElement.dataset.captureReady = 'true';
      document.documentElement.dataset.captureShot = captureShot.id;
      document.documentElement.dataset.captureTick = String(lab.world.tick);
      document.documentElement.dataset.captureEncounter = dials.encounterId();
      const drawn = castMeshDrawn();
      document.documentElement.dataset.captureRenderer = rendererId();
      document.documentElement.dataset.captureCastMeshes = String(drawn.meshes);
      document.documentElement.dataset.captureCastTriangles = String(drawn.triangles);
      document.documentElement.dataset.captureCastActors = String(castMeshActors(lab.world));
    }

    requestAnimationFrame(frame);
  };


  const resize = (): void => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const renderScale =
      canvasRenderScale(window.devicePixelRatio || 1) * labRenderScaleFromSearch(location.search);
    resizeCanvasBackingStore(canvas, ctx, w, h, renderScale);
    cam.width = w;
    cam.height = h;
    const contentBox = kit.layoutFrame().content;
    cam.offset = cameraOffsetFor(cam, contentBox);
    cam.zoom = labCamera.zoomFor(lab.world.arena, lab.world.encounter.defId, {
      w: contentBox.w,
      h: contentBox.h,
    });
    labCamera.cut({ w: contentBox.w, h: contentBox.h });
  };


  return { frame, resize, updatePanel, syncFpsMeter, startPreload };
};
