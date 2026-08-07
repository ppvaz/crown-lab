
import type { Arena, Vec2, World } from '../sim/types';
import { generatedCells } from './room-dressing';

export interface ChainDoors {
  back: Vec2;
  forward: Vec2;
}

export const CHAIN_DOOR_REACH = 1.1;

export const chainDoors = (arena: Arena): ChainDoors => {
  const { chambers } = generatedCells(arena);
  const centre = (cell: Vec2[]): Vec2 => ({
    x: (Math.min(...cell.map((p) => p.x)) + Math.max(...cell.map((p) => p.x))) / 2,
    y: (Math.min(...cell.map((p) => p.y)) + Math.max(...cell.map((p) => p.y))) / 2,
  });
  return { back: centre(chambers[0]), forward: centre(chambers[chambers.length - 1]) };
};

export const chainForwardOpen = (world: World): boolean => world.outcome === 'cleared';

export type ChainDoorUse = 'forward' | 'back' | null;

export const chainDoorUnderKing = (
  arena: Arena,
  world: World,
  at: Vec2,
  seed: number,
): ChainDoorUse => {
  const doors = chainDoors(arena);
  const near = (door: Vec2): boolean => Math.hypot(at.x - door.x, at.y - door.y) <= CHAIN_DOOR_REACH;
  if (near(doors.forward) && chainForwardOpen(world)) return 'forward';
  if (near(doors.back) && chainHasBack(seed)) return 'back';
  return null;
};

export const chainHasBack = (seed: number): boolean => seed > 1;

export const chainSeed = (seed: number, use: Exclude<ChainDoorUse, null>): number =>
  use === 'forward' ? seed + 1 : seed - 1;

export const chainLabel = (seed: number, use: Exclude<ChainDoorUse, null>): string =>
  `SALA ${chainSeed(seed, use)}`;
