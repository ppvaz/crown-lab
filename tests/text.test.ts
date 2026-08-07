
import { describe, expect, it } from 'vitest';
import { drawFittedText, drawWrappedText, fitText, wrapText } from '../src/render/text';
import { setUiProbe, type UiRect } from '../src/render/ui-probe';

const makeCtx = () => {
  const drawn: string[] = [];
  const ctx = {
    font: '18px monospace',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    measureText: (t: string) => ({ width: [...t].length * 10 }),
    fillText: (t: string) => drawn.push(t),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, drawn };
};

const capture = (run: (ctx: CanvasRenderingContext2D) => void): UiRect[] => {
  const seen: UiRect[] = [];
  setUiProbe((rect) => seen.push(rect));
  try {
    run(makeCtx().ctx);
  } finally {
    setUiProbe(null);
  }
  return seen;
};

describe('fitText', () => {
  it('leaves a string that already fits completely alone', () => {
    const { ctx } = makeCtx();
    expect(fitText(ctx, 'GUARD', 200)).toBe('GUARD');
  });

  it('trims until it fits and marks the cut', () => {
    const { ctx } = makeCtx();
    const out = fitText(ctx, 'Guard one attack — hold GUARD while facing', 200);
    expect(out.endsWith('…')).toBe(true);
    expect(ctx.measureText(out).width).toBeLessThanOrEqual(200);
  });

  it('stops at the floor rather than looping forever on an impossible box', () => {
    const { ctx } = makeCtx();
    expect(fitText(ctx, 'Aparo perfeito', 5).length).toBeGreaterThan(0);
  });
});

describe('wrapText', () => {
  const LESSON = 'Tutorial 6/9 (2/3) — Defenda um ataque — segure Shift ou L de frente para o atacante';

  it('keeps the whole lesson when two rows are enough', () => {
    const { ctx } = makeCtx();
    const { lines, overflowed } = wrapText(ctx, LESSON, 450, 2);
    expect(overflowed).toBeUndefined();
    expect(lines.join(' ')).toBe(LESSON);
    expect(lines.length).toBe(2);
  });

  it('breaks on a space, so no row starts or ends mid-word', () => {
    const { ctx } = makeCtx();
    const { lines } = wrapText(ctx, LESSON, 450, 2);
    for (const line of lines) expect(line.startsWith(' ')).toBe(false);
    expect(LESSON.startsWith(lines[0])).toBe(true);
    expect(LESSON.endsWith(lines[lines.length - 1])).toBe(true);
  });

  it('preserves the double space that separates a control name from its verb', () => {
    const { ctx } = makeCtx();
    const prompt = 'ACT  ENTRAR PASSAGEM EM COTOVELO';
    const { lines, overflowed } = wrapText(ctx, prompt, 220, 2);
    expect(overflowed).toBeUndefined();
    expect(lines.join(' ')).toBe(prompt);
    expect(lines[0]).toContain('ACT  ENTRAR');
  });

  it('still trims, and says so, when even the rows it has are not enough', () => {
    const { ctx } = makeCtx();
    const { lines, overflowed } = wrapText(ctx, LESSON, 150, 2);
    expect(overflowed).toBeDefined();
    expect(lines.length).toBe(2);
    expect(lines[1].endsWith('…')).toBe(true);
  });

  it('leaves a word wider than the row to the trim rather than splitting it', () => {
    const { ctx } = makeCtx();
    const { lines } = wrapText(ctx, 'INCOMPREENSIBILIDADE', 80, 2);
    expect(lines.length).toBe(1);
    expect(lines[0].endsWith('…')).toBe(true);
  });
});

describe('drawFittedText tells the probe what the trim cost', () => {
  it('reports no `full` when the whole string was drawn', () => {
    const [rect] = capture((ctx) => {
      drawFittedText(ctx, 'hud.tutorial.text', 'Aim — the mouse', 400, 0, 0);
    });
    expect(rect.text).toBe('Aim — the mouse');
    expect(rect.full).toBeUndefined();
  });

  it('reports the untrimmed string when it had to cut', () => {
    const lesson = 'Tutorial 6/9 — Guard one attack — hold GUARD while facing the attacker';
    const [rect] = capture((ctx) => {
      drawFittedText(ctx, 'hud.tutorial.text', lesson, 200, 0, 0);
    });
    expect(rect.full).toBe(lesson);
    expect(rect.text).not.toBe(lesson);
    expect((rect.text as string).length).toBeLessThan(lesson.length);
  });

  it('returns the string it actually drew, so a caller can measure what it placed', () => {
    const { ctx, drawn } = makeCtx();
    setUiProbe(() => undefined);
    try {
      const out = drawFittedText(ctx, 'hud.tutorial.text', 'Step through danger', 100, 0, 0);
      expect(drawn).toEqual([out]);
    } finally {
      setUiProbe(null);
    }
  });
});

describe('drawWrappedText reports the block, not just its last row', () => {
  const BLOCK = 'Guard one attack hold GUARD while facing';

  it('reports one entry per row, under distinct instances', () => {
    const seen = capture((ctx) => {
      drawWrappedText(ctx, 'hud.tutorial.text', BLOCK, 150, 2, 0, (i) => i * 30);
    });
    expect(seen.length).toBe(2);
    expect(new Set(seen.map((r) => r.instance)).size).toBe(2);
  });

  it('places the rows at the leading the caller was given', () => {
    const seen = capture((ctx) => {
      drawWrappedText(ctx, 'hud.tutorial.text', BLOCK, 150, 2, 0, (i) => i * 30);
    });
    expect(seen[1].y - seen[0].y).toBe(30);
  });

  it('puts `full` on the last row only, and only when something was lost', () => {
    const roomy = capture((ctx) => {
      drawWrappedText(ctx, 'hud.tutorial.text', BLOCK, 250, 2, 0, (i) => i * 30);
    });
    expect(roomy.every((r) => r.full === undefined)).toBe(true);

    const tight = capture((ctx) => {
      drawWrappedText(ctx, 'hud.tutorial.text', BLOCK, 90, 2, 0, (i) => i * 30);
    });
    expect(tight[0].full).toBeUndefined();
    const lastFull = tight[tight.length - 1].full as string;
    expect(BLOCK.endsWith(lastFull)).toBe(true);
    expect(lastFull.length).toBeLessThan(BLOCK.length);
  });
});
