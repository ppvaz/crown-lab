
import { chainDoors, chainForwardOpen, chainHasBack, chainLabel } from '../lab/generated-chain';
import type { World } from '../sim/types';
import type { FloorPad } from './draw';
import { floorPad } from './floor-pad';
import type { Camera } from './iso';
import type { LayoutFrame } from './layout';
import type { Palette } from './palette';

export const chainFloorPads = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  pal: Palette,
  frame: LayoutFrame,
  seed: number,
  verb: string,
): FloorPad[] => {
  const doors = chainDoors(world.arena);
  const pads = [
    floorPad(ctx, world, cam, pal, frame, {
      at: doors.forward,
      open: chainForwardOpen(world),
      label: `${chainLabel(seed, 'forward')} · ${verb}`,
      direction: 'forward',
      labelId: 'route.exit.label',
    }),
  ];
  if (chainHasBack(seed)) {
    pads.push(
      floorPad(ctx, world, cam, pal, frame, {
        at: doors.back,
        open: true,
        label: `${chainLabel(seed, 'back')} · ${verb}`,
        direction: 'back',
        labelId: 'route.back.label',
      }),
    );
  }
  return pads;
};
