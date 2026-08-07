
import {
  CoopSession,
  browserDeps,
  coopStatusLines,
} from './coop';
import type { CoopOptions } from './coop';
import { CHECKPOINT_INTERVAL } from '../lab/telemetry';

export interface LabCoopHost {
  signalingUrl: string;
  onPanel(): void;
  onPlaying(): void;
}

export class LabCoop {
  session: CoopSession | null = null;
  room = '';
  state = '';

  constructor(private readonly host: LabCoopHost) {}

  get playing(): boolean {
    return this.session?.playing === true;
  }

  statusLines(): string[] {
    return coopStatusLines({
      room: this.room,
      state: this.state,
      ice: this.session === null ? '' : this.session.iceState,
      desync: this.session?.desync ?? null,
    });
  }

  start(wanted: CoopOptions['intent']): void {

    if (this.playing) return;
    if (this.session !== null) {
      this.session.close();
      this.session = null;
      this.room = '';
      this.state = '';
    }
    if (this.host.signalingUrl === '') {
      this.state = 'no origin to ask for a handshake — serve this build over http';
      this.host.onPanel();
      return;
    }
    this.state = 'connecting';
    this.session = new CoopSession({
      intent: wanted,
      size: wanted.kind === 'host' ? wanted.size : undefined,
      inputDelay: 12,
      checkpointInterval: CHECKPOINT_INTERVAL,
      deps: browserDeps(this.host.signalingUrl),
      onLobby: () => this.host.onPanel(),
      onRoom: (room) => {
        this.room = room;
        this.host.onPanel();
      },
      onStateChange: (state) => {
        this.state = state;
        this.host.onPanel();
        if (state !== 'playing') return;
        this.host.onPlaying();
        this.state = 'playing — a rota atravessa o fio';
      },
    });
  }
}
