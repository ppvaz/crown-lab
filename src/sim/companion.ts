
import type { Companion, Ms, Player, Vec2, World } from './types';
import { add, angleOf, len, norm, scale, sub } from './vec';
import { clampArenaMovement } from './arena';
import { cos, sin } from './trig';
import { emit } from './events';

export const spawnCompanion = (
  world: World,
  name: string,
  hp: number,
  maxHp: number,
  at: Vec2,
): Companion => {
  const companion: Companion = {
    id: world.nextId++,
    name,
    pos: clampArenaMovement(world, world.players[0].pos, at, 0.46),
    vel: { x: 0, y: 0 },
    facing: world.players[0].facing,
    hp,
    maxHp,
    radius: 0.46,
    state: hp > 0 ? 'following' : 'downed',
  };
  world.companion = companion;
  return companion;
};

export const stepCompanion = (world: World, leader: Player, dtMs: Ms): void => {
  const companion = world.companion;
  if (companion === null || companion.state === 'downed') return;
  const previous = { ...companion.pos };
  const followPoint = {
    x: leader.pos.x - cos(leader.facing) * 1.35,
    y: leader.pos.y - sin(leader.facing) * 1.35,
  };
  const toTarget = sub(followPoint, companion.pos);
  const distance = len(toTarget);
  const desired =
    distance > 0.4
      ? scale(norm(toTarget), Math.min(4.2, 2.8 + Math.max(0, distance - 2) * 0.8))
      : { x: 0, y: 0 };
  const dtSec = dtMs / 1000;
  const delta = sub(desired, companion.vel);
  const deltaLength = len(delta);
  const maxDelta = 15 * dtSec;
  companion.vel =
    deltaLength <= maxDelta ? desired : add(companion.vel, scale(delta, maxDelta / deltaLength));
  companion.pos = add(companion.pos, scale(companion.vel, dtSec));
  companion.pos = clampArenaMovement(
    world,
    previous,
    companion.pos,
    companion.radius,
  );
  if (len(companion.vel) > 0.05) companion.facing = angleOf(companion.vel);
};

export const applyDamageToCompanion = (
  world: World,
  amount: number,
  sourceId: number,
  attackId: string,
): void => {
  const companion = world.companion;
  if (companion === null || companion.state === 'downed') return;
  companion.hp = Math.max(0, companion.hp - amount);
  emit(world, 'companion_hit', {
    actor: sourceId,
    target: companion.id,
    data: {
      damage: amount,
      hpRemaining: companion.hp,
      attackId,
    },
  });
  if (companion.hp > 0) return;
  companion.state = 'downed';
  companion.vel = { x: 0, y: 0 };
  emit(world, 'companion_downed', {
    actor: sourceId,
    target: companion.id,
    data: { name: companion.name },
  });
};
