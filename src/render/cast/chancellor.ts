
import type { ModelDef } from '../models';
import { ellipse, line, orders, poly } from './shape';

export const POLISHED_CHANCELLOR: ModelDef = /* @__PURE__ */ (() => ({
  id: 'chancellor',
  heightPx: 62,
  widthScale: 1.38,
  flatArticulation: { gesture: { pivot: [0, 0.52], rotationScale: 0.42, releaseScale: 0.35 } },
  viewWidthScale: { profile: 0.72 },
  profileDepth: 0.16,
  viewPartOrder: orders(
    ['body', 'head', 'gesture'],
    ['gesture', 'body', 'head'],
    ['body', 'head', 'gesture'],
  ),
  shapes: [
    poly([[-0.73, 0], [-0.38, 0.68], [0.38, 0.68], [0.73, 0]], 'tint', { width: 1.8 }),
    poly([[-0.7, 0.02], [-0.37, 0.65], [-0.04, 0.52], [-0.02, 0.02]], 'tint', { stroke: null, shade: 0.82 }),
    poly([[0.02, 0.02], [0.04, 0.52], [0.37, 0.65], [0.7, 0.02]], 'tint', { stroke: null, shade: 0.65 }),
    line([[-0.72, 0.02], [0.72, 0.02]], 'hudText', 1.4, { shade: 0.68 }),
    poly([[-0.4, 0.62], [-0.49, 0.91], [-0.15, 0.78], [0, 0.62]], 'garment', { shade: 0.82 }),
    poly([[0, 0.62], [0.15, 0.78], [0.49, 0.91], [0.4, 0.62]], 'garment', { shade: 0.66 }),
    poly([[-0.38, 0.63], [-0.62, 0.51], [-0.5, 0.17], [-0.3, 0.24]], 'tint', { shade: 0.74 }),
    poly([[0.38, 0.63], [0.62, 0.51], [0.5, 0.17], [0.3, 0.24]], 'tint', { shade: 0.58 }),
    poly([[-0.11, 0.66], [-0.1, 0.82], [0.12, 0.82], [0.13, 0.66]], 'player', { part: 'head', stroke: null, shade: 0.82 }),
    poly([[-0.19, 0.79], [-0.12, 1.08], [0.12, 1.11], [0.23, 0.86], [0.04, 0.73]], 'player', { part: 'head', shade: 0.92 }),
    poly([[0.02, 0.75], [0.02, 1.09], [0.12, 1.11], [0.23, 0.86]], 'tint', { part: 'head', stroke: null, shade: 0.72 }),
    line([[-0.28, 0.66], [0, 0.4], [0.28, 0.66]], 'hudText', 2),
    ...[
      [-0.22, 0.61],
      [-0.11, 0.5],
      [0.11, 0.5],
      [0.22, 0.61],
    ].map(([x, y]) =>
      poly([[x, y + 0.05], [x + 0.05, y], [x, y - 0.05], [x - 0.05, y]], 'hudText', {
        side: 'front',
        stroke: 'garment',
        width: 1,
      }),
    ),
    poly([[-0.36, 0.61], [-0.54, 0.56], [-0.65, 0.42], [-0.52, 0.36], [-0.36, 0.49]], 'tint', { part: 'gesture', shade: 0.7 }),
    poly([[-0.64, 0.44], [-0.76, 0.35], [-0.71, 0.25], [-0.58, 0.34]], 'garment', { part: 'gesture', shade: 0.82 }),
    ellipse(-0.74, 0.27, 0.09, 0.06, 'player', { part: 'gesture', shade: 0.9 }),
    poly([[0.36, 0.61], [0.54, 0.56], [0.65, 0.43], [0.53, 0.37], [0.36, 0.49]], 'tint', { part: 'gesture', shade: 0.58 }),
    poly([[0.64, 0.45], [0.77, 0.38], [0.75, 0.27], [0.59, 0.35]], 'garment', { part: 'gesture', shade: 0.68 }),
    ellipse(0.77, 0.29, 0.09, 0.06, 'player', { part: 'gesture', shade: 0.9 }),
    poly([[0.88, 0.59], [1.0, 0.45], [0.88, 0.31], [0.76, 0.45]], null, { part: 'gesture', stroke: 'hudText', width: 2 }),
  ],
}))();
