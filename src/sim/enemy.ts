
import type {
  CombatConfig,
  Enemy,
  EnemyAttackDef,
  EnemyConfig,
  Ms,
  Player,
  Vec2,
  World,
} from './types';
import { enemyIsInvulnerable } from './types';
import { add, angleDelta, angleOf, dist, len, norm, scale, sub } from './vec';
import { nextInt, nextRange } from './rng';
import { resolveEnemyAttack, staggerEnemy } from './combat';
import { spawnFallingProjectile, spawnProjectile } from './projectile';
import {
  continueEnemySequence,
  resetEnemySequence,
  sequenceReposition,
  startEnemySequence,
} from './sequence';
import { arenaNavigationTarget, clampToArena, lineOfSight, rayToArenaBoundary } from './arena';
import {
  closeWardOnRecovery,
  forcedShockwaveIndex,
  stepVolleyWard,
  strikeShockwave,
  strikeVolley,
  volleyServeWithheld,
  wardedStationVel,
} from './volley';
import { cos, sin } from './trig';
import { emit } from './events';

const enter = (
  world: World,
  enemy: Enemy,
  kind: Enemy['state']['kind'],
  attackIndex = enemy.state.attackIndex,
  telegraphJitterMs = 0,
): void => {
  enemy.state = {
    kind,
    enteredTick: world.tick,
    elapsedMs: 0,
    attackIndex,
    telegraphJitterMs,
    struck: [],
  };
};

const attackSlotFree = (world: World, cfg: CombatConfig, self: Enemy): boolean => {
  let committed = 0;
  for (const e of world.enemies) {
    if (e.id === self.id) continue;
    if ((e.frozenMs ?? 0) > 0) continue;
    if (e.state.kind === 'telegraph' || e.state.kind === 'attack') committed += 1;
  }
  return committed < cfg.maxSimultaneousAttackers;
};

const attackOf = (ecfg: EnemyConfig, enemy: Enemy): EnemyAttackDef | undefined =>
  ecfg.attacks[enemy.state.attackIndex];

const reachFor = (ecfg: EnemyConfig, enemy: Enemy): number => {
  const pattern = patternFor(ecfg, enemy);
  if (pattern === undefined || pattern.length === 0) return ecfg.attackRange;
  for (const index of pattern) {
    const kind = ecfg.attacks[index]?.kind;
    if (kind !== 'volley' && kind !== 'shockwave') return ecfg.attackRange;
  }
  return Number.POSITIVE_INFINITY;
};

export const patternFor = (ecfg: EnemyConfig, enemy: Enemy): number[] | undefined =>
  (enemy.phase === 2 ? ecfg.attackPatternPhaseTwo : undefined) ?? ecfg.attackPattern;

export const nearestLivingPlayer = (players: readonly Player[], from: Vec2): Player => {
  let nearest = players[0];
  let nearestDist = Number.POSITIVE_INFINITY;
  for (const candidate of players) {
    if (candidate.state.kind === 'dead') continue;
    const dx = candidate.pos.x - from.x;
    const dy = candidate.pos.y - from.y;
    const candidateDist = dx * dx + dy * dy;
    if (candidateDist < nearestDist || (candidateDist === nearestDist && candidate.id < nearest.id)) {
      nearest = candidate;
      nearestDist = candidateDist;
    }
  }
  return nearest;
};

const turncoatTarget = (world: World, self: Enemy): Enemy | null => {
  if ((self.turncoatMs ?? 0) <= 0) return null;
  let nearest: Enemy | null = null;
  let nearestDist = Number.POSITIVE_INFINITY;
  for (const candidate of world.enemies) {
    if (candidate.id === self.id || candidate.state.kind === 'dead') continue;
    if (enemyIsInvulnerable(candidate)) continue;
    const candidateDist = dist(self.pos, candidate.pos);
    if (
      candidateDist < nearestDist ||
      (candidateDist === nearestDist && candidate.id < (nearest?.id ?? Number.POSITIVE_INFINITY))
    ) {
      nearest = candidate;
      nearestDist = candidateDist;
    }
  }
  return nearest;
};


const steer = (enemy: Enemy, ecfg: EnemyConfig, desired: { x: number; y: number }, dtMs: Ms): void => {
  const dtSec = dtMs / 1000;
  const dv = sub(desired, enemy.vel);
  const dvLen = len(dv);
  const maxDelta = ecfg.acceleration * dtSec;
  enemy.vel = dvLen <= maxDelta ? desired : add(enemy.vel, scale(dv, maxDelta / dvLen));
  enemy.pos = add(enemy.pos, scale(enemy.vel, dtSec));
};

const face = (enemy: Enemy, rate: number, targetAngle: number, dtMs: Ms): void => {
  const delta = angleDelta(enemy.facing, targetAngle);
  const maxTurn = rate * (dtMs / 1000);
  enemy.facing += Math.abs(delta) <= maxTurn ? delta : Math.sign(delta) * maxTurn;
};


interface Beat {
  world: World;
  enemy: Enemy;
  cfg: CombatConfig;
  ecfg: EnemyConfig;
  dtMs: Ms;
  companion: World['companion'];
  player: Player;
  convertedTarget: Enemy | null;
  isTurncoat: boolean;
  targetsCompanion: boolean;
  targetPos: { x: number; y: number };
  targetDead: boolean;
  toPlayer: { x: number; y: number };
  range: number;
  bearing: number;
  boss: EnemyConfig['boss'];
}


const fallToArena = ({ world, enemy, boss }: Beat): void => {
  enemy.vel = { x: 0, y: 0 };
  if (enemy.state.elapsedMs >= (boss?.entranceFallMs ?? 0)) {
    enter(world, enemy, 'entrance_roar');
    emit(world, 'boss_intro_landed', {
      actor: enemy.id,
    });
    emit(world, 'boss_intro_roar_started', {
      actor: enemy.id,
    });
  }
};

const roarOnEntrance = ({ world, enemy, boss }: Beat): void => {
  enemy.vel = { x: 0, y: 0 };
  if (enemy.state.elapsedMs >= (boss?.introRoarMs ?? 0)) {
    enter(world, enemy, 'approach');
    emit(world, 'boss_fight_started', {
      actor: enemy.id,
    });
  }
};

const roarIntoNextPhase = ({ world, enemy, ecfg }: Beat): void => {
  const phaseTwo = ecfg.sequence?.phaseTwo;
  enemy.vel = { x: 0, y: 0 };
  if (enemy.state.elapsedMs >= (ecfg.boss?.phaseRoarMs ?? 0)) {
    const phase = (enemy.phase ?? 1) + 1;
    enemy.phase = phase;
    enemy.patternStep = 0;
    if (phase !== 2 || phaseTwo === undefined || phaseTwo.attackIndices.length === 0) {
      enter(world, enemy, 'approach');
    } else {
      enemy.sequenceStep = 0;
      enemy.sequenceParries = 0;
      enemy.edgeStep = 0;
      enter(world, enemy, 'edge_reposition', phaseTwo.attackIndices[0], 0);
    }
    emit(world, 'enemy_phase_changed', {
      actor: enemy.id,
      data: { phase, hpFraction: enemy.hp / enemy.maxHp },
    });
  }
};

const closeOnTarget = (beat: Beat): void => {
  const { world, enemy, cfg, ecfg, dtMs, targetPos, targetDead, range, bearing } = beat;
  const navigation = arenaNavigationTarget(world.arena, enemy.pos, targetPos, ecfg.radius);
  const toMovementTarget = sub(navigation.point, enemy.pos);
  const movementRange = navigation.direct ? range : Number.POSITIVE_INFINITY;
  const movementBearing = len(toMovementTarget) > 0 ? angleOf(toMovementTarget) : bearing;
  face(enemy, ecfg.turnRate, movementBearing, dtMs);
  steer(
    enemy,
    ecfg,
    desiredApproachVel(world, enemy, ecfg, toMovementTarget, movementRange, targetDead),
    dtMs,
  );
  if (navigation.direct) considerAttack(world, enemy, ecfg, cfg, targetPos, range, targetDead);
};

const repositionForSequence = (beat: Beat): void => {
  const { world, enemy, ecfg, dtMs, targetPos, range, bearing } = beat;
  const reposition = sequenceReposition(enemy, ecfg);
  if (reposition === null) {
    resetEnemySequence(enemy);
    enter(world, enemy, 'approach');
    return;
  }
  if (enemy.phase === 2 && ecfg.sequence?.phaseTwo !== undefined) {
    face(enemy, ecfg.turnRate, bearing, dtMs);
    steer(enemy, ecfg, { x: 0, y: 0 }, dtMs);
    if (enemy.state.elapsedMs >= reposition.repositionMs) {
      beginTelegraph(world, enemy, ecfg, enemy.state.attackIndex, 0, range);
    }
    return;
  }
  const target = {
    x: targetPos.x + cos(enemy.sequenceAngle ?? 0) * reposition.orbitRadius,
    y: targetPos.y + sin(enemy.sequenceAngle ?? 0) * reposition.orbitRadius,
  };
  const toTarget = sub(target, enemy.pos);
  face(enemy, ecfg.turnRate, bearing, dtMs);
  steer(
    enemy,
    ecfg,
    len(toTarget) > 0.15
      ? scale(norm(toTarget), ecfg.moveSpeed * reposition.moveSpeedScale)
      : { x: 0, y: 0 },
    dtMs,
  );
  if (enemy.state.elapsedMs >= reposition.repositionMs || len(toTarget) <= 0.25) {
    beginTelegraph(world, enemy, ecfg, enemy.state.attackIndex, 0, range);
  }
};

const repositionToEdge = (beat: Beat): void => {
  const { world, enemy, ecfg, dtMs, range, bearing } = beat;
  const phaseTwo = ecfg.sequence?.phaseTwo;
  if (phaseTwo === undefined) {
    resetEnemySequence(enemy);
    enter(world, enemy, 'approach');
    return;
  }
  const target = edgeTarget(world, enemy, phaseTwo.edgeInset);
  const toTarget = sub(target, enemy.pos);
  face(enemy, ecfg.turnRate, bearing, dtMs);
  steer(
    enemy,
    ecfg,
    len(toTarget) > 0.15
      ? scale(norm(toTarget), ecfg.moveSpeed * phaseTwo.moveSpeedScale)
      : { x: 0, y: 0 },
    dtMs,
  );
  if (len(toTarget) <= 0.3 || enemy.state.elapsedMs >= phaseTwo.edgeMoveTimeoutMs) {
    const nextEdge = (enemy.edgeStep ?? 0) + 1;
    if (nextEdge >= phaseTwo.edgeVisits) {
      beginTelegraph(world, enemy, ecfg, enemy.state.attackIndex, 0, range);
    } else {
      enemy.edgeStep = nextEdge;
      enemy.state.elapsedMs = 0;
      enemy.state.enteredTick = world.tick;
    }
  }
};

const windUp = (beat: Beat): void => {
  const { world, enemy, ecfg, dtMs, toPlayer, bearing } = beat;
  const def = attackOf(ecfg, enemy);
  if (def === undefined) {
    enter(world, enemy, 'approach');
    return;
  }
  face(enemy, def.turnRateDuringWindup ?? ecfg.turnRate, bearing, dtMs);
  steer(enemy, ecfg, { x: 0, y: 0 }, dtMs);
  const feintAt = def.feint?.atMs;
  if (
    feintAt !== undefined &&
    enemy.state.elapsedMs - dtMs < feintAt &&
    enemy.state.elapsedMs >= feintAt
  ) {
    emit(world, 'enemy_feint', {
      actor: enemy.id,
      data: {
        attackId: def.id,
        remainingMs: def.telegraphMs + enemy.state.telegraphJitterMs - enemy.state.elapsedMs,
      },
    });
  }
  if (enemy.state.elapsedMs >= def.telegraphMs + enemy.state.telegraphJitterMs) {
    if (def.traversesArena) {
      enemy.glideTarget = oppositeArenaEdge(world, enemy, toPlayer, ecfg.radius);
      const flight = sub(enemy.glideTarget, enemy.pos);
      if (len(flight) > 0) enemy.facing = angleOf(flight);
    }
    enter(world, enemy, 'attack', enemy.state.attackIndex);
    emit(world, 'enemy_attack', {
      actor: enemy.id,
      data: { attackId: def.id, parryable: def.parryable, activeMs: def.activeMs },
    });
  }
};

const strike = (beat: Beat): void => {
  const {
    world, enemy, cfg, ecfg, dtMs, companion, player,
    convertedTarget, isTurncoat, targetsCompanion, targetPos, toPlayer, range,
  } = beat;
  const def = attackOf(ecfg, enemy);
  if (def === undefined) {
    enter(world, enemy, 'recovery');
    return;
  }
  if (def.kind === 'projectile') {
    if (enemy.state.struck.length === 0) {
      enemy.state.struck.push(enemy.id);
      spawnProjectile(
        world,
        cfg,
        enemy.pos,
        range > 0 ? norm(toPlayer) : { x: 1, y: 0 },
        def.projectileSpeed ?? 8,
        def.damage,
        enemy.id,
        convertedTarget?.id ??
          (isTurncoat
            ? enemy.id
            : targetsCompanion && companion !== null
              ? companion.id
              : player.id),
        isTurncoat ? 'enemy' : 'player',
      );
    }
    steer(enemy, ecfg, { x: 0, y: 0 }, dtMs);
  } else if (def.kind === 'volley') {
    strikeVolley(world, enemy, cfg, ecfg, def, toPlayer, range);
    steer(enemy, ecfg, { x: 0, y: 0 }, dtMs);
  } else if (def.kind === 'shockwave') {
    strikeShockwave(world, enemy, cfg, ecfg, def);
    steer(enemy, ecfg, { x: 0, y: 0 }, dtMs);
  } else if (def.kind === 'rain') {
    if (enemy.state.struck.length === 0) {
      enemy.state.struck.push(enemy.id);
      const rain = def.rain;
      if (rain !== undefined) {
        for (const offset of rain.offsets) {
          spawnFallingProjectile(
            world,
            clampToArena(
              world.arena,
              { x: targetPos.x + offset.x, y: targetPos.y + offset.y },
              rain.impactRadius,
            ),
            rain.impactDelayMs,
            rain.impactRadius,
            def.damage,
            enemy.id,
          );
        }
      }
    }
    steer(enemy, ecfg, { x: 0, y: 0 }, dtMs);
  } else {
    if (def.traversesArena && enemy.glideTarget !== undefined) {
      const phaseTwo = ecfg.sequence?.phaseTwo;
      const toDestination = sub(enemy.glideTarget, enemy.pos);
      const remaining = len(toDestination);
      const speed = phaseTwo?.glideSpeed ?? 0;
      const step = Math.min(remaining, speed * (dtMs / 1000));
      const direction = remaining > 0 ? scale(toDestination, 1 / remaining) : { x: 0, y: 0 };
      enemy.vel = scale(direction, speed);
      enemy.pos = add(enemy.pos, scale(direction, step));
    } else {
      const lungeSpeed = def.activeMs > 0 ? def.lungeDistance / (def.activeMs / 1000) : 0;
      steer(
        enemy,
        ecfg,
        scale({ x: cos(enemy.facing), y: sin(enemy.facing) }, lungeSpeed),
        dtMs,
      );
    }
    resolveEnemyAttack(world, enemy, player, cfg);
    if (enemy.state.kind !== 'attack') return;
  }
  const reachedGlideTarget =
    def.traversesArena &&
    enemy.glideTarget !== undefined &&
    dist(enemy.pos, enemy.glideTarget) <= 0.01;
  if (enemy.state.elapsedMs >= def.activeMs || reachedGlideTarget) {
    enemy.glideTarget = undefined;
    if (enemy.staggerAfterAttack) {
      staggerEnemy(world, enemy);
      return;
    }
    if (!continueEnemySequence(world, enemy, cfg, 'attack_completed')) {
      enter(world, enemy, 'recovery');
    }
  }
};

const recover = ({ world, enemy, ecfg, dtMs }: Beat): void => {
  const def = attackOf(ecfg, enemy);
  steer(enemy, ecfg, { x: 0, y: 0 }, dtMs);
  if (enemy.state.elapsedMs >= (def?.recoveryMs ?? 0)) {
    enemy.attackCooldownMs =
      ecfg.attackCooldownMs + nextRange(world.rng, 0, ecfg.attackCooldownJitterMs);
    enter(world, enemy, 'approach');
  }
};

const stagger = ({ world, enemy, ecfg, dtMs }: Beat): void => {

  const dtSec = dtMs / 1000;
  enemy.pos = add(enemy.pos, scale(enemy.vel, dtSec));
  const decay = Math.max(0, 1 - 6 * dtSec);
  enemy.vel = scale(enemy.vel, decay);
  if (enemy.state.elapsedMs >= (enemy.staggerOverrideMs ?? ecfg.staggerMs)) {
    enemy.staggerOverrideMs = undefined;
    closeWardOnRecovery(enemy, ecfg);
    enemy.poise = enemy.maxPoise;
    enemy.attackCooldownMs = Math.max(enemy.attackCooldownMs, ecfg.attackCooldownMs);
    enter(world, enemy, 'approach');
  }
};


export const stepEnemy = (world: World, enemy: Enemy, cfg: CombatConfig, dtMs: Ms): void => {
  if (enemy.state.kind === 'dead') return;
  if ((enemy.frozenMs ?? 0) > 0 && !enemyIsInvulnerable(enemy)) {
    enemy.vel = { x: 0, y: 0 };
    return;
  }
  const ecfg = cfg.enemies[enemy.archetype];
  const p = nearestLivingPlayer(world.players, enemy.pos);
  const companion = world.companion;
  const isTurncoat = (enemy.turncoatMs ?? 0) > 0;
  const convertedTarget = turncoatTarget(world, enemy);
  const targetsCompanion =
    convertedTarget === null &&
    ecfg.boss === undefined &&
    companion !== null &&
    companion.state === 'following' &&
    dist(enemy.pos, companion.pos) <= dist(enemy.pos, p.pos);
  const targetPos = convertedTarget?.pos ?? (targetsCompanion ? companion.pos : p.pos);
  const targetDead =
    isTurncoat
      ? convertedTarget === null
      : targetsCompanion
        ? false
        : p.state.kind === 'dead';

  stepVolleyWard(world, enemy, cfg, dtMs);

  enemy.state.elapsedMs += dtMs;
  if (
    enemy.state.kind !== 'entrance_fall' &&
    enemy.state.kind !== 'entrance_roar' &&
    enemy.state.kind !== 'phase_roar'
  ) {
    enemy.attackCooldownMs = Math.max(0, enemy.attackCooldownMs - dtMs);
  }
  if (enemy.state.kind !== 'stagger') {
    enemy.poise = Math.min(enemy.maxPoise, enemy.poise + ecfg.poiseRegenPerSec * (dtMs / 1000));
  }

  const toPlayer = sub(targetPos, enemy.pos);
  const range = dist(enemy.pos, targetPos);
  const bearing = range > 0 ? angleOf(toPlayer) : enemy.facing;
  const boss = ecfg.boss;


  const nextPhaseAt =
    boss === undefined
      ? undefined
      : (enemy.phase ?? 1) === 1
        ? boss.phaseTwoHpFraction
        : (enemy.phase ?? 1) === 2
          ? boss.phaseThreeHpFraction
          : undefined;


  if (
    (nextPhaseAt !== undefined && enemy.maxHp > 0 && enemy.hp / enemy.maxHp <= nextPhaseAt) &&
    enemy.state.kind !== 'entrance_fall' &&
    enemy.state.kind !== 'entrance_roar' &&
    enemy.state.kind !== 'phase_roar' &&
    enemy.state.kind !== 'stagger'
  ) {
    resetEnemySequence(enemy);
    enter(world, enemy, 'phase_roar');
    enemy.vel = { x: 0, y: 0 };
    emit(world, 'boss_phase_roar_started', {
      actor: enemy.id,
      data: { hpFraction: enemy.hp / enemy.maxHp },
    });
    return;
  }

  const beat: Beat = {
    world,
    enemy,
    cfg,
    ecfg,
    dtMs,
    companion,
    player: p,
    convertedTarget,
    isTurncoat,
    targetsCompanion,
    targetPos,
    targetDead,
    toPlayer,
    range,
    bearing,
    boss,
  };

  switch (enemy.state.kind) {
    case 'entrance_fall':
      return fallToArena(beat);
    case 'entrance_roar':
      return roarOnEntrance(beat);
    case 'phase_roar':
      return roarIntoNextPhase(beat);
    case 'idle':
      return enter(world, enemy, 'approach');
    case 'approach':
    case 'reposition':
      return closeOnTarget(beat);
    case 'sequence_reposition':
      return repositionForSequence(beat);
    case 'edge_reposition':
      return repositionToEdge(beat);
    case 'telegraph':
      return windUp(beat);
    case 'attack':
      return strike(beat);
    case 'recovery':
      return recover(beat);
    case 'stagger':
      return stagger(beat);
    default:
      return;
  }
};

const desiredApproachVel = (
  world: World,
  enemy: Enemy,
  ecfg: EnemyConfig,
  toPlayer: { x: number; y: number },
  range: number,
  playerDead: boolean,
) => {
  if (playerDead || range === 0) return { x: 0, y: 0 };
  const dir = norm(toPlayer);
  const station = wardedStationVel(enemy, ecfg);
  if (station !== null) return station;
  if (range > ecfg.preferredRange) return scale(dir, ecfg.moveSpeed);
  if (range < ecfg.preferredRange * 0.8) return scale(dir, -ecfg.moveSpeed);
  if (ecfg.sequence !== undefined) {
    const side = enemy.id % 2 === 0 ? 1 : -1;
    return scale({ x: -dir.y * side, y: dir.x * side }, ecfg.moveSpeed * ecfg.sequence.idleOrbitScale);
  }
  return { x: 0, y: 0 };
};

const edgeTarget = (world: World, enemy: Enemy, inset: number) => {
  const x = Math.max(0, world.arena.halfExtents.x - inset);
  const y = Math.max(0, world.arena.halfExtents.y - inset);
  const corners = [
    { x: -x, y: -y },
    { x, y: -y },
    { x, y },
    { x: -x, y },
  ];
  const start = enemy.id % corners.length;
  return corners[(start + (enemy.edgeStep ?? 0)) % corners.length];
};

const oppositeArenaEdge = (
  world: World,
  enemy: Enemy,
  towardPlayer: { x: number; y: number },
  bodyRadius: number,
) => {
  const direction =
    len(towardPlayer) > 0
      ? norm(towardPlayer)
      : { x: cos(enemy.facing), y: sin(enemy.facing) };
  const origin = clampToArena(world.arena, enemy.pos, bodyRadius);
  return rayToArenaBoundary(world.arena, origin, direction, bodyRadius);
};

const beginTelegraph = (
  world: World,
  enemy: Enemy,
  ecfg: EnemyConfig,
  index: number,
  jitter: number,
  range: number,
): void => {
  const def = ecfg.attacks[index];
  if (def === undefined) return;
  const pattern = patternFor(ecfg, enemy);
  enter(world, enemy, 'telegraph', index, jitter);
  emit(world, 'enemy_telegraph', {
    actor: enemy.id,
    data: {
      attackId: def.id,
      telegraphMs: def.telegraphMs,
      actualTelegraphMs: def.telegraphMs + jitter,
      parryable: def.parryable,
      archetype: enemy.archetype,
      range,
      phase: enemy.phase ?? 1,
      sequenceStep: (enemy.sequenceStep ?? -1) >= 0 ? (enemy.sequenceStep ?? -1) + 1 : 0,
      patternStep:
        pattern !== undefined && pattern.length > 0
          ? (((enemy.patternStep ?? 1) - 1) % pattern.length) + 1
          : 0,
    },
  });
};

const considerAttack = (
  world: World,
  enemy: Enemy,
  ecfg: EnemyConfig,
  cfg: CombatConfig,
  targetPos: Vec2,
  range: number,
  targetDead: boolean,
): void => {
  if (targetDead) return;
  if (enemy.attackCooldownMs > 0) return;
  if (range > reachFor(ecfg, enemy)) return;
  if (ecfg.attacks.length === 0) return;
  if (!attackSlotFree(world, cfg, enemy)) return;
  if (volleyServeWithheld(world, enemy, ecfg)) return;
  if (
    ecfg.attacks.every((attack) => attack.kind === 'projectile') &&
    !lineOfSight(world, enemy.pos, targetPos, cfg.projectileRadius)
  ) {
    return;
  }

  const sequenceIndex = startEnemySequence(targetPos, enemy, ecfg);
  const pattern = patternFor(ecfg, enemy);
  const patternPosition = enemy.patternStep ?? 0;
  const forcedShockwave = forcedShockwaveIndex(world, enemy, ecfg, targetPos);
  const patternIndex =
    forcedShockwave === undefined && sequenceIndex === null && pattern !== undefined && pattern.length > 0
      ? pattern[patternPosition % pattern.length]
      : undefined;
  const index =
    forcedShockwave ??
    sequenceIndex ??
    patternIndex ??
    (ecfg.attacks.length > 1 ? nextInt(world.rng, 0, ecfg.attacks.length) : 0);
  if (patternIndex !== undefined) enemy.patternStep = patternPosition + 1;
  const def = ecfg.attacks[index];
  const jitter = nextRange(world.rng, 0, def.telegraphJitterMs);
  if (sequenceIndex !== null && enemy.phase === 2 && ecfg.sequence?.phaseTwo !== undefined) {
    enter(world, enemy, 'edge_reposition', index, 0);
    return;
  }
  beginTelegraph(world, enemy, ecfg, index, jitter, range);
};
