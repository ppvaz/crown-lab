
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, afterEach, vi } from 'vitest';
import { UI_ELEMENTS, UI_ELEMENT, uiElementsFor } from '../src/render/ui-elements';
import { reportUiRect, reportUiText, setUiProbe, uiProbeActive } from '../src/render/ui-probe';
import type { UiRect } from '../src/render/ui-probe';

const stubCtx = (font = '11px ui-monospace', width = 40, ascent = 8, descent = 2) =>
  ({
    font,
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    measureText: vi.fn(() => ({
      width,
      actualBoundingBoxAscent: ascent,
      actualBoundingBoxDescent: descent,
    })),
  }) as unknown as CanvasRenderingContext2D;

afterEach(() => setUiProbe(null));

describe('the declared inventory', () => {
  it('has no duplicate ids', () => {
    const ids = UI_ELEMENTS.map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every element at least one profile to be audited in', () => {
    for (const element of UI_ELEMENTS) {
      expect(element.profiles.length, element.id).toBeGreaterThan(0);
    }
  });

  it('splits by profile without losing anything', () => {
    const game = new Set(uiElementsFor('game').map((element) => element.id));
    const lab = new Set(uiElementsFor('lab').map((element) => element.id));
    for (const element of UI_ELEMENTS) {
      expect(game.has(element.id) || lab.has(element.id), element.id).toBe(true);
    }
  });

  it('indexes every element by id', () => {
    expect(UI_ELEMENT.size).toBe(UI_ELEMENTS.length);
  });

  it('holds only real text to the reading threshold', () => {
    for (const element of UI_ELEMENT.values()) {
      if (element.reading !== true) continue;
      expect(element.kind, element.id).toBe('text');
    }
  });
});

describe('the probe when nobody installed it', () => {
  it('is inactive and reports nothing', () => {
    expect(uiProbeActive()).toBe(false);
    const ctx = stubCtx();
    reportUiRect('hud.health.bar', 1, 2, 3, 4);
    reportUiText(ctx, 'hud.retry.text', 'R to retry', 10, 20);
    expect(ctx.measureText).not.toHaveBeenCalled();
  });
});

describe('reported geometry', () => {
  const collect = (): UiRect[] => {
    const rects: UiRect[] = [];
    setUiProbe((rect) => rects.push(rect));
    return rects;
  };

  it('passes a known rectangle through unchanged', () => {
    const rects = collect();
    reportUiRect('hud.health.bar', 24, 700, 260, 10);
    expect(rects[0]).toMatchObject({ id: 'hud.health.bar', x: 24, y: 700, w: 260, h: 10 });
  });

  it('keeps the instance key that separates repeats of one element', () => {
    const rects = collect();
    reportUiRect('world.enemy.health', 10, 10, 34, 3, '7');
    expect(rects[0].instance).toBe('7');
  });

  it('resolves a left-aligned alphabetic box from the baseline origin', () => {
    const rects = collect();
    reportUiText(stubCtx('11px ui-monospace', 40, 8, 2), 'hud.streak.text', 'parry streak 3', 24, 100);
    expect(rects[0]).toMatchObject({ x: 24, y: 92, w: 40, h: 10, fontPx: 11 });
  });

  it('shifts a centred box back by half its width', () => {
    const ctx = stubCtx('20px ui-monospace', 100, 14, 4);
    ctx.textAlign = 'center';
    const rects = collect();
    reportUiText(ctx, 'hud.outcome.text', 'DEAD', 400, 200);
    expect(rects[0].x).toBe(350);
    expect(rects[0].y).toBe(186);
  });

  it('shifts a right-aligned box back by its full width', () => {
    const ctx = stubCtx('12px ui-monospace', 120, 9, 3);
    ctx.textAlign = 'right';
    const rects = collect();
    reportUiText(ctx, 'route.objective.text', 'THE GUARDROOM — locked, clear it', 800, 47);
    expect(rects[0].x).toBe(680);
    expect(rects[0].w).toBe(120);
  });

  it('anchors a top baseline at the origin instead of above it', () => {
    const ctx = stubCtx('12px ui-monospace', 60, 9, 3);
    ctx.textBaseline = 'top';
    const rects = collect();
    reportUiText(ctx, 'route.objective.text', 'THE FIRST CROWN', 100, 28);
    expect(rects[0].y).toBe(28);
  });

  it('falls back to the font size when the context reports no ink box', () => {
    const ctx = {
      font: 'bold 17px ui-monospace',
      textAlign: 'center' as CanvasTextAlign,
      textBaseline: 'alphabetic' as CanvasTextBaseline,
      measureText: () => ({ width: 10 }),
    } as unknown as CanvasRenderingContext2D;
    const rects = collect();
    reportUiText(ctx, 'world.npc.name', '!', 50, 50);
    expect(rects[0].fontPx).toBe(17);
    expect(rects[0].h).toBeCloseTo(17 * 0.72, 5);
  });

  it('stops reporting once the probe is removed', () => {
    const rects = collect();
    reportUiRect('hud.health.bar', 0, 0, 1, 1);
    setUiProbe(null);
    reportUiRect('hud.stamina.bar', 0, 0, 1, 1);
    expect(rects).toHaveLength(1);
  });
});

describe('the inventory describes the page it inventories', () => {
  it('counts the lab command buttons the page actually has', () => {
    const source = readFileSync(join(process.cwd(), 'src/render/ui-elements.ts'), 'utf8');
    const claim = /one of the (\d+) lab command buttons/.exec(source);
    expect(claim, 'the `dom.lab.action` description no longer states a count').not.toBeNull();

    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    const buttons = html.match(/class="lab-action"/g) ?? [];
    expect(buttons.length).toBeGreaterThan(0);
    expect(Number(claim![1])).toBe(buttons.length);
  });
});
