
import { describe, expect, it } from 'vitest';

import { derivePublicMangleAllowlist, publicManglePattern } from '../scripts/mangle-allowlist';

const { names } = derivePublicMangleAllowlist();
const mangleable = new Set(names);

describe('derived mangle allow-list', () => {
  it('derives a list at all, from a source tree that has plenty to derive from', () => {
    expect(names.length).toBeGreaterThan(200);
    expect(names.length).toBeLessThan(1000);
  });

  it('still mangles the private runtime vocabulary the hand-written list named', () => {
    for (const name of [
      'telegraphJitterMs',
      'enteredTick',
      'sequenceParries',
      'attackCooldownJitterMs',
      'slowMoUsedThisEncounter',
      'riposteWindupScale',
      'hitstopMs',
      'glideTarget',
    ]) {
      expect(mangleable.has(name), `${name} should be mangleable`).toBe(true);
    }
  });

  it('never renames a platform member', () => {
    for (const name of ['length', 'width', 'height', 'fillStyle', 'currentTime', 'value', 'id']) {
      expect(mangleable.has(name), `${name} is a platform member`).toBe(false);
    }
  });

  it('never renames a key of a serialized format', () => {
    for (const name of [
      'contentHash',
      'encounterHash',
      'pathLength',
      'checkpoints',
      'replayable',
      'encounterId',
      'timeLimitMs',
      'playerStart',
      'aimDistance',
      'guardPressed',
    ]) {
      expect(mangleable.has(name), `${name} crosses a serialization boundary`).toBe(false);
    }
  });

  it('never renames a key that a runtime string names', () => {
    for (const name of [
      'guard',
      'duelist',
      'archer',
      'light',
      'heavy',
      'health',
      'stamina',
      'power',
      'frozenMs',
      'turncoatMs',
    ]) {
      expect(mangleable.has(name), `${name} is reached by a runtime string`).toBe(false);
    }
  });

  it('never renames a documented SimEvent payload key', () => {
    for (const name of ['elapsedMs', 'parryable', 'arcDeg', 'worldScale', 'attackId']) {
      expect(mangleable.has(name), `${name} is a telemetry payload key`).toBe(false);
    }
  });

  it('produces an anchored pattern that matches whole names only', () => {
    const pattern = publicManglePattern();
    expect(pattern.test('telegraphJitterMs')).toBe(true);
    expect(pattern.test('xtelegraphJitterMs')).toBe(false);
    expect(pattern.test('telegraphJitterMsX')).toBe(false);
    expect(pattern.test('length')).toBe(false);
  });
});
