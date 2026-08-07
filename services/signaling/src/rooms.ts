
import { randomBytes } from 'node:crypto';
import type { Limits } from './config.ts';
import { ROOM_ALPHABET, ROOM_CODE_LENGTH, type PeerId, type RoomCode } from './protocol.ts';

export type ConnectionId = string;

export interface Occupant {
  connection: ConnectionId;
  peer: PeerId;
  descriptions: number;
  candidates: number;
}

export interface Room {
  code: RoomCode;
  createdAtMs: number;
  expiresAtMs: number;
  ownerKey: string;
  capacity: number;
  host: PeerId | null;
  sealed: boolean;
  occupants: Map<ConnectionId, Occupant>;
}

const randomRoomCode = (): RoomCode => {
  const bytes = randomBytes(ROOM_CODE_LENGTH);
  let code = '';
  for (const byte of bytes) code += ROOM_ALPHABET[byte & 31];
  return code;
};

const randomPeerId = (): PeerId => randomBytes(6).toString('hex');

export class RoomRegistry {
  private readonly rooms = new Map<RoomCode, Room>();

  private readonly limits: Limits;

  constructor(limits: Limits) {
    this.limits = limits;
  }

  get size(): number {
    return this.rooms.size;
  }

  get(code: RoomCode): Room | undefined {
    return this.rooms.get(code);
  }

  create(ownerKey: string, nowMs: number, capacity = this.limits.peersPerRoom): Room | null {
    if (this.rooms.size >= this.limits.maxRooms) return null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = randomRoomCode();
      if (this.rooms.has(code)) continue;
      const room: Room = {
        code,
        createdAtMs: nowMs,
        expiresAtMs: nowMs + this.limits.roomTtlMs,
        ownerKey,
        capacity: Math.max(2, Math.min(capacity, this.limits.maxPeersPerRoom)),
        host: null,
        sealed: false,
        occupants: new Map(),
      };
      this.rooms.set(code, room);
      return room;
    }
    return null;
  }

  join(room: Room, connection: ConnectionId, peersPerRoom = room.capacity): Occupant | null {
    if (room.occupants.size >= peersPerRoom) return null;
    let peer = randomPeerId();
    const taken = new Set([...room.occupants.values()].map((occupant) => occupant.peer));
    while (taken.has(peer)) peer = randomPeerId();

    const occupant: Occupant = { connection, peer, descriptions: 0, candidates: 0 };
    room.occupants.set(connection, occupant);
    return occupant;
  }

  leave(room: Room, connection: ConnectionId): Occupant | undefined {
    const occupant = room.occupants.get(connection);
    room.occupants.delete(connection);
    if (room.occupants.size === 0) this.rooms.delete(room.code);
    return occupant;
  }

  delete(code: RoomCode): void {
    this.rooms.delete(code);
  }

  expired(nowMs: number): Room[] {
    const done: Room[] = [];
    for (const room of this.rooms.values()) {
      if (room.expiresAtMs <= nowMs) done.push(room);
    }
    return done;
  }
}
