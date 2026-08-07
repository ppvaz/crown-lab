
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FORGED_SAMPLES,
  PUBLIC_AUDIO_MANIFEST,
  PUBLIC_MUSIC,
  preloadAssets,
} from '../src/render/asset-registry';
import {
  ARCANE_SAMPLES,
  FORGED_SAMPLES_LAB,
  LAB_AUDIO_MANIFEST,
  LAB_MUSIC,
} from '../src/render/asset-registry-lab';

describe('the registries', () => {
  it('point every declared asset at a file that exists', () => {
    for (const url of [...PUBLIC_AUDIO_MANIFEST, ...LAB_AUDIO_MANIFEST]) {
      expect(existsSync(fileURLToPath(url)), url).toBe(true);
    }
  });

  it('keeps slow motion out of the public build — no public encounter can slow time', () => {
    expect(FORGED_SAMPLES['slowmo.ogg']).toBeUndefined();
    expect(FORGED_SAMPLES_LAB['slowmo.ogg']).toBeDefined();
  });

  it('gives the lab every public sample plus its own', () => {
    for (const [file, url] of Object.entries(FORGED_SAMPLES)) {
      expect(FORGED_SAMPLES_LAB[file]).toBe(url);
    }
    expect(Object.keys(ARCANE_SAMPLES)).toHaveLength(14);

    expect(Object.keys(PUBLIC_MUSIC)).toHaveLength(5);
    expect(Object.keys(LAB_MUSIC)).toHaveLength(3);
    for (const file of Object.keys(PUBLIC_MUSIC)) {
      expect(LAB_MUSIC[file], `${file} is public and must not be duplicated here`).toBeUndefined();
    }
    for (const url of Object.values(PUBLIC_MUSIC)) {
      expect([...PUBLIC_AUDIO_MANIFEST, ...LAB_AUDIO_MANIFEST], url).toContain(url);
    }
  });

  it('keys samples by filename, which no mangler rewrites', () => {
    for (const key of [...Object.keys(FORGED_SAMPLES), ...Object.keys(ARCANE_SAMPLES)]) {
      expect(key).toMatch(/\.ogg$/);
    }
  });
});

describe('preloadAssets', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('counts successes and names failures instead of throwing', async () => {
    vi.stubGlobal('fetch', (url: string) =>
      url.includes('bad')
        ? Promise.resolve({ ok: false, status: 404 } as Response)
        : Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) } as unknown as Response),
    );
    const report = await preloadAssets(['a.ogg', 'bad.ogg', 'b.ogg']);
    expect(report).toEqual({ loaded: 2, total: 3, failed: ['bad.ogg'] });
  });

  it('treats a network throw the same as a bad status', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    const report = await preloadAssets(['a.ogg']);
    expect(report.loaded).toBe(0);
    expect(report.failed).toEqual(['a.ogg']);
  });

  it('reports progress as each asset settles', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) } as unknown as Response),
    );
    const seen: number[] = [];
    await preloadAssets(['a.ogg', 'b.ogg'], (r) => seen.push(r.loaded));
    expect(seen).toHaveLength(2);
    expect(seen[seen.length - 1]).toBe(2);
  });
});
