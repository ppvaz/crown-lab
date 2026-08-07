
import { shade, withAlpha } from '../src/render/palette';

describe('withAlpha', () => {
  it('expands a hex colour into rgba', () => {
    expect(withAlpha('#c8963c', 0.5)).toBe('rgba(200, 150, 60, 0.5)');
    expect(withAlpha('#000000', 0)).toBe('rgba(0, 0, 0, 0)');
  });
});

describe('shade', () => {
  it('returns the colour unchanged at 1', () => {
    expect(shade('#c8963c', 1)).toBe('#c8963c');
  });

  it('darkens proportionally below 1', () => {
    expect(shade('#c8963c', 0.5)).toBe('#644b1e');
    expect(shade('#ffffff', 0)).toBe('#000000');
  });

  it('lightens toward the headroom left, not by scaling past 255', () => {
    expect(shade('#c04000', 1.5)).toBe('#e0a080');
    expect(shade('#c04000', 1.25)).toBe('#d07040');
  });

  it('clamps at both ends', () => {
    expect(shade('#ffffff', 4)).toBe('#ffffff');
    expect(shade('#000000', -1)).toBe('#000000');
    expect(shade('#c04000', 2)).toBe('#ffffff');
  });

  const darkenOnly = (hex: string, amount: number): string => {
    const v = Number.parseInt(hex.slice(1), 16);
    const ch = (shift: number): number =>
      Math.max(0, Math.min(255, Math.round(((v >> shift) & 255) * amount)));
    return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
  };
  const SAMPLES = ['#c8963c', '#c04000', '#ffffff', '#000000', '#3c5a8c'] as const;

  it('agrees with a darken-only implementation across the whole mesh lighting range', () => {
    for (let step = 0; step <= 100; step++) {
      const lit = 0.55 + 0.45 * (step / 100);
      for (const hex of SAMPLES) {
        expect(shade(hex, lit), `${hex} at ${lit}`).toBe(darkenOnly(hex, lit));
      }
    }
  });

  it('agrees at a one-ulp overshoot, where the lightening branch does open', () => {
    const lit = 0.55 + 0.45 * 1.0000000000000002;
    expect(lit, 'the overshoot this test exists for must survive the arithmetic').toBeGreaterThan(1);
    for (const hex of SAMPLES) {
      expect(shade(hex, lit), `${hex} at ${lit}`).toBe(darkenOnly(hex, lit));
    }
  });
});
