
import { describe, expect, it } from 'vitest';

import { deriveShadowLayer } from '../scripts/lib/light-layers.mjs';

const W = 8;
const H = 4;

const flat = (
  colour: [number, number, number],
  covers: (x: number, y: number) => boolean = () => true,
) => ({
  width: W,
  height: H,
  channels: 4,
  at: (x: number, y: number): [number, number, number] => (covers(x, y) ? colour : [0, 0, 0]),
  alphaAt: (x: number, y: number) => (covers(x, y) ? 255 : 0),
});

const factorAt = (layer: { rgba: Uint8Array }, x: number, y: number) => {
  const i = (y * W + x) * 4;
  return [layer.rgba[i], layer.rgba[i + 1], layer.rgba[i + 2], layer.rgba[i + 3]];
};

describe('the derived shadow layer', () => {
  it('is the ratio that reconstructs the shadowed render', () => {
    const derived = deriveShadowLayer(flat([50, 50, 50]), [flat([200, 200, 200])]);
    expect(factorAt(derived, 0, 0)).toEqual([64, 64, 64, 255]);
    expect(derived.darkened).toBe(W * H);
  });

  it('leaves emissive and metallic surfaces alone without being told which they are', () => {
    const unchanged = deriveShadowLayer(flat([255, 200, 90]), [flat([255, 200, 90])]);
    expect(factorAt(unchanged, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(unchanged.darkened).toBe(0);
  });

  it('is a no-op outside the room, so it cannot darken what the game draws there', () => {
    const covers = (x: number) => x < 4;
    const derived = deriveShadowLayer(flat([50, 50, 50], covers), [flat([200, 200, 200], covers)]);
    expect(factorAt(derived, 5, 0)).toEqual([255, 255, 255, 0]);
    expect(derived.covered).toBe(4 * H);
  });

  it('composites the layers before dividing, so the topmost one is what the factor is for', () => {
    const prop = (x: number) => x < 2;
    const derived = deriveShadowLayer(flat([25, 25, 25]), [flat([200, 200, 200]), flat([100, 100, 100], prop)]);
    expect(factorAt(derived, 0, 0)[0]).toBe(64);
    expect(factorAt(derived, 5, 0)[0]).toBe(32);
  });

  it('counts the ratios it had to clamp rather than hiding them', () => {
    const derived = deriveShadowLayer(flat([255, 255, 255]), [flat([200, 200, 200])]);
    expect(derived.clamped).toBe(W * H * 3);
    expect(factorAt(derived, 0, 0)).toEqual([255, 255, 255, 255]);
  });

  it('reports a no-op layer, which is the one failure the identity check cannot see', () => {
    const derived = deriveShadowLayer(flat([80, 80, 80]), [flat([80, 80, 80])]);
    expect(derived.darkened).toBe(0);
    expect(derived.meanFactor).toBe(1);
  });
});
