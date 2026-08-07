import { describe, expect, it } from 'vitest';
import {
  APOTHEOSIS_EFFECTS,
  APOTHEOSIS_FULL,
  APOTHEOSIS_OFF,
  APOTHEOSIS_OPTIMIZED_LV1,
  APOTHEOSIS_OPTIMIZED_LV2,
  APOTHEOSIS_OPTIMIZED_LV3,
  apotheosisFromSearch,
  nextApotheosis,
} from '../src/render/apotheosis/config';
import { drawCinematicGrounding } from '../src/render/apotheosis/render';
import { makeCamera } from '../src/render/iso';

describe('the Apotheosis boundary', () => {
  it('is completely off unless the host explicitly opts in', () => {
    expect(apotheosisFromSearch('')).toBe(APOTHEOSIS_OFF);
    expect(apotheosisFromSearch('?unrelated=full')).toBe(APOTHEOSIS_OFF);
    expect(apotheosisFromSearch('?apotheosis=unknown')).toBe(APOTHEOSIS_OFF);
    expect(APOTHEOSIS_OFF).toEqual({
      tier: 'off',
      architecture: false,
      floorMaterial: false,
      actorLighting: false,
      combatFx: false,
      postProcessing: false,
      interfaceChrome: false,
      cachedFloorDetail: false,
      lowResBloomBlur: false,
      cachedContactShadow: false,
    });
  });

  it('offers effects without enabling any full-scene pass', () => {
    expect(apotheosisFromSearch('?apotheosis=effects')).toBe(APOTHEOSIS_EFFECTS);
    expect(APOTHEOSIS_EFFECTS.combatFx).toBe(true);
    expect(APOTHEOSIS_EFFECTS.postProcessing).toBe(false);
    expect(APOTHEOSIS_EFFECTS.architecture).toBe(false);
    expect(APOTHEOSIS_EFFECTS.floorMaterial).toBe(false);
    expect(APOTHEOSIS_EFFECTS.actorLighting).toBe(false);
    expect(APOTHEOSIS_EFFECTS.interfaceChrome).toBe(false);
  });

  it('accepts explicit full and hand-typed toggle spellings', () => {
    for (const search of [
      '?apotheosis=full',
      '?apotheosis',
      '?apotheosis=1',
      '?apotheosis=on',
      '?apotheosis=true',
    ]) {
      expect(apotheosisFromSearch(search)).toBe(APOTHEOSIS_FULL);
    }
  });

  it('accepts every optimized level in both spellings a URL gets typed in', () => {
    expect(apotheosisFromSearch('?apotheosis=optimized_lv1')).toBe(APOTHEOSIS_OPTIMIZED_LV1);
    expect(apotheosisFromSearch('?apotheosis=optimized-lv1')).toBe(APOTHEOSIS_OPTIMIZED_LV1);
    expect(apotheosisFromSearch('?apotheosis=optimized_lv2')).toBe(APOTHEOSIS_OPTIMIZED_LV2);
    expect(apotheosisFromSearch('?apotheosis=optimized-lv2')).toBe(APOTHEOSIS_OPTIMIZED_LV2);
    expect(apotheosisFromSearch('?apotheosis=optimized_lv3')).toBe(APOTHEOSIS_OPTIMIZED_LV3);
    expect(apotheosisFromSearch('?apotheosis=optimized-lv3')).toBe(APOTHEOSIS_OPTIMIZED_LV3);
    expect(APOTHEOSIS_FULL.cachedFloorDetail).toBe(false);
    expect(APOTHEOSIS_FULL.lowResBloomBlur).toBe(false);
    expect(APOTHEOSIS_FULL.cachedContactShadow).toBe(false);
  });


  const OPTIMIZATIONS = [
    'cachedFloorDetail',
    'lowResBloomBlur',
    'cachedContactShadow',
  ] as const;
  const LEVELS = [
    APOTHEOSIS_OPTIMIZED_LV1,
    APOTHEOSIS_OPTIMIZED_LV2,
    APOTHEOSIS_OPTIMIZED_LV3,
  ];

  it('asks for the same picture as full, differing only in optimization switches', () => {
    const skip = new Set<string>(['tier', ...OPTIMIZATIONS]);
    const keys = Object.keys(APOTHEOSIS_FULL).filter((key) => !skip.has(key));
    expect(keys.length).toBeGreaterThan(0);
    for (const level of LEVELS) {
      for (const key of keys) {
        expect(
          level[key as keyof typeof level],
          `${level.tier}.${key} must match full.${key}`,
        ).toBe(APOTHEOSIS_FULL[key as keyof typeof APOTHEOSIS_FULL]);
      }
    }
  });

  it('accumulates optimizations, so each level adds exactly one', () => {
    expect(LEVELS.length).toBe(OPTIMIZATIONS.length);
    LEVELS.forEach((level, index) => {
      OPTIMIZATIONS.forEach((flag, position) => {
        expect(level[flag], `${level.tier}.${flag}`).toBe(position <= index);
      });
    });
  });

  it('cycles the lab through the named cost tiers', () => {
    expect(nextApotheosis(APOTHEOSIS_OFF)).toBe(APOTHEOSIS_EFFECTS);
    expect(nextApotheosis(APOTHEOSIS_EFFECTS)).toBe(APOTHEOSIS_OPTIMIZED_LV1);
    expect(nextApotheosis(APOTHEOSIS_OPTIMIZED_LV1)).toBe(APOTHEOSIS_OPTIMIZED_LV2);
    expect(nextApotheosis(APOTHEOSIS_OPTIMIZED_LV2)).toBe(APOTHEOSIS_OPTIMIZED_LV3);
    expect(nextApotheosis(APOTHEOSIS_OPTIMIZED_LV3)).toBe(APOTHEOSIS_FULL);
    expect(nextApotheosis(APOTHEOSIS_FULL)).toBe(APOTHEOSIS_OFF);
    expect(nextApotheosis(APOTHEOSIS_OFF, -1)).toBe(APOTHEOSIS_FULL);
  });
});


interface FakeCanvas {
  width: number;
  height: number;
  getContext: () => CanvasRenderingContext2D;
  filters: string[];
  blits: number;
}

const created: FakeCanvas[] = [];

const makeFakeCanvas = (): FakeCanvas => {
  const canvas: FakeCanvas = {
    width: 300,
    height: 150,
    getContext: () => context,
    filters: [],
    blits: 0,
  };
  const target: Record<string | symbol, unknown> = {
    canvas,
    getTransform: () => ({ a: 2, b: 0 }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    drawImage: () => {
      canvas.blits += 1;
    },
  };
  const context = new Proxy(target, {
    get: (object, property) => (property in object ? object[property] : () => undefined),
    set: (object, property, value) => {
      if (property === 'filter' && typeof value === 'string') canvas.filters.push(value);
      object[property] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  created.push(canvas);
  return canvas;
};

const underFakeDocument = <T>(run: () => T): T => {
  const documentHost = globalThis as { document?: unknown };
  const restore = documentHost.document;
  documentHost.document = { createElement: () => makeFakeCanvas() };
  try {
    return run();
  } finally {
    if (restore === undefined) delete documentHost.document;
    else documentHost.document = restore;
  }
};

describe('optimization 3, the filter the frames were in', () => {
  const groundBodies = (cachedShadow: boolean, radii: readonly number[]): FakeCanvas => {
    const frame = makeFakeCanvas();
    frame.width = 2560;
    frame.height = 1440;
    const ctx = frame.getContext();
    const cam = makeCamera(1280, 720);
    radii.forEach((radius, index) => {
      drawCinematicGrounding(ctx, cam, { x: index, y: index }, radius, '#ffd873', 1, cachedShadow);
    });
    return frame;
  };

  it('sets one blur on the frame per body when it is off', () => {
    const frame = underFakeDocument(() => groundBodies(false, [0.5, 0.5]));
    expect(frame.filters.filter((filter) => filter.startsWith('blur('))).toHaveLength(2);
    expect(frame.blits).toBe(0);
  });

  it('sets none when it is on, and blits a raster per body instead', () => {
    const frame = underFakeDocument(() => groundBodies(true, [0.7, 0.7]));
    expect(frame.filters).toEqual([]);
    expect(frame.blits).toBe(2);
  });

  it('rasterizes once per radius, not once per body', () => {
    created.length = 0;
    underFakeDocument(() => groundBodies(true, [0.9, 0.9, 0.9]));
    expect(created).toHaveLength(2);

    created.length = 0;
    underFakeDocument(() => groundBodies(true, [1.3, 1.9]));
    expect(created).toHaveLength(3);
  });

  it('keeps the blur inside the raster, where it is paid once', () => {
    created.length = 0;
    underFakeDocument(() => groundBodies(true, [2.4]));
    const raster = created[1];
    expect(raster.filters).toHaveLength(1);
    expect(raster.filters[0]).toMatch(/^blur\(/);
  });
});
