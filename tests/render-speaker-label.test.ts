import { vi } from 'vitest';

import { PALETTE } from '../src/render/palette';
import { drawSpeakerLabel } from '../src/render/speaker-label';
import { drawStandLabel } from '../src/render/armoury';
import { POWER_STANDS } from '../src/game/armoury';
import { drawVictory, VICTORY_FADE_MS } from '../src/render/victory';
import { makeCamera } from '../src/render/iso';
import { resolveLayout } from '../src/render/layout';

const CHAR_W = 12;

interface Text {
  text: string;
  x: number;
  y: number;
  align: string;
}

const makeRecorder = () => {
  const texts: Text[] = [];
  const target: Record<string, unknown> = {
    canvas: { width: 0, height: 0 },
    textAlign: 'left',
    measureText: (t: string) => ({ width: t.length * CHAR_W }),
    fillText: (text: string, x: number, y: number) =>
      texts.push({ text, x, y, align: String(target.textAlign) }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
  };
  const ctx = new Proxy(target, {
    get: (obj, prop: string) => (prop in obj ? obj[prop] : vi.fn()),
    set: (obj, prop: string, value) => {
      obj[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts };
};

const span = (t: Text): { left: number; right: number } => {
  const w = t.text.length * CHAR_W;
  if (t.align === 'center') return { left: t.x - w / 2, right: t.x + w / 2 };
  if (t.align === 'right' || t.align === 'end') return { left: t.x - w, right: t.x };
  return { left: t.x, right: t.x + w };
};

describe('a speaker label over a body near the wall', () => {
  it('keeps every row inside the content box, however long the line', () => {
    const viewport = { w: 390, h: 844 };
    const frame = resolveLayout({
      viewport,
      safe: { top: 0, right: 0, bottom: 0, left: 0 },
      device: 'touch',
      profile: 'game',
      active: {},
    });
    const { ctx, texts } = makeRecorder();
    const cam = makeCamera(viewport.w, viewport.h);

    drawSpeakerLabel(ctx, cam, { ...PALETTE }, frame, {
      at: { x: 9.5, y: 0 },
      name: 'MARA',
      line: 'Take me as far as the Blade and I will show you the way in.',
      prompt: 'ACT  TAKE MARA WITH YOU',
      ids: { name: 'escort.name', line: 'escort.line', prompt: 'escort.prompt' },
    });

    expect(texts.length).toBe(3);
    const box = frame.content;
    for (const t of texts) {
      const { left, right } = span(t);
      expect(left).toBeGreaterThanOrEqual(box.x - 0.5);
      expect(right).toBeLessThanOrEqual(box.x + box.w + 0.5);
    }
  });
});

describe('a power plinth label', () => {
  it('keeps its teaching line on screen at the end of the rank', () => {
    const viewport = { w: 360, h: 740 };
    const frame = resolveLayout({
      viewport,
      safe: { top: 0, right: 0, bottom: 0, left: 0 },
      device: 'touch',
      profile: 'game',
      active: {},
    });
    const { ctx, texts } = makeRecorder();
    const cam = makeCamera(viewport.w, viewport.h);

    drawStandLabel(
      ctx,
      cam,
      { ...PALETTE },
      frame,
      POWER_STANDS[0],
      false,
      'ACT',
    );

    expect(texts.length).toBeGreaterThan(0);
    const box = frame.content;
    for (const t of texts) {
      const { left, right } = span(t);
      expect(left).toBeGreaterThanOrEqual(box.x - 0.5);
      expect(right).toBeLessThanOrEqual(box.x + box.w + 0.5);
    }
  });
});

describe('the victory screen', () => {
  it('budgets its feats against the column between the thumbs in landscape', () => {
    const viewport = { w: 844, h: 390 };
    const frame = resolveLayout({
      viewport,
      safe: { top: 0, right: 47, bottom: 21, left: 47 },
      device: 'touch',
      profile: 'game',
      active: {},
    });
    const { ctx, texts } = makeRecorder();
    const cam = makeCamera(viewport.w, viewport.h);

    drawVictory(
      ctx,
      cam,
      { ...PALETTE },
      frame,
      {
        attempts: 3,
        escortAlive: true,
        feats: [
          { id: 'escort', label: 'ESCORT', note: 'Mara walked out with you' },
          { id: 'bare_handed', label: 'BARE-HANDED', note: 'The blade and nothing else' },
        ],
      },
      VICTORY_FADE_MS + 2 * 220 + 320,
    );

    const stick = frame.reserved.stick;
    const cluster = frame.reserved.cluster;
    expect(stick).not.toBeNull();
    expect(cluster).not.toBeNull();

    for (const t of texts) {
      const { left, right } = span(t);
      expect(left).toBeGreaterThanOrEqual(stick!.x + stick!.w - 0.5);
      expect(right).toBeLessThanOrEqual(cluster!.x + 0.5);
    }
  });
});
