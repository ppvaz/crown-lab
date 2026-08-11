
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { decodedBytes, oggInfo } from '../scripts/lib/ogg.mjs';

const sample = (name: string) =>
  readFileSync(resolve(import.meta.dirname, '..', 'src/assets/audio', name));

describe('a real Vorbis sample', () => {
  it('reads the rate, channels and length off the container', () => {
    const info = oggInfo(sample('forged/parry.ogg'));
    expect(info.ok).toBe(true);
    if (!info.ok) return;
    expect(info.codec).toBe('vorbis');
    expect(info.sampleRate).toBe(44100);
    expect(info.channels).toBe(2);
    expect(info.durationSeconds).toBeCloseTo(1.48, 2);
  });

  it('does not infer length from size', () => {
    const hurt = oggInfo(sample('forged/player_hurt.ogg'));
    const step = oggInfo(sample('forged/step.ogg'));
    expect(hurt.ok && step.ok).toBe(true);
    if (!hurt.ok || !step.ok) return;
    expect(hurt.durationSeconds).toBeCloseTo(0.12, 2);
    expect(step.durationSeconds).toBeCloseTo(0.11, 2);
  });

  it('costs four bytes per sample per channel decoded', () => {
    const info = oggInfo(sample('forged/step.ogg'));
    if (!info.ok) throw new Error(info.problem);
    expect(decodedBytes(info)).toBe(
      Math.round(info.durationSeconds * info.sampleRate * info.channels * 4),
    );
  });
});

const opusPage = ({ granule, channels, inputRate }: {
  granule: number;
  channels: number;
  inputRate: number;
}) => {
  const payload = Buffer.alloc(19);
  payload.write('OpusHead', 0, 'latin1');
  payload.writeUInt8(1, 8);
  payload.writeUInt8(channels, 9);
  payload.writeUInt16LE(312, 10);
  payload.writeUInt32LE(inputRate, 12);
  const page = Buffer.alloc(28 + payload.length);
  page.write('OggS', 0, 'latin1');
  page.writeUInt8(0, 4);
  page.writeUInt8(2, 5);
  page.writeBigUInt64LE(BigInt(granule), 6);
  page.writeUInt8(1, 26);
  page.writeUInt8(payload.length, 27);
  payload.copy(page, 28);
  return page;
};

describe('an Opus stream', () => {
  it('takes its length from 48 kHz and not from the rate it declares', () => {
    const info = oggInfo(opusPage({ granule: 48000, channels: 2, inputRate: 16000 }));
    expect(info.ok).toBe(true);
    if (!info.ok) return;
    expect(info.codec).toBe('opus');
    expect(info.sampleRate).toBe(16000);
    expect(info.durationSeconds).toBeCloseTo(1, 6);
  });
});

describe('a file that is not a pack sample', () => {
  it('is refused for having no capture pattern', () => {
    const info = oggInfo(Buffer.from('ID3mp3 bytes, not ogg', 'latin1'));
    expect(info.ok).toBe(false);
    if (info.ok) return;
    expect(info.problem).toMatch(/no OggS capture/);
  });

  it('is refused for declaring no samples', () => {
    const info = oggInfo(opusPage({ granule: 0, channels: 2, inputRate: 48000 }));
    expect(info.ok).toBe(false);
    if (info.ok) return;
    expect(info.problem).toMatch(/empty/);
  });

  it('is refused for being truncated before its first packet', () => {
    const info = oggInfo(opusPage({ granule: 48000, channels: 2, inputRate: 48000 }).subarray(0, 28));
    expect(info.ok).toBe(false);
  });

  it('reports nothing rather than a plausible number when it cannot parse', () => {
    expect(decodedBytes({ ok: false, problem: 'whatever' })).toBe(0);
  });
});
