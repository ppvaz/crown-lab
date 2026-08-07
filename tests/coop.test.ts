
import type { Intent, World } from '../src/sim/types';
import { NEUTRAL_INTENT } from '../src/sim/types';
import { quantizeIntent } from '../src/sim/intent';
import { addPlayer, createWorld } from '../src/sim/encounter';
import { stepWorld } from '../src/sim/world';
import { makeRng, nextFloat, nextRange } from '../src/sim/rng';
import { fingerprintWorld } from '../src/lab/engine-probe';
import { COMBAT_PRESETS, SLOWMO_PRESETS } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import type {
  DataChannelLike,
  IceCandidateInit,
  IceServerConfig,
  PeerConnectionLike,
  SessionDescriptionInit,
  SocketLike,
} from '../src/net/channel';
import {
  CoopSession,
  coopIntentFromSearch,
  coopJoinLink,
  signalingUrlFor,
  coopStatusLines,
} from '../src/app/coop';

const SDP = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n';

class FakeService {
  private sockets = new Map<string, FakeSocket>();
  private ids: string[] = [];
  register(socket: FakeSocket): void {
    const self = this.ids.length === 0 ? 'aaaaaaaaaaaa' : 'ffffffffffff';
    this.ids.push(self);
    this.sockets.set(self, socket);
    socket.self = self;
    const others = this.ids.filter((id) => id !== self);
    socket.deliver({
      t: 'welcome',
      room: 'ABC234',
      self,
      peers: others,
      ice: [],
      expiresInMs: 1,
      host: this.ids[0],
      capacity: 2,
    });
    for (const other of others) this.sockets.get(other)?.deliver({ t: 'peer-joined', peer: self });
  }
  relay(from: string, message: { t: string; to: string }): void {
    const { to, ...rest } = message;
    this.sockets.get(to)?.deliver({ ...rest, from });
  }
}

class FakeSocket implements SocketLike {
  self = '';
  opened = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(private readonly service: FakeService) {
    queueMicrotask(() => {
      this.opened = true;
      this.onopen?.();
    });
  }
  send(data: string): void {
    if (!this.opened) throw new Error('InvalidStateError: still CONNECTING');
    const message = JSON.parse(data) as { t: string; to?: string };
    if (message.t === 'create' || message.t === 'join') this.service.register(this);
    else if (message.to !== undefined) this.service.relay(this.self, message as { t: string; to: string });
  }
  close(): void {
    this.closed = true;
  }
  deliver(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

class FakeChannel implements DataChannelLike {
  peer: FakeChannel | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer | Uint8Array }) => void) | null = null;
  send(data: Uint8Array): void {
    this.peer?.onmessage?.({ data: data.slice() });
  }
  close(): void {}
}

class FakeConnection implements PeerConnectionLike {
  iceConnectionState = 'connected';
  channel: FakeChannel | null = null;
  onicecandidate: ((event: { candidate: IceCandidateInit | null }) => void) | null = null;
  ondatachannel: ((event: { channel: DataChannelLike }) => void) | null = null;
  createDataChannel(): DataChannelLike {
    this.channel = new FakeChannel();
    return this.channel;
  }
  createOffer(): Promise<SessionDescriptionInit> {
    return Promise.resolve({ type: 'offer', sdp: SDP });
  }
  createAnswer(): Promise<SessionDescriptionInit> {
    return Promise.resolve({ type: 'answer', sdp: SDP });
  }
  setLocalDescription(): Promise<void> {
    return Promise.resolve();
  }
  setRemoteDescription(): Promise<void> {
    return Promise.resolve();
  }
  addIceCandidate(): Promise<void> {
    return Promise.resolve();
  }
  close(): void {}
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

interface Machine {
  coop: CoopSession;
  world: World;
  room: string;
}

const combat = () => structuredClone(COMBAT_PRESETS.Default);
const encounter = () => ENCOUNTERS.kernel_guard;

const seatedWorld = (): World => {
  const cfg = combat();
  const world = createWorld(encounter(), cfg, 7);
  addPlayer(world, cfg, { x: encounter().playerStart.x + 1.6, y: encounter().playerStart.y });
  return world;
};

const pair = async (): Promise<[Machine, Machine]> => {
  const service = new FakeService();
  const connections: FakeConnection[] = [];
  const make = (kind: 'host' | 'join'): Machine => {
    const machine: Machine = { coop: null as never, world: seatedWorld(), room: '' };
    machine.coop = new CoopSession({
      intent: kind === 'host' ? { kind: 'host' } : { kind: 'join', room: 'ABC234' },
      inputDelay: 2,
      checkpointInterval: 120,
      deps: {
        openSocket: () => new FakeSocket(service),
        createConnection: (_ice: readonly IceServerConfig[]) => {
          const connection = new FakeConnection();
          connections.push(connection);
          return connection;
        },
      },
      onRoom: (room) => {
        machine.room = room;
      },
      onStateChange: () => {},
    });
    return machine;
  };

  const host = make('host');
  await settle();
  const guest = make('join');
  await settle();

  const offerer = connections.find((connection) => connection.channel !== null)!;
  const answerer = connections.find((connection) => connection !== offerer)!;
  const inbound = new FakeChannel();
  offerer.channel!.peer = inbound;
  inbound.peer = offerer.channel!;
  answerer.ondatachannel?.({ channel: inbound });
  offerer.channel!.onopen?.();
  inbound.onopen?.();
  await settle();

  host.coop.start();
  await settle();

  return [host, guest];
};

describe('the door', () => {
  it('reads host and join out of the query string, and refuses a malformed code', () => {
    expect(coopIntentFromSearch('?host=1')).toEqual({ kind: 'host' });
    expect(coopIntentFromSearch('?join=abc234')).toEqual({ kind: 'join', room: 'ABC234' });
    expect(coopIntentFromSearch('')).toBeNull();
    expect(coopIntentFromSearch('?join=ABC01I')).toBeNull();
    expect(coopIntentFromSearch('?join=TOOLONG1')).toBeNull();
  });

  it('takes a room size from the host door, and only from the host door', () => {
    expect(coopIntentFromSearch('?host=1&size=3')).toEqual({ kind: 'host', size: 3 });
    expect(coopIntentFromSearch('?host=1&size=4')).toEqual({ kind: 'host', size: 4 });
    expect(coopIntentFromSearch('?join=ABC234&size=4')).toEqual({ kind: 'join', room: 'ABC234' });
  });

  it('falls back to two rather than refusing a size it cannot use', () => {
    for (const search of ['?host=1&size=5', '?host=1&size=1', '?host=1&size=x', '?host=1&size=2.5']) {
      expect(coopIntentFromSearch(search)).toEqual({ kind: 'host' });
    }
  });

  it('offers no way to point the lab at an arbitrary signaling server', () => {
    const search = '?host=1&signal=wss://evil.example/&url=wss://evil.example/';
    expect(coopIntentFromSearch(search)).toEqual({ kind: 'host' });
    expect(JSON.stringify(coopIntentFromSearch(search))).not.toContain('evil');
  });

  it('turns a hosted room into a link the other machine can open', () => {
    const link = coopJoinLink('https://lab.example/index.html?host=1', 'ABC234');
    expect(link).toBe('https://lab.example/index.html?join=ABC234');
    expect(coopIntentFromSearch(new URL(link).search)).toEqual({ kind: 'join', room: 'ABC234' });
  });

  it('carries the session across and leaves the person behind', () => {
    const link = coopJoinLink(
      'https://lab.example/?host=1&mode=parry&experiment=04&condition=B1&participant=P07',
      'ABC234',
    );
    expect(link).toContain('mode=parry');
    expect(link).toContain('experiment=04');
    expect(link).toContain('condition=B1');
    expect(link).not.toContain('participant');
    expect(link).not.toContain('host=1');
  });

  it('produces nothing at all before there is a room, or for a code the door would refuse', () => {
    expect(coopJoinLink('https://lab.example/?host=1', '')).toBe('');
    expect(coopJoinLink('https://lab.example/?host=1', 'ABC01I')).toBe('');
  });
});

describe('where the handshake is', () => {
  it('asks the origin the page came from, so a deployment needs no build configuration', () => {
    expect(signalingUrlFor('', { protocol: 'https:', host: 'lab.example' })).toBe(
      'wss://lab.example/signal',
    );
    expect(signalingUrlFor('', { protocol: 'http:', host: '192.168.1.4:5173' })).toBe(
      'ws://192.168.1.4:5173/signal',
    );
  });

  it('lets the build name somewhere else, for when the two are deliberately apart', () => {
    expect(
      signalingUrlFor('wss://handshake.example/signal', { protocol: 'https:', host: 'lab.example' }),
    ).toBe('wss://handshake.example/signal');
  });

  it('has nothing to ask under file://, where there is no origin', () => {
    expect(signalingUrlFor('', { protocol: 'file:', host: '' })).toBe('');
  });
});

describe('two machines', () => {
  it('agree on who is who without either being told', async () => {
    const [host, guest] = await pair();

    expect(host.room).toBe('ABC234');
    expect(guest.room).toBe('ABC234');
    expect(host.coop.localPlayer).toBe(0);
    expect(guest.coop.localPlayer).toBe(1);
  });

  it('steps two worlds to the same fingerprint from opposite inputs', async () => {
    const [host, guest] = await pair();
    const cfg = combat();
    const def = encounter();
    const slowMo = SLOWMO_PRESETS.none;
    const hostRng = makeRng(1);
    const guestRng = makeRng(2);
    const press = (rng: ReturnType<typeof makeRng>): Intent =>
      quantizeIntent({
        ...NEUTRAL_INTENT,
        move: { x: nextRange(rng, -1, 1), y: nextRange(rng, -1, 1) },
        guardPressed: nextFloat(rng) < 0.1,
        lightPressed: nextFloat(rng) < 0.1,
      });

    let stepped = 0;
    for (let i = 0; i < 400; i++) {
      const forHost = host.coop.advance(press(hostRng));
      const forGuest = guest.coop.advance(press(guestRng));
      expect(forHost === null).toBe(forGuest === null);
      if (forHost === null || forGuest === null) continue;
      stepWorld(host.world, forHost, cfg, slowMo, def);
      stepWorld(guest.world, forGuest, cfg, slowMo, def);
      stepped += 1;
    }

    expect(stepped).toBeGreaterThan(300);
    expect(fingerprintWorld(host.world)).toBe(fingerprintWorld(guest.world));
    expect(host.world.players[0].pos).not.toEqual(host.world.players[1].pos);
  });

  it('stalls rather than stepping when a peer goes quiet', async () => {
    const [host, guest] = await pair();
    for (let i = 0; i < 4; i++) guest.coop.advance(NEUTRAL_INTENT);
    let advanced = 0;
    for (let i = 0; i < 40; i++) {
      if (host.coop.advance(NEUTRAL_INTENT) !== null) advanced += 1;
    }

    expect(advanced).toBeLessThan(10);
  });

  it('reports no desync while the two agree', async () => {
    const [host, guest] = await pair();
    for (let i = 0; i < 200; i++) {
      const forHost = host.coop.advance(NEUTRAL_INTENT);
      const forGuest = guest.coop.advance(NEUTRAL_INTENT);
      if (forHost === null || forGuest === null) continue;
      stepWorld(host.world, forHost, combat(), SLOWMO_PRESETS.none, encounter());
      stepWorld(guest.world, forGuest, combat(), SLOWMO_PRESETS.none, encounter());
      if (host.world.tick % 120 === 0) {
        host.coop.checkpoint(host.world.tick, fingerprintWorld(host.world));
        guest.coop.checkpoint(guest.world.tick, fingerprintWorld(guest.world));
      }
    }

    expect(host.coop.desync).toBeNull();
    expect(guest.coop.desync).toBeNull();
  });
});

describe('what the panel says about a session', () => {
  const desync = (tick: number) => ({
    tick,
    byPeer: new Map([
      ['aaaaaaaaaaaa', 0x2f9a1c40],
      ['ffffffffffff', 0x8817bb3e],
    ]),
  });

  it('says nothing at all in a lab that never asked for co-op', () => {
    expect(coopStatusLines({ room: '', state: '', ice: '', desync: null })).toEqual([]);
  });

  it('leads with the room code, because somebody has to read it out', () => {
    expect(coopStatusLines({ room: 'ABC234', state: 'waiting', ice: 'new', desync: null })).toEqual([
      'co-op ABC234 — waiting  ice new',
    ]);
    expect(coopStatusLines({ room: '', state: 'connecting', ice: '', desync: null })).toEqual([
      'co-op: connecting',
    ]);
  });

  it('replaces the state with the desync, names the tick, and says what to do', () => {
    const lines = coopStatusLines({ room: 'ABC234', state: 'playing', ice: 'connected', desync: desync(4920) });

    expect(lines[0]).toBe('co-op ABC234 — DESYNCED at tick 4920  ice connected');
    expect(lines.join(' ')).not.toContain('playing');
    expect(lines[1]).toContain('2f9a1c40');
    expect(lines[1]).toContain('8817bb3e');
    expect(lines[1]).toContain('aaaaaa');
    expect(lines[2]).toContain('reload both peers');
  });

  it('keeps the ICE word, which is the other failure mode with no symptom of its own', () => {
    const lines = coopStatusLines({ room: 'ABC234', state: 'playing', ice: 'checking', desync: desync(12) });
    expect(lines[0]).toContain('ice checking');
  });

  it('reports the real thing a session hands it, not only a formatted argument', async () => {
    const [host, guest] = await pair();
    for (let i = 0; i < 130; i++) {
      const forHost = host.coop.advance(NEUTRAL_INTENT);
      const forGuest = guest.coop.advance(NEUTRAL_INTENT);
      if (forHost === null || forGuest === null) continue;
      stepWorld(host.world, forHost, combat(), SLOWMO_PRESETS.none, encounter());
      stepWorld(guest.world, forGuest, combat(), SLOWMO_PRESETS.none, encounter());
      if (host.world.tick % 120 === 0) {
        host.coop.checkpoint(host.world.tick, fingerprintWorld(host.world));
        guest.coop.checkpoint(guest.world.tick, fingerprintWorld(guest.world) ^ 0xbeef);
      }
    }

    const desyncReport = host.coop.desync;
    expect(desyncReport).not.toBeNull();
    const lines = coopStatusLines({ room: host.room, state: 'playing', ice: 'connected', desync: desyncReport });
    expect(lines[0]).toBe(`co-op ABC234 — DESYNCED at tick ${desyncReport?.tick}  ice connected`);
    expect(lines).toHaveLength(3);
  });
});
