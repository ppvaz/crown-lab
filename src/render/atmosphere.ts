
import type { Vec2, World } from '../sim/types';
import { arenaVertices } from '../sim/arena';
import type { Camera } from './iso';
import { withAlpha } from './palette';
import type { RoomRegistry } from './rooms/theme';
import { ISO_X, ISO_Y, worldToScreenAtElevation } from './iso';
import type { Ambience } from './ambience';
import { hashNoise } from './ambience';

export { ROOM_WALL_HEIGHT } from './facade';

export type { Ambience } from './ambience';
export { ambienceFor, hashNoise } from './ambience';
export { drawSky, drawParallax } from './sky';
export type { MazePortalDirection } from './room-shell';
export { drawRoomShell, wallFootprint } from './room-shell';

export interface LightSource {
  at: Vec2;
  radius: number;
  strength: number;
}

export const lightsFor = (
  world: World,
  braziers: readonly Vec2[],
): LightSource[] => {
  const lights: LightSource[] = braziers.map((at) => ({ at, radius: 4.2, strength: 0.8 }));
  for (const player of world.players) {
    lights.push({ at: player.pos, radius: 4, strength: 0.5 });
  }
  return lights;
};

export const drawFloorLight = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  ambience: Ambience,
  lights: readonly LightSource[],
  timeMs: number,
): void => {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < lights.length; i++) {
    const light = lights[i];
    const centre = worldToScreenAtElevation(cam, light.at, 0);
    const flicker =
      1 + 0.055 * Math.sin(timeMs / 190 + i * 2.1) + 0.03 * Math.sin(timeMs / 71 + i * 5.7);
    const rx = light.radius * 34 * cam.zoom * Math.SQRT2 * flicker;
    const ry = light.radius * 17 * cam.zoom * Math.SQRT2 * flicker;
    const gradient = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, rx);
    gradient.addColorStop(0, withAlpha(ambience.key, 0.26 * light.strength));
    gradient.addColorStop(0.4, withAlpha(ambience.key, 0.075 * light.strength));
    gradient.addColorStop(1, withAlpha(ambience.key, 0));
    ctx.save();
    ctx.translate(centre.x, centre.y);
    ctx.scale(1, ry / rx);
    ctx.translate(-centre.x, -centre.y);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
};

export const drawWindowLight = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  rooms: RoomRegistry,
  ambience: Ambience,
): void => {
  if (
    rooms.themeFor(world.encounter.defId) === null ||
    ambience.windowSpacing <= 0 ||
    ambience.windowLight <= 0
  ) {
    return;
  }
  const h = world.arena.halfExtents;
  const spacing = Math.max(2.4, ambience.windowSpacing);
  const width =
    ambience.windowStyle === 'defensive'
      ? 0.24
      : ambience.windowStyle === 'lancet'
        ? 0.46
        : 0.68;
  const depth =
    ambience.windowStyle === 'defensive'
      ? 3.6
      : ambience.windowStyle === 'lancet'
        ? 5.2
        : 4.4;
  const trace = (points: readonly Vec2[]): void => {
    const first = worldToScreenAtElevation(cam, points[0], 0);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i++) {
      const point = worldToScreenAtElevation(cam, points[i], 0);
      ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();
  };

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = ambience.windowLight;
  ctx.fillStyle = ambience.fill;
  ctx.beginPath();
  for (let x = -h.x + spacing * 0.7; x < h.x - spacing * 0.45; x += spacing) {
    trace([
      { x: x - width, y: -h.y },
      { x: x + width, y: -h.y },
      { x: x + depth + width * 1.35, y: -h.y + depth },
      { x: x + depth - width * 1.35, y: -h.y + depth },
    ]);
  }
  for (let y = -h.y + spacing * 0.7; y < h.y - spacing * 0.45; y += spacing) {
    trace([
      { x: -h.x, y: y - width },
      { x: -h.x, y: y + width },
      { x: -h.x + depth, y: y + depth + width * 1.35 },
      { x: -h.x + depth, y: y + depth - width * 1.35 },
    ]);
  }
  ctx.fill();
  ctx.restore();
};

export const drawFloorFog = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  ambience: Ambience,
): void => {
  if (ambience.fog <= 0) return;
  const vertices = arenaVertices(world.arena);
  const projected = vertices.map((p) => worldToScreenAtElevation(cam, p, 0));
  const top = Math.min(...projected.map((p) => p.y));
  const bottom = Math.max(...projected.map((p) => p.y));
  const gradient = ctx.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, withAlpha(ambience.skyHorizon, ambience.fog));
  gradient.addColorStop(0.42, withAlpha(ambience.skyHorizon, ambience.fog * 0.22));
  gradient.addColorStop(1, withAlpha(ambience.skyHorizon, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, top, cam.width, bottom - top);
};

export const drawDust = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  ambience: Ambience,
  timeMs: number,
): void => {
  const count = Math.round((ambience.dust * cam.width * cam.height) / (1440 * 900));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const seedX = hashNoise(i, 1);
    const seedY = hashNoise(i, 2);
    const seedSpeed = 0.35 + hashNoise(i, 3) * 0.9;
    const seedSize = 0.6 + hashNoise(i, 4) * 1.5;
    const rise = ((timeMs * 0.006 * seedSpeed) % 1.2) - 0.1;
    const x = (seedX + Math.sin(timeMs / 2600 + i) * 0.012) * cam.width;
    const y = ((seedY - rise + 1.2) % 1.2) * cam.height;
    const twinkle = 0.28 + 0.22 * Math.sin(timeMs / 640 + i * 1.7);
    ctx.fillStyle = withAlpha(ambience.key, twinkle * 0.5);
    ctx.beginPath();
    ctx.arc(x, y, seedSize, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

export const drawRoomAir = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  rooms: RoomRegistry,
  ambience: Ambience,
  timeMs: number,
): void => {
  const theme = rooms.themeFor(world.encounter.defId);
  if (theme === null) return;
  const air = rooms.theme(theme).air;
  if (air === undefined) return;
  const centreWorld = {
    x: world.arena.halfExtents.x * air.at.x,
    y: world.arena.halfExtents.y * air.at.y,
  };
  const centre = worldToScreenAtElevation(cam, centreWorld, 1.25);
  const reachX = air.spread.x * ISO_X * cam.zoom;
  const reachY = air.spread.y * ISO_Y * cam.zoom;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  for (let i = 0; i < air.count; i++) {
    const seedX = hashNoise(i, 31);
    const seedY = hashNoise(i, 37);
    const speed = 0.42 + hashNoise(i, 41) * 0.68;
    const size = (0.7 + hashNoise(i, 43) * 1.15) * cam.zoom;

    if (air.kind === 'draft') {
      const travel = ((seedX + timeMs * 0.00008 * speed) % 1) * 2 - 1;
      const x = centre.x + travel * reachX;
      const y =
        centre.y + (seedY * 2 - 1) * reachY +
        Math.sin(timeMs / 720 + i * 1.8) * 2.5 * cam.zoom;
      const length = (6 + hashNoise(i, 47) * 8) * cam.zoom;
      ctx.moveTo(x - length, y);
      ctx.lineTo(x + length, y - 1.5 * cam.zoom);
      continue;
    }

    const direction = air.kind === 'embers' ? -1 : 1;
    const travel = (seedY + timeMs * 0.00011 * speed) % 1;
    const x =
      centre.x + (seedX * 2 - 1) * reachX +
      Math.sin(timeMs / 610 + i * 2.2) * 4 * cam.zoom;
    const y = centre.y + direction * (travel * 2 - 1) * reachY;
    ctx.moveTo(x + size, y);
    ctx.arc(x, y, size, 0, Math.PI * 2);
  }
  if (air.kind === 'draft') {
    ctx.strokeStyle = withAlpha(ambience.fill, 0.24);
    ctx.lineWidth = Math.max(0.7, cam.zoom);
    ctx.stroke();
  } else {
    ctx.fillStyle = withAlpha(air.kind === 'embers' ? ambience.key : ambience.fill, 0.34);
    ctx.fill();
  }
  ctx.restore();
};

export const drawVignette = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  ambience: Ambience,
): void => {
  const cx = cam.width / 2 + cam.offset.x;
  const cy = cam.height / 2 + cam.offset.y;
  const outer = Math.hypot(cam.width, cam.height) * 0.62;
  const gradient = ctx.createRadialGradient(cx, cy, outer * 0.34, cx, cy, outer);
  gradient.addColorStop(0, withAlpha(ambience.skyLow, 0));
  gradient.addColorStop(0.62, withAlpha(ambience.skyLow, 0.34));
  gradient.addColorStop(1, withAlpha(ambience.skyLow, 0.82));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, cam.width, cam.height);
};

export const drawFillLight = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  ambience: Ambience,
): void => {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const gradient = ctx.createLinearGradient(0, 0, 0, cam.height * 0.72);
  gradient.addColorStop(0, withAlpha(ambience.fill, 0.16));
  gradient.addColorStop(1, withAlpha(ambience.fill, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, cam.width, cam.height * 0.72);
  ctx.restore();
};

export const drawSlowMo = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  ambience: Ambience,
  strength: number,
  timeMs: number,
): void => {
  const k = Math.max(0, Math.min(1, strength));
  if (k <= 0.001) return;
  const cx = cam.width / 2 + cam.offset.x;
  const cy = cam.height / 2 + cam.offset.y;
  const reach = Math.hypot(cam.width, cam.height) * 0.62;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.1 * k;
  ctx.fillStyle = ambience.fill;
  ctx.fillRect(0, 0, cam.width, cam.height);

  ctx.globalAlpha = 0.34 * k;
  ctx.strokeStyle = withAlpha(ambience.fill, 0.9);
  ctx.lineCap = 'round';
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + hashNoise(i, 11) * 0.16;
    const inner = reach * (0.42 + hashNoise(i, 3) * 0.22);
    const length = reach * (0.18 + hashNoise(i, 5) * 0.3) * (0.7 + 0.3 * Math.sin(timeMs / 120 + i));
    ctx.lineWidth = (0.8 + hashNoise(i, 7) * 1.8) * k;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * (inner + length), cy + Math.sin(a) * (inner + length));
    ctx.stroke();
  }
  ctx.restore();

  const closing = ctx.createRadialGradient(cx, cy, reach * 0.2, cx, cy, reach);
  closing.addColorStop(0, withAlpha(ambience.skyLow, 0));
  closing.addColorStop(1, withAlpha(ambience.skyLow, 0.5 * k));
  ctx.fillStyle = closing;
  ctx.fillRect(0, 0, cam.width, cam.height);
};
