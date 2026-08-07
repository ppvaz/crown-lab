import { describe, expect, it } from 'vitest';
import { VICTORY_FADE_MS, victoryExitLayout } from '../src/render/victory';
import { resolveLayout } from '../src/render/layout';
import { hits } from '../src/render/overlay-controls';

const frame = (w: number, h: number, device: 'pointer' | 'touch' = 'pointer') =>
  resolveLayout({
    viewport: { w, h },
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
    device,
    padLive: device === 'touch',
    profile: 'game',
  });

describe('the way out of a finished route', () => {
  it('keeps both exits on screen at every viewport this ships to', () => {
    for (const [w, h] of [[360, 640], [1280, 720], [2560, 1440], [820, 1180]]) {
      const layout = frame(w, h);
      const { again, menu } = victoryExitLayout(layout);
      for (const [name, rect] of [['again', again], ['menu', menu]] as const) {
        expect(rect.w, `${name} ${w}x${h}`).toBeGreaterThan(0);
        expect(rect.x, `${name} ${w}x${h}`).toBeGreaterThanOrEqual(layout.content.x);
        expect(rect.x + rect.w, `${name} ${w}x${h}`)
          .toBeLessThanOrEqual(layout.content.x + layout.content.w);
        expect(rect.y + rect.h, `${name} ${w}x${h}`)
          .toBeLessThanOrEqual(layout.content.y + layout.content.h);
      }
    }
  });

  it('never overlaps its two controls, so a press can only mean one thing', () => {
    for (const [w, h] of [[360, 640], [1280, 720], [2560, 1440]]) {
      const { again, menu } = victoryExitLayout(frame(w, h));
      expect(again.x + again.w, `${w}x${h}`).toBeLessThanOrEqual(menu.x);
    }
  });


  it('stays out of the touch pads, where the king is still being steered', () => {
    const layout = frame(844, 390, 'touch');
    const { again, menu } = victoryExitLayout(layout);
    const { stick, cluster } = layout.reserved;
    for (const pad of [stick, cluster]) {
      if (pad === null) continue;
      for (const corner of [
        { x: pad.x, y: pad.y },
        { x: pad.x + pad.w, y: pad.y },
        { x: pad.x, y: pad.y + pad.h },
        { x: pad.x + pad.w, y: pad.y + pad.h },
      ]) {
        expect(hits(again, corner), `again vs pad ${JSON.stringify(corner)}`).toBe(false);
        expect(hits(menu, corner), `menu vs pad ${JSON.stringify(corner)}`).toBe(false);
      }
    }
  });

  it('offers nothing until the celebration and its feats have arrived', () => {
    expect(VICTORY_FADE_MS).toBeGreaterThan(0);
  });
});
