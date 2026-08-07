
import type { Vec2, World } from '../sim/types';
import { dist } from '../sim/vec';

export const DOOR_REACH = 1.35;

export const near = (a: Vec2, b: Vec2, radius = DOOR_REACH): boolean => dist(a, b) <= radius;

export const partyAt = (world: World, at: Vec2, radius = DOOR_REACH): boolean =>
  world.players.every((king) => king.state.kind === 'dead' || near(king.pos, at, radius));
