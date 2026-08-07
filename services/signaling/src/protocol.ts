
import { Buffer } from 'node:buffer';
import type { Limits } from './config.ts';

export type PeerId = string;
export type RoomCode = string;

export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);
const PEER_ID_PATTERN = /^[0-9a-f]{12}$/;
const PRINTABLE = /^[\x20-\x7e]*$/;

export interface SessionDescription {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp: string;
}

export interface IceCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment: string | null;
}

export type ClientMessage =
  | { t: 'create'; size?: number }
  | { t: 'join'; room: RoomCode }
  | { t: 'seal' }
  | { t: 'desc'; to: PeerId; sdp: SessionDescription }
  | { t: 'cand'; to: PeerId; candidate: IceCandidate };

export type ErrorCode =
  | 'too_large'
  | 'bad_message'
  | 'rate_limited'
  | 'quota'
  | 'room_full'
  | 'no_room'
  | 'started'
  | 'already_in_room'
  | 'not_in_room'
  | 'unknown_peer'
  | 'capacity'
  | 'forbidden';

export type CloseReason = 'expired' | 'idle' | 'refused' | 'shutdown';

export type ServerMessage =
  | {
      t: 'welcome';
      room: RoomCode;
      self: PeerId;
      peers: readonly PeerId[];
      ice: readonly IceServerPayload[];
      expiresInMs: number;
      host: PeerId;
      capacity: number;
    }
  | { t: 'peer-joined'; peer: PeerId }
  | { t: 'peer-left'; peer: PeerId; host: PeerId | null }
  | { t: 'desc'; from: PeerId; sdp: SessionDescription }
  | { t: 'cand'; from: PeerId; candidate: IceCandidate }
  | { t: 'error'; code: ErrorCode }
  | { t: 'closed'; reason: CloseReason };

export interface IceServerPayload {
  urls: readonly string[];
  username?: string;
  credential?: string;
}

export type ParseResult =
  | { ok: true; message: ClientMessage }
  | { ok: false; code: 'too_large' | 'bad_message' };

const bad = (): ParseResult => ({ ok: false, code: 'bad_message' });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactly = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

const boundedString = (value: unknown, maxBytes: number): string | null => {
  if (typeof value !== 'string') return null;
  if (Buffer.byteLength(value, 'utf8') > maxBytes) return null;
  if (!PRINTABLE.test(value)) return null;
  return value;
};

const parseDescription = (value: unknown, limits: Limits): SessionDescription | null => {
  if (!isRecord(value) || !hasExactly(value, ['type', 'sdp'])) return null;
  const { type } = value;
  if (type !== 'offer' && type !== 'answer' && type !== 'pranswer' && type !== 'rollback') {
    return null;
  }
  if (typeof value.sdp !== 'string') return null;
  if (Buffer.byteLength(value.sdp, 'utf8') > limits.maxSdpBytes) return null;
  if (CONTROL.test(value.sdp)) return null;
  if (type === 'rollback') {
    if (value.sdp !== '') return null;
  } else if (!value.sdp.startsWith('v=0')) {
    return null;
  }
  return { type, sdp: value.sdp };
};

const parseCandidate = (value: unknown, limits: Limits): IceCandidate | null => {
  if (!isRecord(value)) return null;
  if (!hasExactly(value, ['candidate', 'sdpMid', 'sdpMLineIndex', 'usernameFragment'])) return null;

  const candidate = boundedString(value.candidate, limits.maxCandidateBytes);
  if (candidate === null) return null;
  if (candidate !== '' && !candidate.startsWith('candidate:')) return null;

  const sdpMid = value.sdpMid === null ? null : boundedString(value.sdpMid, 64);
  if (value.sdpMid !== null && sdpMid === null) return null;

  const index = value.sdpMLineIndex;
  if (index !== null && (!Number.isInteger(index) || (index as number) < 0 || (index as number) > 32)) {
    return null;
  }

  const ufrag = value.usernameFragment === null ? null : boundedString(value.usernameFragment, 256);
  if (value.usernameFragment !== null && ufrag === null) return null;

  return {
    candidate,
    sdpMid,
    sdpMLineIndex: index as number | null,
    usernameFragment: ufrag,
  };
};

export const parseClientMessage = (raw: string, limits: Limits): ParseResult => {
  if (Buffer.byteLength(raw, 'utf8') > limits.maxMessageBytes) {
    return { ok: false, code: 'too_large' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return bad();
  }
  if (!isRecord(parsed)) return bad();

  switch (parsed.t) {
    case 'create': {
      if (hasExactly(parsed, ['t'])) return { ok: true, message: { t: 'create' } };
      if (!hasExactly(parsed, ['t', 'size'])) return bad();
      const { size } = parsed;
      if (typeof size !== 'number' || !Number.isInteger(size)) return bad();
      if (size < 2 || size > limits.maxPeersPerRoom) return bad();
      return { ok: true, message: { t: 'create', size } };
    }
    case 'seal': {
      return hasExactly(parsed, ['t']) ? { ok: true, message: { t: 'seal' } } : bad();
    }
    case 'join': {
      if (!hasExactly(parsed, ['t', 'room'])) return bad();
      if (typeof parsed.room !== 'string') return bad();
      const room = parsed.room.trim().toUpperCase();
      return ROOM_CODE_PATTERN.test(room) ? { ok: true, message: { t: 'join', room } } : bad();
    }
    case 'desc': {
      if (!hasExactly(parsed, ['t', 'to', 'sdp'])) return bad();
      if (typeof parsed.to !== 'string' || !PEER_ID_PATTERN.test(parsed.to)) return bad();
      const sdp = parseDescription(parsed.sdp, limits);
      return sdp === null ? bad() : { ok: true, message: { t: 'desc', to: parsed.to, sdp } };
    }
    case 'cand': {
      if (!hasExactly(parsed, ['t', 'to', 'candidate'])) return bad();
      if (typeof parsed.to !== 'string' || !PEER_ID_PATTERN.test(parsed.to)) return bad();
      const candidate = parseCandidate(parsed.candidate, limits);
      return candidate === null
        ? bad()
        : { ok: true, message: { t: 'cand', to: parsed.to, candidate } };
    }
    default:
      return bad();
  }
};
