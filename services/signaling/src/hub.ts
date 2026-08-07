
import {
  parseClientMessage,
  type ClientMessage,
  type ErrorCode,
  type PeerId,
  type ServerMessage,
} from './protocol.ts';
import type { IceServerPayload } from './protocol.ts';
import type { Limits, TurnConfig } from './config.ts';
import { RoomRegistry, type ConnectionId, type Room } from './rooms.ts';
import { RateLimiter, Tally, addressKey, perMinute } from './rate.ts';
import { iceServersFor } from './turn.ts';

export interface Outbound {
  to: ConnectionId;
  message: ServerMessage;
  close?: true;
}

export interface Refusals {
  oversized: number;
  malformed: number;
  unknownConnection: number;
  rateLimited: number;
  quota: number;
  roomFull: number;
  started: number;
  forbidden: number;
  unknownRoom: number;
  unknownPeer: number;
  notInRoom: number;
  alreadyInRoom: number;
  capacity: number;
  expiredRooms: number;
  idleConnections: number;
}

const noRefusals = (): Refusals => ({
  oversized: 0,
  malformed: 0,
  unknownConnection: 0,
  rateLimited: 0,
  quota: 0,
  roomFull: 0,
  started: 0,
  forbidden: 0,
  unknownRoom: 0,
  unknownPeer: 0,
  notInRoom: 0,
  alreadyInRoom: 0,
  capacity: 0,
  expiredRooms: 0,
  idleConnections: 0,
});

interface Connection {
  id: ConnectionId;
  key: string;
  openedAtMs: number;
  roomCode: string | null;
  peer: PeerId | null;
  closing: boolean;
}

export interface HubOptions {
  limits: Limits;
  stunUrls: readonly string[];
  turn: TurnConfig | null;
}

export class SignalingHub {
  private readonly connections = new Map<ConnectionId, Connection>();

  private readonly rooms: RoomRegistry;

  private readonly creates: RateLimiter;

  private readonly joins: RateLimiter;

  private readonly signals: RateLimiter;

  private readonly socketsPerAddress = new Tally();

  private readonly roomsPerAddress = new Tally();

  private refusals = noRefusals();

  private readonly options: HubOptions;

  constructor(options: HubOptions) {
    this.options = options;
    const { limits } = options;
    this.rooms = new RoomRegistry(limits);
    this.creates = new RateLimiter(perMinute(limits.createsPerMinute), limits.maxTrackedAddresses);
    this.joins = new RateLimiter(perMinute(limits.joinsPerMinute), limits.maxTrackedAddresses);
    this.signals = new RateLimiter(
      { capacity: limits.signalBurst, refillPerSecond: limits.signalsPerSecond },
      limits.maxConnections,
    );
  }

  get counters(): Readonly<Refusals> {
    return this.refusals;
  }

  get stats(): { rooms: number; connections: number } {
    return { rooms: this.rooms.size, connections: this.connections.size };
  }

  open(connection: ConnectionId, address: string, nowMs: number): Outbound[] {
    const { limits } = this.options;
    if (this.connections.size >= limits.maxConnections) {
      this.refusals.capacity += 1;
      return [refuse(connection, 'capacity')];
    }

    const key = addressKey(address);
    if (!this.socketsPerAddress.claim(key, limits.connectionsPerAddress, limits.maxTrackedAddresses)) {
      this.refusals.rateLimited += 1;
      return [refuse(connection, 'rate_limited')];
    }

    this.connections.set(connection, {
      id: connection,
      key,
      openedAtMs: nowMs,
      roomCode: null,
      peer: null,
      closing: false,
    });
    return [];
  }

  receive(connection: ConnectionId, raw: string, nowMs: number): Outbound[] {
    const conn = this.connections.get(connection);
    if (conn === undefined) {
      this.refusals.unknownConnection += 1;
      return [];
    }

    const parsed = parseClientMessage(raw, this.options.limits);
    if (!parsed.ok) {
      if (parsed.code === 'too_large') {
        this.refusals.oversized += 1;
        return [this.hangUp(conn, 'too_large')];
      }
      this.refusals.malformed += 1;
      return [{ to: conn.id, message: { t: 'error', code: 'bad_message' } }];
    }

    return this.dispatch(conn, parsed.message, nowMs);
  }

  private dispatch(conn: Connection, message: ClientMessage, nowMs: number): Outbound[] {
    switch (message.t) {
      case 'create':
        return this.create(conn, nowMs, message.size);

      case 'seal':
        return this.seal(conn);
      case 'join':
        return this.join(conn, message.room, nowMs);
      case 'desc':
      case 'cand':
        return this.relay(conn, message, nowMs);
    }
  }

  private create(conn: Connection, nowMs: number, size?: number): Outbound[] {
    if (conn.roomCode !== null) {
      this.refusals.alreadyInRoom += 1;
      return [{ to: conn.id, message: { t: 'error', code: 'already_in_room' } }];
    }
    const { limits } = this.options;
    if (!this.creates.take(conn.key, nowMs)) {
      this.refusals.rateLimited += 1;
      return [this.hangUp(conn, 'rate_limited')];
    }
    if (!this.roomsPerAddress.claim(conn.key, limits.roomsPerAddress, limits.maxTrackedAddresses)) {
      this.refusals.rateLimited += 1;
      return [this.hangUp(conn, 'rate_limited')];
    }

    const room = this.rooms.create(conn.key, nowMs, size);
    if (room === null) {
      this.roomsPerAddress.release(conn.key);
      this.refusals.capacity += 1;
      return [this.hangUp(conn, 'capacity')];
    }

    return this.seat(conn, room, nowMs);
  }

  private seal(conn: Connection): Outbound[] {
    const room = conn.roomCode === null ? undefined : this.rooms.get(conn.roomCode);
    if (room === undefined) {
      this.refusals.notInRoom += 1;
      return [{ to: conn.id, message: { t: 'error', code: 'not_in_room' } }];
    }
    if (room.host !== conn.peer) {
      this.refusals.forbidden += 1;
      return [{ to: conn.id, message: { t: 'error', code: 'forbidden' } }];
    }
    room.sealed = true;
    return [];
  }

  private join(conn: Connection, code: string, nowMs: number): Outbound[] {
    if (conn.roomCode !== null) {
      this.refusals.alreadyInRoom += 1;
      return [{ to: conn.id, message: { t: 'error', code: 'already_in_room' } }];
    }
    if (!this.joins.take(conn.key, nowMs)) {
      this.refusals.rateLimited += 1;
      return [this.hangUp(conn, 'rate_limited')];
    }

    const room = this.rooms.get(code);
    if (room === undefined || room.expiresAtMs <= nowMs) {
      this.refusals.unknownRoom += 1;
      return [{ to: conn.id, message: { t: 'error', code: 'no_room' } }];
    }
    if (room.sealed) {
      this.refusals.started += 1;
      return [{ to: conn.id, message: { t: 'error', code: 'started' } }];
    }
    if (room.occupants.size >= room.capacity) {
      this.refusals.roomFull += 1;
      return [{ to: conn.id, message: { t: 'error', code: 'room_full' } }];
    }

    return this.seat(conn, room, nowMs);
  }

  private seat(conn: Connection, room: Room, nowMs: number): Outbound[] {
    const occupant = this.rooms.join(room, conn.id);
    if (occupant === null) {
      this.refusals.roomFull += 1;
      return [{ to: conn.id, message: { t: 'error', code: 'room_full' } }];
    }

    conn.roomCode = room.code;
    conn.peer = occupant.peer;
    if (room.host === null) room.host = occupant.peer;

    const others = [...room.occupants.values()].filter((other) => other.peer !== occupant.peer);
    const welcome: Outbound = {
      to: conn.id,
      message: {
        t: 'welcome',
        room: room.code,
        self: occupant.peer,
        peers: others.map((other) => other.peer),
        ice: this.ice(occupant.peer, nowMs),
        expiresInMs: Math.max(0, room.expiresAtMs - nowMs),
        host: room.host,
        capacity: room.capacity,
      },
    };

    return [
      welcome,
      ...others.map(
        (other): Outbound => ({
          to: other.connection,
          message: { t: 'peer-joined', peer: occupant.peer },
        }),
      ),
    ];
  }

  private relay(
    conn: Connection,
    message: Extract<ClientMessage, { t: 'desc' | 'cand' }>,
    nowMs: number,
  ): Outbound[] {
    if (conn.roomCode === null) {
      this.refusals.notInRoom += 1;
      return [{ to: conn.id, message: { t: 'error', code: 'not_in_room' } }];
    }
    if (!this.signals.take(conn.id, nowMs)) {
      this.refusals.rateLimited += 1;
      return [this.hangUp(conn, 'rate_limited')];
    }

    const room = this.rooms.get(conn.roomCode);
    const self = room?.occupants.get(conn.id);
    if (room === undefined || self === undefined) {
      this.refusals.notInRoom += 1;
      return [{ to: conn.id, message: { t: 'error', code: 'not_in_room' } }];
    }

    const target = [...room.occupants.values()].find((other) => other.peer === message.to);
    if (target === undefined || target.peer === self.peer) {
      this.refusals.unknownPeer += 1;
      return [{ to: conn.id, message: { t: 'error', code: 'unknown_peer' } }];
    }

    const { limits } = this.options;
    if (message.t === 'desc') {
      if (self.descriptions >= limits.maxDescriptionsPerPeer) {
        this.refusals.quota += 1;
        return [this.hangUp(conn, 'quota')];
      }
      self.descriptions += 1;
      return [{ to: target.connection, message: { t: 'desc', from: self.peer, sdp: message.sdp } }];
    }

    if (self.candidates >= limits.maxCandidatesPerPeer) {
      this.refusals.quota += 1;
      return [this.hangUp(conn, 'quota')];
    }
    self.candidates += 1;
    return [
      { to: target.connection, message: { t: 'cand', from: self.peer, candidate: message.candidate } },
    ];
  }

  close(connection: ConnectionId, _nowMs: number): Outbound[] {
    const conn = this.connections.get(connection);
    if (conn === undefined) return [];

    this.connections.delete(connection);
    this.socketsPerAddress.release(conn.key);
    this.signals.forget(connection);

    if (conn.roomCode === null) return [];
    const room = this.rooms.get(conn.roomCode);
    if (room === undefined) return [];

    const occupant = this.rooms.leave(room, connection);
    if (room.occupants.size === 0) this.roomsPerAddress.release(room.ownerKey);
    if (occupant === undefined) return [];

    if (room.host === occupant.peer) {
      const next = [...room.occupants.values()][0];
      room.host = next === undefined ? null : next.peer;
    }

    return [...room.occupants.values()].map(
      (other): Outbound => ({
        to: other.connection,
        message: { t: 'peer-left', peer: occupant.peer, host: room.host },
      }),
    );
  }

  sweep(nowMs: number): Outbound[] {
    const out: Outbound[] = [];

    for (const room of this.rooms.expired(nowMs)) {
      this.refusals.expiredRooms += 1;
      for (const occupant of room.occupants.values()) {
        const conn = this.connections.get(occupant.connection);
        if (conn !== undefined) {
          conn.roomCode = null;
          conn.peer = null;
          conn.closing = true;
        }
        out.push({ to: occupant.connection, message: { t: 'closed', reason: 'expired' }, close: true });
      }
      this.roomsPerAddress.release(room.ownerKey);
      this.rooms.delete(room.code);
    }

    const deadline = nowMs - this.options.limits.handshakeGraceMs;
    for (const conn of this.connections.values()) {
      if (conn.closing || conn.roomCode !== null || conn.openedAtMs > deadline) continue;
      conn.closing = true;
      this.refusals.idleConnections += 1;
      out.push({ to: conn.id, message: { t: 'closed', reason: 'idle' }, close: true });
    }

    this.creates.sweep(nowMs);
    this.joins.sweep(nowMs);
    this.signals.sweep(nowMs);
    return out;
  }

  shutdown(): Outbound[] {
    return [...this.connections.keys()].map((id) => ({
      to: id,
      message: { t: 'closed', reason: 'shutdown' } as ServerMessage,
      close: true as const,
    }));
  }

  private ice(peer: PeerId, nowMs: number): readonly IceServerPayload[] {
    return iceServersFor(this.options.stunUrls, this.options.turn, peer, nowMs);
  }

  private hangUp(conn: Connection, code: ErrorCode): Outbound {
    conn.closing = true;
    return refuse(conn.id, code);
  }
}

const refuse = (to: ConnectionId, code: ErrorCode): Outbound => ({
  to,
  message: { t: 'error', code },
  close: true,
});
