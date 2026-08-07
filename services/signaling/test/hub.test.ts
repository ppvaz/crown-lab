
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANDIDATE,
  OFFER_SDP,
  errorCode,
  forConnection,
  makeHub,
  only,
  seatedPair,
  send,
  welcomeIn,
} from './support.ts';
import type { ServerMessage } from '../src/protocol.ts';

test('two peers meet in a room and exchange an offer, an answer and candidates', () => {
  const hub = makeHub();
  hub.open('conn-a', '198.51.100.7', 0);
  hub.open('conn-b', '203.0.113.9', 0);

  const created = welcomeIn(send(hub, 'conn-a', { t: 'create' }, 0), 'conn-a');
  assert.match(created.room, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  assert.match(created.self, /^[0-9a-f]{12}$/);
  assert.deepEqual(created.peers, []);
  assert.equal(created.expiresInMs, 900_000);
  assert.equal(created.host, created.self);
  assert.equal(created.capacity, 2);

  const joining = send(hub, 'conn-b', { t: 'join', room: created.room }, 10);
  const joined = welcomeIn(joining, 'conn-b');
  assert.deepEqual(joined.peers, [created.self]);
  assert.deepEqual(forConnection(joining, 'conn-a'), [{ t: 'peer-joined', peer: joined.self }]);

  const offer = only(
    send(hub, 'conn-a', { t: 'desc', to: joined.self, sdp: { type: 'offer', sdp: OFFER_SDP } }, 20),
  );
  assert.equal(offer.to, 'conn-b');
  assert.deepEqual(offer.message, {
    t: 'desc',
    from: created.self,
    sdp: { type: 'offer', sdp: OFFER_SDP },
  });

  const answer = only(
    send(hub, 'conn-b', { t: 'desc', to: created.self, sdp: { type: 'answer', sdp: OFFER_SDP } }, 30),
  );
  assert.equal(answer.to, 'conn-a');

  const candidate = {
    candidate: CANDIDATE,
    sdpMid: '0',
    sdpMLineIndex: 0,
    usernameFragment: 'abcd',
  };
  const trickled = only(send(hub, 'conn-b', { t: 'cand', to: created.self, candidate }, 40));
  assert.equal(trickled.to, 'conn-a');
  assert.deepEqual(trickled.message, { t: 'cand', from: joined.self, candidate });

  const done = { candidate: '', sdpMid: null, sdpMLineIndex: null, usernameFragment: null };
  assert.equal(only(send(hub, 'conn-a', { t: 'cand', to: joined.self, candidate: done }, 50)).to, 'conn-b');

  assert.deepEqual(hub.stats, { rooms: 1, connections: 2 });
  assert.equal(
    Object.values(hub.counters).reduce((sum, count) => sum + count, 0),
    0,
    'a clean handshake refuses nothing',
  );
});

test('a third peer is refused, and the pair it tried to join is untouched', () => {
  const hub = makeHub();
  const pair = seatedPair(hub);
  hub.open('conn-c', '192.0.2.30', 0);

  const refused = send(hub, 'conn-c', { t: 'join', room: pair.room }, 0);
  assert.equal(errorCode(refused), 'room_full');
  assert.equal(hub.counters.roomFull, 1);
  assert.equal(only(refused).close, undefined);
  assert.deepEqual(forConnection(refused, pair.a.connection), []);
  assert.deepEqual(forConnection(refused, pair.b.connection), []);
  assert.deepEqual(hub.stats, { rooms: 1, connections: 3 });

  send(hub, 'conn-c', { t: 'create' }, 0);
  const stranger = send(
    hub,
    'conn-c',
    { t: 'desc', to: pair.a.peer, sdp: { type: 'offer', sdp: OFFER_SDP } },
    0,
  );
  assert.equal(errorCode(stranger), 'unknown_peer');
});

test('malformed messages are refused and counted, and the connection survives them', () => {
  const hub = makeHub();
  hub.open('conn-a', '198.51.100.7', 0);

  const cases: unknown[] = [
    'not json at all',
    JSON.stringify(null),
    JSON.stringify([1, 2, 3]),
    JSON.stringify({}),
    JSON.stringify({ t: 'shutdown' }),
    JSON.stringify({ t: 'create', extra: 1 }),
    JSON.stringify({ t: 'join', room: 'AB' }),
    JSON.stringify({ t: 'join', room: 'AAAAAA', sneaky: true }),
    JSON.stringify({ t: 'desc', to: 'zzzz', sdp: { type: 'offer', sdp: OFFER_SDP } }),
    JSON.stringify({ t: 'desc', to: '0123456789ab', sdp: { type: 'offer', sdp: '{"tick":41}' } }),
    JSON.stringify({ t: 'cand', to: '0123456789ab', candidate: { candidate: 'intents-go-here' } }),
  ];
  for (const raw of cases) {
    const out = hub.receive('conn-a', String(raw), 0);
    assert.equal(errorCode(out), 'bad_message', `should have refused ${String(raw)}`);
    assert.equal(only(out).close, undefined, 'a bad message does not end the conversation');
  }
  assert.equal(hub.counters.malformed, cases.length);

  assert.ok(welcomeIn(send(hub, 'conn-a', { t: 'create' }, 0), 'conn-a').room.length === 6);
});

test('an oversized frame is refused before it is parsed, and ends the connection', () => {
  const hub = makeHub({ maxMessageBytes: 200 });
  hub.open('conn-a', '198.51.100.7', 0);

  const out = hub.receive('conn-a', JSON.stringify({ t: 'join', room: 'A'.repeat(4000) }), 0);
  assert.equal(errorCode(out), 'too_large');
  assert.equal(only(out).close, true);
  assert.equal(hub.counters.oversized, 1);
  assert.equal(hub.counters.malformed, 0, 'the size check runs before JSON.parse');
});

test('relaying without a room, or to yourself, is refused', () => {
  const hub = makeHub();
  hub.open('conn-a', '198.51.100.7', 0);
  const homeless = send(
    hub,
    'conn-a',
    { t: 'desc', to: '0123456789ab', sdp: { type: 'offer', sdp: OFFER_SDP } },
    0,
  );
  assert.equal(errorCode(homeless), 'not_in_room');

  const pair = seatedPair(makeHub());
  const narcissist = send(
    pair.hub,
    pair.a.connection,
    { t: 'desc', to: pair.a.peer, sdp: { type: 'offer', sdp: OFFER_SDP } },
    0,
  );
  assert.equal(errorCode(narcissist), 'unknown_peer');
});

test('a message for a connection the hub never registered is counted, not thrown', () => {
  const hub = makeHub();
  assert.deepEqual(hub.receive('ghost', JSON.stringify({ t: 'create' }), 0), []);
  assert.equal(hub.counters.unknownConnection, 1);
});

test('room creation is rate limited per address, and the bucket refills', () => {
  const hub = makeHub({ createsPerMinute: 2, roomsPerAddress: 10 });
  for (let index = 0; index < 3; index++) hub.open(`conn-${index}`, '198.51.100.7', 0);

  assert.ok(welcomeIn(send(hub, 'conn-0', { t: 'create' }, 0), 'conn-0'));
  assert.ok(welcomeIn(send(hub, 'conn-1', { t: 'create' }, 0), 'conn-1'));

  const refused = send(hub, 'conn-2', { t: 'create' }, 0);
  assert.equal(errorCode(refused), 'rate_limited');
  assert.equal(only(refused).close, true);
  assert.equal(hub.counters.rateLimited, 1);
  assert.equal(hub.stats.rooms, 2);

  hub.open('conn-later', '198.51.100.7', 60_000);
  assert.ok(welcomeIn(send(hub, 'conn-later', { t: 'create' }, 60_000), 'conn-later'));
});

test('live rooms per address are capped independently of the creation rate', () => {
  const hub = makeHub({ createsPerMinute: 100, roomsPerAddress: 1 });
  hub.open('conn-0', '198.51.100.7', 0);
  hub.open('conn-1', '198.51.100.7', 0);
  hub.open('other', '203.0.113.9', 0);

  assert.ok(welcomeIn(send(hub, 'conn-0', { t: 'create' }, 0), 'conn-0'));
  assert.equal(errorCode(send(hub, 'conn-1', { t: 'create' }, 0)), 'rate_limited');
  assert.ok(welcomeIn(send(hub, 'other', { t: 'create' }, 0), 'other'));

  hub.close('conn-0', 0);
  hub.open('conn-2', '198.51.100.7', 0);
  assert.ok(welcomeIn(send(hub, 'conn-2', { t: 'create' }, 0), 'conn-2'));
});

test('join attempts are rate limited, which is what makes room codes unguessable', () => {
  const hub = makeHub({ joinsPerMinute: 2 });
  hub.open('conn-a', '198.51.100.7', 0);

  assert.equal(errorCode(send(hub, 'conn-a', { t: 'join', room: 'AAAAAA' }, 0)), 'no_room');
  assert.equal(errorCode(send(hub, 'conn-a', { t: 'join', room: 'BBBBBB' }, 0)), 'no_room');
  const refused = send(hub, 'conn-a', { t: 'join', room: 'CCCCCC' }, 0);
  assert.equal(errorCode(refused), 'rate_limited');
  assert.equal(only(refused).close, true);
  assert.equal(hub.counters.unknownRoom, 2);
});

test('relay throughput is rate limited per connection, not per address', () => {
  const hub = makeHub({ signalBurst: 2, signalsPerSecond: 1, maxCandidatesPerPeer: 100 });
  const pair = seatedPair(hub);
  const candidate = { candidate: CANDIDATE, sdpMid: '0', sdpMLineIndex: 0, usernameFragment: null };
  const trickle = (nowMs: number) =>
    send(hub, pair.a.connection, { t: 'cand', to: pair.b.peer, candidate }, nowMs);

  assert.equal(only(trickle(0)).to, pair.b.connection);
  assert.equal(only(trickle(0)).to, pair.b.connection);
  const refused = trickle(0);
  assert.equal(errorCode(refused), 'rate_limited');
  assert.equal(only(refused).close, true);

  const partner = send(hub, pair.b.connection, { t: 'cand', to: pair.a.peer, candidate }, 0);
  assert.equal(only(partner).to, pair.a.connection);
});

test('per-room quotas cap what one peer may relay at all', () => {
  const descriptions = makeHub({ maxDescriptionsPerPeer: 1 });
  const first = seatedPair(descriptions);
  const offer = { t: 'desc', to: first.b.peer, sdp: { type: 'offer', sdp: OFFER_SDP } };
  assert.equal(only(send(descriptions, first.a.connection, offer, 0)).to, first.b.connection);
  const overDesc = send(descriptions, first.a.connection, offer, 0);
  assert.equal(errorCode(overDesc), 'quota');
  assert.equal(only(overDesc).close, true);
  assert.equal(descriptions.counters.quota, 1);

  const candidates = makeHub({ maxCandidatesPerPeer: 1 });
  const second = seatedPair(candidates);
  const candidate = { candidate: CANDIDATE, sdpMid: null, sdpMLineIndex: null, usernameFragment: null };
  const cand = { t: 'cand', to: second.b.peer, candidate };
  assert.equal(only(send(candidates, second.a.connection, cand, 0)).to, second.b.connection);
  assert.equal(errorCode(send(candidates, second.a.connection, cand, 0)), 'quota');
});

test('sockets per address and rooms in total have ceilings', () => {
  const sockets = makeHub({ connectionsPerAddress: 2 });
  assert.deepEqual(sockets.open('conn-0', '198.51.100.7', 0), []);
  assert.deepEqual(sockets.open('conn-1', '198.51.100.7', 0), []);
  const refused = sockets.open('conn-2', '198.51.100.7', 0);
  assert.equal(errorCode(refused), 'rate_limited');
  assert.equal(only(refused).close, true);
  assert.equal(sockets.stats.connections, 2, 'a refused socket is never registered');
  sockets.close('conn-0', 0);
  assert.deepEqual(sockets.open('conn-3', '198.51.100.7', 0), []);

  const rooms = makeHub({ maxRooms: 1 });
  rooms.open('conn-a', '198.51.100.7', 0);
  rooms.open('conn-b', '203.0.113.9', 0);
  assert.ok(welcomeIn(send(rooms, 'conn-a', { t: 'create' }, 0), 'conn-a'));
  assert.equal(errorCode(send(rooms, 'conn-b', { t: 'create' }, 0)), 'capacity');
  assert.equal(rooms.counters.capacity, 1);
});

test('a room expires on its own clock, and takes nothing with it', () => {
  const hub = makeHub({ roomTtlMs: 1_000 });
  const pair = seatedPair(hub);

  hub.open('conn-early', '192.0.2.30', 2_000);
  assert.equal(errorCode(send(hub, 'conn-early', { t: 'join', room: pair.room }, 2_000)), 'no_room');
  hub.close('conn-early', 2_000);

  const swept = hub.sweep(2_000);
  assert.equal(swept.length, 2);
  for (const item of swept) {
    assert.deepEqual(item.message, { t: 'closed', reason: 'expired' });
    assert.equal(item.close, true);
  }
  assert.equal(hub.counters.expiredRooms, 1);
  assert.deepEqual(hub.stats, { rooms: 0, connections: 2 });

  assert.deepEqual(hub.sweep(3_000), []);
  hub.open('conn-c', '192.0.2.30', 3_000);
  assert.equal(errorCode(send(hub, 'conn-c', { t: 'join', room: pair.room }, 3_000)), 'no_room');
});

test('a connection that never joins a room is dropped once, after the grace period', () => {
  const hub = makeHub({ handshakeGraceMs: 1_000 });
  hub.open('conn-idle', '198.51.100.7', 0);
  hub.open('conn-busy', '203.0.113.9', 0);
  send(hub, 'conn-busy', { t: 'create' }, 0);

  assert.deepEqual(hub.sweep(500), []);
  const swept = hub.sweep(1_500);
  assert.deepEqual(swept, [{ to: 'conn-idle', message: { t: 'closed', reason: 'idle' }, close: true }]);
  assert.equal(hub.counters.idleConnections, 1);
  assert.deepEqual(hub.sweep(2_000), [], 'the same socket is not reported twice');
});

test('a peer that vanishes mid-handshake leaves its partner a usable room', () => {
  const hub = makeHub();
  const pair = seatedPair(hub);

  const left = hub.close(pair.b.connection, 100);
  assert.deepEqual(left, [
    { to: pair.a.connection, message: { t: 'peer-left', peer: pair.b.peer, host: pair.a.peer } },
  ]);
  assert.deepEqual(hub.stats, { rooms: 1, connections: 1 });

  hub.open('conn-c', '192.0.2.30', 200);
  const rejoined = send(hub, 'conn-c', { t: 'join', room: pair.room }, 200);
  const welcome = welcomeIn(rejoined, 'conn-c');
  assert.deepEqual(welcome.peers, [pair.a.peer]);
  assert.deepEqual(forConnection(rejoined, pair.a.connection), [
    { t: 'peer-joined', peer: welcome.self },
  ]);

  assert.equal(
    errorCode(
      send(hub, pair.a.connection, { t: 'desc', to: pair.b.peer, sdp: { type: 'offer', sdp: OFFER_SDP } }, 300),
    ),
    'unknown_peer',
  );
});

test('when everyone leaves, the hub holds nothing at all', () => {
  const hub = makeHub();
  const pair = seatedPair(hub);
  hub.close(pair.a.connection, 10);
  hub.close(pair.b.connection, 20);
  assert.deepEqual(hub.stats, { rooms: 0, connections: 0 });
  assert.deepEqual(hub.close(pair.a.connection, 30), []);
});

test('shutdown says goodbye to everyone still handshaking', () => {
  const hub = makeHub();
  const pair = seatedPair(hub);
  const farewell = hub.shutdown();
  assert.deepEqual(
    farewell.map((item) => item.to).sort(),
    [pair.a.connection, pair.b.connection].sort(),
  );
  for (const item of farewell) {
    assert.deepEqual(item.message, { t: 'closed', reason: 'shutdown' });
    assert.equal(item.close, true);
  }
});


const seatMany = (
  hub: ReturnType<typeof makeHub>,
  count: number,
  size: number,
): Array<Extract<ServerMessage, { t: 'welcome' }>> => {
  const welcomes: Array<Extract<ServerMessage, { t: 'welcome' }>> = [];
  hub.open('conn-0', '198.51.100.1', 0);
  const first = welcomeIn(send(hub, 'conn-0', { t: 'create', size }, 0), 'conn-0');
  welcomes.push(first);
  for (let index = 1; index < count; index += 1) {
    const connection = `conn-${index}`;
    hub.open(connection, `198.51.100.${index + 1}`, 0);
    welcomes.push(
      welcomeIn(send(hub, connection, { t: 'join', room: first.room }, index), connection),
    );
  }
  return welcomes;
};

test('a room created with a size seats that many, and refuses the one after', () => {
  const hub = makeHub();
  const welcomes = seatMany(hub, 4, 4);

  assert.equal(welcomes[0]?.capacity, 4);
  assert.deepEqual(welcomes[3]?.peers.length, 3);
  assert.deepEqual(new Set(welcomes.map((welcome) => welcome.host)).size, 1);
  assert.equal(welcomes[3]?.host, welcomes[0]?.self);

  hub.open('conn-late', '198.51.100.90', 0);
  assert.equal(errorCode(send(hub, 'conn-late', { t: 'join', room: welcomes[0]!.room }, 5)), 'room_full');
});

test('a two-seat room is still a two-seat room while four-seat ones exist', () => {
  const hub = makeHub();
  const welcomes = seatMany(hub, 2, 2);
  assert.equal(welcomes[0]?.capacity, 2);

  hub.open('conn-third', '198.51.100.91', 0);
  assert.equal(errorCode(send(hub, 'conn-third', { t: 'join', room: welcomes[0]!.room }, 5)), 'room_full');
});

test('a capacity outside 2..4 is refused rather than clamped', () => {
  const hub = makeHub();
  hub.open('conn-a', '198.51.100.7', 0);

  assert.equal(errorCode(send(hub, 'conn-a', { t: 'create', size: 5 }, 0)), 'bad_message');
  assert.equal(errorCode(send(hub, 'conn-a', { t: 'create', size: 1 }, 0)), 'bad_message');
  assert.equal(errorCode(send(hub, 'conn-a', { t: 'create', size: 2.5 }, 0)), 'bad_message');
  assert.equal(errorCode(send(hub, 'conn-a', { t: 'create', size: -2 }, 0)), 'bad_message');
});

test('the seat that may start the run passes on when its holder leaves', () => {
  const hub = makeHub();
  const welcomes = seatMany(hub, 3, 3);
  assert.equal(welcomes[1]?.host, welcomes[0]?.self);

  const left = hub.close('conn-0', 500);
  const told = forConnection(left, 'conn-1');
  assert.deepEqual(told, [{ t: 'peer-left', peer: welcomes[0]!.self, host: welcomes[1]!.self }]);
  assert.deepEqual(forConnection(left, 'conn-2'), told);
});

test('a room that has begun admits nobody, and says so distinguishably', () => {
  const hub = makeHub();
  const welcomes = seatMany(hub, 2, 4);
  assert.deepEqual(send(hub, 'conn-0', { t: 'seal' }, 100), []);

  hub.open('conn-late', '198.51.100.80', 0);
  assert.equal(errorCode(send(hub, 'conn-late', { t: 'join', room: welcomes[0]!.room }, 110)), 'started');
  assert.equal(hub.counters.started, 1);
  assert.deepEqual(forConnection(send(hub, 'conn-late', { t: 'join', room: welcomes[0]!.room }, 120), 'conn-0'), []);
});

test('only the host may close a roster', () => {
  const hub = makeHub();
  const welcomes = seatMany(hub, 3, 4);
  assert.equal(errorCode(send(hub, 'conn-1', { t: 'seal' }, 100)), 'forbidden');
  assert.equal(hub.counters.forbidden, 1);

  hub.open('conn-4', '198.51.100.81', 0);
  assert.ok(welcomeIn(send(hub, 'conn-4', { t: 'join', room: welcomes[0]!.room }, 110), 'conn-4'));
});

test('sealing without a room is refused rather than thrown', () => {
  const hub = makeHub();
  hub.open('conn-a', '198.51.100.82', 0);
  assert.equal(errorCode(send(hub, 'conn-a', { t: 'seal' }, 0)), 'not_in_room');
});
