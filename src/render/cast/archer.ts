
import type { ModelDef } from '../models';
import { STANDARD_ORDER, boot, ellipse, line, poly } from './shape';

export const POLISHED_ARCHER: ModelDef = /* @__PURE__ */ (() => ({
  id: 'archer',
  heightPx: 56,
  widthScale: 1.04,
  flatArticulation: { weapon: { pivot: [0.5, 0.5], rotationScale: 0.18 } },
  viewWidthScale: { profile: 0.76 },
  profileDepth: 0.14,
  viewPartOrder: STANDARD_ORDER,
  shapes: [
    ...boot('trail', -0.27, -0.07, 0.5),
    ...boot('lead', 0.07, 0.27, 0.43),
    poly([[-0.38, 0.24], [-0.35, 0.65], [-0.22, 0.76], [0.22, 0.76], [0.35, 0.65], [0.38, 0.24]], 'tint'),
    poly([[-0.34, 0.38], [-0.58, 0.1], [-0.43, 0.02], [-0.22, 0.24]], 'garment', { shade: 0.72 }),
    poly([[0.22, 0.25], [0.43, 0.02], [0.58, 0.12], [0.34, 0.39]], 'garment', { shade: 0.6 }),
    poly([[-0.4, 0.67], [0, 1.08], [0.4, 0.67], [0.22, 0.59], [-0.2, 0.59]], 'tint', { part: 'head' }),
    poly([[-0.21, 0.68], [0, 0.94], [0.22, 0.68], [0.12, 0.62], [-0.12, 0.62]], 'floor', { side: 'front', part: 'head', stroke: null, shade: 0.72 }),
    poly([[-0.31, 0.69], [-0.65, 0.47], [-0.57, 0.18], [-0.43, 0.29], [-0.32, 0.09], [-0.17, 0.35]], 'garment', { side: 'back', shade: 0.68 }),
    poly([[-0.31, 0.69], [-0.61, 0.45], [-0.55, 0.17], [-0.4, 0.3], [-0.28, 0.1], [-0.15, 0.37]], 'garment', { side: 'profile', shade: 0.68 }),
    line([[-0.37, 0.39], [-0.55, 0.93]], 'garment', 5),
    ...[-0.61, -0.54, -0.47].map((x) => line([[x, 0.82], [x + 0.08, 1.02]], 'projectile', 1.5)),
    poly([[0.25, 0.66], [0.4, 0.62], [0.58, 0.51], [0.5, 0.45], [0.3, 0.53]], 'tint', { part: 'weapon', shade: 0.76 }),
    poly([[-0.24, 0.61], [-0.13, 0.68], [0.51, 0.56], [0.49, 0.49]], 'tint', { part: 'weapon', shade: 0.58 }),
    ellipse(0.5, 0.52, 0.06, 0.045, 'hudText', { part: 'weapon' }),
    line([[0.43, 0.08], [0.72, 0.29], [0.8, 0.53], [0.7, 0.78], [0.49, 0.94]], 'projectile', 2.3, { part: 'weapon' }),
    line([[0.43, 0.08], [0.8, 0.53], [0.49, 0.94]], 'hudDim', 1, { part: 'weapon' }),
    line([[-0.12, 0.61], [0.77, 0.53]], 'hudText', 1, { part: 'weapon' }),
  ],
}))();
