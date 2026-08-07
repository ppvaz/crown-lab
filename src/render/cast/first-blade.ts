
import type { ModelDef } from '../models';
import { STANDARD_ORDER, boot, ellipse, line, poly } from './shape';

export const POLISHED_FIRST_BLADE: ModelDef = /* @__PURE__ */ (() => ({
  id: 'first_blade',
  heightPx: 66,
  widthScale: 1.48,
  flatArticulation: { weapon: { pivot: [-0.52, 0.48], rotationScale: 0.56 } },
  viewWidthScale: { profile: 0.76 },
  profileDepth: 0.17,
  viewPartOrder: STANDARD_ORDER,
  shapes: [
    ...boot('trail', -0.48, -0.16, 0.55),
    ...boot('lead', 0.16, 0.48, 0.46),
    poly([[-0.5, 0.28], [-0.52, 0.72], [-0.34, 0.86], [0.34, 0.86], [0.52, 0.72], [0.5, 0.28]], 'garment', { shade: 0.46 }),
    poly([[-0.62, 0.29], [-0.82, 0.75], [-0.55, 0.93], [-0.24, 0.8], [-0.14, 0.32]], 'tint', { shade: 0.82 }),
    poly([[0.14, 0.32], [0.24, 0.8], [0.55, 0.93], [0.82, 0.75], [0.62, 0.29]], 'tint', { shade: 0.67 }),
    poly([[-0.72, 0.8], [-0.93, 0.72], [-0.82, 0.51], [-0.57, 0.61]], 'tint', { shade: 0.76 }),
    poly([[0.72, 0.8], [0.93, 0.72], [0.82, 0.51], [0.57, 0.61]], 'tint', { shade: 0.58 }),
    line([[-0.45, 0.72], [0.35, 0.33]], 'firstBlade', 3),
    poly([[-0.27, 0.83], [-0.25, 1.08], [0, 1.15], [0.25, 1.08], [0.27, 0.83], [0, 0.76]], 'hudText', { part: 'head', shade: 0.72 }),
    line([[-0.15, 0.99], [0.14, 0.99]], 'floor', 2.2, { side: 'front', part: 'head' }),
    line([[0.04, 0.99], [0.17, 0.99]], 'floor', 2.2, { side: 'profile', part: 'head' }),
    poly([[-0.11, 1.12], [-0.52, 1.27], [-0.74, 1.17], [-0.35, 1.04]], 'firstBlade', { part: 'head', stroke: null, shade: 0.78 }),

    poly([[-0.55, 0.68], [-0.7, 0.61], [-0.55, 0.45], [-0.38, 0.5]], 'garment', { part: 'weapon', shade: 0.58 }),
    poly([[0.52, 0.69], [0.7, 0.61], [0.5, 0.43], [0.34, 0.5]], 'garment', { part: 'weapon', shade: 0.5 }),
    ellipse(-0.52, 0.48, 0.09, 0.06, 'hudDim', { part: 'weapon' }),
    ellipse(0.34, 0.53, 0.09, 0.06, 'hudDim', { part: 'weapon' }),
    line([[-0.74, 0.4], [1.05, 0.73]], 'hudText', 5, { part: 'weapon' }),
    line([[-0.76, 0.39], [-0.93, 0.35]], 'firstBlade', 4, { part: 'weapon' }),
    poly([[0.91, 0.66], [1.26, 0.63], [1.62, 0.81], [1.45, 1.13], [1.15, 1.35], [1.29, 1.01], [1.17, 0.81]], 'hudText', { part: 'weapon' }),
    poly([[1.17, 0.8], [1.45, 1.13], [1.15, 1.35], [1.31, 0.98]], 'hudText', { part: 'weapon', stroke: null, shade: 0.72 }),
  ],
}))();
