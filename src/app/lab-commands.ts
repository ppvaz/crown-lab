
import { nextLabApotheosis } from '../render/apotheosis/probe-lab';
import { labArchetypeColor } from '../render/palette-lab';
import { MATERIAL_PACKS } from '../render/materials-lab';
import { cloneBank } from '../render/models';
import { MODEL_BANKS } from '../render/cast/banks-lab';
import { MODE_PROFILE_IDS } from '../lab/modes';
import { WEATHER_IDS, currentWeatherId, setWeather } from '../render/room-weather-lab';
import { AIM_MODES } from './input';
import { retryRoom } from './route-run';
import {
  browseCastClip,
  castMeshStatus,
  setCastMeshEnabled,
  warmCastMeshes,
} from './lab-cast-mesh';
import { allowHeavy, heavyAllowed, setHeavyLoading } from '../render/heavy-assets';
import { sizeLabel } from '../render/heavy-prompt';
import { roomMsaaEnabled, setRoomMsaa } from './lab-rooms';
import { ROOM_SCALE_STEPS, currentRoomScale, setRoomScale } from '../render/room-webgl-lab';
import type { LabState } from './lab-state';
import type { LabHarness, LabKit } from './lab-kit';
import type { LabFlow } from './lab-flow';

export interface LabCommandHooks {
  pickRun(): void;
  pickSfx(): void;
  syncFpsMeter(): void;
}

export const createLabCommands = (
  lab: LabState,
  kit: LabKit,
  harness: LabHarness,
  flow: LabFlow,
  hooks: LabCommandHooks,
) => {
  const {
    dials, audio, fx, cam, input, labCoop, labCamera, showcase, syncApotheosisDom,
    encounterIds,
  } = harness;

  const cycle = (i: number, len: number, dir: number): number => (i + dir + len) % len;

  const nudgeVignette = (dir: number): void => {
    const next = Math.round(((lab.vignetteOverride ?? 0) + dir * 0.1) * 10) / 10;
    lab.vignetteOverride = next < 0 ? null : Math.min(1, next);
    lab.notice =
      lab.vignetteOverride === null
        ? 'vignette: follows the presentation'
        : `vignette: held at ${lab.vignetteOverride.toFixed(1)}`;
  };

  const cycleMode = (dir: number): void => {
    const at = MODE_PROFILE_IDS.indexOf(dials.activeModeId() ?? '');
    const next =
      at < 0
        ? MODE_PROFILE_IDS[dir > 0 ? 0 : MODE_PROFILE_IDS.length - 1]
        : MODE_PROFILE_IDS[cycle(at, MODE_PROFILE_IDS.length, dir)];
    flow.applyMode(next);
  };

  const SAFE_DURING_SESSION: ReadonlySet<string> = new Set([
    'KeyH', 'KeyT', 'KeyY', 'KeyB', 'Digit6',
    'KeyE',
    'Slash', 'Digit0', 'Digit1', 'Digit2', 'Digit4',
    'Backslash',
    'Backquote',
    'KeyM', 'Digit3', 'Digit5',
    'KeyN',
    'F9',
  ]);

  const runLabCommand = (code: string, shiftKey = false): void => {
    if (labCoop.playing && !SAFE_DURING_SESSION.has(code)) {
      labCoop.state = 'playing — world locked, the peer cannot follow a change';
      return;
    }
    switch (code) {
      case 'KeyR':
        if (lab.run !== null) {
          retryRoom(lab.run);
          flow.enterRouteNode();
        }
        else flow.restart();
        break;
      case 'KeyC':
        flow.toggleRoute();
        break;
      case 'KeyP':
        kit.setPaused(!lab.flags.paused);
        break;
      case 'KeyO':
        if (shiftKey && lab.replay !== null) flow.seekReplay(lab.replay.cursor - 1);
        else if (shiftKey) lab.notice = 'nothing to step back through — load a run first';
        else lab.stepOnce = true;
        break;
      case 'KeyH':
        lab.flags.showHitboxes = !lab.flags.showHitboxes;
        break;
      case 'KeyT':
        lab.flags.showTimeline = !lab.flags.showTimeline;
        break;
      case 'KeyY':
        lab.flags.showStates = !lab.flags.showStates;
        break;
      case 'KeyB':
        lab.flags.showPanel = !lab.flags.showPanel;
        break;
      case 'KeyE':
        if (shiftKey) flow.downloadEvidence();
        break;
      case 'KeyV':
        flow.startReplay();
        break;
      case 'Digit6':
        lab.flags.showFpsMeter = !lab.flags.showFpsMeter;
        lab.notice = `fps meter: ${lab.flags.showFpsMeter ? 'on' : 'off'}`;
        hooks.syncFpsMeter();
        break;
      case 'KeyI':
        lab.flags.invincible = !lab.flags.invincible;
        break;
      case 'KeyG':
        lab.flags.infiniteStamina = !lab.flags.infiniteStamina;
        break;
      case 'KeyM':
        audio.setEnabled(!audio.isEnabled());
        break;
      case 'KeyN': {
        const next = AIM_MODES[(AIM_MODES.indexOf(input.aimMode) + 1) % AIM_MODES.length];
        input.aimMode = next;
        lab.notice = `aim: ${next}`;
        break;
      }
      case 'KeyU':
        kit.toggleMazePortalDirection();
        break;

      case 'KeyZ':
        cycleMode(shiftKey ? -1 : 1);
        break;
      case 'BracketLeft':
        flow.reconfigure(() => {
          dials.combatIndex = cycle(dials.combatIndex, dials.combatIds.length, -1);
        });
        break;
      case 'BracketRight':
        flow.reconfigure(() => {
          dials.combatIndex = cycle(dials.combatIndex, dials.combatIds.length, 1);
        });
        break;
      case 'Semicolon':
        flow.reconfigure(() => {
          dials.slowMoIndex = cycle(dials.slowMoIndex, dials.slowMoIds.length, -1);
        });
        break;
      case 'Quote':
        flow.reconfigure(() => {
          dials.slowMoIndex = cycle(dials.slowMoIndex, dials.slowMoIds.length, 1);
        });
        break;
      case 'Comma':
        flow.reconfigure(() => {
          dials.encounterIndex = cycle(dials.encounterIndex, encounterIds.length, -1);
        });
        break;
      case 'Period':
        flow.reconfigure(() => {
          dials.encounterIndex = cycle(dials.encounterIndex, encounterIds.length, 1);
        });
        break;
      case 'Minus':
        flow.reconfigure(() => {
          dials.seed = Math.max(1, dials.seed - 1);
        });
        break;
      case 'Equal':
        flow.reconfigure(() => {
          dials.seed += 1;
        });
        break;

      case 'Slash':
        labCamera.motion = labCamera.motion === 'action' ? 'static' : 'action';
        labCamera.cut(kit.layoutFrame().content);
        if (labCamera.motion === 'static') {
          const contentBox = kit.layoutFrame().content;
          cam.zoom = labCamera.zoomFor(lab.world.arena, lab.world.encounter.defId, {
            w: contentBox.w,
            h: contentBox.h,
          });
        }
        lab.notice = `camera: ${labCamera.motion}`;
        break;
      case 'Backslash': {
        const at = WEATHER_IDS.indexOf(currentWeatherId());
        lab.notice = `weather: ${setWeather(
          WEATHER_IDS[cycle(at < 0 ? 0 : at, WEATHER_IDS.length, shiftKey ? -1 : 1)],
        )}`;
        break;
      }
      case 'Digit0':
        lab.apotheosis = nextLabApotheosis(lab.apotheosis, shiftKey ? -1 : 1);
        syncApotheosisDom();
        fx.configure(lab.pres, lab.pal, lab.apotheosis, labArchetypeColor);
        lab.notice = `apotheosis: ${lab.apotheosis.tier}`;
        break;
      case 'Digit1':
        if (shiftKey) {
          nudgeVignette(-1);
          break;
        }
        dials.presentationIndex = cycle(dials.presentationIndex, dials.presentationIds.length, -1);
        flow.applyPresentation();
        lab.notice = `presentation: ${dials.presentationId()}`;
        break;
      case 'Digit2':
        if (shiftKey) {
          nudgeVignette(1);
          break;
        }
        dials.presentationIndex = cycle(dials.presentationIndex, dials.presentationIds.length, 1);
        flow.applyPresentation();
        lab.notice = `presentation: ${dials.presentationId()}`;
        break;
      case 'Digit3':
        dials.packIndex = cycle(Math.max(0, dials.packIndex), dials.packIds.length, 1);
        audio.setPack(MATERIAL_PACKS[dials.packId()]);
        lab.notice = `material: ${dials.packId()}`;
        break;
      case 'Digit4':
        dials.modelBankIndex = cycle(dials.modelBankIndex, dials.modelBankIds.length, 1);
        lab.models = cloneBank(MODEL_BANKS[dials.modelBankId()]);
        lab.notice = `models: ${dials.modelBankId()}`;
        break;



      case 'Backquote': {
        const status = castMeshStatus();
        if (shiftKey) {
          if (!status.ready) {
            lab.notice = status.wanted
              ? 'mesh king: still loading'
              : 'mesh king: press K to turn it on first';
            break;
          }
          const next = lab.castClipOverride === null
            ? 0
            : lab.castClipOverride + 1 >= status.clips.length
              ? null
              : lab.castClipOverride + 1;
          lab.castClipOverride = next;
          browseCastClip('player', next, 0);
          lab.notice = next === null
            ? 'mesh king: back to the simulation'
            : `mesh king clip: ${status.clips[next]} (${next + 1}/${status.clips.length})`;
          break;
        }
        const wanted = !status.wanted;
        if (wanted && !heavyAllowed('meshes')) {
          allowHeavy('meshes');
          setHeavyLoading('meshes', true);
          warmCastMeshes();
          lab.notice = `mesh cast: downloading ${sizeLabel(__CROWN_ASSET_BYTES__.heavy.meshes)}`;
        }
        setCastMeshEnabled(wanted);
        lab.castClipOverride = null;
        lab.notice = wanted ? 'mesh king: on' : 'mesh king: off';
        break;
      }


      case 'F9': {
        if (shiftKey) {
          const at = (ROOM_SCALE_STEPS as readonly number[]).indexOf(currentRoomScale());
          const next = setRoomScale(
            ROOM_SCALE_STEPS[cycle(at < 0 ? 0 : at, ROOM_SCALE_STEPS.length, 1)],
          );
          lab.notice = `live room: backing ${Math.round(next * 100)}% — live rooms only`;
          break;
        }
        const on = !roomMsaaEnabled();
        setRoomMsaa(on);
        lab.notice = `live room: msaa ${on ? 'on' : 'off'} — rebuilding, live rooms only`;
        break;
      }
      case 'Digit5':
        hooks.pickSfx();
        break;
      case 'Digit7':
        hooks.pickRun();
        break;
      case 'Digit8': {
        const role = showcase.cycleRole(shiftKey ? -1 : 1);
        if (role !== null) kit.setPaused(true);
        lab.notice = `turntable: ${role ?? 'off'}`;
        break;
      }
      case 'Digit9': {
        const state = showcase.cycleState(shiftKey ? -1 : 1);
        lab.notice =
          state === null
            ? 'turntable state: open a model with 8 first'
            : `turntable state: ${state.id}`;
        break;
      }

      case 'KeyX':
        flow.resetSelections();
        break;
      default:
        break;
    }

    dials.persist();
  };

  return runLabCommand;
};
