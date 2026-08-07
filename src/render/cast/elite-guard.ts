
import type { ModelDef } from '../models';
import { STANDARD_ORDER, boot, ellipse, line, poly } from './shape';

export const POLISHED_ELITE_GUARD: ModelDef = /* @__PURE__ */ (() => ({
  id: 'elite_guard_wall',
  heightPx: 64,
  widthScale: 1.46,
  flatArticulation: {
    weapon: { pivot: [0.65, 0.45], rotationScale: 0.7, releaseScale: 1.3 },
    shield: { pivot: [-0.06, 0.58], rotationScale: 0.38 },
  },
  viewWidthScale: { profile: 0.74 },
  profileDepth: 0.18,
  viewPartOrder: STANDARD_ORDER,
  shapes: [
    ...boot('trail', -0.46, -0.17, 0.5),
    ...boot('lead', 0.17, 0.46, 0.42),
    poly([[-0.5, 0.26], [-0.55, 0.72], [-0.35, 0.84], [0.35, 0.84], [0.55, 0.72], [0.5, 0.26]], 'tint', { shade: 0.6 }),
    poly([[-0.6, 0.77], [-0.82, 0.68], [-0.68, 0.5], [-0.48, 0.62]], 'tint', { shade: 0.72 }),
    poly([[0.6, 0.77], [0.82, 0.68], [0.68, 0.5], [0.48, 0.62]], 'tint', { shade: 0.55 }),
    poly([[-0.22, 0.82], [-0.2, 1.08], [0.2, 1.08], [0.22, 0.82]], 'hudDim', { part: 'head' }),
    poly([[0.54, 0.66], [0.74, 0.57], [0.69, 0.39], [0.53, 0.45]], 'garment', { part: 'weapon', shade: 0.55 }),
    ellipse(0.66, 0.43, 0.09, 0.06, 'hudDim', { part: 'weapon' }),
    line([[0.56, 0.34], [0.75, 0.53]], 'hudText', 3, { part: 'weapon' }),
    poly([[0.66, 0.44], [0.76, 0.4], [1.25, 0.04], [1.13, 0]], 'hudText', { part: 'weapon', shade: 0.76 }),
    poly([[-0.5, 0.65], [-0.72, 0.56], [-0.62, 0.39], [-0.45, 0.46]], 'garment', { part: 'shield', shade: 0.48 }),
    ellipse(-0.52, 0.46, 0.08, 0.055, 'hudDim', { part: 'shield' }),
    poly([[-0.78, 0.14], [-0.72, 0.92], [-0.34, 1.08], [0.28, 0.99], [0.5, 0.18], [0.1, 0.02], [-0.38, 0.02]], 'hudDim', { part: 'shield', width: 1.8 }),
    poly([[-0.55, 0.18], [-0.5, 1.13], [-0.12, 1.19], [0.02, 0.1]], 'hudDim', { part: 'shield', stroke: null, shade: 1.14 }),
    poly([[0.02, 0.1], [-0.12, 1.19], [0.28, 1.08], [0.38, 0.2]], 'hudDim', { part: 'shield', stroke: null, shade: 0.72 }),
    line([[-0.38, 0.13], [-0.34, 1.04]], 'garment', 2, { part: 'shield', shade: 0.48 }),
  ],
}))();
