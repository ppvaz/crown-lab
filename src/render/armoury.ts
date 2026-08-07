
import type { PowerKind, Vec2 } from '../sim/types';
import type { Palette } from './palette';
import type { PowerStand } from '../game/armoury';
import { standPrompt } from '../game/armoury';
import type { Camera } from './iso';
import { groundEllipse, worldToScreen } from './iso';
import { drawDischargeGlow } from './lightning';
import type { LayoutFrame } from './layout';
import { drawFloatingLabel } from './text';

const TAU = Math.PI * 2;

export const POWER_COLOR: Record<Exclude<PowerKind, 'none'>, string> = {
  lightning: '#7fd4ff',
  blink: '#ffd873',
  pull: '#7de0d0',
  push: '#ffffff',
  freeze: '#78e7ff',
  incinerate: '#ff7a35',
  turncoat: '#c47aff',
};

export const drawSigil = (
  ctx: CanvasRenderingContext2D,
  kind: Exclude<PowerKind, 'none'>,
  at: Vec2,
  r: number,
): void => {
  const { x, y } = at;
  ctx.beginPath();
  switch (kind) {
    case 'lightning':
      ctx.moveTo(x + r * 0.25, y - r);
      ctx.lineTo(x - r * 0.5, y + r * 0.1);
      ctx.lineTo(x - r * 0.05, y + r * 0.1);
      ctx.lineTo(x - r * 0.25, y + r);
      ctx.lineTo(x + r * 0.5, y - r * 0.1);
      ctx.lineTo(x + r * 0.05, y - r * 0.1);
      ctx.closePath();
      break;
    case 'blink':
      ctx.moveTo(x - r, y);
      ctx.lineTo(x - r * 0.3, y);
      ctx.moveTo(x + r * 0.3, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x + r * 0.55, y - r * 0.4);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x + r * 0.55, y + r * 0.4);
      break;
    case 'pull':
      for (const s of [-1, 1]) {
        ctx.moveTo(x + s * r, y - r * 0.5);
        ctx.lineTo(x + s * r * 0.2, y);
        ctx.lineTo(x + s * r, y + r * 0.5);
      }
      break;
    case 'push':
      for (const s of [-1, 1]) {
        ctx.moveTo(x + s * r * 0.2, y - r * 0.5);
        ctx.lineTo(x + s * r, y);
        ctx.lineTo(x + s * r * 0.2, y + r * 0.5);
      }
      break;
    case 'freeze': {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      break;
    }
    case 'incinerate':
      ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x + r * 0.7, y, x, y + r);
      ctx.quadraticCurveTo(x - r * 0.7, y, x, y - r);
      break;
    case 'turncoat':
      ctx.arc(x, y, r * 0.8, 0.4, TAU - 0.4);
      break;
  }
  ctx.stroke();
};

type Point = readonly [number, number];

const polygon = (
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  fill: string | CanvasGradient | CanvasPattern,
  stroke?: string,
  lineWidth = 1,
): void => {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke !== undefined) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
};

const openPath = (
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  stroke: string,
  lineWidth: number,
): void => {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
};

const diamond = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
  stroke: string,
): void => {
  polygon(
    ctx,
    [
      [x, y - r],
      [x + r * 0.72, y],
      [x, y + r],
      [x - r * 0.72, y],
    ],
    fill,
    stroke,
    1,
  );
};

const drawRelicBase = (
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  color: string,
  strength: number,
): void => {
  polygon(ctx, [[-16, -9], [0, -17], [16, -9], [0, -1]], pal.garment, pal.playerAccent, 1);
  polygon(ctx, [[-16, -9], [0, -1], [0, 4], [-16, -4]], pal.wall, pal.playerAccent, 0.8);
  polygon(ctx, [[0, -1], [16, -9], [16, -4], [0, 4]], pal.floor, pal.playerAccent, 0.8);

  polygon(ctx, [[-12, -16], [0, -22], [12, -16], [0, -10]], pal.wall, pal.playerAccent, 0.9);
  polygon(ctx, [[-12, -16], [0, -10], [0, -6], [-12, -12]], pal.floor, pal.playerAccent, 0.7);
  polygon(ctx, [[0, -10], [12, -16], [12, -12], [0, -6]], pal.garment, pal.playerAccent, 0.7);

  ctx.save();
  ctx.globalAlpha = 0.45 + strength * 0.45;
  diamond(ctx, 0, -5, 2.3, color, pal.playerAccent);
  ctx.restore();
};

const drawStormRelic = (
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  color: string,
  strength: number,
  pulse: number,
): void => {
  drawDischargeGlow(ctx, { x: 0, y: -45 }, color, 16 * pulse, strength);
  polygon(ctx, [[-13, -20], [-15, -68], [-9, -59], [-8, -42], [-3, -52], [-2, -20]], pal.wall, pal.playerAccent, 0.8);
  polygon(ctx, [[13, -20], [14, -59], [8, -51], [7, -35], [3, -45], [2, -20]], pal.floor, pal.playerAccent, 0.8);
  polygon(ctx, [[-8, -20], [-10, -46], [-4, -39], [-1, -57], [2, -42], [5, -48], [7, -20]], pal.garment, pal.wall, 0.9);
  polygon(ctx, [[-4, -21], [-6, -36], [-2, -33], [0, -50], [4, -39], [1, -29], [5, -21]], color);
  ctx.save();
  ctx.globalAlpha = 0.8 * strength;
  openPath(ctx, [[1, -62], [-3, -47], [1, -47], [-3, -29]], '#ffffff', 1.2);
  ctx.restore();
};

const drawBlinkRelic = (
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  color: string,
  strength: number,
  pulse: number,
): void => {
  drawDischargeGlow(ctx, { x: 0, y: -43 }, color, 17 * pulse, strength);
  polygon(ctx, [[-13, -20], [-13, -63], [-2, -71], [-2, -62], [-8, -57], [-8, -20]], pal.garment, pal.playerAccent, 1);
  polygon(ctx, [[13, -20], [13, -55], [4, -61], [4, -53], [8, -49], [8, -20]], pal.wall, pal.playerAccent, 1);
  diamond(ctx, -4, -55, 3, pal.floor, pal.playerAccent);
  diamond(ctx, 7, -44, 2.4, pal.floor, pal.playerAccent);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  ctx.globalAlpha = strength;
  openPath(ctx, [[-5, -22], [4, -29], [4, -35]], color, 5.5);
  openPath(ctx, [[4, -42], [-3, -49], [2, -57]], color, 5.5);
  ctx.globalAlpha = 0.85;
  openPath(ctx, [[-5, -22], [4, -29], [4, -35]], '#ffffff', 1.1);
  openPath(ctx, [[4, -42], [-3, -49], [2, -57]], '#ffffff', 1.1);
  ctx.restore();
};

const drawPullRelic = (
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  color: string,
  strength: number,
  pulse: number,
): void => {
  drawDischargeGlow(ctx, { x: 3, y: -43 }, color, 15 * pulse, strength);
  const talons: readonly (readonly Point[])[] = [
    [[-12, -20], [-15, -45], [-10, -61], [-1, -69], [8, -65], [2, -61], [-4, -62], [-8, -55], [-7, -20]],
    [[-7, -21], [-9, -42], [-5, -55], [3, -62], [12, -58], [5, -55], [0, -56], [-3, -48], [-2, -21]],
    [[0, -21], [-1, -39], [4, -51], [13, -53], [8, -48], [3, -46], [5, -37], [6, -21]],
  ];
  talons.forEach((points, i) =>
    polygon(ctx, points, i === 1 ? pal.garment : pal.wall, pal.playerAccent, 0.8),
  );
  diamond(ctx, -8, -34, 2.4, pal.floor, pal.playerAccent);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(3, -43, 5.5, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(1.5, -45, 1.7, 0, TAU);
  ctx.fill();
  ctx.restore();
};

const drawPushRelic = (
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  color: string,
  strength: number,
  pulse: number,
): void => {
  drawDischargeGlow(ctx, { x: 0, y: -42 }, color, 16 * pulse, strength);
  polygon(ctx, [[-12, -20], [-15, -48], [-10, -63], [-2, -71], [-5, -54], [-2, -46], [-4, -20]], pal.hudText, pal.playerAccent, 1);
  polygon(ctx, [[12, -20], [15, -48], [10, -63], [2, -71], [5, -54], [2, -46], [4, -20]], pal.player, pal.playerAccent, 1);
  polygon(ctx, [[-11, -24], [-11, -46], [-6, -58], [-7, -43], [-4, -36], [-5, -24]], pal.garment, pal.wall, 0.8);
  polygon(ctx, [[11, -24], [11, -46], [6, -58], [7, -43], [4, -36], [5, -24]], pal.garment, pal.wall, 0.8);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, -42, 6, 0, TAU);
  ctx.fill();
  diamond(ctx, -10, -31, 2.1, pal.floor, pal.playerAccent);
  diamond(ctx, 10, -31, 2.1, pal.floor, pal.playerAccent);
};

const drawFreezeRelic = (
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  color: string,
  strength: number,
  pulse: number,
): void => {
  drawDischargeGlow(ctx, { x: 0, y: -44 }, color, 17 * pulse, strength);
  const glass = ctx.createLinearGradient(-12, -44, 12, -44);
  glass.addColorStop(0, pal.wall);
  glass.addColorStop(0.35, color);
  glass.addColorStop(0.7, '#d9f7ff');
  glass.addColorStop(1, pal.garment);
  polygon(ctx, [[-9, -22], [-13, -48], [-8, -60], [-5, -64], [5, -64], [8, -60], [13, -48], [9, -22]], glass, pal.playerAccent, 1);
  ctx.save();
  ctx.globalAlpha = 0.3;
  polygon(ctx, [[-9, -22], [-13, -48], [0, -38], [0, -22]], '#ffffff');
  polygon(ctx, [[0, -22], [0, -38], [13, -48], [9, -22]], pal.floor);
  polygon(ctx, [[-13, -48], [-8, -60], [0, -52], [0, -38]], '#ffffff');
  ctx.restore();

  polygon(ctx, [[-7, -63], [0, -68], [7, -63], [0, -59]], pal.floor, pal.playerAccent, 1);
  polygon(ctx, [[-4, -68], [0, -75], [4, -68], [0, -64]], pal.garment, pal.playerAccent, 1);
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.3;
  ctx.globalAlpha = 0.85 * strength;
  drawSigil(ctx, 'freeze', { x: 0, y: -42 }, 6);
  ctx.restore();
};

const drawIncinerateRelic = (
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  color: string,
  strength: number,
  pulse: number,
): void => {
  drawDischargeGlow(ctx, { x: 0, y: -47 }, color, 20 * pulse, strength);
  polygon(ctx, [[-13, -20], [-15, -47], [-9, -38], [-7, -55], [-2, -43], [0, -20]], pal.wall, pal.playerAccent, 0.9);
  polygon(ctx, [[13, -20], [15, -47], [9, -38], [7, -55], [2, -43], [0, -20]], pal.floor, pal.playerAccent, 0.9);
  ctx.fillStyle = pal.wall;
  ctx.beginPath();
  ctx.ellipse(0, -28, 13, 6, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = pal.playerAccent;
  ctx.lineWidth = 2;
  ctx.stroke();

  polygon(ctx, [[0, -27], [-7, -39], [-4, -58], [0, -51], [3, -69], [8, -48], [6, -36]], color);
  polygon(ctx, [[0, -28], [-4, -40], [0, -54], [3, -45], [5, -36]], '#ffd873');
  polygon(ctx, [[0, -29], [-1.8, -39], [1, -46], [2.2, -36]], '#ffffff');
};

const drawTurncoatRelic = (
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  color: string,
  strength: number,
  pulse: number,
): void => {
  drawDischargeGlow(ctx, { x: 0, y: -43 }, color, 17 * pulse, strength);
  polygon(ctx, [[-5, -21], [-7, -49], [-3, -59], [2, -61], [6, -50], [5, -21]], color, pal.playerAccent, 0.9);
  ctx.save();
  ctx.globalAlpha = 0.35;
  polygon(ctx, [[-5, -21], [-7, -49], [0, -43], [0, -22]], '#ffffff');
  polygon(ctx, [[0, -22], [0, -43], [6, -50], [5, -21]], pal.floor);
  ctx.restore();

  polygon(ctx, [[-13, -20], [-14, -42], [-10, -52], [-13, -61], [-9, -70], [-3, -66], [-5, -57], [-2, -50], [-5, -43], [-6, -20]], pal.hudText, pal.playerAccent, 0.9);
  polygon(ctx, [[13, -20], [14, -42], [9, -48], [12, -58], [7, -66], [3, -63], [5, -54], [2, -48], [5, -40], [6, -20]], pal.player, pal.playerAccent, 0.9);
  openPath(ctx, [[-10, -52], [-6, -49], [-8, -43]], pal.wall, 1);
  openPath(ctx, [[9, -48], [6, -45], [8, -39]], pal.wall, 1);
};

const drawRelic = (
  ctx: CanvasRenderingContext2D,
  kind: Exclude<PowerKind, 'none'>,
  pal: Palette,
  color: string,
  strength: number,
  pulse: number,
): void => {
  switch (kind) {
    case 'lightning':
      drawStormRelic(ctx, pal, color, strength, pulse);
      break;
    case 'blink':
      drawBlinkRelic(ctx, pal, color, strength, pulse);
      break;
    case 'pull':
      drawPullRelic(ctx, pal, color, strength, pulse);
      break;
    case 'push':
      drawPushRelic(ctx, pal, color, strength, pulse);
      break;
    case 'freeze':
      drawFreezeRelic(ctx, pal, color, strength, pulse);
      break;
    case 'incinerate':
      drawIncinerateRelic(ctx, pal, color, strength, pulse);
      break;
    case 'turncoat':
      drawTurncoatRelic(ctx, pal, color, strength, pulse);
      break;
  }
};

export const drawPowerObject = (
  ctx: CanvasRenderingContext2D,
  kind: Exclude<PowerKind, 'none'>,
  at: Vec2,
  scale: number,
  pal: Palette,
  strength: number,
  pulse: number,
): void => {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.scale(scale, scale);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  drawRelic(ctx, kind, pal, POWER_COLOR[kind], strength, pulse);
  ctx.restore();
};

export const drawPowerStand = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  stand: PowerStand,
  equipped: boolean,
  near: boolean,
  timeMs: number,
  index: number,
): void => {
  const p = worldToScreen(cam, stand.at);
  const z = cam.zoom;
  const color = POWER_COLOR[stand.kind];
  const pulse = 0.85 + 0.15 * Math.sin(timeMs / 620 + index * 1.4);
  const strength = equipped ? 1 : near ? 0.82 : 0.58;

  const ellipse = groundEllipse(cam, 0.42);
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, ellipse.rx, ellipse.ry, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.translate(p.x, p.y);
  ctx.scale(z, z);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  drawRelicBase(ctx, pal, color, strength);
  ctx.restore();
  drawPowerObject(ctx, stand.kind, p, z, pal, strength, pulse);
};

export const drawStandLabel = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  frame: LayoutFrame,
  stand: PowerStand,
  equipped: boolean,
  interact: string,
): void => {
  const p = worldToScreen(cam, stand.at);
  const type = frame.type;
  const y = p.y - 84 * cam.zoom;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `${Math.max(type.base, type.base * cam.zoom)}px ui-monospace, monospace`;
  ctx.fillStyle = POWER_COLOR[stand.kind];
  drawFloatingLabel(ctx, 'armoury.stand.label', stand.label, frame.content, p.x, y);



  ctx.font = `${Math.max(type.base, type.base * cam.zoom)}px ui-monospace, monospace`;
  ctx.fillStyle = equipped ? pal.hudDim : pal.hudText;
  const note = equipped ? 'CARRIED' : stand.teaches;
  drawFloatingLabel(ctx, 'armoury.stand.note', note, frame.content, p.x, y + type.base * 1.25);


  const offer = standPrompt(stand, equipped ? stand.kind : 'none', interact);
  if (offer !== null) {
    const promptY = y + type.base * 2.6;
    ctx.font = `${Math.max(type.base, type.base * cam.zoom)}px ui-monospace, monospace`;
    ctx.fillStyle = pal.playerAccent;
    drawFloatingLabel(ctx, 'armoury.stand.prompt', offer, frame.content, p.x, promptY);
  }
  ctx.restore();
};
