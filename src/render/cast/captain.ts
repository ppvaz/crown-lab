
import type { ModelDef } from '../models';
import { STANDARD_ORDER, boot, ellipse, line, poly } from './shape';

export const POLISHED_CAPTAIN: ModelDef = /* @__PURE__ */ (() => ({
  id: 'captain_of_the_guard',

  heightPx: 69,
  widthScale: 1.5,
  flatArticulation: { weapon: { pivot: [0.38, 0.49], rotationScale: 0.72, releaseScale: 0.63 } },
  viewWidthScale: { profile: 0.76 },
  profileDepth: 0.15,
  viewPartOrder: STANDARD_ORDER,
  shapes: [
    ...boot('trail', -0.32, -0.09, 0.56),
    ...boot('lead', 0.09, 0.32, 0.46),
    poly([[-0.29, 0.94], [-0.15, 1.0], [0, 1.02], [0.15, 1.0], [0.29, 0.94]], 'playerAccent', { part: 'head', stroke: null }),
    poly([[-0.38, 0.28], [-0.56, 0.7], [-0.34, 0.82], [0.34, 0.82], [0.56, 0.7], [0.38, 0.28]], 'tint'),
    poly([[-0.3, 0.3], [-0.31, 0.66], [0.31, 0.66], [0.3, 0.3]], 'garment', { stroke: null, shade: 0.52 }),
    poly([[-0.52, 0.72], [-0.94, 0.62], [-0.78, 0.05], [-0.43, 0.17], [0.05, 0.72]], 'garment', { shade: 0.42 }),
    poly([[-0.56, 0.74], [-0.74, 0.68], [-0.64, 0.53], [-0.43, 0.62]], 'tint', { shade: 0.82 }),
    poly([[0.56, 0.74], [0.74, 0.68], [0.64, 0.53], [0.43, 0.62]], 'tint', { shade: 0.66 }),
    line([[-0.43, 0.61], [0.42, 0.61]], 'playerAccent', 2.5),
    line([[-0.34, 0.35], [0.34, 0.35]], 'playerAccent', 1.8),
    poly([[-0.26, 0.78], [-0.27, 0.96], [0, 1.03], [0.27, 0.96], [0.26, 0.78]], 'tint', { part: 'head' }),
    line([[-0.17, 0.91], [0.17, 0.91]], 'floor', 2.2, { side: 'front', part: 'head' }),
    line([[0.04, 0.91], [0.18, 0.91]], 'floor', 2.2, { side: 'profile', part: 'head' }),
    poly([[-0.22, 0.79], [-0.2, 0.91], [0.2, 0.91], [0.22, 0.79]], 'tint', { side: 'back', part: 'head', stroke: null, shade: 0.62 }),
    poly([[-0.45, 0.64], [-0.63, 0.54], [-0.58, 0.34], [-0.45, 0.39], [-0.32, 0.57]], 'garment', { shade: 0.52 }),
    ellipse(-0.57, 0.33, 0.07, 0.05, 'tint'),
    poly([[0.43, 0.66], [0.59, 0.59], [0.5, 0.42], [0.36, 0.48]], 'garment', { part: 'weapon', shade: 0.55 }),
    ellipse(0.41, 0.48, 0.07, 0.05, 'tint', { part: 'weapon' }),
    line([[0.3, 0.39], [0.49, 0.57]], 'playerAccent', 2.6, { part: 'weapon' }),
    poly([[0.4, 0.5], [0.49, 0.47], [1.16, 0.15], [1.06, 0.1]], 'hudText', { part: 'weapon', shade: 0.88 }),
    line([[0.45, 0.49], [1.12, 0.12]], 'hudText', 2.4, { part: 'weapon' }),
  ],
}))();
