
import { createHmac } from 'node:crypto';
import type { IceServerPayload } from './protocol.ts';
import type { TurnConfig } from './config.ts';

export interface TurnCredentials {
  username: string;
  credential: string;
  expiresAt: number;
}

export const mintTurnCredentials = (
  turn: TurnConfig,
  peerId: string,
  nowMs: number,
): TurnCredentials => {
  const expiresAt = Math.floor(nowMs / 1000) + turn.ttlSeconds;
  const username = `${expiresAt}:${peerId}`;
  return {
    username,
    credential: createHmac('sha1', turn.secret).update(username).digest('base64'),
    expiresAt,
  };
};

export const iceServersFor = (
  stunUrls: readonly string[],
  turn: TurnConfig | null,
  peerId: string,
  nowMs: number,
): readonly IceServerPayload[] => {
  const servers: IceServerPayload[] = [];
  if (stunUrls.length > 0) servers.push({ urls: stunUrls });
  if (turn !== null && turn.urls.length > 0) {
    const { username, credential } = mintTurnCredentials(turn, peerId, nowMs);
    servers.push({ urls: turn.urls, username, credential });
  }
  return servers;
};
