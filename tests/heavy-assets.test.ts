import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveLayout } from '../src/render/layout';
import { heavyPromptLayout, sizeLabel, type HeavyOffer } from '../src/render/heavy-prompt';

const frame = (w: number, h: number) =>
  resolveLayout({
    viewport: { w, h },
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
    device: 'pointer',
    profile: 'game',
  });

const dataset: Record<string, string | undefined> = {};
(globalThis as unknown as { document: unknown }).document = { documentElement: { dataset } };

const freshModule = async () => {
  vi.resetModules();
  return import('../src/render/heavy-assets');
};

const withMode = async (mode: 'full' | 'saver') => {
  dataset.dataMode = mode;
  return freshModule();
};

describe('what data-saver actually refuses', () => {
  beforeEach(() => {
    delete dataset.dataMode;
  });

  it('denies every group until granted, and only in saver mode', async () => {
    const saver = await withMode('saver');
    expect(saver.heavyAllowed('music')).toBe(false);
    expect(saver.heavyAllowed('meshes')).toBe(false);
    saver.allowHeavy('music');
    expect(saver.heavyAllowed('music')).toBe(true);
    expect(saver.heavyAllowed('meshes')).toBe(false);
  });

  it('is inert for a player who did not ask for it', async () => {
    const full = await withMode('full');
    expect(full.heavyAllowed('music')).toBe(true);
    expect(full.heavyAllowed('meshes')).toBe(true);
  });

  it('treats an unstamped document as full, so a missing gate never mutes the game', async () => {
    const none = await freshModule();
    expect(none.heavyAllowed('music')).toBe(true);
  });

  it('reports a group in flight, so the press can be shown to have done something', async () => {
    const mod = await withMode('saver');
    expect(mod.heavyLoading()).toBe(false);
    mod.setHeavyLoading('meshes', true);
    expect(mod.heavyLoading()).toBe(true);
    mod.setHeavyLoading('meshes', false);
    expect(mod.heavyLoading()).toBe(false);
  });
});

describe('naming the cost', () => {
  it('reads as a phone bill does', () => {
    expect(sizeLabel(16_309_261)).toBe('16 MB');
    expect(sizeLabel(4_650_000)).toBe('4.7 MB');
    expect(sizeLabel(714_002)).toBe('714 KB');
    expect(sizeLabel(900)).toBe('1 KB');
  });

  it('keeps both answers inside the panel at every viewport this ships to', () => {
    const offers: HeavyOffer[] = [{ id: 'music', label: 'score', bytes: 16_000_000 }];
    for (const [w, h] of [[360, 640], [1280, 720], [2560, 1440], [820, 1180]]) {
      const layout = heavyPromptLayout(frame(w, h), offers);
      for (const [name, rect] of [
        ['offer', layout.offers[0].rect],
        ['confirm', layout.confirm],
        ['cancel', layout.cancel],
      ] as const) {
        expect(rect.x, `${name} ${w}x${h}`).toBeGreaterThanOrEqual(layout.panel.x);
        expect(rect.x + rect.w, `${name} ${w}x${h}`)
          .toBeLessThanOrEqual(layout.panel.x + layout.panel.w);
        expect(rect.y + rect.h, `${name} ${w}x${h}`)
          .toBeLessThanOrEqual(layout.panel.y + layout.panel.h);
      }
    }
  });

  it('never lets DOWNLOAD and NOT NOW overlap', () => {
    const offers: HeavyOffer[] = [{ id: 'music', label: 'score', bytes: 16_000_000 }];
    for (const [w, h] of [[360, 640], [1280, 720], [2560, 1440]]) {
      const { confirm, cancel } = heavyPromptLayout(frame(w, h), offers);
      expect(confirm.y + confirm.h, `${w}x${h}`).toBeLessThanOrEqual(cancel.y);
    }
  });
});
