
import type { ModelDef } from '../models';
import type { Points } from './shape';
import { STANDARD_ORDER, boot, ellipse, line, poly } from './shape';

export const POLISHED_RAIN_BOSS: ModelDef = /* @__PURE__ */ (() => ({
  id: 'rain_boss_blade_orbit',
  heightPx: 64,
  widthScale: 1.18,
  flatArticulation: {
    weapon: { pivot: [0.48, 0.43], rotationScale: 0.68, releaseScale: 1.4 },
    gesture: { pivot: [0, 0.62], rotationScale: 0.2 },
  },
  viewWidthScale: { profile: 0.72 },
  profileDepth: 0.15,
  viewPartOrder: STANDARD_ORDER,
  shapes: [
    ...boot('trail', -0.34, -0.1, 0.72),
    ...boot('lead', 0.1, 0.34, 0.6),
    poly([[-0.33, 0.31], [-0.42, 0.57], [-0.22, 0.75], [0.22, 0.75], [0.42, 0.57], [0.33, 0.31]], 'tint', { shade: 0.72 }),
    poly([[-0.24, 0.52], [0, 0.81], [0.29, 0.55], [0.08, 0.33], [-0.11, 0.34]], 'hudDim', { shade: 0.92 }),
    poly([[-0.38, 0.67], [-0.62, 0.61], [-0.51, 0.44], [-0.31, 0.52]], 'tint', { shade: 0.84 }),
    poly([[0.38, 0.67], [0.62, 0.61], [0.51, 0.44], [0.31, 0.52]], 'tint', { shade: 0.64 }),
    poly([[-0.17, 0.75], [-0.2, 1.05], [0, 1.16], [0.22, 1.02], [0.18, 0.76]], 'tint', { part: 'head', shade: 0.82 }),
    poly([[0.01, 0.76], [0, 1.16], [0.22, 1.02], [0.18, 0.76]], 'tint', { part: 'head', stroke: null, shade: 0.6 }),
    poly([[-0.48, 0.59], [-0.68, 0.52], [-0.63, 0.35], [-0.46, 0.41]], 'hudDim', { shade: 0.8 }),
    poly([[-0.62, 0.37], [-0.74, 0.28], [-0.66, 0.12], [-0.52, 0.21]], 'tint', { shade: 0.66 }),
    ellipse(-0.67, 0.12, 0.06, 0.045, 'hudText'),
    poly([[0.48, 0.59], [0.68, 0.52], [0.63, 0.35], [0.46, 0.41]], 'hudDim', { part: 'weapon', shade: 0.68 }),
    poly([[0.62, 0.37], [0.75, 0.27], [0.67, 0.12], [0.53, 0.21]], 'tint', { part: 'weapon', shade: 0.58 }),
    ellipse(0.67, 0.12, 0.06, 0.045, 'hudText', { part: 'weapon' }),
    line([[0.58, 0.04], [0.76, 0.22]], 'hudText', 2.5, { part: 'weapon' }),
    poly([[0.67, 0.12], [0.75, 0.09], [1.18, -0.18], [1.09, -0.24]], 'hudText', { part: 'weapon', shade: 0.82 }),
    ...[
      [[-0.88, 0.82], [-0.79, 1.0]],
      [[-0.72, 0.48], [-0.6, 0.66]],
      [[0.74, 0.84], [0.86, 1.02]],
      [[0.62, 0.45], [0.76, 0.61]],
    ].map((points) => poly(points as Points, 'hudText', { part: 'gesture', shade: 0.72 })),
  ],
}))();
