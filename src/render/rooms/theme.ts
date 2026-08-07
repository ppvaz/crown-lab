
import type { Palette } from '../palette';
import type { Camera } from '../iso';
import { groundEllipse, worldToScreen } from '../iso';
import type { Vec2, World } from '../../sim/types';
import type { Ambience } from '../atmosphere';

const TAU = Math.PI * 2;

export type RoomPropKind =
  | 'column'
  | 'target'
  | 'arch'
  | 'banner'
  | 'brazier'
  | 'rubble'
  | 'gate'
  | 'weapon_rack'
  | 'torn_banner'
  | 'ceremonial_brazier';

export type RoomPropPlacement =
  | readonly [RoomPropKind, number, number]
  | {
      readonly kind: RoomPropKind;
      readonly at: (halfExtents: Vec2) => Vec2;
      readonly variant: number;
    };

export type RoomSurfacePattern = 'ashlar' | 'diamond' | 'range' | 'patchwork' | 'ceremonial';

export interface RoomSurface {
  pattern: RoomSurfacePattern;
  spacing: number;
  alpha: number;
}

export type RoomFloorDressKind = 'medallion' | 'diamond' | 'lanes' | 'patches' | 'runner';

export interface RoomFloorDress {
  kind: RoomFloorDressKind;
  alpha: number;
}

export type RoomAirKind = 'draft' | 'embers' | 'mortar';

export interface RoomAir {
  kind: RoomAirKind;
  count: number;
  at: Vec2;
  spread: Vec2;
}

export const DECORATED_VIEW_MARGIN = 108;
export const UNDECORATED_VIEW_MARGIN = 90;

export type GenericArenaTheme =
  | 'first_blade'
  | 'training_court'
  | 'duel_gallery'
  | 'crossfire_court'
  | 'corner_keep'
  | 'assembly_hall'
  | 'guard_hall'
  | 'chancellery'
  | 'concept_bell_court'
  | 'concept_shattered_dais'
  | 'concept_rain_breached_hall'
  | 'concept_parallax_gallery'
  | 'concept_prop_gallery'
  | 'concept_kit_gallery'
  | 'concept_clutter_gallery'
  | 'concept_fallen_crown'
  | 'concept_unbound';

export interface RoomTheme {
  props: readonly RoomPropPlacement[];
  floorDress?: RoomFloorDress;
  surface?: RoomSurface;
  air?: RoomAir;
  markings: (
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    h: Vec2,
    pal: Palette,
    accent: string,
  ) => void;
  foundation?: (
    ctx: CanvasRenderingContext2D,
    world: World,
    cam: Camera,
    pal: Palette,
    accent: string,
  ) => void;
  viewMargin?: number;
  accent: (pal: Palette, world: World) => string;
}

export interface RoomRegistry {
  themeFor: (encounterId: string) => GenericArenaTheme | null;
  theme: (id: GenericArenaTheme) => RoomTheme;
  ambience: (encounterId: string) => Partial<Ambience>;
}

export const lineOnGround = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  points: Array<{ x: number; y: number }>,
): void => {
  const first = worldToScreen(cam, points[0]);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    const p = worldToScreen(cam, points[i]);
    ctx.lineTo(p.x, p.y);
  }
};

export const polygonOnGround = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  points: Array<{ x: number; y: number }>,
): void => {
  lineOnGround(ctx, cam, points);
  ctx.closePath();
};

export const ringOnGround = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  at: { x: number; y: number },
  radius: number,
): void => {
  const p = worldToScreen(cam, at);
  const ring = groundEllipse(cam, radius);
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, ring.rx, ring.ry, 0, 0, TAU);
};

export const drawRoomSurface = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  h: Vec2,
  surface: RoomSurface,
): void => {
  const append = (from: Vec2, to: Vec2): void => {
    const a = worldToScreen(cam, from);
    const b = worldToScreen(cam, to);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  };
  const spacing = Math.max(1, surface.spacing);

  ctx.beginPath();
  if (surface.pattern === 'diamond') {
    const reach = h.x + h.y;
    for (let offset = -reach; offset <= reach; offset += spacing) {
      append({ x: -h.x, y: offset - h.x }, { x: h.x, y: offset + h.x });
      append({ x: -h.x, y: -offset + h.x }, { x: h.x, y: -offset - h.x });
    }
  } else {
    const course = surface.pattern === 'range' ? spacing * 0.72 : spacing;
    let row = 0;
    for (let y = -h.y + course; y < h.y; y += course, row += 1) {
      append({ x: -h.x, y }, { x: h.x, y });
      const jointStep =
        surface.pattern === 'ceremonial'
          ? spacing * 1.7
          : surface.pattern === 'range'
            ? spacing * 2.8
            : spacing * 1.45;
      const stagger = row % 2 === 0 ? 0 : jointStep / 2;
      for (let x = -h.x + stagger; x < h.x; x += jointStep) {
        append({ x, y: y - course }, { x, y });
      }
    }
    if (surface.pattern === 'patchwork') {
      for (const [x, y, sx, sy] of [
        [-h.x * 0.56, -h.y * 0.34, 0.72, 0.48],
        [h.x * 0.18, -h.y * 0.08, -0.58, 0.82],
        [-h.x * 0.08, h.y * 0.42, 0.66, 0.44],
      ] as const) {
        append({ x, y }, { x: x + sx, y: y + sy });
        append({ x: x + sx, y: y + sy }, { x: x + sx * 1.55, y: y + sy * 0.64 });
      }
    }
  }
  ctx.stroke();
};

export const drawRoomFloorDress = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  h: Vec2,
  dress: RoomFloorDress,
): void => {
  const trace = (points: readonly Vec2[]): void => {
    const first = worldToScreen(cam, points[0]);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i++) {
      const point = worldToScreen(cam, points[i]);
      ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();
  };

  ctx.beginPath();
  if (dress.kind === 'medallion') {
    const radius = Math.min(h.x, h.y) * 0.44;
    const centre = worldToScreen(cam, { x: 0, y: 0 });
    const ellipse = groundEllipse(cam, radius);
    ctx.ellipse(centre.x, centre.y, ellipse.rx, ellipse.ry, 0, 0, TAU);
  } else if (dress.kind === 'diamond') {
    trace([
      { x: 0, y: -h.y * 0.7 },
      { x: h.x * 0.48, y: 0 },
      { x: 0, y: h.y * 0.7 },
      { x: -h.x * 0.48, y: 0 },
    ]);
  } else if (dress.kind === 'lanes') {
    for (const y of [-2.4, 0, 2.4]) {
      trace([
        { x: -h.x, y: y - 0.34 },
        { x: h.x, y: y - 0.34 },
        { x: h.x, y: y + 0.34 },
        { x: -h.x, y: y + 0.34 },
      ]);
    }
  } else if (dress.kind === 'patches') {
    trace([
      { x: -h.x * 0.9, y: -h.y * 0.82 },
      { x: -h.x * 0.14, y: -h.y * 0.82 },
      { x: -h.x * 0.14, y: -h.y * 0.14 },
      { x: -h.x * 0.9, y: -h.y * 0.14 },
    ]);
    trace([
      { x: h.x * 0.08, y: h.y * 0.24 },
      { x: h.x * 0.9, y: h.y * 0.24 },
      { x: h.x * 0.9, y: h.y * 0.84 },
      { x: h.x * 0.08, y: h.y * 0.84 },
    ]);
  } else {
    trace([
      { x: -0.9, y: -h.y },
      { x: 0.9, y: -h.y },
      { x: 0.72, y: h.y },
      { x: -0.72, y: h.y },
    ]);
  }
  ctx.fill();
};
