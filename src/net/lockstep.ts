
import type { Intent } from '../sim/types';
import { NEUTRAL_INTENT, TICK_MS } from '../sim/types';
import { isQuantized } from '../sim/intent';

export type PeerId = string;

export const inputDelayForLink = (oneWayMs: number, jitterMs = 0): number => {
  if (!(oneWayMs >= 0) || !(jitterMs >= 0)) throw new Error('latency and jitter may not be negative');
  return Math.ceil((oneWayMs + jitterMs) / TICK_MS);
};

export type NetMessage =
  | { kind: 'intent'; peer: PeerId; tick: number; intent: Intent }
  | { kind: 'checkpoint'; peer: PeerId; tick: number; fingerprint: number };

export interface LockstepConfig {
  peers: readonly PeerId[];
  localPeer: PeerId;
  inputDelay: number;
  checkpointInterval: number;
}

export type SessionState =
  | 'ready'
  | 'stalled'
  | 'desynced';

export interface Desync {
  tick: number;
  byPeer: ReadonlyMap<PeerId, number>;
}

export interface SessionDiagnostics {
  late: number;
  conflicting: number;
  offGrid: number;
  unknownPeer: number;
  duplicates: number;
}

const emptyDiagnostics = (): SessionDiagnostics => ({
  late: 0,
  conflicting: 0,
  offGrid: 0,
  unknownPeer: 0,
  duplicates: 0,
});

const sameIntent = (a: Intent, b: Intent): boolean =>
  a.move.x === b.move.x &&
  a.move.y === b.move.y &&
  a.facing === b.facing &&
  a.lightPressed === b.lightPressed &&
  a.heavyPressed === b.heavyPressed &&
  a.guardHeld === b.guardHeld &&
  a.guardPressed === b.guardPressed &&
  a.stepPressed === b.stepPressed &&
  a.focusPressed === b.focusPressed &&
  a.interactPressed === b.interactPressed &&
  a.powerPressed === b.powerPressed &&
  a.powerHeld === b.powerHeld &&
  a.aimDistance === b.aimDistance;

interface Inbox {
  intents: Map<number, Intent>;
  checkpoints: Map<number, number>;
}

export class LockstepSession {
  private currentTick = 0;

  private readonly inboxes = new Map<PeerId, Inbox>();

  private readonly order: PeerId[];

  private diagnostics = emptyDiagnostics();

  private desync: Desync | null = null;

  constructor(private readonly config: LockstepConfig) {
    if (!config.peers.includes(config.localPeer)) {
      throw new Error(`local peer ${config.localPeer} is not in the peer list`);
    }
    if (config.inputDelay < 0) throw new Error('inputDelay may not be negative');
    this.order = [...config.peers].sort();
    for (const peer of this.order) {
      this.inboxes.set(peer, { intents: new Map(), checkpoints: new Map() });
    }
    this.primeInputDelay();
  }

  private primeInputDelay(): void {
    for (let tick = 0; tick < this.config.inputDelay; tick++) {
      for (const inbox of this.inboxes.values()) inbox.intents.set(tick, NEUTRAL_INTENT);
    }
  }

  get tick(): number {
    return this.currentTick;
  }

  get peers(): readonly PeerId[] {
    return this.order;
  }

  get scheduledTick(): number {
    return this.currentTick + this.config.inputDelay;
  }

  submitLocal(intent: Intent): NetMessage {
    if (!isQuantized(intent)) {
      throw new Error('local intent is not on the canonical grid: quantize it in the input layer');
    }
    const message: NetMessage = {
      kind: 'intent',
      peer: this.config.localPeer,
      tick: this.scheduledTick,
      intent,
    };
    this.receive(message);
    return message;
  }

  receive(message: NetMessage): void {
    const inbox = this.inboxes.get(message.peer);
    if (inbox === undefined) {
      this.diagnostics.unknownPeer += 1;
      return;
    }

    if (message.kind === 'checkpoint') {
      inbox.checkpoints.set(message.tick, message.fingerprint);
      this.compareCheckpoints(message.tick);
      return;
    }

    if (message.tick < this.currentTick) {
      this.diagnostics.late += 1;
      return;
    }
    if (!isQuantized(message.intent)) {
      this.diagnostics.offGrid += 1;
      return;
    }

    const held = inbox.intents.get(message.tick);
    if (held !== undefined) {
      if (sameIntent(held, message.intent)) this.diagnostics.duplicates += 1;
      else this.diagnostics.conflicting += 1;
      return;
    }
    inbox.intents.set(message.tick, message.intent);
  }

  get state(): SessionState {
    if (this.desync !== null) return 'desynced';
    return this.missingPeers().length === 0 ? 'ready' : 'stalled';
  }

  missingPeers(): PeerId[] {
    return this.order.filter((peer) => !this.inboxes.get(peer)?.intents.has(this.currentTick));
  }

  take(): Array<{ peer: PeerId; intent: Intent }> | null {
    if (this.state !== 'ready') return null;
    const tick = this.currentTick;
    const taken = this.order.map((peer) => ({
      peer,
      intent: this.inboxes.get(peer)?.intents.get(tick) as Intent,
    }));
    this.currentTick += 1;
    this.prune();
    return taken;
  }

  reportCheckpoint(tick: number, fingerprint: number): NetMessage | null {
    if (tick % this.config.checkpointInterval !== 0) return null;
    const message: NetMessage = {
      kind: 'checkpoint',
      peer: this.config.localPeer,
      tick,
      fingerprint,
    };
    this.receive(message);
    return message;
  }

  get desyncReport(): Desync | null {
    return this.desync;
  }

  get counters(): Readonly<SessionDiagnostics> {
    return this.diagnostics;
  }

  resumeAt(tick: number): void {
    this.desync = null;
    this.currentTick = tick;
    this.prune();
  }

  private compareCheckpoints(tick: number): void {
    if (this.desync !== null) return;
    const byPeer = new Map<PeerId, number>();
    for (const peer of this.order) {
      const value = this.inboxes.get(peer)?.checkpoints.get(tick);
      if (value !== undefined) byPeer.set(peer, value);
    }
    if (byPeer.size < 2) return;
    const values = new Set(byPeer.values());
    if (values.size > 1) this.desync = { tick, byPeer };
  }

  private prune(): void {
    for (const inbox of this.inboxes.values()) {
      for (const tick of inbox.intents.keys()) {
        if (tick < this.currentTick) inbox.intents.delete(tick);
      }
      for (const tick of inbox.checkpoints.keys()) {
        if (tick < this.currentTick - this.config.checkpointInterval * 2) {
          inbox.checkpoints.delete(tick);
        }
      }
    }
  }
}
