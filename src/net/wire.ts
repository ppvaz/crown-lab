
import type { Intent, Radians } from '../sim/types';
import { AIM_STEPS, FACING_STEPS, MOVE_STEPS } from '../sim/intent';
import type { NetMessage, PeerId } from './lockstep';

const KIND_INTENT = 0;
const KIND_CHECKPOINT = 1;
const KIND_START = 2;

export const INTENT_BYTES = 23;
export const CHECKPOINT_BYTES = 9;

const PEER_BYTES = 6;

export interface StartFrame {
  kind: 'start';
  peer: PeerId;
  roster: readonly PeerId[];
}

export type Frame = NetMessage | StartFrame;

const FLAGS: readonly (keyof Intent)[] = [
  'lightPressed',
  'heavyPressed',
  'guardHeld',
  'guardPressed',
  'stepPressed',
  'focusPressed',
  'interactPressed',
  'powerPressed',
  'powerHeld',
];
const FACING_PRESENT = 1 << FLAGS.length;
const AIM_PRESENT = 1 << (FLAGS.length + 1);

const FACING_STEP = (Math.PI * 2) / FACING_STEPS;

export const encodeStart = (roster: readonly PeerId[]): Uint8Array => {
  const bytes = new Uint8Array(2 + roster.length * PEER_BYTES);
  bytes[0] = KIND_START;
  bytes[1] = roster.length;
  for (let index = 0; index < roster.length; index += 1) {
    const id = roster[index];
    for (let byte = 0; byte < PEER_BYTES; byte += 1) {
      bytes[2 + index * PEER_BYTES + byte] = Number.parseInt(id.slice(byte * 2, byte * 2 + 2), 16);
    }
  }
  return bytes;
};

export const encodeMessage = (message: NetMessage): Uint8Array => {
  if (message.kind === 'checkpoint') {
    const bytes = new Uint8Array(CHECKPOINT_BYTES);
    const view = new DataView(bytes.buffer);
    view.setUint8(0, KIND_CHECKPOINT);
    view.setUint32(1, message.tick, false);
    view.setUint32(5, message.fingerprint >>> 0, false);
    return bytes;
  }

  const { intent } = message;
  const bytes = new Uint8Array(INTENT_BYTES);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, KIND_INTENT);
  view.setUint32(1, message.tick, false);

  let flags = 0;
  for (let bit = 0; bit < FLAGS.length; bit++) {
    if (intent[FLAGS[bit]] === true) flags |= 1 << bit;
  }
  if (intent.facing !== null) flags |= FACING_PRESENT;
  if (intent.aimDistance !== null) flags |= AIM_PRESENT;
  view.setUint16(5, flags, false);

  view.setInt32(7, Math.round(intent.move.x * MOVE_STEPS), false);
  view.setInt32(11, Math.round(intent.move.y * MOVE_STEPS), false);
  view.setInt32(15, intent.facing === null ? 0 : Math.round(intent.facing / FACING_STEP), false);
  view.setInt32(
    19,
    intent.aimDistance === null ? 0 : Math.round(intent.aimDistance * AIM_STEPS),
    false,
  );
  return bytes;
};

export const decodeMessage = (bytes: Uint8Array, peer: PeerId): Frame | null => {
  if (bytes.length === 0) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kind = view.getUint8(0);

  if (kind === KIND_START) {
    if (bytes.length < 2) return null;
    const count = view.getUint8(1);
    if (count === 0 || bytes.length !== 2 + count * PEER_BYTES) return null;
    const roster: PeerId[] = [];
    for (let index = 0; index < count; index += 1) {
      let id = '';
      for (let byte = 0; byte < PEER_BYTES; byte += 1) {
        id += view.getUint8(2 + index * PEER_BYTES + byte).toString(16).padStart(2, '0');
      }
      roster.push(id);
    }
    if (new Set(roster).size !== roster.length) return null;
    return { kind: 'start', peer, roster };
  }

  if (kind === KIND_CHECKPOINT) {
    if (bytes.length !== CHECKPOINT_BYTES) return null;
    return {
      kind: 'checkpoint',
      peer,
      tick: view.getUint32(1, false),
      fingerprint: view.getUint32(5, false),
    };
  }

  if (kind !== KIND_INTENT || bytes.length !== INTENT_BYTES) return null;

  const flags = view.getUint16(5, false);
  const facingUnits = view.getInt32(15, false);
  const aimUnits = view.getInt32(19, false);
  const facing: Radians | null =
    (flags & FACING_PRESENT) === 0 ? null : facingUnits * FACING_STEP;
  const aimDistance = (flags & AIM_PRESENT) === 0 ? null : aimUnits / AIM_STEPS;

  const intent: Intent = {
    move: {
      x: view.getInt32(7, false) / MOVE_STEPS,
      y: view.getInt32(11, false) / MOVE_STEPS,
    },
    facing,
    lightPressed: (flags & (1 << 0)) !== 0,
    heavyPressed: (flags & (1 << 1)) !== 0,
    guardHeld: (flags & (1 << 2)) !== 0,
    guardPressed: (flags & (1 << 3)) !== 0,
    stepPressed: (flags & (1 << 4)) !== 0,
    focusPressed: (flags & (1 << 5)) !== 0,
    interactPressed: (flags & (1 << 6)) !== 0,
    powerPressed: (flags & (1 << 7)) !== 0,
    powerHeld: (flags & (1 << 8)) !== 0,
    aimDistance,
  };

  return { kind: 'intent', peer, tick: view.getUint32(1, false), intent };
};
