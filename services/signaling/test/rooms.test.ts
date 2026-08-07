
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LIMITS } from '../src/config.ts';
import { RoomRegistry } from '../src/rooms.ts';
import { ROOM_ALPHABET } from '../src/protocol.ts';

const registry = (over: Partial<typeof DEFAULT_LIMITS> = {}) =>
  new RoomRegistry({ ...DEFAULT_LIMITS, ...over });

test('a room holds a code, its seats, two counters and an expiry — and nothing else', () => {
  const rooms = registry();
  const room = rooms.create('owner-key', 1_000);
  assert.ok(room !== null);

  assert.deepEqual(Object.keys(room).sort(), [
    'capacity',
    'code',
    'createdAtMs',
    'expiresAtMs',
    'host',
    'occupants',
    'ownerKey',
    'sealed',
  ]);

  const occupant = rooms.join(room, 'conn-a');
  assert.ok(occupant !== null);
  assert.deepEqual(Object.keys(occupant).sort(), ['candidates', 'connection', 'descriptions', 'peer']);
});

test('codes come from the unambiguous alphabet and peer ids are 48 random bits', () => {
  const rooms = registry();
  const seen = new Set<string>();
  for (let index = 0; index < 200; index++) {
    const room = rooms.create('owner-key', 0);
    assert.ok(room !== null);
    assert.equal(room.code.length, 6);
    for (const symbol of room.code) assert.ok(ROOM_ALPHABET.includes(symbol), symbol);
    assert.equal(seen.has(room.code), false, 'codes must not repeat while both rooms are live');
    seen.add(room.code);

    const occupant = rooms.join(room, `conn-${index}`);
    assert.match(occupant?.peer ?? '', /^[0-9a-f]{12}$/);
  }
});

test('the registry refuses to grow past its ceiling', () => {
  const rooms = registry({ maxRooms: 2 });
  assert.ok(rooms.create('owner-key', 0) !== null);
  assert.ok(rooms.create('owner-key', 0) !== null);
  assert.equal(rooms.create('owner-key', 0), null);
  assert.equal(rooms.size, 2);
});

test('a seat is freed on leave, and the room dies when the last peer goes', () => {
  const rooms = registry();
  const room = rooms.create('owner-key', 0);
  assert.ok(room !== null);

  assert.ok(rooms.join(room, 'conn-a') !== null);
  assert.ok(rooms.join(room, 'conn-b') !== null);
  assert.equal(rooms.join(room, 'conn-c'), null, 'two seats, per ADR-016');

  rooms.leave(room, 'conn-b');
  assert.equal(rooms.size, 1, 'a half-empty room stays open for a retry');
  assert.ok(rooms.join(room, 'conn-c') !== null);

  rooms.leave(room, 'conn-a');
  rooms.leave(room, 'conn-c');
  assert.equal(rooms.size, 0);
  assert.equal(rooms.get(room.code), undefined);
});

test('the expiry is set at creation and traffic cannot push it out', () => {
  const rooms = registry({ roomTtlMs: 5_000 });
  const room = rooms.create('owner-key', 1_000);
  assert.ok(room !== null);
  assert.equal(room.expiresAtMs, 6_000);

  assert.deepEqual(rooms.expired(5_999), []);
  rooms.join(room, 'conn-a');
  rooms.join(room, 'conn-b');
  assert.equal(room.expiresAtMs, 6_000, 'joining does not renew the lease');
  assert.deepEqual(rooms.expired(6_000), [room]);
});
