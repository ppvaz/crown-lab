
import type { Palette } from './palette';
import { MARA } from '../game/escort';
import type { Camera } from './iso';
import { worldToScreen } from './iso';
import { attachment, drawCommands } from './actor-stack';
import { viewOf } from './models';
import { drawDischargeGlow } from './lightning';

import type { LayoutFrame } from './layout';
import { shade as shadeHex } from './palette';
import { drawSpeakerLabel } from './speaker-label';
import type { SceneBody } from './draw';

const TAU = Math.PI * 2;

const drawLantern = (
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number },
  color: string,
  z: number,
  flicker: number,
  tilt = 0,
): void => {
  drawDischargeGlow(ctx, at, color, 11 * z * flicker, 0.85);
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(tilt);
  ctx.strokeStyle = '#3a322b';
  ctx.fillStyle = '#19191d';
  ctx.lineWidth = Math.max(1, 1.15 * z);
  ctx.beginPath();
  ctx.arc(0, -2.8 * z, 3.1 * z, Math.PI, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-3.4 * z, -2.5 * z);
  ctx.lineTo(-2.7 * z, 3.4 * z);
  ctx.lineTo(2.7 * z, 3.4 * z);
  ctx.lineTo(3.4 * z, -2.5 * z);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, -1.7 * z);
  ctx.lineTo(1.8 * z, 0.3 * z);
  ctx.lineTo(0, 2.4 * z);
  ctx.lineTo(-1.8 * z, 0.3 * z);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

export const MARA_TOP_PX = 68;
export const MARA_DOWNED_TOP_PX = 14;

export const drawMaraFigure = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  at: { x: number; y: number },
  opts: { downed?: boolean; facing?: number; timeMs: number; gaitPhase?: number },
): void => {
  const z = cam.zoom;
  const h = 54 * z;
  const dir =
    opts.facing === undefined ? 1 : Math.cos(opts.facing) - Math.sin(opts.facing) >= 0 ? 1 : -1;
  const downed = opts.downed === true;


  const view = opts.facing === undefined ? 'front' : viewOf(opts.facing);


  const gait = opts.gaitPhase ?? 0;
  const walking = gait !== 0;
  const sway = walking ? Math.sin(gait) : 0;
  const bob = walking ? Math.abs(Math.cos(gait)) * 1.6 * z : 0;
  const hairLag = walking ? Math.sin(gait - 0.9) : 0;
  const base = { x: at.x, y: at.y - bob };

  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(at.x, at.y, 15 * z, 7 * z, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  const HAIR = '#e8cf94';

  if (downed) {
    ctx.fillStyle = shadeHex(pal.garment, 0.55);
    ctx.strokeStyle = pal.floor;
    ctx.lineWidth = Math.max(1, 1.4 * z);
    ctx.beginPath();
    ctx.ellipse(at.x, at.y - 4 * z, 16 * z, 6.5 * z, -0.22, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = HAIR;
    ctx.beginPath();
    ctx.ellipse(at.x - 13 * z * dir, at.y - 7 * z, 8 * z, 6 * z, -0.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = pal.player;
    ctx.beginPath();
    ctx.ellipse(at.x - 12 * z * dir, at.y - 8 * z, 4 * z, 4 * z, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    drawLantern(
      ctx,
      { x: at.x + 14 * z * dir, y: at.y - 2 * z },
      pal.playerAccent,
      z,
      0.72,
      0.35 * dir,
    );
    return;
  }

  const waistY = base.y - h * 0.52;
  const swing = sway * 2.2 * z;

  const paintFigure = (): void => {

    const wide = view === 'profile' ? 0.72 : 1;
    const hem = 13 * z * wide;
    const waist = 4.6 * z * wide;
    const shoulder = 8 * z * wide;
    const shoulderY = base.y - h * 0.72;

    const skirtLead = sway * 3.4 * z;
    const cloth = ctx.createLinearGradient(base.x - hem, 0, base.x + hem, 0);
    cloth.addColorStop(0, shadeHex(pal.garment, 0.6));
    cloth.addColorStop(0.34, shadeHex(pal.garment, 0.86));
    cloth.addColorStop(1, pal.floor);
    ctx.fillStyle = cloth;
    ctx.beginPath();
    ctx.moveTo(base.x - hem + skirtLead, at.y);
    ctx.quadraticCurveTo(base.x - hem * 0.72 + skirtLead * 0.5, waistY + h * 0.14, base.x - waist, waistY);
    ctx.lineTo(base.x + waist, waistY);
    ctx.quadraticCurveTo(base.x + hem * 0.72 + skirtLead * 0.5, waistY + h * 0.14, base.x + hem + skirtLead, at.y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = shadeHex(pal.garment, 0.48);
    ctx.beginPath();
    ctx.moveTo(base.x - waist, waistY);
    ctx.lineTo(base.x - 2 * z, at.y);
    ctx.lineTo(base.x - hem + skirtLead, at.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shadeHex(pal.garment, 0.72);
    ctx.beginPath();
    ctx.moveTo(base.x - waist, waistY);
    ctx.lineTo(base.x + waist, waistY);
    ctx.lineTo(base.x + 3 * z + skirtLead, at.y);
    ctx.lineTo(base.x - 2 * z + skirtLead, at.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shadeHex(pal.garment, 0.4);
    ctx.beginPath();
    ctx.moveTo(base.x + waist, waistY);
    ctx.lineTo(base.x + hem + skirtLead, at.y);
    ctx.lineTo(base.x + 3 * z + skirtLead, at.y);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = pal.playerAccent;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = Math.max(1, 1.3 * z);
    ctx.beginPath();
    ctx.moveTo(base.x - hem * 0.92 + skirtLead, at.y - 4 * z);
    ctx.quadraticCurveTo(base.x + skirtLead * 0.5, at.y - 1.5 * z, base.x + hem * 0.92 + skirtLead, at.y - 4 * z);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = shadeHex(pal.garment, 0.52);
    ctx.beginPath();
    ctx.moveTo(base.x - waist, waistY + 1 * z);
    ctx.quadraticCurveTo(base.x - shoulder * 0.78, waistY - h * 0.1, base.x - shoulder, shoulderY);
    ctx.lineTo(base.x + shoulder, shoulderY);
    ctx.quadraticCurveTo(base.x + shoulder * 0.78, waistY - h * 0.1, base.x + waist, waistY + 1 * z);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = shadeHex(pal.garment, 0.72);
    ctx.beginPath();
    ctx.moveTo(base.x, shoulderY - 2 * z);
    ctx.lineTo(base.x + shoulder, shoulderY);
    ctx.lineTo(base.x + waist, waistY);
    ctx.lineTo(base.x, waistY - 1 * z);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pal.player;
    ctx.beginPath();
    ctx.moveTo(base.x - 3.5 * z, shoulderY - 2 * z);
    ctx.lineTo(base.x, shoulderY + 2 * z);
    ctx.lineTo(base.x + 3.5 * z, shoulderY - 2 * z);
    ctx.lineTo(base.x + 2.5 * z, shoulderY - 5 * z);
    ctx.lineTo(base.x - 2.5 * z, shoulderY - 5 * z);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = shadeHex(pal.garment, 0.68);
    ctx.beginPath();
    ctx.moveTo(base.x - shoulder, shoulderY + 1 * z);
    ctx.quadraticCurveTo(base.x, shoulderY - 4.5 * z, base.x + shoulder, shoulderY + 1 * z);
    ctx.quadraticCurveTo(base.x, shoulderY + 3 * z, base.x - shoulder, shoulderY + 1 * z);
    ctx.closePath();
    ctx.fill();



    const head = { x: base.x, y: base.y - h * 0.86 };
    const lag = hairLag * 2.2 * z;
    const spread = (view === 'profile' ? 10 : 13) * z;
    const fall = 28 * z;

    ctx.fillStyle = HAIR;
    ctx.beginPath();
    ctx.moveTo(head.x - 8 * z, head.y - 4 * z);
    ctx.quadraticCurveTo(head.x - spread + lag, head.y + 6 * z, head.x - spread * 0.86 + lag, head.y + fall * 0.7);
    ctx.quadraticCurveTo(head.x - spread * 0.55 + lag, head.y + fall, head.x - 3 * z, head.y + fall * 0.9);
    ctx.quadraticCurveTo(head.x, head.y + fall * 1.02, head.x + 3 * z, head.y + fall * 0.9);
    ctx.quadraticCurveTo(head.x + spread * 0.55 + lag, head.y + fall, head.x + spread * 0.86 + lag, head.y + fall * 0.7);
    ctx.quadraticCurveTo(head.x + spread + lag, head.y + 6 * z, head.x + 8 * z, head.y - 4 * z);
    ctx.quadraticCurveTo(head.x, head.y - 16 * z, head.x - 8 * z, head.y - 4 * z);
    ctx.closePath();
    ctx.fill();

    if (view !== 'back') {
      ctx.fillStyle = pal.player;
      ctx.beginPath();
      if (view === 'profile') {
        ctx.ellipse(head.x + 2.4 * z * dir, head.y + 1 * z, 3.6 * z, 5.4 * z, 0, 0, TAU);
      } else {
        ctx.ellipse(head.x, head.y + 1 * z, 5 * z, 5.6 * z, 0, 0, TAU);
      }
      ctx.fill();
    }


    ctx.fillStyle = shadeHex(HAIR, 0.76);
    ctx.beginPath();
    if (view === 'front') {
      ctx.moveTo(head.x - 5.4 * z * dir, head.y - 4 * z);
      ctx.quadraticCurveTo(head.x - 10.5 * z * dir + lag, head.y + 8 * z, head.x - 7 * z * dir + lag, head.y + fall * 0.82);
      ctx.quadraticCurveTo(head.x - 3 * z * dir, head.y + fall * 0.55, head.x - 2.6 * z * dir, head.y - 1 * z);
    } else if (view === 'profile') {
      ctx.moveTo(head.x - 2 * z * dir, head.y - 6 * z);
      ctx.quadraticCurveTo(head.x - 12 * z * dir + lag, head.y + 4 * z, head.x - 9 * z * dir + lag, head.y + fall * 0.86);
      ctx.quadraticCurveTo(head.x - 4 * z * dir, head.y + fall * 0.5, head.x - 1 * z * dir, head.y - 2 * z);
    } else {
      ctx.ellipse(head.x, head.y - 1 * z, 5 * z, 3.6 * z, 0, 0, TAU);
    }
    ctx.closePath();
    ctx.fill();

    if (view === 'back') {
      ctx.strokeStyle = shadeHex(HAIR, 0.6);
      ctx.lineWidth = Math.max(1, 1.4 * z);
      ctx.beginPath();
      ctx.moveTo(head.x + lag * 0.4, head.y + 3 * z);
      ctx.lineTo(head.x + lag, head.y + fall * 0.84);
      ctx.stroke();
    }

    ctx.fillStyle = shadeHex(HAIR, 0.68);
    ctx.beginPath();
    ctx.moveTo(head.x - 7 * z, head.y - 5 * z);
    ctx.lineTo(head.x - spread + lag, head.y + 8 * z);
    ctx.lineTo(head.x - spread * 0.72 + lag, head.y + fall * 0.72);
    ctx.lineTo(head.x - 3 * z, head.y + fall * 0.88);
    ctx.lineTo(head.x - 5 * z, head.y + 3 * z);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shadeHex(HAIR, 0.84);
    ctx.beginPath();
    ctx.moveTo(head.x + 7 * z, head.y - 5 * z);
    ctx.lineTo(head.x + spread + lag, head.y + 8 * z);
    ctx.lineTo(head.x + spread * 0.72 + lag, head.y + fall * 0.72);
    ctx.lineTo(head.x + 3 * z, head.y + fall * 0.88);
    ctx.lineTo(head.x + 5 * z, head.y + 3 * z);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = shadeHex(HAIR, 1.3);
    ctx.lineWidth = Math.max(1, 1.5 * z);
    ctx.lineCap = 'round';
    for (const [from, to, bend] of [
      [-7, 5, -14],
      [-4, 7.5, -11],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(head.x + from * z, head.y - 3 * z);
      ctx.quadraticCurveTo(head.x + (from + to) * 0.5 * z, head.y + bend * z, head.x + to * z, head.y - 2 * z);
      ctx.stroke();
    }

    const freeDir = -dir;
    ctx.strokeStyle = shadeHex(pal.garment, 0.62);
    ctx.lineWidth = Math.max(2, 3.2 * z);
    ctx.beginPath();
    ctx.moveTo(base.x + shoulder * 0.78 * freeDir, shoulderY + 2 * z);
    ctx.lineTo(base.x + 8.5 * z * freeDir, waistY + 2.5 * z);
    ctx.stroke();
    ctx.fillStyle = pal.player;
    ctx.beginPath();
    ctx.ellipse(base.x + 8.8 * z * freeDir, waistY + 3 * z, 2 * z, 1.7 * z, 0, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = pal.wall;
    ctx.lineWidth = Math.max(1, 1.6 * z);
    ctx.beginPath();
    ctx.moveTo(base.x + shoulder * 0.8 * dir, shoulderY + 3 * z);
    ctx.lineTo(base.x + 12 * z * dir - swing, waistY + 6 * z);
    ctx.stroke();
    ctx.fillStyle = pal.player;
    ctx.beginPath();
    ctx.ellipse(
      base.x + 11 * z * dir - swing,
      waistY + 5.2 * z,
      2.2 * z,
      1.8 * z,
      0,
      0,
      TAU,
    );
    ctx.fill();
    ctx.restore();
  };

  const flicker = 0.86 + 0.14 * Math.sin(opts.timeMs / 410);
  const paintLantern = (): void =>
    drawLantern(
      ctx,
      { x: base.x + 12 * z * dir - swing, y: waistY + 6 * z },
      pal.playerAccent,
      z,
      flicker,
      sway * 0.12,
    );
  drawCommands([
    { slot: 'body', draw: paintFigure },
    opts.facing === undefined
      ? { slot: 'frontAttachments' as const, draw: paintLantern }
      : attachment({ facing: opts.facing, forward: 0.35, draw: paintLantern }),
  ]);
};

export const maraBody = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  timeMs: number,
): SceneBody => ({
  at: MARA.at,
  draw: () => drawMaraFigure(ctx, cam, pal, worldToScreen(cam, MARA.at), { timeMs }),
});

export const drawMara = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  frame: LayoutFrame,
  prompt: string | null,
): void => {
  if (prompt === null) return;
  drawSpeakerLabel(ctx, cam, pal, frame, {
    at: MARA.at,
    name: MARA.name,
    line: MARA.offer,
    prompt,
    ids: { name: 'escort.name', line: 'escort.line', prompt: 'escort.prompt' },
  });
};

