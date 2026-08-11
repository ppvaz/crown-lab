
import type { Intent, SimEvent } from '../src/sim/types';
import { NEUTRAL_INTENT } from '../src/sim/types';
import {
  PATH_SAMPLE_INTERVAL,
  Recorder,
  UNRECORDED,
  operatorMetaFromSearch,
  parseRunRecord,
  runPathFromSearch,
  runTickFromSearch,
} from '../src/lab/telemetry';
import type { RunMeta } from '../src/lab/telemetry';
import { decodeIntents, decodeValues, intentCount } from '../src/lab/replay';

const meta = (over: Partial<RunMeta> = {}): RunMeta => ({
  combatId: 'Default',
  slowMoId: 'none',
  encounterId: 'two_guards_open',
  seed: 4471,
  attempt: 1,
  startedAt: '2026-07-24T12:00:00.000Z',
  presentationId: 'full',
  aimMode: 'mouse',
  materialPack: 'forged',
  modelBank: 'default',
  build: 'a1b2c3d',
  inputDevice: 'pointer',
  replayable: true,
  participant: 'P07',
  experimentId: '04',
  conditionId: 'B1',
  priorExposure: 'none',
  ...over,
});

const intent = (over: Partial<Intent> = {}): Intent => ({
  ...NEUTRAL_INTENT,
  move: { x: 0, y: 0 },
  ...over,
});

const started = (): Recorder => {
  const r = new Recorder();
  r.begin(meta());
  return r;
};

describe('before a run has begun', () => {
  it('reports itself as not recording and exports nothing', () => {
    const r = new Recorder();

    expect(r.isRecording).toBe(false);
    expect(r.toJSON()).toBeNull();
  });

  it('discards everything offered to it', () => {
    const r = new Recorder();

    r.record([{ tick: 1, type: 'run_started' }], 1);
    r.recordIntent(intent());
    r.checkpoint(120, 999);
    r.end('cleared', 5000, 42);

    expect(r.toJSON()).toBeNull();
    expect(r.eventCount).toBe(0);
    expect(r.tickCount).toBe(0);
  });
});

describe('begin', () => {
  it('starts recording under the meta it was given', () => {
    const r = new Recorder();
    r.begin(meta({ combatId: 'FF_All', attempt: 7 }));

    expect(r.isRecording).toBe(true);
    const record = r.toJSON();
    expect(record?.meta.combatId).toBe('FF_All');
    expect(record?.meta.attempt).toBe(7);
    expect(record?.version).toBe(4);
    expect(record?.outcome).toBe('running');
    expect(record?.endedAt).toBeNull();
  });

  it('discards the previous run completely', () => {
    const r = started();
    r.record([{ tick: 1, type: 'hit_landed', data: { damage: 10 } }], 1);
    r.recordIntent(intent({ lightPressed: true }));
    r.checkpoint(120, 555);
    r.end('died', 9000, 12345);

    r.begin(meta({ attempt: 2 }));
    const record = r.toJSON();

    expect(record?.events).toEqual([]);
    expect(record?.intents).toEqual([]);
    expect(record?.checkpoints).toEqual([]);
    expect(record?.conditions.slowMoIntensity).toEqual([]);
    expect(record?.conditions.presentation).toEqual([]);
    expect(record?.path).toEqual([]);
    expect(record?.pathLength).toBe(0);
    expect(record?.outcome).toBe('running');
    expect(record?.endedAt).toBeNull();
    expect(record?.durationMs).toBe(0);
    expect(record?.ticks).toBe(0);
    expect(record?.finalHash).toBe(0);
  });
});

describe('event capture', () => {
  it('appends every event verbatim, in order', () => {
    const r = started();
    r.record([{ tick: 1, type: 'run_started', data: { seed: 4471 } }], 1);
    r.record(
      [
        { tick: 2, type: 'enemy_telegraph', actor: 3 },
        { tick: 2, type: 'attack_started', actor: 1, data: { attack: 'light' } },
      ],
      2,
    );

    const events = r.toJSON()?.events ?? [];
    expect(events.map((e) => e.type)).toEqual([
      'run_started',
      'enemy_telegraph',
      'attack_started',
    ]);
    expect(events[2]).toEqual({ tick: 2, type: 'attack_started', actor: 1, data: { attack: 'light' } });
    expect(r.eventCount).toBe(3);
  });

  it('copies events rather than holding the world\'s array', () => {
    const r = started();
    const live: SimEvent[] = [{ tick: 1, type: 'hit_landed', data: { damage: 10 } }];
    r.record(live, 1);
    live.length = 0;
    live.push({ tick: 2, type: 'hit_received', data: { damage: 4 } });
    r.record(live, 2);

    const events = r.toJSON()?.events ?? [];
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('hit_landed');
    expect(events[1].type).toBe('hit_received');
  });

  it('copies the payload too, not just the event', () => {
    const r = started();
    const payload = { damage: 10 };
    const event: SimEvent = { tick: 1, type: 'hit_landed', data: payload };
    r.record([event], 1);

    payload.damage = 999;

    expect(r.toJSON()?.events[0].data).toEqual({ damage: 10 });
  });

  it('leaves an absent payload absent rather than inventing an empty one', () => {
    const r = started();
    r.record([{ tick: 1, type: 'player_died' }], 1);

    expect(r.toJSON()?.events[0].data).toBeUndefined();
  });

  it('tracks the most recent tick it was given', () => {
    const r = started();
    r.record([], 1);
    r.record([{ tick: 240, type: 'encounter_cleared' }], 240);

    expect(r.tickCount).toBe(240);
    expect(r.toJSON()?.ticks).toBe(240);
  });
});

describe('the intent stream is the replay', () => {
  it('run-length encodes held inputs', () => {
    const r = started();
    for (let i = 0; i < 5; i++) r.recordIntent(intent());

    const intents = r.toJSON()?.intents ?? [];
    expect(intents).toHaveLength(1);
    expect(intents[0].n).toBe(5);
  });

  it('splits the encoding when any field changes', () => {
    const r = started();
    r.recordIntent(intent());
    r.recordIntent(intent({ lightPressed: true }));
    r.recordIntent(intent());

    const intents = r.toJSON()?.intents ?? [];
    expect(intents).toHaveLength(3);
    expect(intentCount(intents)).toBe(3);
  });

  it('preserves one intent per tick through a decode round-trip', () => {
    const r = started();
    const sent: Intent[] = [
      intent(),
      intent(),
      intent({ move: { x: 1, y: 0 } }),
      intent({ move: { x: 1, y: 0 }, guardHeld: true }),
      intent({ facing: 1.5 }),
    ];
    for (const i of sent) r.recordIntent(i);

    expect(decodeIntents(r.toJSON()?.intents ?? [])).toEqual(sent);
  });

  it('keeps ticks and intents in step when both are recorded per tick', () => {
    const r = started();
    for (let tick = 1; tick <= 10; tick++) {
      r.recordIntent(intent({ lightPressed: tick === 5 }));
      r.record([], tick);
    }

    expect(intentCount(r.toJSON()?.intents ?? [])).toBe(r.tickCount);
  });
});

describe('per-tick lab conditions', () => {
  it('round-trips adaptive slow-motion intensity and presentation without losing tick count', () => {
    const r = started();
    const intensity = [1, 1, 0.75, 0.75, 0.4];
    const presentation = ['Full', 'Full', 'Low', 'Low', 'Medium'];
    for (let tick = 0; tick < intensity.length; tick++) {
      r.recordConditions(intensity[tick], presentation[tick]);
    }

    const conditions = r.toJSON()?.conditions;
    expect(decodeValues(conditions?.slowMoIntensity ?? [])).toEqual(intensity);
    expect(decodeValues(conditions?.presentation ?? [])).toEqual(presentation);
  });
});

describe('checkpoints and the ending', () => {
  it('keeps checkpoints in the order they were taken', () => {
    const r = started();
    r.checkpoint(120, 111);
    r.checkpoint(240, 222);

    expect(r.toJSON()?.checkpoints).toEqual([
      { tick: 120, hash: 111 },
      { tick: 240, hash: 222 },
    ]);
  });

  it('records the outcome, duration and final hash', () => {
    const r = started();
    r.record([], 600);
    r.end('cleared', 5000, 987654);

    const record = r.toJSON();
    expect(record?.outcome).toBe('cleared');
    expect(record?.durationMs).toBe(5000);
    expect(record?.finalHash).toBe(987654);
  });

  it('stamps the end with a wall clock, which the simulation may not read', () => {
    const r = started();
    r.end('died', 3000, 1);

    const endedAt = r.toJSON()?.endedAt;
    expect(endedAt).not.toBeNull();
    expect(Number.isNaN(Date.parse(endedAt ?? ''))).toBe(false);
  });

  it('goes on recording after end, because the caller decides when a run is over', () => {
    const r = started();
    r.end('cleared', 5000, 1);
    r.record([{ tick: 601, type: 'slowmo_ended' }], 601);

    expect(r.eventCount).toBe(1);
  });
});

describe('the exported record', () => {
  it('carries every condition needed to interpret its own events', () => {
    const r = new Recorder();
    r.begin(
      meta({
        combatId: 'FF_All',
        slowMoId: 'assist',
        presentationId: 'no_hud',
        aimMode: 'auto_threat',
        materialPack: 'arcane',
        modelBank: 'blocky',
      }),
    );

    const m = r.toJSON()?.meta;
    expect(m).toEqual(
      expect.objectContaining({
        combatId: 'FF_All',
        slowMoId: 'assist',
        encounterId: 'two_guards_open',
        seed: 4471,
        presentationId: 'no_hud',
        aimMode: 'auto_threat',
        materialPack: 'arcane',
        modelBank: 'blocky',
      }),
    );
  });

  it('marks a cheated run as unreplayable', () => {
    const r = new Recorder();
    r.begin(meta({ replayable: false }));

    expect(r.toJSON()?.meta.replayable).toBe(false);
  });

  it('serializes to JSON without a custom encoder', () => {
    const r = started();
    r.record([{ tick: 1, type: 'parry_success', actor: 1, target: 3, data: { offsetMs: -8 } }], 1);
    r.recordIntent(intent({ move: { x: 0.5, y: -0.5 }, facing: 2.1 }));
    r.checkpoint(120, 777);
    r.end('cleared', 1000, 888);

    const round = JSON.parse(JSON.stringify(r.toJSON()));
    expect(round).toEqual(r.toJSON());
  });
});

describe('the operator pre-flight', () => {
  it('reads the four facts the results sheet needs to join on', () => {
    expect(
      operatorMetaFromSearch('?participant=P07&experiment=04&condition=B1&exposure=round%201'),
    ).toEqual({
      participant: 'P07',
      experimentId: '04',
      conditionId: 'B1',
      priorExposure: 'round 1',
    });
  });

  it('says so, loudly, when the pre-flight did not happen', () => {
    expect(operatorMetaFromSearch('')).toEqual({
      participant: UNRECORDED,
      experimentId: UNRECORDED,
      conditionId: UNRECORDED,
      priorExposure: UNRECORDED,
    });
  });

  it('treats a blank or whitespace value as not having been told', () => {
    const parsed = operatorMetaFromSearch('?participant=&experiment=%20%20&condition=C1');

    expect(parsed.participant).toBe(UNRECORDED);
    expect(parsed.experimentId).toBe(UNRECORDED);
    expect(parsed.conditionId).toBe('C1');
  });

  it('ignores the other parameters the lab already reads', () => {
    expect(operatorMetaFromSearch('?capture=shape-gallery&participant=P07').participant).toBe(
      'P07',
    );
  });

  it('carries all four into the exported record', () => {
    const r = new Recorder();
    r.begin(meta({ participant: 'P12', experimentId: '01', conditionId: 'A', priorExposure: 'briefed' }));
    const exported = r.toJSON()?.meta;

    expect(exported?.participant).toBe('P12');
    expect(exported?.experimentId).toBe('01');
    expect(exported?.conditionId).toBe('A');
    expect(exported?.priorExposure).toBe('briefed');
    expect(exported?.build).toBe('a1b2c3d');
    expect(exported?.inputDevice).toBe('pointer');
  });
});

describe('the route the king walked', () => {
  const zigzag = (r: Recorder, ticks: number): void => {
    for (let t = 0; t <= ticks; t++) {
      r.recordPosition(t, { x: t % 2 === 0 ? 0 : 1, y: 0 });
    }
  };

  it('measures every tick, not the line between samples', () => {
    const r = started();
    zigzag(r, PATH_SAMPLE_INTERVAL * 4);
    r.end('cleared', 1000, 0);
    const record = r.toJSON();

    expect(record?.pathLength).toBe(PATH_SAMPLE_INTERVAL * 4);
    expect(record?.path.every((v) => v === 0)).toBe(true);
  });

  it('samples the shape at the sample interval, and only there', () => {
    const r = started();
    for (let t = 0; t <= PATH_SAMPLE_INTERVAL * 2; t++) r.recordPosition(t, { x: t, y: -t });
    r.end('cleared', 1000, 0);

    expect(r.toJSON()?.path).toEqual([
      0, 0,
      PATH_SAMPLE_INTERVAL, -PATH_SAMPLE_INTERVAL,
      PATH_SAMPLE_INTERVAL * 2, -PATH_SAMPLE_INTERVAL * 2,
    ]);
  });

  it('copies the position instead of aliasing the world', () => {
    const r = started();
    const pos = { x: 0, y: 0 };
    r.recordPosition(0, pos);
    pos.x = 3;
    r.recordPosition(1, pos);
    r.end('cleared', 1000, 0);

    expect(r.toJSON()?.pathLength).toBe(3);
  });

  it('reports the distance so far while the run is still going', () => {
    const r = started();
    r.recordPosition(0, { x: 0, y: 0 });
    r.recordPosition(1, { x: 3, y: 4 });

    expect(r.pathLengthSoFar).toBe(5);
  });

  it('forgets the previous route on begin, rather than joining the two', () => {
    const r = started();
    r.recordPosition(0, { x: 0, y: 0 });
    r.recordPosition(1, { x: 100, y: 0 });
    r.begin(meta());
    r.recordPosition(0, { x: 0, y: 0 });
    r.recordPosition(1, { x: 1, y: 0 });
    r.end('cleared', 1000, 0);

    expect(r.toJSON()?.pathLength).toBe(1);
  });
});

describe('reading a recording back', () => {
  const exported = (over: Partial<RunMeta> = {}): string => {
    const r = new Recorder();
    r.begin(meta(over));
    r.recordIntent(intent({ move: { x: 0.5, y: -0.5 }, facing: 1.2 }));
    r.recordConditions(0, 'Full');
    r.checkpoint(120, 4242);
    r.end('cleared', 1000, 8888);
    return JSON.stringify(r.toJSON());
  };

  it('accepts a run this lab exported', () => {
    const parsed = parseRunRecord(exported());

    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.record.meta.encounterId).toBe('two_guards_open');
  });

  it('refuses a cheated run rather than reporting it as a divergence', () => {
    const parsed = parseRunRecord(exported({ replayable: false }));

    expect(parsed).toEqual({ ok: false, reason: 'the run used debug cheats' });
  });

  it('refuses an intent that would step the world with a non-number', () => {
    const record = JSON.parse(exported());
    record.intents[0].i.move.x = null;

    expect(parseRunRecord(JSON.stringify(record)).ok).toBe(false);
  });

  it('refuses a length no browser would finish playing back', () => {
    const record = JSON.parse(exported());
    record.intents[0].n = 50_000_000;

    expect(parseRunRecord(JSON.stringify(record)).ok).toBe(false);
  });

  it('still reads a version-3 run, which has no route in it', () => {
    const record = JSON.parse(exported());
    record.version = 3;
    delete record.path;
    delete record.pathLength;
    const parsed = parseRunRecord(JSON.stringify(record));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.record.path).toEqual([]);
      expect(parsed.record.pathLength).toBe(0);
    }
  });

  it('refuses a version it cannot read, naming the version it found', () => {
    const record = JSON.parse(exported());
    record.version = 2;

    expect(parseRunRecord(JSON.stringify(record))).toEqual({
      ok: false,
      reason: 'unsupported version 2',
    });
  });

  it('refuses something that is not a run at all', () => {
    expect(parseRunRecord('{').ok).toBe(false);
    expect(parseRunRecord('[]').ok).toBe(false);
    expect(parseRunRecord('null').ok).toBe(false);
  });
});

describe('a run named in the query string', () => {
  it('reads a relative path and anchors it to the origin', () => {
    expect(runPathFromSearch('?run=runs/pilot_x.json')).toBe('/runs/pilot_x.json');
    expect(runPathFromSearch('?run=/runs/pilot_x.json')).toBe('/runs/pilot_x.json');
  });

  it('is absent when nothing asked for a run', () => {
    expect(runPathFromSearch('')).toBeNull();
    expect(runPathFromSearch('?participant=P07')).toBeNull();
    expect(runPathFromSearch('?run=')).toBeNull();
    expect(runPathFromSearch('?run=   ')).toBeNull();
  });

  it('refuses anything that could leave this origin', () => {
    expect(runPathFromSearch('?run=https://example.com/run.json')).toBeNull();
    expect(runPathFromSearch('?run=HTTPS://example.com/run.json')).toBeNull();
    expect(runPathFromSearch('?run=file:///etc/passwd')).toBeNull();
    expect(runPathFromSearch('?run=javascript:alert(1)')).toBeNull();
    expect(runPathFromSearch('?run=//example.com/run.json')).toBeNull();
  });

  it('refuses traversal rather than repairing it', () => {
    expect(runPathFromSearch('?run=../../etc/passwd')).toBeNull();
    expect(runPathFromSearch('?run=runs/../../secret.json')).toBeNull();
  });

  it('keeps the pilot run filenames the pilot script actually writes', () => {
    expect(runPathFromSearch('?run=runs/baseline20/pilot_siege_10_steady_seed8.json')).toBe(
      '/runs/baseline20/pilot_siege_10_steady_seed8.json',
    );
  });
});

describe('a replay tick named in the query string', () => {
  it('reads a whole tick count', () => {
    expect(runTickFromSearch('?run=runs/x.json&at=0')).toBe(0);
    expect(runTickFromSearch('?run=runs/x.json&at=1840')).toBe(1840);
    expect(runTickFromSearch('?at=42 ')).toBe(42);
  });

  it('is absent when nothing asked for a tick', () => {
    expect(runTickFromSearch('')).toBeNull();
    expect(runTickFromSearch('?run=runs/x.json')).toBeNull();
    expect(runTickFromSearch('?at=')).toBeNull();
  });

  it('refuses anything that is not a tick rather than rounding it to one', () => {
    expect(runTickFromSearch('?at=-1')).toBeNull();
    expect(runTickFromSearch('?at=12.5')).toBeNull();
    expect(runTickFromSearch('?at=1e3')).toBeNull();
    expect(runTickFromSearch('?at=last')).toBeNull();
    expect(runTickFromSearch('?at=0x10')).toBeNull();
  });
});
