
import type { Enemy, SimEvent, SimEventType, World } from './types';

export type EventPayload = Omit<SimEvent, 'tick' | 'type'>;

export const emit = (world: World, type: SimEventType, payload: EventPayload = {}): void => {
  world.events.push({ tick: world.tick, type, ...payload });
};

export const killEnemy = (world: World, enemy: Enemy, by: string): void => {
  enemy.hp = 0;
  enemy.vel = { x: 0, y: 0 };
  enemy.state = {
    kind: 'dead',
    enteredTick: world.tick,
    elapsedMs: 0,
    attackIndex: 0,
    telegraphJitterMs: 0,
    struck: [],
  };
  emit(world, 'enemy_died', { actor: enemy.id, data: { archetype: enemy.archetype, by } });
};
