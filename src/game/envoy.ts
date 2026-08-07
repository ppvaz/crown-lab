
import type { Vec2, World } from '../sim/types';
import { COURT_ENCOUNTER } from './court';
import { near } from './party';
import { ROOM_ALPHABET, ROOM_CODE_LENGTH, isRoomCode } from './room-code';
import {
  closeSpeaker,
  createSpeakerState,
  cycleSpeaker,
  openSpeaker,
  type SpeakerState,
} from './speaker';

export const ENVOY = {
  name: 'THE ENVOY',
  at: { x: -1, y: -4.9 } as Vec2,
  radius: 0.45,
  reach: 1.8,
} as const;

export type EnvoyStage =
  | 'idle'
  | 'calling'
  | 'joined'
  | 'unavailable';

export type EnvoyParting =
  | 'none'
  | 'left'
  | 'refused';

export const envoyStage = (session: {
  state: string;
  available: boolean;
}): EnvoyStage => {
  if (!session.available) return 'unavailable';
  if (session.state === '') return 'idle';
  if (session.state === 'playing') return 'joined';
  if (session.state === 'closed') return 'unavailable';
  return 'calling';
};

export const envoyPresent = (world: World): boolean =>
  world.encounter.defId === COURT_ENCOUNTER;

export const nearEnvoy = (at: Vec2): boolean => near(at, ENVOY.at, ENVOY.reach);

export const ENVOY_KEY_DELETE = 'DEL';
export const ENVOY_KEY_SEND = 'SEND';
export const ENVOY_KEY_BACK = 'BACK';

export const ENVOY_KEY_COLUMNS = 12;

export const ENVOY_KEYS: readonly (readonly string[])[] = (() => {
  const rows: string[][] = [];
  for (let i = 0; i < ROOM_ALPHABET.length; i += ENVOY_KEY_COLUMNS) {
    rows.push([...ROOM_ALPHABET.slice(i, i + ENVOY_KEY_COLUMNS)]);
  }
  const last = rows[rows.length - 1];
  last.push(ENVOY_KEY_DELETE, ENVOY_KEY_SEND, ENVOY_KEY_BACK);
  return rows;
})();

const rowWidth = (row: number): number => ENVOY_KEYS[row]?.length ?? 0;

export interface EnvoyState extends SpeakerState {
  answering: boolean;
  entry: string;
  keyRow: number;
  keyCol: number;
  keyAxis: number;
  keyHeldMs: number;
}

export const createEnvoyState = (): EnvoyState => ({
  ...createSpeakerState(),
  answering: false,
  entry: '',
  keyRow: 0,
  keyCol: 0,
  keyAxis: 0,
  keyHeldMs: 0,
});

export const envoyKeyAt = (state: EnvoyState): string =>
  ENVOY_KEYS[state.keyRow]?.[state.keyCol] ?? '';

export const envoyCodeReady = (state: EnvoyState): boolean => isRoomCode(state.entry);

const GRID_RELEASE = 0.2;

const GRID_DOMINANCE = 1.3;

const GRID_REPEAT_DELAY_MS = 320;
const GRID_REPEAT_MS = 90;

const leanStep = (axisX: number, axisY: number): { dx: number; dy: number } => {
  if (Math.hypot(axisX, axisY) < GRID_RELEASE) return { dx: 0, dy: 0 };
  const ax = Math.abs(axisX);
  const ay = Math.abs(axisY);
  if (ax > ay * GRID_DOMINANCE) return { dx: Math.sign(axisX), dy: 0 };
  if (ay > ax * GRID_DOMINANCE) return { dx: 0, dy: Math.sign(axisY) };
  return { dx: 0, dy: 0 };
};

export const moveEnvoyCursor = (
  state: EnvoyState,
  axisX: number,
  axisY: number,
  dtMs = 0,
): void => {
  const { dx, dy } = leanStep(axisX, axisY);
  if (dx === 0 && dy === 0) {
    if (Math.hypot(axisX, axisY) < GRID_RELEASE) {
      state.keyAxis = 0;
      state.axis = 0;
      state.keyHeldMs = 0;
    }
    return;
  }
  if (dx !== state.keyAxis || dy !== state.axis) {
    state.keyAxis = dx;
    state.axis = dy;
    state.keyHeldMs = 0;
    stepEnvoyCursor(state, dx, dy);
    return;
  }
  state.keyHeldMs += dtMs;
  while (state.keyHeldMs >= GRID_REPEAT_DELAY_MS) {
    state.keyHeldMs -= GRID_REPEAT_MS;
    stepEnvoyCursor(state, dx, dy);
  }
};

const stepEnvoyCursor = (state: EnvoyState, dx: number, dy: number): void => {
  if (dy !== 0) {
    state.keyRow = (state.keyRow + dy + ENVOY_KEYS.length) % ENVOY_KEYS.length;
    state.keyCol = Math.min(state.keyCol, Math.max(0, rowWidth(state.keyRow) - 1));
    return;
  }
  const width = rowWidth(state.keyRow);
  if (width > 0) state.keyCol = (state.keyCol + dx + width) % width;
};

export const typeEnvoy = (state: EnvoyState): void => {
  const key = envoyKeyAt(state);
  if (key === ENVOY_KEY_SEND) return;
  if (key === ENVOY_KEY_BACK) {
    state.answering = false;
    return;
  }
  if (key === ENVOY_KEY_DELETE) {
    if (state.entry === '') state.answering = false;
    else state.entry = state.entry.slice(0, -1);
    return;
  }
  if (state.entry.length < ROOM_CODE_LENGTH) state.entry += key;
};

export type EnvoyChoice = 'call' | 'answer' | 'copy' | 'leave';

export const envoyChoices = (stage: EnvoyStage): readonly EnvoyChoice[] => {
  if (stage === 'idle') return ['call', 'answer', 'leave'];
  if (stage === 'calling') return ['copy', 'answer', 'leave'];
  return ['leave'];
};

export const envoyTalking = (state: EnvoyState, world: World): boolean =>
  state.open &&
  envoyPresent(world) &&
  nearEnvoy((world.players[state.speaker] ?? world.players[0]).pos);

export const openEnvoy = (state: EnvoyState, axis: number, speaker = 0): void => {
  openSpeaker(state, axis, speaker);
  state.answering = false;
};

export const closeEnvoy = (state: EnvoyState): void => {
  closeSpeaker(state);
  state.answering = false;
};

export const answerEnvoy = (state: EnvoyState, axisX: number, axisY: number): void => {
  state.answering = true;
  state.entry = '';
  state.keyRow = 0;
  state.keyCol = 0;
  const { dx, dy } = leanStep(axisX, axisY);
  state.keyAxis = dx;
  state.axis = dy;
  state.keyHeldMs = 0;
};

export const cycleEnvoy = (state: EnvoyState, axis: number, count: number): boolean =>
  state.answering ? false : cycleSpeaker(state, axis, count);

export const envoyPrompt = (
  state: EnvoyState,
  stage: EnvoyStage,
  at: Vec2,
  interact: string,
): string | null => {
  if (state.open || !nearEnvoy(at)) return null;
  if (stage === 'idle' || stage === 'calling') return `${interact}  SPEAK TO THE ENVOY`;
  return null;
};

export const envoyStanding = (
  stage: EnvoyStage,
  room: string,
  parting: EnvoyParting = 'none',
): string => {
  if (stage === 'calling') {
    return room === ''
      ? 'I am sending word. It takes a moment.'
      : `The word is ${room}. It stands until he comes.`;
  }
  if (stage === 'joined') return 'He answered. Walk together — I have other roads.';
  if (stage === 'unavailable') return 'Not today. Every road out of this court is shut to me.';
  if (parting === 'left') return 'He turned back from the road. Ask, and word goes out again.';
  if (parting === 'refused') return 'That word reached no one. Ask, and I will carry another.';
  return 'I carry word between courts. Ask, and it goes.';
};

export type EnvoyAction =
  | 'open'
  | 'call'
  | 'copy'
  | 'answer'
  | 'type'
  | 'join'
  | 'leave'
  | 'none';

export const pressEnvoy = (state: EnvoyState, stage: EnvoyStage, at: Vec2): EnvoyAction => {
  if (!nearEnvoy(at)) return 'none';

  if (!state.open) return 'open';

  if (state.answering) {
    if (envoyKeyAt(state) !== ENVOY_KEY_SEND) return 'type';
    return envoyCodeReady(state) ? 'join' : 'none';
  }
  const choices = envoyChoices(stage);
  return choices[Math.min(state.selected, choices.length - 1)] ?? 'leave';
};

export const envoyActionCloses = (action: EnvoyAction): boolean =>
  action === 'leave' || action === 'join';
