
import type { Arena, World } from '../sim/types';
import { TICK_MS } from '../sim/types';
import type { GenericArenaTheme, RoomRegistry, RoomPropKind } from './rooms/theme';
import {
  DECORATED_VIEW_MARGIN,
  UNDECORATED_VIEW_MARGIN,
  drawRoomFloorDress,
  drawRoomSurface,
} from './rooms/theme';

export type { GenericArenaTheme } from './rooms/theme';
import type { Palette } from './palette';
import { shade as shadeHex, withAlpha as withAlphaHex } from './palette';
import { arenaContains } from '../sim/arena';
import type { Camera } from './iso';
import { groundEllipse, worldToScreen } from './iso';

const TAU = Math.PI * 2;

export const arenaThemeFor = (
  rooms: RoomRegistry,
  encounterId: string,
): GenericArenaTheme | null => rooms.themeFor(encounterId);

export const arenaViewMargin = (rooms: RoomRegistry, encounterId: string): number => {
  const theme = rooms.themeFor(encounterId);
  if (theme === null) return UNDECORATED_VIEW_MARGIN;
  return rooms.theme(theme).viewMargin ?? DECORATED_VIEW_MARGIN;
};

export interface ArenaProp {
  kind: RoomPropKind;
  at: { x: number; y: number };
  axis?: { x: number; y: number };
  scale?: number;
  variant: number;
  theme: GenericArenaTheme;
}

export const arenaProps = (
  rooms: RoomRegistry,
  theme: GenericArenaTheme,
  arena: Arena,
): ArenaProp[] => {
  const perimeter =
    arena.outline ??
    arena.vertices ?? [
      { x: -arena.halfExtents.x, y: -arena.halfExtents.y },
      { x: arena.halfExtents.x, y: -arena.halfExtents.y },
      { x: arena.halfExtents.x, y: arena.halfExtents.y },
      { x: -arena.halfExtents.x, y: arena.halfExtents.y },
    ];
  const signedArea = perimeter.reduce((sum, point, index) => {
    const next = perimeter[(index + 1) % perimeter.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
  const edgeLengths = perimeter.map((point, index) => {
    const next = perimeter[(index + 1) % perimeter.length];
    return Math.hypot(next.x - point.x, next.y - point.y);
  });
  const perimeterLength = edgeLengths.reduce((sum, length) => sum + length, 0);

  const anchor = (fraction: number, offset = 0.82) => {
    let remaining = ((fraction % 1) + 1) % 1 * perimeterLength;
    let edge = 0;
    while (edge < edgeLengths.length - 1 && remaining > edgeLengths[edge]) {
      remaining -= edgeLengths[edge];
      edge += 1;
    }
    const from = perimeter[edge];
    const to = perimeter[(edge + 1) % perimeter.length];
    const edgeLength = Math.max(1e-9, edgeLengths[edge]);
    const tangent = {
      x: (to.x - from.x) / edgeLength,
      y: (to.y - from.y) / edgeLength,
    };
    const t = remaining / edgeLength;
    const onBoundary = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    };
    const ccw = signedArea >= 0;
    const outward = ccw
      ? { x: tangent.y, y: -tangent.x }
      : { x: -tangent.y, y: tangent.x };
    let at = {
      x: onBoundary.x + outward.x * offset,
      y: onBoundary.y + outward.y * offset,
    };
    for (let step = 2; step <= 5 && arenaContains(arena, at); step++) {
      at = {
        x: onBoundary.x + outward.x * offset * step,
        y: onBoundary.y + outward.y * offset * step,
      };
    }
    return { at, tangent };
  };
  const prop = (
    kind: ArenaProp['kind'],
    fraction: number,
    variant: number,
  ): ArenaProp => {
    const anchored = anchor(fraction);
    return {
      kind,
      at: anchored.at,
      axis: kind === 'arch' ? anchored.tangent : undefined,
      variant,
      theme,
    };
  };

  const themed = rooms.theme(theme).props.map((placement): ArenaProp =>
    'kind' in placement
      ? {
          kind: placement.kind,
          at: placement.at(arena.halfExtents),
          variant: placement.variant,
          theme,
        }
      : prop(placement[0], placement[1], placement[2]),
  );

  if (arenaContains(arena, { x: 0, y: 0 })) return themed;

  const PERIMETER_COLUMN_RADIUS = 0.42;
  let holeRadius = 0.1;
  while (holeRadius < arena.halfExtents.x && !arenaContains(arena, { x: holeRadius, y: 0 })) {
    holeRadius += 0.1;
  }
  return [
    ...themed,
    {
      kind: 'column',
      at: { x: 0, y: 0 },
      scale: holeRadius / PERIMETER_COLUMN_RADIUS,
      variant: 0,
      theme,
    },
  ];
};

export const arenaPropsFor = (rooms: RoomRegistry, world: World): ArenaProp[] => {
  const theme = rooms.themeFor(world.encounter.defId);
  return theme === null ? [] : arenaProps(rooms, theme, world.arena);
};



export const drawArenaFloor = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  pal: Palette,
  rooms: RoomRegistry,
): void => {
  const theme = rooms.themeFor(world.encounter.defId);
  if (theme === null) return;
  const h = world.arena.halfExtents;
  const room = rooms.theme(theme);
  const accent = accentOf(rooms, theme, pal, world);

  ctx.save();
  if (room.floorDress !== undefined) {
    ctx.fillStyle = accent;
    ctx.globalAlpha = room.floorDress.alpha;
    drawRoomFloorDress(ctx, cam, h, room.floorDress);
  }

  if (room.surface !== undefined) {
    ctx.strokeStyle = pal.floorGrid;
    ctx.lineWidth = 1;
    ctx.globalAlpha = room.surface.alpha;
    drawRoomSurface(ctx, cam, h, room.surface);
  }

  ctx.strokeStyle = accent;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.2;

  room.markings(ctx, cam, h, pal, accent);

  ctx.restore();
};

export const drawArenaFoundation = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  pal: Palette,
  rooms: RoomRegistry,
): void => {
  const theme = rooms.themeFor(world.encounter.defId);
  if (theme === null) return;
  const room = rooms.theme(theme);
  room.foundation?.(ctx, world, cam, pal, accentOf(rooms, theme, pal, world));
};

const drawShadow = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  at: { x: number; y: number },
  radius: number,
): void => {
  const p = worldToScreen(cam, at);
  const e = groundEllipse(cam, radius);
  ctx.fillStyle = '#000000';
  ctx.globalAlpha = 0.28;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, e.rx, e.ry, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
};

const drawGate = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  prop: ArenaProp,
  pal: Palette,
  accent: string,
): void => {
  const zoom = cam.zoom;
  const left = worldToScreen(cam, { x: prop.at.x - 1.55, y: prop.at.y });
  const right = worldToScreen(cam, { x: prop.at.x + 1.55, y: prop.at.y });
  const postW = Math.max(8, 18 * zoom);
  const postH = 102 * zoom;

  drawShadow(ctx, cam, prop.at, 1.8);
  ctx.fillStyle = pal.wall;
  ctx.strokeStyle = pal.floorGrid;
  ctx.lineWidth = Math.max(1, zoom);
  for (const p of [left, right]) {
    ctx.fillRect(p.x - postW / 2, p.y - postH, postW, postH);
    ctx.strokeRect(p.x - postW / 2, p.y - postH, postW, postH);
  }

  ctx.beginPath();
  ctx.moveTo(left.x - postW / 2, left.y - postH);
  ctx.lineTo(right.x + postW / 2, right.y - postH);
  ctx.lineTo(right.x + postW / 2, right.y - postH + 17 * zoom);
  ctx.lineTo(left.x - postW / 2, left.y - postH + 17 * zoom);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const crest = {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2 - postH + 4 * zoom,
  };
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(2, 3 * zoom);
  ctx.beginPath();
  ctx.moveTo(crest.x, crest.y - 17 * zoom);
  ctx.lineTo(crest.x, crest.y + 24 * zoom);
  ctx.moveTo(crest.x - 11 * zoom, crest.y + 9 * zoom);
  ctx.lineTo(crest.x + 11 * zoom, crest.y + 9 * zoom);
  ctx.stroke();
};

const drawTornBanner = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  prop: ArenaProp,
  pal: Palette,
  accent: string,
): void => {
  const p = worldToScreen(cam, prop.at);
  const z = cam.zoom;
  const width = 30 * z;
  const top = p.y - 92 * z;
  const torn = prop.variant === 0 ? 10 : -7;

  drawShadow(ctx, cam, prop.at, 0.32);
  ctx.strokeStyle = pal.hudDim;
  ctx.lineWidth = Math.max(2, 3 * z);
  ctx.beginPath();
  ctx.moveTo(p.x - width * 0.72, top);
  ctx.lineTo(p.x + width * 0.72, top);
  ctx.stroke();

  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.62;
  ctx.beginPath();
  ctx.moveTo(p.x - width / 2, top + 3 * z);
  ctx.lineTo(p.x + width / 2, top + 3 * z);
  ctx.lineTo(p.x + width * 0.42, top + 57 * z);
  ctx.lineTo(p.x + torn * z * 0.25, top + 49 * z);
  ctx.lineTo(p.x - width * 0.5, top + 66 * z);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = pal.hudText;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = Math.max(1, 2 * z);
  ctx.beginPath();
  ctx.moveTo(p.x, top + 12 * z);
  ctx.lineTo(p.x, top + 47 * z);
  ctx.stroke();
  ctx.globalAlpha = 1;
};

const drawWeaponRack = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  prop: ArenaProp,
  pal: Palette,
): void => {
  const p = worldToScreen(cam, prop.at);
  const z = cam.zoom;
  const mirror = prop.variant === 0 ? -1 : 1;

  drawShadow(ctx, cam, prop.at, 0.82);
  ctx.strokeStyle = pal.wall;
  ctx.lineWidth = Math.max(2, 5 * z);
  ctx.beginPath();
  ctx.moveTo(p.x - 34 * z, p.y - 18 * z);
  ctx.lineTo(p.x + 34 * z, p.y - 18 * z);
  ctx.moveTo(p.x - 27 * z, p.y);
  ctx.lineTo(p.x - 27 * z, p.y - 41 * z);
  ctx.moveTo(p.x + 27 * z, p.y);
  ctx.lineTo(p.x + 27 * z, p.y - 41 * z);
  ctx.stroke();

  const lean = mirror * 7 * z;
  ctx.strokeStyle = pal.hudDim;
  ctx.lineWidth = Math.max(1, 2.5 * z);
  for (let i = -2; i <= 2; i++) {
    const x = p.x + i * 13 * z;
    const long = i % 2 === 0 ? 55 : 44;
    const tipX = x + lean;
    const tipY = p.y - long * z;
    ctx.beginPath();
    ctx.moveTo(x, p.y - 8 * z);
    ctx.lineTo(tipX, tipY);
    ctx.moveTo(x - 6 * z, p.y - 18 * z);
    ctx.lineTo(x + 6 * z, p.y - 18 * z);
    ctx.stroke();
    ctx.fillStyle = pal.hudDim;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY - 7 * z);
    ctx.lineTo(tipX + 4 * z, tipY + 1 * z);
    ctx.lineTo(tipX - 4 * z, tipY + 1 * z);
    ctx.closePath();
    ctx.fill();
  }
};

const drawCeremonialBrazier = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  prop: ArenaProp,
  pal: Palette,
  accent: string,
  timeMs: number,
): void => {
  const p = worldToScreen(cam, prop.at);
  const z = cam.zoom;
  const flicker = 1 + Math.sin((timeMs / TICK_MS + prop.variant * 17) * 0.19) * 0.12;

  drawShadow(ctx, cam, prop.at, 0.38);
  ctx.fillStyle = pal.wall;
  ctx.fillRect(p.x - 5 * z, p.y - 34 * z, 10 * z, 34 * z);
  ctx.beginPath();
  ctx.ellipse(p.x, p.y - 35 * z, 15 * z, 6 * z, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.78;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - (68 * flicker) * z);
  ctx.lineTo(p.x + 10 * z, p.y - 42 * z);
  ctx.lineTo(p.x, p.y - 34 * z);
  ctx.lineTo(p.x - 10 * z, p.y - 42 * z);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = pal.parryFlash;
  ctx.globalAlpha = 0.54;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - (56 * flicker) * z);
  ctx.lineTo(p.x + 5 * z, p.y - 42 * z);
  ctx.lineTo(p.x, p.y - 37 * z);
  ctx.lineTo(p.x - 5 * z, p.y - 42 * z);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
};

const accentOf = (
  rooms: RoomRegistry,
  theme: GenericArenaTheme,
  pal: Palette,
  world: World,
): string => rooms.theme(theme).accent(pal, world);

const drawColumn = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  prop: ArenaProp,
  pal: Palette,
  accent: string,
  timeMs: number,
): void => {
  const p = worldToScreen(cam, prop.at);
  const z = cam.zoom;
  const s = prop.scale ?? 1;
  const height = (56 + (prop.variant % 2) * 8) * z * (1 + (s - 1) * 0.45);
  const halfW = 9 * z * s;
  const capW = 13 * z * s;
  const cap = 6 * z * Math.min(s, 1.6);
  drawShadow(ctx, cam, prop.at, 0.42 * s);

  const shaft = ctx.createLinearGradient(p.x - halfW, 0, p.x + halfW, 0);
  shaft.addColorStop(0, shadeHex(pal.wall, 0.5));
  shaft.addColorStop(0.34, shadeHex(pal.wall, 1.25));
  shaft.addColorStop(1, shadeHex(pal.wall, 0.42));
  ctx.fillStyle = shaft;
  ctx.fillRect(p.x - halfW, p.y - height, halfW * 2, height);

  ctx.strokeStyle = shadeHex(pal.wall, 0.34);
  ctx.lineWidth = Math.max(1, z * 0.8);
  ctx.beginPath();
  for (const t of [0.42, 0.62]) {
    const x = p.x - halfW + halfW * 2 * t;
    ctx.moveTo(x, p.y - height + cap);
    ctx.lineTo(x, p.y - cap * 0.6);
  }
  ctx.stroke();

  for (const [y, w] of [
    [p.y - height, capW],
    [p.y, capW * 0.92],
  ] as const) {
    ctx.fillStyle = shadeHex(pal.wall, 1.1);
    ctx.fillRect(p.x - w, y - cap, w * 2, cap);
    ctx.fillStyle = shadeHex(pal.wall, 0.7);
    ctx.beginPath();
    ctx.ellipse(p.x, y, w, cap * 0.52, 0, 0, TAU);
    ctx.fill();
  }


  const flicker =
    1 + 0.16 * Math.sin(timeMs / 150 + prop.variant * 2.3) +
    0.09 * Math.sin(timeMs / 67 + prop.variant * 5.1);
  const flameY = p.y - height - cap * 0.4;
  const flameH = 9 * z * flicker * Math.min(s, 2.2);
  const sconceW = 3 * z * Math.min(s, 2.2);

  ctx.fillStyle = shadeHex(pal.wall, 0.6);
  ctx.fillRect(p.x - sconceW, flameY - 2 * z, sconceW * 2, 4 * z);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(p.x, flameY - flameH * 0.5, 0, p.x, flameY - flameH * 0.5, flameH * 2.6);
  halo.addColorStop(0, withAlphaHex(accent, 0.5));
  halo.addColorStop(1, withAlphaHex(accent, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(p.x, flameY - flameH * 0.5, flameH * 2.6, 0, TAU);
  ctx.fill();

  const flameW = 4 * z * Math.min(s, 2.2);
  for (const [scale, color, alpha] of [
    [1, accent, 0.85],
    [0.5, '#fff3d0', 0.9],
  ] as const) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(p.x, flameY - flameH * scale);
    ctx.quadraticCurveTo(p.x + flameW * scale, flameY - flameH * 0.4 * scale, p.x, flameY);
    ctx.quadraticCurveTo(p.x - flameW * scale, flameY - flameH * 0.4 * scale, p.x, flameY - flameH * scale);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
};

const drawTarget = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  prop: ArenaProp,
  pal: Palette,
  accent: string,
): void => {
  const p = worldToScreen(cam, prop.at);
  const z = cam.zoom;
  drawShadow(ctx, cam, prop.at, 0.48);
  ctx.strokeStyle = pal.wall;
  ctx.lineWidth = Math.max(2, 3 * z);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x, p.y - 42 * z);
  ctx.moveTo(p.x - 13 * z, p.y);
  ctx.lineTo(p.x, p.y - 10 * z);
  ctx.lineTo(p.x + 13 * z, p.y);
  ctx.stroke();
  for (const radius of [17, 10, 4]) {
    ctx.fillStyle = radius === 10 ? accent : pal.hudDim;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 52 * z, radius * z, 0, TAU);
    ctx.fill();
  }
};

const drawArch = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  prop: ArenaProp,
  pal: Palette,
  accent: string,
): void => {
  const z = cam.zoom;
  const fallback = prop.variant % 2 === 0 ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const axis = prop.axis ?? fallback;
  const delta = { x: axis.x * 1.25, y: axis.y * 1.25 };
  const a = worldToScreen(cam, { x: prop.at.x - delta.x, y: prop.at.y - delta.y });
  const b = worldToScreen(cam, { x: prop.at.x + delta.x, y: prop.at.y + delta.y });
  const height = 70 * z;
  drawShadow(ctx, cam, prop.at, 1.4);
  ctx.fillStyle = pal.wall;
  ctx.strokeStyle = pal.floorGrid;
  ctx.lineWidth = Math.max(1, z);
  for (const p of [a, b]) {
    ctx.fillRect(p.x - 7 * z, p.y - height, 14 * z, height);
    ctx.strokeRect(p.x - 7 * z, p.y - height, 14 * z, height);
  }
  ctx.beginPath();
  ctx.moveTo(a.x - 8 * z, a.y - height);
  ctx.lineTo(b.x + 8 * z, b.y - height);
  ctx.lineTo(b.x + 8 * z, b.y - height + 10 * z);
  ctx.lineTo(a.x - 8 * z, a.y - height + 10 * z);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(2, 3 * z);
  ctx.beginPath();
  ctx.moveTo((a.x + b.x) / 2 - 10 * z, (a.y + b.y) / 2 - height + 18 * z);
  ctx.lineTo((a.x + b.x) / 2 + 10 * z, (a.y + b.y) / 2 - height + 18 * z);
  ctx.stroke();

  const centre = {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2 - height + 10 * z,
  };
  const halfWidth = 10 * z;
  const length = (prop.variant % 2 === 0 ? 26 : 31) * z;
  ctx.fillStyle = withAlphaHex(accent, 0.72);
  ctx.beginPath();
  ctx.moveTo(centre.x - halfWidth, centre.y);
  ctx.lineTo(centre.x + halfWidth, centre.y);
  ctx.lineTo(centre.x + halfWidth * 0.82, centre.y + length);
  ctx.lineTo(centre.x, centre.y + length - 6 * z);
  ctx.lineTo(centre.x - halfWidth * 0.82, centre.y + length);
  ctx.closePath();
  ctx.fill();
};

const drawBanner = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  prop: ArenaProp,
  pal: Palette,
  accent: string,
  timeMs: number,
): void => {
  const p = worldToScreen(cam, prop.at);
  const z = cam.zoom;
  const top = p.y - 72 * z;
  const halfWidth = 11 * z;
  const fall = 42 * z;
  const bias =
    ((prop.variant % 2 === 0 ? -1 : 1) * 4 +
      Math.sin(timeMs / 760 + prop.variant * 1.9) * 2.4) *
    z;

  drawShadow(ctx, cam, prop.at, 0.34);
  ctx.strokeStyle = shadeHex(pal.wall, 0.72);
  ctx.lineWidth = Math.max(2, 3 * z);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x, top - 6 * z);
  ctx.moveTo(p.x - halfWidth - 3 * z, top);
  ctx.lineTo(p.x + halfWidth + 3 * z, top);
  ctx.stroke();

  ctx.fillStyle = withAlphaHex(accent, 0.66);
  ctx.beginPath();
  ctx.moveTo(p.x - halfWidth, top + 3 * z);
  ctx.lineTo(p.x + halfWidth, top + 3 * z);
  ctx.lineTo(p.x + halfWidth * 0.78 + bias, top + fall);
  ctx.lineTo(p.x + bias, top + fall - 5 * z);
  ctx.lineTo(p.x - halfWidth * 0.78 + bias, top + fall);
  ctx.closePath();
  ctx.fill();
};

const drawBrazier = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  prop: ArenaProp,
  pal: Palette,
  accent: string,
  timeMs: number,
): void => {
  const p = worldToScreen(cam, prop.at);
  const z = cam.zoom;
  const flicker =
    1 + 0.12 * Math.sin(timeMs / 128 + prop.variant * 2.1) +
    0.06 * Math.sin(timeMs / 59 + prop.variant * 4.7);
  const bowlY = p.y - 27 * z;

  drawShadow(ctx, cam, prop.at, 0.42);
  ctx.fillStyle = shadeHex(pal.wall, 0.66);
  ctx.fillRect(p.x - 4 * z, bowlY, 8 * z, 27 * z);
  ctx.fillStyle = shadeHex(pal.wall, 1.08);
  ctx.beginPath();
  ctx.ellipse(p.x, bowlY, 14 * z, 5.5 * z, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = withAlphaHex(accent, 0.86);
  ctx.beginPath();
  ctx.moveTo(p.x, bowlY - 31 * z * flicker);
  ctx.quadraticCurveTo(p.x + 10 * z, bowlY - 10 * z, p.x, bowlY + 1 * z);
  ctx.quadraticCurveTo(p.x - 10 * z, bowlY - 10 * z, p.x, bowlY - 31 * z * flicker);
  ctx.fill();
  ctx.fillStyle = withAlphaHex('#fff0bd', 0.72);
  ctx.beginPath();
  ctx.moveTo(p.x, bowlY - 19 * z * flicker);
  ctx.quadraticCurveTo(p.x + 4.5 * z, bowlY - 7 * z, p.x, bowlY);
  ctx.quadraticCurveTo(p.x - 4.5 * z, bowlY - 7 * z, p.x, bowlY - 19 * z * flicker);
  ctx.fill();
};

const drawRubble = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  prop: ArenaProp,
  pal: Palette,
): void => {
  const p = worldToScreen(cam, prop.at);
  const z = cam.zoom;
  drawShadow(ctx, cam, prop.at, 0.68);

  for (const [dx, dy, width, height, tone] of [
    [-15, -2, 18, 11, 0.74],
    [3, 0, 22, 14, 0.92],
    [-2, -10, 14, 13, 1.08],
  ] as const) {
    const x = p.x + (dx + (prop.variant % 2) * 3) * z;
    const y = p.y + dy * z;
    ctx.fillStyle = shadeHex(pal.wall, tone);
    ctx.beginPath();
    ctx.moveTo(x - width * 0.5 * z, y);
    ctx.lineTo(x - width * 0.35 * z, y - height * z);
    ctx.lineTo(x + width * 0.28 * z, y - height * 0.82 * z);
    ctx.lineTo(x + width * 0.5 * z, y);
    ctx.closePath();
    ctx.fill();
  }
};

const drawProp = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  prop: ArenaProp,
  pal: Palette,
  accent: string,
  timeMs: number,
): void => {
  ctx.save();
  if (prop.kind === 'column') drawColumn(ctx, cam, prop, pal, accent, timeMs);
  else if (prop.kind === 'target') drawTarget(ctx, cam, prop, pal, accent);
  else if (prop.kind === 'arch') drawArch(ctx, cam, prop, pal, accent);
  else if (prop.kind === 'banner') drawBanner(ctx, cam, prop, pal, accent, timeMs);
  else if (prop.kind === 'brazier') drawBrazier(ctx, cam, prop, pal, accent, timeMs);
  else if (prop.kind === 'gate') drawGate(ctx, cam, prop, pal, accent);
  else if (prop.kind === 'weapon_rack') drawWeaponRack(ctx, cam, prop, pal);
  else if (prop.kind === 'torn_banner') drawTornBanner(ctx, cam, prop, pal, accent);
  else if (prop.kind === 'ceremonial_brazier') {
    drawCeremonialBrazier(ctx, cam, prop, pal, accent, timeMs);
  } else drawRubble(ctx, cam, prop, pal);
  ctx.restore();
};

export const drawFloorPillar = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  at: { x: number; y: number },
  radius: number,
  pal: Palette,
  rooms: RoomRegistry,
  timeMs: number,
  variant: number,
): void => {
  const p = worldToScreen(cam, at);
  const footprint = groundEllipse(cam, radius);

  ctx.save();
  ctx.fillStyle = pal.wall;
  ctx.strokeStyle = pal.floorGrid;
  ctx.globalAlpha = 0.62;
  ctx.lineWidth = Math.max(1, 1.5 * cam.zoom);
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, footprint.rx, footprint.ry, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 1;

  drawColumn(
    ctx,
    cam,
    { kind: 'column', at, variant, theme: 'training_court', scale: radius / 0.42 },
    pal,
    accentOf(rooms, 'training_court', pal, world),
    timeMs,
  );
  ctx.restore();
};

export const drawArenaProp = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  prop: ArenaProp,
  pal: Palette,
  rooms: RoomRegistry,
  timeMs: number,
): void => {
  drawProp(ctx, cam, prop, pal, accentOf(rooms, prop.theme, pal, world), timeMs);
};
