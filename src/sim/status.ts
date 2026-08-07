
import type { Enemy, Ms, World } from './types';
import { PLAYER_ID, enemyIsInvulnerable } from './types';
import { resetEnemySequence } from './sequence';
import { requestSlowMo } from './slowmo';
import { emit, killEnemy } from './events';

type StatusKind = 'freeze' | 'incinerate' | 'turncoat';

const emitApplied = (
  world: World,
  enemy: Enemy,
  status: StatusKind,
  durationMs: Ms,
): void => {
  emit(world, 'enemy_status_applied', {
    actor: PLAYER_ID,
    target: enemy.id,
    data: { status, durationMs },
  });
};

export const applyFreeze = (world: World, enemy: Enemy, durationMs: Ms): void => {
  enemy.frozenMs = Math.max(enemy.frozenMs ?? 0, durationMs);
  enemy.vel = { x: 0, y: 0 };
  emitApplied(world, enemy, 'freeze', durationMs);
};

export const applyIncinerate = (
  world: World,
  enemy: Enemy,
  durationMs: Ms,
  tickIntervalMs: Ms,
  damagePerTick: number,
): void => {
  enemy.burningMs = Math.max(enemy.burningMs ?? 0, durationMs);
  enemy.burnTickMs = 0;
  enemy.burnTickIntervalMs = tickIntervalMs;
  enemy.burnDamage = damagePerTick;
  emitApplied(world, enemy, 'incinerate', durationMs);
};

export const applyTurncoat = (world: World, enemy: Enemy, durationMs: Ms): void => {
  enemy.turncoatMs = Math.max(enemy.turncoatMs ?? 0, durationMs);
  emitApplied(world, enemy, 'turncoat', durationMs);
};

const endStatus = (world: World, enemy: Enemy, status: StatusKind): void => {
  emit(world, 'enemy_status_ended', {
    actor: enemy.id,
    data: { status },
  });
};

const killByIncineration = (world: World, enemy: Enemy): void => {
  resetEnemySequence(enemy);
  killEnemy(world, enemy, 'incinerate');
  if (world.enemies.every((candidate) => candidate.state.kind === 'dead')) {
    requestSlowMo(world, world.players[0], 'last_enemy');
  }
};

const tickIncineration = (world: World, enemy: Enemy, dtMs: Ms): void => {
  const remaining = enemy.burningMs ?? 0;
  if (remaining <= 0) return;
  const activeDt = Math.min(remaining, dtMs);
  enemy.burningMs = Math.max(0, remaining - dtMs);
  enemy.burnTickMs = (enemy.burnTickMs ?? 0) + activeDt;
  const interval = Math.max(1, enemy.burnTickIntervalMs ?? 1);

  while (
    enemy.burnTickMs >= interval &&
    enemy.state.kind !== 'dead'
  ) {
    enemy.burnTickMs -= interval;
    if (enemyIsInvulnerable(enemy)) continue;
    const damage = enemy.burnDamage ?? 0;
    enemy.hp = Math.max(0, enemy.hp - damage);
    emit(world, 'enemy_status_tick', {
      actor: PLAYER_ID,
      target: enemy.id,
      data: {
        status: 'incinerate',
        damage,
        hpRemaining: enemy.hp,
      },
    });
    if (enemy.hp <= 0) killByIncineration(world, enemy);
  }

  if (enemy.burningMs <= 0) {
    enemy.burningMs = 0;
    enemy.burnTickMs = 0;
    endStatus(world, enemy, 'incinerate');
  }
};

const decaySimpleStatus = (
  world: World,
  enemy: Enemy,
  field: 'frozenMs' | 'turncoatMs',
  status: 'freeze' | 'turncoat',
  dtMs: Ms,
): void => {
  const before = enemy[field] ?? 0;
  if (before <= 0) return;
  enemy[field] = Math.max(0, before - dtMs);
  if ((enemy[field] ?? 0) <= 0) endStatus(world, enemy, status);
};

export const stepEnemyStatuses = (world: World, dtMs: Ms): void => {
  for (const enemy of world.enemies) {
    if (enemy.state.kind === 'dead') continue;
    tickIncineration(world, enemy, dtMs);
    if (enemy.hp <= 0) continue;
    decaySimpleStatus(world, enemy, 'frozenMs', 'freeze', dtMs);
    decaySimpleStatus(world, enemy, 'turncoatMs', 'turncoat', dtMs);
  }
};
