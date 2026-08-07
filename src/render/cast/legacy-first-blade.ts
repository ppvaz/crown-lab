
import type { ModelDef } from '../models';
import { FIRST_BLADE_CROWNED } from './first-blade-crowned';


export const LEGACY_FIRST_BLADE: ModelDef = /* @__PURE__ */ (() => ({
  ...FIRST_BLADE_CROWNED,
  id: 'first_blade',
  shapes: FIRST_BLADE_CROWNED.shapes.map((shape) =>
    shape.fill === 'firstBlade' && shape.part === 'head'
      ? {
          ...shape,
          points: [
            [-0.14, 1.08],
            [-0.56, 1.0],
            [-0.48, 0.86],
            [-0.16, 0.96],
          ] as Array<[number, number]>,
        }
      : shape,
  ),
}))();
