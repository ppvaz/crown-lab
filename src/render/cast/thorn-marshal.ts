
import type { ModelDef, ModelShape, ModelView } from '../models';
import { boot, ellipse, line, orders, poly } from './shape';

const AXIS = 0.54;

const blade = (
  tipX: number,
  tipY: number,
  shade: number,
  side?: ModelView,
  originX = 0,
): ModelShape[] => {
  const oy = 0.74;
  const dx = (tipX - originX) * AXIS;
  const dy = tipY - oy;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const at = (t: number, s: number): [number, number] => [
    originX + (ux * t * len - uy * s) / AXIS,
    oy + uy * t * len + ux * s,
  ];
  const w = 0.05;
  const barb = 0.052;
  return [
    poly(
      [
        at(0.1, -w),
        at(0.42, -w * 0.75),
        at(0.48, -w * 0.75 - barb),
        at(0.53, -w * 0.55),
        at(0.7, -w * 0.5),
        at(0.75, -w * 0.5 - barb * 0.8),
        at(0.79, -w * 0.35),
        at(1, 0),
        at(0.79, w * 0.35),
        at(0.75, w * 0.5 + barb * 0.8),
        at(0.7, w * 0.5),
        at(0.53, w * 0.55),
        at(0.48, w * 0.75 + barb),
        at(0.42, w * 0.75),
        at(0.1, w),
      ],
      'tint',
      { part: 'gesture', side, shade },
    ),
    poly([at(0.74, -w * 0.5), at(1, 0), at(0.74, w * 0.5), at(0.8, 0)], 'hudText', {
      part: 'gesture',
      side,
      stroke: null,
      shade: 0.82,
    }),
  ];
};

const FAN: Array<[number, number, number]> = [
  [-1.04, 0.72, 0.66],
  [-0.88, 0.97, 0.62],
  [-0.58, 1.14, 0.6],
  [-0.3, 1.23, 0.58],
  [0.02, 1.25, 0.56],
  [0.34, 1.22, 0.54],
  [0.66, 1.12, 0.52],
  [0.94, 0.94, 0.5],
  [1.08, 0.7, 0.46],
];

const FAN_PROFILE: Array<[number, number, number]> = [
  [-0.96, 0.58, 0.46],
  [-1.0, 0.84, 0.5],
  [-0.86, 1.06, 0.54],
  [-0.56, 1.2, 0.58],
  [-0.18, 1.25, 0.62],
];

export const POLISHED_THORN_MARSHAL: ModelDef = /* @__PURE__ */ (() => ({
  id: 'thorn_marshal',
  heightPx: 64,
  widthScale: 1.24,
  flatArticulation: {
    weapon: { pivot: [0.38, 0.5], rotationScale: 0.82, releaseScale: 1.5 },
    gesture: { pivot: [0, 0.6], rotationScale: 0.18 },
  },
  viewWidthScale: { profile: 0.72 },
  profileDepth: 0.16,
  viewPartOrder: orders(
    ['gesture', 'legTrail', 'legLead', 'body', 'head', 'weapon'],
    ['weapon', 'legTrail', 'legLead', 'body', 'head', 'gesture'],
    ['gesture', 'legTrail', 'legLead', 'body', 'head', 'weapon'],
  ),
  shapes: [
    ...FAN.flatMap(([x, y, s]) => blade(x, y, s, 'front')),
    ...FAN.flatMap(([x, y, s]) => blade(x, y, s, 'back')),
    ...FAN_PROFILE.flatMap(([x, y, s]) => blade(x, y, s, 'profile', -0.06)),

    ...boot('trail', -0.38, -0.12, 0.62),
    ...boot('lead', 0.12, 0.38, 0.5),
    poly([[-0.35, 0.33], [-0.36, 0.44], [-0.25, 0.5], [-0.15, 0.44], [-0.14, 0.33]], 'tint', { part: 'legTrail', shade: 0.5 }),
    poly([[-0.25, 0.52], [-0.19, 0.45], [-0.25, 0.38], [-0.31, 0.45]], 'tint', { part: 'legTrail', shade: 0.62 }),
    poly([[0.15, 0.33], [0.14, 0.44], [0.25, 0.5], [0.35, 0.44], [0.36, 0.33]], 'tint', { part: 'legLead', shade: 0.58 }),
    poly([[0.25, 0.52], [0.31, 0.45], [0.25, 0.38], [0.19, 0.45]], 'tint', { part: 'legLead', shade: 0.72 }),

    poly([[-0.31, 0.52], [-0.34, 0.44], [-0.1, 0.4], [-0.08, 0.5]], 'tint', { side: 'front', shade: 0.6 }),
    poly([[0.31, 0.52], [0.34, 0.44], [0.1, 0.4], [0.08, 0.5]], 'tint', { side: 'front', shade: 0.48 }),
    poly([[-0.28, 0.93], [-0.3, 0.74], [-0.22, 0.65], [-0.31, 0.52], [0.31, 0.52], [0.22, 0.65], [0.3, 0.74], [0.28, 0.93]], 'garment', { side: 'front', shade: 0.5 }),
    poly([[0, 0.93], [0.28, 0.93], [0.3, 0.74], [0.22, 0.65], [0.31, 0.52], [0, 0.52]], 'garment', { side: 'front', stroke: null, shade: 0.38 }),
    line([[-0.17, 0.85], [0, 0.78], [0.17, 0.85]], 'tint', 1.6, { side: 'front', shade: 0.42 }),
    line([[-0.15, 0.75], [0, 0.68], [0.15, 0.75]], 'tint', 1.4, { side: 'front', shade: 0.38 }),
    poly([[-0.23, 0.64], [-0.22, 0.58], [0.22, 0.58], [0.23, 0.64]], 'tint', { side: 'front', stroke: null, shade: 0.35 }),
    poly([[-0.035, 0.645], [0.035, 0.645], [0.03, 0.575], [-0.03, 0.575]], 'hudText', { side: 'front', stroke: null, shade: 0.8 }),
    poly([[-0.125, 0.58], [-0.145, 0.3], [0, 0.17], [0.145, 0.3], [0.125, 0.58]], 'tint', { side: 'front', shade: 0.8 }),
    poly([[0, 0.58], [0.125, 0.58], [0.145, 0.3], [0, 0.17]], 'tint', { side: 'front', stroke: null, shade: 0.62 }),
    poly([[0, 0.37], [0.05, 0.31], [0, 0.25], [-0.05, 0.31]], 'hudText', { side: 'front', stroke: null, shade: 0.8 }),
    poly([[-0.22, 0.76], [-0.44, 0.72], [-0.38, 0.6], [-0.2, 0.66]], 'tint', { side: 'front', shade: 0.68 }),
    poly([[0.22, 0.76], [0.44, 0.72], [0.38, 0.6], [0.2, 0.66]], 'tint', { side: 'front', shade: 0.55 }),
    poly([[-0.14, 0.95], [-0.4, 0.92], [-0.48, 0.79], [-0.28, 0.7], [-0.13, 0.82]], 'hudText', { side: 'front', shade: 0.8 }),
    poly([[0.14, 0.95], [0.4, 0.92], [0.48, 0.79], [0.28, 0.7], [0.13, 0.82]], 'hudText', { side: 'front', shade: 0.6 }),
    poly([[-0.14, 0.97], [-0.12, 0.88], [0.12, 0.88], [0.14, 0.97]], 'tint', { side: 'front', shade: 0.45 }),

    poly([[-0.2, 0.79], [-0.23, 0.92], [-0.21, 1.06], [0, 1.15], [0.21, 1.06], [0.23, 0.92], [0.2, 0.79]], 'tint', { side: 'front', part: 'head' }),
    poly([[0, 0.79], [0, 1.15], [0.21, 1.06], [0.23, 0.92], [0.2, 0.79]], 'tint', { side: 'front', part: 'head', stroke: null, shade: 0.66 }),
    poly([[-0.2, 0.86], [-0.27, 0.8], [-0.2, 0.78]], 'tint', { side: 'front', part: 'head', stroke: null, shade: 0.8 }),
    poly([[0.2, 0.86], [0.27, 0.8], [0.2, 0.78]], 'tint', { side: 'front', part: 'head', stroke: null, shade: 0.6 }),
    line([[0, 1.15], [0, 0.99]], 'tint', 1.4, { side: 'front', part: 'head', shade: 0.5 }),
    line([[-0.15, 1.0], [0.15, 1.0]], 'floor', 2.2, { side: 'front', part: 'head' }),

    poly([[-0.31, 0.52], [-0.34, 0.44], [0.34, 0.44], [0.31, 0.52]], 'tint', { side: 'back', shade: 0.42 }),
    poly([[-0.28, 0.93], [-0.3, 0.74], [-0.22, 0.65], [-0.31, 0.52], [0.31, 0.52], [0.22, 0.65], [0.3, 0.74], [0.28, 0.93]], 'garment', { side: 'back', shade: 0.4 }),
    line([[-0.2, 0.8], [0.2, 0.8]], 'tint', 1.4, { side: 'back', shade: 0.3 }),
    line([[-0.19, 0.68], [0.19, 0.68]], 'tint', 1.2, { side: 'back', shade: 0.28 }),
    poly([[-0.23, 0.64], [-0.22, 0.58], [0.22, 0.58], [0.23, 0.64]], 'tint', { side: 'back', stroke: null, shade: 0.3 }),
    poly([[-0.14, 0.95], [-0.4, 0.92], [-0.48, 0.79], [-0.28, 0.7], [-0.13, 0.82]], 'hudText', { side: 'back', shade: 0.66 }),
    poly([[0.14, 0.95], [0.4, 0.92], [0.48, 0.79], [0.28, 0.7], [0.13, 0.82]], 'hudText', { side: 'back', shade: 0.5 }),
    poly([[-0.2, 0.79], [-0.22, 1.06], [0, 1.15], [0.22, 1.06], [0.2, 0.79]], 'tint', { side: 'back', part: 'head', shade: 0.72 }),
    poly([[-0.15, 0.82], [-0.13, 1.0], [0.13, 1.0], [0.15, 0.82]], 'tint', { side: 'back', part: 'head', stroke: null, shade: 0.52 }),

    poly([[-0.16, 0.92], [-0.2, 0.7], [-0.14, 0.52], [0.2, 0.52], [0.24, 0.72], [0.18, 0.92]], 'garment', { side: 'profile', shade: 0.46 }),
    line([[0.1, 0.86], [0.16, 0.66]], 'tint', 1.4, { side: 'profile', shade: 0.4 }),
    poly([[-0.14, 0.52], [-0.16, 0.42], [0.16, 0.42], [0.18, 0.52]], 'tint', { side: 'profile', shade: 0.55 }),
    poly([[-0.16, 0.64], [-0.15, 0.58], [0.21, 0.58], [0.22, 0.64]], 'tint', { side: 'profile', stroke: null, shade: 0.35 }),
    poly([[-0.02, 0.58], [-0.06, 0.3], [0.04, 0.2], [0.1, 0.32], [0.08, 0.58]], 'tint', { side: 'profile', shade: 0.7 }),
    poly([[-0.1, 0.74], [-0.3, 0.7], [-0.24, 0.58], [-0.08, 0.64]], 'tint', { side: 'profile', shade: 0.6 }),
    poly([[0.02, 0.94], [-0.22, 0.9], [-0.28, 0.78], [-0.1, 0.7], [0.06, 0.8]], 'hudText', { side: 'profile', shade: 0.72 }),
    poly([[-0.09, 0.96], [-0.07, 0.88], [0.12, 0.88], [0.13, 0.96]], 'tint', { side: 'profile', shade: 0.45 }),
    poly([[-0.02, 1.15], [0.2, 1.03], [0.22, 0.9], [0.16, 0.8], [-0.16, 0.8], [-0.2, 0.95], [-0.12, 1.1]], 'tint', { side: 'profile', part: 'head', shade: 0.85 }),
    line([[0.02, 1.0], [0.16, 1.0]], 'floor', 2.2, { side: 'profile', part: 'head' }),

    poly([[0.26, 0.68], [0.44, 0.62], [0.5, 0.46], [0.34, 0.42]], 'garment', { part: 'weapon', shade: 0.55 }),
    poly([[0.06, 0.56], [0.2, 0.52], [0.1, 0.26], [-0.03, 0.31]], 'garment', { part: 'weapon', shade: 0.42 }),
    line([[0.3, 0.62], [0.42, 0.48]], 'hudText', 1.6, { part: 'weapon', shade: 0.7 }),
    line([[0.05, 0.5], [0.12, 0.32]], 'hudText', 1.4, { part: 'weapon', shade: 0.6 }),
    line([[-0.55, 0.02], [1.72, 1.14]], 'tint', 3.4, { part: 'weapon', shade: 0.4 }),
    poly([[-0.5, 0.06], [-0.82, 0.18], [-1.06, 0.08], [-0.86, 0.0], [-0.56, 0.0]], 'hudText', { part: 'weapon', shade: 0.75 }),
    line([[-0.55, 0.04], [-0.98, 0.06]], 'tint', 1.2, { part: 'weapon', shade: 0.5 }),
    poly([[0.55, 0.52], [0.66, 0.62], [0.52, 0.6]], 'tint', { part: 'weapon', stroke: null, shade: 0.85 }),
    poly([[1.05, 0.8], [1.18, 0.9], [1.03, 0.88]], 'tint', { part: 'weapon', stroke: null, shade: 0.9 }),
    poly([[1.32, 0.93], [1.3, 1.06], [1.2, 0.95]], 'tint', { part: 'weapon', stroke: null, shade: 0.92 }),
    poly([[1.72, 1.14], [1.63, 0.94], [2.02, 1.3], [1.7, 1.24]], 'hudText', { part: 'weapon' }),
    ellipse(0.4, 0.52, 0.075, 0.05, 'garment', { part: 'weapon', shade: 0.38 }),
    ellipse(0.02, 0.28, 0.065, 0.045, 'garment', { part: 'weapon', shade: 0.33 }),
  ],
}))();
