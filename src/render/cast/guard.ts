
import type { ModelDef } from '../models';
import { STANDARD_ORDER, boot, ellipse, line, poly } from './shape';

export const POLISHED_GUARD: ModelDef = /* @__PURE__ */ (() => ({
  id: 'palace_guard',
  heightPx: 54,
  widthScale: 1.28,
  flatArticulation: {
    weapon: { pivot: [0.55, 0.51], rotationScale: 0.8, releaseScale: 1.8 },
    shield: { pivot: [-0.48, 0.58] },
  },
  viewWidthScale: { profile: 0.72 },
  profileDepth: 0.15,
  viewPartOrder: STANDARD_ORDER,
  shapes: [
    ...boot('trail', -0.34, -0.1, 0.56),
    ...boot('lead', 0.1, 0.34, 0.46),
    poly([[-0.5, 0], [-0.46, 0.72], [0.46, 0.72], [0.5, 0]], 'tint'),
    poly([[-0.42, 0.28], [-0.38, 0.58], [0.38, 0.58], [0.42, 0.28]], 'garment', { stroke: null, shade: 0.52 }),
    poly([[-0.46, 0.67], [-0.66, 0.61], [-0.56, 0.46], [-0.35, 0.55]], 'tint', { shade: 0.84 }),
    poly([[0.46, 0.67], [0.66, 0.61], [0.56, 0.46], [0.35, 0.55]], 'tint', { shade: 0.68 }),
    line([[-0.4, 0.32], [0.4, 0.32]], 'playerAccent', 1.8),
    poly([[-0.27, 0.7], [-0.3, 0.94], [0, 1.02], [0.3, 0.94], [0.27, 0.7]], 'tint', { part: 'head' }),
    poly([[0, 0.72], [0, 1.02], [0.3, 0.94], [0.27, 0.7]], 'tint', { part: 'head', stroke: null, shade: 0.66 }),
    poly([[-0.07, 1.0], [0, 1.14], [0.07, 1.0]], 'playerAccent', { part: 'head', stroke: null }),
    line([[-0.19, 0.88], [0.19, 0.88]], 'floor', 2.2, { side: 'front', part: 'head' }),
    line([[0.04, 0.88], [0.2, 0.88]], 'floor', 2.2, { side: 'profile', part: 'head' }),
    poly([[-0.23, 0.71], [-0.2, 0.86], [0.2, 0.86], [0.23, 0.71]], 'tint', { side: 'back', part: 'head', stroke: null, shade: 0.6 }),

    poly([[0.38, 0.62], [0.52, 0.63], [0.66, 0.48], [0.56, 0.43]], 'garment', { part: 'weapon', shade: 0.62 }),
    ellipse(0.56, 0.5, 0.075, 0.055, 'tint', { part: 'weapon' }),
    line([[0.65, 0.02], [0.65, 1.28]], 'garment', 3, { part: 'weapon' }),
    poly([[0.65, 1.28], [0.56, 1.15], [0.65, 1.06], [0.74, 1.15]], 'hudText', { part: 'weapon' }),
    poly([[0.64, 1.16], [0.92, 1.08], [0.82, 0.98], [0.64, 1.03]], 'hudText', { part: 'weapon', shade: 0.76 }),

    poly([[-0.38, 0.64], [-0.56, 0.6], [-0.65, 0.46], [-0.53, 0.42], [-0.36, 0.54]], 'garment', { part: 'shield', shade: 0.55 }),
    ellipse(-0.55, 0.49, 0.07, 0.05, 'tint', { part: 'shield' }),
    poly([[-1.02, 0.12], [-1.0, 0.67], [-0.73, 0.8], [-0.44, 0.67], [-0.44, 0.12], [-0.72, 0.02]], 'tint', { part: 'shield', stroke: 'playerAccent', width: 1.5 }),
    poly([[-0.73, 0.08], [-0.73, 0.74], [-0.46, 0.65], [-0.46, 0.16]], 'tint', { part: 'shield', stroke: null, shade: 0.68 }),
    poly([[-0.73, 0.52], [-0.61, 0.4], [-0.73, 0.28], [-0.85, 0.4]], 'playerAccent', { part: 'shield', stroke: null }),
  ],
}))();
