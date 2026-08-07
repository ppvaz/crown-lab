
import type { Intent } from '../src/sim/types';
import { NEUTRAL_INTENT } from '../src/sim/types';
import { AIM_STEPS, MOVE_STEPS, isQuantized, quantizeIntent } from '../src/sim/intent';
import { makeRng, nextFloat, nextRange } from '../src/sim/rng';
import type { NetMessage } from '../src/net/lockstep';
import {
  CHECKPOINT_BYTES,
  INTENT_BYTES,
  encodeStart,
  decodeMessage,
  encodeMessage,
} from '../src/net/wire';

const intentMessage = (intent: Intent, tick = 7): NetMessage => ({
  kind: 'intent',
  peer: 'alice',
  tick,
  intent,
});

const busy = (): Intent =>
  quantizeIntent({
    move: { x: -0.37, y: 0.82 },
    facing: 1.9,
    lightPressed: true,
    heavyPressed: false,
    guardHeld: true,
    guardPressed: false,
    stepPressed: true,
    focusPressed: false,
    interactPressed: true,
    powerPressed: false,
    powerHeld: true,
    aimDistance: 4.25,
  });

describe('the round trip', () => {
  it('returns a quantized intent unmoved, field for field', () => {
    const sent = intentMessage(busy());
    const got = decodeMessage(encodeMessage(sent), 'alice');

    expect(got).toEqual(sent);
  });

  it('keeps every boolean on its own bit', () => {
    const flags: (keyof Intent)[] = [
      'lightPressed',
      'heavyPressed',
      'guardHeld',
      'guardPressed',
      'stepPressed',
      'focusPressed',
      'interactPressed',
      'powerPressed',
      'powerHeld',
    ];
    for (const flag of flags) {
      const intent = { ...NEUTRAL_INTENT, [flag]: true } as Intent;
      const got = decodeMessage(encodeMessage(intentMessage(intent)), 'alice');
      expect(got?.kind === 'intent' && got.intent).toEqual(intent);
    }
  });

  it('tells a null facing from a facing of zero, and a null aim from an aim of zero', () => {
    const nulls = { ...NEUTRAL_INTENT, facing: null, aimDistance: null };
    const zeros = { ...NEUTRAL_INTENT, facing: 0, aimDistance: 0 };

    expect(decodeMessage(encodeMessage(intentMessage(nulls)), 'alice')).toEqual(intentMessage(nulls, 7));
    expect(decodeMessage(encodeMessage(intentMessage(zeros)), 'alice')).toEqual(intentMessage(zeros, 7));
  });

  it('survives a sweep of quantized intents drawn from the portable PRNG', () => {
    const rng = makeRng(0xc0ffee);
    for (let i = 0; i < 4000; i++) {
      const intent = quantizeIntent({
        move: { x: nextRange(rng, -3, 3), y: nextRange(rng, -3, 3) },
        facing: nextFloat(rng) < 0.2 ? null : nextRange(rng, -Math.PI, Math.PI),
        lightPressed: nextFloat(rng) < 0.5,
        heavyPressed: nextFloat(rng) < 0.5,
        guardHeld: nextFloat(rng) < 0.5,
        guardPressed: nextFloat(rng) < 0.5,
        stepPressed: nextFloat(rng) < 0.5,
        focusPressed: nextFloat(rng) < 0.5,
        interactPressed: nextFloat(rng) < 0.5,
        powerPressed: nextFloat(rng) < 0.5,
        powerHeld: nextFloat(rng) < 0.5,
        aimDistance: nextFloat(rng) < 0.5 ? null : nextRange(rng, 0, 40),
      });
      const got = decodeMessage(encodeMessage(intentMessage(intent, i)), 'alice');
      expect(got).toEqual(intentMessage(intent, i));
    }
  });

  it('carries movement the type allows but a unit square does not', () => {
    const long = quantizeIntent({ ...NEUTRAL_INTENT, move: { x: 7.5, y: -12.25 } });
    const got = decodeMessage(encodeMessage(intentMessage(long)), 'alice');

    expect(got?.kind === 'intent' && got.intent.move).toEqual(long.move);
  });

  it('hands the session an intent it will accept as on-grid', () => {
    const rng = makeRng(11);
    for (let i = 0; i < 500; i++) {
      const intent = quantizeIntent({
        ...NEUTRAL_INTENT,
        move: { x: nextRange(rng, -1, 1), y: nextRange(rng, -1, 1) },
        facing: nextRange(rng, -Math.PI, Math.PI),
        aimDistance: nextRange(rng, 0, 8),
      });
      const got = decodeMessage(encodeMessage(intentMessage(intent)), 'alice');
      expect(got?.kind === 'intent' && isQuantized(got.intent)).toBe(true);
    }
  });

  it('round-trips a checkpoint fingerprint across the whole uint32 range', () => {
    for (const fingerprint of [0, 1, 0x7fffffff, 0x80000000, 0xffffffff]) {
      const sent: NetMessage = { kind: 'checkpoint', peer: 'bob', tick: 240, fingerprint };
      expect(decodeMessage(encodeMessage(sent), 'bob')).toEqual(sent);
    }
  });
});

describe('who sent it', () => {
  it('is stamped by the caller and is nowhere in the bytes', () => {
    const bytes = encodeMessage(intentMessage(busy()));
    const asAlice = decodeMessage(bytes, 'alice');
    const asMallory = decodeMessage(bytes, 'mallory');

    expect(asAlice?.peer).toBe('alice');
    expect(asMallory?.peer).toBe('mallory');
    expect(encodeMessage(intentMessage(busy()))).toEqual(bytes);
  });
});

describe('a hostile or broken peer', () => {
  it('is refused rather than throwing, on every malformed shape', () => {
    const valid = encodeMessage(intentMessage(busy()));

    expect(decodeMessage(new Uint8Array(0), 'a')).toBeNull();
    expect(decodeMessage(new Uint8Array([9, 9, 9]), 'a')).toBeNull();
    expect(decodeMessage(valid.slice(0, INTENT_BYTES - 1), 'a')).toBeNull();
    expect(decodeMessage(new Uint8Array(INTENT_BYTES + 1), 'a')).toBeNull();
    expect(decodeMessage(new Uint8Array(CHECKPOINT_BYTES - 1).fill(1), 'a')).toBeNull();
    const future = valid.slice();
    future[0] = 200;
    expect(decodeMessage(future, 'a')).toBeNull();
  });

  it('refuses every truncation of a valid message', () => {
    const valid = encodeMessage(intentMessage(busy()));
    for (let n = 0; n < valid.length; n++) {
      expect(decodeMessage(valid.slice(0, n), 'a')).toBeNull();
    }
    expect(decodeMessage(valid, 'a')).not.toBeNull();
  });

  it('reads a message that does not own its buffer', () => {
    const valid = encodeMessage(intentMessage(busy()));
    const padded = new Uint8Array(valid.length + 8);
    padded.set(valid, 5);
    const view = padded.subarray(5, 5 + valid.length);

    expect(decodeMessage(view, 'alice')).toEqual(intentMessage(busy()));
  });
});

describe('what it costs', () => {
  it('is 23 bytes an intent and 9 a checkpoint', () => {
    expect(encodeMessage(intentMessage(busy())).length).toBe(INTENT_BYTES);
    expect(INTENT_BYTES).toBe(23);
    expect(
      encodeMessage({ kind: 'checkpoint', peer: 'a', tick: 1, fingerprint: 2 }).length,
    ).toBe(CHECKPOINT_BYTES);
    expect(MOVE_STEPS * AIM_STEPS).toBeGreaterThan(0);
  });
});

describe('the roster seal', () => {
  const ROSTER = ['aaaaaaaaaaaa', 'cccccccccccc', 'ffffffffffff'];

  it('round-trips a roster, attributed to the channel it arrived on', () => {
    const decoded = decodeMessage(encodeStart(ROSTER), 'cccccccccccc');
    expect(decoded).toEqual({ kind: 'start', peer: 'cccccccccccc', roster: ROSTER });
  });

  it('costs two bytes and six per peer, so a four-player seal is 26', () => {
    expect(encodeStart(ROSTER).length).toBe(2 + 3 * 6);
    expect(encodeStart([...ROSTER, 'bbbbbbbbbbbb']).length).toBe(26);
  });

  it('refuses a frame whose count and length disagree', () => {
    const frame = encodeStart(ROSTER);
    expect(decodeMessage(frame.subarray(0, frame.length - 1), 'a')).toBeNull();

    const padded = new Uint8Array(frame.length + 1);
    padded.set(frame);
    expect(decodeMessage(padded, 'a')).toBeNull();
  });

  it('refuses an empty roster and a duplicated peer', () => {
    expect(decodeMessage(encodeStart([]), 'a')).toBeNull();
    expect(decodeMessage(encodeStart(['aaaaaaaaaaaa', 'aaaaaaaaaaaa']), 'a')).toBeNull();
  });

  it('is not a NetMessage, so the session never has to ignore one', () => {
    const decoded = decodeMessage(encodeStart(ROSTER), 'a');
    expect(decoded?.kind).toBe('start');
    expect(['intent', 'checkpoint']).not.toContain(decoded?.kind);
  });
});
