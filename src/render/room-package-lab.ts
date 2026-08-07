
import type { World } from '../sim/types';
import type { Camera } from './iso';
import { worldToScreenAtElevation } from './iso';
import type { RGB } from './room-light-lab';
import { flickerDepth, lampFlicker, roomLean, roomResponse } from './room-light-lab';

export interface RoomPackageProjection {
  isoX: number;
  isoY: number;
  elevationY: number;
  effectiveScale: number;
  origin: { x: number; y: number; elevation: number };
}

export type LayerComposite = 'source-over' | 'multiply' | 'lighter';

export interface RoomPackageManifest {
  id: string;
  widthPx: number;
  heightPx: number;
  projection: RoomPackageProjection;
  maxDrawsPerFrame: number;
  composite?: Partial<Record<keyof RoomLayerImages, LayerComposite>>;
}

export type LayerImage = CanvasImageSource;

export interface RoomLayerImages {
  backgroundArchitecture?: LayerImage;
  playableFloor?: LayerImage;
  solidProps?: LayerImage;
  foregroundOccluders?: LayerImage;
  lighting?: LayerImage;
  shadow?: LayerImage;
}

export interface LayerPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

export const layerPlacement = (
  manifest: RoomPackageManifest,
  cam: Camera,
): LayerPlacement => {
  const { origin, effectiveScale } = manifest.projection;
  const anchor = worldToScreenAtElevation(cam, { x: origin.x, y: origin.y }, origin.elevation);
  const scale = cam.zoom / effectiveScale;
  const width = manifest.widthPx * scale;
  const height = manifest.heightPx * scale;
  return { x: anchor.x - width / 2, y: anchor.y - height / 2, width, height, scale };
};

export const isUpscaled = (placement: LayerPlacement): boolean => placement.scale > 1;

interface PaintedLayer {
  image: LayerImage;
  mode: LayerComposite;
}

export interface MergedStatic {
  image: LayerImage;
  merged: number;
}

export const mergeStatic = (
  images: RoomLayerImages,
  manifest: RoomPackageManifest,
  makeCanvas: (w: number, h: number) => { canvas: LayerImage; ctx: CanvasRenderingContext2D },
  sortedLayers: ReadonlySet<string> = new Set(),
): MergedStatic | null => {
  const order: LayerImage[] = (
    [
      ['backgroundArchitecture', images.backgroundArchitecture],
      ['playableFloor', images.playableFloor],
      ['solidProps', images.solidProps],
    ] as const
  )
    .filter(([name]) => !sortedLayers.has(name))
    .map(([, layer]) => layer)
    .filter((layer): layer is LayerImage => layer !== undefined);
  if (order.length === 0) return null;

  const { canvas, ctx } = makeCanvas(manifest.widthPx, manifest.heightPx);
  for (const layer of order) ctx.drawImage(layer, 0, 0);
  return { image: canvas, merged: order.length };
};

export interface OccluderSprite {
  name: string;
  file: string;
  anchor: { x: number; y: number };
  layer: string;
  crop: [number, number, number, number];
}

export interface SortedOccluder {
  at: { x: number; y: number };
  draw: (ctx: CanvasRenderingContext2D, cam: Camera) => void;
}

export const occluderSprites = (
  manifest: RoomPackageManifest & { occluders?: readonly OccluderSprite[] },
  images: Readonly<Record<string, LayerImage>>,
): SortedOccluder[] =>
  (manifest.occluders ?? []).flatMap((sprite) => {
    const image = images[sprite.name];
    if (image === undefined) return [];
    const [x0, y0, x1, y1] = sprite.crop;
    return [
      {
        at: sprite.anchor,
        draw: (ctx: CanvasRenderingContext2D, cam: Camera): void => {
          const full = layerPlacement(manifest, cam);
          ctx.drawImage(
            image,
            full.x + x0 * full.scale,
            full.y + y0 * full.scale,
            (x1 - x0) * full.scale,
            (y1 - y0) * full.scale,
          );
        },
      },
    ];
  });

export interface RoomLayerPainter {
  drawBehind: (ctx: CanvasRenderingContext2D, cam: Camera) => void;
  drawInFront: (ctx: CanvasRenderingContext2D, cam: Camera) => void;
  readonly drawsPerFrame: number;
}

export interface PackageLamp {
  at: { x: number; y: number };
  elevation: number;
  energy: number;
  colour: number[];
}

export interface RoomPackageSource {
  manifest: string;
  layers: Readonly<Partial<Record<keyof RoomLayerImages, string>>>;
  occluders?: Readonly<Record<string, string>>;
}

export const loadRoomPackage = async (
  source: RoomPackageSource,
  onFailure?: (reason: string) => void,
  world?: () => World,
): Promise<{
  manifest: RoomPackageManifest;
  painter: RoomLayerPainter;
  occluders: SortedOccluder[];
} | null> => {
  const fail = (reason: string): null => {
    onFailure?.(reason);
    return null;
  };
  try {
    const response = await fetch(source.manifest);
    if (!response.ok) return fail(`manifest ${response.status}`);
    const manifest = (await response.json()) as RoomPackageManifest;
    if (typeof manifest.widthPx !== 'number' || manifest.projection?.origin === undefined) {
      return fail('manifest has no raster size or no projection origin');
    }

    const entries = Object.entries(source.layers) as [keyof RoomLayerImages, string][];
    const decoded = await Promise.all(
      entries.map(async ([name, url]) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        return [name, img] as const;
      }),
    );
    const images: RoomLayerImages = Object.fromEntries(decoded);

    const sprites = await Promise.all(
      Object.entries(source.occluders ?? {}).map(async ([name, url]) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        return [name, img] as const;
      }),
    );

    const withSprites = manifest as RoomPackageManifest & { occluders?: readonly OccluderSprite[] };
    const sortedLayers = new Set((withSprites.occluders ?? []).map((sprite) => sprite.layer));
    const occluders = occluderSprites(withSprites, Object.fromEntries(sprites));

    const merged = mergeStatic(images, manifest, (w, h) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx === null) throw new Error('no 2d context for the static merge');
      return { canvas, ctx };
    }, sortedLayers);
    return {
      manifest,
      painter: roomLayerPainter(manifest, images, merged, { sortedLayers, world }),
      occluders,
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
};

export const roomLayerPainter = (
  manifest: RoomPackageManifest,
  images: RoomLayerImages,
  merged: MergedStatic | null,
  opts: {
    sortedLayers?: ReadonlySet<string>;
    world?: () => World;
  } = {},
): RoomLayerPainter => {
  const sorted = opts.sortedLayers ?? new Set<string>();
  const modeOf = (name: keyof RoomLayerImages): LayerComposite =>
    manifest.composite?.[name] ?? 'source-over';
  const draw = (name: keyof RoomLayerImages): PaintedLayer[] => {
    const image = images[name];
    return image === undefined || sorted.has(name) ? [] : [{ image, mode: modeOf(name) }];
  };

  const statics: PaintedLayer[] = merged
    ? [{ image: merged.image, mode: 'source-over' }]
    : [...draw('backgroundArchitecture'), ...draw('playableFloor'), ...draw('solidProps')];
  const front: PaintedLayer[] = [...draw('foregroundOccluders'), ...draw('shadow'), ...draw('lighting')];

  const lamps: readonly PackageLamp[] = (manifest as RoomPackageManifest & {
    lamps?: readonly PackageLamp[];
  }).lamps ?? [];
  const reference = lamps.length === 0 ? 1 : Math.max(1e-6, lamps[0].energy);

  const paintLamps = (
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    light: { gain: number; tint: RGB; blend: number },
    timeMs: number,
  ): void => {
    if (lamps.length === 0) return;
    const blend = ctx.globalCompositeOperation;
    const alpha = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    lamps.forEach((lamp, i) => {
      const flicker = lampFlicker(i, timeMs, flickerDepth(lamp.energy, reference));
      const strength = Math.max(0, Math.min(1, (flicker - 1) * 2.4 + 0.34) * light.gain);
      if (strength <= 0.001) return;
      const at = worldToScreenAtElevation(cam, lamp.at, lamp.elevation);
      const radius = Math.max(8, 2.1 * cam.zoom);
      const glow = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius);
      const [r, g, b] = lamp.colour;
      const tint = (c: number, k: number): number =>
        Math.round(Math.max(0, Math.min(255, (c * (1 - light.blend) + light.tint[k] * light.blend) * 255)));
      const rgb = `${tint(r, 0)} ${tint(g, 1)} ${tint(b, 2)}`;
      glow.addColorStop(0, `rgb(${rgb} / ${(0.5 * strength).toFixed(3)})`);
      glow.addColorStop(0.45, `rgb(${rgb} / ${(0.16 * strength).toFixed(3)})`);
      glow.addColorStop(1, `rgb(${rgb} / 0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(at.x - radius, at.y - radius, radius * 2, radius * 2);
    });
    ctx.globalCompositeOperation = blend;
    ctx.globalAlpha = alpha;
  };

  const litBy = (): { gain: number; tint: RGB; blend: number } =>
    opts.world === undefined
      ? { gain: 1, tint: [1, 1, 1], blend: 0 }
      : roomLean(roomResponse(opts.world()));

  const paint = (
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    layers: PaintedLayer[],
    light?: { gain: number; tint: RGB; blend: number },
  ): void => {
    if (layers.length === 0) return;
    const at = layerPlacement(manifest, cam);
    const smoothing = ctx.imageSmoothingEnabled;
    const blend = ctx.globalCompositeOperation;
    const alpha = ctx.globalAlpha;
    ctx.imageSmoothingEnabled = true;
    for (const layer of layers) {
      ctx.globalCompositeOperation = layer.mode;
      ctx.globalAlpha = light !== undefined && layer.mode === 'lighter'
        ? Math.max(0, Math.min(1, light.gain))
        : 1;
      ctx.drawImage(layer.image, at.x, at.y, at.width, at.height);
    }
    if (light !== undefined && light.blend > 0) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = Math.max(0, Math.min(1, light.blend));
      const [r, g, b] = light.tint;
      ctx.fillStyle = `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
      ctx.fillRect(at.x, at.y, at.width, at.height);
    }
    ctx.globalCompositeOperation = blend;
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = smoothing;
  };

  return {
    drawBehind: (ctx, cam) => paint(ctx, cam, statics),
    drawInFront: (ctx, cam) => {
      const light = litBy();
      paint(ctx, cam, front, light);
      paintLamps(ctx, cam, light, opts.world === undefined ? 0 : roomResponse(opts.world()).timeMs);
    },
    drawsPerFrame: statics.length + front.length,
  };
};
