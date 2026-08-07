
import { afterEach, describe, expect, it } from 'vitest';

import { PALETTE } from '../src/render/palette';
import { NARRATION_ROWS, resolveLayout } from '../src/render/layout';
import { copyFor } from '../src/game/copy';
import { HERALD, createHeraldState, heraldLeave } from '../src/game/herald';
import { drawHeraldDialogue } from '../src/render/herald';
import { UI_ELEMENTS } from '../src/render/ui-elements';
import { setUiProbe, type UiRect } from '../src/render/ui-probe';

const stubCtx = () =>
  ({
    canvas: { width: 1440, height: 900 },
    font: '13px ui-monospace',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    globalAlpha: 1,
    measureText: (text: string) => ({
      width: text.length * 7.2,
      actualBoundingBoxAscent: 9,
      actualBoundingBoxDescent: 3,
    }),
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    fillText: () => {},
  }) as unknown as CanvasRenderingContext2D;

const layoutFor = (viewport: { w: number; h: number }, device: 'pointer' | 'touch' = 'pointer') =>
  resolveLayout({
    viewport,
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
    device,
    profile: 'game',
    active: { narration: true },
  });

const DESKTOP = layoutFor({ w: 1440, h: 900 });
const LANDSCAPE_PHONE = layoutFor({ w: 844, h: 390 });

const COPY = copyFor('en');
const OFFERS = [...HERALD.offers, heraldLeave(COPY.herald.leave)];

const draw = (
  selected: number,
  frame = DESKTOP,
  offers: readonly (typeof OFFERS)[number][] = OFFERS,
) => {
  const state = createHeraldState();
  state.open = true;
  state.selected = selected;

  const reports: UiRect[] = [];
  setUiProbe((rect) => reports.push(rect));
  drawHeraldDialogue(
    stubCtx(),
    { ...PALETTE },
    frame,
    state,
    offers,
    { move: 'WASD or arrow keys', interact: 'E' },
    COPY.herald,
  );
  setUiProbe(null);

  const rows = reports.filter((r) => r.id === 'herald.dialogue.text');
  return {
    reports,
    rows,
    ids: new Set(reports.map((r) => r.id)),
    text: (id: string) =>
      reports
        .filter((r) => r.id === id)
        .map((r) => r.text)
        .join(' '),
  };
};

afterEach(() => setUiProbe(null));

describe('the herald’s panel', () => {
  const panel = draw(0);

  it('produces every element this renderer declares for it', () => {
    const declared = UI_ELEMENTS.filter((e) => e.id.startsWith('herald.dialogue.')).map(
      (e) => e.id,
    );
    expect(declared.length).toBeGreaterThan(0);
    for (const id of declared) expect(panel.ids.has(id), id).toBe(true);
  });

  it('draws one row per offer, up to what the region holds', () => {
    expect(panel.rows.length).toBe(Math.min(NARRATION_ROWS, OFFERS.length));
  });

  it('reports each row separately, so none is measured for the others', () => {
    expect(new Set(panel.rows.map((r) => r.instance)).size).toBe(panel.rows.length);
  });

  it('marks the offer a press would take, and indents the rest to match', () => {
    expect(panel.rows[0].text).toBe('◆ THE FIRST BLADE');
    expect(panel.rows[1].text).toBe('◇ THE CAPTAIN OF THE GUARD');
    expect(panel.rows[2].text).toBe('◇ THE CHANCELLOR');
  });

  it('says where in the list the selection sits', () => {
    expect(panel.text('herald.dialogue.speaker')).toBe('THE HERALD  1/7');
    expect(draw(OFFERS.length - 1).text('herald.dialogue.speaker')).toBe(
      `THE HERALD  ${OFFERS.length}/${OFFERS.length}`,
    );
  });

  it('names both controls in this device’s own vocabulary', () => {
    expect(panel.text('herald.dialogue.hint')).toBe('WASD or arrow keys  choose    E  go');
  });

  it('stacks every row inside the panel it belongs to', () => {
    const box = panel.reports.find((r) => r.id === 'herald.dialogue.box')!;
    for (const row of [...panel.rows, ...panel.reports.filter((r) => r.id.endsWith('.hint'))]) {
      expect(row.y, row.text).toBeGreaterThanOrEqual(box.y);
      expect(row.y + row.h, row.text).toBeLessThanOrEqual(box.y + box.h);
    }
  });

  it('draws no panel at all when there is nothing to offer', () => {
    expect(draw(0, DESKTOP, []).reports).toHaveLength(0);
  });
});

describe('a panel with fewer rows than offers', () => {
  it('keeps the selection in the window it can show', () => {
    for (let selected = 0; selected < OFFERS.length; selected += 1) {
      const rows = draw(selected, LANDSCAPE_PHONE).rows;
      expect(rows.length, `selected ${selected}`).toBeGreaterThan(0);
      expect(rows.length, `selected ${selected}`).toBeLessThanOrEqual(OFFERS.length);
      const marked = rows.filter((r) => r.text?.startsWith('◆ '));
      expect(marked, `selected ${selected}`).toHaveLength(1);
      expect(marked[0].text, `selected ${selected}`).toContain(OFFERS[selected].label);
    }
  });

  it('still counts the whole list, so a window cannot read as a short list', () => {
    const phone = draw(1, LANDSCAPE_PHONE);
    expect(phone.text('herald.dialogue.speaker')).toBe('THE HERALD  2/7');
  });

  it('reports what it had to cut, rather than cutting quietly', () => {
    const narrow = layoutFor({ w: 360, h: 780 }, 'touch');
    const rows = draw(1, narrow).rows;
    const cut = rows.filter((r) => r.full !== undefined && r.full !== r.text);
    for (const row of cut) expect(row.text?.endsWith('…')).toBe(true);
  });
});
