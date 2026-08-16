
import type { CombatConfig, Intent, Player, SlowMoConfig, World } from '../sim/types';
import { NEUTRAL_INTENT, TICK_MS } from '../sim/types';
import { PALETTE } from '../render/palette';
import { publicArchetypeColor } from '../render/palette';
import { createWorld } from '../sim/encounter';
import { stepPublicWorld } from '../sim/world';
import {
  PUBLIC_COMBAT,
  PUBLIC_ENCOUNTERS,
  PUBLIC_PRESENTATION,
  PUBLIC_SLOWMO_STATIC,
} from '../game/public-profile';
import { arenaViewMargin } from '../render/arena-decor';
import { PUBLIC_ROOMS } from '../render/rooms/index-public';
import {
  advanceVictory,
  applyRouteIntents,
  createRouteRun,
  currentNode,
  drawRoom,
  nextNode,
  enterRoom,
  speakerHoldsMovement,
  observeRoom,
  offersInteract,
  retryRoom,
  roomEncounter,
  gateRouteIntents,
  roomSceneOpts,
  type RoomChange,
} from './route-run';
import {
  CoopSession,
  browserDeps,
  coopIntentFromSearch,
  coopJoinLink,
  signalingUrlFor,
  type CoopOptions,
} from './coop';
import { FIRST_CROWN, ROUTES, TRAINING_YARD, type Route } from '../game/route';
import { findCoopControls } from './coop-controls';
import type { EnvoyAction, EnvoyParting } from '../game/envoy';
import {
  nextWorldSeed,
  partCoopRoster,
  roomWorldSeed,
  seatCoopRoster,
  seatIdentities,
} from './coop-world';
import { CHECKPOINT_INTERVAL, fingerprintWorld } from '../sim/fingerprint';
import { identityById, identityModels, identityPalette } from '../render/king-identities';
import type { KingIdentityId } from '../render/king-identities';
import {
  fitZoom,
  gameplayViewMargin,
  makeCamera,
  cameraOffsetFor,
  rosterLook,
} from '../render/iso';
import { ActionCamera, actionShot } from '../render/action-camera';
import type { CameraShot } from '../render/action-camera';
import { drawScene } from '../render/draw';
import { WaveBanner } from '../render/wave-banner';
import { FxLayer } from '../render/fx';
import { apotheosisFromSearch } from '../render/apotheosis/config';
import { drawHud } from '../render/hud';
import { PUBLIC_BLOCKING_AUDIO } from '../render/asset-registry';
import { createPreload } from './preload';
import { crossThresholdAtBoot, drawTitleScreen, titleLayout } from '../render/title-screen';
import { drawPauseScreen, pauseLayout, pausePlateVisible } from '../render/pause-screen';
import { hits } from '../render/overlay-controls';
import { allowHeavy, heavyAllowed, heavyGroup } from '../render/heavy-assets';
import {
  drawHeavyLoading,
  drawHeavyPrompt,
  heavyPromptLayout,
  type HeavyOffer,
  type HeavyPromptView,
} from '../render/heavy-prompt';
import { VICTORY_FADE_MS, drawVictoryExits, victoryExitLayout } from '../render/victory';
import { Audio } from '../render/audio';
import {
  PUBLIC_MATERIAL,
  cueForEvent,
  bossMusicBedFor,
} from '../render/soundbank';
import { cloneBank } from '../render/models';
import { PUBLIC_MODELS } from '../render/cast/index-public';
import type { ModelBank } from '../render/models';
import { InputSource, screenHorizontal, screenVertical } from './input';
import type { InputDevice } from './input';
import { TouchControls } from './touch';
import { FrameClock } from './frame';
import { retryHintFor } from '../game/controls';
import { copyFor, localeFrom } from '../game/copy';
import {
  canvasRenderScale,
  readSafeAreaInsets,
  resizeCanvasBackingStore,
} from './viewport';
import { resolveLayout, type LayoutFrame } from '../render/layout';
import { installAimResolvers } from './host-aim';
import { HostFocus } from './host-focus';
import { HostEventFeed } from './host-events';
import { TutorialCoach } from '../game/tutorial';
import { controlNamesFor } from '../game/controls';
import { PageControls } from './page-controls';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', {
  alpha: false,
}) as CanvasRenderingContext2D;
const touchCapable =
  (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
  window.matchMedia?.('(pointer: coarse)').matches === true;

const combat: CombatConfig = structuredClone(PUBLIC_COMBAT);


combat.power = 'lightning';






const slowMo: SlowMoConfig = {
  ...PUBLIC_SLOWMO_STATIC,
  triggers: ['parry_streak', 'lethal_heavy', 'last_enemy'],
  streakThreshold: 3,
  cooldownMs: 5200,
  maxPerEncounter: 3,
};
const pres: typeof PUBLIC_PRESENTATION = {
  ...PUBLIC_PRESENTATION,
  visual: { ...PUBLIC_PRESENTATION.visual, facingMarks: false },

  hud: { ...PUBLIC_PRESENTATION.hud, peripheral: false },
};
const locale = localeFrom(
  navigator.languages ?? (navigator.language === undefined ? [] : [navigator.language]),
);
const copy = copyFor(locale);
let run = createRouteRun(PUBLIC_ENCOUNTERS, copy.herald.leave);
let encounter = PUBLIC_ENCOUNTERS[currentNode(run).encounterId];
const encounterId = (): string => currentNode(run).encounterId;
const pal = { ...PALETTE };
const apotheosis = apotheosisFromSearch(
  (window as Window & { location?: Location }).location?.search ?? '',
);
if (apotheosis.interfaceChrome) document.body.classList.add('apotheosis');
const documentRoot = (document as unknown as { documentElement?: HTMLElement }).documentElement;
if (documentRoot !== undefined) documentRoot.dataset.apotheosis = apotheosis.tier;

if (documentRoot !== undefined) documentRoot.dataset.renderer = 'canvas2d';
const waveBanner = new WaveBanner();
const fx = new FxLayer();
const audio = new Audio();
const cam = makeCamera(canvas.clientWidth, canvas.clientHeight);
const input = new InputSource(canvas, { bufferMs: 120 });
let touchControls: TouchControls | null = null;
const touchActive = (): boolean => input.activeDevice === 'touch';
const syncInputDevice = (device: InputDevice): void => {
  document.body.classList.toggle('input-touch', device === 'touch');
  if (device !== 'touch') touchControls?.releaseAll();
};
let models: ModelBank = cloneBank(PUBLIC_MODELS);
let world!: World;
let attempt = 0;
let aimDistance: number | null = null;
let paused = false;
let safeInsets = readSafeAreaInsets();
const interactVerb = (): string => copy.controls[controlDevice()].interact;
const moveVerb = (): string => copy.controls[controlDevice()].move;
const controlDevice = (): 'touch' | 'pointer' =>
  input.activeDevice === 'touch' ? 'touch' : 'pointer';

const layoutFrame = (): LayoutFrame =>
  resolveLayout({
    viewport: { w: cam.width, h: cam.height },
    safe: safeInsets,
    device: touchCapable ? 'touch' : 'pointer',
    padLive: touchActive(),
    profile: 'game',
    active: {
      verdict: world.outcome !== 'running',
      narration: speakerHoldsMovement(run, world, localPlayer),
      threat: world.enemies.some(
        (enemy) => enemy.state.kind !== 'dead' && combat.enemies[enemy.archetype].boss !== undefined,
      ),
    },
  });

const SIGNALING_URL = signalingUrlFor(__CROWN_SIGNALING_URL__, location);
let coop: CoopSession | null = null;
let coopRoom = '';
let coopState = '';
let localPlayer = 0;
let coopParting: EnvoyParting = 'none';
let coopPlayed = false;
let replacingCoop = false;
let coopStalledMs = 0;
let envoyWasOpen = false;
const COOP_STALL_MS = 5000;
let kingIdentities: KingIdentityId[] = [];
let worldSeed = 1;

const localKing = (state: World = world): Player => state.players[localPlayer] ?? state.players[0];

const kingDressings = () =>
  kingIdentities.map((id) => {
    const identity = identityById(id);
    return {
      pal: identityPalette(pal, identity, pres.visual, pres.preserveThreatColors),
      models: identityModels(models, identity),
    };
  });

const startCoop = (wanted: CoopOptions['intent']): void => {

  if (coop?.playing === true) return;
  if (coop !== null) {
    replacingCoop = true;
    coop.close();
    replacingCoop = false;
    coop = null;
    coopRoom = '';
    coopState = '';
    coopPlayed = false;
  }
  coopParting = 'none';
  coopStalledMs = 0;
  if (SIGNALING_URL === '') {
    coopState = 'sem origem para o encontro — abra esta build por http';
    syncCoopControls();
    return;
  }
  coopState = 'connecting';
  coop = new CoopSession({
    intent: wanted,
    size: wanted.kind === 'host' ? wanted.size : undefined,
    inputDelay: 12,
    checkpointInterval: CHECKPOINT_INTERVAL,
    deps: browserDeps(SIGNALING_URL),
    onRoom: (room) => {
      coopRoom = room;
      syncCoopControls();
    },
    onLobby: () => syncCoopControls(),
    onStateChange: (state) => {
      if (replacingCoop) return;
      if (state === 'closed') {
        dropCoop();
        return;
      }
      coopState = state;
      syncCoopControls();
      if (state !== 'playing') return;
      coopPlayed = true;
      const room = coop?.room ?? '';
      const size = coop?.rosterSize ?? 1;
      localPlayer = coop?.localPlayer ?? 0;
      kingIdentities = seatIdentities(room, size);
      restartRoute(roomWorldSeed(room));
    },
  });
  syncCoopControls();
};

const dropCoop = (): void => {
  const played = coopPlayed;
  coop = null;
  coopRoom = '';
  coopState = '';
  coopPlayed = false;
  coopStalledMs = 0;
  coopParting = played ? 'left' : 'refused';

  if (played) localPlayer = partCoopRoster(world, kingIdentities, [run.herald, run.envoy], localPlayer);
  syncCoopControls();
};

const applyEnvoyAction = (action: EnvoyAction): void => {
  if (action === 'call') startCoop({ kind: 'host' });
  if (action === 'copy') copyJoinLink();


  if (action === 'join') {
    const room = run.envoy.entry;
    if (room !== '') startCoop({ kind: 'join', room });
  }
};

const copyJoinLink = (): void => {
  const link = coopJoinLink(location.href, coopRoom);
  if (link === '') return;
  void navigator.clipboard?.writeText(link);
};

const coopControls = findCoopControls(document, {
  onHost: () => startCoop({ kind: 'host' }),
  onJoin: (room) => startCoop({ kind: 'join', room }),
  onCopyLink: () => copyJoinLink(),
  onStart: () => coop?.start(),
});

function syncCoopControls(): void {
  const inCourt = currentNode(run).id === 'court' && run.victoryMs === null;
  coopControls?.update({
    available: SIGNALING_URL !== '' && (inCourt || coopState !== ''),
    session: coopState,
    room: coopRoom,
    lobby: coop?.lobby ?? null,
  });
  coopControls?.setHidden(!inCourt && coopState === '');
}

const clock = new FrameClock();
let lastFrameMs = performance.now();
const focus = new HostFocus({
  audio,
  paused: () => paused,
  lockstepLive: () => coop?.playing === true,
  onWake: () => {
    clock.clear();
    lastFrameMs = performance.now();
  },
});
const eventFeed = new HostEventFeed({
  audio,
  cam,
  world: () => world,
  combat: () => combat,
  cueForEvent,
  panAnchor: () => localKing(),
});
const gameplayPaused = (): boolean => paused || focus.simulationInBackground();
const setPaused = (next: boolean): void => {
  paused = next;
  focus.syncAudioPause();
};

const viewMargin = (): number =>
  gameplayViewMargin(arenaViewMargin(PUBLIC_ROOMS, encounterId()), touchActive());
const hasBoss = (def: typeof encounter = encounter): boolean =>
  def.waves.some((wave) =>
    wave.spawns.some((spawn) => combat.enemies[spawn.archetype].boss !== undefined),
  );

const availableTouchActions = (): Set<string> => {
  const actions = new Set(['light', 'heavy', 'guard', 'step', 'power']);
  if (world !== undefined && offersInteract(run, world, combat, localKing())) actions.add('interact');
  return actions;
};

const applyCamera = (arena: Parameters<typeof fitZoom>[1]): void => {
  const content = layoutFrame().content;
  cam.offset = cameraOffsetFor(cam, content);
  cam.zoom = fitZoom(cam, arena, viewMargin(), { w: content.w, h: content.h });
};

const camera = new ActionCamera();

const cameraTargets = (): CameraShot => {
  const content = layoutFrame().content;
  const box = { w: content.w, h: content.h };


  const living = world.players.filter((player) => player.state.kind !== 'dead');
  const kings = (living.length > 0 ? living : world.players).map((player) => player.pos);
  const look = rosterLook(kings);
  return actionShot(
    cam,
    world,
    combat,
    kings,
    { zoom: fitZoom(cam, world.arena, viewMargin(), box), focus: { x: look.x * 0.3, y: look.y * 0.3 } },
    viewMargin(),
    box,
  );
};

const advanceCamera = (dtRealMs: number): void => {
  camera.advance(cam, cameraTargets(), dtRealMs);
  cam.offset = cameraOffsetFor(cam, layoutFrame().content);
};


const restart = (seed: number = worldSeed): void => {
  input.clearTouch();
  attempt += 1;
  worldSeed = seed;
  encounter = roomEncounter(run, PUBLIC_ENCOUNTERS);
  world = createWorld(encounter, combat, worldSeed);
  enterRoom(run, world, combat);
  if (coop?.playing === true) seatCoopRoster(world, combat, coop.rosterSize ?? 1);
  models = cloneBank(PUBLIC_MODELS);
  cam.arena = world.arena;
  tutorialCoach.reset(encounter, combat.power, slowMo.mode);
  audio.setMusicBed(bossMusicBedFor(encounter.id, hasBoss()));
  waveBanner.reset();
  audio.setMusicGate(!hasBoss());
  audio.resetMusicMuffle();
  fx.reset();
  touchControls?.setAvailable(availableTouchActions());
  applyCamera(encounter.arena);
  camera.cut(cameraTargets());
  syncCoopControls();
};

const currentRoute = (): Route =>
  run === undefined ? FIRST_CROWN : ROUTES[run.route.routeId] ?? FIRST_CROWN;

const restartRoute = (seed: number, route: Route = currentRoute()): void => {
  run = createRouteRun(PUBLIC_ENCOUNTERS, copy.herald.leave, undefined, route);
  attempt = 0;
  combat.power = run.power;
  restart(seed);
};


const retry = (): void => {
  retryRoom(run);
  restart();
};

const enterNode = (change: NonNullable<RoomChange>): void => {
  setPaused(false);
  run.arriveFrom = change.from;
  restart(coop?.playing === true ? nextWorldSeed(world, change.node.id) : worldSeed);
  const ahead = nextNode(run);
  if (ahead !== null) {

    const next = PUBLIC_ENCOUNTERS[ahead.encounterId];
    audio.prefetchMusicBed(bossMusicBedFor(next.id, hasBoss(next)));
  }
};

const acceptsCommands = (state: World): boolean => {
  const kind = localKing(state).state.kind;
  return kind === 'idle' || kind === 'move' || kind === 'guard' || kind === 'parry';
};

const seatLocalIntent = (intent: Intent): Intent[] => {
  if (localPlayer === 0) return [intent];
  const seated: Intent[] = new Array<Intent>(localPlayer + 1).fill(NEUTRAL_INTENT);
  seated[localPlayer] = intent;
  return seated;
};

const watchCoopStall = (stalled: boolean, stepped: boolean, dtRealMs: number): void => {
  if (coop === null || !coop.playing || coop.desync !== null) {
    coopStalledMs = 0;
    return;
  }
  if (stalled) coopStalledMs += dtRealMs;
  else if (stepped) coopStalledMs = 0;
  if (coopStalledMs < COOP_STALL_MS) return;
  coop.close();
};

const simulate = (dtRealMs: number): void => {
  if (gameplayPaused()) return;
  if (hasBoss() && world.tick === 0 && !audio.musicReady) {
    clock.clear();
    return;
  }
  clock.add(dtRealMs);
  const budget = clock.budget(TICK_MS);
  let spent = 0;
  let stalled = false;
  let stepped = false;
  while (spent + TICK_MS <= budget) {
    const sampled = input.sample(acceptsCommands(world));
    aimDistance = sampled.aimDistance;


    const intent = sampled;



    const intents = coop?.playing === true ? coop.advance(intent) : seatLocalIntent(intent);
    if (intents === null) {
      stalled = true;
      break;
    }



    const effect = applyRouteIntents(
      run,
      world,
      combat,
      intents,
      (i) => screenVertical(i.move),
      { state: coopState, available: SIGNALING_URL !== '' },
      (i) => screenHorizontal(i.move),
    );
    applyEnvoyAction(effect.envoy);

    if (envoyWasOpen && !run.envoy.open) coopParting = 'none';
    envoyWasOpen = run.envoy.open;
    touchControls?.setAvailable(availableTouchActions());
    if (effect.change !== null) {
      clock.clear();
      enterNode(effect.change);
      return;
    }
    stepPublicWorld(world, gateRouteIntents(run, world, intents), combat, slowMo, encounter);
    observeRoom(run, world, combat);
    if (coop !== null && world.tick % CHECKPOINT_INTERVAL === 0) {
      coop.checkpoint(world.tick, fingerprintWorld(world));
    }
    tutorialCoach.update(intents[localPlayer] ?? NEUTRAL_INTENT, world.events);
    eventFeed.absorb(world.events);
    fx.consume(world.events, world);
    for (const event of world.events) {
      if (event.type !== 'wave_spawned') continue;
      const wave = String(event.data?.wave ?? '');
      const boss = world.enemies.find(
        (enemy) => enemy.state.kind !== 'dead' && combat.enemies[enemy.archetype].boss !== undefined,
      );
      waveBanner.announce(
        boss === undefined
          ? `${copy.hud.wave.toUpperCase()} ${wave.replace(/^w/, '')}`
          : copy.hud.bossWave,
      );
    }
    stepped = true;
    spent += TICK_MS;
  }
  clock.spend(spent);
  watchCoopStall(stalled, stepped, dtRealMs);
  touchControls?.setAvailable(availableTouchActions());
};

const renderWorld = (dtRealMs: number): void => {
  fx.update(dtRealMs);
  waveBanner.update(dtRealMs);
  cam.arena = world.arena;
  advanceCamera(dtRealMs);
  fx.applyShake(cam);

  drawScene(ctx, world, cam, {
    localPlayer,
    kingDressing: kingDressings(),
    cfg: combat,
    pal,
    pres,
    apotheosis,
    models,
    archetypeColor: publicArchetypeColor,
    rooms: PUBLIC_ROOMS,
    showHitboxes: false,
    aimDistance,
    groundFx: () => fx.drawGround(ctx, cam, world),
    ...roomSceneOpts(run, world, combat, {
      ctx,
      cam,
      pal,
      frame: layoutFrame(),
      simTimeMs: world.tick * TICK_MS,
    }),
  });
};

const render = (dtRealMs: number): void => {
  renderWorld(dtRealMs);
  const routePrompted = drawRoom(
    ctx,
    run,
    world,
    cam,
    pal,
    layoutFrame(),
    combat,
    interactVerb(),
    world.tick * TICK_MS,
    attempt,
    moveVerb(),
    copy.herald,
    { state: coopState, room: coopRoom, available: SIGNALING_URL !== '', parting: coopParting },
    copy.puzzle,
    localPlayer,
  );
  fx.drawAir(ctx, cam);
  drawHud(ctx, world, {
    waveAnnouncement: waveBanner.text(),
    archetypeColor: publicArchetypeColor,
    localPlayer,
    cfg: combat,
    pal,
    pres,
    attempt,
    replaying: false,
    viewW: cam.width,
    viewH: cam.height,
    waveCount: encounter.waves.length,
    touchControls: touchActive(),
    showPowerCooldown: false,
    frame: layoutFrame(),
    outcomeLabels: copy.outcome,
    copy,
    retryHint: retryHintFor(controlDevice(), locale),
    tutorialPrompt: tutorialCoach.prompt,
    routePrompted,
  });
};

const preload = createPreload(PUBLIC_BLOCKING_AUDIO);

const tutorialCoach = new TutorialCoach(controlNamesFor(controlDevice(), locale), copy);

let started = crossThresholdAtBoot(location.search);
let pointerAt: { x: number; y: number } | null = null;

const thresholdReady = (): boolean => preload.done();

const crossThreshold = (route: Route = FIRST_CROWN): void => {
  if (started || !thresholdReady()) return;
  started = true;
  if (route.id !== run.route.routeId) restartRoute(worldSeed, route);
  audio.init();
};

const returnToThreshold = (): void => {
  setPaused(false);
  restartRoute(worldSeed);
  pointerAt = null;
  started = false;
};

const drawThreshold = (): void => {
  const layout = layoutFrame();
  if (thresholdReady()) {
    renderWorld(0);
  } else {
    ctx.fillStyle = pal.floor;
    ctx.fillRect(0, 0, layout.viewport.w, layout.viewport.h);
  }
  const doors = titleLayout(layout);
  drawTitleScreen(ctx, layout, pal, {
    title: 'CROWN',
    ready: thresholdReady(),
    hover: pointerAt !== null && hits(doors.play, pointerAt),
    hoverTutorial: pointerAt !== null && hits(doors.tutorial, pointerAt),
  });
};

const drawPause = (): void => {
  const layout = layoutFrame();
  drawPauseScreen(ctx, layout, pal, {
    hover: pointerAt !== null && hits(pauseLayout(layout).quit, pointerAt),
  });
};


const MUSIC_OFFER: HeavyOffer = {
  id: 'music',
  label: 'score',
  bytes: __CROWN_ASSET_BYTES__.heavy.music,
};

let confirming: HeavyOffer | null = null;

const pendingOffers = (): HeavyOffer[] =>
  heavyAllowed('music') || heavyGroup('music').loading ? [] : [MUSIC_OFFER];

const heavyView = (): HeavyPromptView => ({
  offers: pendingOffers(),
  confirming,
  loading: heavyGroup('music').loading ? MUSIC_OFFER : null,
  pointerAt,
});

const heavySurfaceUp = (): boolean => {
  const view = heavyView();
  return view.offers.length > 0 || view.confirming !== null || view.loading !== null;
};

const grantMusic = (): void => {
  confirming = null;
  allowHeavy('music');
  void audio.downloadMusic();
};

const frame = (nowMs: number): void => {
  const dtRealMs = Math.min(250, nowMs - lastFrameMs);

  if (!gameplayPaused()) advanceVictory(run, dtRealMs);
  lastFrameMs = nowMs;
  input.update(dtRealMs);


  if (!started) {
    drawThreshold();
    requestAnimationFrame(frame);
    return;
  }
  simulate(dtRealMs);
  render(dtRealMs);
  if (run.victoryMs !== null) {
    drawVictoryExits(ctx, layoutFrame(), pal, {
      elapsedMs: run.victoryMs,
      pointerAt,
    });
  }
  if (pausePlateVisible({ paused, instrumented: false })) {
    drawPause();
    if (heavySurfaceUp()) drawHeavyPrompt(ctx, layoutFrame(), pal, heavyView());
  } else if (heavyGroup('music').loading) {
    drawHeavyLoading(ctx, layoutFrame(), pal, 'score', nowMs);
  }
  requestAnimationFrame(frame);
};

const resize = (): void => {
  safeInsets = readSafeAreaInsets();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const renderScale = canvasRenderScale(window.devicePixelRatio || 1);
  resizeCanvasBackingStore(canvas, ctx, width, height, renderScale);
  cam.width = width;
  cam.height = height;
  applyCamera(world.arena);
};

installAimResolvers(input, cam, () => localKing(), () => world);

input.aimMode = 'auto_nearest';
if (touchCapable) {
  input.useDevice('touch');
}
input.attach();


const overlayUp = (): boolean => !started || paused;

const victoryExitsUp = (): boolean =>
  started && !paused && run.victoryMs !== null && run.victoryMs >= VICTORY_FADE_MS * 2;

const pointerIn = (event: PointerEvent): { x: number; y: number } => {
  const box = canvas.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
};

canvas.addEventListener('pointermove', (event) => {
  pointerAt = overlayUp() || victoryExitsUp() ? pointerIn(event) : null;
});
canvas.addEventListener('pointerdown', (event) => {
  if (!overlayUp() && !victoryExitsUp()) return;
  const at = pointerIn(event);
  pointerAt = at;
  const layout = layoutFrame();
  if (!started) {
    const doors = titleLayout(layout);
    if (hits(doors.play, at)) crossThreshold(FIRST_CROWN);
    else if (hits(doors.tutorial, at)) crossThreshold(TRAINING_YARD);
    return;
  }
  if (paused) {
    if (heavySurfaceUp()) {
      const heavy = heavyPromptLayout(layout, pendingOffers());
      if (confirming !== null) {
        if (hits(heavy.confirm, at)) grantMusic();
        else if (hits(heavy.cancel, at)) confirming = null;
        return;
      }
      const offered = heavy.offers.find((slot) => hits(slot.rect, at));
      if (offered !== undefined) {
        confirming = MUSIC_OFFER;
        return;
      }
    }
    if (hits(pauseLayout(layout).quit, at)) returnToThreshold();
    return;
  }
  const exits = victoryExitLayout(layout);
  if (hits(exits.again, at)) restartRoute(worldSeed);
  else if (hits(exits.menu, at)) returnToThreshold();
});

window.addEventListener('keydown', (event) => {
  audio.init();
  if (!started) {
    if (event.code === 'Enter' || event.code === 'Space') crossThreshold(FIRST_CROWN);
    return;
  }
  if (event.code === 'KeyR') retry();
  if (event.code === 'KeyP') {
    setPaused(!paused);
    pointerAt = null;
  }
  if (event.code === 'Escape' && paused) returnToThreshold();
  if (event.code === 'KeyM') audio.setEnabled(!audio.isEnabled());
  if (event.code === 'KeyF' && document.fullscreenEnabled) {
    const request =
      document.fullscreenElement === null
        ? document.documentElement.requestFullscreen({ navigationUI: 'hide' })
        : document.exitFullscreen();
    void request.catch(() => undefined);
  }
});

if (touchCapable) {
  document.body.classList.add('touch-enabled');
  const root = document.getElementById('touch-controls');
  if (root !== null) {
    touchControls = new TouchControls(root, input, () => audio.init());
    touchControls.attach();
    touchControls.setAvailable(availableTouchActions());
  }
  syncInputDevice(input.activeDevice);
}

new PageControls({
  audioInit: () => audio.init(),
  restart: retry,
  paused: () => paused,
  setPaused,
  notice: () => {},
  resize,
});

audio.applyPresentation(pres);
audio.setPack(PUBLIC_MATERIAL);
fx.configure(pres, pal, apotheosis);
restart();
resize();
input.onDeviceChange = (device) => {
  syncInputDevice(device);
  resize();
};
window.addEventListener('resize', resize);
focus.attach();


const wantedCoop = coopIntentFromSearch(location.search);
if (wantedCoop !== null) {
  started = true;
  startCoop(wantedCoop);
}

requestAnimationFrame(frame);
