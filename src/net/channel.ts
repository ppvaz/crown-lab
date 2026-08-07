
import type { NetMessage, PeerId } from './lockstep';
import { decodeMessage, encodeMessage, encodeStart } from './wire';


export interface SessionDescriptionInit {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp: string;
}

export interface IceCandidateInit {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment: string | null;
}

export interface IceServerConfig {
  urls: readonly string[];
  username?: string;
  credential?: string;
}

export type ClientMessage =
  | { t: 'create'; size?: number }
  | { t: 'join'; room: string }
  | { t: 'seal' }
  | { t: 'desc'; to: PeerId; sdp: SessionDescriptionInit }
  | { t: 'cand'; to: PeerId; candidate: IceCandidateInit };

export type ServerMessage =
  | {
      t: 'welcome';
      room: string;
      self: PeerId;
      peers: readonly PeerId[];
      ice: readonly IceServerConfig[];
      expiresInMs: number;
      host: PeerId;
      capacity: number;
    }
  | { t: 'peer-joined'; peer: PeerId }
  | { t: 'peer-left'; peer: PeerId; host: PeerId | null }
  | { t: 'desc'; from: PeerId; sdp: SessionDescriptionInit }
  | { t: 'cand'; from: PeerId; candidate: IceCandidateInit }
  | { t: 'error'; code: string }
  | { t: 'closed'; reason: string };


export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

export interface DataChannelLike {
  send(data: Uint8Array): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((event: { data: ArrayBuffer | Uint8Array }) => void) | null;
}

export interface PeerConnectionLike {
  readonly iceConnectionState: string;
  createDataChannel(label: string, options: { ordered: boolean; maxRetransmits: number }): DataChannelLike;
  createOffer(): Promise<SessionDescriptionInit>;
  createAnswer(): Promise<SessionDescriptionInit>;
  setLocalDescription(description: SessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: SessionDescriptionInit): Promise<void>;
  addIceCandidate(candidate: IceCandidateInit): Promise<void>;
  close(): void;
  onicecandidate: ((event: { candidate: IceCandidateInit | null }) => void) | null;
  ondatachannel: ((event: { channel: DataChannelLike }) => void) | null;
}

export interface PeerLinkDeps {
  openSocket(): SocketLike;
  createConnection(ice: readonly IceServerConfig[]): PeerConnectionLike;
}

export interface PeerLinkHandlers {
  onMessage(message: NetMessage): void;
  onRoom(room: string, self: PeerId): void;
  onLobby(lobby: LobbyState): void;
  onStarted(info: { self: PeerId; roster: readonly PeerId[]; room: string }): void;
  onClosed(reason: string): void;
}

export interface LobbyState {
  self: PeerId;
  room: string;
  peers: readonly PeerId[];
  linked: readonly PeerId[];
  host: PeerId | null;
  capacity: number;
  isHost: boolean;
}

interface PeerSlot {
  peer: PeerId;
  connection: PeerConnectionLike;
  channel: DataChannelLike | null;
  open: boolean;
  pendingCandidates: IceCandidateInit[];
  remoteDescribed: boolean;
}

export interface LinkDiagnostics {
  ice: string;
  malformedSignals: number;
  refusedFrames: number;
  unattributed: number;
}


const CHANNEL_LABEL = 'crown';

const CHANNEL_OPTIONS = { ordered: false, maxRetransmits: 0 };

export class PeerLink {
  readonly diagnostics: LinkDiagnostics = {
    ice: 'no connection',
    malformedSignals: 0,
    refusedFrames: 0,
    unattributed: 0,
  };

  private socket: SocketLike | null = null;
  private socketOpen = false;
  private outbox: ClientMessage[] = [];
  private readonly slots = new Map<PeerId, PeerSlot>();
  private ice: readonly IceServerConfig[] = [];
  private self: PeerId | null = null;
  private roomHost: PeerId | null = null;
  private capacity = 2;
  private room = '';
  private roster: readonly PeerId[] | null = null;

  constructor(
    private readonly deps: PeerLinkDeps,
    private readonly handlers: PeerLinkHandlers,
  ) {}

  host(size?: number): void {
    this.openSignaling(size === undefined ? { t: 'create' } : { t: 'create', size });
  }

  join(room: string): void {
    this.openSignaling({ t: 'join', room });
  }

  start(): void {
    if (this.self === null || this.roster !== null) return;
    if (this.roomHost !== this.self) return;
    const roster = this.seatedPeers();
    this.signal({ t: 'seal' });
    for (const slot of this.slots.values()) {
      if (slot.open) slot.channel?.send(encodeStart(roster));
    }
    this.seal(roster);
  }

  send(message: NetMessage): void {
    const bytes = encodeMessage(message);
    for (const slot of this.slots.values()) {
      if (slot.open) slot.channel?.send(bytes);
    }
  }

  get iceState(): string {
    const states = [...this.slots.values()].map((slot) => slot.connection.iceConnectionState);
    if (states.length === 0) return 'no connection';
    for (const rank of ['failed', 'disconnected', 'closed', 'new', 'checking', 'completed']) {
      if (states.includes(rank)) return rank;
    }
    return states.every((state) => state === 'connected') ? 'connected' : (states[0] as string);
  }

  close(): void {
    for (const slot of this.slots.values()) {
      slot.channel?.close();
      slot.connection.close();
    }
    this.slots.clear();
    this.socket?.close();
    this.socket = null;
    this.socketOpen = false;
    this.outbox = [];
  }

  private openSignaling(first: ClientMessage): void {
    const socket = this.deps.openSocket();
    this.socket = socket;
    socket.onopen = () => {
      this.socketOpen = true;
      for (const queued of this.outbox) socket.send(JSON.stringify(queued));
      this.outbox = [];
    };
    socket.onmessage = (event) => {
      void this.onSignal(event.data);
    };
    socket.onclose = () => {
      if (this.roster === null) this.handlers.onClosed('signaling closed');
    };
    socket.onerror = () => {
      if (this.roster === null) this.handlers.onClosed('signaling error');
    };
    this.signal(first);
  }

  private signal(message: ClientMessage): void {
    if (this.socket === null) return;
    if (!this.socketOpen) {
      this.outbox.push(message);
      return;
    }
    this.socket.send(JSON.stringify(message));
  }

  private async onSignal(raw: string): Promise<void> {
    let message: ServerMessage;
    try {
      message = JSON.parse(raw) as ServerMessage;
    } catch {
      this.diagnostics.malformedSignals += 1;
      return;
    }
    if (typeof message !== 'object' || message === null || typeof message.t !== 'string') {
      this.diagnostics.malformedSignals += 1;
      return;
    }

    switch (message.t) {
      case 'welcome': {
        this.self = message.self;
        this.room = message.room;
        this.ice = message.ice;
        this.roomHost = message.host;
        this.capacity = message.capacity;
        this.handlers.onRoom(message.room, message.self);
        for (const peer of message.peers) await this.dial(peer);
        this.announce();
        return;
      }

      case 'peer-joined':
        if (this.roster !== null) return;
        await this.dial(message.peer);
        this.announce();
        return;

      case 'peer-left':
        this.onPeerLeft(message.peer, message.host);
        return;

      case 'desc':
        await this.onDescription(message.from, message.sdp);
        return;

      case 'cand':
        await this.onCandidate(message.from, message.candidate);
        return;

      case 'error':
        this.handlers.onClosed(`signaling refused: ${message.code}`);
        return;

      case 'closed':
        this.handlers.onClosed(`signaling closed: ${message.reason}`);
        return;

      default:
        this.diagnostics.malformedSignals += 1;
    }
  }

  private seatedPeers(): PeerId[] {
    const peers = [...this.slots.keys()];
    if (this.self !== null) peers.push(this.self);
    return peers.sort();
  }

  private maybeSealWhenFull(): void {
    if (this.self === null || this.roster !== null || this.roomHost !== this.self) return;
    const seated = this.slots.size + 1;
    if (seated < this.capacity) return;
    if ([...this.slots.values()].some((slot) => !slot.open)) return;
    this.start();
  }

  private announce(): void {
    if (this.self === null || this.roster !== null) return;
    this.maybeSealWhenFull();
    if (this.roster !== null) return;
    this.handlers.onLobby({
      self: this.self,
      room: this.room,
      peers: this.seatedPeers(),
      linked: [...this.slots.values()].filter((slot) => slot.open).map((slot) => slot.peer).sort(),
      host: this.roomHost,
      capacity: this.capacity,
      isHost: this.roomHost === this.self,
    });
  }

  private async dial(peer: PeerId): Promise<void> {
    if (this.self === null || this.slots.has(peer)) return;

    const connection = this.deps.createConnection(this.ice);
    const slot: PeerSlot = {
      peer,
      connection,
      channel: null,
      open: false,
      pendingCandidates: [],
      remoteDescribed: false,
    };
    this.slots.set(peer, slot);

    connection.onicecandidate = (event) => {
      if (event.candidate === null) return;
      this.signal({ t: 'cand', to: peer, candidate: event.candidate });
    };
    connection.ondatachannel = (event) => {
      this.adopt(slot, event.channel);
    };

    if (this.self >= peer) return;

    this.adopt(slot, connection.createDataChannel(CHANNEL_LABEL, CHANNEL_OPTIONS));
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    this.signal({ t: 'desc', to: peer, sdp: offer });
  }

  private async onDescription(from: PeerId, sdp: SessionDescriptionInit): Promise<void> {
    if (!this.slots.has(from)) await this.dial(from);
    const slot = this.slots.get(from);
    if (slot === undefined) return;

    await slot.connection.setRemoteDescription(sdp);
    slot.remoteDescribed = true;
    for (const candidate of slot.pendingCandidates) await slot.connection.addIceCandidate(candidate);
    slot.pendingCandidates = [];

    if (sdp.type !== 'offer') return;
    const answer = await slot.connection.createAnswer();
    await slot.connection.setLocalDescription(answer);
    this.signal({ t: 'desc', to: from, sdp: answer });
  }

  private async onCandidate(from: PeerId, candidate: IceCandidateInit): Promise<void> {
    const slot = this.slots.get(from);
    if (slot === undefined) return;
    if (!slot.remoteDescribed) {
      slot.pendingCandidates.push(candidate);
      return;
    }
    await slot.connection.addIceCandidate(candidate);
  }

  private onPeerLeft(peer: PeerId, host: PeerId | null): void {
    const slot = this.slots.get(peer);
    if (slot !== undefined) {
      slot.channel?.close();
      slot.connection.close();
      this.slots.delete(peer);
    }
    if (this.roster !== null) {
      this.handlers.onClosed('peer left');
      return;
    }
    this.roomHost = host;
    this.announce();
  }

  private seal(roster: readonly PeerId[]): void {
    if (this.roster !== null || this.self === null) return;
    this.roster = roster;
    this.socket?.close();
    this.socket = null;
    this.socketOpen = false;
    this.outbox = [];
    this.handlers.onStarted({ self: this.self, roster, room: this.room });
  }

  private adopt(slot: PeerSlot, channel: DataChannelLike): void {
    slot.channel = channel;
    channel.onopen = () => {
      slot.open = true;
      this.announce();
    };
    channel.onclose = () => {
      slot.open = false;
      if (this.roster === null) this.announce();
      else this.handlers.onClosed('channel closed');
    };
    channel.onmessage = (event) => {
      const bytes = event.data instanceof Uint8Array ? event.data : new Uint8Array(event.data);
      const message = decodeMessage(bytes, slot.peer);
      if (message === null) {
        this.diagnostics.refusedFrames += 1;
        return;
      }
      if (message.kind === 'start') {
        this.onStart(slot.peer, message.roster);
        return;
      }
      this.handlers.onMessage(message);
    };
  }

  private onStart(from: PeerId, roster: readonly PeerId[]): void {
    if (this.roster !== null) return;
    if (this.self === null || from !== this.roomHost) {
      this.diagnostics.refusedFrames += 1;
      return;
    }
    if (!roster.includes(this.self)) {
      this.diagnostics.refusedFrames += 1;
      return;
    }
    this.seal([...roster].sort());
  }
}
