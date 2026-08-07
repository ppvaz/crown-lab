
import {
  CONSTRUCTION_DETAILS,
  CONSTRUCTION_FLOORS,
  CONSTRUCTION_WALLS,
  CONSTRUCTION_WINDOWS,
  NARRATIVE_CLUTTER_GALLERY,
  OCCUPIED_FLOOR_FLUSH,
  OCCUPIED_FLOOR_SOLIDS,
  conceptRoomClutter,
} from '../lab/concept-kit';
import { dressGeneratedRoom } from '../lab/room-dressing';
import { isGeneratedEncounter } from '../lab/encounters';
import type { World } from '../sim/types';
import type { SceneBody } from './draw';
import { groundEllipse, type Camera, worldToScreen } from './iso';
import type { Palette } from './palette';
import {
  conceptKitBodies,
  constructionKitBodies,
  drawConstructionFloors,
  drawConceptFloorPlacements,
} from './concept-kit-lab';

interface ConceptArenaScene {
  bodies?: SceneBody[];
}

type ScreenPoint = readonly [number, number];

const polygon = (
  ctx: CanvasRenderingContext2D,
  points: readonly ScreenPoint[],
  fill: string | CanvasGradient,
  stroke: string,
  lineWidth: number,
): void => {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index][0], points[index][1]);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
};

const worldPolygon = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  points: readonly { x: number; y: number }[],
  fill: string,
  stroke: string,
  lineWidth = 1.2,
): void => {
  const screen = points.map((point) => worldToScreen(cam, point));
  polygon(
    ctx,
    screen.map((point) => [point.x, point.y] as const),
    fill,
    stroke,
    Math.max(0.8, lineWidth * cam.zoom),
  );
};

const worldRect = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  fill: string,
  stroke: string,
): void =>
  worldPolygon(
    ctx,
    cam,
    [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }],
    fill,
    stroke,
  );

const worldLine = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  points: readonly { x: number; y: number }[],
  stroke: string,
  lineWidth = 1,
): void => {
  const first = worldToScreen(cam, points[0]);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let index = 1; index < points.length; index += 1) {
    const point = worldToScreen(cam, points[index]);
    ctx.lineTo(point.x, point.y);
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(0.8, lineWidth * cam.zoom);
  ctx.stroke();
};

const worldRing = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  at: { x: number; y: number },
  radius: number,
  stroke: string,
  lineWidth = 1,
  fill?: string,
): void => {
  const p = worldToScreen(cam, at);
  const ring = groundEllipse(cam, radius);
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, ring.rx, ring.ry, 0, 0, Math.PI * 2);
  if (fill !== undefined) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(0.8, lineWidth * cam.zoom);
  ctx.stroke();
};

const worldRingBand = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  at: { x: number; y: number },
  innerRadius: number,
  outerRadius: number,
  fill: string,
  stroke: string,
  lineWidth = 1,
): void => {
  const p = worldToScreen(cam, at);
  const outer = groundEllipse(cam, outerRadius);
  const inner = groundEllipse(cam, innerRadius);
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, outer.rx, outer.ry, 0, 0, Math.PI * 2);
  if (innerRadius > 0) {
    ctx.ellipse(p.x, p.y, inner.rx, inner.ry, 0, 0, Math.PI * 2, true);
  }
  ctx.fillStyle = fill;
  ctx.fill();
  worldRing(ctx, cam, at, outerRadius, stroke, lineWidth);
  if (innerRadius > 0) worldRing(ctx, cam, at, innerRadius, stroke, lineWidth);
};

const drawBell = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  at: { x: number; y: number },
  index: number,
  timeMs: number,
): void => {
  const p = worldToScreen(cam, at);
  const z = cam.zoom;
  const sway = Math.sin(timeMs / 1250 + index * 1.7) * 1.4 * z;
  const top = p.y - 118 * z;
  const bellY = p.y - 52 * z;

  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.strokeStyle = pal.garment;
  ctx.lineWidth = Math.max(1, 1.5 * z);
  ctx.beginPath();
  ctx.moveTo(p.x, top);
  ctx.lineTo(p.x + sway, bellY - 20 * z);
  ctx.stroke();

  const bronze = ctx.createLinearGradient(p.x - 15 * z, bellY, p.x + 15 * z, bellY);
  bronze.addColorStop(0, '#5a351d');
  bronze.addColorStop(0.48, '#c18a3f');
  bronze.addColorStop(1, '#3a241a');
  ctx.translate(p.x + sway, bellY);
  polygon(
    ctx,
    [
      [-7 * z, -22 * z],
      [7 * z, -22 * z],
      [10 * z, -8 * z],
      [17 * z, 7 * z],
      [-17 * z, 7 * z],
      [-10 * z, -8 * z],
    ],
    bronze,
    pal.playerAccent,
    Math.max(0.8, z),
  );
  ctx.fillStyle = '#1d1512';
  ctx.beginPath();
  ctx.ellipse(0, 7 * z, 17 * z, 5 * z, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = pal.playerAccent;
  ctx.stroke();
  ctx.fillStyle = '#8d6636';
  ctx.beginPath();
  ctx.arc(0, 13 * z, 3.2 * z, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const drawRainCatch = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  at: { x: number; y: number },
  index: number,
  timeMs: number,
): void => {
  const p = worldToScreen(cam, at);
  const z = cam.zoom;
  const phase = (timeMs / 18 + index * 19) % 34;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#8fc8e8';
  ctx.lineWidth = Math.max(0.7, z * 0.85);
  ctx.globalAlpha = 0.34;
  ctx.beginPath();
  for (let line = -2; line <= 2; line += 1) {
    const x = p.x + line * 10 * z;
    const y = p.y - (92 + phase + Math.abs(line) * 9) * z;
    ctx.moveTo(x - 7 * z, y);
    ctx.lineTo(x + 2 * z, y + 30 * z);
  }
  ctx.stroke();

  ctx.globalAlpha = 0.42;
  const puddle = groundEllipse(cam, 0.72);
  ctx.fillStyle = '#5e91ae';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, puddle.rx, puddle.ry, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.88;
  polygon(
    ctx,
    [
      [p.x - 13 * z, p.y - 17 * z],
      [p.x + 13 * z, p.y - 17 * z],
      [p.x + 9 * z, p.y + 1 * z],
      [p.x - 9 * z, p.y + 1 * z],
    ],
    pal.wall,
    pal.garment,
    Math.max(0.8, z),
  );
  ctx.fillStyle = '#6aa1bf';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y - 17 * z, 13 * z, 4 * z, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = pal.garment;
  ctx.stroke();
  ctx.restore();
};

const drawLantern = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  at: { x: number; y: number },
  index: number,
  timeMs: number,
): void => {
  const p = worldToScreen(cam, at);
  const z = cam.zoom;
  const flicker = 0.75 + Math.sin(timeMs / 330 + index) * 0.15;
  ctx.save();
  const glow = ctx.createRadialGradient(p.x, p.y - 48 * z, 0, p.x, p.y - 48 * z, 32 * z);
  glow.addColorStop(0, `rgba(255, 210, 118, ${0.42 * flicker})`);
  glow.addColorStop(1, 'rgba(255, 180, 80, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(p.x - 34 * z, p.y - 82 * z, 68 * z, 68 * z);
  ctx.strokeStyle = '#645444';
  ctx.lineWidth = Math.max(0.8, 1.3 * z);
  ctx.beginPath();
  ctx.moveTo(p.x - 4 * z, p.y - 116 * z);
  ctx.lineTo(p.x - 4 * z, p.y - 72 * z);
  ctx.moveTo(p.x + 4 * z, p.y - 116 * z);
  ctx.lineTo(p.x + 4 * z, p.y - 72 * z);
  ctx.stroke();
  polygon(
    ctx,
    [
      [p.x - 13 * z, p.y - 71 * z],
      [p.x, p.y - 79 * z],
      [p.x + 13 * z, p.y - 71 * z],
      [p.x + 9 * z, p.y - 65 * z],
      [p.x - 9 * z, p.y - 65 * z],
    ],
    '#423229',
    pal.playerAccent,
    Math.max(0.8, z),
  );
  const glass = ctx.createLinearGradient(p.x - 12 * z, 0, p.x + 12 * z, 0);
  glass.addColorStop(0, '#6e4127');
  glass.addColorStop(0.38, '#f2ba58');
  glass.addColorStop(0.58, '#ffdd7a');
  glass.addColorStop(1, '#714327');
  polygon(
    ctx,
    [
      [p.x - 9 * z, p.y - 65 * z],
      [p.x + 9 * z, p.y - 65 * z],
      [p.x + 12 * z, p.y - 41 * z],
      [p.x - 12 * z, p.y - 41 * z],
    ],
    glass,
    '#443329',
    Math.max(0.8, z),
  );
  ctx.strokeStyle = '#4b392d';
  ctx.lineWidth = Math.max(0.8, z);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - 65 * z);
  ctx.lineTo(p.x, p.y - 41 * z);
  ctx.moveTo(p.x - 10 * z, p.y - 53 * z);
  ctx.lineTo(p.x + 10 * z, p.y - 53 * z);
  ctx.stroke();
  polygon(
    ctx,
    [
      [p.x - 14 * z, p.y - 41 * z],
      [p.x + 14 * z, p.y - 41 * z],
      [p.x + 9 * z, p.y - 35 * z],
      [p.x - 9 * z, p.y - 35 * z],
    ],
    '#352a25',
    pal.playerAccent,
    Math.max(0.8, z),
  );
  ctx.fillStyle = '#fff0a1';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y - 52 * z, 2.2 * z, 5 * z * flicker, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const drawSpire = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  at: { x: number; y: number },
  height: number,
): void => {
  const p = worldToScreen(cam, at);
  const z = cam.zoom;
  ctx.save();
  polygon(
    ctx,
    [
      [p.x - 13 * z, p.y],
      [p.x + 13 * z, p.y],
      [p.x + 10 * z, p.y - height * 0.48 * z],
      [p.x, p.y - height * z],
      [p.x - 10 * z, p.y - height * 0.48 * z],
    ],
    '#20232f',
    pal.garment,
    Math.max(0.8, z),
  );
  ctx.strokeStyle = pal.playerAccent;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - height * z);
  ctx.lineTo(p.x, p.y - (height + 20) * z);
  ctx.stroke();
  ctx.restore();
};

const drawShelf = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  at: { x: number; y: number },
): void => {
  const p = worldToScreen(cam, at);
  const z = cam.zoom;
  ctx.save();
  ctx.fillStyle = '#1b151d';
  ctx.strokeStyle = pal.playerAccent;
  ctx.lineWidth = Math.max(0.7, z);
  ctx.fillRect(p.x - 24 * z, p.y - 74 * z, 48 * z, 70 * z);
  ctx.strokeRect(p.x - 24 * z, p.y - 74 * z, 48 * z, 70 * z);
  for (let row = 0; row < 4; row += 1) {
    const y = p.y - (60 - row * 16) * z;
    ctx.beginPath();
    ctx.moveTo(p.x - 20 * z, y);
    ctx.lineTo(p.x + 20 * z, y);
    ctx.stroke();
    for (let book = -2; book <= 2; book += 1) {
      ctx.fillStyle = book % 2 === 0 ? '#6c3b32' : '#34304d';
      ctx.fillRect(p.x + book * 7 * z, y - 12 * z, 5 * z, 11 * z);
    }
  }
  ctx.restore();
};

const drawFurnace = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  at: { x: number; y: number },
  radius: number,
  timeMs: number,
): void => {
  const p = worldToScreen(cam, at);
  const z = cam.zoom;
  const ring = groundEllipse(cam, radius);
  ctx.save();
  ctx.fillStyle = '#241719';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, ring.rx, ring.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = pal.garment;
  ctx.lineWidth = Math.max(1, z * 1.5);
  ctx.stroke();
  const glow = ctx.createRadialGradient(p.x, p.y - 7 * z, 0, p.x, p.y - 7 * z, ring.rx);
  glow.addColorStop(0, '#fff0a4');
  glow.addColorStop(0.25, '#ff8b2e');
  glow.addColorStop(1, 'rgba(121, 31, 12, 0)');
  ctx.globalAlpha = 0.72 + Math.sin(timeMs / 240) * 0.08;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y - 7 * z, ring.rx * 0.72, ring.ry * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const drawThrone = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  at: { x: number; y: number },
): void => {
  const p = worldToScreen(cam, at);
  const z = cam.zoom;
  ctx.save();
  polygon(
    ctx,
    [
      [p.x - 25 * z, p.y],
      [p.x + 25 * z, p.y],
      [p.x + 18 * z, p.y - 75 * z],
      [p.x + 7 * z, p.y - 91 * z],
      [p.x, p.y - 76 * z],
      [p.x - 9 * z, p.y - 94 * z],
      [p.x - 18 * z, p.y - 75 * z],
    ],
    '#24202a',
    pal.playerAccent,
    Math.max(1, 1.5 * z),
  );
  ctx.fillStyle = '#4d2831';
  ctx.fillRect(p.x - 11 * z, p.y - 62 * z, 22 * z, 48 * z);
  ctx.restore();
};

const paintField = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  fill: string,
): void => {
  const h = world.arena.halfExtents;
  worldRect(ctx, cam, -h.x, -h.y, h.x, h.y, fill, fill);
};

export const conceptArenaGround = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  pal: Palette,
): void => {
  const id = world.encounter.defId;
  const gold = 'rgba(200, 169, 74, 0.72)';
  const stone = '#1b1b23';
  const stoneLight = '#292a35';
  const voidFill = '#07070d';
  ctx.save();

  if (
    id === 'concept_lantern_cloister' ||
    id === 'concept_lantern_cloister_baked' ||
    id === 'concept_lantern_cloister_live'
  ) {
    worldRingBand(ctx, cam, { x: 0, y: 0 }, 3.4, 5.2, 'rgba(170, 138, 74, 0.065)', gold);
    worldRingBand(ctx, cam, { x: 0, y: 0 }, 1.7, 3.4, 'rgba(10, 10, 16, 0.18)', gold);
    worldRingBand(ctx, cam, { x: 0, y: 0 }, 0, 1.7, 'rgba(174, 143, 78, 0.055)', gold);
    for (const x of [-6.5, 0, 6.5]) worldLine(ctx, cam, [{ x, y: -5.5 }, { x, y: 5.5 }], gold);
  } else if (id === 'concept_oath_gallery') {
    worldPolygon(ctx, cam, [
      { x: 0, y: -5 }, { x: 3.1, y: 0 }, { x: 0, y: 5 }, { x: -3.1, y: 0 },
    ], 'rgba(95, 65, 43, 0.16)', gold);
    worldPolygon(ctx, cam, [
      { x: 0, y: -3.3 }, { x: 1.8, y: 0 }, { x: 0, y: 3.3 }, { x: -1.8, y: 0 },
    ], 'rgba(11, 10, 16, 0.28)', gold);
    for (const x of [-6.8, 6.8]) {
      worldRect(ctx, cam, x - 0.16, -5.5, x + 0.16, 5.5, 'rgba(160, 125, 70, 0.1)', gold);
    }
  } else if (id === 'concept_bell_court') {
    worldRingBand(ctx, cam, { x: 0, y: 0 }, 1.25, 2.2, 'rgba(161, 127, 66, 0.09)', gold);
    worldRingBand(ctx, cam, { x: 0, y: 0 }, 0, 1.25, 'rgba(8, 9, 15, 0.26)', gold);
    for (let index = 0; index < 8; index += 1) {
      const angle = (index * Math.PI) / 4;
      worldLine(ctx, cam, [
        { x: Math.cos(angle) * 1.3, y: Math.sin(angle) * 1.3 },
        { x: Math.cos(angle) * 6.4, y: Math.sin(angle) * 5.4 },
      ], gold);
    }
  } else if (id === 'concept_shattered_dais') {
    worldRingBand(
      ctx,
      cam,
      { x: 0, y: 0.3 },
      2.55,
      3.1,
      'rgba(156, 126, 71, 0.08)',
      gold,
    );
    for (const shard of [
      [{ x: -2.8, y: 1.4 }, { x: -1.2, y: -1.9 }, { x: -0.25, y: 0.2 }, { x: -0.8, y: 2.1 }],
      [{ x: 0.2, y: 0.1 }, { x: 1.3, y: -2.1 }, { x: 2.8, y: 1.4 }, { x: 0.9, y: 2.2 }],
      [{ x: -0.2, y: -0.1 }, { x: 0.45, y: -3.1 }, { x: 1.1, y: -0.2 }],
    ]) worldPolygon(ctx, cam, shard, '#9b865c', gold);
    for (let step = 0; step < 5; step += 1) {
      worldRect(ctx, cam, -3.5 - step * 0.35, -6.1 + step * 0.55, 3.5 + step * 0.35, -5.75 + step * 0.55, stoneLight, gold);
    }
  } else if (id === 'concept_guard_procession') {
    for (const x of [-4.2, 0, 4.2]) {
      worldRect(
        ctx,
        cam,
        x - 0.22,
        -5.2,
        x + 0.22,
        5.2,
        'rgba(144, 43, 48, 0.12)',
        gold,
      );
      for (const y of [-3.8, -1.2, 1.2, 3.8]) worldRing(ctx, cam, { x, y }, 0.18, gold, 1);
    }
  } else if (id === 'concept_violet_chancellery') {
    const violet = 'rgba(182, 104, 220, 0.78)';
    worldRingBand(ctx, cam, { x: 0, y: 0 }, 2.7, 4.4, 'rgba(111, 54, 137, 0.075)', violet);
    worldRingBand(ctx, cam, { x: 0, y: 0 }, 1.4, 2.7, 'rgba(7, 7, 14, 0.22)', violet);
    worldRingBand(ctx, cam, { x: 0, y: 0 }, 0, 1.4, 'rgba(111, 54, 137, 0.1)', violet);
    worldPolygon(ctx, cam, [
      { x: 0, y: -1.2 }, { x: 1.2, y: 0 }, { x: 0, y: 1.2 }, { x: -1.2, y: 0 },
    ], 'rgba(106, 50, 126, 0.16)', violet);
  } else if (id === 'concept_prop_gallery') {
    drawConceptFloorPlacements(ctx, cam, pal, OCCUPIED_FLOOR_FLUSH);
  } else if (id === 'concept_kit_gallery') {
    drawConstructionFloors(ctx, cam, CONSTRUCTION_FLOORS);
  } else if (id === 'concept_rookery_roofs') {
    paintField(ctx, world, cam, voidFill);
    for (const roof of [
      [-10.8, -6.7, -2.3, -1.4], [-4.2, -3.5, 3.8, 2.4],
      [2.2, -1.1, 10.5, 2.3], [-10.5, 2.1, -2.5, 7],
    ] as const) worldRect(ctx, cam, roof[0], roof[1], roof[2], roof[3], stoneLight, gold);
    worldRect(ctx, cam, -3.4, -1, 7.5, 0.75, stone, gold);
  } else if (id === 'concept_chainbridge_court') {
    paintField(ctx, world, cam, voidFill);
    worldRect(ctx, cam, -10.5, -2.2, 10.5, 2.2, stoneLight, gold);
    worldRect(ctx, cam, -2.25, -7.2, 2.25, 7.2, stoneLight, gold);
    worldRing(ctx, cam, { x: 0, y: 0 }, 1.25, gold);
    for (const y of [-1.75, 1.75]) worldLine(ctx, cam, [{ x: -10.5, y }, { x: 10.5, y }], gold);
  } else if (id === 'concept_flooded_nave') {
    paintField(ctx, world, cam, '#0a1823');
    for (const island of [
      [-10, -6.5, -5.5, -2.6], [-2.2, -6.3, 2.5, -3.1], [5.8, -6.5, 10.6, -2.5],
      [-8.8, -0.6, -3.7, 3.2], [0.4, -0.2, 4.6, 3.6], [5.7, 3.1, 10.5, 6.8],
      [-4.2, 4.3, 0.2, 7],
    ] as const) worldRect(ctx, cam, island[0], island[1], island[2], island[3], stoneLight, gold);
    ctx.globalAlpha = 0.3;
    for (const y of [-5, -2.5, 0, 2.5, 5]) worldLine(ctx, cam, [{ x: -11, y }, { x: 11, y: y + 0.8 }], '#6ca2c5');
  } else if (id === 'concept_bell_foundry') {
    paintField(ctx, world, cam, voidFill);
    worldRect(ctx, cam, -11, -1.6, 11, 1.6, stoneLight, gold);
    worldRect(ctx, cam, -1.8, -7, 1.8, 7, stoneLight, gold);
    for (const at of [{ x: -7, y: -4.7 }, { x: 7, y: 4.8 }]) {
      worldRing(ctx, cam, at, 2.15, '#e1712f', 2, '#31120c');
    }
  } else if (id === 'concept_archive_spiral') {
    paintField(ctx, world, cam, voidFill);
    const bands = [
      [-10.5, -6.7, 10.5, -4.3], [8.1, -4.3, 10.5, 5.8],
      [-8.3, 3.5, 10.5, 5.8], [-8.3, -2.5, -5.8, 3.5],
      [-5.8, -2.5, 5.7, -0.2], [3.3, -0.2, 5.7, 2.3],
      [-2.8, 0.1, 3.3, 2.3],
    ] as const;
    bands.forEach((band) => worldRect(ctx, cam, band[0], band[1], band[2], band[3], stoneLight, gold));
  } else if (id === 'concept_hollow_throne') {
    paintField(ctx, world, cam, voidFill);
    worldPolygon(ctx, cam, Array.from({ length: 10 }, (_, index) => {
      const angle = Math.PI / 10 + (index * Math.PI * 2) / 10;
      return { x: Math.cos(angle) * 5.5, y: Math.sin(angle) * 4.6 };
    }), stoneLight, gold);
    worldRect(ctx, cam, -2, -7.1, 2, -3.4, stoneLight, gold);
    worldRect(ctx, cam, -10.8, 2.8, -3.7, 5.7, stoneLight, gold);
    worldRect(ctx, cam, 3.7, 2.8, 10.8, 5.7, stoneLight, gold);
    worldRing(ctx, cam, { x: 0, y: 0 }, 2.2, gold);
  }
  ctx.restore();
};

export const conceptArenaScene = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  pal: Palette,
): ConceptArenaScene => {
  const timeMs = world.tick * (1000 / 120);

  const clutter = isGeneratedEncounter(world.encounter.defId)
    ? dressGeneratedRoom(world.arena, world.rng.seed).placements
    : conceptRoomClutter(world.encounter.defId);
  const kitBodies = conceptKitBodies(ctx, cam, pal, timeMs, clutter);
  if (world.encounter.defId === 'concept_bell_court') {
    const bells = [-7.2, -4.8, -2.4, 0, 2.4, 4.8, 7.2].map((x, index): SceneBody => {
      const at = { x, y: -6.15 };
      return { at, draw: () => drawBell(ctx, cam, pal, at, index, timeMs) };
    });
    return { bodies: [...bells, ...kitBodies] };
  }
  if (world.encounter.defId === 'concept_shattered_dais') {
    return { bodies: kitBodies };
  }
  if (world.encounter.defId === 'concept_rain_breached_hall') {
    const catchers = [-6.2, 0, 6.2].map((x, index): SceneBody => {
      const at = { x, y: -5 };
      return { at, draw: () => drawRainCatch(ctx, cam, pal, at, index, timeMs) };
    });
    return { bodies: catchers };
  }
  if (world.encounter.defId === 'concept_prop_gallery') {
    return {
      bodies: conceptKitBodies(ctx, cam, pal, timeMs, OCCUPIED_FLOOR_SOLIDS),
    };
  }
  if (world.encounter.defId === 'concept_kit_gallery') {
    return {
      bodies: constructionKitBodies(
        ctx,
        cam,
        pal,
        CONSTRUCTION_WALLS,
        CONSTRUCTION_WINDOWS,
        CONSTRUCTION_DETAILS,
      ),
    };
  }
  if (world.encounter.defId === 'concept_clutter_gallery') {
    return {
      bodies: conceptKitBodies(ctx, cam, pal, timeMs, NARRATIVE_CLUTTER_GALLERY),
    };
  }
  if (world.encounter.defId === 'concept_lantern_cloister') {
    return {
      bodies: [...[-7, -3.5, 0, 3.5, 7].map((x, index) => {
        const at = { x, y: -6.1 };
        return { at, draw: () => drawLantern(ctx, cam, pal, at, index, timeMs) };
      }), ...kitBodies],
    };
  }
  if (
    world.encounter.defId === 'concept_oath_gallery' ||
    world.encounter.defId === 'concept_guard_procession' ||
    world.encounter.defId === 'concept_violet_chancellery' ||
    world.encounter.defId === 'concept_chainbridge_court' ||
    world.encounter.defId === 'concept_flooded_nave'
  ) return { bodies: kitBodies };
  if (world.encounter.defId === 'concept_rookery_roofs') {
    const sites = [
      { x: -8, y: -4.8, h: 86 }, { x: -3, y: -2.2, h: 70 },
      { x: 4.7, y: 0.2, h: 82 }, { x: -7.5, y: 5.1, h: 76 },
      { x: 8.3, y: -0.1, h: 68 },
    ];
    return { bodies: [...sites.map(({ x, y, h }) => {
      const at = { x, y };
      return { at, draw: () => drawSpire(ctx, cam, pal, at, h) };
    }), ...kitBodies] };
  }
  if (world.encounter.defId === 'concept_bell_foundry') {
    const bells = [
      { x: -7.5, y: -0.4 }, { x: -3.8, y: -0.3 }, { x: 0, y: -0.2 },
      { x: 3.8, y: -0.3 }, { x: 7.5, y: -0.4 },
    ];
    const bodies: SceneBody[] = bells.map((at, index) => ({
      at, draw: () => drawBell(ctx, cam, pal, at, index, timeMs),
    }));
    for (const at of [{ x: -7, y: -4.7 }, { x: 7, y: 4.8 }]) {
      bodies.push({ at, draw: () => drawFurnace(ctx, cam, pal, at, 2.15, timeMs) });
    }
    return { bodies: [...bodies, ...kitBodies] };
  }
  if (world.encounter.defId === 'concept_archive_spiral') {
    return {
      bodies: [...[
        { x: -9.1, y: -5.2 }, { x: 9.2, y: -3.1 },
        { x: -7.1, y: 2.3 }, { x: 4.5, y: 1.1 },
      ].map((at) => ({ at, draw: () => drawShelf(ctx, cam, pal, at) })), ...kitBodies],
    };
  }
  if (world.encounter.defId === 'concept_hollow_throne') {
    const at = { x: 0, y: -3.7 };
    return { bodies: [{ at, draw: () => drawThrone(ctx, cam, pal, at) }, ...kitBodies] };
  }
  return {};
};
