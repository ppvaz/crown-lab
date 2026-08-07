
import type { Camera } from './iso';
import { parallaxOffset } from './iso';
import type { Ambience } from './ambience';
import { hashNoise } from './ambience';
import { mixHex } from './draw-primitives';
import farMountainsUrl from '../assets/parallax/far-mountains.webp';
import distantCityUrl from '../assets/parallax/distant-city.webp';
import midBattlementsUrl from '../assets/parallax/mid-battlements.webp';
import nearColonnadeUrl from '../assets/parallax/near-colonnade.webp';

export const drawSky = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  ambience: Ambience,
): void => {
  const gradient = ctx.createLinearGradient(0, 0, 0, cam.height);
  gradient.addColorStop(0, ambience.skyHigh);
  gradient.addColorStop(0.38, ambience.skyHorizon);
  gradient.addColorStop(1, ambience.skyLow);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, cam.width, cam.height);
};

const ARTWORK = new Map<string, HTMLImageElement>();
const FILTERED_ARTWORK = new WeakMap<HTMLImageElement, HTMLCanvasElement>();

const artworkFor = (url: string): HTMLImageElement | null => {
  if (typeof Image === 'undefined') return null;
  const cached = ARTWORK.get(url);
  if (cached !== undefined) return cached;
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  ARTWORK.set(url, image);
  return image;
};

const artworkReady = (image: HTMLImageElement | null): image is HTMLImageElement =>
  image !== null && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;

const filteredArtworkFor = (image: HTMLImageElement): CanvasImageSource => {
  const cached = FILTERED_ARTWORK.get(image);
  if (cached !== undefined) return cached;
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return image;
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const filtered = canvas.getContext('2d');
  if (filtered === null) return image;
  filtered.filter = 'saturate(0.4) brightness(0.48) contrast(0.9)';
  filtered.drawImage(image, 0, 0);
  FILTERED_ARTWORK.set(image, canvas);
  return canvas;
};

const PARALLAX_SHEETS: readonly string[] = [
  farMountainsUrl,
  distantCityUrl,
  midBattlementsUrl,
  nearColonnadeUrl,
];

export const warmParallax = (): void => {
  for (const url of PARALLAX_SHEETS) {
    const image = artworkFor(url);
    if (image === null) continue;
    if (image.complete) {
      if (image.naturalWidth > 0) filteredArtworkFor(image);
      continue;
    }
    image.addEventListener('load', () => void filteredArtworkFor(image), { once: true });
  }
};

export const parallaxPending = (): number => {
  let waiting = 0;
  for (const image of ARTWORK.values()) if (!image.complete) waiting += 1;
  return waiting;
};

interface ParallaxLayer {
  rate: number;
  height: number;
  period: number;
  baseline: number;
  haze: number;
  form: 'towers' | 'battlements' | 'colonnade';
  artUrl: string;
  artHeight: number;
  artOverscan: number;
  artOpacity: number;
}

const PARALLAX: readonly ParallaxLayer[] = [
  {
    rate: 0.03,
    height: 0.26,
    period: 620,
    baseline: 0.39,
    haze: 0.8,
    form: 'towers',
    artUrl: farMountainsUrl,
    artHeight: 0.29,
    artOverscan: 1.08,
    artOpacity: 0.4,
  },
  {
    rate: 0.07,
    height: 0.2,
    period: 430,
    baseline: 0.5,
    haze: 0.58,
    form: 'towers',
    artUrl: distantCityUrl,
    artHeight: 0.42,
    artOverscan: 1.14,
    artOpacity: 0.42,
  },
  {
    rate: 0.15,
    height: 0.14,
    period: 300,
    baseline: 0.61,
    haze: 0.36,
    form: 'battlements',
    artUrl: midBattlementsUrl,
    artHeight: 0.34,
    artOverscan: 1.2,
    artOpacity: 0.44,
  },
  {
    rate: 0.28,
    height: 0.1,
    period: 190,
    baseline: 0.82,
    haze: 0.16,
    form: 'colonnade',
    artUrl: nearColonnadeUrl,
    artHeight: 0.62,
    artOverscan: 1.32,
    artOpacity: 0.46,
  },
];

interface ParallaxComposition {
  opacity: readonly [number, number, number, number];
  lift: readonly [number, number, number, number];
  phase: readonly [number, number, number, number];
}

const PARALLAX_COMPOSITIONS: Readonly<Record<Ambience['parallaxStyle'], ParallaxComposition>> = {
  inhabited: {
    opacity: [0.95, 1.18, 0.82, 0.9],
    lift: [0, 0.012, 0.008, 0],
    phase: [0, -0.04, 0.03, -0.02],
  },
  fortress: {
    opacity: [0.82, 0.48, 1.18, 1.04],
    lift: [0.01, 0.018, -0.012, -0.018],
    phase: [-0.02, 0.05, -0.04, 0.03],
  },
  ruin: {
    opacity: [1.08, 0.34, 0.72, 0.4],
    lift: [-0.012, 0.025, 0.018, 0.035],
    phase: [0.04, -0.08, 0.07, -0.05],
  },
  high_court: {
    opacity: [1.16, 0.72, 0.42, 0.24],
    lift: [-0.025, -0.012, 0.028, 0.05],
    phase: [-0.03, 0.04, -0.06, 0.08],
  },
};

const drawAuthoredParallaxLayer = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  layer: ParallaxLayer,
  image: HTMLImageElement,
  baseY: number,
  offset: number,
  opacity: number,
): void => {
  const aspect = image.naturalWidth / image.naturalHeight;
  let height = cam.height * layer.artHeight;
  let width = height * aspect;
  const minimumWidth = cam.width * layer.artOverscan;
  if (width < minimumWidth) {
    width = minimumWidth;
    height = width / aspect;
  }
  const xReach = Math.max(0, (width - cam.width) / 2);
  const x = (cam.width - width) / 2 + Math.max(-xReach, Math.min(xReach, offset));

  ctx.save();
  ctx.globalAlpha = Math.min(1, layer.artOpacity * opacity);
  ctx.drawImage(filteredArtworkFor(image), x, baseY - height, width, height);
  ctx.restore();
};

export const drawParallax = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  ambience: Ambience,
): void => {
  const artwork = PARALLAX.map((layer) => artworkFor(layer.artUrl));
  const authoredReady = artwork.every(artworkReady);
  const composition = PARALLAX_COMPOSITIONS[ambience.parallaxStyle];

  for (let layerIndex = 0; layerIndex < PARALLAX.length; layerIndex += 1) {
    const layer = PARALLAX[layerIndex];
    const layerOpacity = composition.opacity[layerIndex];
    if (layerOpacity <= 0) continue;

    const slide = parallaxOffset(cam, layer.rate);
    const baseY =
      cam.height * (layer.baseline + composition.lift[layerIndex]) +
      slide.y;
    const tall = cam.height * layer.height;
    const period = layer.period * Math.max(0.6, cam.zoom);
    const offset = slide.x + cam.width * composition.phase[layerIndex];

    const silhouette = mixHex(ambience.skyLow, ambience.skyHorizon, 0.35);
    const color = mixHex(silhouette, ambience.skyHorizon, layer.haze);

    const art = artwork[layerIndex];
    if (authoredReady && artworkReady(art)) {
      drawAuthoredParallaxLayer(ctx, cam, layer, art, baseY, offset, layerOpacity);
      continue;
    }

    ctx.save();
    ctx.globalAlpha = Math.min(1, layerOpacity);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-period, cam.height);

    const first = Math.floor((-offset - period) / period);
    const last = Math.ceil((cam.width - offset + period) / period);
    for (let i = first; i <= last; i++) {
      const x = offset + i * period;
      const jitter = hashNoise(i, layer.rate * 1000);
      const jitter2 = hashNoise(i, layer.rate * 1000 + 7);

      if (layer.form === 'towers') {
        const h = tall * (0.35 + jitter * 0.65);
        const w = period * (0.3 + jitter2 * 0.34);
        ctx.lineTo(x, baseY);
        ctx.lineTo(x, baseY - h);
        if (jitter2 > 0.55) {
          ctx.lineTo(x + w / 2, baseY - h - tall * 0.4);
          ctx.lineTo(x + w, baseY - h);
        } else {
          ctx.lineTo(x + w, baseY - h);
        }
        ctx.lineTo(x + w, baseY);
      } else if (layer.form === 'battlements') {
        const h = tall * (0.6 + jitter * 0.25);
        const merlon = period / 6;
        ctx.lineTo(x, baseY);
        ctx.lineTo(x, baseY - h);
        for (let m = 0; m < 6; m++) {
          const mx = x + m * merlon;
          const up = m % 2 === 0 ? tall * 0.22 : 0;
          ctx.lineTo(mx, baseY - h - up);
          ctx.lineTo(mx + merlon, baseY - h - up);
        }
        ctx.lineTo(x + period, baseY);
      } else {
        const h = tall * (0.7 + jitter * 0.3);
        const w = period * 0.26;
        ctx.lineTo(x, baseY);
        ctx.lineTo(x, baseY - h);
        ctx.lineTo(x + w, baseY - h);
        ctx.lineTo(x + w, baseY);
      }
    }
    ctx.lineTo(cam.width + period, cam.height);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
};
