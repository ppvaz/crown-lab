
export interface Limits {
  maxMessageBytes: number;
  maxSdpBytes: number;
  maxCandidateBytes: number;
  maxDescriptionsPerPeer: number;
  maxCandidatesPerPeer: number;
  peersPerRoom: number;
  maxPeersPerRoom: number;
  roomTtlMs: number;
  handshakeGraceMs: number;
  roomsPerAddress: number;
  createsPerMinute: number;
  joinsPerMinute: number;
  signalsPerSecond: number;
  signalBurst: number;
  connectionsPerAddress: number;
  maxRooms: number;
  maxConnections: number;
  maxTrackedAddresses: number;
}

export const DEFAULT_LIMITS: Limits = {
  maxMessageBytes: 8_192,
  maxSdpBytes: 6_144,
  maxCandidateBytes: 512,
  maxDescriptionsPerPeer: 4,
  maxCandidatesPerPeer: 64,
  peersPerRoom: 2,
  maxPeersPerRoom: 4,
  roomTtlMs: 900_000,
  handshakeGraceMs: 20_000,
  roomsPerAddress: 3,
  createsPerMinute: 5,
  joinsPerMinute: 20,
  signalsPerSecond: 8,
  signalBurst: 40,
  connectionsPerAddress: 8,
  maxRooms: 500,
  maxConnections: 1_000,
  maxTrackedAddresses: 10_000,
};

export interface IceServer {
  urls: readonly string[];
  username?: string;
  credential?: string;
}

export interface TurnConfig {
  secret: string;
  urls: readonly string[];
  ttlSeconds: number;
}

export interface ServiceConfig {
  port: number;
  host: string;
  limits: Limits;
  stunUrls: readonly string[];
  turn: TurnConfig | null;
  allowedOrigins: readonly string[];
  trustProxy: boolean;
}

const splitList = (value: string | undefined): readonly string[] =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const positiveInt = (value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`expected a positive integer, got ${JSON.stringify(value)}`);
  }
  return parsed;
};

export const configFromEnv = (env: NodeJS.ProcessEnv = process.env): ServiceConfig => {
  const secret = env.CROWN_TURN_SECRET;
  const turnUrls = splitList(env.CROWN_TURN_URLS);

  if ((secret === undefined || secret.length === 0) !== (turnUrls.length === 0)) {
    throw new Error('CROWN_TURN_SECRET and CROWN_TURN_URLS must be set together, or neither');
  }

  return {
    port: positiveInt(env.PORT, 8787),
    host: env.CROWN_SIGNALING_HOST ?? '0.0.0.0',
    limits: {
      ...DEFAULT_LIMITS,
      maxRooms: positiveInt(env.CROWN_SIGNALING_MAX_ROOMS, DEFAULT_LIMITS.maxRooms),
      roomTtlMs: positiveInt(env.CROWN_SIGNALING_ROOM_TTL_MS, DEFAULT_LIMITS.roomTtlMs),
      maxPeersPerRoom: Math.min(
        positiveInt(env.CROWN_SIGNALING_MAX_PEERS, DEFAULT_LIMITS.maxPeersPerRoom),
        DEFAULT_LIMITS.maxPeersPerRoom,
      ),
    },
    stunUrls: splitList(env.CROWN_STUN_URLS),
    turn:
      secret !== undefined && secret.length > 0
        ? {
            secret,
            urls: turnUrls,
            ttlSeconds: positiveInt(env.CROWN_TURN_TTL_SECONDS, 300),
          }
        : null,
    allowedOrigins: splitList(env.CROWN_ALLOWED_ORIGINS),
    trustProxy: env.CROWN_TRUST_PROXY === '1',
  };
};

export const clientAddress = (
  forwardedFor: string | undefined,
  socketAddress: string | undefined,
  trustProxy: boolean,
): string => {
  if (trustProxy && forwardedFor !== undefined) {
    const first = forwardedFor.slice(0, 256).split(',')[0]?.trim();
    if (first !== undefined && first.length > 0) return first;
  }
  return socketAddress ?? 'unknown';
};

export const describeConfig = (config: ServiceConfig): string =>
  [
    `port=${config.port}`,
    `stun=${config.stunUrls.length}`,
    `turn=${config.turn === null ? 'disabled' : `enabled ttl=${config.turn.ttlSeconds}s`}`,
    `origins=${config.allowedOrigins.length === 0 ? 'any' : config.allowedOrigins.length}`,
    `trustProxy=${config.trustProxy}`,
    `maxRooms=${config.limits.maxRooms}`,
    `roomTtlMs=${config.limits.roomTtlMs}`,
    `maxPeers=${config.limits.maxPeersPerRoom}`,
  ].join(' ');

export const isAllowedOrigin = (
  origin: string | undefined,
  allowed: readonly string[],
): boolean => {
  if (allowed.length === 0) return true;
  if (origin === undefined) return false;
  return allowed.includes(origin);
};
