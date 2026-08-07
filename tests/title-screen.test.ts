import { describe, expect, it } from 'vitest';
import { crossThresholdAtBoot, titleLayout } from '../src/render/title-screen';
import { resolveLayout } from '../src/render/layout';

const frame = (w: number, h: number) =>
  resolveLayout({
    viewport: { w, h },
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
    device: 'pointer',
    profile: 'game',
  });

describe('crossing the threshold from the address bar', () => {
  it('is off unless the URL explicitly asks', () => {
    expect(crossThresholdAtBoot('')).toBe(false);
    expect(crossThresholdAtBoot('?join=ABCD')).toBe(false);
    expect(crossThresholdAtBoot('?playy')).toBe(false);
    expect(crossThresholdAtBoot('?play=off')).toBe(false);
    expect(crossThresholdAtBoot('?play=later')).toBe(false);
  });

  it('accepts the spellings a hand-typed URL actually gets', () => {
    for (const search of ['?play', '?play=1', '?play=on', '?play=true', '?play=TRUE']) {
      expect(crossThresholdAtBoot(search)).toBe(true);
    }
  });



  it('answers to the exact spelling the production smoke navigates with', () => {
    expect(crossThresholdAtBoot('?play')).toBe(true);
  });
});

describe('where PLAY is painted is where it is pressed', () => {
  it('keeps PLAY inside its panel at every viewport this ships to', () => {
    for (const [w, h] of [[360, 640], [1280, 720], [2560, 1440], [820, 1180]]) {
      const { panel, play } = titleLayout(frame(w, h));
      expect(play.x, `${w}x${h}`).toBeGreaterThanOrEqual(panel.x);
      expect(play.y, `${w}x${h}`).toBeGreaterThanOrEqual(panel.y);
      expect(play.x + play.w, `${w}x${h}`).toBeLessThanOrEqual(panel.x + panel.w);
      expect(play.y + play.h, `${w}x${h}`).toBeLessThanOrEqual(panel.y + panel.h);
    }
  });

  it('keeps the panel on screen', () => {
    for (const [w, h] of [[360, 640], [1280, 720], [2560, 1440]]) {
      const { content } = frame(w, h);
      const { panel } = titleLayout(frame(w, h));
      expect(panel.x, `${w}x${h}`).toBeGreaterThanOrEqual(content.x);
      expect(panel.x + panel.w, `${w}x${h}`).toBeLessThanOrEqual(content.x + content.w);
    }
  });
});
