
import { NEUTRAL_INTENT } from '../src/sim/types';
import { quantizeIntent } from '../src/sim/intent';
import type { NetMessage } from '../src/net/lockstep';
import { encodeMessage, encodeStart } from '../src/net/wire';
import { parseClientMessage } from '../services/signaling/src/protocol';
import { DEFAULT_LIMITS } from '../services/signaling/src/config';
import type {
  ClientMessage,
  DataChannelLike,
  IceCandidateInit,
  IceServerConfig,
  LobbyState,
  PeerConnectionLike,
  SessionDescriptionInit,
  SocketLike,
} from '../src/net/channel';
import { PeerLink } from '../src/net/channel';

const OFFER_SDP = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n';

class FakeChannel implements DataChannelLike {
  sent: Uint8Array[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer | Uint8Array }) => void) | null = null;
  closed = false;
  send(data: Uint8Array): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
  open(): void {
    this.onopen?.();
  }
  deliver(data: ArrayBuffer | Uint8Array): void {
    this.onmessage?.({ data });
  }
}

class FakeSocket implements SocketLike {
  sent: ClientMessage[] = [];
  closed = false;
  opened = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send(data: string): void {
    if (!this.opened) throw new Error('InvalidStateError: still CONNECTING');
    this.sent.push(JSON.parse(data) as ClientMessage);
  }
  open(): void {
    this.opened = true;
    this.onopen?.();
  }
  close(): void {
    this.closed = true;
  }
  deliver(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  deliverRaw(data: string): void {
    this.onmessage?.({ data });
  }
}

class FakeConnection implements PeerConnectionLike {
  iceConnectionState = 'connected';
  channels: FakeChannel[] = [];
  local: SessionDescriptionInit | null = null;
  remoteDesc: SessionDescriptionInit | null = null;
  candidates: IceCandidateInit[] = [];
  channelOptions: { ordered: boolean; maxRetransmits: number } | null = null;
  ice: readonly IceServerConfig[] = [];
  onicecandidate: ((event: { candidate: IceCandidateInit | null }) => void) | null = null;
  ondatachannel: ((event: { channel: DataChannelLike }) => void) | null = null;

  createDataChannel(_label: string, options: { ordered: boolean; maxRetransmits: number }): DataChannelLike {
    this.channelOptions = options;
    const channel = new FakeChannel();
    this.channels.push(channel);
    return channel;
  }
  createOffer(): Promise<SessionDescriptionInit> {
    return Promise.resolve({ type: 'offer', sdp: OFFER_SDP });
  }
  createAnswer(): Promise<SessionDescriptionInit> {
    return Promise.resolve({ type: 'answer', sdp: OFFER_SDP });
  }
  setLocalDescription(description: SessionDescriptionInit): Promise<void> {
    this.local = description;
    return Promise.resolve();
  }
  setRemoteDescription(description: SessionDescriptionInit): Promise<void> {
    this.remoteDesc = description;
    return Promise.resolve();
  }
  addIceCandidate(candidate: IceCandidateInit): Promise<void> {
    if (this.remoteDesc === null) throw new Error('addIceCandidate before setRemoteDescription');
    this.candidates.push(candidate);
    return Promise.resolve();
  }
  close(): void {}
  fireIce(candidate: IceCandidateInit | null): void {
    this.onicecandidate?.({ candidate });
  }
  offerChannel(channel: DataChannelLike): void {
    this.ondatachannel?.({ channel });
  }
}

const CANDIDATE: IceCandidateInit = {
  candidate: 'candidate:1 1 udp 2 127.0.0.1 5000 typ host',
  sdpMid: '0',
  sdpMLineIndex: 0,
  usernameFragment: null,
};

interface Rig {
  link: PeerLink;
  socket: FakeSocket;
  connection: FakeConnection;
  connections: FakeConnection[];
  received: NetMessage[];
  started: { self: string; roster: readonly string[]; room: string }[];
  lobbies: LobbyState[];
  closed: string[];
  rooms: string[];
}

const rig = (): Rig => {
  const socket = new FakeSocket();
  const connections: FakeConnection[] = [];
  const received: NetMessage[] = [];
  const started: { self: string; roster: readonly string[]; room: string }[] = [];
  const lobbies: LobbyState[] = [];
  const closed: string[] = [];
  const rooms: string[] = [];
  const link = new PeerLink(
    {
      openSocket: () => socket,
      createConnection: (ice) => {
        const connection = new FakeConnection();
        connection.ice = ice;
        connections.push(connection);
        return connection;
      },
    },
    {
      onMessage: (message) => received.push(message),
      onRoom: (room) => rooms.push(room),
      onLobby: (lobby) => lobbies.push(lobby),
      onStarted: (info) => started.push(info),
      onClosed: (reason) => closed.push(reason),
    },
  );
  return {
    link,
    socket,
    get connection() {
      return connections[0] as FakeConnection;
    },
    connections,
    received,
    started,
    lobbies,
    closed,
    rooms,
  };
};

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

const welcome = (self: string, peers: string[] = [], host = self, capacity = 2) => ({
  t: 'welcome',
  room: 'ABC234',
  self,
  peers,
  ice: [{ urls: ['stun:example:3478'] }],
  expiresInMs: 900000,
  host,
  capacity,
});

describe('the handshake', () => {
  it('asks to create a room, then offers when somebody joins', async () => {
    const r = rig();
    r.link.host();
    r.socket.open();
    expect(r.socket.sent).toEqual([{ t: 'create' }]);

    r.socket.deliver(welcome('aaaaaaaaaaaa'));
    await settle();
    r.socket.deliver({ t: 'peer-joined', peer: 'ffffffffffff' });
    await settle();

    const offer = r.socket.sent[1];
    expect(offer.t).toBe('desc');
    expect(offer.t === 'desc' && offer.sdp.type).toBe('offer');
    expect(r.connection.local?.type).toBe('offer');
  });

  it('answers rather than offering when its id is the higher one', async () => {
    const r = rig();
    r.link.join('ABC234');
    r.socket.open();
    r.socket.deliver(welcome('ffffffffffff', ['aaaaaaaaaaaa']));
    await settle();

    expect(r.socket.sent.filter((m) => m.t === 'desc')).toEqual([]);

    r.socket.deliver({ t: 'desc', from: 'aaaaaaaaaaaa', sdp: { type: 'offer', sdp: OFFER_SDP } });
    await settle();

    const answer = r.socket.sent.find((m) => m.t === 'desc');
    expect(answer?.t === 'desc' && answer.sdp.type).toBe('answer');
  });

  it('queues what it wants to say until the socket is actually open', () => {
    const r = rig();
    r.link.host();

    expect(r.socket.sent).toEqual([]);
    r.socket.open();
    expect(r.socket.sent).toEqual([{ t: 'create' }]);
  });

  it('tells the host its room code before anybody has joined', async () => {
    const r = rig();
    r.link.host();
    r.socket.open();
    r.socket.deliver(welcome('aaaaaaaaaaaa'));
    await settle();

    expect(r.rooms).toEqual(['ABC234']);
    expect(r.started).toEqual([]);
    expect(r.connections).toEqual([]);
  });

  it('opens the channel unreliable and unordered', async () => {
    const r = rig();
    r.link.host();
    r.socket.open();
    r.socket.deliver(welcome('aaaaaaaaaaaa', ['ffffffffffff']));
    await settle();

    expect(r.connection.channelOptions).toEqual({ ordered: false, maxRetransmits: 0 });
  });

  it('takes its ICE servers from the service rather than from a constant', async () => {
    const r = rig();
    r.link.host();
    r.socket.open();
    r.socket.deliver(welcome('aaaaaaaaaaaa', ['ffffffffffff']));
    await settle();

    expect(r.connection.ice).toEqual([{ urls: ['stun:example:3478'] }]);
  });

  it('holds a candidate that arrives before the description it belongs to', async () => {
    const r = rig();
    r.link.join('ABC234');
    r.socket.open();
    r.socket.deliver(welcome('ffffffffffff', ['aaaaaaaaaaaa']));
    await settle();

    r.socket.deliver({ t: 'cand', from: 'aaaaaaaaaaaa', candidate: CANDIDATE });
    await settle();
    expect(r.connection.candidates).toEqual([]);

    r.socket.deliver({ t: 'desc', from: 'aaaaaaaaaaaa', sdp: { type: 'offer', sdp: OFFER_SDP } });
    await settle();
    expect(r.connection.candidates).toEqual([CANDIDATE]);
  });

  it('closes the signaling socket when the roster seals, not when a channel opens', async () => {
    const r = rig();
    r.link.host(4);
    r.socket.open();
    r.socket.deliver(welcome('aaaaaaaaaaaa', ['ffffffffffff'], 'aaaaaaaaaaaa', 4));
    await settle();
    expect(r.socket.closed).toBe(false);

    r.connection.channels[0].open();
    expect(r.socket.closed).toBe(false);
    expect(r.started).toEqual([]);

    r.link.start();

    expect(r.socket.sent.at(-1)).toEqual({ t: 'seal' });
    expect(r.socket.closed).toBe(true);
    expect(r.started).toEqual([
      { self: 'aaaaaaaaaaaa', roster: ['aaaaaaaaaaaa', 'ffffffffffff'], room: 'ABC234' },
    ]);
    expect(r.closed).toEqual([]);
  });
});

describe('carrying messages', () => {
  const message: NetMessage = {
    kind: 'intent',
    peer: 'aaaaaaaaaaaa',
    tick: 12,
    intent: quantizeIntent({ ...NEUTRAL_INTENT, move: { x: 0.5, y: -0.25 }, guardHeld: true }),
  };

  const connectedRig = async (): Promise<Rig & { channel: FakeChannel }> => {
    const r = rig();
    r.link.host();
    r.socket.open();
    r.socket.deliver(welcome('aaaaaaaaaaaa', ['ffffffffffff']));
    await settle();
    const channel = r.connection.channels[0];
    channel.open();
    r.link.start();
    return { ...r, channel };
  };

  it('attributes an inbound frame to the channel it arrived on, never to the payload', async () => {
    const r = await connectedRig();
    r.channel.deliver(encodeMessage({ ...message, peer: 'ignored-by-design' }));

    expect(r.received).toHaveLength(1);
    expect(r.received[0].peer).toBe('ffffffffffff');
  });

  it('counts a frame it cannot decode instead of throwing', async () => {
    const r = await connectedRig();
    r.channel.deliver(new Uint8Array([0, 1, 2]));

    expect(r.received).toEqual([]);
    expect(r.link.diagnostics.refusedFrames).toBe(1);
  });

  it('reads a frame delivered as a raw ArrayBuffer', async () => {
    const r = await connectedRig();
    const bytes = encodeMessage(message);
    r.channel.deliver(bytes.buffer.slice(0) as ArrayBuffer);

    expect(r.received).toHaveLength(1);
  });

  it('drops a send before the channel exists rather than throwing', async () => {
    const r = rig();
    r.link.host();
    r.socket.open();
    expect(() => r.link.send(message)).not.toThrow();
  });

  it('counts a malformed signaling frame', () => {
    const r = rig();
    r.link.host();
    r.socket.open();
    r.socket.deliverRaw('{not json');
    r.socket.deliver({ t: 42 });

    expect(r.link.diagnostics.malformedSignals).toBe(2);
  });

  it('reports a peer leaving and a service refusal distinguishably', async () => {
    const r = rig();
    r.link.host();
    r.socket.open();
    r.socket.deliver(welcome('aaaaaaaaaaaa', ['ffffffffffff']));
    await settle();
    r.connection.channels[0].open();
    r.link.start();

    r.socket.deliver({ t: 'peer-left', peer: 'ffffffffffff', host: 'aaaaaaaaaaaa' });
    r.socket.deliver({ t: 'error', code: 'room_full' });

    expect(r.closed).toEqual(['peer left', 'signaling refused: room_full']);
  });
});

describe('the two declarations of the protocol agree', () => {
  it('sends messages the service actually parses', () => {
    const fromClient: ClientMessage[] = [
      { t: 'create' },
      { t: 'join', room: 'ABC234' },
      { t: 'desc', to: 'aaaaaaaaaaaa', sdp: { type: 'offer', sdp: OFFER_SDP } },
      { t: 'cand', to: 'aaaaaaaaaaaa', candidate: CANDIDATE },
    ];

    for (const message of fromClient) {
      const parsed = parseClientMessage(JSON.stringify(message), DEFAULT_LIMITS);
      expect(parsed.ok, `${message.t} was refused by the service`).toBe(true);
    }
  });
});


describe('a room of more than two', () => {
  const SELF = 'cccccccccccc';
  const LOWER = 'aaaaaaaaaaaa';
  const HIGHER = 'ffffffffffff';

  const meshRig = async (peers: string[] = [LOWER, HIGHER], host = SELF) => {
    const r = rig();
    r.link.host(4);
    r.socket.open();
    r.socket.deliver(welcome(SELF, peers, host, 4));
    await settle();
    return r;
  };

  it('dials every peer already in the room, not merely the first', async () => {
    const r = await meshRig();
    expect(r.connections).toHaveLength(2);
  });

  it('offers to the lower id and answers the higher one, per leg', async () => {
    const r = await meshRig();
    const offers = r.socket.sent.filter(
      (message): message is Extract<ClientMessage, { t: 'desc' }> => message.t === 'desc',
    );
    expect(offers).toHaveLength(1);
    expect(offers[0].to).toBe(HIGHER);
    expect(offers[0].sdp.type).toBe('offer');
  });

  it('applies a description to the leg it came from and no other', async () => {
    const r = await meshRig();
    r.socket.deliver({ t: 'desc', from: LOWER, sdp: { type: 'offer', sdp: OFFER_SDP } });
    await settle();

    const legs = new Map(r.connections.map((c) => [c, c.remoteDesc]));
    const described = [...legs.values()].filter((desc) => desc !== null);
    expect(described).toHaveLength(1);
    expect(described[0]?.type).toBe('offer');
  });

  it('addresses each leg\'s ICE candidates to that leg\'s peer', async () => {
    const r = await meshRig();
    r.connections[0].fireIce(CANDIDATE);
    r.connections[1].fireIce(CANDIDATE);

    const sent = r.socket.sent.filter(
      (message): message is Extract<ClientMessage, { t: 'cand' }> => message.t === 'cand',
    );
    expect(sent.map((message) => message.to)).toEqual([LOWER, HIGHER]);
  });

  it('sends every intent to every open leg, and to no closed one', async () => {
    const r = await meshRig();
    const mine = r.connections[1].channels[0];
    mine.open();
    const theirs = new FakeChannel();
    r.connections[0].offerChannel(theirs);
    theirs.open();

    r.link.start();
    expect(mine.sent).toHaveLength(1);
    expect(theirs.sent).toHaveLength(1);

    r.link.send({ kind: 'checkpoint', peer: SELF, tick: 4, fingerprint: 7 });

    expect(mine.sent).toHaveLength(2);
    expect(theirs.sent).toHaveLength(2);
    expect(mine.sent[1]).toEqual(theirs.sent[1]);
  });

  it('reports the worst leg rather than an average, so one dead link is visible', async () => {
    const r = await meshRig();
    r.connections[0].iceConnectionState = 'connected';
    r.connections[1].iceConnectionState = 'failed';

    expect(r.link.iceState).toBe('failed');
  });

  it('tells the lobby who is here and who may begin', async () => {
    const r = await meshRig();
    const last = r.lobbies[r.lobbies.length - 1] as LobbyState;

    expect(last.peers).toEqual([LOWER, SELF, HIGHER].sort());
    expect(last.capacity).toBe(4);
    expect(last.isHost).toBe(true);
    expect(last.linked).toEqual([]);
  });

  it('survives a peer leaving before the seal, and follows the handover', async () => {
    const r = await meshRig([LOWER, HIGHER], LOWER);
    expect((r.lobbies[r.lobbies.length - 1] as LobbyState).isHost).toBe(false);

    r.socket.deliver({ t: 'peer-left', peer: LOWER, host: SELF });
    await settle();

    const last = r.lobbies[r.lobbies.length - 1] as LobbyState;
    expect(last.peers).toEqual([SELF, HIGHER].sort());
    expect(last.isHost).toBe(true);
    expect(r.closed).toEqual([]);
  });
});

describe('sealing the roster', () => {
  const SELF = 'cccccccccccc';
  const HOST = 'aaaaaaaaaaaa';

  const guestRig = async () => {
    const r = rig();
    r.link.join('ABC234');
    r.socket.open();
    r.socket.deliver(welcome(SELF, [HOST], HOST, 4));
    await settle();
    const theirs = new FakeChannel();
    r.connections[0].offerChannel(theirs);
    theirs.open();
    return { ...r, theirs };
  };

  it('starts when the host says so, on the roster the host sealed', async () => {
    const r = await guestRig();
    r.theirs.deliver(encodeStart([HOST, SELF]));

    expect(r.started).toEqual([{ self: SELF, roster: [HOST, SELF].sort(), room: 'ABC234' }]);
    expect(r.socket.closed).toBe(true);
  });

  it('refuses a seal from a peer the service did not name as host', async () => {
    const r = rig();
    r.link.join('ABC234');
    r.socket.open();
    r.socket.deliver(welcome(SELF, [HOST, 'ffffffffffff'], HOST, 4));
    await settle();
    const impostor = new FakeChannel();
    r.connections[1].offerChannel(impostor);
    impostor.open();

    impostor.deliver(encodeStart([SELF, 'ffffffffffff']));

    expect(r.started).toEqual([]);
    expect(r.link.diagnostics.refusedFrames).toBe(1);
  });

  it('refuses a roster it is not in', async () => {
    const r = await guestRig();
    r.theirs.deliver(encodeStart([HOST, 'ffffffffffff']));

    expect(r.started).toEqual([]);
    expect(r.link.diagnostics.refusedFrames).toBe(1);
  });

  it('ignores a start from a guest, and seals only once', async () => {
    const r = await guestRig();
    r.link.start();
    expect(r.started).toEqual([]);

    r.theirs.deliver(encodeStart([HOST, SELF]));
    r.theirs.deliver(encodeStart([HOST, SELF]));
    expect(r.started).toHaveLength(1);
  });

  it('refuses a peer joining after the seal rather than seating a fifth king', async () => {
    const r = await guestRig();
    r.theirs.deliver(encodeStart([HOST, SELF]));
    const legs = r.connections.length;

    r.socket.deliver({ t: 'peer-joined', peer: 'ffffffffffff' });
    await settle();

    expect(r.connections).toHaveLength(legs);
  });
});

describe('a room that fills', () => {
  it('seals itself, so a pair plays exactly as it did before ADR-028', async () => {
    const r = rig();
    r.link.host();
    r.socket.open();
    r.socket.deliver(welcome('aaaaaaaaaaaa', ['ffffffffffff']));
    await settle();
    expect(r.started).toEqual([]);

    r.connection.channels[0].open();

    expect(r.started).toEqual([
      { self: 'aaaaaaaaaaaa', roster: ['aaaaaaaaaaaa', 'ffffffffffff'], room: 'ABC234' },
    ]);
    expect(r.socket.closed).toBe(true);
  });

  it('waits for every leg before sealing, or the host would start alone', async () => {
    const r = rig();
    r.link.host(3);
    r.socket.open();
    r.socket.deliver(welcome('aaaaaaaaaaaa', ['dddddddddddd', 'ffffffffffff'], 'aaaaaaaaaaaa', 3));
    await settle();

    r.connections[0].channels[0].open();
    expect(r.started).toEqual([]);

    r.connections[1].channels[0].open();
    expect(r.started).toHaveLength(1);
    expect(r.started[0].roster).toEqual(['aaaaaaaaaaaa', 'dddddddddddd', 'ffffffffffff']);
  });

  it('does not seal on a guest, even when the room is full', async () => {
    const r = rig();
    r.link.join('ABC234');
    r.socket.open();
    r.socket.deliver(welcome('ffffffffffff', ['aaaaaaaaaaaa'], 'aaaaaaaaaaaa', 2));
    await settle();
    const theirs = new FakeChannel();
    r.connections[0].offerChannel(theirs);
    theirs.open();

    expect(r.started).toEqual([]);
  });
});
