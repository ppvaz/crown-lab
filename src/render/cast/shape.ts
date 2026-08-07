
import type { ModelShape, ModelView, ShapePart } from '../models';

export type { ShapePart };

export type Points = Array<[number, number]>;
export type ShapeOpts = Partial<Omit<ModelShape, 'kind' | 'points' | 'cx' | 'cy' | 'rx' | 'ry'>>;

export const poly = (points: Points, fill: string | null, opts: ShapeOpts = {}): ModelShape => ({
  kind: 'poly',
  points,
  fill,
  stroke: 'outline',
  width: 1.25,
  ...opts,
});

export const line = (points: Points, stroke: string, width = 1.5, opts: ShapeOpts = {}): ModelShape => ({
  kind: 'line',
  points,
  fill: null,
  stroke,
  width,
  ...opts,
});

export const ellipse = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string,
  opts: ShapeOpts = {},
): ModelShape => ({
  kind: 'ellipse',
  cx,
  cy,
  rx,
  ry,
  fill,
  stroke: 'outline',
  width: 1.25,
  ...opts,
});

export const orders = (
  front: ShapePart[],
  back: ShapePart[],
  profile: ShapePart[],
): Partial<Record<ModelView, ShapePart[]>> => ({ front, back, profile });

export const STANDARD_ORDER = orders(
  ['legTrail', 'legLead', 'body', 'head', 'weapon', 'shield', 'gesture'],
  ['weapon', 'shield', 'gesture', 'legTrail', 'legLead', 'body', 'head'],
  ['legTrail', 'legLead', 'body', 'head', 'weapon', 'shield', 'gesture'],
);

export const boot = (side: 'lead' | 'trail', x0: number, x1: number, shade: number): ModelShape[] => {
  const part: ShapePart = side === 'lead' ? 'legLead' : 'legTrail';
  return [
    poly(
      [
        [x0, 0.08],
        [x0 + 0.03, 0.33],
        [x1 - 0.02, 0.33],
        [x1, 0.08],
      ],
      'garment',
      { part, shade },
    ),
    poly(
      [
        [x0 - 0.02, 0],
        [x0, 0.1],
        [x1, 0.1],
        [x1 + 0.02, 0],
      ],
      'garment',
      { part, shade: shade * 0.78 },
    ),
  ];
};
