
import type { ModelDef } from '../models';
import { STANDARD_ORDER, boot, ellipse, line, poly } from './shape';

export const POLISHED_PIKE_NOVICE: ModelDef = /* @__PURE__ */ (() => ({
  id: 'pike_novice',
  heightPx: 57,
  widthScale: 1.1,
  flatArticulation: {
    weapon: { pivot: [0.34, 0.5], rotationScale: 0.85, releaseScale: 2.6 },
  },
  viewWidthScale: { profile: 0.68 },
  profileDepth: 0.14,
  viewPartOrder: STANDARD_ORDER,
  shapes: [
    ...boot('trail', -0.32, -0.09, 0.54),
    ...boot('lead', 0.09, 0.32, 0.44),
    poly([[-0.4, 0.02], [-0.38, 0.7], [0.38, 0.7], [0.4, 0.02]], 'tint'),
    poly([[-0.26, 0.12], [-0.24, 0.62], [0.24, 0.62], [0.26, 0.12]], 'garment', { stroke: null, shade: 0.58 }),
    poly([[-0.36, 0.66], [-0.56, 0.6], [-0.47, 0.45], [-0.28, 0.54]], 'tint', { shade: 0.84 }),
    poly([[0.36, 0.66], [0.56, 0.6], [0.47, 0.45], [0.28, 0.54]], 'tint', { shade: 0.68 }),
    poly([[-0.23, 0.68], [-0.25, 0.92], [0, 1.0], [0.25, 0.92], [0.23, 0.68]], 'tint', { part: 'head' }),
    poly([[0, 0.7], [0, 1.0], [0.25, 0.92], [0.23, 0.68]], 'tint', { part: 'head', stroke: null, shade: 0.64 }),
    line([[-0.16, 0.86], [0.16, 0.86]], 'floor', 2.0, { side: 'front', part: 'head' }),
    line([[0.03, 0.86], [0.17, 0.86]], 'floor', 2.0, { side: 'profile', part: 'head' }),
    poly([[-0.2, 0.69], [-0.17, 0.84], [0.17, 0.84], [0.2, 0.69]], 'tint', { side: 'back', part: 'head', stroke: null, shade: 0.58 }),

    poly([[0.26, 0.6], [0.42, 0.6], [0.5, 0.46], [0.34, 0.42]], 'garment', { part: 'weapon', shade: 0.62 }),
    ellipse(0.36, 0.5, 0.07, 0.05, 'tint', { part: 'weapon' }),
    ellipse(0.02, 0.3, 0.065, 0.048, 'tint', { part: 'weapon' }),
    line([[-0.3, 0.16], [1.52, 1.06]], 'garment', 3, { part: 'weapon' }),
    poly([[1.52, 1.06], [1.44, 0.86], [1.78, 1.2], [1.5, 1.18]], 'hudText', { part: 'weapon' }),
    poly([[1.18, 0.88], [1.3, 0.94], [1.14, 1.06], [1.06, 0.98]], 'tint', { part: 'weapon', shade: 0.9 }),
  ],
}))();
