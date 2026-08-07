
import type { ModelDef } from '../models';
import { STANDARD_ORDER, boot, ellipse, line, poly } from './shape';

export const POLISHED_PIKE_BOSS: ModelDef = /* @__PURE__ */ (() => ({
  id: 'pike_boss_reach',
  heightPx: 64,
  widthScale: 1.24,
  flatArticulation: {
    weapon: { pivot: [0.38, 0.5], rotationScale: 0.82, releaseScale: 1.5 },
  },
  viewWidthScale: { profile: 0.72 },
  profileDepth: 0.16,
  viewPartOrder: STANDARD_ORDER,
  shapes: [
    ...boot('trail', -0.38, -0.12, 0.62),
    ...boot('lead', 0.12, 0.38, 0.5),
    poly([[-0.44, 0.14], [-0.48, 0.66], [-0.28, 0.8], [0.28, 0.8], [0.48, 0.66], [0.44, 0.14]], 'tint', { shade: 0.72 }),
    poly([[-0.3, 0.3], [-0.28, 0.68], [0.28, 0.68], [0.3, 0.3]], 'hudDim', { stroke: null, shade: 0.9 }),
    poly([[-0.44, 0.72], [-0.66, 0.64], [-0.55, 0.47], [-0.34, 0.57]], 'tint', { shade: 0.82 }),
    poly([[0.44, 0.72], [0.66, 0.64], [0.55, 0.47], [0.34, 0.57]], 'tint', { shade: 0.66 }),
    poly([[-0.2, 0.79], [-0.22, 1.06], [0, 1.15], [0.22, 1.06], [0.2, 0.79]], 'hudDim', { part: 'head' }),
    poly([[0, 0.8], [0, 1.15], [0.22, 1.06], [0.2, 0.79]], 'hudDim', { part: 'head', stroke: null, shade: 0.62 }),

    poly([[0.3, 0.64], [0.48, 0.64], [0.56, 0.48], [0.38, 0.44]], 'garment', { part: 'weapon', shade: 0.6 }),
    ellipse(0.4, 0.52, 0.08, 0.055, 'hudDim', { part: 'weapon' }),
    ellipse(0.02, 0.28, 0.07, 0.05, 'hudDim', { part: 'weapon' }),
    line([[-0.38, 0.1], [1.72, 1.14]], 'garment', 3.4, { part: 'weapon' }),
    poly([[1.72, 1.14], [1.63, 0.92], [2.0, 1.3], [1.7, 1.27]], 'hudText', { part: 'weapon' }),
  ],
}))();
