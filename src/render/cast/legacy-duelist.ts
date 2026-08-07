
import type { ModelDef } from '../models';


export const LEGACY_DUELIST: ModelDef = /* @__PURE__ */ (() => ({
  id: 'duelist',
  heightPx: 50,
  widthScale: 0.95,
  flatArticulation: {
    weapon: { pivot: [0.36, 0.52], rotationScale: 0.68, releaseScale: 1.5 },
  },
  viewWidthScale: { profile: 0.74 },
  viewPartOrder: {
    front: ['body', 'legTrail', 'legLead', 'head', 'weapon'],
    back: ['weapon', 'body', 'legTrail', 'legLead', 'head'],
    profile: ['body', 'legTrail', 'legLead', 'head', 'weapon'],
  },
  shapes: [
    {
      kind: 'poly',
      points: [
        [-0.3, 0],
        [-0.26, 0.74],
        [0.26, 0.74],
        [0.3, 0],
      ],
      fill: 'tint',
      stroke: 'outline',
      width: 1.5,
    },
    {
      kind: 'poly',
      points: [
        [0.02, 0.0],
        [0.02, 0.74],
        [0.26, 0.74],
        [0.3, 0.0],
      ],
      fill: 'tint',
      stroke: null,
      shade: 0.74,
    },
    {
      kind: 'poly',
      points: [
        [-0.28, 0.3],
        [-0.48, 0.14],
        [-0.22, 0.08],
        [-0.04, 0.32],
      ],
      fill: 'garment',
      stroke: null,
      shade: 0.82,
    },
    {
      kind: 'poly',
      points: [
        [0.04, 0.32],
        [0.22, 0.08],
        [0.45, 0.16],
        [0.28, 0.3],
      ],
      fill: 'garment',
      stroke: null,
      shade: 0.66,
    },
    {
      part: 'legTrail',
      kind: 'poly',
      points: [
        [-0.24, 0.0],
        [-0.2, 0.3],
        [-0.04, 0.3],
        [-0.06, 0.0],
      ],
      fill: 'tint',
      stroke: null,
      shade: 0.6,
    },
    {
      part: 'legLead',
      kind: 'poly',
      points: [
        [0.06, 0.0],
        [0.04, 0.3],
        [0.2, 0.3],
        [0.24, 0.0],
      ],
      fill: 'tint',
      stroke: null,
      shade: 0.52,
    },
    {
      part: 'legTrail',
      kind: 'line',
      points: [
        [-0.26, 0.04],
        [-0.04, 0.04],
      ],
      stroke: 'garment',
      width: 3,
    },
    {
      part: 'legLead',
      kind: 'line',
      points: [
        [0.04, 0.04],
        [0.27, 0.04],
      ],
      stroke: 'garment',
      width: 3,
    },
    { part: 'head', kind: 'ellipse', cx: 0, cy: 0.84, rx: 0.22, ry: 0.1, fill: 'tint', stroke: 'outline', width: 1.5 },
    {
      side: 'front',
      part: 'head',
      kind: 'line',
      points: [
        [-0.13, 0.84],
        [0.15, 0.84],
      ],
      stroke: 'garment',
      width: 2,
    },
    {
      side: 'profile',
      part: 'head',
      kind: 'line',
      points: [
        [0.02, 0.84],
        [0.16, 0.84],
      ],
      stroke: 'garment',
      width: 2,
    },
    {
      kind: 'line',
      points: [
        [-0.3, 0.3],
        [0.28, 0.62],
      ],
      stroke: 'playerAccent',
      width: 2,
    },
    {
      kind: 'line',
      points: [
        [-0.26, 0.58],
        [-0.66, 0.44],
      ],
      stroke: 'tint',
      width: 3,
      shade: 0.8,
    },
    {
      kind: 'line',
      points: [
        [-0.05, 0.93],
        [0.42, 1.14],
      ],
      stroke: 'tint',
      width: 2,
    },
    {
      part: 'weapon',
      kind: 'line',
      points: [
        [0.36, 0.52],
        [1.45, 0.66],
      ],
      stroke: 'hudText',
      width: 1.5,
    },
    {
      part: 'weapon',
      kind: 'line',
      points: [
        [0.31, 0.43],
        [0.4, 0.61],
      ],
      stroke: 'playerAccent',
      width: 2,
    },
    {
      part: 'weapon',
      kind: 'line',
      points: [
        [0.18, 0.6],
        [0.36, 0.52],
      ],
      stroke: 'tint',
      width: 3,
    },
  ],
}))();
