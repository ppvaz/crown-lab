import type {
  ConstructionFloorPlacement,
  ConceptFloorPlacement,
} from '../../lab/concept-kit';
import { groundEllipse, type Camera, worldToScreen } from '../iso';
import type { Palette } from '../palette';
import type { Point } from './shape-lab';

const groundPath = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  at: { x: number; y: number },
  points: readonly Point[],
  close = false,
): void => {
  const first = worldToScreen(cam, { x: at.x + points[0][0], y: at.y + points[0][1] });
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let index = 1; index < points.length; index += 1) {
    const point = worldToScreen(cam, {
      x: at.x + points[index][0],
      y: at.y + points[index][1],
    });
    ctx.lineTo(point.x, point.y);
  }
  if (close) ctx.closePath();
};

export const drawConceptFloorPlacements = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  placements: readonly ConceptFloorPlacement[],
): void => {
  ctx.save();
  ctx.lineWidth = Math.max(0.8, cam.zoom);
  for (const placement of placements) {
    const at = placement.at;
    const p = worldToScreen(cam, at);
    const gold = 'rgba(200, 169, 74, 0.7)';
    const accent =
      placement.accent === 'red'
        ? 'rgba(122, 43, 51, 0.72)'
        : placement.accent === 'violet'
          ? 'rgba(132, 72, 158, 0.72)'
          : placement.accent === 'cold'
            ? 'rgba(91, 143, 174, 0.58)'
            : gold;
    ctx.strokeStyle = accent;
    ctx.fillStyle = accent;

    if (placement.kind === 'shattered_crown') {
      for (const shard of [
        [[-1.25, 0.65], [-0.7, -0.7], [-0.15, 0.15], [-0.5, 0.85]],
        [[0.05, 0.15], [0.6, -0.8], [1.25, 0.65], [0.45, 0.85]],
        [[-0.05, 0.05], [0.15, -1.15], [0.55, 0.05]],
      ] as const) {
        groundPath(ctx, cam, at, shard, true);
        ctx.globalAlpha = 0.42;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.stroke();
      }
    } else if (placement.kind === 'medallion_rings') {
      for (const radius of [0.55, 1.05, 1.45]) {
        const ring = groundEllipse(cam, radius);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, ring.rx, ring.ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (placement.kind === 'oath_blade') {
      groundPath(ctx, cam, at, [[0, -1.65], [0.62, 0], [0, 1.65], [-0.62, 0]], true);
      ctx.stroke();
      groundPath(ctx, cam, at, [[0, -1.05], [0.25, 0], [0, 1.05], [-0.25, 0]], true);
      ctx.stroke();
    } else if (placement.kind === 'procession_lanes') {
      for (const x of [-0.72, 0, 0.72]) {
        groundPath(ctx, cam, at, [[x, -1.6], [x, 1.6]]);
        ctx.stroke();
      }
    } else if (placement.kind === 'puddle') {
      const puddle = groundEllipse(cam, 1.25);
      ctx.globalAlpha = 0.34;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, puddle.rx, puddle.ry * 0.72, -0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.72;
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (placement.kind === 'runner') {
      groundPath(ctx, cam, at, [[-0.65, -1.7], [0.65, -1.7], [0.65, 1.7], [-0.65, 1.7]], true);
      ctx.globalAlpha = 0.34;
      ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (placement.kind === 'drain') {
      const drain = groundEllipse(cam, 0.82);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, drain.rx, drain.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      for (const offset of [-0.4, 0, 0.4]) {
        groundPath(ctx, cam, at, [[-0.65, offset], [0.65, offset]]);
        ctx.stroke();
      }
    } else {
      for (const [x, y] of [
        [-0.9, -0.55], [-0.45, 0.35], [-0.1, -0.25], [0.25, 0.65],
        [0.5, -0.7], [0.85, 0.15], [1.05, 0.72], [-1.05, 0.75],
      ] as const) {
        const petal = groundEllipse(cam, 0.13);
        const point = worldToScreen(cam, { x: at.x + x, y: at.y + y });
        ctx.beginPath();
        ctx.ellipse(point.x, point.y, petal.rx, petal.ry, 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
};

const CONSTRUCTION_PANEL: readonly Point[] = [
  [-2.55, -1.3],
  [2.55, -1.3],
  [2.55, 1.3],
  [-2.55, 1.3],
];

export const drawConstructionFloors = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  placements: readonly ConstructionFloorPlacement[],
): void => {
  ctx.save();
  ctx.lineWidth = Math.max(0.75, cam.zoom);
  for (const placement of placements) {
    const at = placement.at;
    groundPath(ctx, cam, at, CONSTRUCTION_PANEL, true);
    ctx.fillStyle =
      placement.kind === 'violet_court_geometry'
        ? 'rgba(55, 39, 67, 0.72)'
        : placement.kind === 'rain_polished_tiles'
          ? 'rgba(38, 55, 70, 0.72)'
          : placement.kind === 'rough_repaired_stone'
            ? 'rgba(54, 54, 58, 0.8)'
            : 'rgba(31, 32, 41, 0.74)';
    ctx.strokeStyle = 'rgba(196, 159, 82, 0.72)';
    ctx.fill();
    ctx.stroke();

    if (placement.kind === 'clean_bordered_ashlar') {
      for (const x of [-1.25, 0, 1.25]) {
        groundPath(ctx, cam, at, [[x, -1.25], [x, 1.25]]);
        ctx.stroke();
      }
      groundPath(ctx, cam, at, [[-2.45, 0], [2.45, 0]]);
      ctx.stroke();
      groundPath(ctx, cam, at, [[-2.15, -1.05], [2.15, -1.05], [2.15, 1.05], [-2.15, 1.05]], true);
      ctx.stroke();
    } else if (placement.kind === 'oath_blades') {
      for (const x of [-1.35, 0, 1.35]) {
        groundPath(ctx, cam, at, [[x - 0.5, 0.95], [x, -1.05], [x + 0.5, 0.95], [x, 0.55]], true);
        ctx.stroke();
      }
    } else if (placement.kind === 'shattered_crown') {
      for (const shard of [
        [[-2, 0.9], [-1.25, -0.75], [-0.4, 0.25], [-0.9, 1]],
        [[-0.2, 0.25], [0.45, -1], [0.95, 0.2], [0.55, 1]],
        [[0.75, 0.15], [1.6, -0.7], [2.15, 0.85], [1.15, 1]],
      ] as const) {
        groundPath(ctx, cam, at, shard, true);
        ctx.fillStyle = 'rgba(174, 145, 87, 0.35)';
        ctx.fill();
        ctx.stroke();
      }
    } else if (placement.kind === 'polygon_rings') {
      for (const scale of [0.65, 1.25, 2]) {
        groundPath(ctx, cam, at, [
          [0, -scale * 0.62],
          [scale, -scale * 0.3],
          [scale, scale * 0.3],
          [0, scale * 0.62],
          [-scale, scale * 0.3],
          [-scale, -scale * 0.3],
        ], true);
        ctx.stroke();
      }
    } else if (placement.kind === 'runner') {
      groundPath(ctx, cam, at, [[-0.78, -1.25], [0.78, -1.25], [0.78, 1.25], [-0.78, 1.25]], true);
      ctx.fillStyle = 'rgba(112, 42, 47, 0.72)';
      ctx.fill();
      ctx.stroke();
      groundPath(ctx, cam, at, [[-0.58, -1.2], [-0.58, 1.2], [0.58, 1.2], [0.58, -1.2]]);
      ctx.stroke();
    } else if (placement.kind === 'rain_polished_tiles') {
      ctx.strokeStyle = 'rgba(111, 151, 177, 0.58)';
      for (const x of [-1.25, 0, 1.25]) {
        groundPath(ctx, cam, at, [[x, -1.25], [x, 1.25]]);
        ctx.stroke();
      }
      groundPath(ctx, cam, at, [[-2.45, 0], [2.45, 0]]);
      ctx.stroke();
      for (const offset of [-1.45, 0.65]) {
        groundPath(ctx, cam, at, [[offset - 0.6, 0.65], [offset, 0.35], [offset + 0.55, 0.5]]);
        ctx.stroke();
      }
    } else if (placement.kind === 'rough_repaired_stone') {
      ctx.strokeStyle = 'rgba(138, 132, 119, 0.62)';
      for (const seam of [
        [[-2.5, -0.3], [-1.1, -0.15], [-0.55, -0.55], [0.55, -0.4], [1.2, -0.8], [2.5, -0.65]],
        [[-2.5, 0.75], [-1.4, 0.55], [-0.65, 1.15]],
        [[0.1, -1.3], [0.35, -0.35], [0.15, 0.45], [0.65, 1.3]],
      ] as const) {
        groundPath(ctx, cam, at, seam);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = 'rgba(176, 102, 203, 0.74)';
      for (const radius of [0.58, 1.08]) {
        const p = worldToScreen(cam, at);
        const ring = groundEllipse(cam, radius);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, ring.rx, ring.ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      groundPath(ctx, cam, at, [[0, -0.72], [0.72, 0], [0, 0.72], [-0.72, 0]], true);
      ctx.stroke();
    }
  }
  ctx.restore();
};
