import { describe, expect, it } from 'vitest';
import { pauseLayout, pausePlateVisible } from '../src/render/pause-screen';
import { resolveLayout } from '../src/render/layout';

const frame = (w: number, h: number) =>
  resolveLayout({
    viewport: { w, h },
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
    device: 'pointer',
    profile: 'game',
  });

describe('nothing blocks an instrumented view', () => {
  it('shows the plate for a pause the player chose', () => {
    expect(pausePlateVisible({ paused: true, instrumented: false })).toBe(true);
  });



  it('never shows it while a harness is holding the frame', () => {
    expect(pausePlateVisible({ paused: true, instrumented: true })).toBe(false);
  });

  it('shows nothing while the world is running', () => {
    expect(pausePlateVisible({ paused: false, instrumented: false })).toBe(false);
    expect(pausePlateVisible({ paused: false, instrumented: true })).toBe(false);
  });
});

describe('where QUIT is painted is where it is pressed', () => {
  it('keeps QUIT inside its panel at every viewport this ships to', () => {
    for (const [w, h] of [[360, 640], [1280, 720], [2560, 1440], [820, 1180]]) {
      const { panel, quit } = pauseLayout(frame(w, h));
      expect(quit.x, `${w}x${h}`).toBeGreaterThanOrEqual(panel.x);
      expect(quit.y, `${w}x${h}`).toBeGreaterThanOrEqual(panel.y);
      expect(quit.x + quit.w, `${w}x${h}`).toBeLessThanOrEqual(panel.x + panel.w);
      expect(quit.y + quit.h, `${w}x${h}`).toBeLessThanOrEqual(panel.y + panel.h);
    }
  });
});
