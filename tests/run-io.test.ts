
import { Recorder } from '../src/lab/telemetry';
import type { RunMeta, RunRecord } from '../src/lab/telemetry';
import { createRunLoader } from '../src/app/run-io-lab';
import { NEUTRAL_INTENT } from '../src/sim/types';

const meta = (over: Partial<RunMeta> = {}): RunMeta => ({
  combatId: 'Default',
  slowMoId: 'none',
  encounterId: 'two_guards_open',
  seed: 7,
  attempt: 1,
  startedAt: '2026-08-11T00:00:00.000Z',
  presentationId: 'Full',
  aimMode: 'facing',
  materialPack: 'none',
  modelBank: 'lab',
  build: 'test',
  inputDevice: 'keyboard',
  participant: 'unrecorded',
  experimentId: 'unrecorded',
  conditionId: 'unrecorded',
  priorExposure: 'unrecorded',
  replayable: true,
  ...over,
});

const exported = (over: Partial<RunMeta> = {}): string => {
  const recorder = new Recorder();
  recorder.begin(meta(over));
  recorder.recordIntent(NEUTRAL_INTENT);
  recorder.end('cleared', 1000, 4242);
  return JSON.stringify(recorder.toJSON());
};

const stubDocument = (): void => {
  const element = {
    type: '',
    accept: '',
    multiple: false,
    style: {},
    files: null,
    value: '',
    addEventListener: () => {},
    click: () => {},
  };
  (globalThis as { document?: unknown }).document = {
    createElement: () => element,
    body: { appendChild: () => {} },
  };
};

const loaderOver = (body: string, replays = true) => {
  const calls: string[] = [];
  let adopted: RunRecord | null = null;
  (globalThis as { fetch?: unknown }).fetch = () =>
    Promise.resolve({ ok: true, text: () => Promise.resolve(body) });
  const loader = createRunLoader({
    notice: (text) => calls.push(`notice:${text.split(':')[0]}`),
    adoptRecord: (record) => {
      adopted = record;
      calls.push('adopt');
    },
    startReplay: () => calls.push('startReplay'),
    seekReplay: (tick) => calls.push(`seek:${tick}`),
    replaying: () => replays && adopted !== null,
    replayStatus: () => 'run not replayable — cheats or a mid-run transition',
  });
  return { loader, calls };
};

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('opening a run at a tick', () => {
  beforeEach(stubDocument);

  it('seeks to the tick the link named', async () => {
    const { loader, calls } = loaderOver(exported());

    loader.openRunFromSearch('?run=runs/pilot_x.json&at=1840');
    await settle();

    expect(calls).toContain('adopt');
    expect(calls).toContain('startReplay');
    expect(calls).toContain('seek:1840');
    expect(calls.indexOf('startReplay')).toBeLessThan(calls.indexOf('seek:1840'));
  });

  it('leaves the replay at its start when no tick was named', async () => {
    const { loader, calls } = loaderOver(exported());

    loader.openRunFromSearch('?run=runs/pilot_x.json');
    await settle();

    expect(calls).toContain('startReplay');
    expect(calls.some((call) => call.startsWith('seek:'))).toBe(false);
  });

  it('does not seek when the record was refused', async () => {
    const { loader, calls } = loaderOver(exported({ replayable: false }));

    loader.openRunFromSearch('?run=runs/pilot_x.json&at=1840');
    await settle();

    expect(calls).not.toContain('adopt');
    expect(calls.some((call) => call.startsWith('seek:'))).toBe(false);
  });

  it('does not seek when the record opened but the replay would not start', async () => {
    const { loader, calls } = loaderOver(exported(), false);

    loader.openRunFromSearch('?run=runs/pilot_x.json&at=1840');
    await settle();

    expect(calls).toContain('adopt');
    expect(calls.some((call) => call.startsWith('seek:'))).toBe(false);
  });

  it('ignores a tick that is not a whole count rather than standing on tick 0', async () => {
    const { loader, calls } = loaderOver(exported());

    loader.openRunFromSearch('?run=runs/pilot_x.json&at=-12');
    await settle();

    expect(calls.some((call) => call.startsWith('seek:'))).toBe(false);
  });
});
