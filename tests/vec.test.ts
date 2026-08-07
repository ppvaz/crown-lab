import type { Vec2 } from '../src/sim/types';
import {
  add,
  angleDelta,
  angleOf,
  clamp,
  dist,
  distSq,
  dot,
  fromAngle,
  len,
  lenSq,
  lerp,
  norm,
  rotate,
  scale,
  sub,
} from '../src/sim/vec';

const TAU = Math.PI * 2;
const PI = Math.PI;

const sweepAngles = (): number[] => {
  const out: number[] = [];
  for (let k = -40; k <= 40; k++) out.push(k * 0.37);
  out.push(PI, -PI, TAU, -TAU, 0, PI - 1e-9, -PI + 1e-9);
  return out;
};

describe('purity', () => {
  it('never writes through its arguments', () => {
    const a = Object.freeze({ x: 3, y: -4 }) as Vec2;
    const b = Object.freeze({ x: -1, y: 2 }) as Vec2;
    const min = Object.freeze({ x: -1, y: -1 }) as Vec2;
    const max = Object.freeze({ x: 1, y: 1 }) as Vec2;

    expect(() => {
      add(a, b);
      sub(a, b);
      scale(a, 2);
      norm(a);
      rotate(a, 0.3);
      lerp(a, b, 0.25);
      clamp(a, min, max);
    }).not.toThrow();

    expect(a).toEqual({ x: 3, y: -4 });
    expect(b).toEqual({ x: -1, y: 2 });
  });

  it('returns a fresh object even when the result equals an input', () => {
    const a: Vec2 = { x: 2, y: 5 };
    const b: Vec2 = { x: 9, y: 9 };

    expect(lerp(a, b, 0)).not.toBe(a);
    expect(lerp(a, b, 1)).not.toBe(b);
    expect(scale(a, 1)).not.toBe(a);
    expect(add(a, { x: 0, y: 0 })).not.toBe(a);
    expect(rotate(a, 0)).not.toBe(a);
    expect(clamp(a, { x: -100, y: -100 }, { x: 100, y: 100 })).not.toBe(a);
    expect(norm({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('norm', () => {
  it('maps the zero vector to zero, not NaN', () => {
    const z = norm({ x: 0, y: 0 });
    expect(z).toEqual({ x: 0, y: 0 });
    expect(Number.isNaN(z.x)).toBe(false);
    expect(Number.isNaN(z.y)).toBe(false);
  });

  it('maps a negative zero vector to zero', () => {
    expect(norm({ x: -0, y: -0 })).toEqual({ x: 0, y: 0 });
  });

  it('stays finite when the squared length underflows to zero', () => {
    const n = norm({ x: 1e-200, y: 0 });
    expect(Number.isFinite(n.x)).toBe(true);
    expect(Number.isFinite(n.y)).toBe(true);
  });

  it('preserves direction and produces unit length', () => {
    expect(norm({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
    expect(norm({ x: -3, y: -4 })).toEqual({ x: -0.6, y: -0.8 });
    expect(len(norm({ x: -0.001, y: 7 }))).toBeCloseTo(1, 12);
    expect(len(norm({ x: 1234, y: -9 }))).toBeCloseTo(1, 12);
  });

  it('leaves an already-unit vector alone', () => {
    const u = norm({ x: 1, y: 0 });
    expect(u).toEqual({ x: 1, y: 0 });
  });
});

describe('angleDelta', () => {
  it('is zero for identical angles', () => {
    expect(angleDelta(0, 0)).toBe(0);
    expect(angleDelta(2.5, 2.5)).toBe(0);
    expect(angleDelta(-PI, -PI)).toBe(0);
  });

  it('is signed from a towards b, counter-clockwise positive', () => {
    expect(angleDelta(0, 0.5)).toBeCloseTo(0.5, 12);
    expect(angleDelta(0.5, 0)).toBeCloseTo(-0.5, 12);
  });

  it('takes the short way across the +PI seam', () => {
    expect(angleDelta(PI - 0.1, -PI + 0.1)).toBeCloseTo(0.2, 12);
  });

  it('takes the short way across the -PI seam', () => {
    expect(angleDelta(-PI + 0.1, PI - 0.1)).toBeCloseTo(-0.2, 12);
  });

  it('resolves an exactly antipodal pair to +PI, never -PI', () => {
    expect(angleDelta(0, PI)).toBe(PI);
    expect(angleDelta(0, -PI)).toBe(PI);
    expect(angleDelta(PI, 0)).toBe(PI);
    expect(angleDelta(-PI, 0)).toBe(PI);
  });

  it('ignores whole turns in unnormalized inputs', () => {
    expect(angleDelta(0, TAU * 3 + 0.5)).toBeCloseTo(0.5, 9);
    expect(angleDelta(-TAU * 2 - 0.25, 0)).toBeCloseTo(0.25, 9);
    expect(angleDelta(TAU * 5, TAU * 9)).toBeCloseTo(0, 9);
  });

  it('always lands in (-PI, PI]', () => {
    for (const a of sweepAngles()) {
      for (const b of sweepAngles()) {
        const d = angleDelta(a, b);
        expect(d).toBeGreaterThan(-PI);
        expect(d).toBeLessThanOrEqual(PI);
      }
    }
  });

  it('rotating a by the delta lands on b', () => {
    for (const a of sweepAngles()) {
      for (const b of sweepAngles()) {
        const landed = fromAngle(a + angleDelta(a, b));
        const target = fromAngle(b);
        expect(landed.x).toBeCloseTo(target.x, 10);
        expect(landed.y).toBeCloseTo(target.y, 10);
      }
    }
  });

  it('is antisymmetric except for antipodal pairs', () => {
    for (const a of sweepAngles()) {
      for (const b of sweepAngles()) {
        const d = angleDelta(a, b);
        if (Math.abs(Math.abs(d) - PI) < 1e-9) continue;
        expect(angleDelta(b, a)).toBeCloseTo(-d, 10);
      }
    }
  });

  it('drives turn-rate limiting across the seam without a long way round', () => {
    const target = -PI + 0.05;
    let facing = PI - 0.05;
    const maxStep = 0.02;
    let previous = Math.abs(angleDelta(facing, target));

    for (let i = 0; i < 10; i++) {
      const d = angleDelta(facing, target);
      facing += Math.sign(d) * Math.min(Math.abs(d), maxStep);
      const remaining = Math.abs(angleDelta(facing, target));
      expect(remaining).toBeLessThanOrEqual(previous + 1e-12);
      previous = remaining;
    }

    expect(Math.abs(angleDelta(facing, target))).toBeLessThan(1e-9);
  });
});

describe('angleOf and fromAngle', () => {
  it('round-trips every angle in (-PI, PI]', () => {
    for (const a of sweepAngles()) {
      const wrapped = angleDelta(0, a);
      expect(angleOf(fromAngle(wrapped))).toBeCloseTo(wrapped, 10);
    }
  });

  it('treats the zero vector as angle 0', () => {
    expect(angleOf({ x: 0, y: 0 })).toBe(0);
  });

  it('defaults to unit length and scales on request', () => {
    expect(len(fromAngle(1.234))).toBeCloseTo(1, 12);
    expect(len(fromAngle(1.234, 5))).toBeCloseTo(5, 12);
    expect(fromAngle(0, 3).x).toBeCloseTo(3, 12);
  });
});

describe('rotate', () => {
  it('turns counter-clockwise', () => {
    const r = rotate({ x: 1, y: 0 }, PI / 2);
    expect(r.x).toBeCloseTo(0, 12);
    expect(r.y).toBeCloseTo(1, 12);
  });

  it('preserves length', () => {
    const v: Vec2 = { x: -2, y: 7 };
    for (const a of sweepAngles()) {
      expect(len(rotate(v, a))).toBeCloseTo(len(v), 10);
    }
  });

  it('is the identity for a full turn and for zero', () => {
    const v: Vec2 = { x: 3, y: -1.5 };
    expect(rotate(v, 0)).toEqual(v);
    const full = rotate(v, TAU);
    expect(full.x).toBeCloseTo(v.x, 10);
    expect(full.y).toBeCloseTo(v.y, 10);
  });

  it('leaves the zero vector at zero', () => {
    const r = rotate({ x: 0, y: 0 }, 1.1);
    expect(r.x).toBeCloseTo(0, 15);
    expect(r.y).toBeCloseTo(0, 15);
  });
});

describe('clamp', () => {
  const min: Vec2 = { x: -10, y: -7 };
  const max: Vec2 = { x: 10, y: 7 };

  it('leaves an interior point untouched', () => {
    expect(clamp({ x: 1, y: 2 }, min, max)).toEqual({ x: 1, y: 2 });
  });

  it('clamps each component independently', () => {
    expect(clamp({ x: 99, y: 0 }, min, max)).toEqual({ x: 10, y: 0 });
    expect(clamp({ x: 0, y: -99 }, min, max)).toEqual({ x: 0, y: -7 });
    expect(clamp({ x: -99, y: 99 }, min, max)).toEqual({ x: -10, y: 7 });
  });

  it('keeps a point exactly on the bound', () => {
    expect(clamp({ x: 10, y: -7 }, min, max)).toEqual({ x: 10, y: -7 });
  });

  it('collapses to the bound when min equals max', () => {
    expect(clamp({ x: 5, y: 5 }, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual({ x: 1, y: 1 });
  });
});

describe('lerp', () => {
  const a: Vec2 = { x: 0, y: 10 };
  const b: Vec2 = { x: 4, y: -10 };

  it('hits the endpoints exactly', () => {
    expect(lerp(a, b, 0)).toEqual(a);
    expect(lerp(a, b, 1)).toEqual(b);
  });

  it('finds the midpoint', () => {
    expect(lerp(a, b, 0.5)).toEqual({ x: 2, y: 0 });
  });

  it('extrapolates outside 0..1 rather than clamping', () => {
    expect(lerp(a, b, 2)).toEqual({ x: 8, y: -30 });
    expect(lerp(a, b, -1)).toEqual({ x: -4, y: 30 });
  });
});

describe('lengths, distances and dot', () => {
  it('agrees with its squared form', () => {
    const v: Vec2 = { x: 3, y: 4 };
    expect(len(v)).toBe(5);
    expect(lenSq(v)).toBe(25);
    expect(lenSq(v)).toBeCloseTo(len(v) ** 2, 10);
  });

  it('measures distance symmetrically and zero to itself', () => {
    const a: Vec2 = { x: -2, y: 6 };
    const b: Vec2 = { x: 1, y: 2 };
    expect(dist(a, b)).toBe(5);
    expect(dist(b, a)).toBe(5);
    expect(dist(a, a)).toBe(0);
    expect(distSq(a, b)).toBe(25);
    expect(distSq(a, a)).toBe(0);
  });

  it('dots to zero for perpendicular vectors', () => {
    expect(dot({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(0);
    expect(dot({ x: 2, y: 3 }, { x: -3, y: 2 })).toBe(0);
  });

  it('dots a vector with itself to its squared length', () => {
    const v: Vec2 = { x: -1.5, y: 0.25 };
    expect(dot(v, v)).toBe(lenSq(v));
  });

  it('signs the dot product by which side of the arc a target is on', () => {
    const facing = fromAngle(0);
    expect(dot(facing, norm({ x: 1, y: 0.2 }))).toBeGreaterThan(0);
    expect(dot(facing, norm({ x: -1, y: 0.2 }))).toBeLessThan(0);
  });
});

describe('add, sub and scale', () => {
  it('adds and subtracts componentwise', () => {
    expect(add({ x: 1, y: 2 }, { x: -4, y: 0.5 })).toEqual({ x: -3, y: 2.5 });
    expect(sub({ x: 1, y: 2 }, { x: -4, y: 0.5 })).toEqual({ x: 5, y: 1.5 });
  });

  it('scales by zero and by a negative factor', () => {
    const zeroed = scale({ x: 3, y: -4 }, 0);
    expect(zeroed.x === 0 && zeroed.y === 0).toBe(true);
    expect(scale({ x: 3, y: -4 }, -2)).toEqual({ x: -6, y: 8 });
  });
});
