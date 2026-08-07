
const CYCLE_THRESHOLD = 0.4;

export const leanSign = (axis: number): number =>
  axis > CYCLE_THRESHOLD ? 1 : axis < -CYCLE_THRESHOLD ? -1 : 0;

export interface SpeakerState {
  open: boolean;
  selected: number;
  axis: number;
  speaker: number;
}

export const createSpeakerState = (): SpeakerState => ({
  open: false,
  selected: 0,
  axis: 0,
  speaker: 0,
});

export const openSpeaker = (state: SpeakerState, axis: number, speaker = 0): void => {
  state.open = true;
  state.selected = 0;
  state.axis = leanSign(axis);
  state.speaker = speaker;
};

export const closeSpeaker = (state: SpeakerState): void => {
  state.open = false;
  state.axis = 0;
};

export const cycleSpeaker = (state: SpeakerState, axis: number, count: number): boolean => {
  const sign = leanSign(axis);
  if (sign === state.axis) return false;
  state.axis = sign;
  if (sign === 0 || count < 2) return false;
  state.selected = (state.selected + sign + count) % count;
  return true;
};
