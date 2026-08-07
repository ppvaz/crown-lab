
import { ROOM_ALPHABET, ROOM_CODE_LENGTH, isRoomCode } from './coop';

export { ROOM_CODE_LENGTH, isRoomCode };

const AMBIGUOUS = 'IO01';

export interface RoomEntry {
  code: string;
  hint: string;
}

export const normalizeRoomEntry = (raw: string): RoomEntry => {
  const link = /join=([^&#\s]*)/i.exec(raw);
  const typed = (link === null ? raw : link[1]).toUpperCase();
  let code = '';
  let ambiguous = false;
  for (const character of typed) {
    if (ROOM_ALPHABET.includes(character)) {
      if (code.length < ROOM_CODE_LENGTH) code += character;
      continue;
    }
    if (AMBIGUOUS.includes(character)) ambiguous = true;
  }
  if (ambiguous) return { code, hint: 'the code has no I, O, 0 or 1 — check the letter' };
  return { code, hint: '' };
};

export interface CoopControlsState {
  available: boolean;
  session: string;
  room: string;
  entry: string;
  entryOpen: boolean;
  lobby?: {
    peers: readonly string[];
    linked: readonly string[];
    capacity: number;
    isHost: boolean;
  } | null;
}

export interface CoopControlsView {
  host: { hidden: boolean };
  join: { hidden: boolean; label: string; disabled: boolean };
  code: { hidden: boolean; value: string };
  link: { hidden: boolean };
  start: { hidden: boolean; label: string; disabled: boolean };
  hint: string;
}

const NO_START = { hidden: true, label: '', disabled: true };

const startView = (
  lobby: CoopControlsState['lobby'],
): CoopControlsView['start'] => {
  if (lobby === null || lobby === undefined || !lobby.isHost) return NO_START;
  if (lobby.capacity <= 2) return NO_START;
  return {
    hidden: false,
    label: `Start with ${lobby.peers.length}`,
    disabled: lobby.peers.length < 2 || lobby.linked.length < lobby.peers.length - 1,
  };
};

const lobbyHint = (lobby: CoopControlsState['lobby']): string => {
  if (lobby === null || lobby === undefined || lobby.capacity <= 2) return '';
  const linked = lobby.linked.length + 1;
  return `${linked}/${lobby.capacity} in the room${linked < lobby.peers.length ? ' — connecting' : ''}`;
};

export const coopControlsView = (state: CoopControlsState): CoopControlsView => {
  const hidden = { hidden: true };
  if (!state.available) {
    return {
      host: hidden,
      join: { hidden: true, label: '', disabled: true },
      code: { hidden: true, value: '' },
      link: hidden,
      start: NO_START,
      hint: 'this build has no signaling service — no co-op',
    };
  }
  if (state.session !== '') {
    return {
      host: hidden,
      join: { hidden: true, label: '', disabled: true },
      code: { hidden: true, value: '' },
      link: { hidden: state.room === '' },
      start: startView(state.lobby ?? null),
      hint: lobbyHint(state.lobby ?? null),
    };
  }
  const entry = normalizeRoomEntry(state.entry);
  if (!state.entryOpen) {
    return {
      host: { hidden: false },
      join: { hidden: false, label: 'Join a room', disabled: false },
      code: { hidden: true, value: '' },
      link: hidden,
      start: NO_START,
      hint: '',
    };
  }
  return {
    host: hidden,
    join: { hidden: false, label: 'Join', disabled: !isRoomCode(entry.code) },
    code: { hidden: false, value: entry.code },
    link: hidden,
    start: NO_START,
    hint:
      entry.hint !== ''
        ? entry.hint
        : isRoomCode(entry.code)
          ? ''
          : `${entry.code.length}/${ROOM_CODE_LENGTH} — the other player's room code`,
  };
};

export interface CoopControlsElements {
  root: HTMLElement;
  host: HTMLButtonElement;
  join: HTMLButtonElement;
  code: HTMLInputElement;
  link: HTMLButtonElement;
  start: HTMLButtonElement;
  hint: HTMLElement;
}

export interface CoopControlsCallbacks {
  onHost(): void;
  onJoin(room: string): void;
  onCopyLink(): void;
  onStart(): void;
}

export class CoopControls {
  private entry = '';
  private entryOpen = false;
  private state: Omit<CoopControlsState, 'entry' | 'entryOpen'> = {
    available: false,
    session: '',
    room: '',
  };

  constructor(
    private readonly elements: CoopControlsElements,
    private readonly callbacks: CoopControlsCallbacks,
  ) {
    elements.host.addEventListener('click', () => {
      this.callbacks.onHost();
    });
    elements.join.addEventListener('click', () => {
      this.confirm();
    });
    elements.start.addEventListener('click', () => {
      callbacks.onStart();
    });
    elements.link.addEventListener('click', () => {
      this.callbacks.onCopyLink();
    });
    elements.code.addEventListener('input', () => {
      this.entry = elements.code.value;
      this.render();
    });
    elements.code.addEventListener('keydown', (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === 'Enter') this.confirm();
      if (event.key === 'Escape') {
        this.entryOpen = false;
        this.entry = '';
        this.render();
      }
    });
    this.render();
  }

  setHidden(hidden: boolean): void {
    this.elements.root.hidden = hidden;
  }

  get codeReady(): boolean {
    return isRoomCode(normalizeRoomEntry(this.entry).code);
  }

  get code(): string {
    const { code } = normalizeRoomEntry(this.entry);
    return isRoomCode(code) ? code : '';
  }

  openEntry(): void {
    this.entryOpen = true;
    this.render();
    this.elements.code.focus();
  }

  update(state: Omit<CoopControlsState, 'entry' | 'entryOpen'>): void {
    this.state = state;
    if (state.session !== '') this.entryOpen = false;
    this.render();
  }

  private confirm(): void {
    if (!this.entryOpen) {
      this.entryOpen = true;
      this.render();
      this.elements.code.focus();
      return;
    }
    const { code } = normalizeRoomEntry(this.entry);
    if (!isRoomCode(code)) return;
    this.callbacks.onJoin(code);
  }

  private render(): void {
    const view = coopControlsView({ ...this.state, entry: this.entry, entryOpen: this.entryOpen });
    this.elements.host.hidden = view.host.hidden;
    this.elements.join.hidden = view.join.hidden;
    this.elements.join.textContent = view.join.label;
    this.elements.join.disabled = view.join.disabled;
    this.elements.code.hidden = view.code.hidden;
    if (this.elements.code.value !== view.code.value) this.elements.code.value = view.code.value;
    this.elements.link.hidden = view.link.hidden;
    this.elements.start.hidden = view.start.hidden;
    this.elements.start.textContent = view.start.label;
    this.elements.start.disabled = view.start.disabled;
    this.elements.hint.textContent = view.hint;
    this.elements.hint.hidden = view.hint === '';
  }
}

export const findCoopControls = (
  root: ParentNode,
  callbacks: CoopControlsCallbacks,
): CoopControls | null => {
  const container = root.querySelector<HTMLElement>('#coop-controls');
  const host = root.querySelector<HTMLButtonElement>('#coop-host');
  const join = root.querySelector<HTMLButtonElement>('#coop-join');
  const code = root.querySelector<HTMLInputElement>('#coop-code');
  const link = root.querySelector<HTMLButtonElement>('#coop-join-link');
  const start = root.querySelector<HTMLButtonElement>('#coop-start');
  const hint = root.querySelector<HTMLElement>('#coop-hint');
  if (
    container === null ||
    host === null ||
    join === null ||
    code === null ||
    link === null ||
    start === null ||
    hint === null
  ) {
    return null;
  }
  return new CoopControls({ root: container, host, join, code, link, start, hint }, callbacks);
};
