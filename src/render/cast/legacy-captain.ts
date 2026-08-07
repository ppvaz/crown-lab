
import type { ModelDef } from '../models';


export const LEGACY_CAPTAIN: ModelDef = /* @__PURE__ */ (() => ({
  id: 'captain_of_the_guard',
  heightPx: 58,
  widthScale: 1.32,
  flatArticulation: {
    weapon: { pivot: [0.28, 0.52], rotationScale: 0.74, releaseScale: 1.2 },
  },
  viewWidthScale: { profile: 0.76 },
  viewPartOrder: {
    front: ['body', 'legTrail', 'legLead', 'head', 'weapon'],
    back: ['weapon', 'body', 'legTrail', 'legLead', 'head'],
    profile: ['body', 'legTrail', 'legLead', 'head', 'weapon'],
  },
  shapes: [
    {
      kind: 'poly',
      points: [
        [-0.98, 0.04],
        [-0.62, 0.66],
        [0.2, 0.7],
        [0.44, 0.06],
      ],
      fill: 'garment',
      stroke: null,
    },
    {
      kind: 'poly',
      points: [
        [-0.36, 0],
        [-0.54, 0.64],
        [0.54, 0.64],
        [0.36, 0],
      ],
      fill: 'tint',
      stroke: 'outline',
      width: 2,
    },
    {
      kind: 'poly',
      points: [
        [-0.56, 0.6],
        [-0.7, 0.5],
        [-0.5, 0.36],
        [-0.38, 0.54],
      ],
      fill: 'garment',
      stroke: 'outline',
      width: 1.5,
    },
    {
      kind: 'poly',
      points: [
        [0.56, 0.6],
        [0.7, 0.5],
        [0.5, 0.36],
        [0.38, 0.54],
      ],
      fill: 'garment',
      stroke: 'outline',
      width: 1.5,
    },
    {
      side: 'front',
      kind: 'poly',
      points: [
        [-0.28, 0.16],
        [-0.38, 0.42],
        [-0.3, 0.58],
        [0.3, 0.58],
        [0.38, 0.42],
        [0.28, 0.16],
      ],
      fill: 'garment',
      stroke: null,
      shade: 0.68,
    },
    {
      side: 'front',
      kind: 'line',
      points: [
        [-0.44, 0.44],
        [0.44, 0.5],
      ],
      stroke: 'playerAccent',
      width: 3,
    },
    { part: 'head', kind: 'ellipse', cx: 0, cy: 0.76, rx: 0.27, ry: 0.115, fill: 'tint', stroke: 'outline', width: 1.5 },
    {
      part: 'head',
      kind: 'poly',
      points: [
        [-0.26, 0.84],
        [-0.14, 0.93],
        [0, 0.95],
        [0.14, 0.93],
        [0.26, 0.84],
      ],
      fill: 'playerAccent',
      stroke: null,
    },
    {
      side: 'profile',
      part: 'head',
      kind: 'line',
      points: [
        [0.03, 0.77],
        [0.19, 0.77],
      ],
      stroke: 'floor',
      width: 2,
    },
    {
      kind: 'line',
      points: [
        [-0.4, 0.24],
        [0.4, 0.24],
      ],
      stroke: 'playerAccent',
      width: 2,
      shade: 0.8,
    },
    {
      kind: 'poly',
      points: [
        [-0.24, 0.64],
        [-0.16, 0.72],
        [0.16, 0.72],
        [0.24, 0.64],
      ],
      fill: 'garment',
      stroke: null,
      shade: 1.2,
    },
    {
      part: 'legTrail',
      kind: 'poly',
      points: [
        [-0.3, 0.0],
        [-0.26, 0.24],
        [-0.06, 0.24],
        [-0.08, 0.0],
      ],
      fill: 'tint',
      stroke: null,
      shade: 0.58,
    },
    {
      part: 'legLead',
      kind: 'poly',
      points: [
        [0.08, 0.0],
        [0.06, 0.24],
        [0.26, 0.24],
        [0.3, 0.0],
      ],
      fill: 'tint',
      stroke: null,
      shade: 0.5,
    },
    {
      side: 'front',
      part: 'head',
      kind: 'line',
      points: [
        [-0.17, 0.77],
        [0.17, 0.77],
      ],
      stroke: 'floor',
      width: 2,
    },
    {
      part: 'weapon',
      kind: 'line',
      points: [
        [0.28, 0.52],
        [1.08, 0.25],
      ],
      stroke: 'hudText',
      width: 3,
    },
    {
      part: 'weapon',
      kind: 'line',
      points: [
        [0.18, 0.42],
        [0.38, 0.62],
      ],
      stroke: 'playerAccent',
      width: 2,
    },
    {
      part: 'weapon',
      kind: 'line',
      points: [
        [0.28, 0.52],
        [0.1, 0.64],
      ],
      stroke: 'garment',
      width: 3,
    },
    {
      part: 'weapon',
      kind: 'line',
      points: [
        [0.46, 0.58],
        [0.28, 0.52],
      ],
      stroke: 'tint',
      width: 3,
    },
  ],
}))();
