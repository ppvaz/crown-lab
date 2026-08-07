import type { RngState } from '../src/sim/types';
import { cloneRng, makeRng, nextFloat, nextInt, nextRange } from '../src/sim/rng';

const draw = (rng: RngState, n: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(nextFloat(rng));
  return out;
};

describe('determinism', () => {
  it('reproduces the same sequence from the same seed', () => {
    expect(draw(makeRng(12345), 200)).toEqual(draw(makeRng(12345), 200));
  });

  it('produces different sequences from different seeds', () => {
    expect(draw(makeRng(1), 50)).not.toEqual(draw(makeRng(2), 50));
  });

  it('reproduces a mixed call sequence, since draw ORDER is the contract', () => {
    const script = (rng: RngState): number[] => [
      nextFloat(rng),
      nextInt(rng, 0, 3),
      nextRange(rng, -5, 5),
      nextInt(rng, 10, 12),
      nextFloat(rng),
    ];
    expect(script(makeRng(777))).toEqual(script(makeRng(777)));
  });

  it('keeps the seed pristine so a run can be re-seeded from its own record', () => {
    const rng = makeRng(4242);
    draw(rng, 1000);

    expect(rng.seed).toBe(4242);
    expect(rng.value).not.toBe(4242);
    expect(draw(makeRng(rng.seed), 10)).toEqual(draw(makeRng(4242), 10));
  });

  it('resumes identically after a JSON round trip', () => {
    const live = makeRng(9001);
    draw(live, 17);
    const revived: RngState = JSON.parse(JSON.stringify(live));

    expect(revived).toEqual(live);
    expect(draw(revived, 50)).toEqual(draw(live, 50));
  });

  it('keeps state a serializable uint32, never a drifting double', () => {
    const rng = makeRng(0);
    for (let i = 0; i < 5000; i++) {
      nextFloat(rng);
      expect(Number.isInteger(rng.value)).toBe(true);
      expect(rng.value).toBeGreaterThanOrEqual(0);
      expect(rng.value).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('mutates the state object in place', () => {
    const rng = makeRng(5);
    const before = rng.value;
    const first = nextFloat(rng);
    expect(rng.value).not.toBe(before);
    expect(nextFloat(makeRng(5))).toBe(first);
  });
});

describe('seed edge cases', () => {
  it('accepts seed 0 without collapsing', () => {
    const values = draw(makeRng(0), 20);
    expect(new Set(values).size).toBe(20);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('normalizes seeds outside uint32 range deterministically', () => {
    expect(draw(makeRng(-1), 10)).toEqual(draw(makeRng(-1), 10));
    expect(draw(makeRng(2 ** 32 + 7), 10)).toEqual(draw(makeRng(2 ** 32 + 7), 10));
  });
});

describe('nextFloat range', () => {
  it('stays inside [0, 1) across a long run', () => {
    const rng = makeRng(31337);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 50000; i++) {
      const v = nextFloat(rng);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThan(1);
  });
});

describe('cloneRng', () => {
  it('starts as an exact copy', () => {
    const source = makeRng(88);
    draw(source, 5);
    const copy = cloneRng(source);

    expect(copy).toEqual(source);
    expect(copy).not.toBe(source);
    expect(draw(copy, 20)).toEqual(draw(cloneRng(source), 20));
  });

  it('diverges independently: drawing from the clone leaves the source untouched', () => {
    const source = makeRng(2024);
    const expected = draw(makeRng(2024), 10);

    const copy = cloneRng(source);
    draw(copy, 100);

    expect(draw(source, 10)).toEqual(expected);
    expect(copy.value).not.toBe(source.value);
  });

  it('does not share state back: advancing the source leaves the clone untouched', () => {
    const source = makeRng(11);
    const copy = cloneRng(source);
    draw(source, 40);

    expect(draw(copy, 10)).toEqual(draw(makeRng(11), 10));
  });

  it('carries the original seed, so a branch remembers where the run came from', () => {
    const source = makeRng(613);
    draw(source, 3);
    expect(cloneRng(source).seed).toBe(613);
  });

  it('clones of clones stay independent', () => {
    const a = makeRng(4);
    const b = cloneRng(a);
    const c = cloneRng(b);

    draw(b, 7);
    expect(draw(c, 5)).toEqual(draw(a, 5));
  });
});

describe('nextInt', () => {
  it('never returns hiExclusive and never falls below lo', () => {
    const rng = makeRng(6);
    let outOfRange = 0;
    let nonInteger = 0;
    for (let i = 0; i < 50000; i++) {
      const v = nextInt(rng, 0, 4);
      if (v < 0 || v >= 4) outOfRange++;
      if (!Number.isInteger(v)) nonInteger++;
    }
    expect(outOfRange).toBe(0);
    expect(nonInteger).toBe(0);
  });

  it('collapses a single-value range to that value', () => {
    const rng = makeRng(99);
    for (let i = 0; i < 1000; i++) expect(nextInt(rng, 5, 6)).toBe(5);
  });

  it('reaches every value in the range', () => {
    const rng = makeRng(17);
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 6000; i++) counts[nextInt(rng, 0, 6)] += 1;
    for (const c of counts) expect(c).toBeGreaterThan(700);
  });

  it('handles a range spanning negatives', () => {
    const rng = makeRng(1234);
    const seen = new Set<number>();
    let outOfRange = 0;
    for (let i = 0; i < 5000; i++) {
      const v = nextInt(rng, -3, 2);
      if (v < -3 || v >= 2) outOfRange++;
      seen.add(v);
    }
    expect(outOfRange).toBe(0);
    expect(seen.size).toBe(5);
  });

  it('consumes exactly one draw', () => {
    const a = makeRng(70);
    const b = makeRng(70);
    nextInt(a, 0, 10);
    nextFloat(b);
    expect(a.value).toBe(b.value);
  });
});

describe('nextRange', () => {
  it('stays inside [lo, hi)', () => {
    const rng = makeRng(555);
    let outOfRange = 0;
    for (let i = 0; i < 20000; i++) {
      const v = nextRange(rng, -2.5, 7.5);
      if (v < -2.5 || v >= 7.5) outOfRange++;
    }
    expect(outOfRange).toBe(0);
  });

  it('collapses an empty range to its bound', () => {
    const rng = makeRng(8);
    expect(nextRange(rng, 2, 2)).toBe(2);
  });

  it('consumes exactly one draw', () => {
    const a = makeRng(70);
    const b = makeRng(70);
    nextRange(a, 100, 200);
    nextFloat(b);
    expect(a.value).toBe(b.value);
  });

  it('is the shape a telegraph jitter needs: bounded, seeded, repeatable', () => {
    const jitter = (seed: number): number[] => {
      const rng = makeRng(seed);
      return [0, 1, 2, 3].map(() => nextRange(rng, 0, 120));
    };
    expect(jitter(3)).toEqual(jitter(3));
    expect(jitter(3).every((v) => v >= 0 && v < 120)).toBe(true);
  });
});
