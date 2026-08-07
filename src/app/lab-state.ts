
import type { CombatConfig, Intent, World } from '../sim/types';
import type { Palette } from '../render/palette';
import type { ModelBank } from '../render/models';
import { cloneBank } from '../render/models';
import type { MazePortalDirection } from '../render/atmosphere';
import type { ApotheosisConfig } from '../render/apotheosis/config';
import { apotheosisFromSearch } from '../render/apotheosis/config';
import { apotheosisProbe } from '../render/apotheosis/probe-lab';
import type { KingIdentityId } from '../render/king-identities';
import type { RouteRun } from './route-run';
import type { RunRecord } from '../lab/telemetry';
import type { MasteryEstimate } from '../lab/estimator';
import type { ResolvedPresentation } from '../lab/presentation';
import { PRESENTATION_PRESETS, resolve, transformPalette } from '../lab/presentation';
import { COMBAT_PRESETS } from '../lab/config';
import { LAB_FULL_PALETTE } from '../render/palette-lab';
import { MODEL_BANKS } from '../render/cast/banks-lab';
import type { FrameMeterReading } from './frame';
import { readSafeAreaInsets } from './viewport';
import type { TouchControls } from './touch';
import type { LabPageControls } from './page-controls-lab';
import type { LabDials } from './lab-dials';
import type { CaptureShot } from './capture';
import { debugFlagsFromSearch } from './capture';

export interface ReplayState {
  intents: Intent[];
  slowMoIntensity: number[];
  cursor: number;
  expectedHash: number;
}

export interface LabState {
  apotheosis: ApotheosisConfig;
  mazePortalDirection: MazePortalDirection;
  combat: CombatConfig;
  world: World;
  attempt: number;
  run: RouteRun | null;
  touchControls: TouchControls | null;
  pageControls: LabPageControls | null;
  mobileViewMode: 'game' | 'lab';
  safeInsets: ReturnType<typeof readSafeAreaInsets>;
  localPlayer: number;
  kingIdentities: KingIdentityId[];
  models: ModelBank;
  pres: ResolvedPresentation;
  appliedPresentationKey: string;
  pal: Palette;
  aimDistance: number | null;
  vignetteOverride: number | null;
  castClipOverride: number | null;
  stepOnce: boolean;
  notice: string;
  lastRecord: RunRecord | null;
  lastMastery: MasteryEstimate | null;
  replay: ReplayState | null;
  replayStatus: string;
  lastFrameMs: number;
  frameReading: FrameMeterReading;
  panelDueMs: number;
  flags: {
    paused: boolean;
    showTimeline: boolean;
    showStates: boolean;
    showHitboxes: boolean;
    showPanel: boolean;
    showFpsMeter: boolean;
    invincible: boolean;
    infiniteStamina: boolean;
  };
}

export interface LabStateDeps {
  dials: LabDials;
  captureShot: CaptureShot | null;
  showcaseActive: boolean;
  portalSteps: string | null;
  touchCapable: boolean;
  frameReading: FrameMeterReading;
  search: string;
}

export const createLabState = (deps: LabStateDeps): LabState => {
  const pres = resolve(PRESENTATION_PRESETS[deps.dials.presentationId()]);
  const desktop = deps.captureShot === null && !deps.touchCapable;
  return {
    apotheosis:
      apotheosisProbe(new URLSearchParams(deps.search).get('apotheosis')?.trim().toLowerCase() ?? '')
      ?? apotheosisFromSearch(deps.search),
    mazePortalDirection:
      deps.portalSteps === 'down' || deps.captureShot?.id === 'maze-portal-down' ? 'down' : 'up',
    combat: structuredClone(COMBAT_PRESETS[deps.dials.combatId()]),
    world: undefined as unknown as World,
    attempt: 1,
    run: null,
    touchControls: null,
    pageControls: null,
    mobileViewMode: 'game',
    safeInsets: readSafeAreaInsets(),
    localPlayer: 0,
    kingIdentities: [],
    models: cloneBank(MODEL_BANKS[deps.dials.modelBankId()]),
    pres,
    appliedPresentationKey: '',
    pal: transformPalette({ ...LAB_FULL_PALETTE }, pres.visual, pres.preserveThreatColors),
    aimDistance: null,
    vignetteOverride: null,
    castClipOverride: null,
    stepOnce: false,
    notice: '',
    lastRecord: null,
    lastMastery: null,
    replay: null,
    replayStatus: '',
    lastFrameMs: performance.now(),
    frameReading: deps.frameReading,
    panelDueMs: 0,
    flags: {
      paused: deps.captureShot !== null || deps.showcaseActive,
      showTimeline: desktop,
      showStates: desktop,
      showHitboxes: debugFlagsFromSearch(deps.search).showHitboxes,
      showPanel: desktop,
      showFpsMeter: false,
      invincible: false,
      infiniteStamina: false,
    },
  };
};
