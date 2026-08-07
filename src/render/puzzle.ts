
import type { Palette } from './palette';
import type { Camera } from './iso';
import { groundEllipse, worldToScreen } from './iso';
import type { SceneBody } from './draw';
import { showingSeal, type SealPuzzle } from '../game/puzzle';

const TAU = Math.PI * 2;

const drawSeal = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  timeMs: number,
  puzzle: SealPuzzle,
  index: number,
): void => {
  const spec = puzzle.spec;
  const p = worldToScreen(cam, spec.seals[index].at);
  const z = cam.zoom;
  const h = 46 * z;
  const lit = puzzle.lit[index];
  const flashing = showingSeal(puzzle) === index;
  const erring = puzzle.errorFlashMs > 0;

  const { rx, ry } = groundEllipse(cam, spec.sealRadius);
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  const stone = ctx.createLinearGradient(p.x - 8 * z, 0, p.x + 8 * z, 0);
  stone.addColorStop(0, pal.hudText);
  stone.addColorStop(0.4, pal.hudDim);
  stone.addColorStop(1, pal.floor);
  ctx.fillStyle = stone;
  ctx.beginPath();
  ctx.moveTo(p.x - 7 * z, p.y);
  ctx.lineTo(p.x - 4 * z, p.y - h);
  ctx.lineTo(p.x + 4 * z, p.y - h);
  ctx.lineTo(p.x + 7 * z, p.y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = pal.hudDim;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y - h, 6 * z, 2.5 * z, 0, 0, TAU);
  ctx.fill();

  if (lit || flashing || erring) {
    const pulse = flashing ? 0.75 + 0.25 * Math.sin(timeMs / 60) : 1;
    const flameH = (flashing ? 16 : erring && !lit ? 7 : 11) * z * pulse;
    const glow = ctx.createRadialGradient(
      p.x, p.y - h - flameH * 0.4, 0,
      p.x, p.y - h - flameH * 0.4, flameH * 2.2,
    );
    const colour = erring && !lit ? pal.danger : pal.parryFlash;
    glow.addColorStop(0, colour);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = flashing ? 0.9 : 0.7;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - h - flameH * 0.4, flameH * 2.2, flameH * 2.2, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(p.x - 3 * z, p.y - h);
    ctx.quadraticCurveTo(p.x - 2 * z, p.y - h - flameH * 0.7, p.x, p.y - h - flameH);
    ctx.quadraticCurveTo(p.x + 2 * z, p.y - h - flameH * 0.7, p.x + 3 * z, p.y - h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
};

export const sealBodies = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  simTimeMs: number,
  puzzle: SealPuzzle,
): SceneBody[] =>
  puzzle.spec.seals.map((seal, index) => ({
    at: seal.at,
    draw: () => drawSeal(ctx, cam, pal, simTimeMs, puzzle, index),
  }));
