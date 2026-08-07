
import type { Vec2, World } from '../../sim/types';
import type { Camera } from '../iso';
import { groundEllipse, worldToScreen } from '../iso';
import type { Palette } from '../palette';
import type { Ambience } from '../atmosphere';
import { withAlpha } from '../palette';

const TAU = Math.PI * 2;

export interface ApotheosisImpact {
  readonly at: Vec2;
  readonly color: string;
  readonly radius: number;
  readonly ageMs: number;
  readonly lifeMs: number;
  readonly kind?: ApotheosisImpactKind;
  readonly facing?: number;
}

export type ApotheosisImpactKind =
  | 'pulse'
  | 'light_hit'
  | 'heavy_hit'
  | 'guard'
  | 'parry'
  | 'guard_break'
  | 'damage'
  | 'stagger'
  | 'defeat'
  | 'roar'
  | 'projectile'
  | 'power';

const hashNoise = (index: number, salt: number): number => {
  let value = (index * 374761393 + salt * 668265263) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
};

const sceneSalt = (world: World): number => {
  let hash = 2166136261;
  for (let index = 0; index < world.encounter.defId.length; index += 1) {
    hash ^= world.encounter.defId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const paintFloorScratches = (
  ctx: CanvasRenderingContext2D,
  salt: number,
  width: number,
  height: number,
  ambience: Ambience,
): void => {
  ctx.lineCap = 'round';
  for (let index = 0; index < 54; index += 1) {
    const x = hashNoise(index, salt + 31) * width;
    const y = height * (0.34 + hashNoise(index, salt + 37) * 0.64);
    const length = 8 + hashNoise(index, salt + 41) * 42;
    const lean = (hashNoise(index, salt + 43) - 0.5) * 13;
    ctx.strokeStyle = withAlpha(index % 9 === 0 ? ambience.key : ambience.fill, index % 9 === 0 ? 0.12 : 0.045);
    ctx.lineWidth = index % 11 === 0 ? 1.2 : 0.55;
    ctx.beginPath();
    ctx.moveTo(x - length * 0.5, y - lean);
    ctx.lineTo(x + length * 0.5, y + lean);
    ctx.stroke();
  }
};

let scratchCanvas: HTMLCanvasElement | null = null;
let scratchKey = '';

const rasterScale = (ctx: CanvasRenderingContext2D): number => {
  if (typeof ctx.getTransform !== 'function') return 1;
  const transform = ctx.getTransform();
  const scale = Math.hypot(transform.a, transform.b);
  return Number.isFinite(scale) && scale > 0 ? Math.min(4, scale) : 1;
};

const ensureScratches = (
  salt: number,
  width: number,
  height: number,
  scale: number,
  ambience: Ambience,
): HTMLCanvasElement | null => {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const key = `${salt}|${w}x${h}|${ambience.key}|${ambience.fill}`;
  if (scratchCanvas !== null && scratchKey === key) return scratchCanvas;

  const canvas = scratchCanvas ?? document.createElement('canvas');
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const context = canvas.getContext('2d');
  if (context === null) return null;

  context.setTransform(w / width, 0, 0, h / height, 0, 0);
  context.clearRect(0, 0, width, height);
  context.globalCompositeOperation = 'screen';
  paintFloorScratches(context, salt, width, height, ambience);

  scratchCanvas = canvas;
  scratchKey = key;
  return canvas;
};

export const drawCinematicFloor = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  pal: Palette,
  ambience: Ambience,
  cachedDetail = false,
): void => {
  const salt = sceneSalt(world);

  ctx.save();

  const glaze = ctx.createLinearGradient(0, cam.height * 0.18, 0, cam.height * 0.96);
  glaze.addColorStop(0, withAlpha(ambience.fill, 0.2));
  glaze.addColorStop(0.42, withAlpha(ambience.skyHorizon, 0.07));
  glaze.addColorStop(0.7, withAlpha(pal.floor, 0));
  glaze.addColorStop(1, 'rgba(0, 0, 0, 0.32)');
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = glaze;
  ctx.fillRect(0, 0, cam.width, cam.height);

  ctx.globalCompositeOperation = 'soft-light';
  for (let index = 0; index < 18; index += 1) {
    const x = hashNoise(index, salt) * cam.width;
    const y = cam.height * (0.35 + hashNoise(index, salt + 7) * 0.62);
    const radius = cam.width * (0.08 + hashNoise(index, salt + 13) * 0.16);
    const bloom = ctx.createRadialGradient(x, y, 0, x, y, radius);
    const warm = hashNoise(index, salt + 19) > 0.72;
    bloom.addColorStop(0, withAlpha(warm ? ambience.key : ambience.fill, warm ? 0.09 : 0.055));
    bloom.addColorStop(1, withAlpha(pal.floor, 0));
    ctx.fillStyle = bloom;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  ctx.globalCompositeOperation = 'screen';
  const scratches = cachedDetail
    ? ensureScratches(salt, cam.width, cam.height, rasterScale(ctx), ambience)
    : null;
  if (scratches !== null) {
    ctx.drawImage(scratches, 0, 0, cam.width, cam.height);
  } else {
    paintFloorScratches(ctx, salt, cam.width, cam.height, ambience);
  }

  for (const king of world.players) {
    const at = worldToScreen(cam, king.pos);
    const radius = 58 * cam.zoom;
    const pool = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius);
    pool.addColorStop(0, withAlpha(pal.playerAccent, 0.12));
    pool.addColorStop(0.35, withAlpha(pal.playerAccent, 0.045));
    pool.addColorStop(1, withAlpha(pal.playerAccent, 0));
    ctx.fillStyle = pool;
    ctx.fillRect(at.x - radius, at.y - radius, radius * 2, radius * 2);
  }

  ctx.restore();
};

export const drawCinematicFoundation = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  vertices: readonly Vec2[],
  pal: Palette,
  ambience: Ambience,
): void => {
  if (vertices.length < 3) return;
  const top = vertices.map((vertex) => worldToScreen(cam, vertex));
  const drop = Math.max(9, 18 * cam.zoom);

  ctx.save();
  ctx.filter = `blur(${Math.max(6, 13 * cam.zoom)}px)`;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.beginPath();
  ctx.moveTo(top[0].x + 14 * cam.zoom, top[0].y + drop + 12 * cam.zoom);
  for (let index = 1; index < top.length; index += 1) {
    ctx.lineTo(top[index].x + 14 * cam.zoom, top[index].y + drop + 12 * cam.zoom);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  for (let index = 0; index < top.length; index += 1) {
    const a = top[index];
    const b = top[(index + 1) % top.length];
    const near = vertices[index].x + vertices[index].y;
    const nearNext =
      vertices[(index + 1) % vertices.length].x + vertices[(index + 1) % vertices.length].y;
    const depth = (near + nearNext) * 0.5;
    const shade = Math.max(0.38, Math.min(0.78, 0.58 + depth * 0.012));
    const face = ctx.createLinearGradient(a.x, a.y, b.x, b.y + drop);
    face.addColorStop(0, withAlpha(pal.wall, shade));
    face.addColorStop(1, withAlpha(ambience.skyLow, 0.96));
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(b.x, b.y + drop);
    ctx.lineTo(a.x, a.y + drop);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = withAlpha(ambience.key, depth > 0 ? 0.17 : 0.06);
    ctx.lineWidth = Math.max(0.7, cam.zoom);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y + drop * 0.78);
    ctx.lineTo(b.x, b.y + drop * 0.78);
    ctx.stroke();
  }
  ctx.restore();
};

const SHADOW_TILT = 0.18;
const SHADOW_ALPHA = 0.52;

interface ContactShadowRaster {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

const contactShadows = new Map<string, ContactShadowRaster>();

const ensureContactShadow = (
  rx: number,
  ry: number,
  blur: number,
  scale: number,
): ContactShadowRaster | null => {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const half = (value: number): number => Math.round(value * 2) / 2;
  const [qrx, qry, qblur] = [half(rx), half(ry), half(blur)];
  const key = `${qrx}:${qry}:${qblur}:${Math.round(scale * 100)}`;
  const cached = contactShadows.get(key);
  if (cached !== undefined) return cached;

  const pad = Math.ceil(qblur * 3);
  const width = Math.ceil((qrx + pad) * 2);
  const height = Math.ceil((qry + pad) * 2);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const context = canvas.getContext('2d');
  if (context === null) return null;
  context.scale(scale, scale);
  context.filter = `blur(${qblur}px)`;
  context.fillStyle = `rgba(0, 0, 0, ${SHADOW_ALPHA})`;
  context.beginPath();
  context.ellipse(width / 2, height / 2, qrx, qry, SHADOW_TILT, 0, TAU);
  context.fill();

  if (contactShadows.size >= 64) contactShadows.clear();
  const raster = { canvas, width, height };
  contactShadows.set(key, raster);
  return raster;
};

export const drawCinematicGrounding = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  at: Vec2,
  radius: number,
  color: string,
  strength = 1,
  cachedShadow = false,
): void => {
  const point = worldToScreen(cam, at);
  const ellipse = groundEllipse(cam, radius);
  const rx = ellipse.rx * 2.15;
  const ry = ellipse.ry * 1.05;
  const blur = Math.max(2, 5 * cam.zoom);
  const shadowX = point.x + 13 * cam.zoom;
  const shadowY = point.y + 7 * cam.zoom;
  const raster = cachedShadow ? ensureContactShadow(rx, ry, blur, rasterScale(ctx)) : null;

  ctx.save();
  ctx.globalAlpha = 0.72 * strength;
  if (raster === null) {
    ctx.filter = `blur(${blur}px)`;
    ctx.fillStyle = `rgba(0, 0, 0, ${SHADOW_ALPHA})`;
    ctx.beginPath();
    ctx.ellipse(shadowX, shadowY, rx, ry, SHADOW_TILT, 0, TAU);
    ctx.fill();
  } else {
    ctx.drawImage(
      raster.canvas,
      shadowX - raster.width / 2,
      shadowY - raster.height / 2,
      raster.width,
      raster.height,
    );
  }
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const bounceRadius = Math.max(16, ellipse.rx * 2.6);
  const bounce = ctx.createRadialGradient(
    point.x,
    point.y,
    0,
    point.x,
    point.y,
    bounceRadius,
  );
  bounce.addColorStop(0, withAlpha(color, 0.15 * strength));
  bounce.addColorStop(0.42, withAlpha(color, 0.045 * strength));
  bounce.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = bounce;
  ctx.fillRect(
    point.x - bounceRadius,
    point.y - bounceRadius,
    bounceRadius * 2,
    bounceRadius * 2,
  );
  ctx.restore();
};

export const drawBladeCrescent = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  at: Vec2,
  facing: number,
  range: number,
  arcDeg: number,
  color: string,
  strength = 1,
): void => {
  const half = (arcDeg * Math.PI) / 360;
  const steps = Math.max(10, Math.ceil(arcDeg / 5));
  const points: Vec2[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = facing - half + (index / steps) * half * 2;
    points.push({
      x: at.x + Math.cos(angle) * range,
      y: at.y + Math.sin(angle) * range,
    });
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 16 * cam.zoom * strength;

  for (const [width, alpha] of [
    [8, 0.12],
    [3.2, 0.48],
    [1.1, 0.96],
  ] as const) {
    ctx.beginPath();
    const first = worldToScreen(cam, points[0]);
    ctx.moveTo(first.x, first.y - 7 * cam.zoom);
    for (let index = 1; index < points.length; index += 1) {
      const point = worldToScreen(cam, points[index]);
      ctx.lineTo(point.x, point.y - (7 + Math.sin((index / steps) * Math.PI) * 14) * cam.zoom);
    }
    ctx.strokeStyle = withAlpha(color, alpha * strength);
    ctx.lineWidth = Math.max(0.7, width * cam.zoom * strength);
    ctx.stroke();
  }

  ctx.shadowBlur = 8 * cam.zoom;
  ctx.fillStyle = withAlpha(color, 0.72 * strength);
  for (let index = 2; index < points.length - 1; index += 3) {
    const point = worldToScreen(cam, points[index]);
    const direction = index % 2 === 0 ? -1 : 1;
    const size = (2.5 + (index % 4)) * cam.zoom * strength;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y - 10 * cam.zoom);
    ctx.lineTo(point.x + direction * size * 2.2, point.y - size * 2.5);
    ctx.lineTo(point.x + direction * size * 0.35, point.y + size);
    ctx.lineTo(point.x - direction * size * 0.5, point.y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
};

let bloomCanvas: HTMLCanvasElement | null = null;
let bloomContext: CanvasRenderingContext2D | null = null;
let grainCanvas: HTMLCanvasElement | null = null;

const ensureBloom = (width: number, height: number): CanvasRenderingContext2D | null => {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const w = Math.max(1, Math.round(width * 0.5));
  const h = Math.max(1, Math.round(height * 0.5));
  if (bloomCanvas === null) {
    bloomCanvas = document.createElement('canvas');
    bloomContext = bloomCanvas.getContext('2d');
  }
  if (bloomContext === null) return null;
  if (bloomCanvas.width !== w || bloomCanvas.height !== h) {
    bloomCanvas.width = w;
    bloomCanvas.height = h;
  }
  return bloomContext;
};

const blurBuffers: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }[] = [];

const ensureBlurBuffer = (
  slot: number,
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } | null => {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  let buffer = blurBuffers[slot];
  if (buffer === undefined) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context === null) return null;
    buffer = { canvas, context };
    blurBuffers[slot] = buffer;
  }
  if (buffer.canvas.width !== width) buffer.canvas.width = width;
  if (buffer.canvas.height !== height) buffer.canvas.height = height;
  return buffer;
};

const bufferedBloom = (
  ctx: CanvasRenderingContext2D,
  graded: HTMLCanvasElement,
  sourceWidth: number,
  narrowRadius: number,
  wideRadius: number,
): { narrow: HTMLCanvasElement; wide: HTMLCanvasElement } | null => {
  const narrow = ensureBlurBuffer(0, graded.width, graded.height);
  const wide = ensureBlurBuffer(1, graded.width, graded.height);
  if (narrow === null || wide === null) return null;

  const scale = (graded.width / Math.max(1, sourceWidth)) * rasterScale(ctx);
  for (const [buffer, radius, saturation] of [
    [narrow, narrowRadius, 1.35],
    [wide, wideRadius, 1.8],
  ] as const) {
    buffer.context.save();
    buffer.context.setTransform(1, 0, 0, 1, 0, 0);
    buffer.context.clearRect(0, 0, buffer.canvas.width, buffer.canvas.height);
    buffer.context.filter = `blur(${radius * scale}px) saturate(${saturation})`;
    buffer.context.drawImage(graded, 0, 0);
    buffer.context.restore();
  }
  return { narrow: narrow.canvas, wide: wide.canvas };
};

const ensureGrain = (): HTMLCanvasElement | null => {
  if (grainCanvas !== null) return grainCanvas;
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context === null || typeof context.createImageData !== 'function') return null;
  const image = context.createImageData(canvas.width, canvas.height);
  if (image === undefined || image.data === undefined) return null;
  for (let index = 0; index < canvas.width * canvas.height; index += 1) {
    const value = Math.round(hashNoise(index, 991) * 255);
    const offset = index * 4;
    image.data[offset] = value;
    image.data[offset + 1] = value;
    image.data[offset + 2] = value;
    image.data[offset + 3] = 42;
  }
  context.putImageData(image, 0, 0);
  grainCanvas = canvas;
  return grainCanvas;
};

export const drawCinematicPost = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  ambience: Ambience,
  timeMs: number,
  focusStrength: number,
  lowResBlur = false,
): void => {
  const source = ctx.canvas;
  const bloom = ensureBloom(cam.width, cam.height);

  if (
    bloom !== null &&
    bloomCanvas !== null &&
    source !== undefined &&
    source.width > 0 &&
    source.height > 0
  ) {
    bloom.save();
    bloom.setTransform(1, 0, 0, 1, 0, 0);
    bloom.clearRect(0, 0, bloomCanvas.width, bloomCanvas.height);
    bloom.filter = 'brightness(1.55) contrast(1.55) saturate(1.6)';
    bloom.drawImage(
      source,
      0,
      0,
      source.width,
      source.height,
      0,
      0,
      bloomCanvas.width,
      bloomCanvas.height,
    );
    bloom.restore();

    const narrowRadius = 7 + focusStrength * 5;
    const wideRadius = 22 + focusStrength * 10;
    const buffered = lowResBlur
      ? bufferedBloom(ctx, bloomCanvas, source.width, narrowRadius, wideRadius)
      : null;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.22 + focusStrength * 0.08;
    if (buffered === null) {
      ctx.filter = `blur(${narrowRadius}px) saturate(1.35)`;
      ctx.drawImage(bloomCanvas, 0, 0, cam.width, cam.height);
      ctx.globalAlpha = 0.09 + focusStrength * 0.05;
      ctx.filter = `blur(${wideRadius}px) saturate(1.8)`;
      ctx.drawImage(bloomCanvas, 0, 0, cam.width, cam.height);
    } else {
      ctx.drawImage(buffered.narrow, 0, 0, cam.width, cam.height);
      ctx.globalAlpha = 0.09 + focusStrength * 0.05;
      ctx.drawImage(buffered.wide, 0, 0, cam.width, cam.height);
    }
    ctx.restore();
  }

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const sway = Math.sin(timeMs / 4200) * cam.width * 0.018;
  const shafts = ctx.createLinearGradient(0, 0, cam.width, cam.height);
  shafts.addColorStop(0, withAlpha(ambience.fill, 0));
  shafts.addColorStop(0.38, withAlpha(ambience.fill, 0.055));
  shafts.addColorStop(0.52, withAlpha(ambience.key, 0.025));
  shafts.addColorStop(0.72, withAlpha(ambience.fill, 0));
  ctx.fillStyle = shafts;
  ctx.beginPath();
  ctx.moveTo(cam.width * 0.08 + sway, 0);
  ctx.lineTo(cam.width * 0.42 + sway, 0);
  ctx.lineTo(cam.width * 0.78 - sway, cam.height);
  ctx.lineTo(cam.width * 0.52 - sway, cam.height);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cam.width * 0.66 - sway, 0);
  ctx.lineTo(cam.width * 0.78 - sway, 0);
  ctx.lineTo(cam.width * 0.58 + sway, cam.height);
  ctx.lineTo(cam.width * 0.48 + sway, cam.height);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  const grade = ctx.createRadialGradient(
    cam.width * 0.5,
    cam.height * 0.48,
    Math.min(cam.width, cam.height) * 0.08,
    cam.width * 0.5,
    cam.height * 0.5,
    Math.hypot(cam.width, cam.height) * 0.62,
  );
  grade.addColorStop(0, withAlpha(ambience.key, 0.12));
  grade.addColorStop(0.42, 'rgba(12, 15, 28, 0.02)');
  grade.addColorStop(1, 'rgba(2, 3, 10, 0.58)');
  ctx.fillStyle = grade;
  ctx.fillRect(0, 0, cam.width, cam.height);

  const grain = ensureGrain();
  if (grain !== null && typeof ctx.createPattern === 'function') {
    const pattern = ctx.createPattern(grain, 'repeat');
    if (pattern !== null) {
      const travel = Math.floor(timeMs / 90) % 128;
      ctx.globalAlpha = 0.075;
      ctx.globalCompositeOperation = 'overlay';
      ctx.translate(travel, -travel);
      ctx.fillStyle = pattern;
      ctx.fillRect(-travel, travel, cam.width + 128, cam.height + 128);
    }
  }
  ctx.restore();
};

export const drawCinematicImpactStars = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  flashes: readonly ApotheosisImpact[],
): void => {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const flash of flashes) {
    const kind = flash.kind ?? 'pulse';
    const t = flash.ageMs / flash.lifeMs;
    const fade = (1 - t) * (1 - t);
    const point = worldToScreen(cam, flash.at);
    const centre = { x: point.x, y: point.y - 12 * cam.zoom };
    const scale =
      kind === 'parry'
        ? 1.28
        : kind === 'heavy_hit' || kind === 'roar'
          ? 1.12
          : kind === 'guard'
            ? 0.72
            : 1;
    const reach =
      (18 + flash.radius * 18) * (0.5 + t * 0.85) * cam.zoom * scale;

    const halo = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, reach);
    halo.addColorStop(0, flash.color);
    halo.addColorStop(0.1, flash.color);
    halo.addColorStop(kind === 'parry' ? 0.28 : 0.18, withAlpha(flash.color, 0.22));
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalAlpha = (kind === 'guard' ? 0.12 : kind === 'parry' ? 0.32 : 0.22) * fade;
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, reach, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = flash.color;
    ctx.shadowColor = flash.color;
    ctx.shadowBlur = (kind === 'parry' ? 16 : 10) * cam.zoom;
    ctx.lineCap = 'round';

    if (kind === 'guard') {
      ctx.globalAlpha = 0.68 * fade;
      ctx.lineWidth = Math.max(1, 3.2 * cam.zoom * fade);
      ctx.beginPath();
      ctx.ellipse(centre.x, centre.y, reach * 0.62, reach * 0.88, 0, -Math.PI * 0.78, Math.PI * 0.78);
      ctx.stroke();
      ctx.globalAlpha = 0.2 * fade;
      ctx.lineWidth = Math.max(2, 8 * cam.zoom * fade);
      ctx.stroke();
    } else if (kind === 'parry') {
      const forward = worldToScreen(cam, {
        x: flash.at.x + Math.cos(flash.facing ?? 0),
        y: flash.at.y + Math.sin(flash.facing ?? 0),
      });
      const angle = Math.atan2(forward.y - point.y, forward.x - point.x);
      ctx.save();
      ctx.translate(centre.x, centre.y);
      ctx.rotate(angle);
      ctx.globalAlpha = 0.2 * fade;
      ctx.lineWidth = Math.max(3, 10 * cam.zoom * fade);
      ctx.beginPath();
      ctx.moveTo(-reach * 0.92, reach * 0.22);
      ctx.quadraticCurveTo(-reach * 0.08, -reach * 0.95, reach * 0.16, 0);
      ctx.moveTo(-reach * 0.58, -reach * 0.72);
      ctx.quadraticCurveTo(reach * 0.58, -reach * 0.18, reach * 0.16, 0);
      ctx.stroke();
      ctx.globalAlpha = 0.94 * fade;
      ctx.lineWidth = Math.max(0.8, 2.4 * cam.zoom * fade);
      ctx.stroke();
      ctx.restore();
    } else if (kind === 'guard_break' || kind === 'damage') {
      ctx.lineWidth = Math.max(1, (kind === 'guard_break' ? 3 : 2) * cam.zoom * fade);
      for (let segment = 0; segment < 7; segment += 1) {
        const from = (segment / 7) * TAU + 0.08;
        const to = ((segment + 0.62) / 7) * TAU;
        ctx.globalAlpha = (kind === 'guard_break' ? 0.9 : 0.58) * fade;
        ctx.beginPath();
        ctx.arc(centre.x, centre.y, reach * 0.58, from, to);
        ctx.stroke();
      }
    } else if (kind === 'stagger' || kind === 'defeat') {
      const pieces = kind === 'defeat' ? 9 : 6;
      ctx.fillStyle = flash.color;
      for (let piece = 0; piece < pieces; piece += 1) {
        const angle = (piece / pieces) * TAU + flash.at.x * 0.13;
        const inner = reach * 0.34;
        const outer = reach * (0.5 + (piece % 3) * 0.08);
        const sink = t * reach * 0.34;
        ctx.globalAlpha = (0.7 - (piece % 2) * 0.18) * fade;
        ctx.beginPath();
        ctx.moveTo(
          centre.x + Math.cos(angle) * inner,
          centre.y + Math.sin(angle) * inner * 0.62 + sink,
        );
        ctx.lineTo(
          centre.x + Math.cos(angle - 0.08) * outer,
          centre.y + Math.sin(angle - 0.08) * outer * 0.62 + sink,
        );
        ctx.lineTo(
          centre.x + Math.cos(angle + 0.1) * outer * 0.78,
          centre.y + Math.sin(angle + 0.1) * outer * 0.62 + sink + 5 * cam.zoom,
        );
        ctx.closePath();
        ctx.fill();
      }
    } else if (kind === 'roar') {
      ctx.globalAlpha = 0.72 * fade;
      ctx.lineWidth = Math.max(1, 3.4 * cam.zoom * fade);
      ctx.beginPath();
      ctx.ellipse(centre.x, centre.y + 10 * cam.zoom, reach, reach * 0.48, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.22 * fade;
      ctx.lineWidth = Math.max(1, 7 * cam.zoom * fade);
      ctx.stroke();
    } else if (kind === 'light_hit' || kind === 'heavy_hit') {
      const forward = worldToScreen(cam, {
        x: flash.at.x + Math.cos(flash.facing ?? 0),
        y: flash.at.y + Math.sin(flash.facing ?? 0),
      });
      const angle = Math.atan2(forward.y - point.y, forward.x - point.x);
      ctx.save();
      ctx.translate(centre.x, centre.y);
      ctx.rotate(angle);
      ctx.globalAlpha = (kind === 'heavy_hit' ? 0.88 : 0.64) * fade;
      ctx.lineWidth = Math.max(0.8, (kind === 'heavy_hit' ? 5.2 : 2.4) * cam.zoom * fade);
      ctx.beginPath();
      ctx.moveTo(-reach * 0.76, reach * 0.32);
      ctx.quadraticCurveTo(-reach * 0.08, -reach * 0.74, reach * 0.4, -reach * 0.08);
      ctx.stroke();
      ctx.restore();
    }

    const rayCount =
      kind === 'parry'
        ? 14
        : kind === 'heavy_hit' || kind === 'roar'
          ? 12
          : kind === 'guard'
            ? 4
            : kind === 'light_hit' || kind === 'projectile'
              ? 6
              : 9;
    for (let ray = 0; ray < rayCount; ray += 1) {
      const angle =
        (ray / rayCount) * TAU +
        (flash.at.x * 0.17 + flash.at.y * 0.11) +
        (flash.facing ?? 0) * 0.13;
      const long = ray % (kind === 'parry' ? 4 : 3) === 0;
      const inner = reach * (long ? 0.08 : 0.16);
      const outer = reach * (long ? 1 : 0.44 + ((ray * 7) % 5) * 0.07);
      ctx.globalAlpha = fade * (long ? (kind === 'guard' ? 0.3 : 0.9) : 0.5);
      ctx.lineWidth = Math.max(
        0.7,
        (long ? (kind === 'heavy_hit' ? 2.8 : 2.2) : 1.1) * cam.zoom * fade,
      );
      ctx.beginPath();
      ctx.moveTo(
        centre.x + Math.cos(angle) * inner,
        centre.y + Math.sin(angle) * inner,
      );
      ctx.lineTo(
        centre.x + Math.cos(angle) * outer,
        centre.y + Math.sin(angle) * outer,
      );
      ctx.stroke();
    }

    const core = Math.max(2, (kind === 'parry' ? 9 : 6) * cam.zoom * fade);
    ctx.globalAlpha = Math.min(1, fade * 1.2);
    ctx.fillStyle = '#fff9dc';
    ctx.beginPath();
    ctx.moveTo(centre.x, centre.y - core * 1.8);
    ctx.lineTo(centre.x + core, centre.y);
    ctx.lineTo(centre.x, centre.y + core * 1.8);
    ctx.lineTo(centre.x - core, centre.y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
};
