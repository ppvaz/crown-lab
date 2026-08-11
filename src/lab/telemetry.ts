
import type { Intent, SimEvent, Tick, Vec2 } from '../sim/types';
import type { Checkpoint, IntentRun, ValueRun } from './replay';
import { encodeIntents, encodeValues } from './replay';

export interface RunMeta {
  combatId: string;
  slowMoId: string;
  encounterId: string;
  seed: number;
  attempt: number;
  startedAt: string;

  presentationId: string;
  aimMode: string;
  materialPack: string;
  modelBank: string;
  replayable: boolean;
  pilot?: string;

  build: string;
  inputDevice: string;

  participant: string;
  experimentId: string;
  conditionId: string;
  priorExposure: string;

  contentHash?: number;
}

export interface OperatorMeta {
  participant: string;
  experimentId: string;
  conditionId: string;
  priorExposure: string;
}

export const UNRECORDED = 'unrecorded';

export const operatorMetaFromSearch = (search: string): OperatorMeta => {
  const params = new URLSearchParams(search);
  const read = (key: string): string => {
    const raw = params.get(key)?.trim();
    return raw === undefined || raw === '' ? UNRECORDED : raw;
  };
  return {
    participant: read('participant'),
    experimentId: read('experiment'),
    conditionId: read('condition'),
    priorExposure: read('exposure'),
  };
};

export const runPathFromSearch = (search: string): string | null => {
  const raw = new URLSearchParams(search).get('run')?.trim();
  if (raw === undefined || raw === '') return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
  if (raw.startsWith('//')) return null;
  if (raw.split('/').includes('..')) return null;
  return raw.startsWith('/') ? raw : `/${raw}`;
};

export const runTickFromSearch = (search: string): number | null => {
  const raw = new URLSearchParams(search).get('at')?.trim();
  if (raw === undefined || raw === '') return null;
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
};

export interface RunRecord {
  version: 4;
  meta: RunMeta;
  outcome: string;
  endedAt: string | null;
  durationMs: number;
  ticks: Tick;
  events: SimEvent[];
  intents: IntentRun[];
  checkpoints: Checkpoint[];
  path: number[];
  pathLength: number;
  finalHash: number;
  conditions: {
    slowMoIntensity: ValueRun<number>[];
    presentation: ValueRun<string>[];
  };
}

export { CHECKPOINT_INTERVAL } from '../sim/fingerprint';

export const PATH_SAMPLE_INTERVAL = 12;

const round = (v: number): number => {
  const r = Math.round(v * 1000) / 1000;
  return r === 0 ? 0 : r;
};

export class Recorder {
  private meta: RunMeta | null = null;
  private events: SimEvent[] = [];
  private outcome = 'running';
  private endedAt: string | null = null;
  private durationMs = 0;
  private ticks: Tick = 0;
  private intents: Intent[] = [];
  private checkpoints: Checkpoint[] = [];
  private finalHash = 0;
  private slowMoIntensity: number[] = [];
  private presentation: string[] = [];
  private path: number[] = [];
  private pathLength = 0;
  private lastPos: Vec2 | null = null;

  begin(meta: RunMeta): void {
    this.meta = meta;
    this.events = [];
    this.outcome = 'running';
    this.endedAt = null;
    this.durationMs = 0;
    this.ticks = 0;
    this.intents = [];
    this.checkpoints = [];
    this.finalHash = 0;
    this.slowMoIntensity = [];
    this.presentation = [];
    this.path = [];
    this.pathLength = 0;
    this.lastPos = null;
  }

  record(events: readonly SimEvent[], tick: Tick): void {
    if (this.meta === null) return;
    this.ticks = tick;
    for (const e of events) {
      this.events.push({ ...e, data: e.data === undefined ? undefined : { ...e.data } });
    }
  }

  recordIntent(intent: Intent): void {
    if (this.meta === null) return;
    this.intents.push(intent);
  }

  recordConditions(slowMoIntensity: number, presentation: string): void {
    if (this.meta === null) return;
    this.slowMoIntensity.push(slowMoIntensity);
    this.presentation.push(presentation);
  }

  recordPosition(tick: Tick, pos: Vec2): void {
    if (this.meta === null) return;
    if (this.lastPos !== null) {
      const dx = pos.x - this.lastPos.x;
      const dy = pos.y - this.lastPos.y;
      this.pathLength += Math.sqrt(dx * dx + dy * dy);
    }
    this.lastPos = { x: pos.x, y: pos.y };
    if (tick % PATH_SAMPLE_INTERVAL === 0) this.path.push(round(pos.x), round(pos.y));
  }

  checkpoint(tick: Tick, hash: number): void {
    if (this.meta === null) return;
    this.checkpoints.push({ tick, hash });
  }

  end(outcome: string, durationMs: number, finalHash: number): void {
    if (this.meta === null) return;
    this.outcome = outcome;
    this.durationMs = durationMs;
    this.finalHash = finalHash;
    this.endedAt = new Date().toISOString();
  }

  get eventCount(): number {
    return this.events.length;
  }

  get intentCount(): number {
    return this.intents.length;
  }

  get eventsSoFar(): readonly SimEvent[] {
    return this.events;
  }

  get pathLengthSoFar(): number {
    return this.pathLength;
  }

  get isRecording(): boolean {
    return this.meta !== null;
  }

  get tickCount(): Tick {
    return this.ticks;
  }

  toJSON(): RunRecord | null {
    if (this.meta === null) return null;
    return {
      version: 4,
      meta: this.meta,
      outcome: this.outcome,
      endedAt: this.endedAt,
      durationMs: this.durationMs,
      ticks: this.ticks,
      events: this.events,
      intents: encodeIntents(this.intents),
      checkpoints: this.checkpoints,
      path: this.path,
      pathLength: round(this.pathLength),
      finalHash: this.finalHash,
      conditions: {
        slowMoIntensity: encodeValues(this.slowMoIntensity),
        presentation: encodeValues(this.presentation),
      },
    };
  }

  download(): void {
    const record = this.toJSON();
    if (record === null) return;
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const { encounterId, seed, attempt } = record.meta;
    a.href = url;
    a.download = `run_${encounterId}_seed${seed}_a${attempt}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}


export type ParsedRun = { ok: true; record: RunRecord } | { ok: false; reason: string };

const MAX_REPLAY_TICKS = 600_000;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isRun = (value: unknown): value is { n: number } =>
  isObject(value) && Number.isInteger(value.n) && (value.n as number) >= 1 &&
  (value.n as number) <= MAX_REPLAY_TICKS;

const intentIsUsable = (value: unknown): boolean => {
  if (!isObject(value)) return false;
  const move = value.move;
  if (!isObject(move) || !isNumber(move.x) || !isNumber(move.y)) return false;
  return value.facing === null || value.facing === undefined || isNumber(value.facing);
};

export const parseRunRecord = (text: string): ParsedRun => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not JSON' };
  }
  if (!isObject(parsed)) return { ok: false, reason: 'not a run record' };
  if (parsed.version !== 3 && parsed.version !== 4) {
    return { ok: false, reason: `unsupported version ${String(parsed.version)}` };
  }

  const meta = parsed.meta;
  if (
    !isObject(meta) ||
    typeof meta.combatId !== 'string' ||
    typeof meta.slowMoId !== 'string' ||
    typeof meta.encounterId !== 'string' ||
    !isNumber(meta.seed)
  ) {
    return { ok: false, reason: 'the record does not say what produced it' };
  }
  if (meta.replayable === false) return { ok: false, reason: 'the run used debug cheats' };
  if (meta.contentHash !== undefined && !isNumber(meta.contentHash)) {
    return { ok: false, reason: 'the record has a malformed content hash' };
  }

  const intents = parsed.intents;
  if (!Array.isArray(intents) || intents.length === 0) {
    return { ok: false, reason: 'the record has no intent stream' };
  }
  let ticks = 0;
  for (const run of intents) {
    if (!isRun(run) || !intentIsUsable((run as { i?: unknown }).i)) {
      return { ok: false, reason: 'a malformed intent' };
    }
    ticks += run.n;
    if (ticks > MAX_REPLAY_TICKS) return { ok: false, reason: 'the run is too long to replay' };
  }

  if (!isNumber(parsed.finalHash)) return { ok: false, reason: 'the record has no final hash' };
  if (
    !Array.isArray(parsed.checkpoints) ||
    parsed.checkpoints.some((c) => !isObject(c) || !isNumber(c.tick) || !isNumber(c.hash))
  ) {
    return { ok: false, reason: 'the record has malformed checkpoints' };
  }

  const intensity = (parsed.conditions as { slowMoIntensity?: unknown } | undefined)
    ?.slowMoIntensity;
  if (
    intensity !== undefined &&
    (!Array.isArray(intensity) || intensity.some((run) => !isRun(run) || !isNumber((run as { v?: unknown }).v)))
  ) {
    return { ok: false, reason: 'the record has a malformed condition stream' };
  }

  if (!Array.isArray(parsed.path)) parsed.path = [];
  if (!isNumber(parsed.pathLength)) parsed.pathLength = 0;

  return { ok: true, record: parsed as unknown as RunRecord };
};
