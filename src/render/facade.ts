
import type { Vec2 } from '../sim/types';
import type { Camera } from './iso';
import { worldToScreenAtElevation } from './iso';

export const ROOM_WALL_HEIGHT = 5.4;
export const WALL_HEIGHT = ROOM_WALL_HEIGHT;
export const WALL_THICKNESS = 0.46;
export const WALL_INSET = 0.12;
export const PLINTH_DROP = 0.55;

export type WindowStyle = 'court' | 'lancet' | 'defensive';

interface WindowProfile {
  width: number;
  sill: number;
  head: number;
  apex: number;
  transoms: readonly number[];
}

const WINDOW_PROFILES: Readonly<Record<WindowStyle, WindowProfile>> = {
  court: { width: 1.5, sill: 0.9, head: 3.7, apex: 4.55, transoms: [1 / 3, 2 / 3] },
  lancet: { width: 1.2, sill: 0.78, head: 3.35, apex: 4.82, transoms: [0.48] },
  defensive: { width: 0.72, sill: 1.34, head: 3.9, apex: 4.3, transoms: [0.55] },
};
const WINDOW_MARGIN = 1.3;
export const WINDOW_MIN_ZOOM = 0.34;
export const ARCH_SEGMENTS = 6;
const OPENINGS_PER_BAY = 2;
const PILASTER_HALF = 0.24;
export const PILASTER_RELIEF = 0.22;
export const COURSE_STEP = 0.6;
const COURSE_LIP = 0.09;
export const COURSE_RELIEF = 0.07;
const COURSE_END_INSET = PILASTER_HALF + COURSE_RELIEF;
export const ARCHITRAVE_RELIEF = 0.13;
export const SILL_RELIEF = 0.2;
const SILL_DROP = 0.2;
export const REVEAL_DEPTH = 0.34;
const MULLION_HALF = 0.055;
const TRANSOM_HALF = 0.045;
export const TRACERY_RELIEF = 0.09;
const BASE_COURSE_HEIGHT = 0.62;
export const BASE_COURSE_RELIEF = 0.18;
const CORNICE_HEIGHT = 0.34;
export const CORNICE_RELIEF = 0.24;
export const ARCHITRAVE_SCALE = 1.2;
export const GLAZING_SCALE = 0.66;


export interface FacadeWall {
  a: Vec2;
  b: Vec2;
  outward: Vec2;
}

export interface WindowBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface WallLayout {
  length: number;
  openings: number[];
  pilasters: number[];
}

export const layOutWall = (
  wall: FacadeWall,
  spacing: number,
  style: WindowStyle = 'court',
): WallLayout => {
  const profile = WINDOW_PROFILES[style];
  const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
  const cornerClearance = Math.max(WINDOW_MARGIN, spacing * 0.45);
  const usable = length - cornerClearance * 2;
  if (length <= 0 || usable < profile.width || length < spacing * 1.5) {
    return { length, openings: [], pilasters: [] };
  }

  const count = Math.floor(usable / spacing) + 1;
  const start = (length - (count - 1) * spacing) / 2;
  const openings = Array.from({ length: count }, (_, i) => start + i * spacing);

  const pilasters = [start - spacing / 2, start + (count - 1) * spacing + spacing / 2];
  for (let i = OPENINGS_PER_BAY; i < count; i += OPENINGS_PER_BAY) {
    pilasters.push(start + (i - 0.5) * spacing);
  }
  return { length, openings, pilasters };
};

const screenPointInside = (point: Vec2, polygon: readonly Vec2[]): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
};

export interface WallFace {
  wall: FacadeWall;
  layout: WallLayout;
}

export const visibleWallLayout = (
  cam: Camera,
  wall: FacadeWall,
  spacing: number,
  floor: readonly Vec2[],
  style: WindowStyle = 'court',
): WallLayout => {
  const profile = WINDOW_PROFILES[style];
  const layout = layOutWall(wall, spacing, style);
  const half = profile.width / 2;
  const openings = layout.openings.filter((centre) => {
    const samples = [
      facadePoint(cam, wall, layout.length, centre, profile.sill, 0),
      facadePoint(cam, wall, layout.length, centre - half, profile.head, 0),
      facadePoint(cam, wall, layout.length, centre, profile.apex, 0),
      facadePoint(cam, wall, layout.length, centre + half, profile.head, 0),
    ];
    return samples.every((point) => !screenPointInside(point, floor));
  });
  return { ...layout, openings };
};

export const facadePoint = (
  cam: Camera,
  wall: FacadeWall,
  length: number,
  distance: number,
  elevation: number,
  relief: number,
): Vec2 =>
  worldToScreenAtElevation(
    cam,
    {
      x: wall.a.x + ((wall.b.x - wall.a.x) / length) * distance - wall.outward.x * relief,
      y: wall.a.y + ((wall.b.y - wall.a.y) / length) * distance - wall.outward.y * relief,
    },
    elevation,
  );

export const traceFacadeQuad = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  wall: FacadeWall,
  length: number,
  from: number,
  to: number,
  low: number,
  high: number,
  relief: number,
): void => {
  const corners = [
    facadePoint(cam, wall, length, from, low, relief),
    facadePoint(cam, wall, length, to, low, relief),
    facadePoint(cam, wall, length, to, high, relief),
    facadePoint(cam, wall, length, from, high, relief),
  ];
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
};

export const fillRelieved = (
  ctx: CanvasRenderingContext2D,
  trace: (relief: number) => void,
  relief: number,
  edge: string,
  face: string,
): void => {
  trace(0);
  ctx.fillStyle = edge;
  ctx.fill();
  trace(relief);
  ctx.fillStyle = face;
  ctx.fill();
};

export const traceOpenings = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  faces: readonly WallFace[],
  scale: number,
  relief: number,
  style: WindowStyle = 'court',
): WindowBounds | null => {
  const profile = WINDOW_PROFILES[style];
  let bounds: WindowBounds | null = null;
  const mark = (point: Vec2): Vec2 => {
    bounds =
      bounds === null
        ? { minX: point.x, minY: point.y, maxX: point.x, maxY: point.y }
        : {
            minX: Math.min(bounds.minX, point.x),
            minY: Math.min(bounds.minY, point.y),
            maxX: Math.max(bounds.maxX, point.x),
            maxY: Math.max(bounds.maxY, point.y),
          };
    return point;
  };

  ctx.beginPath();
  for (const { wall, layout } of faces) {
    const at = (distance: number, elevation: number) =>
      mark(facadePoint(cam, wall, layout.length, distance, elevation, relief));

    const middle = (profile.sill + profile.apex) / 2;
    const half = (profile.width / 2) * scale;
    const sill = middle + (profile.sill - middle) * scale;
    const head = middle + (profile.head - middle) * scale;
    const apex = middle + (profile.apex - middle) * scale;

    for (const centre of layout.openings) {
      const left = at(centre - half, sill);
      ctx.moveTo(left.x, left.y);
      const right = at(centre + half, sill);
      ctx.lineTo(right.x, right.y);
      const headRight = at(centre + half, head);
      ctx.lineTo(headRight.x, headRight.y);

      for (let step = 1; step < ARCH_SEGMENTS; step++) {
        const angle = (step / ARCH_SEGMENTS) * Math.PI;
        const point = at(centre + half * Math.cos(angle), head + (apex - head) * Math.sin(angle));
        ctx.lineTo(point.x, point.y);
      }
      const headLeft = at(centre - half, head);
      ctx.lineTo(headLeft.x, headLeft.y);
      ctx.closePath();
    }
  }
  return bounds;
};

export const traceCourses = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  walls: readonly FacadeWall[],
  minimumLength: number,
  relief: number,
): void => {
  ctx.beginPath();
  for (const wall of walls) {
    const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
    if (length < minimumLength) continue;
    for (let elevation = COURSE_STEP; elevation < WALL_HEIGHT; elevation += COURSE_STEP) {
      traceFacadeQuad(
        ctx,
        cam,
        wall,
        length,
        COURSE_END_INSET,
        length - COURSE_END_INSET,
        elevation,
        elevation + COURSE_LIP,
        relief,
      );
    }
  }
};

export const traceBaseCourse = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  walls: readonly FacadeWall[],
  relief: number,
): void => {
  ctx.beginPath();
  for (const wall of walls) {
    const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
    if (length <= 0) continue;
    traceFacadeQuad(ctx, cam, wall, length, 0, length, 0, BASE_COURSE_HEIGHT, relief);
  }
};

export const traceCornice = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  walls: readonly FacadeWall[],
  relief: number,
): void => {
  ctx.beginPath();
  for (const wall of walls) {
    const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
    if (length <= 0) continue;
    traceFacadeQuad(
      ctx,
      cam,
      wall,
      length,
      0,
      length,
      WALL_HEIGHT - CORNICE_HEIGHT,
      WALL_HEIGHT,
      relief,
    );
  }
};

export const tracePilasters = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  faces: readonly WallFace[],
  relief: number,
): void => {
  ctx.beginPath();
  for (const { wall, layout } of faces) {
    for (const centre of layout.pilasters) {
      if (centre < 0 || centre > layout.length) continue;
      traceFacadeQuad(
        ctx,
        cam,
        wall,
        layout.length,
        centre - PILASTER_HALF,
        centre + PILASTER_HALF,
        0,
        WALL_HEIGHT - CORNICE_HEIGHT,
        relief,
      );
    }
  }
};

export const traceSills = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  faces: readonly WallFace[],
  relief: number,
  style: WindowStyle = 'court',
): void => {
  const profile = WINDOW_PROFILES[style];
  const half = (profile.width / 2) * ARCHITRAVE_SCALE;
  ctx.beginPath();
  for (const { wall, layout } of faces) {
    for (const centre of layout.openings) {
      traceFacadeQuad(
        ctx,
        cam,
        wall,
        layout.length,
        centre - half,
        centre + half,
        profile.sill - SILL_DROP,
        profile.sill,
        relief,
      );
    }
  }
};

export const traceTracery = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  faces: readonly WallFace[],
  relief: number,
  style: WindowStyle = 'court',
): void => {
  const profile = WINDOW_PROFILES[style];
  const half = profile.width / 2;
  const transoms = profile.transoms.map(
    (fraction) => profile.sill + (profile.head - profile.sill) * fraction,
  );
  ctx.beginPath();
  for (const { wall, layout } of faces) {
    for (const centre of layout.openings) {
      traceFacadeQuad(
        ctx,
        cam,
        wall,
        layout.length,
        centre - MULLION_HALF,
        centre + MULLION_HALF,
        profile.sill,
        profile.apex,
        relief,
      );
      for (const transom of transoms) {
        traceFacadeQuad(
          ctx,
          cam,
          wall,
          layout.length,
          centre - half,
          centre + half,
          transom - TRANSOM_HALF,
          transom + TRANSOM_HALF,
          relief,
        );
      }
    }
  }
};
