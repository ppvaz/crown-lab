
import { describe, expect, it } from 'vitest';

import {
  drawCinematicImpactStars,
  type ApotheosisImpactKind,
} from '../src/render/apotheosis/render';
import { makeCamera } from '../src/render/iso';

type Verb = 'arc' | 'ellipse' | 'quadraticCurveTo' | 'closePath' | 'lineTo';

const paint = (kind: ApotheosisImpactKind): Record<Verb, number> => {
  const calls: Record<Verb, number> = {
    arc: 0,
    ellipse: 0,
    quadraticCurveTo: 0,
    closePath: 0,
    lineTo: 0,
  };
  const count = (verb: Verb) => (): void => {
    calls[verb] += 1;
  };
  const gradient = { addColorStop: () => {} };
  const target: Record<string | symbol, unknown> = {
    createRadialGradient: () => gradient,
    arc: count('arc'),
    ellipse: count('ellipse'),
    quadraticCurveTo: count('quadraticCurveTo'),
    closePath: count('closePath'),
    lineTo: count('lineTo'),
  };
  const ctx = new Proxy(target, {
    get: (object, property) =>
      property in object ? object[property] : () => undefined,
    set: (object, property, value) => {
      object[property] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  const cam = makeCamera(1280, 720);

  drawCinematicImpactStars(ctx, cam, [
    {
      at: { x: 0, y: 0 },
      color: '#ffd873',
      radius: 1.4,
      ageMs: 30,
      lifeMs: 260,
      kind,
      facing: Math.PI / 4,
    },
  ]);

  return calls;
};

describe('the cinematic impact vocabulary', () => {
  it('gives a perfect parry two stopped blade arcs and an ordinary hit one', () => {
    expect(paint('parry').quadraticCurveTo).toBe(2);
    expect(paint('light_hit').quadraticCurveTo).toBe(1);
    expect(paint('guard').quadraticCurveTo).toBe(0);
  });

  it('draws guard as a plane and a roar as a projected pressure ring', () => {
    expect(paint('guard').ellipse).toBeGreaterThan(0);
    expect(paint('roar').ellipse).toBeGreaterThan(0);
    expect(paint('light_hit').ellipse).toBe(0);
  });

  it('breaks damage into rim segments and stagger into filled fractures', () => {
    expect(paint('guard_break').arc).toBeGreaterThan(paint('light_hit').arc);
    expect(paint('stagger').closePath).toBeGreaterThan(paint('guard_break').closePath);
  });
});
