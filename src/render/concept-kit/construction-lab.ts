import type {
  ConstructionDetailKind,
  ConstructionVerticalPlacement,
  ConstructionWallKind,
  ConstructionWindowKind,
} from '../../lab/concept-kit';
import type { SceneBody } from '../draw';
import { type Camera, worldToScreen } from '../iso';
import type { Palette } from '../palette';
import { shape } from './shape-lab';

const drawConstructionWall = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  placement: ConstructionVerticalPlacement<ConstructionWallKind>,
): void => {
  const p = worldToScreen(cam, placement.at);
  const z = cam.zoom;
  const line = Math.max(0.8, cam.zoom);
  ctx.save();
  ctx.fillStyle = pal.wall;
  ctx.strokeStyle = '#a68349';
  ctx.lineWidth = line;
  ctx.fillRect(p.x - 22 * z, p.y - 62 * z, 44 * z, 62 * z);
  ctx.strokeRect(p.x - 22 * z, p.y - 62 * z, 44 * z, 62 * z);
  ctx.fillStyle = pal.garment;
  ctx.fillRect(p.x - 25 * z, p.y - 65 * z, 50 * z, 7 * z);
  ctx.fillRect(p.x - 25 * z, p.y - 5 * z, 50 * z, 5 * z);

  if (placement.kind === 'plain_heraldic_panel') {
    ctx.strokeRect(p.x - 14 * z, p.y - 53 * z, 28 * z, 43 * z);
    shape(ctx, [[p.x, p.y - 45 * z], [p.x + 5 * z, p.y - 33 * z], [p.x, p.y - 21 * z], [p.x - 5 * z, p.y - 33 * z]], pal.floor, '#a68349', line);
  } else if (placement.kind === 'red_standard_arms') {
    shape(ctx, [[p.x - 18 * z, p.y - 58 * z], [p.x + 2 * z, p.y - 58 * z], [p.x, p.y - 9 * z], [p.x - 9 * z, p.y - 16 * z], [p.x - 18 * z, p.y - 9 * z]], '#702c34', '#c4a25a', line);
    ctx.strokeRect(p.x + 6 * z, p.y - 45 * z, 10 * z, 31 * z);
  } else if (placement.kind === 'violet_record_panels') {
    ctx.fillStyle = '#432d52';
    for (const x of [-13, 1]) {
      ctx.fillRect(p.x + x * z, p.y - 53 * z, 12 * z, 42 * z);
      ctx.strokeRect(p.x + x * z, p.y - 53 * z, 12 * z, 42 * z);
    }
    ctx.strokeStyle = '#9f65b4';
    for (const y of [-44, -34, -24]) {
      ctx.beginPath();
      ctx.moveTo(p.x - 10 * z, p.y + y * z);
      ctx.lineTo(p.x + 10 * z, p.y + y * z);
      ctx.stroke();
    }
  } else if (placement.kind === 'breached_masonry') {
    ctx.fillStyle = '#090a0f';
    shape(ctx, [
      [p.x + 3 * z, p.y - 62 * z],
      [p.x + 19 * z, p.y - 50 * z],
      [p.x + 10 * z, p.y - 36 * z],
      [p.x + 22 * z, p.y - 18 * z],
      [p.x + 5 * z, p.y],
      [p.x - 1 * z, p.y - 20 * z],
      [p.x + 5 * z, p.y - 36 * z],
    ], '#090a0f', '#5f5d5b', line);
    for (const y of [-50, -34, -18]) {
      ctx.beginPath();
      ctx.moveTo(p.x - 20 * z, p.y + y * z);
      ctx.lineTo(p.x - 2 * z, p.y + (y + 3) * z);
      ctx.stroke();
    }
  } else if (placement.kind === 'blind_pale_arches') {
    ctx.fillStyle = '#aaa18e';
    ctx.fillRect(p.x - 18 * z, p.y - 55 * z, 36 * z, 48 * z);
    ctx.strokeStyle = pal.garment;
    for (const x of [-11, 0, 11]) {
      ctx.beginPath();
      ctx.moveTo(p.x + (x - 5) * z, p.y - 8 * z);
      ctx.lineTo(p.x + (x - 5) * z, p.y - 37 * z);
      ctx.lineTo(p.x + x * z, p.y - 48 * z);
      ctx.lineTo(p.x + (x + 5) * z, p.y - 37 * z);
      ctx.lineTo(p.x + (x + 5) * z, p.y - 8 * z);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = '#6f6c69';
    for (const y of [-50, -35, -20]) {
      ctx.beginPath();
      ctx.moveTo(p.x - 20 * z, p.y + y * z);
      ctx.lineTo(p.x + 20 * z, p.y + y * z);
      ctx.stroke();
    }
    ctx.strokeStyle = '#c59b4b';
    ctx.beginPath();
    ctx.moveTo(p.x + 9 * z, p.y - 54 * z);
    ctx.lineTo(p.x + 9 * z, p.y - 31 * z);
    ctx.stroke();
    ctx.fillStyle = '#f3c66b';
    ctx.fillRect(p.x + 4 * z, p.y - 31 * z, 10 * z, 14 * z);
  }
  ctx.restore();
};

const windowOutline = (
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number },
  z: number,
): void => {
  ctx.beginPath();
  ctx.moveTo(p.x - 14 * z, p.y);
  ctx.lineTo(p.x - 14 * z, p.y - 42 * z);
  ctx.lineTo(p.x, p.y - 62 * z);
  ctx.lineTo(p.x + 14 * z, p.y - 42 * z);
  ctx.lineTo(p.x + 14 * z, p.y);
  ctx.closePath();
};

const drawConstructionWindow = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  placement: ConstructionVerticalPlacement<ConstructionWindowKind>,
): void => {
  const p = worldToScreen(cam, placement.at);
  const z = cam.zoom;
  const line = Math.max(0.8, cam.zoom);
  ctx.save();
  windowOutline(ctx, p, z);
  ctx.fillStyle =
    placement.kind === 'violet_diamond_glass'
      ? '#443252'
      : placement.kind === 'clear_heraldic_lancet'
        ? '#344452'
        : '#090a10';
  ctx.strokeStyle = '#9f824c';
  ctx.lineWidth = line;
  ctx.fill();
  ctx.stroke();

  if (placement.kind === 'clear_heraldic_lancet') {
    shape(ctx, [[p.x, p.y - 48 * z], [p.x + 5 * z, p.y - 31 * z], [p.x, p.y - 15 * z], [p.x - 5 * z, p.y - 31 * z]], 'rgba(88, 119, 138, 0.45)', '#c0a15d', line);
  } else if (placement.kind === 'deep_empty_lancet') {
    ctx.strokeStyle = '#55535c';
    ctx.strokeRect(p.x - 9 * z, p.y - 39 * z, 18 * z, 37 * z);
    ctx.beginPath();
    ctx.moveTo(p.x + 14 * z, p.y - 42 * z);
    ctx.lineTo(p.x + 20 * z, p.y - 37 * z);
    ctx.lineTo(p.x + 20 * z, p.y + 4 * z);
    ctx.lineTo(p.x + 14 * z, p.y);
    ctx.stroke();
  } else if (placement.kind === 'barred_slit') {
    ctx.fillStyle = '#161722';
    ctx.fillRect(p.x - 7 * z, p.y - 45 * z, 14 * z, 42 * z);
    ctx.strokeStyle = '#8b7652';
    for (const x of [-4, 0, 4]) {
      ctx.beginPath();
      ctx.moveTo(p.x + x * z, p.y - 44 * z);
      ctx.lineTo(p.x + x * z, p.y - 3 * z);
      ctx.stroke();
    }
  } else if (placement.kind === 'violet_diamond_glass') {
    ctx.strokeStyle = '#ad72c1';
    for (const y of [-39, -25, -11]) {
      shape(ctx, [[p.x, p.y + (y - 7) * z], [p.x + 7 * z, p.y + y * z], [p.x, p.y + (y + 7) * z], [p.x - 7 * z, p.y + y * z]], 'rgba(101, 59, 122, 0.22)', '#ad72c1', line);
    }
  } else if (placement.kind === 'rose_window') {
    const centreY = p.y - 31 * z;
    ctx.strokeStyle = '#a978a8';
    ctx.beginPath();
    ctx.arc(p.x, centreY, 10 * z, 0, Math.PI * 2);
    ctx.stroke();
    for (let index = 0; index < 8; index += 1) {
      const angle = (index * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(p.x, centreY);
      ctx.lineTo(p.x + Math.cos(angle) * 10 * z, centreY + Math.sin(angle) * 10 * z);
      ctx.stroke();
    }
  } else if (placement.kind === 'empty_opening') {
    ctx.strokeStyle = '#56545c';
    ctx.lineWidth = 3 * line;
    windowOutline(ctx, p, z * 0.72);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#c2a05a';
    shape(ctx, [
      [p.x - 8 * z, p.y - 18 * z],
      [p.x - 6 * z, p.y - 36 * z],
      [p.x, p.y - 27 * z],
      [p.x + 6 * z, p.y - 36 * z],
      [p.x + 8 * z, p.y - 18 * z],
    ], 'rgba(127, 96, 45, 0.18)', '#c2a05a', line);
  }
  ctx.restore();
};

const drawConstructionDetail = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  placement: ConstructionVerticalPlacement<ConstructionDetailKind>,
): void => {
  const p = worldToScreen(cam, placement.at);
  const z = cam.zoom;
  const line = Math.max(0.75, cam.zoom);
  ctx.save();
  ctx.strokeStyle = '#aa884f';
  ctx.fillStyle = pal.wall;
  ctx.lineWidth = line;

  if (placement.kind === 'steps') {
    for (let index = 0; index < 3; index += 1) {
      ctx.fillRect(p.x - (15 - index * 3) * z, p.y - (index + 1) * 7 * z, (30 - index * 6) * z, 7 * z);
      ctx.strokeRect(p.x - (15 - index * 3) * z, p.y - (index + 1) * 7 * z, (30 - index * 6) * z, 7 * z);
    }
  } else if (placement.kind === 'trims') {
    ctx.fillRect(p.x - 18 * z, p.y - 18 * z, 36 * z, 18 * z);
    ctx.strokeRect(p.x - 18 * z, p.y - 18 * z, 36 * z, 18 * z);
    for (const x of [-10, 0, 10]) {
      shape(ctx, [[p.x + x * z, p.y - 14 * z], [p.x + (x + 4) * z, p.y - 9 * z], [p.x + x * z, p.y - 4 * z], [p.x + (x - 4) * z, p.y - 9 * z]], pal.floor, '#aa884f', line);
    }
  } else if (placement.kind === 'drains') {
    ctx.fillRect(p.x - 17 * z, p.y - 23 * z, 34 * z, 23 * z);
    ctx.strokeRect(p.x - 17 * z, p.y - 23 * z, 34 * z, 23 * z);
    for (const x of [-10, -5, 0, 5, 10]) {
      ctx.beginPath();
      ctx.moveTo(p.x + x * z, p.y - 18 * z);
      ctx.lineTo(p.x + x * z, p.y - 4 * z);
      ctx.stroke();
    }
  } else if (placement.kind === 'corbels') {
    ctx.fillRect(p.x - 15 * z, p.y - 42 * z, 30 * z, 12 * z);
    ctx.strokeRect(p.x - 15 * z, p.y - 42 * z, 30 * z, 12 * z);
    shape(ctx, [[p.x - 11 * z, p.y - 30 * z], [p.x, p.y - 7 * z], [p.x + 11 * z, p.y - 30 * z]], pal.wall, '#aa884f', line);
  } else if (placement.kind === 'sconces') {
    shape(ctx, [[p.x - 11 * z, p.y - 45 * z], [p.x + 11 * z, p.y - 45 * z], [p.x + 8 * z, p.y], [p.x - 8 * z, p.y]], pal.wall, '#aa884f', line);
    ctx.fillStyle = '#f0b451';
    ctx.beginPath();
    ctx.arc(p.x, p.y - 29 * z, 5 * z, 0, Math.PI * 2);
    ctx.fill();
  } else if (placement.kind === 'hanging_lanterns') {
    ctx.beginPath();
    ctx.moveTo(p.x + 14 * z, p.y - 55 * z);
    ctx.lineTo(p.x + 14 * z, p.y - 39 * z);
    ctx.lineTo(p.x, p.y - 32 * z);
    ctx.stroke();
    shape(ctx, [[p.x - 8 * z, p.y - 32 * z], [p.x + 8 * z, p.y - 32 * z], [p.x + 6 * z, p.y - 6 * z], [p.x - 6 * z, p.y - 6 * z]], '#d99c45', '#f1cb72', line);
  } else if (placement.kind === 'standards') {
    ctx.beginPath();
    ctx.moveTo(p.x - 12 * z, p.y);
    ctx.lineTo(p.x - 12 * z, p.y - 58 * z);
    ctx.lineTo(p.x + 14 * z, p.y - 58 * z);
    ctx.stroke();
    shape(ctx, [[p.x - 9 * z, p.y - 53 * z], [p.x + 13 * z, p.y - 53 * z], [p.x + 8 * z, p.y - 14 * z], [p.x + 1 * z, p.y - 21 * z], [p.x - 9 * z, p.y - 14 * z]], '#702c34', '#c3a15a', line);
  } else if (placement.kind === 'rain_chains') {
    for (let index = 0; index < 5; index += 1) {
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - (48 - index * 10) * z, 5 * z, 7 * z, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (placement.kind === 'memorial_statues') {
    ctx.fillRect(p.x - 14 * z, p.y - 8 * z, 28 * z, 8 * z);
    ctx.strokeRect(p.x - 14 * z, p.y - 8 * z, 28 * z, 8 * z);
    ctx.beginPath();
    ctx.arc(p.x, p.y - 45 * z, 6 * z, 0, Math.PI * 2);
    ctx.fill();
    shape(ctx, [[p.x - 9 * z, p.y - 38 * z], [p.x + 9 * z, p.y - 38 * z], [p.x + 12 * z, p.y - 8 * z], [p.x - 12 * z, p.y - 8 * z]], pal.garment, '#aa884f', line);
  } else if (placement.kind === 'balustrades') {
    ctx.fillRect(p.x - 20 * z, p.y - 35 * z, 40 * z, 6 * z);
    ctx.strokeRect(p.x - 20 * z, p.y - 35 * z, 40 * z, 6 * z);
    for (const x of [-14, -5, 5, 14]) {
      ctx.fillRect(p.x + (x - 2) * z, p.y - 29 * z, 4 * z, 29 * z);
    }
  } else {
    ctx.lineWidth = 3 * line;
    ctx.beginPath();
    ctx.moveTo(p.x - 16 * z, p.y);
    ctx.lineTo(p.x - 16 * z, p.y - 34 * z);
    ctx.lineTo(p.x, p.y - 55 * z);
    ctx.lineTo(p.x + 16 * z, p.y - 34 * z);
    ctx.lineTo(p.x + 16 * z, p.y);
    ctx.stroke();
  }
  ctx.restore();
};

export const constructionKitBodies = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  walls: readonly ConstructionVerticalPlacement<ConstructionWallKind>[],
  windows: readonly ConstructionVerticalPlacement<ConstructionWindowKind>[],
  details: readonly ConstructionVerticalPlacement<ConstructionDetailKind>[],
): SceneBody[] => [
  ...walls.map((placement) => ({
    at: placement.at,
    draw: () => drawConstructionWall(ctx, cam, pal, placement),
  })),
  ...windows.map((placement) => ({
    at: placement.at,
    draw: () => drawConstructionWindow(ctx, cam, placement),
  })),
  ...details.map((placement) => ({
    at: placement.at,
    draw: () => drawConstructionDetail(ctx, cam, pal, placement),
  })),
];
