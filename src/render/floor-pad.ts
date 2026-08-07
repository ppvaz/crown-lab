
import type { LayoutFrame } from './layout';
import type { FloorPad } from './draw';
import { groundEllipse, worldToScreen, worldToScreenAtElevation, type Camera } from './iso';
import type { Palette } from './palette';
import { reportUiText } from './ui-probe';
import type { UiElementId } from './ui-elements';
import type { Vec2, World } from '../sim/types';
import { arenaVertices } from '../sim/arena';

const TAU = Math.PI * 2;

export type PadDirection = 'forward' | 'back';

const THRESHOLD_ARCHITECTURE_ENABLED = false;

interface ThresholdAxis {
  tangent: { x: number; y: number };
}

const thresholdAxis = (world: World, at: { x: number; y: number }): ThresholdAxis => {
  const vertices = arenaVertices(world.arena);
  let best = { distanceSq: Number.POSITIVE_INFINITY, tangent: { x: 1, y: 0 } };
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq <= 1e-9) continue;
    const along = Math.max(
      0,
      Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / lengthSq),
    );
    const nearest = { x: a.x + dx * along, y: a.y + dy * along };
    const distanceSq = (at.x - nearest.x) ** 2 + (at.y - nearest.y) ** 2;
    if (distanceSq < best.distanceSq) {
      const length = Math.sqrt(lengthSq);
      best = { distanceSq, tangent: { x: dx / length, y: dy / length } };
    }
  }
  return { tangent: best.tangent };
};

const drawThresholdArchitecture = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  pal: Palette,
  at: { x: number; y: number },
  open: boolean,
  role: PadDirection,
): void => {
  const { tangent } = thresholdAxis(world, at);
  const halfWidth = role === 'forward' ? 0.78 : 0.62;
  const postTop = role === 'forward' ? 1.72 : 1.42;
  const apex = role === 'forward' ? 2.48 : 2.02;
  const steps = 6;
  const ground = (offset: number) => ({
    x: at.x + tangent.x * offset,
    y: at.y + tangent.y * offset,
  });
  const point = (offset: number, elevation: number) =>
    worldToScreenAtElevation(cam, ground(offset), elevation);
  const arch = Array.from({ length: steps + 1 }, (_, index) => {
    const angle = Math.PI - (index / steps) * Math.PI;
    return point(Math.cos(angle) * halfWidth, postTop + Math.sin(angle) * (apex - postTop));
  });
  const leftBase = point(-halfWidth, 0);
  const rightBase = point(halfWidth, 0);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(leftBase.x, leftBase.y);
  for (const archPoint of arch) ctx.lineTo(archPoint.x, archPoint.y);
  ctx.lineTo(rightBase.x, rightBase.y);
  ctx.closePath();
  ctx.fillStyle = open
    ? role === 'forward'
      ? pal.projectileReflected
      : pal.hudDim
    : pal.wall;
  ctx.globalAlpha = open ? (role === 'forward' ? 0.022 : 0.012) : 0.72;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(leftBase.x, leftBase.y);
  ctx.lineTo(arch[0].x, arch[0].y);
  for (let i = 1; i < arch.length; i++) ctx.lineTo(arch[i].x, arch[i].y);
  ctx.lineTo(rightBase.x, rightBase.y);
  ctx.strokeStyle = pal.hudDim;
  ctx.globalAlpha = role === 'forward' ? 0.72 : 0.46;
  ctx.lineWidth = Math.max(4, (role === 'forward' ? 8 : 6) * cam.zoom);
  ctx.stroke();
  ctx.strokeStyle = open ? pal.projectileReflected : pal.hudDim;
  ctx.globalAlpha = open ? (role === 'forward' ? 0.5 : 0.3) : 0.38;
  ctx.lineWidth = Math.max(1, (role === 'forward' ? 2.2 : 1.6) * cam.zoom);
  ctx.stroke();

  if (!open) {
    ctx.beginPath();
    for (const offset of [-0.48, -0.16, 0.16, 0.48]) {
      const bottom = point(offset, 0.08);
      const top = point(offset, postTop + 0.16);
      ctx.moveTo(bottom.x, bottom.y);
      ctx.lineTo(top.x, top.y);
    }
    for (const elevation of [0.72, 1.32]) {
      const left = point(-halfWidth + 0.08, elevation);
      const right = point(halfWidth - 0.08, elevation);
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
    }
    ctx.strokeStyle = pal.hudDim;
    ctx.globalAlpha = 0.56;
    ctx.lineWidth = Math.max(1, 1.5 * cam.zoom);
    ctx.stroke();
  }
  ctx.restore();
};


interface PadLook {
  radius: number;
  alpha: [open: number, closed: number];
  fillScale: number;
  labelAlpha: [open: number, closed: number];
  labelElevation: number;
  labelOffset: [withArchitecture: number, without: number];
}

const LOOK: Readonly<Record<PadDirection, PadLook>> = {
  forward: {
    radius: 0.75,
    alpha: [0.72, 0.32],
    fillScale: 0.18,
    labelAlpha: [0.8, 0.34],
    labelElevation: 2.62,
    labelOffset: [7, 16],
  },
  back: {
    radius: 0.6,
    alpha: [0.5, 0.5],
    fillScale: 0.2,
    labelAlpha: [0.55, 0.55],
    labelElevation: 2.14,
    labelOffset: [6, 13],
  },
};

export interface PadRequest {
  at: Vec2;
  open: boolean;
  label: string;
  direction: PadDirection;
  labelId: UiElementId;
}

export const floorPad = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  pal: Palette,
  frame: LayoutFrame,
  request: PadRequest,
): FloorPad => {
  const { at, open, direction } = request;
  const look = LOOK[direction];
  const size = frame.type.base;
  return {
    at,
    draw: () => {
      const p = worldToScreen(cam, at);
      const ellipse = groundEllipse(cam, look.radius);
      if (THRESHOLD_ARCHITECTURE_ENABLED) {
        drawThresholdArchitecture(ctx, world, cam, pal, at, open, direction);
      }
      ctx.save();
      ctx.strokeStyle = open && direction === 'forward' ? pal.projectileReflected : pal.hudDim;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.globalAlpha = open ? look.alpha[0] : look.alpha[1];
      ctx.lineWidth = direction === 'forward' ? 2 : 1.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, ellipse.rx, ellipse.ry, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha *= look.fillScale;
      ctx.fill();
      ctx.globalAlpha = open ? look.labelAlpha[0] : look.labelAlpha[1];
      ctx.font = `${Math.max(size, size * cam.zoom)}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      const labelAt = THRESHOLD_ARCHITECTURE_ENABLED
        ? worldToScreenAtElevation(cam, at, look.labelElevation)
        : p;
      const labelOffset = THRESHOLD_ARCHITECTURE_ENABLED
        ? look.labelOffset[0]
        : look.labelOffset[1];
      const y = labelAt.y - labelOffset * cam.zoom;
      ctx.fillText(request.label, labelAt.x, y);
      reportUiText(ctx, request.labelId, request.label, labelAt.x, y);
      ctx.restore();
    },
  };
};
