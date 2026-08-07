
import type { World } from '../sim/types';
import type { Palette } from './palette';
import type { Camera } from './iso';

export type EncounterBackground = 'distant_keep';

export const encounterBackgroundFor = (encounterId: string): EncounterBackground | null =>
  encounterId === 'background_encounter' ? 'distant_keep' : null;

export const drawEncounterBackground = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  pal: Palette,
): void => {
  if (encounterBackgroundFor(world.encounter.defId) === null) return;
  const horizon = cam.height * 0.43;
  const gradient = ctx.createLinearGradient(0, 0, 0, cam.height);
  gradient.addColorStop(0, '#111522');
  gradient.addColorStop(0.48, '#171723');
  gradient.addColorStop(1, '#08080b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, cam.width, cam.height);

  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = pal.playerAccent;
  ctx.beginPath();
  ctx.arc(cam.width * 0.76, cam.height * 0.15, Math.min(cam.width, cam.height) * 0.055, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#252635';
  ctx.beginPath();
  ctx.moveTo(0, horizon + 35);
  for (const point of [
    [0.08, -18],
    [0.18, 8],
    [0.3, -34],
    [0.43, 2],
    [0.57, -27],
    [0.7, 9],
    [0.84, -21],
    [1, 18],
  ] as const) {
    ctx.lineTo(cam.width * point[0], horizon + point[1]);
  }
  ctx.lineTo(cam.width, cam.height);
  ctx.lineTo(0, cam.height);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.78;
  ctx.fillStyle = '#1b1c27';
  const keepX = cam.width * 0.5;
  const keepY = horizon - 112;
  ctx.fillRect(keepX - 115, keepY, 230, 95);
  for (const x of [-145, -92, 92, 145]) {
    ctx.fillRect(keepX + x - 18, keepY - 28, 36, 123);
    ctx.beginPath();
    ctx.moveTo(keepX + x - 24, keepY - 28);
    ctx.lineTo(keepX + x, keepY - 54);
    ctx.lineTo(keepX + x + 24, keepY - 28);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillRect(keepX - 8, keepY - 38, 16, 133);
  ctx.beginPath();
  ctx.moveTo(keepX - 16, keepY - 38);
  ctx.lineTo(keepX, keepY - 66);
  ctx.lineTo(keepX + 16, keepY - 38);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = pal.playerAccent;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(keepX, keepY - 65);
  ctx.lineTo(keepX, keepY - 105);
  ctx.lineTo(keepX + 28, keepY - 94);
  ctx.lineTo(keepX, keepY - 84);
  ctx.stroke();

  const haze = ctx.createLinearGradient(0, horizon - 50, 0, horizon + 140);
  haze.addColorStop(0, 'rgba(125,128,150,0)');
  haze.addColorStop(0.55, 'rgba(125,128,150,0.08)');
  haze.addColorStop(1, 'rgba(8,8,11,0)');
  ctx.fillStyle = haze;
  ctx.globalAlpha = 1;
  ctx.fillRect(0, horizon - 50, cam.width, 190);
  ctx.fillStyle = pal.hudDim;
  ctx.globalAlpha = 0.55;
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('BACKGROUND ENCOUNTER', cam.width / 2, 28);
  ctx.restore();
};
