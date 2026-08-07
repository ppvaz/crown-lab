
import { describe, expect, it } from 'vitest';

import type { Intent } from '../src/sim/types';
import { NEUTRAL_INTENT } from '../src/sim/types';
import { quantizeIntent } from '../src/sim/intent';
import type { NetMessage } from '../src/net/lockstep';
import { LockstepSession, inputDelayForLink } from '../src/net/lockstep';

const config = (over: Partial<ConstructorParameters<typeof LockstepSession>[0]> = {}) => ({
  peers: ['alice', 'bob'],
  localPeer: 'alice',
  inputDelay: 0,
  checkpointInterval: 120,
  ...over,
});

const intentFor = (n: number): Intent =>
  quantizeIntent({ ...NEUTRAL_INTENT, move: { x: n / 64, y: -n / 64 } });

const remoteIntent = (peer: string, tick: number, n: number): NetMessage => ({
  kind: 'intent',
  peer,
  tick,
  intent: intentFor(n),
});

describe('advancing a tick', () => {
  it('stalls until every peer has delivered, and names who is missing', () => {
    const session = new LockstepSession(config());
    expect(session.state).toBe('stalled');
    expect(session.missingPeers()).toEqual(['alice', 'bob']);

    session.submitLocal(intentFor(1));
    expect(session.state).toBe('stalled');
    expect(session.missingPeers()).toEqual(['bob']);
    expect(session.take()).toBeNull();

    session.receive(remoteIntent('bob', 0, 2));
    expect(session.state).toBe('ready');
    expect(session.missingPeers()).toEqual([]);
  });

  it('hands intents back in sorted peer order, not arrival order', () => {
    const session = new LockstepSession(config({ peers: ['zed', 'bob', 'alice'], localPeer: 'zed' }));
    session.receive(remoteIntent('bob', 0, 1));
    session.receive(remoteIntent('alice', 0, 2));
    session.submitLocal(intentFor(3));

    expect(session.take()?.map((entry) => entry.peer)).toEqual(['alice', 'bob', 'zed']);
  });

  it('advances the tick only through take', () => {
    const session = new LockstepSession(config());
    session.submitLocal(intentFor(1));
    session.receive(remoteIntent('bob', 0, 2));
    expect(session.tick).toBe(0);
    session.take();
    expect(session.tick).toBe(1);
    expect(session.state).toBe('stalled');
  });

  it('carries the intents each peer actually sent', () => {
    const session = new LockstepSession(config());
    session.submitLocal(intentFor(5));
    session.receive(remoteIntent('bob', 0, 9));
    const taken = session.take();
    expect(taken?.find((e) => e.peer === 'alice')?.intent).toEqual(intentFor(5));
    expect(taken?.find((e) => e.peer === 'bob')?.intent).toEqual(intentFor(9));
  });
});

describe('input delay', () => {
  it('schedules a local intent ahead by the configured delay', () => {
    const session = new LockstepSession(config({ inputDelay: 3 }));
    expect(session.scheduledTick).toBe(3);
    const message = session.submitLocal(intentFor(1));
    expect(message.tick).toBe(3);
    expect(session.take()?.find((e) => e.peer === 'alice')?.intent).toEqual(NEUTRAL_INTENT);
  });

  it('primes the first delay ticks so the session can start at all', () => {
    const session = new LockstepSession(config({ inputDelay: 3 }));
    expect(session.missingPeers()).toEqual([]);
    expect(session.state).toBe('ready');

    for (let tick = 0; tick < 3; tick++) {
      const taken = session.take();
      expect(taken?.map((e) => e.intent)).toEqual([NEUTRAL_INTENT, NEUTRAL_INTENT]);
    }
    expect(session.state).toBe('stalled');
  });

  it('runs continuously once real intents reach the primed pipeline', () => {
    const session = new LockstepSession(config({ inputDelay: 2 }));
    session.submitLocal(intentFor(1));
    session.receive(remoteIntent('bob', 2, 2));

    expect(session.take()).not.toBeNull();
    expect(session.take()).not.toBeNull();
    expect(session.tick).toBe(2);
    expect(session.state).toBe('ready');
    expect(session.take()?.find((e) => e.peer === 'bob')?.intent).toEqual(intentFor(2));
  });
});

describe('what an unreliable channel does', () => {
  it('treats an exact duplicate as harmless and counts it', () => {
    const session = new LockstepSession(config());
    const message = remoteIntent('bob', 0, 4);
    session.receive(message);
    session.receive(message);
    expect(session.counters.duplicates).toBe(1);
    expect(session.counters.conflicting).toBe(0);
  });

  it('keeps the first intent when a peer contradicts itself, and flags it', () => {
    const session = new LockstepSession(config());
    session.receive(remoteIntent('bob', 0, 4));
    session.receive(remoteIntent('bob', 0, 7));
    session.submitLocal(intentFor(1));

    expect(session.counters.conflicting).toBe(1);
    expect(session.take()?.find((e) => e.peer === 'bob')?.intent).toEqual(intentFor(4));
  });

  it('buffers intents that arrive out of order, for ticks not yet reached', () => {
    const session = new LockstepSession(config());
    session.receive(remoteIntent('bob', 2, 3));
    session.receive(remoteIntent('bob', 0, 1));
    session.receive(remoteIntent('bob', 1, 2));

    for (let tick = 0; tick < 3; tick++) {
      session.submitLocal(intentFor(tick));
      expect(session.take()?.find((e) => e.peer === 'bob')?.intent).toEqual(intentFor(tick + 1));
    }
  });

  it('drops an intent for a tick already stepped rather than rewriting history', () => {
    const session = new LockstepSession(config());
    session.submitLocal(intentFor(1));
    session.receive(remoteIntent('bob', 0, 2));
    session.take();

    session.receive(remoteIntent('bob', 0, 9));
    expect(session.counters.late).toBe(1);
    expect(session.tick).toBe(1);
  });

  it('refuses an off-grid intent instead of stepping a world the sender did not', () => {
    const session = new LockstepSession(config());
    session.receive({
      kind: 'intent',
      peer: 'bob',
      tick: 0,
      intent: { ...NEUTRAL_INTENT, facing: 0.123456789 },
    });
    expect(session.counters.offGrid).toBe(1);
    expect(session.missingPeers()).toContain('bob');
  });

  it('ignores a message from a peer it does not have, and keeps running', () => {
    const session = new LockstepSession(config());
    session.receive(remoteIntent('mallory', 0, 1));
    expect(session.counters.unknownPeer).toBe(1);

    session.submitLocal(intentFor(1));
    session.receive(remoteIntent('bob', 0, 2));
    expect(session.state).toBe('ready');
  });

  it('never throws on anything a peer can send', () => {
    const session = new LockstepSession(config());
    const hostile: NetMessage[] = [
      remoteIntent('mallory', 0, 1),
      remoteIntent('bob', -5, 1),
      remoteIntent('bob', 1e9, 1),
      { kind: 'intent', peer: 'bob', tick: 0, intent: { ...NEUTRAL_INTENT, facing: 0.1234567 } },
      { kind: 'checkpoint', peer: 'mallory', tick: 0, fingerprint: 1 },
      { kind: 'checkpoint', peer: 'bob', tick: 999, fingerprint: 2 },
    ];
    for (const message of hostile) expect(() => session.receive(message)).not.toThrow();
    session.submitLocal(intentFor(1));
    session.receive(remoteIntent('bob', 0, 2));
    expect(session.state).toBe('ready');
  });
});

describe('desync detection', () => {
  it('says nothing while peers agree', () => {
    const session = new LockstepSession(config({ checkpointInterval: 2 }));
    session.reportCheckpoint(2, 0xabcdef);
    session.receive({ kind: 'checkpoint', peer: 'bob', tick: 2, fingerprint: 0xabcdef });
    expect(session.state).not.toBe('desynced');
    expect(session.desyncReport).toBeNull();
  });

  it('reports the tick and both sides when they disagree', () => {
    const session = new LockstepSession(config({ checkpointInterval: 2 }));
    session.reportCheckpoint(2, 111);
    session.receive({ kind: 'checkpoint', peer: 'bob', tick: 2, fingerprint: 222 });

    expect(session.state).toBe('desynced');
    expect(session.desyncReport?.tick).toBe(2);
    expect(session.desyncReport?.byPeer.get('alice')).toBe(111);
    expect(session.desyncReport?.byPeer.get('bob')).toBe(222);
  });

  it('refuses to advance once desynced, even with every intent present', () => {
    const session = new LockstepSession(config({ checkpointInterval: 2 }));
    session.reportCheckpoint(0, 111);
    session.receive({ kind: 'checkpoint', peer: 'bob', tick: 0, fingerprint: 222 });
    session.submitLocal(intentFor(1));
    session.receive(remoteIntent('bob', 0, 2));

    expect(session.state).toBe('desynced');
    expect(session.take()).toBeNull();
  });

  it('catches a disagreement when the slow peer reports late', () => {
    const session = new LockstepSession(config({ checkpointInterval: 2 }));
    session.reportCheckpoint(4, 111);
    expect(session.state).not.toBe('desynced');
    session.receive({ kind: 'checkpoint', peer: 'bob', tick: 4, fingerprint: 999 });
    expect(session.state).toBe('desynced');
  });

  it('only reports on a checkpoint tick', () => {
    const session = new LockstepSession(config({ checkpointInterval: 120 }));
    expect(session.reportCheckpoint(7, 1)).toBeNull();
    expect(session.reportCheckpoint(120, 1)).not.toBeNull();
  });

  it('clears only through the recovery the caller performs', () => {
    const session = new LockstepSession(config({ checkpointInterval: 2 }));
    session.reportCheckpoint(0, 111);
    session.receive({ kind: 'checkpoint', peer: 'bob', tick: 0, fingerprint: 222 });
    expect(session.state).toBe('desynced');

    session.resumeAt(40);
    expect(session.desyncReport).toBeNull();
    expect(session.tick).toBe(40);
    expect(session.state).toBe('stalled');
  });
});

describe('the session refuses to be built wrong', () => {
  it('rejects a local peer that is not a participant', () => {
    expect(() => new LockstepSession(config({ localPeer: 'nobody' }))).toThrow(/not in the peer/);
  });

  it('rejects a negative input delay', () => {
    expect(() => new LockstepSession(config({ inputDelay: -1 }))).toThrow(/negative/);
  });

  it('throws on an off-grid LOCAL intent rather than quietly discarding it', () => {
    const session = new LockstepSession(config());
    expect(() => session.submitLocal({ ...NEUTRAL_INTENT, facing: 0.123456789 })).toThrow(
      /canonical grid/,
    );
    expect(() =>
      session.receive({
        kind: 'intent',
        peer: 'bob',
        tick: 0,
        intent: { ...NEUTRAL_INTENT, facing: 0.123456789 },
      }),
    ).not.toThrow();
  });
});

describe('the input-delay knob', () => {
  it('covers latency plus jitter and not a tick more', () => {
    expect(inputDelayForLink(100)).toBe(12);
    expect(inputDelayForLink(100, 50)).toBe(18);
    expect(inputDelayForLink(0)).toBe(0);
    expect(inputDelayForLink(1)).toBe(1);
  });

  it('refuses a negative measurement rather than returning a delay', () => {
    expect(() => inputDelayForLink(-1)).toThrow(/negative/);
    expect(() => inputDelayForLink(10, -1)).toThrow(/negative/);
  });

  it('is the delay a session actually accepts', () => {
    const session = new LockstepSession(config({ inputDelay: inputDelayForLink(100) }));
    expect(session.scheduledTick).toBe(12);
  });
});

describe('a long session does not grow without bound', () => {
  it('drops buffers for ticks that have been stepped', () => {
    const session = new LockstepSession(config({ checkpointInterval: 4 }));
    for (let tick = 0; tick < 400; tick++) {
      session.submitLocal(intentFor(tick % 60));
      session.receive(remoteIntent('bob', tick, tick % 60));
      expect(session.take()).not.toBeNull();
    }
    expect(session.tick).toBe(400);
    const held = JSON.parse(JSON.stringify(session, (key, value) =>
      value instanceof Map ? [...value.keys()] : value,
    ));
    const ticksHeld = JSON.stringify(held).match(/\d+/g)?.map(Number) ?? [];
    expect(Math.max(...ticksHeld.filter((n) => n < 1e6))).toBeLessThan(410);
  });
});
