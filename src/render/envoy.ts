
import type { Palette } from './palette';
import {
  ENVOY,
  ENVOY_KEYS,
  ENVOY_KEY_SEND,
  envoyChoices,
  envoyCodeReady,
  envoyStanding,
  type EnvoyChoice,
  type EnvoyParting,
  type EnvoyStage,
  type EnvoyState,
} from '../game/envoy';
import { ROOM_CODE_LENGTH } from '../game/room-code';
import type { Camera } from './iso';
import { drawSpeakerLabel } from './speaker-label';
import { drawDialogue } from './dialogue';
import type { LayoutFrame } from './layout';

const envoyLabel = (choice: EnvoyChoice, room: string): string => {
  if (choice === 'call') return 'CALL ANOTHER KING';
  if (choice === 'answer') return room === '' ? 'ANSWER A CALL' : 'ANSWER A CALL INSTEAD';
  if (choice === 'copy') return room === '' ? 'SENDING WORD…' : `THE WORD IS ${room} — TAKE IT`;
  return 'NOT NOW';
};

export const drawEnvoyLine = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  frame: LayoutFrame,
  stage: EnvoyStage,
  room: string,
  prompt: string | null,
  parting: EnvoyParting = 'none',
): void =>
  drawSpeakerLabel(ctx, cam, pal, frame, {
    at: ENVOY.at,
    name: ENVOY.name,
    line: envoyStanding(stage, room, parting),
    prompt,
    ids: { name: 'envoy.name', line: 'envoy.standing', prompt: 'envoy.prompt' },
  });

export const drawEnvoyDialogue = (
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  frame: LayoutFrame,
  state: EnvoyState,
  stage: EnvoyStage,
  room: string,
  controls: { move: string; interact: string },
  words: { choose: string; go: string },
  parting: EnvoyParting = 'none',
): void => {
  const narration = frame.regions.narration;
  if (narration === undefined) return;
  const labels = envoyChoices(stage).map((choice) => envoyLabel(choice, room));
  ctx.save();
  drawDialogue(ctx, pal, frame, {
    id: 'envoy.dialogue',
    region: narration,
    speaker: ENVOY.name,
    aside: state.answering
      ? { id: 'envoy.dialogue.aside', text: codeSlots(state.entry) }
      : null,
    body: state.answering
      ? {
          kind: 'keys',
          id: 'envoy.dialogue.keys',
          rows: ENVOY_KEYS,
          cursor: { row: state.keyRow, col: state.keyCol },
        }
      : { kind: 'choices', labels, selected: Math.min(state.selected, labels.length - 1) },
    hint: state.answering
      ? keyHint(state, controls, words)
      : `${controls.move}  ${words.choose.toUpperCase()}    ${controls.interact}  ${words.go.toUpperCase()}`,
  });
  ctx.restore();
};

const codeSlots = (entry: string): string =>
  `${entry}${'·'.repeat(Math.max(0, ROOM_CODE_LENGTH - entry.length))}`;

const keyHint = (
  state: EnvoyState,
  controls: { move: string; interact: string },
  words: { choose: string; go: string },
): string => {
  const key = ENVOY_KEYS[state.keyRow]?.[state.keyCol] ?? '';
  const owed = ROOM_CODE_LENGTH - state.entry.length;

  const verb =
    key === ENVOY_KEY_SEND
      ? envoyCodeReady(state)
        ? words.go.toUpperCase()
        :
          `${owed} MORE`
      : key;
  return `${controls.move}  ${words.choose.toUpperCase()}    ${controls.interact}  ${verb}`;
};
