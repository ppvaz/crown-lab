
import type { CombatConfig, Enemy, EnemyConfig, Ms, Player, Projectile, Vec2, World } from './types';
import { PLAYER_ID } from './types';
import { enemyIsInvulnerable } from './types';
import { add, angleDelta, angleOf, dist, fromAngle, len, norm, scale, sub } from './vec';
import { applyDamageToPlayer, staggerEnemy } from './combat';
import { arenaContains, movementCrossesClosedGate, segmentHitsObstacle } from './arena';
import { applyDamageToCompanion } from './companion';
import { emit, killEnemy } from './events';

export const spawnProjectile = (
  world: World,
  cfg: CombatConfig,
  from: Vec2,
  direction: Vec2,
  speed: number,
  damage: number,
  ownerId: number,
  targetId = PLAYER_ID,
  hostileTo: Projectile['hostileTo'] = 'player',
): Projectile => {
  const shot: Projectile = {
    id: world.nextId++,
    kind: 'linear',
    ownerId,
    pos: { x: from.x, y: from.y },
    vel: scale(norm(direction), speed),
    damage,
    hostileTo,
    reflected: false,
    turncoat: hostileTo === 'enemy',
    lifeMs: cfg.projectileLifeMs,
    maxLifeMs: cfg.projectileLifeMs,
  };
  world.projectiles.push(shot);
  emit(world, 'projectile_fired', {
    actor: ownerId,
    target: targetId,
    data: { projectile: shot.id, speed, damage },
  });
  return shot;
};

export const spawnFallingProjectile = (
  world: World,
  at: Vec2,
  impactDelayMs: Ms,
  impactRadius: number,
  damage: number,
  ownerId: number,
): Projectile => {
  const shot: Projectile = {
    id: world.nextId++,
    kind: 'falling',
    ownerId,
    pos: { x: at.x, y: at.y },
    vel: { x: 0, y: 0 },
    damage,
    hostileTo: 'player',
    reflected: false,
    lifeMs: impactDelayMs,
    maxLifeMs: impactDelayMs,
    impactRadius,
  };
  world.projectiles.push(shot);
  emit(world, 'projectile_fired', {
    actor: ownerId,
    target: PLAYER_ID,
    data: {
      projectile: shot.id,
      kind: 'falling',
      damage,
      impactDelayMs,
      impactRadius,
      x: at.x,
      y: at.y,
    },
  });
  return shot;
};

export const spawnVolleyShard = (
  world: World,
  cfg: CombatConfig,
  from: Vec2,
  direction: Vec2,
  speed: number,
  damage: number,
  ownerId: number,
  volley: NonNullable<EnemyConfig['volley']>,
): Projectile => {
  const integrity = volley.integrity;
  const shard = spawnProjectile(world, cfg, from, direction, speed, damage, ownerId);
  shard.lifeMs = volley.shardLifeMs;
  shard.maxLifeMs = volley.shardLifeMs;
  shard.shardIntegrity = integrity;
  shard.shardMaxIntegrity = integrity;
  shard.rally = 0;
  emit(world, 'volley_served', {
    actor: ownerId,
    target: PLAYER_ID,
    data: { projectile: shard.id, integrity, speed },
  });
  return shard;
};

const isShard = (shot: Projectile): boolean => shot.shardIntegrity !== undefined;

const returnShard = (
  world: World,
  shot: Projectile,
  volley: NonNullable<EnemyConfig['volley']>,
  towards: Vec2,
  from: Vec2,
  by: number,
  cfg: CombatConfig,
  radius: number,
): void => {
  const speed = len(shot.vel) * volley.speedScalePerReturn;
  const heading = norm(sub(towards, from));
  shot.hostileTo = shot.hostileTo === 'player' ? 'enemy' : 'player';
  shot.reflected = true;
  shot.turncoat = false;
  shot.vel = scale(heading, speed);
  shot.lifeMs = volley.shardLifeMs;
  shot.maxLifeMs = volley.shardLifeMs;
  shot.pos = add(from, scale(heading, radius + cfg.projectileRadius + 0.01));
  if ((shot.shardIntegrity ?? 0) > 0) shot.shardIntegrity = (shot.shardIntegrity ?? 0) - 1;
  shot.rally = (shot.rally ?? 0) + 1;
  emit(world, 'volley_returned', {
    actor: by,
    data: {
      projectile: shot.id,
      integrity: shot.shardIntegrity ?? 0,
      rally: shot.rally ?? 0,
      speed,
    },
  });
};

const outOfBounds = (world: World, p: Vec2): boolean =>
  !arenaContains(world.arena, p);

export const stepProjectiles = (world: World, cfg: CombatConfig, dtMs: Ms): void => {
  if (world.projectiles.length === 0) return;
  const dtSec = dtMs / 1000;
  const survivors: Projectile[] = [];
  const player = world.players[0];

  for (const shot of world.projectiles) {
    if (shot.kind === 'falling') {
      shot.lifeMs -= dtMs;
      if (shot.lifeMs > 0) {
        survivors.push(shot);
        continue;
      }

      const radius = shot.impactRadius ?? 0;
      let outcome = 'miss';
      if (
        player.state.kind !== 'dead' &&
        dist(shot.pos, player.pos) <= radius + cfg.player.radius
      ) {
        outcome = applyDamageToPlayer(world, player, cfg, {
          amount: shot.damage,
          sourceId: shot.id,
          fromPos: shot.pos,
          parryable: false,
          attackId: 'projectile_rain',
        });
      }
      const companion = world.companion;
      if (
        companion !== null &&
        companion.state === 'following' &&
        dist(shot.pos, companion.pos) <= radius + companion.radius
      ) {
        applyDamageToCompanion(
          world,
          shot.damage,
          shot.ownerId,
          'projectile_rain',
        );
      }
      emit(world, 'projectile_impact', {
        actor: shot.ownerId,
        target: PLAYER_ID,
        data: {
          projectile: shot.id,
          x: shot.pos.x,
          y: shot.pos.y,
          radius,
          outcome,
        },
      });
      continue;
    }

    if (isShard(shot)) {
      const owner = world.enemies.find((e) => e.id === shot.ownerId);
      const volley = owner === undefined ? undefined : cfg.enemies[owner.archetype].volley;
      const chasing = shot.hostileTo === 'player' ? player : owner;
      if (
        volley !== undefined &&
        volley.homingRateRad > 0 &&
        chasing !== undefined &&
        chasing.state.kind !== 'dead'
      ) {
        const speed = len(shot.vel);
        if (speed > 0) {
          const want = angleOf(sub(chasing.pos, shot.pos));
          const have = angleOf(shot.vel);
          const delta = angleDelta(have, want);
          const maxTurn = volley.homingRateRad * dtSec;
          const turned =
            delta > maxTurn ? have + maxTurn : delta < -maxTurn ? have - maxTurn : want;
          shot.vel = scale(fromAngle(turned), speed);
        }
      }
    }

    const previous = { ...shot.pos };
    shot.pos = add(shot.pos, scale(shot.vel, dtSec));
    shot.lifeMs -= dtMs;
    if (
      shot.lifeMs <= 0 ||
      outOfBounds(world, shot.pos) ||
      segmentHitsObstacle(world.arena, previous, shot.pos, cfg.projectileRadius) ||
      movementCrossesClosedGate(world, previous, shot.pos)
    ) {
      continue;
    }

    if (shot.hostileTo === 'player') {
      if (hitsCompanion(world, cfg, shot)) {
        applyDamageToCompanion(world, shot.damage, shot.ownerId, 'arrow');
        continue;
      }
      if (!hitsPlayer(player, cfg, shot)) {
        const blocker = cfg.friendlyFire.projectiles ? hitsEnemy(world, cfg, shot) : null;
        if (blocker === null) {
          survivors.push(shot);
          continue;
        }
        damageEnemy(world, blocker, shot.damage, 'friendly_fire', 'arrow');
        continue;
      }
      const owner = isShard(shot)
        ? world.enemies.find((e) => e.id === shot.ownerId)
        : undefined;
      const volley = owner === undefined ? undefined : cfg.enemies[owner.archetype].volley;
      const shatters = volley !== undefined && (shot.shardIntegrity ?? 0) <= 0;

      const outcome = applyDamageToPlayer(world, player, cfg, {
        amount: shatters && volley !== undefined ? volley.shatterDamage : shot.damage,
        sourceId: shot.id,
        fromPos: shot.pos,
        parryable: true,
        attackId: isShard(shot)
          ? 'volley_shard'
          : shot.hazard === true
            ? 'hazard_object'
            : 'arrow',
      });
      if (outcome === 'parried') {
        if (volley !== undefined && owner !== undefined) {
          returnShard(world, shot, volley, owner.pos, player.pos, player.id, cfg, cfg.player.radius);
        } else {
          reflect(world, player, cfg, shot);
        }
        survivors.push(shot);
      } else if (shatters && owner !== undefined) {
        shatterShard(world, shot, owner, volley, 'player', player.id);
      } else if (volley !== undefined && owner !== undefined) {
        owner.attackCooldownMs = Math.min(owner.attackCooldownMs, volley.reserveCooldownMs);
      }
      continue;
    }

    if (isShard(shot)) {
      const owner = world.enemies.find((e) => e.id === shot.ownerId);
      const volley = owner === undefined ? undefined : cfg.enemies[owner.archetype].volley;
      if (owner !== undefined && volley !== undefined && owner.state.kind !== 'dead') {
        const reach = cfg.projectileRadius + cfg.enemies[owner.archetype].radius;
        if (dist(shot.pos, owner.pos) <= reach) {
          if ((shot.shardIntegrity ?? 0) > 0 && owner.state.kind !== 'stagger') {
            returnShard(world, shot, volley, player.pos, owner.pos, owner.id, cfg, cfg.enemies[owner.archetype].radius);
            survivors.push(shot);
          } else {
            shatterShard(world, shot, owner, volley, 'enemy', owner.id);
          }
          continue;
        }
      }
    }

    const struck = hitsEnemy(world, cfg, shot);
    if (struck === null) {
      survivors.push(shot);
      continue;
    }
    const byPlayer = !shot.turncoat;
    damageEnemy(
      world,
      struck,
      shot.damage,
      byPlayer ? 'reflected_arrow' : 'turncoat',
      'arrow',
      shot.ownerId,
      byPlayer ? cfg.player.parry.reflect.poiseDamage : 0,
    );
  }

  world.projectiles = survivors;
};

const damageEnemy = (
  world: World,
  enemy: Enemy,
  damage: number,
  source: 'reflected_arrow' | 'friendly_fire' | 'turncoat',
  attackId: string,
  sourceId?: number,
  poiseDamage = 0,
): void => {
  const byPlayer = source === 'reflected_arrow';
  enemy.hp -= damage;
  enemy.poise -= poiseDamage;

  emit(world, byPlayer ? 'hit_landed' : 'friendly_fire', {
    actor: byPlayer ? PLAYER_ID : sourceId,
    target: enemy.id,
    data: {
      attack: source,
      attackId,
      damage,
      poiseDamage,
      hpRemaining: Math.max(0, enemy.hp),
      poiseRemaining: Math.max(0, enemy.poise),
    },
  });

  if (enemy.hp <= 0) {
    killEnemy(world, enemy, source);
    return;
  }
  if (poiseDamage > 0 && enemy.poise <= 0) staggerEnemy(world, enemy);
};

const shatterShard = (
  world: World,
  shot: Projectile,
  owner: Enemy,
  volley: NonNullable<EnemyConfig['volley']>,
  on: 'player' | 'enemy',
  onId: number,
): void => {
  if (on === 'enemy') owner.warded = false;
  emit(world, 'volley_shattered', {
    actor: owner.id,
    target: onId,
    data: {
      projectile: shot.id,
      on,
      rally: shot.rally ?? 0,
      x: shot.pos.x,
      y: shot.pos.y,
    },
  });
  if (on === 'enemy') staggerEnemy(world, owner, volley.shatterStaggerMs);
  else owner.attackCooldownMs = Math.min(owner.attackCooldownMs, volley.reserveCooldownMs);
};

const hitsPlayer = (player: Player, cfg: CombatConfig, shot: Projectile): boolean => {
  if (player.state.kind === 'dead') return false;
  return dist(shot.pos, player.pos) <= cfg.projectileRadius + cfg.player.radius;
};

const hitsCompanion = (world: World, cfg: CombatConfig, shot: Projectile): boolean => {
  const companion = world.companion;
  return (
    companion !== null &&
    companion.state === 'following' &&
    dist(shot.pos, companion.pos) <= cfg.projectileRadius + companion.radius
  );
};

const hitsEnemy = (world: World, cfg: CombatConfig, shot: Projectile) => {
  for (const enemy of world.enemies) {
    if (enemy.state.kind === 'dead') continue;
    if (enemyIsInvulnerable(enemy)) continue;
    if (
      enemy.id === shot.ownerId &&
      (shot.hostileTo === 'player' || shot.turncoat)
    ) {
      continue;
    }
    const reach = cfg.projectileRadius + cfg.enemies[enemy.archetype].radius;
    if (dist(shot.pos, enemy.pos) <= reach) return enemy;
  }
  return null;
};

const reflect = (world: World, p: Player, cfg: CombatConfig, shot: Projectile): void => {
  const back = cfg.player.parry.reflect;
  const speed = len(shot.vel) * back.speedScale;
  shot.hostileTo = 'enemy';
  shot.reflected = true;
  shot.turncoat = false;
  shot.damage *= back.damageScale;
  shot.vel = scale(fromAngle(p.facing), speed);
  shot.lifeMs = cfg.projectileLifeMs;
  shot.maxLifeMs = cfg.projectileLifeMs;
  shot.pos = add(p.pos, scale(norm(sub(shot.pos, p.pos)), cfg.player.radius + cfg.projectileRadius + 0.01));

  emit(world, 'projectile_reflected', {
    actor: p.id,
    data: { projectile: shot.id, damage: shot.damage, speed, poiseDamage: back.poiseDamage },
  });
};
