
import type { EncounterDef, Player, World } from '../sim/types';
import { powerPickupInReach } from '../sim/pickups';
import type { LayoutFrame } from '../render/layout';
import { resolveLayout } from '../render/layout';
import type { Camera } from '../render/iso';
import type { KingDressing } from '../render/draw';
import { identityById, identityModels, identityPalette } from '../render/king-identities';
import type { FxLayer } from '../render/fx';
import type { FocusVignette } from '../render/focus-vignette-lab';
import type { Audio } from '../render/audio';
import type { EnvoyAction } from '../game/envoy';
import { controlNamesFor } from '../game/controls';
import type { copyFor, labCopyFor, localeFrom } from '../game/copy';
import { speakerHoldsMovement, offersInteract } from './route-run';
import { coopJoinLink } from './coop';
import { playerMeshBody } from './lab-cast-mesh';
import { findCoopControls } from './coop-controls';
import { encounterForSeed } from '../lab/encounters';
import { SLOWMO_PRESETS } from '../lab/config';
import type { Recorder, operatorMetaFromSearch } from '../lab/telemetry';
import type { Session } from '../lab/session';
import type { LiveMastery } from '../lab/live';
import type { PresentationOrchestrator } from '../lab/orchestrator';
import type { TutorialCoach } from '../game/tutorial';
import type { InputDevice, InputSource } from './input';
import type { FrameClock, FrameMeter } from './frame';
import type { HostFocus } from './host-focus';
import type { LabDials } from './lab-dials';
import type { LabCoop } from './lab-coop';
import type { LabCamera } from './lab-camera';
import type { LabEventFeed } from './lab-events';
import type { ShowcaseLab } from './showcase-lab';
import type { CaptureShot } from './capture';
import type { LabState } from './lab-state';

export interface LabHarness {
  dials: LabDials;
  audio: Audio;
  fx: FxLayer;
  cam: Camera;
  input: InputSource;
  recorder: Recorder;
  session: Session;
  liveMastery: LiveMastery;
  presentationOrchestrator: PresentationOrchestrator;
  focusVignette: FocusVignette;
  tutorialCoach: TutorialCoach;
  labCoop: LabCoop;
  labCamera: LabCamera;
  feed: LabEventFeed;
  showcase: ShowcaseLab;
  clock: FrameClock;
  frameMeter: FrameMeter;
  focus: HostFocus;
  coopControls: ReturnType<typeof findCoopControls>;
  copy: ReturnType<typeof copyFor>;
  labCopy: ReturnType<typeof labCopyFor>;
  locale: ReturnType<typeof localeFrom>;
  operator: ReturnType<typeof operatorMetaFromSearch>;
  captureShot: CaptureShot | null;
  signalingUrl: string;
  encounterIds: string[];
  touchCapable: boolean;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  panel: HTMLDivElement;
  panelReadout: HTMLDivElement;
  fpsMeterOutput: HTMLOutputElement | null;
  fpsMeterButton: HTMLButtonElement | null;
  buildWatermark: typeof __CROWN_WATERMARK__;
  syncApotheosisDom(): void;
}

export interface LabKitHooks {
  updatePanel(): void;
}

export type LabKit = ReturnType<typeof createLabKit>;

export const createLabKit = (lab: LabState, harness: LabHarness, hooks: LabKitHooks) => {
  const { cam, input, dials, tutorialCoach, labCoop, locale, focus, touchCapable } = harness;

  const touchActive = (): boolean =>
    input.activeDevice === 'touch' && lab.mobileViewMode === 'game';
  const controlDevice = (): 'touch' | 'pointer' =>
    input.activeDevice === 'touch' ? 'touch' : 'pointer';

  const layoutFrame = (): LayoutFrame =>
    resolveLayout({
      viewport: { w: cam.width, h: cam.height },
      safe: lab.safeInsets,
      device: touchCapable ? 'touch' : 'pointer',
      padLive: touchActive(),
      profile: 'lab',
      active: {
        verdict: lab.world.outcome !== 'running',
        narration: lab.run !== null && speakerHoldsMovement(lab.run, lab.world, lab.localPlayer),
        threat: lab.world.enemies.some(
          (enemy) =>
            enemy.state.kind !== 'dead' && lab.combat.enemies[enemy.archetype].boss !== undefined,
        ),
        instruments: lab.flags.showPanel || lab.flags.showTimeline,
      },
    });

  const syncInputDevice = (device: InputDevice): void => {
    document.body.classList.toggle('input-touch', device === 'touch');
    if (device !== 'touch') lab.touchControls?.releaseAll();
    tutorialCoach.controls = controlNamesFor(device === 'touch' ? 'touch' : 'pointer', locale);
  };

  const localKing = (w: World = lab.world): Player =>
    w.players[lab.localPlayer] ?? w.players[0];

  const kingDressings = (): KingDressing[] => {
    const mesh = playerMeshBody();
    const seats = Math.max(lab.kingIdentities.length, lab.world.players.length);
    return Array.from({ length: seats }, (_, seat) => {
      const id = lab.kingIdentities[seat];
      const identity = id === undefined ? null : identityById(id);
      return {
        pal: identity === null
          ? lab.pal
          : identityPalette(lab.pal, identity, lab.pres.visual, lab.pres.preserveThreatColors),
        models: identity === null ? lab.models : identityModels(lab.models, identity),
        ...(mesh !== null && seat === lab.localPlayer ? { body: mesh.draw } : {}),
      };
    });
  };

  const copyJoinLink = (): void => {
    const link = coopJoinLink(location.href, labCoop.room);
    if (link === '') return;
    const clipboard: Clipboard | undefined = navigator.clipboard;
    if (clipboard === undefined) {
      lab.notice = `no clipboard in this context — copy the join link: ${link}`;
      hooks.updatePanel();
      return;
    }
    void clipboard.writeText(link).then(
      () => {
        lab.notice = `join link copied: ${link}`;
        hooks.updatePanel();
      },
      () => {
        lab.notice = `clipboard refused — copy the join link: ${link}`;
        hooks.updatePanel();
      },
    );
  };

  const applyEnvoyAction = (action: EnvoyAction): void => {
    if (action === 'call') labCoop.start({ kind: 'host' });
    if (action === 'copy') copyJoinLink();
    if (action === 'join' && lab.run !== null) {
      const room = lab.run.envoy.entry;
      if (room !== '') labCoop.start({ kind: 'join', room });
    }
  };

  const setPaused = (next: boolean): void => {
    lab.flags.paused = next;
    focus.syncAudioPause();
  };

  const encounterDef = (): EncounterDef =>
    encounterForSeed(dials.encounterId(), lab.world.rng.seed);

  const toggleMazePortalDirection = (): void => {
    lab.mazePortalDirection = lab.mazePortalDirection === 'up' ? 'down' : 'up';
    lab.notice = `maze portal steps: ${lab.mazePortalDirection}`;
    lab.pageControls?.syncMazePortal();
  };

  const cheating = () => lab.flags.invincible || lab.flags.infiniteStamina;

  const unreplayableReason = (): string | null =>
    cheating()
      ? 'cheats active'
      :
        labCoop.playing
        ? 'co-op session'
        : lab.run !== null
          ? 'route transitions'
          : null;

  const availableTouchActions = (): Set<string> => {
    const actions = new Set(['light', 'heavy', 'guard', 'step']);
    if (lab.combat.power !== 'none') actions.add('power');
    if (SLOWMO_PRESETS[dials.slowMoId()].mode === 'player_focus') actions.add('focus');
    if (
      (lab.run !== null && lab.world !== undefined && offersInteract(lab.run, lab.world, lab.combat)) ||
      (lab.world !== undefined && powerPickupInReach(lab.world, lab.combat, localKing()) !== null)
    ) {
      actions.add('interact');
    }
    return actions;
  };

  const acceptsCommands = (w: World): boolean => {
    const k = localKing(w).state.kind;
    return k === 'idle' || k === 'move' || k === 'guard' || k === 'parry';
  };

  return {
    layoutFrame,
    touchActive,
    controlDevice,
    syncInputDevice,
    localKing,
    kingDressings,
    copyJoinLink,
    applyEnvoyAction,
    setPaused,
    encounterDef,
    toggleMazePortalDirection,
    cheating,
    unreplayableReason,
    availableTouchActions,
    acceptsCommands,
  };
};
