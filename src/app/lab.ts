
import { labCompositingFromSearch, neutralizeContextState } from '../render/context-state-lab';
import { coopIntentFromSearch, signalingUrlFor } from './coop';
import { findCoopControls } from './coop-controls';
import { installAimResolvers } from './host-aim';
import { HostFocus } from './host-focus';
import { createRunLoader, filePicker } from './run-io-lab';
import { LabCamera, captureCameraFramesAction } from './lab-camera';
import { LabPageControls } from './page-controls-lab';
import { LabCoop } from './lab-coop';
import { LabDials } from './lab-dials';
import { LabEventFeed } from './lab-events';
import { createLabState } from './lab-state';
import { createLabKit, type LabHarness } from './lab-kit';
import {
  castCapeFromSearch,
  castMeshFromSearch,
  configureCastMesh,
  setCastCapeSway,
  setCastMeshEnabled,
} from './lab-cast-mesh';
import { createLabFlow } from './lab-flow';
import { createLabCommands } from './lab-commands';
import { createLabFrame } from './lab-frame';
import { roomWorldSeed, seatCoopRoster, seatIdentities } from './coop-world';
import { SLOWMO_PRESETS } from '../lab/config';
import {
  ENCOUNTERS,
  
  
  
} from '../lab/encounters';
import {
  
  Recorder,
  operatorMetaFromSearch,
} from '../lab/telemetry';
import { modeIdFromSearch } from '../lab/modes';
import { Session } from '../lab/session';
import { LiveMastery } from '../lab/live';
import { PresentationOrchestrator } from '../lab/orchestrator';
import { FocusVignette } from '../render/focus-vignette-lab';
import { TutorialCoach } from '../game/tutorial';
import {
  
  
  makeCamera,
  
} from '../render/iso';
import { LAB_ROOMS } from '../render/rooms/index-lab';

import { FxLayer } from '../render/fx';
import {
  
  createRouteRun,
  
  
  
  
  
  type RouteRun,
} from './route-run';
import { Audio } from '../render/audio';
import { MATERIAL_PACKS } from '../render/materials-lab';
import { meshDownloadAllowed } from '../render/heavy-assets';
import { ShowcaseLab } from './showcase-lab';
import { InputSource } from './input';
import type { AimMode } from './input';
import { TouchControls } from './touch';
import { FrameClock, FrameMeter } from './frame';
import { controlNamesFor } from '../game/controls';
import { copyFor, labCopyFor, localeFrom } from '../game/copy';
import { captureShotFromSearch, prepareCaptureWorld } from './capture';
import { FIRST_CROWN } from '../game/route';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const panel = document.getElementById('panel') as HTMLDivElement;
const panelReadout =
  (document.getElementById('panel-readout') as HTMLDivElement | null) ?? panel;
const fpsMeterOutput = document.getElementById('fps-meter') as HTMLOutputElement | null;
const fpsMeterButton = panel.querySelector<HTMLButtonElement>('[data-lab-key="Digit6"]');
const coopControls = findCoopControls(document, {
  onHost: () => labCoop.start({ kind: 'host' }),
  onJoin: (room) => labCoop.start({ kind: 'join', room }),
  onCopyLink: () => kit.copyJoinLink(),
  onStart: () => labCoop.session?.start(),
});
const ctx = canvas.getContext('2d', {
  alpha: false,
}) as CanvasRenderingContext2D;

const labCompositing = labCompositingFromSearch(location.search);
if (neutralizeContextState(ctx, labCompositing) > 0) {
  document.documentElement.dataset.labCompositing = labCompositing;
}
const buildWatermark = __CROWN_WATERMARK__;
document.documentElement.dataset.labWatermark = buildWatermark.id;


const encounterIds = Object.keys(ENCOUNTERS);
const dials = new LabDials(encounterIds, {
  get: () => input.aimMode,
  set: (mode: AimMode) => {
    input.aimMode = mode;
  },
});
const turntableSearch = new URLSearchParams(location.search);
const requestedPortalSteps = turntableSearch.get('portalSteps');
const showcase = new ShowcaseLab(turntableSearch);
if (showcase.requestedBank !== null) {
  const bankIndex = dials.modelBankIds.indexOf(showcase.requestedBank);
  if (bankIndex >= 0) dials.modelBankIndex = bankIndex;
}
const captureShot = captureShotFromSearch(
  (window as Window & { location?: Location }).location?.search ?? '',
);
const syncApotheosisDom = (): void => {
  document.body.classList.toggle('apotheosis', lab.apotheosis.interfaceChrome);
  document.documentElement.dataset.apotheosis = lab.apotheosis.tier;
};
const session = new Session();
const recorder = new Recorder();
const liveMastery = new LiveMastery();
const presentationOrchestrator = new PresentationOrchestrator();
const focusVignette = new FocusVignette();
const fx = new FxLayer();
const audio = new Audio();
const cam = makeCamera(canvas.clientWidth, canvas.clientHeight);
const input = new InputSource(canvas, { bufferMs: 120 });
const touchCapable =
  (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
  window.matchMedia?.('(pointer: coarse)').matches === true;
if (touchCapable) {
  input.aimMode = 'auto_nearest';
  input.useDevice('touch');
}
const locale = localeFrom(
  navigator.languages ?? (navigator.language === undefined ? [] : [navigator.language]),
);
const copy = copyFor(locale);
const labCopy = labCopyFor(locale);
const operator = operatorMetaFromSearch(location.search);
const tutorialCoach = new TutorialCoach(
  controlNamesFor(touchCapable ? 'touch' : 'pointer', locale),
  labCopy,
  labCopy.tutorialSetup,
);

const labCamera = new LabCamera({
  cam,
  rooms: LAB_ROOMS,
  captureShot,
  world: () => lab.world,
  combat: () => lab.combat,
  touchActive: () => kit.touchActive(),
  showcaseActive: () => showcase.active,
});
labCamera.frameCapturesAsAction(captureCameraFramesAction(location.search));

const clock = new FrameClock();
const frameMeter = new FrameMeter();
const lab = createLabState({
  dials,
  captureShot,
  showcaseActive: showcase.active,
  portalSteps: requestedPortalSteps,
  touchCapable,
  frameReading: frameMeter.reading,
  search: location.search,
});
syncApotheosisDom();

const SIGNALING_URL = signalingUrlFor(__CROWN_SIGNALING_URL__, location);
const labCoop = new LabCoop({
  signalingUrl: SIGNALING_URL,
  onPanel: () => frameCtl.updatePanel(),
  onPlaying: () => {


    lab.run = createRouteRun(ENCOUNTERS, copy.herald.leave);
    flow.enterRouteNode(roomWorldSeed(labCoop.room));
    seatCoopRoster(lab.world, lab.combat, labCoop.session?.rosterSize ?? 1);
    lab.kingIdentities = seatIdentities(labCoop.room, labCoop.session?.rosterSize ?? 1);
    lab.localPlayer = labCoop.session?.localPlayer ?? 0;
  },
});

const focus = new HostFocus({
  audio,
  paused: () => lab.flags.paused,
  lockstepLive: () => labCoop.playing,
  onWake: () => {
    clock.clear();
    frameMeter.reset();
    lab.lastFrameMs = performance.now();
  },
});
const feed = new LabEventFeed({
  audio,
  cam,
  world: () => lab.world,
  combat: () => lab.combat,
  panAnchor: () => lab.world.players[lab.localPlayer] ?? lab.world.players[0],
});

const harness: LabHarness = {
  dials, audio, fx, cam, input, recorder, session, liveMastery,
  presentationOrchestrator, focusVignette, tutorialCoach, labCoop, labCamera, feed, showcase, clock,
  frameMeter, focus, coopControls, copy, labCopy, locale, operator, captureShot,
  signalingUrl: SIGNALING_URL, encounterIds, touchCapable, canvas, ctx, panel, panelReadout,
  fpsMeterOutput, fpsMeterButton, buildWatermark, syncApotheosisDom,
};

configureCastMesh({
  world: () => lab.world,
  combat: () => lab.combat,
  saturation: () => lab.pres.visual.saturation,
});
setCastMeshEnabled(meshDownloadAllowed() && castMeshFromSearch(location.search));
setCastCapeSway(castCapeFromSearch(location.search));
const kit = createLabKit(lab, harness, { updatePanel: () => frameCtl.updatePanel() });
const flow = createLabFlow(lab, kit, harness, { resize: () => frameCtl.resize() });
const runLabCommand = createLabCommands(lab, kit, harness, flow, {
  pickRun: () => runIo.pickRun(),
  pickSfx: () => sfxPicker.click(),
  syncFpsMeter: () => frameCtl.syncFpsMeter(),
});
const frameCtl = createLabFrame(lab, kit, harness, flow);

const runIo = createRunLoader({
  notice: (text) => {
    lab.notice = text;
  },
  adoptRecord: (record) => {
    lab.lastRecord = record;
  },
  startReplay: () => flow.startReplay(),
  seekReplay: (tick) => flow.seekReplay(tick),
  replaying: () => lab.replay !== null,
  replayStatus: () => lab.replayStatus,
});

const sfxPicker = filePicker('audio/*', (files) => {
  void audio.importFiles(files).then(({ matched }) => {
    dials.packIndex = -1;
    lab.notice = `imported ${matched.length} cues: ${matched.join(' ') || 'none matched'}`;
  });
});


const onKey = (e: KeyboardEvent): void => {
  audio.init();
  runLabCommand(e.code, e.shiftKey);
};


panel.addEventListener('click', (event) => {
  const target = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-lab-key]');
  if (target === null || target === undefined || !panel.contains(target)) return;
  audio.init();
  runLabCommand(target.dataset.labKey ?? '', target.dataset.labShift === 'true');
  frameCtl.updatePanel();
});


if (captureShot === null && dials.restore()) {
  lab.notice = `restored ${dials.combatId()} / ${dials.encounterId()} / seed ${dials.seed} — X to reset`;
}
dials.applyCapture(captureShot);

{
  const requestedMode = captureShot === null ? modeIdFromSearch(location.search) : null;
  if (requestedMode !== null) flow.applyMode(requestedMode);
}



if (captureShot === null || captureShot.id === 'herald-room' || captureShot.route !== undefined) {
  flow.enterRoute();
  const captureRun = lab.run as RouteRun | null;
  if (captureShot?.route !== undefined && captureRun !== null) {
    const index = FIRST_CROWN.nodes.findIndex((node) => node.id === captureShot.route?.nodeId);
    if (index < 0) throw new Error(`capture route node not found: ${captureShot.route.nodeId}`);
    captureRun.route.index = index;
    captureRun.route.furthest = index;
    if (captureShot.route.cleared) captureRun.route.cleared = [FIRST_CROWN.nodes[index].id];
    flow.enterRouteNode();
  }
} else {
  flow.restart();
}
frameCtl.startPreload();
if (captureShot !== null) {
  prepareCaptureWorld(
    lab.world,
    lab.combat,
    SLOWMO_PRESETS[dials.slowMoId()],
    kit.encounterDef(),
    captureShot.id,
  );
  fx.consume(lab.world.events, lab.world);
  fx.update(45);
  lab.notice = `capture ${captureShot.id} — frozen inspection fixture, not evidence`;
}
frameCtl.resize();
flow.applyPresentation();
audio.setPack(MATERIAL_PACKS[dials.packId()]);

installAimResolvers(input, cam, () => kit.localKing(), () => lab.world);

input.attach();
if (touchCapable) {
  document.body.classList.add('touch-enabled');
  const root = document.getElementById('touch-controls');
  if (root !== null) {
    lab.touchControls = new TouchControls(root, input, () => audio.init());
    lab.touchControls.attach();
    lab.touchControls.setAvailable(kit.availableTouchActions());
  }
  kit.syncInputDevice(input.activeDevice);
}

lab.pageControls = new LabPageControls({
  audioInit: () => audio.init(),
  restart: () => flow.restart(),
  paused: () => lab.flags.paused,
  setPaused: kit.setPaused,
  notice: (text) => {
    lab.notice = text;
  },
  resize: frameCtl.resize,
  encounters: () =>
    encounterIds.map((id) => ({ id, description: ENCOUNTERS[id].description })),
  currentEncounterId: () => dials.encounterId(),
  refuseWorldChange: () => {
    if (!labCoop.playing) return false;
    labCoop.state = 'playing — world locked, the peer cannot follow a change';
    return true;
  },
  selectEncounter: (id) => {
    const next = encounterIds.indexOf(id);
    if (next < 0) return;
    flow.reconfigure(() => {
      dials.encounterIndex = next;
    });
    dials.persist();
  },
  mazePortalDirection: () => lab.mazePortalDirection,
  toggleMazePortal: kit.toggleMazePortalDirection,
  updatePanel: frameCtl.updatePanel,
  applyViewMode: (mode) => {
    lab.mobileViewMode = mode;
    const detailed = mode === 'lab';
    lab.flags.showTimeline = detailed;
    lab.flags.showStates = detailed;
    lab.flags.showPanel = detailed;
  },
  viewMode: () => lab.mobileViewMode,
  touchCapable,
  panelShown: () => lab.flags.showPanel,
});
if (!touchCapable) lab.mobileViewMode = lab.flags.showPanel ? 'lab' : 'game';

input.onDeviceChange = (device) => {
  kit.syncInputDevice(device);
  frameCtl.resize();
};
window.addEventListener('resize', frameCtl.resize);
window.addEventListener('keydown', onKey);
focus.attach();

runIo.openRunFromSearch(location.search);
const wantedCoop = coopIntentFromSearch(location.search);
if (wantedCoop !== null) labCoop.start(wantedCoop);

requestAnimationFrame(frameCtl.frame);
