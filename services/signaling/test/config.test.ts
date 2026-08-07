
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clientAddress,
  configFromEnv,
  describeConfig,
  isAllowedOrigin,
  DEFAULT_LIMITS,
} from '../src/config.ts';

test('the default deployment is STUN-less, TURN-less and open to any origin', () => {
  const config = configFromEnv({});
  assert.equal(config.port, 8787);
  assert.deepEqual(config.stunUrls, []);
  assert.equal(config.turn, null);
  assert.deepEqual(config.allowedOrigins, []);
  assert.equal(config.trustProxy, false);
  assert.deepEqual(config.limits, DEFAULT_LIMITS);
});

test('TURN is all or nothing', () => {
  assert.throws(() => configFromEnv({ CROWN_TURN_SECRET: 'x' }), /must be set together/);
  assert.throws(() => configFromEnv({ CROWN_TURN_URLS: 'turn:example.org' }), /must be set together/);

  const config = configFromEnv({
    CROWN_TURN_SECRET: 'x',
    CROWN_TURN_URLS: 'turn:example.org:3478, turns:example.org:5349',
    CROWN_TURN_TTL_SECONDS: '60',
  });
  assert.deepEqual(config.turn?.urls, ['turn:example.org:3478', 'turns:example.org:5349']);
  assert.equal(config.turn?.ttlSeconds, 60);
});

test('a nonsensical number is a refusal to start, not a NaN ceiling', () => {
  assert.throws(() => configFromEnv({ PORT: 'eight thousand' }), /positive integer/);
  assert.throws(() => configFromEnv({ CROWN_SIGNALING_MAX_ROOMS: '0' }), /positive integer/);
  assert.throws(() => configFromEnv({ CROWN_SIGNALING_ROOM_TTL_MS: '-1' }), /positive integer/);
});

test('the startup line names no secret and no hostname', () => {
  const config = configFromEnv({
    CROWN_TURN_SECRET: 'super-secret-value',
    CROWN_TURN_URLS: 'turn:turn.internal.example.org:3478',
  });
  const line = describeConfig(config);
  assert.ok(!line.includes('super-secret-value'));
  assert.ok(!line.includes('turn.internal.example.org'));
  assert.match(line, /turn=enabled/);
});

test('an origin allowlist admits exactly what it lists', () => {
  assert.equal(isAllowedOrigin('https://anything', []), true, 'no allowlist means local development');
  assert.equal(isAllowedOrigin(undefined, []), true);
  assert.equal(isAllowedOrigin('https://lab.example', ['https://lab.example']), true);
  assert.equal(isAllowedOrigin('https://evil.example', ['https://lab.example']), false);
  assert.equal(isAllowedOrigin(undefined, ['https://lab.example']), false);
});

test('the forwarded-for header is read only where a proxy was declared', () => {
  assert.equal(clientAddress('203.0.113.9', '10.0.0.1', false), '10.0.0.1');
  assert.equal(clientAddress('203.0.113.9, 10.0.0.2', '10.0.0.1', true), '203.0.113.9');
  assert.equal(clientAddress(undefined, '10.0.0.1', true), '10.0.0.1');
  assert.equal(clientAddress(undefined, undefined, false), 'unknown');
  assert.equal(clientAddress('x'.repeat(10_000), '10.0.0.1', true).length, 256);
});

test('the seat ceiling may be lowered from the environment, and never raised', () => {
  assert.equal(configFromEnv({}).limits.maxPeersPerRoom, 4);
  assert.equal(configFromEnv({ CROWN_SIGNALING_MAX_PEERS: '2' }).limits.maxPeersPerRoom, 2);
  assert.equal(configFromEnv({ CROWN_SIGNALING_MAX_PEERS: '8' }).limits.maxPeersPerRoom, 4);
  assert.equal(configFromEnv({ CROWN_SIGNALING_MAX_PEERS: '9999' }).limits.maxPeersPerRoom, 4);
});
