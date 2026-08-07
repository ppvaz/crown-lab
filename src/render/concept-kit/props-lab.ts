import type { ConceptKitSpec } from '../../lab/concept-kit';
import type { SceneBody } from '../draw';
import { groundEllipse, type Camera, worldToScreen } from '../iso';
import type { Palette } from '../palette';
import { accentFor, type PropView } from './shape-lab';
import { ARMS_KINDS, drawArmsProp } from './arms-lab';
import { FURNISHING_KINDS, drawFurnishing } from './furnishings-lab';
import { HEARTH_KINDS, drawHearthProp } from './hearth-lab';
import { MONUMENT_KINDS, drawMonument } from './monuments-lab';
import { STANDARD_KINDS, drawStandard } from './standards-lab';

const normalizedKitKind = (kind: ConceptKitSpec['kind']): ConceptKitSpec['kind'] => {
  if (kind === 'intact_standard') return 'standard';
  return kind;
};

const drawKitProp = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  spec: ConceptKitSpec,
  timeMs: number,
): void => {
  const p = worldToScreen(cam, spec.at);
  const z = cam.zoom * (spec.scale ?? 1);
  const accent = accentFor(pal, spec.accent);
  const line = Math.max(0.7, cam.zoom);
  const ellipse = groundEllipse(cam, 0.46 * (spec.scale ?? 1));
  const kind = normalizedKitKind(spec.kind);
  const view: PropView = { p, z, line, accent };

  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 2 * z, ellipse.rx, ellipse.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (MONUMENT_KINDS.has(kind)) {
    drawMonument(ctx, view, pal, kind);
  } else if (HEARTH_KINDS.has(kind)) {
    drawHearthProp(ctx, view, pal, spec, kind, timeMs);
  } else if (STANDARD_KINDS.has(kind)) {
    drawStandard(ctx, view, pal, spec, kind);
  } else if (ARMS_KINDS.has(kind)) {
    drawArmsProp(ctx, view, pal, kind);
  } else if (FURNISHING_KINDS.has(kind)) {
    drawFurnishing(ctx, view, pal, kind);
  }
  ctx.restore();
};

export const conceptKitBodies = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  timeMs: number,
  specs: readonly ConceptKitSpec[],
): SceneBody[] =>
  specs.map((spec) => ({
    at: spec.at,
    draw: () => drawKitProp(ctx, cam, pal, spec, timeMs),
  }));
