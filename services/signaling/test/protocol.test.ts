
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LIMITS } from '../src/config.ts';
import { parseClientMessage } from '../src/protocol.ts';
import { CANDIDATE, OFFER_SDP } from './support.ts';

const parse = (value: unknown, limits = DEFAULT_LIMITS) =>
  parseClientMessage(typeof value === 'string' ? value : JSON.stringify(value), limits);

const refuses = (value: unknown, why: string, limits = DEFAULT_LIMITS): void => {
  const result = parse(value, limits);
  assert.equal(result.ok, false, `should have refused ${why}`);
};

test('the four client messages parse', () => {
  assert.deepEqual(parse({ t: 'create' }), { ok: true, message: { t: 'create' } });
  assert.deepEqual(parse({ t: 'join', room: 'ABC234' }), {
    ok: true,
    message: { t: 'join', room: 'ABC234' },
  });

  const desc = parse({ t: 'desc', to: '0123456789ab', sdp: { type: 'answer', sdp: OFFER_SDP } });
  assert.equal(desc.ok, true);
  const cand = parse({
    t: 'cand',
    to: '0123456789ab',
    candidate: { candidate: CANDIDATE, sdpMid: '0', sdpMLineIndex: 0, usernameFragment: 'ab12' },
  });
  assert.equal(cand.ok, true);
});

test('a room code is normalized the way a person types it', () => {
  const result = parse({ t: 'join', room: '  abc234 ' });
  assert.deepEqual(result, { ok: true, message: { t: 'join', room: 'ABC234' } });
});

test('rollback carries no body, and everything else must start with a version line', () => {
  assert.equal(parse({ t: 'desc', to: '0123456789ab', sdp: { type: 'rollback', sdp: '' } }).ok, true);
  refuses({ t: 'desc', to: '0123456789ab', sdp: { type: 'rollback', sdp: OFFER_SDP } }, 'a rollback with a body');
  refuses({ t: 'desc', to: '0123456789ab', sdp: { type: 'offer', sdp: 'o=- 1 1 IN IP4 0.0.0.0' } }, 'SDP with no v=0');
  refuses({ t: 'desc', to: '0123456789ab', sdp: { type: 'gossip', sdp: OFFER_SDP } }, 'an invented description type');
  refuses(
    { t: 'desc', to: '0123456789ab', sdp: { type: 'offer', sdp: `${OFFER_SDP}a=x:\u001b[2J` } },
    'an escape sequence aimed at whatever prints the SDP',
  );
});

test('an extra field is a refusal, not something quietly ignored', () => {
  refuses({ t: 'create', payload: 'x' }, 'an extra key on create');
  refuses({ t: 'join', room: 'ABC234', payload: 'x' }, 'an extra key on join');
  refuses(
    { t: 'desc', to: '0123456789ab', sdp: { type: 'offer', sdp: OFFER_SDP, payload: 'x' } },
    'an extra key inside a description',
  );
  refuses(
    {
      t: 'cand',
      to: '0123456789ab',
      candidate: {
        candidate: CANDIDATE,
        sdpMid: null,
        sdpMLineIndex: null,
        usernameFragment: null,
        payload: 'x',
      },
    },
    'an extra key inside a candidate',
  );
});

test('the shapes that are not messages at all', () => {
  refuses('{not json', 'a broken frame');
  refuses(null, 'null');
  refuses([{ t: 'create' }], 'an array');
  refuses({}, 'no kind');
  refuses({ t: 42 }, 'a numeric kind');
  refuses({ t: 'welcome', room: 'ABC234' }, 'a server message sent back at us');
});

test('room codes and peer ids are checked against their alphabets', () => {
  refuses({ t: 'join', room: 'ABC23' }, 'a short code');
  refuses({ t: 'join', room: 'ABC2345' }, 'a long code');
  refuses({ t: 'join', room: 'ABC01O' }, 'the ambiguous characters the alphabet omits');
  refuses({ t: 'join', room: 42 }, 'a numeric code');
  refuses({ t: 'desc', to: 'ABCDEF', sdp: { type: 'offer', sdp: OFFER_SDP } }, 'a short peer id');
  refuses({ t: 'desc', to: '0123456789AB', sdp: { type: 'offer', sdp: OFFER_SDP } }, 'an uppercase peer id');
});

test('candidates are ICE candidates, of bounded length, in printable ASCII', () => {
  const candidate = (over: Record<string, unknown>) => ({
    t: 'cand',
    to: '0123456789ab',
    candidate: { candidate: CANDIDATE, sdpMid: null, sdpMLineIndex: null, usernameFragment: null, ...over },
  });

  assert.equal(parse(candidate({ candidate: '' })).ok, true, 'end-of-candidates must survive');
  refuses(candidate({ candidate: 'a=candidate:x' }), 'a candidate that is not a candidate line');
  refuses(candidate({ candidate: `candidate:${'x'.repeat(600)}` }), 'an oversized candidate');
  refuses(candidate({ candidate: 'candidate:\u0007' }), 'a control character');
  refuses(candidate({ sdpMLineIndex: 1.5 }), 'a fractional m-line index');
  refuses(candidate({ sdpMLineIndex: -1 }), 'a negative m-line index');
  refuses(candidate({ sdpMLineIndex: 10_000 }), 'an absurd m-line index');
  refuses(candidate({ sdpMid: 'm'.repeat(100) }), 'an oversized mid');
  refuses(candidate({ usernameFragment: 'u'.repeat(300) }), 'an oversized ufrag');
  refuses({ t: 'cand', to: '0123456789ab', candidate: CANDIDATE }, 'a bare string candidate');
});

test('size is checked on the raw bytes, before the parser allocates anything', () => {
  const limits = { ...DEFAULT_LIMITS, maxMessageBytes: 64 };
  const result = parseClientMessage(JSON.stringify({ t: 'join', room: 'A'.repeat(500) }), limits);
  assert.deepEqual(result, { ok: false, code: 'too_large' });

  const sdpLimits = { ...DEFAULT_LIMITS, maxSdpBytes: 32 };
  refuses({ t: 'desc', to: '0123456789ab', sdp: { type: 'offer', sdp: OFFER_SDP } }, 'an over-long SDP', sdpLimits);
});

test('multi-byte characters are measured in bytes, not in code units', () => {
  const limits = { ...DEFAULT_LIMITS, maxMessageBytes: 40 };
  const raw = JSON.stringify({ t: 'join', room: '❤'.repeat(12) });
  assert.ok(raw.length < 60);
  assert.deepEqual(parseClientMessage(raw, limits), { ok: false, code: 'too_large' });
});
