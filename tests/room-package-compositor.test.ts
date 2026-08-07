
import { describe, expect, it } from 'vitest';

import type { World } from '../src/sim/types';

import { ELEVATION_Y, ISO_X, ISO_Y, makeCamera } from '../src/render/iso';
import {
  isUpscaled,
  layerPlacement,
  mergeStatic,
  roomLayerPainter,
  type LayerImage,
  type RoomPackageManifest,
} from '../src/render/room-package-lab';

const MANIFEST: RoomPackageManifest = {
  id: 'concept_lantern_cloister',
  widthPx: 2999,
  heightPx: 1976,
  maxDrawsPerFrame: 4,
  projection: {
    isoX: 34,
    isoY: 17,
    elevationY: 34,
    effectiveScale: 2.594088622291022,
    origin: { x: 0, y: 0, elevation: 2.7 },
  },
};

const camAt = (zoom: number, centre = { x: 0, y: 0 }) => {
  const cam = makeCamera(1440, 900);
  cam.zoom = zoom;
  cam.center = centre;
  return cam;
};

const image = (): LayerImage => ({ width: 2999, height: 1976 }) as unknown as LayerImage;

describe('placing a room-shaped raster', () => {
  it('draws at 1:1 when the camera is at the authored scale', () => {
    const at = layerPlacement(MANIFEST, camAt(MANIFEST.projection.effectiveScale));
    expect(at.scale).toBeCloseTo(1, 12);
    expect(at.width).toBeCloseTo(2999, 9);
    expect(at.height).toBeCloseTo(1976, 9);
  });

  it('takes the origin’s elevation from the manifest, not the floor', () => {
    const cam = camAt(MANIFEST.projection.effectiveScale);
    const correct = layerPlacement(MANIFEST, cam);
    const floorAssumed = layerPlacement(
      { ...MANIFEST, projection: { ...MANIFEST.projection, origin: { x: 0, y: 0, elevation: 0 } } },
      cam,
    );
    const offset = floorAssumed.y - correct.y;
    expect(offset).toBeCloseTo(2.7 * ELEVATION_Y * cam.zoom, 6);
    expect(Math.round(offset)).toBe(238);
  });

  it('scales by the ratio, so no viewport is a special case', () => {
    for (const zoom of [0.476, 0.696, 1.007, 2.236]) {
      expect(layerPlacement(MANIFEST, camAt(zoom)).scale).toBeCloseTo(
        zoom / MANIFEST.projection.effectiveScale,
        12,
      );
    }
  });

  it('tracks the floor exactly when the camera pans', () => {
    const zoom = 1.007;
    const a = layerPlacement(MANIFEST, camAt(zoom));
    const b = layerPlacement(MANIFEST, camAt(zoom, { x: 3, y: -2 }));
    expect(a.x - b.x).toBeCloseTo((3 - -2) * ISO_X * zoom, 9);
    expect(a.y - b.y).toBeCloseTo((3 + -2) * ISO_Y * zoom, 9);
  });

  it('reports upscaling rather than refusing to draw it', () => {
    expect(isUpscaled(layerPlacement(MANIFEST, camAt(2.236)))).toBe(false);
    expect(isUpscaled(layerPlacement(MANIFEST, camAt(2.6)))).toBe(true);
  });
});

describe('the merge ADR-024 budgets', () => {
  const canvasFactory = () => {
    const drawn: unknown[] = [];
    const make = (w: number, h: number) => ({
      canvas: { width: w, height: h } as unknown as LayerImage,
      ctx: { drawImage: (img: unknown) => drawn.push(img) } as unknown as CanvasRenderingContext2D,
    });
    return { make, drawn };
  };

  it('composites the three static layers into one texture', () => {
    const { make, drawn } = canvasFactory();
    const layers = {
      backgroundArchitecture: image(),
      playableFloor: image(),
      solidProps: image(),
    };
    const merged = mergeStatic(layers, MANIFEST, make);
    expect(merged?.merged).toBe(3);
    expect(drawn).toEqual([
      layers.backgroundArchitecture,
      layers.playableFloor,
      layers.solidProps,
    ]);
  });

  it('is what brings a six-layer package inside the four-draw budget', () => {
    const layers = {
      backgroundArchitecture: image(),
      playableFloor: image(),
      solidProps: image(),
      foregroundOccluders: image(),
      lighting: image(),
      shadow: image(),
    };
    const { make } = canvasFactory();
    const withMerge = roomLayerPainter(MANIFEST, layers, mergeStatic(layers, MANIFEST, make));
    const without = roomLayerPainter(MANIFEST, layers, null);
    expect(withMerge.drawsPerFrame).toBe(4);
    expect(withMerge.drawsPerFrame).toBeLessThanOrEqual(MANIFEST.maxDrawsPerFrame);
    expect(without.drawsPerFrame).toBe(6);
  });

  it('has nothing to merge when no static layer was exported', () => {
    const { make } = canvasFactory();
    expect(mergeStatic({ foregroundOccluders: image() }, MANIFEST, make)).toBeNull();
  });
});

describe('the cast goes between the two passes', () => {
  const painterFor = (
    layers: Parameters<typeof roomLayerPainter>[1],
    manifest: RoomPackageManifest = MANIFEST,
  ) => {
    const behind: unknown[] = [];
    const front: unknown[] = [];
    const modes: string[] = [];
    let left: string | undefined;
    const ctxFor = (sink: unknown[]) => {
      const ctx = {
        imageSmoothingEnabled: false,
        globalCompositeOperation: 'source-over',
        drawImage: (img: unknown) => {
          sink.push(img);
          modes.push(ctx.globalCompositeOperation);
        },
      };
      return {
        ctx: ctx as unknown as CanvasRenderingContext2D,
        after: () => {
          left = ctx.globalCompositeOperation;
        },
      };
    };
    const painter = roomLayerPainter(manifest, layers, null);
    const back = ctxFor(behind);
    painter.drawBehind(back.ctx, camAt(1));
    back.after();
    const fore = ctxFor(front);
    painter.drawInFront(fore.ctx, camAt(1));
    fore.after();
    return { behind, front, modes, left, painter };
  };

  it('keeps the occluders out of the pass that runs before the actors', () => {
    const occluders = image();
    const { behind, front } = painterFor({
      backgroundArchitecture: image(),
      playableFloor: image(),
      foregroundOccluders: occluders,
    });
    expect(front).toEqual([occluders]);
    expect(behind).not.toContain(occluders);
    expect(behind).toHaveLength(2);
  });

  it('draws nothing at all rather than a blank rectangle when a pass is empty', () => {
    const { front } = painterFor({ playableFloor: image() });
    expect(front).toEqual([]);
  });

  it('puts the two light terms after the cast, which is the whole reason they were separated', () => {
    const shadow = image();
    const lighting = image();
    const { behind, front } = painterFor({
      backgroundArchitecture: image(),
      playableFloor: image(),
      shadow,
      lighting,
    });
    expect(behind).not.toContain(shadow);
    expect(behind).not.toContain(lighting);
    expect(front).toEqual([shadow, lighting]);
  });

  it('takes each blend mode from the manifest rather than from a constant here', () => {
    const manifest: RoomPackageManifest = {
      ...MANIFEST,
      composite: { playableFloor: 'source-over', shadow: 'multiply', lighting: 'lighter' },
    };
    const { modes } = painterFor(
      { playableFloor: image(), shadow: image(), lighting: image() },
      manifest,
    );
    expect(modes).toEqual(['source-over', 'multiply', 'lighter']);
  });

  it('defaults to an ordinary draw when a package declares nothing', () => {
    const { modes } = painterFor({ playableFloor: image(), shadow: image() });
    expect(modes).toEqual(['source-over', 'source-over']);
  });

  it('leaves the context in the mode it found it, so nothing after inherits `lighter`', () => {
    const manifest: RoomPackageManifest = { ...MANIFEST, composite: { lighting: 'lighter' } };
    const { left } = painterFor({ playableFloor: image(), lighting: image() }, manifest);
    expect(left).toBe('source-over');
  });

  it('counts the light terms against ADR-024’s budget', () => {
    const { painter } = painterFor({
      backgroundArchitecture: image(),
      playableFloor: image(),
      solidProps: image(),
      shadow: image(),
      lighting: image(),
    });
    expect(painter.drawsPerFrame).toBe(5);
    const merged = roomLayerPainter(
      MANIFEST,
      {
        backgroundArchitecture: image(),
        playableFloor: image(),
        solidProps: image(),
        shadow: image(),
        lighting: image(),
      },
      { image: image(), merged: 3 },
    );
    expect(merged.drawsPerFrame).toBe(3);
    expect(merged.drawsPerFrame).toBeLessThanOrEqual(MANIFEST.maxDrawsPerFrame);
  });
});

describe('the composited room answers the fight', () => {
  const worldWith = (over: Record<string, unknown> = {}): () => World =>
    () => ({
      tick: 0,
      enemies: [],
      players: [{ state: { kind: 'idle', enteredTick: 0 }, hp: 100, maxHp: 100 }],
      ...over,
    }) as unknown as World;

  const record = (world?: () => World) => {
    const draws: { mode: string; alpha: number }[] = [];
    const fills: { mode: string; alpha: number; style: unknown }[] = [];
    const ctx = {
      imageSmoothingEnabled: false,
      globalCompositeOperation: 'source-over',
      globalAlpha: 1,
      fillStyle: '',
      drawImage: () => draws.push({ mode: ctx.globalCompositeOperation, alpha: ctx.globalAlpha }),
      fillRect: () =>
        fills.push({
          mode: ctx.globalCompositeOperation,
          alpha: ctx.globalAlpha,
          style: ctx.fillStyle,
        }),
    };
    const painter = roomLayerPainter(
      { ...MANIFEST, composite: { shadow: 'multiply', lighting: 'lighter' } },
      { playableFloor: image(), shadow: image(), lighting: image() },
      null,
      { world },
    );
    painter.drawInFront(ctx as unknown as CanvasRenderingContext2D, camAt(1));
    return { draws, fills, ctx };
  };

  it('scales the additive term alone, and leaves the multiply alone', () => {
    const { draws } = record(worldWith({
      players: [{ state: { kind: 'idle', enteredTick: 0 }, hp: 33, maxHp: 100 }],
    }));
    const lit = draws.filter((d) => d.mode === 'lighter');
    const shadowed = draws.filter((d) => d.mode === 'multiply');
    expect(lit).toHaveLength(1);
    expect(lit[0].alpha).toBeLessThan(1);
    expect(shadowed).toHaveLength(1);
    expect(shadowed[0].alpha).toBe(1);
  });

  it('draws exactly what it always drew when nobody handed it a world', () => {
    const { draws, fills } = record(undefined);
    expect(fills).toEqual([]);
    for (const draw of draws) expect(draw.alpha).toBe(1);
  });

  it('leans the room cold while a parry window is open, and warm on a wind-up', () => {
    const parry = record(worldWith({
      players: [{ state: { kind: 'parry', enteredTick: 0 }, hp: 100, maxHp: 100 }],
    }));
    const cold = /rgb\((\d+) (\d+) (\d+)\)/.exec(String(parry.fills[0].style));
    expect(cold).not.toBeNull();
    expect(Number(cold![3])).toBeGreaterThan(Number(cold![1]));
    expect(parry.fills[0].mode).toBe('multiply');

    const threat = record(worldWith({
      enemies: [{ state: { kind: 'telegraph' }, pos: { x: 0, y: 0 } }],
    }));
    const warm = /rgb\((\d+) (\d+) (\d+)\)/.exec(String(threat.fills[0].style));
    expect(warm).not.toBeNull();
    expect(Number(warm![1])).toBeGreaterThan(Number(warm![3]));
  });

  it('restores the alpha it borrowed, so nothing drawn after inherits it', () => {
    const { ctx } = record(worldWith({
      players: [{ state: { kind: 'idle', enteredTick: 0 }, hp: 10, maxHp: 100 }],
    }));
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.globalCompositeOperation).toBe('source-over');
  });
});

describe('a baked lantern gets its fire back', () => {
  const LAMPS = [
    { at: { x: -8.5, y: 3.67 }, elevation: 3.45, energy: 180, colour: [1, 0.82, 0.55] },
    { at: { x: 8.5, y: -3.67 }, elevation: 3.45, energy: 180, colour: [1, 0.82, 0.55] },
    { at: { x: 0, y: 6.2 }, elevation: 1.15, energy: 280, colour: [1, 0.78, 0.5] },
  ];

  const glowsAt = (tick: number, lamps: unknown = LAMPS, hp = 100) => {
    const fills: { style: unknown; mode: string }[] = [];
    const ctx = {
      imageSmoothingEnabled: false,
      globalCompositeOperation: 'source-over',
      globalAlpha: 1,
      fillStyle: '' as unknown,
      drawImage: () => {},
      fillRect: () => fills.push({ style: ctx.fillStyle, mode: ctx.globalCompositeOperation }),
      createRadialGradient: () => {
        const stops: string[] = [];
        return { addColorStop: (_o: number, c: string) => stops.push(c), stops };
      },
    };
    const painter = roomLayerPainter(
      { ...MANIFEST, composite: { lighting: 'lighter' }, lamps } as RoomPackageManifest,
      { playableFloor: image(), lighting: image() },
      null,
      {
        world: () => ({
          tick,
          enemies: [],
          players: [{ state: { kind: 'idle', enteredTick: 0 }, hp, maxHp: 100 }],
        }) as unknown as World,
      },
    );
    painter.drawInFront(ctx as unknown as CanvasRenderingContext2D, camAt(1));
    return fills.filter((f) => f.mode === 'lighter');
  };

  it('gives every lamp its own phase, so nine fires are not one animation', () => {
    const glows = glowsAt(37);
    expect(glows.length).toBe(LAMPS.length);
    const alphas = glows.map((g) => String((g.style as { stops: string[] }).stops[0]));
    expect(new Set(alphas).size).toBeGreaterThan(1);
  });

  it('moves between one frame and the next', () => {
    const first = String((glowsAt(10)[0].style as { stops: string[] }).stops[0]);
    const later = String((glowsAt(31)[0].style as { stops: string[] }).stops[0]);
    expect(first).not.toBe(later);
  });

  it('goes out with the room rather than burning on over a dead king', () => {
    const healthy = glowsAt(37, LAMPS, 100);
    const dying = glowsAt(37, LAMPS, 5);
    const alphaOf = (g: { style: unknown }) =>
      Number(/\/ ([\d.]+)\)/.exec(String((g.style as { stops: string[] }).stops[0]))?.[1] ?? 0);
    expect(alphaOf(dying[0])).toBeLessThan(alphaOf(healthy[0]));
  });

  it('draws nothing when the package carries no rig', () => {
    expect(glowsAt(37, null)).toHaveLength(0);
  });
});
