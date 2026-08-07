
import assert from 'node:assert/strict';
import { DEFAULT_LIMITS, type Limits, type TurnConfig } from '../src/config.ts';
import { SignalingHub, type Outbound } from '../src/hub.ts';
import type { ServerMessage } from '../src/protocol.ts';

export const OFFER_SDP = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n';
export const CANDIDATE = 'candidate:1 1 udp 2130706431 192.0.2.1 54321 typ host';

export const makeHub = (
  limits: Partial<Limits> = {},
  extra: { stunUrls?: readonly string[]; turn?: TurnConfig | null } = {},
): SignalingHub =>
  new SignalingHub({
    limits: { ...DEFAULT_LIMITS, ...limits },
    stunUrls: extra.stunUrls ?? [],
    turn: extra.turn ?? null,
  });

export const send = (
  hub: SignalingHub,
  connection: string,
  message: unknown,
  nowMs: number,
): Outbound[] => hub.receive(connection, JSON.stringify(message), nowMs);

export const only = (out: readonly Outbound[]): Outbound => {
  assert.equal(out.length, 1, `expected exactly one message, got ${JSON.stringify(out)}`);
  return out[0] as Outbound;
};

export const errorCode = (out: readonly Outbound[]): string => {
  const message = only(out).message;
  assert.equal(message.t, 'error', `expected an error, got ${JSON.stringify(message)}`);
  return message.t === 'error' ? message.code : '';
};

export const forConnection = (out: readonly Outbound[], connection: string): ServerMessage[] =>
  out.filter((item) => item.to === connection).map((item) => item.message);

export const welcomeIn = (
  out: readonly Outbound[],
  connection: string,
): Extract<ServerMessage, { t: 'welcome' }> => {
  const found = forConnection(out, connection).find((message) => message.t === 'welcome');
  assert.ok(found !== undefined, `expected a welcome for ${connection}: ${JSON.stringify(out)}`);
  return found as Extract<ServerMessage, { t: 'welcome' }>;
};

export interface Pair {
  hub: SignalingHub;
  room: string;
  a: { connection: string; peer: string };
  b: { connection: string; peer: string };
}

export const seatedPair = (hub: SignalingHub, nowMs = 0): Pair => {
  hub.open('conn-a', '198.51.100.7', nowMs);
  hub.open('conn-b', '203.0.113.9', nowMs);
  const created = welcomeIn(send(hub, 'conn-a', { t: 'create' }, nowMs), 'conn-a');
  const joined = welcomeIn(
    send(hub, 'conn-b', { t: 'join', room: created.room }, nowMs),
    'conn-b',
  );
  return {
    hub,
    room: created.room,
    a: { connection: 'conn-a', peer: created.self },
    b: { connection: 'conn-b', peer: joined.self },
  };
};
