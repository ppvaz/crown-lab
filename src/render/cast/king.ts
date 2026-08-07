
import type { ModelDef } from '../models';
import { boot, ellipse, line, orders, poly } from './shape';

export const POLISHED_KING: ModelDef = /* @__PURE__ */ (() => ({
  id: 'polished_primitive_king',
  heightPx: 72,
  widthScale: 1.32,
  flatArticulation: { weapon: { pivot: [0.42, 0.56], rotationScale: 0.78, releaseScale: 0.6 } },
  viewWidthScale: { profile: 0.7 },
  profileDepth: 0.16,
  viewPartOrder: orders(
    ['legTrail', 'legLead', 'body', 'head', 'weapon'],
    ['weapon', 'legTrail', 'legLead', 'body', 'head'],
    ['legTrail', 'legLead', 'body', 'head', 'weapon'],
  ),
  shapes: [
    ...boot('trail', -0.29, -0.07, 0.68),
    ...boot('lead', 0.07, 0.29, 0.58),

    poly([[-0.4, 0.28], [-0.43, 0.68], [-0.27, 0.77], [0.27, 0.77], [0.43, 0.68], [0.4, 0.28]], 'tint', { side: 'front', shade: 0.6 }),
    poly([[-0.34, 0.26], [-0.74, 0.06], [-0.66, 0.62], [-0.4, 0.76], [-0.12, 0.64], [-0.17, 0.16]], 'player', { side: 'front', stroke: 'playerAccent' }),
    poly([[0.17, 0.16], [0.12, 0.64], [0.4, 0.76], [0.66, 0.62], [0.74, 0.06], [0.34, 0.26]], 'player', { side: 'front', stroke: 'playerAccent', shade: 0.86 }),
    poly([[-0.17, 0.28], [-0.18, 0.67], [0.18, 0.67], [0.17, 0.28]], 'garment', { side: 'front', shade: 0.42 }),
    line([[-0.38, 0.44], [0.38, 0.44]], 'playerAccent', 2.2, { side: 'front' }),
    poly([[-0.46, 0.69], [-0.31, 0.8], [-0.12, 0.72], [-0.24, 0.61]], 'player', { side: 'front', stroke: 'playerAccent' }),
    poly([[0.12, 0.72], [0.31, 0.8], [0.46, 0.69], [0.24, 0.61]], 'player', { side: 'front', stroke: 'playerAccent', shade: 0.82 }),
    line([[-0.28, 0.61], [-0.5, 0.43]], 'garment', 4, { side: 'front' }),
    ellipse(-0.52, 0.41, 0.075, 0.05, 'playerFace', { side: 'front', stroke: 'playerAccent' }),
    poly([[-0.23, 0.77], [-0.21, 0.94], [0, 0.99], [0.22, 0.93], [0.23, 0.78], [0, 0.73]], 'playerFace', { side: 'front', part: 'head' }),
    poly([[0, 0.74], [0, 0.99], [0.22, 0.93], [0.23, 0.78]], 'playerFace', { side: 'front', part: 'head', stroke: null, shade: 0.7 }),
    poly([[-0.3, 0.96], [-0.3, 1.06], [-0.15, 1.0], [0, 1.13], [0.15, 1.0], [0.3, 1.07], [0.3, 0.96]], 'playerAccent', { side: 'front', part: 'head', stroke: null }),
    poly([[0, 0.96], [0, 1.13], [0.15, 1.0], [0.3, 1.07], [0.3, 0.96]], 'playerAccent', { side: 'front', part: 'head', stroke: null, shade: 0.66 }),

    poly([[-0.58, 0.05], [-0.5, 0.59], [-0.3, 0.8], [0, 0.72], [-0.04, 0.06]], 'player', { side: 'back', stroke: 'playerAccent', shade: 0.94 }),
    poly([[0.04, 0.06], [0, 0.72], [0.3, 0.8], [0.5, 0.59], [0.58, 0.05]], 'player', { side: 'back', stroke: 'playerAccent', shade: 0.78 }),
    poly([[-0.12, 0.09], [-0.12, 0.7], [0, 0.75], [0.12, 0.7], [0.12, 0.09]], 'garment', { side: 'back', stroke: null, shade: 0.48 }),
    poly([[-0.56, 0.07], [-0.5, 0.56], [-0.31, 0.77], [-0.4, 0.24]], 'player', { side: 'back', stroke: null, shade: 0.72 }),
    poly([[0.4, 0.24], [0.31, 0.77], [0.5, 0.56], [0.56, 0.07]], 'player', { side: 'back', stroke: null, shade: 0.62 }),
    poly([[-0.46, 0.68], [-0.3, 0.81], [-0.08, 0.72], [-0.24, 0.62]], 'player', { side: 'back', stroke: 'playerAccent', shade: 0.9 }),
    poly([[0.08, 0.72], [0.3, 0.81], [0.46, 0.68], [0.24, 0.62]], 'player', { side: 'back', stroke: 'playerAccent', shade: 0.74 }),
    line([[-0.2, 0.75], [0.2, 0.75]], 'playerAccent', 2, { side: 'back' }),
    poly([[-0.27, 0.65], [-0.39, 0.61], [-0.55, 0.43], [-0.47, 0.37], [-0.3, 0.51]], 'garment', { side: 'back', shade: 0.54 }),
    ellipse(-0.5, 0.39, 0.07, 0.05, 'playerFace', { side: 'back', stroke: 'playerAccent' }),
    poly([[-0.22, 0.77], [-0.2, 0.96], [0.2, 0.96], [0.22, 0.77]], 'playerFace', { side: 'back', part: 'head', shade: 0.78 }),
    poly([[-0.27, 0.95], [-0.27, 1.04], [-0.12, 0.99], [0, 1.09], [0.12, 0.99], [0.27, 1.04], [0.27, 0.95]], 'playerAccent', { side: 'back', part: 'head', stroke: null, shade: 0.72 }),

    poly([[-0.2, 0.27], [-0.24, 0.7], [-0.12, 0.78], [0.25, 0.72], [0.24, 0.27]], 'garment', { side: 'profile', shade: 0.5 }),
    poly([[-0.16, 0.72], [-0.76, 0.42], [-0.7, 0.08], [-0.36, 0.15], [-0.18, 0.5]], 'player', { side: 'profile', stroke: 'playerAccent', shade: 0.82 }),
    poly([[-0.12, 0.76], [-0.13, 0.94], [0.04, 0.99], [0.18, 0.91], [0.15, 0.77]], 'playerFace', { side: 'profile', part: 'head' }),
    poly([[-0.14, 0.96], [-0.12, 1.07], [0, 1.01], [0.1, 1.09], [0.14, 0.96]], 'playerAccent', { side: 'profile', part: 'head', stroke: null }),

    poly([[0.22, 0.68], [0.35, 0.7], [0.51, 0.51], [0.42, 0.45]], 'garment', { part: 'weapon', shade: 0.58 }),
    ellipse(0.43, 0.51, 0.075, 0.05, 'playerFace', { part: 'weapon', stroke: 'playerAccent' }),
    line([[0.31, 0.42], [0.56, 0.61]], 'playerAccent', 3, { part: 'weapon' }),
    poly([[0.46, 0.52], [0.56, 0.58], [1.18, 0.08], [1.08, 0.02]], 'hudText', { part: 'weapon', shade: 0.9 }),
    line([[0.47, 0.55], [1.12, 0.05]], 'playerFace', 1, { part: 'weapon' }),
  ],
}))();
