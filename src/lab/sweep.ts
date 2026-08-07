
export type SweepCompositing = 'none' | 'plain' | 'nofilter' | 'nocomposite';

export interface SweepProbe {
  readonly label: string;
  readonly apotheosis: string;
  readonly compositing: SweepCompositing;
  readonly room?: { readonly msaa: boolean; readonly scale: number };
}

export interface SweepStep extends SweepProbe {
  readonly index: number;
  readonly control: boolean;
}

export interface PeriodSummary {
  n: number;
  min: number;
  median: number;
  p95: number;
  mean: number;
}

export interface SweepStepResult extends SweepStep {
  startedAtMs: number;
  periods: PeriodSummary | null;
}

export interface SweepReport {
  startedAt: string;
  userAgent: string;
  devicePixelRatio: number;
  viewport: { width: number; height: number };
  liveRoom?: boolean;
  settleMs: number;
  sampleMs: number;
  steps: SweepStepResult[];
  refreshPeriodMs: number | null;
  controlDriftMs: number | null;
}

export const SWEEP_CONTROL: SweepProbe = {
  label: 'control',
  apotheosis: 'full',
  compositing: 'none',
};

export const ROOM_SWEEP_CONTROL: SweepProbe = {
  label: 'control',
  apotheosis: 'off',
  compositing: 'none',
};

export const sweepSchedule = (
  probes: readonly SweepProbe[],
  reps: number,
): SweepStep[] => {
  const steps: SweepStep[] = [];
  const control =
    probes.length > 0 && probes.every((probe) => probe.room !== undefined)
      ? ROOM_SWEEP_CONTROL
      : SWEEP_CONTROL;
  const push = (probe: SweepProbe, isControl: boolean): void => {
    steps.push({ ...probe, index: steps.length, control: isControl });
  };
  for (let rep = 0; rep < Math.max(1, reps); rep += 1) {
    push(control, true);
    for (let offset = 0; offset < probes.length; offset += 1) {
      push(probes[(offset + rep) % probes.length], false);
      push(control, true);
    }
  }
  return steps;
};

export const ROOM_SWEEP_SCALES = [1, 0.75, 0.5] as const;

export const roomProbeFromName = (name: string): NonNullable<SweepProbe['room']> | null => {
  const match = /^room(-msaa)?(?:-scale-(\d+))?$/.exec(name);
  if (match === null || (match[1] === undefined && match[2] === undefined)) return null;
  const scale = match[2] === undefined ? 1 : Number(match[2]) / 100;
  if (!(ROOM_SWEEP_SCALES as readonly number[]).includes(scale)) return null;
  return { msaa: match[1] === undefined, scale };
};

export const sweepProbesFromSearch = (search: string): SweepProbe[] | null => {
  const raw = new URLSearchParams(search).get('sweep')?.trim().toLowerCase();
  if (raw === undefined || raw === '' || raw === '0' || raw === 'off') return null;
  const names = raw === '1' || raw === 'on' ? ['plain', 'nofilter', 'nocomposite'] : raw.split(',');
  const probes: SweepProbe[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed === '') continue;
    if (trimmed === 'plain' || trimmed === 'nofilter' || trimmed === 'nocomposite') {
      probes.push({ label: trimmed, apotheosis: 'full', compositing: trimmed });
      continue;
    }
    if (trimmed.startsWith('room')) {
      const room = roomProbeFromName(trimmed);
      if (room !== null) probes.push({ label: trimmed, apotheosis: 'off', compositing: 'none', room });
      continue;
    }
    probes.push({ label: trimmed, apotheosis: trimmed, compositing: 'none' });
  }
  if (probes.some((probe) => probe.room !== undefined) && !probes.every((probe) => probe.room !== undefined)) {
    console.warn('[sweep] room arms dropped: they cannot share a run with tier or compositing probes');
    return probes.filter((probe) => probe.room === undefined);
  }
  return probes.length > 0 ? probes : null;
};

export const summarizePeriods = (periods: readonly number[]): PeriodSummary | null => {
  if (periods.length === 0) return null;
  const sorted = [...periods].sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  return {
    n: sorted.length,
    min: sorted[0],
    median: at(0.5),
    p95: at(0.95),
    mean: sorted.reduce((total, value) => total + value, 0) / sorted.length,
  };
};

export interface SweepDeps {
  readonly probes: readonly SweepProbe[];
  readonly reps: number;
  readonly settleMs: number;
  readonly sampleMs: number;
  readonly apply: (step: SweepStep) => void;
  readonly report: (report: SweepReport) => void;
  readonly now: () => string;
  readonly environment: () => Pick<
    SweepReport,
    'userAgent' | 'devicePixelRatio' | 'viewport' | 'liveRoom'
  >;
}

export interface Sweep {
  tick: (periodMs: number) => boolean;
  status: () => string;
}

export const createSweep = (deps: SweepDeps): Sweep => {
  const steps = sweepSchedule(deps.probes, deps.reps);
  const results: SweepStepResult[] = [];
  const startedAt = deps.now();
  let index = -1;
  let elapsed = 0;
  let periods: number[] = [];
  let finished = false;

  const begin = (): void => {
    index += 1;
    elapsed = 0;
    periods = [];
    if (index < steps.length) deps.apply(steps[index]);
  };

  const finish = (): void => {
    finished = true;
    const controls = results
      .filter((result) => result.control && result.periods !== null)
      .map((result) => (result.periods as PeriodSummary).median);

    const everyMin = results
      .map((result) => result.periods?.min)
      .filter((value): value is number => value !== undefined)
      .sort((a, b) => a - b);
    deps.report({
      startedAt,
      ...deps.environment(),
      settleMs: deps.settleMs,
      sampleMs: deps.sampleMs,
      steps: results,
      refreshPeriodMs: everyMin.length > 0 ? everyMin[Math.floor(everyMin.length / 2)] : null,
      controlDriftMs:
        controls.length > 1 ? Math.max(...controls) - Math.min(...controls) : null,
    });
  };

  begin();

  return {
    tick: (periodMs: number): boolean => {
      if (finished) return false;
      elapsed += periodMs;
      if (elapsed <= deps.settleMs) return true;
      periods.push(periodMs);
      if (elapsed < deps.settleMs + deps.sampleMs) return true;

      results.push({
        ...steps[index],
        startedAtMs: Math.round(elapsed),
        periods: summarizePeriods(periods),
      });
      begin();
      if (index >= steps.length) {
        finish();
        return false;
      }
      return true;
    },
    status: (): string =>
      finished
        ? `sweep done · ${results.length} steps`
        : `sweep ${index + 1}/${steps.length} · ${steps[index]?.label ?? ''}`,
  };
};
