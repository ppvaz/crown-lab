
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { TurnConfig } from '../src/config.ts';
import { iceServersFor, mintTurnCredentials } from '../src/turn.ts';
import { makeHub, welcomeIn, send } from './support.ts';

const SECRET = 'test-secret-not-a-real-one';
const turn: TurnConfig = {
  secret: SECRET,
  urls: ['turn:turn.example.org:3478?transport=udp'],
  ttlSeconds: 300,
};

test('a credential is the coturn REST derivation, and it expires', () => {
  const nowMs = 1_700_000_000_000;
  const minted = mintTurnCredentials(turn, '0123456789ab', nowMs);

  assert.equal(minted.expiresAt, Math.floor(nowMs / 1000) + 300);
  assert.equal(minted.username, `${minted.expiresAt}:0123456789ab`);
  assert.equal(
    minted.credential,
    createHmac('sha1', SECRET).update(minted.username).digest('base64'),
  );

  const later = mintTurnCredentials(turn, '0123456789ab', nowMs + 60_000);
  assert.notEqual(later.username, minted.username);
  assert.notEqual(later.credential, minted.credential);
});

test('each peer gets its own credential', () => {
  const nowMs = 1_700_000_000_000;
  const one = mintTurnCredentials(turn, 'aaaaaaaaaaaa', nowMs);
  const other = mintTurnCredentials(turn, 'bbbbbbbbbbbb', nowMs);
  assert.notEqual(one.credential, other.credential);
});

test('a different secret produces a different credential', () => {
  const nowMs = 1_700_000_000_000;
  const mine = mintTurnCredentials(turn, 'aaaaaaaaaaaa', nowMs);
  const theirs = mintTurnCredentials({ ...turn, secret: 'someone else' }, 'aaaaaaaaaaaa', nowMs);
  assert.notEqual(mine.credential, theirs.credential);
});

test('STUN alone is offered when TURN is not configured', () => {
  assert.deepEqual(iceServersFor(['stun:stun.example.org:3478'], null, 'aaaaaaaaaaaa', 0), [
    { urls: ['stun:stun.example.org:3478'] },
  ]);
  assert.deepEqual(iceServersFor([], null, 'aaaaaaaaaaaa', 0), [], 'no ICE servers is a valid deploy');
});

test('the shared secret never reaches a peer', () => {
  const hub = makeHub({}, { stunUrls: ['stun:stun.example.org:3478'], turn });
  hub.open('conn-a', '198.51.100.7', 0);
  const out = send(hub, 'conn-a', { t: 'create' }, 1_700_000_000_000);
  const welcome = welcomeIn(out, 'conn-a');

  const wire = JSON.stringify(out);
  assert.ok(!wire.includes(SECRET), 'the secret must not appear in anything the service sends');
  assert.equal(welcome.ice.length, 2);
  const relay = welcome.ice[1];
  assert.ok(relay !== undefined);
  assert.equal(relay.username?.endsWith(`:${welcome.self}`), true);
  assert.ok((relay.credential ?? '').length > 0);
});
