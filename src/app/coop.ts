
import type { Intent } from '../sim/types';
import { LockstepSession, inputDelayForLink } from '../net/lockstep';
import type { Desync, NetMessage, PeerId } from '../net/lockstep';
import { PeerLink } from '../net/channel';
import type {
  DataChannelLike,
  IceCandidateInit,
  LobbyState,
  PeerConnectionLike,
  PeerLinkDeps,
  SessionDescriptionInit,
  SocketLike,
} from '../net/channel';
export type { LobbyState } from '../net/channel';

export type CoopState =
  | 'connecting'
  | 'waiting'
  | 'playing'
  | 'closed';

export interface CoopOptions {
  intent: { kind: 'host'; size?: number } | { kind: 'join'; room: string };
  size?: number;
  inputDelay: number;
  checkpointInterval: number;
  deps: PeerLinkDeps;
  onRoom(room: string): void;
  onStateChange(state: CoopState): void;
  onLobby?(lobby: LobbyState): void;
}

export { ROOM_ALPHABET, ROOM_CODE_LENGTH, isRoomCode } from '../game/room-code';
import { isRoomCode } from '../game/room-code';

export const coopIntentFromSearch = (search: string): CoopOptions['intent'] | null => {
  const params = new URLSearchParams(search);
  if (params.get('host') === '1') {
    const size = Number(params.get('size'));
    return Number.isInteger(size) && size >= 2 && size <= 4
      ? { kind: 'host', size }
      : { kind: 'host' };
  }
  const room = (params.get('join') ?? '').toUpperCase();
  if (room === '') return null;
  return isRoomCode(room) ? { kind: 'join', room } : null;
};

export const signalingUrlFor = (
  configured: string,
  location: { protocol: string; host: string },
): string => {
  if (configured !== '') return configured;
  if (location.protocol === 'https:') return `wss://${location.host}/signal`;
  if (location.protocol === 'http:') return `ws://${location.host}/signal`;
  return '';
};

export const coopJoinLink = (href: string, room: string): string => {
  if (!isRoomCode(room)) return '';
  const url = new URL(href);
  url.searchParams.delete('host');
  url.searchParams.delete('participant');
  url.searchParams.set('join', room);
  return url.toString();
};

export const coopStatusLines = (status: {
  room: string;
  state: string;
  ice: string;
  desync: Desync | null;
}): string[] => {
  if (status.state === '') return [];
  const where = status.room === '' ? 'co-op:' : `co-op ${status.room} —`;
  const ice = status.ice === '' ? '' : `  ice ${status.ice}`;
  if (status.desync === null) return [`${where} ${status.state}${ice}`];
  const sides = [...status.desync.byPeer]
    .map(([peer, fingerprint]) => `${peer.slice(0, 6)} ${(fingerprint >>> 0).toString(16)}`)
    .join(' vs ');
  return [
    `${where} DESYNCED at tick ${status.desync.tick}${ice}`,
    `  the worlds parted — ${sides}`,
    '  nothing will advance again; reload both peers',
  ];
};

export class CoopSession {
  private readonly link: PeerLink;
  private session: LockstepSession | null = null;
  private state: CoopState = 'connecting';
  private early: NetMessage[] = [];
  private localIndex = 0;
  private roomCode = '';
  private lobbyState: LobbyState | null = null;

  constructor(private readonly options: CoopOptions) {
    this.link = new PeerLink(options.deps, {
      onMessage: (message) => this.onMessage(message),
      onRoom: (room) => {
        this.options.onRoom(room);
        this.moveTo('waiting');
      },
      onLobby: (lobby) => {
        this.lobbyState = lobby;
        this.options.onLobby?.(lobby);
      },
      onStarted: (info) => this.onStarted(info),
      onClosed: () => this.moveTo('closed'),
    });
    if (options.intent.kind === 'host') this.link.host(options.size);
    else this.link.join(options.intent.room);
  }

  get lobby(): LobbyState | null {
    return this.state === 'waiting' ? this.lobbyState : null;
  }

  start(): void {
    this.link.start();
  }

  get localPlayer(): number {
    return this.localIndex;
  }

  get rosterSize(): number | null {
    return this.session === null ? null : this.session.peers.length;
  }

  get room(): string {
    return this.roomCode;
  }

  get iceState(): string {
    return this.link.iceState;
  }

  get playing(): boolean {
    return this.state === 'playing';
  }

  get diagnostics(): { link: PeerLink['diagnostics']; session: LockstepSession['counters'] } | null {
    return this.session === null ? null : { link: this.link.diagnostics, session: this.session.counters };
  }

  advance(local: Intent): Intent[] | null {
    const session = this.session;
    if (session === null) return null;
    const message = session.submitLocal(local);
    this.link.send(message);
    const taken = session.take();
    return taken === null ? null : taken.map((entry) => entry.intent);
  }

  checkpoint(tick: number, fingerprint: number): void {
    const message = this.session?.reportCheckpoint(tick, fingerprint);
    if (message !== null && message !== undefined) this.link.send(message);
  }

  get desync(): Desync | null {
    return this.session?.desyncReport ?? null;
  }

  close(): void {
    this.link.close();
    this.moveTo('closed');
  }

  private onStarted(info: { self: PeerId; roster: readonly PeerId[]; room: string }): void {
    this.roomCode = info.room;
    this.session = new LockstepSession({
      peers: info.roster,
      localPeer: info.self,
      inputDelay: this.options.inputDelay,
      checkpointInterval: this.options.checkpointInterval,
    });
    this.localIndex = this.session.peers.indexOf(info.self);
    for (const message of this.early) this.session.receive(message);
    this.early = [];
    this.moveTo('playing');
  }

  private onMessage(message: NetMessage): void {
    if (this.session === null) {
      if (this.early.length < 100) this.early.push(message);
      return;
    }
    this.session.receive(message);
  }

  private moveTo(state: CoopState): void {
    if (this.state === state) return;
    this.state = state;
    this.options.onStateChange(state);
  }
}

export { inputDelayForLink };

export const browserDeps = (signalingUrl: string): PeerLinkDeps => ({
  openSocket: () => {
    const socket = new WebSocket(signalingUrl);
    const adapted: SocketLike = {
      send: (data) => socket.send(data),
      close: () => socket.close(),
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
    };
    socket.onopen = () => adapted.onopen?.();
    socket.onmessage = (event: MessageEvent) => adapted.onmessage?.({ data: String(event.data) });
    socket.onclose = () => adapted.onclose?.();
    socket.onerror = () => adapted.onerror?.();
    return adapted;
  },
  createConnection: (ice) => {
    const connection = new RTCPeerConnection({
      iceServers: ice.map((server) => ({
        urls: [...server.urls],
        username: server.username,
        credential: server.credential,
      })),
    });
    const adaptChannel = (channel: RTCDataChannel): DataChannelLike => {
      channel.binaryType = 'arraybuffer';
      const adapted: DataChannelLike = {
        send: (data) => channel.send(data as unknown as ArrayBufferView<ArrayBuffer>),
        close: () => channel.close(),
        onopen: null,
        onclose: null,
        onmessage: null,
      };
      channel.onopen = () => adapted.onopen?.();
      channel.onclose = () => adapted.onclose?.();
      channel.onmessage = (event: MessageEvent) =>
        adapted.onmessage?.({ data: event.data as ArrayBuffer });
      return adapted;
    };
    const adapted: PeerConnectionLike = {
      get iceConnectionState() {
        return connection.iceConnectionState;
      },
      createDataChannel: (label, options) => adaptChannel(connection.createDataChannel(label, options)),
      createOffer: async () => (await connection.createOffer()) as SessionDescriptionInit,
      createAnswer: async () => (await connection.createAnswer()) as SessionDescriptionInit,
      setLocalDescription: (description) => connection.setLocalDescription(description),
      setRemoteDescription: (description) => connection.setRemoteDescription(description),
      addIceCandidate: (candidate) => connection.addIceCandidate(candidate),
      close: () => connection.close(),
      onicecandidate: null,
      ondatachannel: null,
    };
    connection.onicecandidate = (event) =>
      adapted.onicecandidate?.({
        candidate: event.candidate === null ? null : (event.candidate.toJSON() as IceCandidateInit),
      });
    connection.ondatachannel = (event) =>
      adapted.ondatachannel?.({ channel: adaptChannel(event.channel) });
    return adapted;
  },
});
