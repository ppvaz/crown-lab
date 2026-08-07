
import type { CombatConfig, Enemy, EnemyAttackDef, EnemyConfig, Ms, Vec2, World } from './types';
import { add, angleOf, dist, fromAngle, len, norm, scale, sub } from './vec';
import { applyDamageToPlayer } from './combat';
import { spawnVolleyShard } from './projectile';
import { clampToArena } from './arena';
import { cos, sin } from './trig';
import { emit } from './events';

const countLiveShards = (world: World, enemy: Enemy): number => {
  let n = 0;
  for (const shot of world.projectiles) {
    if (shot.ownerId === enemy.id && shot.shardIntegrity !== undefined) n += 1;
  }
  return n;
};

const shardAllowance = (ecfg: EnemyConfig, enemy: Enemy): number => {
  const volley = ecfg.volley;
  if (volley === undefined) return 0;
  return (enemy.phase ?? 1) >= 2 ? volley.maxLive[1] : volley.maxLive[0];
};

const insideVolleyShelter = (world: World, ecfg: EnemyConfig, at: Vec2): boolean => {
  const wave = ecfg.volley?.shockwave;
  if (wave === undefined) return false;
  const { x: hx, y: hy } = world.arena.halfExtents;
  for (const cx of [-hx, hx]) {
    for (const cy of [-hy, hy]) {
      if (dist(at, { x: cx, y: cy }) <= wave.cornerRadius) return true;
    }
  }
  return false;
};

export const volleyServeWithheld = (world: World, enemy: Enemy, ecfg: EnemyConfig): boolean =>
  ecfg.volley !== undefined && countLiveShards(world, enemy) >= shardAllowance(ecfg, enemy);

export const forcedShockwaveIndex = (
  world: World,
  enemy: Enemy,
  ecfg: EnemyConfig,
  targetPos: Vec2,
): number | undefined => {
  const shockwaveIndex = ecfg.attacks.findIndex((attack) => attack.kind === 'shockwave');
  return __CROWN_LAB__ &&
    ecfg.volley !== undefined &&
    shockwaveIndex >= 0 &&
    (enemy.hasSlammed !== true || !insideVolleyShelter(world, ecfg, targetPos))
    ? shockwaveIndex
    : undefined;
};

export const strikeVolley = (
  world: World,
  enemy: Enemy,
  cfg: CombatConfig,
  ecfg: EnemyConfig,
  def: EnemyAttackDef,
  toPlayer: Vec2,
  range: number,
): void => {
  if (enemy.state.struck.length !== 0) return;
  enemy.state.struck.push(enemy.id);
  const volley = ecfg.volley;
  if (volley !== undefined) {
    const base = range > 0 ? norm(toPlayer) : { x: 1, y: 0 };
    spawnVolleyShard(
      world,
      cfg,
      enemy.pos,
      fromAngle(angleOf(base)),
      def.projectileSpeed ?? 6.4,
      def.damage,
      enemy.id,
      volley,
    );
  }
};

export const strikeShockwave = (
  world: World,
  enemy: Enemy,
  cfg: CombatConfig,
  ecfg: EnemyConfig,
  def: EnemyAttackDef,
): void => {
  if (enemy.state.struck.length !== 0) return;
  enemy.state.struck.push(enemy.id);
  const wave = ecfg.volley?.shockwave;
  if (wave === undefined) return;
  const { x: hx, y: hy } = world.arena.halfExtents;
  const teaching = enemy.hasSlammed !== true;
  enemy.hasSlammed = true;
  for (const target of world.players) {
    if (target.state.kind === 'dead') continue;
    if (teaching) {
      let best = { x: hx, y: hy };
      let bestDist = Number.POSITIVE_INFINITY;
      for (const cx of [-hx, hx]) {
        for (const cy of [-hy, hy]) {
          const d = dist(target.pos, { x: cx, y: cy });
          if (d < bestDist) {
            bestDist = d;
            best = { x: cx, y: cy };
          }
        }
      }
      const inward = norm(sub(target.pos, best));
      const promised = add(best, scale(inward, wave.cornerRadius * 0.45));
      const destination = clampToArena(world.arena, promised, cfg.player.radius);
      const toward = sub(destination, target.pos);
      const reach = len(toward);
      const heading = reach > 0.0001 ? norm(toward) : { x: 1, y: 0 };
      target.shoveMs = wave.openingShoveMs;
      target.shoveVel = scale(heading, (reach * 2) / (wave.openingShoveMs / 1000));
      emit(world, 'volley_ward_pushed', {
        actor: enemy.id,
        target: target.id,
        data: { distance: reach, teaching: 1, x: destination.x, y: destination.y },
      });
      continue;
    }
    let sheltered = false;
    for (const cx of [-hx, hx]) {
      for (const cy of [-hy, hy]) {
        if (dist(target.pos, { x: cx, y: cy }) <= wave.cornerRadius) sheltered = true;
      }
    }
    if (sheltered) continue;
    applyDamageToPlayer(world, target, cfg, {
      amount: wave.damage,
      sourceId: enemy.id,
      fromPos: enemy.pos,
      parryable: false,
      attackId: def.id,
    });
  }
};

export const stepVolleyWard = (world: World, enemy: Enemy, cfg: CombatConfig, dtMs: Ms): void => {
  const volley = cfg.enemies[enemy.archetype].volley;
  if (volley === undefined || volley.wardRadius <= 0) return;
  if (enemy.wardPushCooldownMs !== undefined && enemy.wardPushCooldownMs > 0) {
    enemy.wardPushCooldownMs = Math.max(0, enemy.wardPushCooldownMs - dtMs);
  }
  if (enemy.warded !== true) return;
  if ((enemy.wardPushCooldownMs ?? 0) > 0) return;

  for (const target of world.players) {
    if (target.state.kind === 'dead') continue;
    const away = sub(target.pos, enemy.pos);
    const gap = len(away);
    if (gap > volley.wardRadius) continue;
    const heading = gap > 0.0001 ? norm(away) : { x: cos(enemy.facing), y: sin(enemy.facing) };
    target.shoveMs = volley.wardPushMs;
    target.shoveVel = scale(
      heading,
      (volley.wardPushDistance * 2) / (volley.wardPushMs / 1000),
    );
    enemy.wardPushCooldownMs = volley.wardPushCooldownMs;
    emit(world, 'volley_ward_pushed', {
      actor: enemy.id,
      target: target.id,
      data: { distance: volley.wardPushDistance, x: target.pos.x, y: target.pos.y },
    });
  }
};

export const closeWardOnRecovery = (enemy: Enemy, ecfg: EnemyConfig): void => {
  if (ecfg.volley === undefined) return;
  enemy.warded = true;
  enemy.patternStep = 0;
};

export const wardedStationVel = (enemy: Enemy, ecfg: EnemyConfig): Vec2 | null => {
  if (enemy.warded !== true) return null;
  const toStation = sub({ x: 0, y: 0 }, enemy.pos);
  const gap = len(toStation);
  if (gap <= 0.5) return { x: 0, y: 0 };
  const approach = Math.min(1, gap / 2.0);
  return scale(norm(toStation), ecfg.moveSpeed * (0.35 + 0.65 * approach));
};
