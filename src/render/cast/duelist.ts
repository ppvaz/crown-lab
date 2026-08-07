
import type { ModelDef } from '../models';
import { STANDARD_ORDER, boot, ellipse, line, poly } from './shape';

export const POLISHED_DUELIST: ModelDef = /* @__PURE__ */ (() => ({
  id: 'duelist',
  heightPx: 56,
  widthScale: 1.02,
  flatArticulation: { weapon: { pivot: [0.4, 0.5], rotationScale: 0.65, releaseScale: 0.35 } },
  viewWidthScale: { profile: 0.74 },
  profileDepth: 0.14,
  viewPartOrder: STANDARD_ORDER,
  shapes: [
    ...boot('trail', -0.29, -0.07, 0.58),
    ...boot('lead', 0.07, 0.29, 0.48),
    poly([[-0.3, 0.3], [-0.34, 0.68], [-0.2, 0.78], [0.2, 0.78], [0.34, 0.68], [0.3, 0.3]], 'tint'),
    poly([[-0.28, 0.3], [-0.48, 0.1], [-0.2, 0.16], [-0.02, 0.35]], 'tint', { shade: 0.7 }),
    poly([[0.02, 0.35], [0.2, 0.15], [0.48, 0.11], [0.28, 0.3]], 'garment', { shade: 0.66 }),
    poly([[-0.36, 0.69], [-0.51, 0.62], [-0.42, 0.51], [-0.25, 0.59]], 'tint', { shade: 0.82 }),
    poly([[0.36, 0.69], [0.51, 0.62], [0.42, 0.51], [0.25, 0.59]], 'tint', { shade: 0.68 }),
    line([[-0.3, 0.35], [0.28, 0.68]], 'playerAccent', 2.4),
    poly([[-0.21, 0.76], [-0.22, 0.96], [0, 1.05], [0.22, 0.96], [0.21, 0.76]], 'hudText', { part: 'head', shade: 0.8 }),
    line([[-0.14, 0.91], [0.15, 0.91]], 'floor', 2, { side: 'front', part: 'head' }),
    line([[0.03, 0.91], [0.16, 0.91]], 'floor', 2, { side: 'profile', part: 'head' }),
    poly([[-0.08, 1.03], [-0.44, 1.16], [-0.65, 1.08], [-0.28, 0.96]], 'tint', { part: 'head', stroke: null, shade: 0.7 }),
    line([[-0.3, 0.61], [-0.68, 0.48]], 'garment', 4),
    ellipse(-0.69, 0.47, 0.06, 0.045, 'hudText', { stroke: 'outline' }),

    poly([[0.29, 0.62], [0.44, 0.61], [0.54, 0.49], [0.45, 0.44]], 'garment', { part: 'weapon', shade: 0.6 }),
    ellipse(0.42, 0.5, 0.065, 0.045, 'hudText', { part: 'weapon' }),
    line([[0.33, 0.41], [0.48, 0.59]], 'playerAccent', 2.4, { part: 'weapon' }),
    line([[0.42, 0.5], [1.46, 0.18]], 'hudText', 1.5, { part: 'weapon' }),
    poly([[1.46, 0.18], [1.38, 0.21], [1.43, 0.25]], 'hudText', { part: 'weapon', stroke: null }),
  ],
}))();
