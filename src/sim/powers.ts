
import type {
  CombatConfig,
  Enemy,
  Intent,
  Ms,
  Player,
  PowerDef,
  PowerKind,
  World,
} from './types';
import { TICK_MS, enemyIsInvulnerable } from './types';
import { add, angleDelta, angleOf, dist, fromAngle, len, norm, scale, sub } from './vec';
import { clampToArena } from './arena';
import { applyHitstop, inArc } from './combat';
import { requestSlowMo } from './slowmo';
import { applyFreeze, applyIncinerate, applyTurncoat } from './status';
import { asin } from './trig';
import { emit, killEnemy } from './events';
import { skyFor, weatherPowerScale } from './weather';

const CASTABLE = new Set(['idle', 'move', 'guard', 'parry']);

const emitUsed = (
  world: World,
  player: Player,
  kind: PowerKind,
  def: PowerDef,
  targets: number,
  strain: number,
  overcast: boolean,
  from: { x: number; y: number },
): void => {
  emit(world, 'power_used', {
    actor: player.id,
    data: {
      power: kind,
      targets,
      cooldownMs: def.cooldownMs,
      staminaCost: def.staminaCost,
      range: def.range,
      arcDeg: def.arcDeg,
      facing: player.facing,
      originOffset: def.originOffset,
      sweepMs: def.sweepMs,
      strain,
      overcast,
      fromX: from.x,
      fromY: from.y,
    },
  });
};

const occluded = (
  world: World,
  cfg: CombatConfig,
  origin: { x: number; y: number },
  target: Enemy,
  targetDist: number,
): boolean => {
  const bearing = angleOf(sub(target.pos, origin));

  for (const other of world.enemies) {
    if (other.id === target.id) continue;
    if (other.state.kind === 'dead') continue;

    const d = dist(origin, other.pos);
    if (d >= targetDist) continue;

    const radius = cfg.enemies[other.archetype].radius;
    const halfWidth = d <= radius ? Math.PI : asin(radius / d);
    if (Math.abs(angleDelta(angleOf(sub(other.pos, origin)), bearing)) <= halfWidth) return true;
  }
  return false;
};

export const coneOrigin = (player: Player, def: PowerDef): { x: number; y: number } =>
  add(player.pos, fromAngle(player.facing, def.originOffset));

export const targetsInCone = (
  world: World,
  player: Player,
  cfg: CombatConfig,
  def: PowerDef,
): Enemy[] => {
  const origin = coneOrigin(player, def);
  const facing = player.facing;
  return world.enemies
    .filter((e) => e.state.kind !== 'dead' && !enemyIsInvulnerable(e))
    .filter((e) =>
      inArc(origin, facing, e.pos, def.range + cfg.enemies[e.archetype].radius, def.arcDeg),
    )
    .sort((a, b) => dist(origin, a.pos) - dist(origin, b.pos))
    .filter((e) => !occluded(world, cfg, origin, e, dist(origin, e.pos)));
};

const hurt = (
  world: World,
  player: Player,
  enemy: Enemy,
  kind: PowerKind,
  damage: number,
  poiseDamage: number,
  hitIndex: number,
): void => {
  enemy.hp -= damage;
  enemy.poise -= poiseDamage;

  emit(world, 'power_hit', {
    actor: player.id,
    target: enemy.id,
    data: {
      power: kind,
      damage,
      poiseDamage,
      hitIndex,
      hpRemaining: Math.max(0, enemy.hp),
      enemyState: enemy.state.kind,
    },
  });

  if (enemy.hp <= 0) {
    killEnemy(world, enemy, kind);
    if (world.enemies.every((e) => e.state.kind === 'dead')) {
      requestSlowMo(world, player, 'last_enemy');
    }
  } else if (enemy.poise <= 0) {
    enemy.poise = 0;
    enemy.state = {
      kind: 'stagger',
      enteredTick: world.tick,
      elapsedMs: 0,
      attackIndex: enemy.state.attackIndex,
      telegraphJitterMs: 0,
      struck: [],
    };
    enemy.vel = { x: 0, y: 0 };
    emit(world, 'enemy_staggered', { actor: enemy.id });
  }
};


const castLightning = (
  world: World,
  player: Player,
  cfg: CombatConfig,
  def: PowerDef,
): number => {
  const inCone = targetsInCone(world, player, cfg, def);
  if (inCone.length === 0) return 0;

  const origin = coneOrigin(player, def);
  const targets = def.maxTargets > 0 ? inCone.slice(0, def.maxTargets) : inCone;
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const t = def.range > 0 ? Math.min(1, dist(origin, target.pos) / def.range) : 0;
    const scale = 1 + (def.falloff - 1) * t;
    hurt(world, player, target, 'lightning', def.damage * scale, def.poiseDamage * scale, i);
  }

  if (targets.length > 0) applyHitstop(world, def.hitstopMs, player, targets);
  return targets.length;
};

export const blinkTarget = (
  world: World,
  player: Player,
  cfg: CombatConfig,
  def: PowerDef,
  aimDistance: number | null,
): { x: number; y: number } => {
  const reach = Math.max(0, Math.min(def.distance, aimDistance ?? def.distance));
  return clampToArena(
    world.arena,
    add(player.pos, fromAngle(player.facing, reach)),
    cfg.player.radius,
  );
};

export const pullTarget = (
  world: World,
  player: Player,
  cfg: CombatConfig,
  def: PowerDef,
): Enemy | undefined => targetsInCone(world, player, cfg, def)[0];

const castBlink = (
  world: World,
  player: Player,
  cfg: CombatConfig,
  def: PowerDef,
  aimDistance: number | null,
): number => {
  player.pos = blinkTarget(world, player, cfg, def, aimDistance);
  player.vel = { x: 0, y: 0 };
  player.iframeMs = Math.max(player.iframeMs, def.iframeMs);
  return 0;
};

const castPull = (
  world: World,
  player: Player,
  cfg: CombatConfig,
  def: PowerDef,
): number => {
  const target = pullTarget(world, player, cfg, def);
  if (target === undefined) return 0;

  const toPlayer = sub(player.pos, target.pos);
  const d = dist(player.pos, target.pos);
  if (d > 0) target.vel = scale(norm(toPlayer), def.forceSpeed);

  if (def.damage > 0 || def.poiseDamage > 0) {
    hurt(world, player, target, 'pull', def.damage, def.poiseDamage, 0);
  }
  applyHitstop(world, def.hitstopMs, player, [target]);
  return 1;
};

const castPush = (
  world: World,
  player: Player,
  cfg: CombatConfig,
  def: PowerDef,
): number => {
  const origin = coneOrigin(player, def);
  const inCone = targetsInCone(world, player, cfg, def);
  const targets = def.maxTargets > 0 ? inCone.slice(0, def.maxTargets) : inCone;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const away = sub(target.pos, origin);
    const direction = len(away) > 0 ? norm(away) : fromAngle(player.facing);
    target.vel = scale(direction, def.forceSpeed);
    if (def.damage > 0 || def.poiseDamage > 0) {
      hurt(world, player, target, 'push', def.damage, def.poiseDamage, i);
    }
  }




  for (const shot of world.projectiles) {
    if (shot.hazard !== true) continue;
    if (!inArc(origin, player.facing, shot.pos, def.range + cfg.projectileRadius, def.arcDeg)) {
      continue;
    }
    const away = sub(shot.pos, origin);
    const direction = len(away) > 0 ? norm(away) : fromAngle(player.facing);
    shot.vel = scale(direction, def.forceSpeed);
  }

  if (targets.length > 0) applyHitstop(world, def.hitstopMs, player, targets);
  return targets.length;
};

const castStatus = (
  world: World,
  player: Player,
  cfg: CombatConfig,
  def: PowerDef,
  kind: 'freeze' | 'incinerate' | 'turncoat',
): number => {
  const inCone = targetsInCone(world, player, cfg, def);
  const targets = def.maxTargets > 0 ? inCone.slice(0, def.maxTargets) : inCone;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    if (def.damage > 0 || def.poiseDamage > 0) {
      hurt(world, player, target, kind, def.damage, def.poiseDamage, i);
    }
    if (target.state.kind === 'dead') continue;
    if (kind === 'freeze') {
      applyFreeze(world, target, def.effectDurationMs ?? 0);
    } else if (kind === 'incinerate') {
      applyIncinerate(
        world,
        target,
        def.effectDurationMs ?? 0,
        def.effectTickMs ?? 1,
        def.damagePerTick ?? 0,
      );
    } else {
      applyTurncoat(world, target, def.effectDurationMs ?? 0);
    }
  }

  if (targets.length > 0) applyHitstop(world, def.hitstopMs, player, targets);
  return targets.length;
};


const stepChannel = (
  world: World,
  p: Player,
  intent: Intent,
  cfg: CombatConfig,
  def: PowerDef,
  dtMs: Ms,
): void => {
  const holding = intent.powerHeld && CASTABLE.has(p.state.kind) && p.powerCooldownMs <= 0;

  if (!holding) {
    if (p.powerChannelMs > 0) {
      emit(world, 'power_released', {
        actor: p.id,
        data: {
          power: cfg.power,
          heldMs: p.powerChannelMs,
          ticks: p.powerTicks,
          recoveryMs: def.releaseRecoveryMs,
        },
      });
      p.powerCooldownMs = def.releaseRecoveryMs;
    }
    p.powerChannelMs = 0;
    p.powerTickMs = 0;
    p.powerTicks = 0;
    return;
  }

  const starting = p.powerChannelMs === 0;
  p.powerChannelMs += dtMs;

  if (starting) {
    emitUsed(
      world,
      p,
      cfg.power,
      def,
      0,
      1 - p.stamina / Math.max(1, cfg.player.maxStamina),
      false,
      { x: p.pos.x, y: p.pos.y },
    );
  }

  if (p.powerChannelMs < def.channelWindupMs) return;

  p.powerTickMs += dtMs;
  if (p.powerTickMs < def.tickIntervalMs) return;
  p.powerTickMs -= def.tickIntervalMs;
  p.powerTicks += 1;

  const overcast = p.stamina < def.staminaPerTick;
  if (overcast) {
    p.stamina = 0;
    p.hp = Math.max(0, p.hp - def.overcastHpCost);
    p.parryStreak = 0;
    emit(world, 'power_overcast', {
      actor: p.id,
      data: {
        power: cfg.power,
        hpCost: def.overcastHpCost,
        hpRemaining: p.hp,
        tickIndex: p.powerTicks,
      },
    });
  } else {
    p.stamina = Math.max(0, p.stamina - def.staminaPerTick);
    p.regenDelayMs = cfg.player.staminaRegenDelayMs;
  }

  const ramped = p.powerTicks > def.damageRampTick;
  const mult = ramped ? def.damageRampMult : 1;
  const origin = coneOrigin(p, def);
  const inCone = targetsInCone(world, p, cfg, def);
  const targets = def.maxTargets > 0 ? inCone.slice(0, def.maxTargets) : inCone;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const t = def.range > 0 ? Math.min(1, dist(origin, target.pos) / def.range) : 0;
    const falloff = 1 + (def.falloff - 1) * t;
    hurt(world, p, target, cfg.power, def.damage * mult * falloff, def.poiseDamage * falloff, i);
  }
};

export const stepPowers = (
  world: World,
  player: Player,
  intent: Intent,
  cfg: CombatConfig,
  dtMs: Ms,
): void => {
  player.powerCooldownMs = Math.max(0, player.powerCooldownMs - dtMs);

  if (cfg.power === 'none') return;




  const sky = skyFor(cfg, world.tick * TICK_MS);
  const scale = weatherPowerScale(sky, cfg.power);
  const scaled = (base: PowerDef): PowerDef =>
    scale === 1
      ? base
      : {
          ...base,
          damage: base.damage * scale,
          poiseDamage: base.poiseDamage * scale,
          damagePerTick: base.damagePerTick === undefined ? undefined : base.damagePerTick * scale,
        };

  const channelDef = scaled(cfg.powers[cfg.power]);
  if (channelDef.channeled) {
    stepChannel(world, player, intent, cfg, channelDef, dtMs);
    return;
  }

  if (!intent.powerPressed) return;
  if (!CASTABLE.has(player.state.kind)) return;
  if (player.powerCooldownMs > 0) return;

  const def = scaled(cfg.powers[cfg.power]);
  const affordable = player.stamina >= def.staminaCost;
  if (!affordable && def.overcastHpCost <= 0) return;

  const strain = 1 - player.stamina / Math.max(1, cfg.player.maxStamina);

  player.stamina = Math.max(0, player.stamina - def.staminaCost);
  player.regenDelayMs = cfg.player.staminaRegenDelayMs;
  player.powerCooldownMs = def.cooldownMs;

  if (!affordable) {
    player.hp = Math.max(0, player.hp - def.overcastHpCost);
    player.parryStreak = 0;
    emit(world, 'power_overcast', {
      actor: player.id,
      data: { power: cfg.power, hpCost: def.overcastHpCost, hpRemaining: player.hp },
    });
  }

  const overcast = !affordable;

  const castFrom = { x: player.pos.x, y: player.pos.y };
  let targets = 0;
  switch (cfg.power) {
    case 'lightning':
      targets = castLightning(world, player, cfg, def);
      break;
    case 'blink':
      targets = castBlink(world, player, cfg, def, intent.aimDistance);
      break;
    case 'pull':
      targets = castPull(world, player, cfg, def);
      break;
    case 'push':
      targets = castPush(world, player, cfg, def);
      break;
    case 'freeze':
    case 'incinerate':
    case 'turncoat':
      targets = castStatus(world, player, cfg, def, cfg.power);
      break;
  }

  emitUsed(world, player, cfg.power, def, targets, overcast ? 1 : strain, overcast, castFrom);
};

