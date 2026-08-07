
import type { Arena, Vec2 } from '../sim/types';
import { arenaElevationAt } from '../sim/arena';

export const ISO_X = 34;
export const ISO_Y = 17;
export const ELEVATION_Y = 34;

export interface Camera {
  center: Vec2;
  zoom: number;
  width: number;
  height: number;
  offset: Vec2;
  shake: Vec2;
  arena: Arena | null;
}

export const makeCamera = (width: number, height: number): Camera => ({
  center: { x: 0, y: 0 },
  zoom: 1,
  width,
  height,
  offset: { x: 0, y: 0 },
  shake: { x: 0, y: 0 },
  arena: null,
});

export const worldToScreenAtElevation = (cam: Camera, p: Vec2, elevation: number): Vec2 => {
  const dx = p.x - cam.center.x;
  const dy = p.y - cam.center.y;
  return {
    x: cam.width / 2 + cam.offset.x + (dx - dy) * ISO_X * cam.zoom + cam.shake.x,
    y:
      cam.height / 2 +
      cam.offset.y +
      (dx + dy) * ISO_Y * cam.zoom +
      cam.shake.y -
      elevation * ELEVATION_Y * cam.zoom,
  };
};

export const worldToScreen = (cam: Camera, p: Vec2): Vec2 =>
  worldToScreenAtElevation(
    cam,
    p,
    cam.arena === null ? 0 : arenaElevationAt(cam.arena, p),
  );

export const screenToWorld = (cam: Camera, sx: number, sy: number): Vec2 => {
  const invert = (screenY: number): Vec2 => {
    const u = (sx - cam.width / 2 - cam.offset.x - cam.shake.x) / (ISO_X * cam.zoom);
    const v = (screenY - cam.height / 2 - cam.offset.y - cam.shake.y) / (ISO_Y * cam.zoom);
    return {
      x: cam.center.x + (u + v) / 2,
      y: cam.center.y + (v - u) / 2,
    };
  };
  let point = invert(sy);
  for (let i = 0; i < 12 && cam.arena !== null; i++) {
    const lift = arenaElevationAt(cam.arena, point) * ELEVATION_Y * cam.zoom;
    point = invert(sy + lift);
  }
  return point;
};

export const depthOf = (p: Vec2): number => p.x + p.y;

export const parallaxOffset = (cam: Camera, depth: number): Vec2 => ({
  x: -(cam.center.x - cam.center.y) * ISO_X * cam.zoom * depth,
  y: -(cam.center.x + cam.center.y) * ISO_Y * cam.zoom * depth,
});

export const CULL_MARGIN_UNITS = 14;
const CULL_HEADROOM_UNITS = 14;

export const isNearViewport = (cam: Camera, at: Vec2): boolean => {
  const screen = worldToScreen(cam, at);
  const marginX = CULL_MARGIN_UNITS * ISO_X * cam.zoom;
  const marginY = CULL_MARGIN_UNITS * ISO_Y * cam.zoom;
  const headroom = CULL_HEADROOM_UNITS * ELEVATION_Y * cam.zoom;
  return (
    screen.x >= -marginX &&
    screen.x <= cam.width + marginX &&
    screen.y >= -(marginY + headroom) &&
    screen.y <= cam.height + marginY
  );
};

export const groundEllipse = (cam: Camera, r: number): { rx: number; ry: number } => ({
  rx: r * ISO_X * cam.zoom * Math.SQRT2,
  ry: r * ISO_Y * cam.zoom * Math.SQRT2,
});

export const fitZoom = (
  cam: Camera,
  arena: Arena,
  marginPx = 90,
  into?: { w: number; h: number },
): number => {
  const h = arena.halfExtents;
  const halfW = (h.x + h.y) * ISO_X;
  const halfH = (h.x + h.y) * ISO_Y;
  const box = into ?? { w: cam.width, h: cam.height };
  const zx = (box.w / 2 - marginPx) / halfW;
  const zy = (box.h / 2 - marginPx) / halfH;
  return Math.max(0.25, Math.min(zx, zy));
};


export const READABLE_ZOOM = 0.62;

export const OVERSIZED_SPAN = 21;

export const arenaExceedsScreen = (arena: Arena): boolean =>
  arena.halfExtents.x + arena.halfExtents.y > OVERSIZED_SPAN;

export const clampCameraToArena = (
  arena: Arena,
  look: Vec2,
  zoom: number,
  into: { w: number; h: number },
  wallHeight = 0,
): Vec2 => {
  const span = arena.halfExtents.x + arena.halfExtents.y;
  const axis = (
    want: number,
    low: number,
    high: number,
    halfBox: number,
    perUnit: number,
  ): number => {
    const reach = halfBox / Math.max(1e-6, perUnit * zoom);
    if (reach * 2 >= high - low) return (low + high) / 2;
    return Math.max(low + reach, Math.min(high - reach, want));
  };
  const u = axis(look.x - look.y, -span, span, into.w / 2, ISO_X);
  const wallRise = wallHeight * (ELEVATION_Y / ISO_Y);
  const v = axis(look.x + look.y, -span - wallRise, span, into.h / 2, ISO_Y);
  return { x: (u + v) / 2, y: (v - u) / 2 };
};

export const actionBounds = (
  players: readonly Vec2[],
  enemies: readonly { pos: Vec2; reach: number }[],
): { center: Vec2; halfExtents: Vec2 } | null => {
  if (enemies.length === 0 && players.length < 2) return null;
  if (players.length === 0) return null;
  let minX = players[0].x;
  let maxX = players[0].x;
  let minY = players[0].y;
  let maxY = players[0].y;
  for (const player of players) {
    minX = Math.min(minX, player.x);
    maxX = Math.max(maxX, player.x);
    minY = Math.min(minY, player.y);
    maxY = Math.max(maxY, player.y);
  }
  for (const enemy of enemies) {
    minX = Math.min(minX, enemy.pos.x - enemy.reach);
    maxX = Math.max(maxX, enemy.pos.x + enemy.reach);
    minY = Math.min(minY, enemy.pos.y - enemy.reach);
    maxY = Math.max(maxY, enemy.pos.y + enemy.reach);
  }
  return {
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    halfExtents: {
      x: Math.max(1, (maxX - minX) / 2),
      y: Math.max(1, (maxY - minY) / 2),
    },
  };
};

const boxZoom = (
  halfExtents: Vec2,
  marginPx: number,
  into: { w: number; h: number },
): number => {
  const halfW = (halfExtents.x + halfExtents.y) * ISO_X;
  const halfH = (halfExtents.x + halfExtents.y) * ISO_Y;
  const zx = (into.w / 2 - marginPx) / Math.max(1, halfW);
  const zy = (into.h / 2 - marginPx) / Math.max(1, halfH);
  return Math.min(zx, zy);
};

export const fitActionZoom = (
  cam: Camera,
  bounds: { halfExtents: Vec2 },
  arenaZoom: number,
  marginPx: number,
  into: { w: number; h: number },
  maxZoom = 2.6,
): number => Math.max(arenaZoom, Math.min(maxZoom, boxZoom(bounds.halfExtents, marginPx, into)));


export const rosterZoom = (
  positions: readonly Vec2[],
  preferred: number,
  floor: number,
  marginPx: number,
  into: { w: number; h: number },
): number => {
  if (positions.length < 2) return preferred;
  const bounds = actionBounds(positions, []);
  if (bounds === null) return preferred;
  return Math.max(Math.min(floor, preferred), Math.min(preferred, boxZoom(bounds.halfExtents, marginPx, into)));
};

export const rosterLook = (positions: readonly Vec2[]): Vec2 => {
  if (positions.length < 2) return positions[0] ?? { x: 0, y: 0 };
  const bounds = actionBounds(positions, []);
  return bounds === null ? positions[0] : bounds.center;
};

export const cameraOffsetFor = (
  cam: Camera,
  content: { x: number; y: number; w: number; h: number },
): Vec2 => ({
  x: content.x + content.w / 2 - cam.width / 2,
  y: content.y + content.h / 2 - cam.height / 2,
});

export const gameplayViewMargin = (authoredMargin: number, touchGameplay: boolean): number =>
  touchGameplay ? Math.min(36, authoredMargin) : authoredMargin;
