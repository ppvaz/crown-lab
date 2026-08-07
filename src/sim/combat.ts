
import type {
  AttackDef,
  CombatConfig,
  Enemy,
  EnemyArchetype,
  EnemyAttackDef,
  EntityId,
  Ms,
  ParryDef,
  Player,
  Radians,
  Vec2,
  World,
} from './types';
import { enemyGuardIsUp, enemyIsInvulnerable, playerAttackDef } from './types';
import { add, angleDelta, angleOf, lenSq, norm, scale, sub } from './vec';
import { clampToArena } from './arena';
import { requestSlowMo } from './slowmo';
import { continueEnemySequence, resetEnemySequence } from './sequence';
import { applyDamageToCompanion } from './companion';
import { cos, sin } from './trig';
import { emit, killEnemy } from './events';

const DEG = Math.PI / 180;


export const inArc = (
  from: Vec2,
  facing: Radians,
  to: Vec2,
  range: number,
  arcDeg: number,
): boolean => {
  const d = sub(to, from);
  const dd = lenSq(d);
  if (dd > range * range) return false;
  if (dd === 0) return true;
  if (arcDeg >= 360) return true;
  return Math.abs(angleDelta(facing, angleOf(d))) <= (arcDeg * DEG) / 2;
};


export type ParryPhase =
  | 'onset'
  | 'perfect'
  | 'late'
  | 'expired';

export const parryPhaseAt = (elapsedMs: Ms, parry: ParryDef): ParryPhase => {
  const perfectStart = parry.onsetMs - parry.bufferMs;
  const perfectEnd = parry.onsetMs + parry.perfectMs;
  if (elapsedMs < perfectStart) return 'onset';
  if (elapsedMs < perfectEnd) return 'perfect';
  if (elapsedMs < perfectEnd + parry.lateMs) return 'late';
  return 'expired';
};

const parryOffsetMs = (elapsedMs: Ms, parry: ParryDef): Ms =>
  elapsedMs - (parry.onsetMs + parry.perfectMs / 2);

export const applyHitstop = (
  world: World,
  ms: Ms,
  attacker: Player,
  struck: readonly { hitstopMs?: Ms }[],
): void => {
  if (world.players.length === 1) {
    world.hitstopMs = Math.max(world.hitstopMs, ms);
    return;
  }
  attacker.hitstopMs = Math.max(attacker.hitstopMs ?? 0, ms);
  for (const body of struck) body.hitstopMs = Math.max(body.hitstopMs ?? 0, ms);
};


export const staggerEnemy = (world: World, enemy: Enemy, forMs?: Ms): void => {
  if (enemy.state.kind === 'stagger') return;
  enemy.poise = 0;
  enemy.staggerAfterAttack = false;
  resetEnemySequence(enemy);
  enemy.state = {
    kind: 'stagger',
    enteredTick: world.tick,
    elapsedMs: 0,
    attackIndex: enemy.state.attackIndex,
    telegraphJitterMs: 0,
    struck: [],
  };
  enemy.vel = { x: 0, y: 0 };
  enemy.staggerOverrideMs = forMs;
  emit(world, 'enemy_staggered', { actor: enemy.id, data: forMs === undefined ? {} : { forMs } });
};

const killEnemyByPlayer = (
  world: World,
  p: Player,
  enemy: Enemy,
  cfg: CombatConfig,
  byHeavy: boolean,
): void => {
  resetEnemySequence(enemy);
  killEnemy(world, enemy, 'player');

  if (cfg.player.staminaOnKill > 0) {
    p.stamina = Math.min(cfg.player.maxStamina, p.stamina + cfg.player.staminaOnKill);
  }

  const alive = world.enemies.filter((e) => e.state.kind !== 'dead').length;
  if (alive === 0) requestSlowMo(world, p, 'last_enemy');
  else if (byHeavy) requestSlowMo(world, p, 'lethal_heavy');
};

type GuardAnswer = 'none' | 'blocked' | 'parried';

const guardCovers = (
  p: Player,
  enemy: Enemy,
  ecfg: CombatConfig['enemies'][EnemyArchetype],
  heavy: boolean,
): boolean => {
  if (!enemyGuardIsUp(enemy, ecfg)) return false;
  if (ecfg.defence?.unearned !== undefined) return p.state.earned !== true;
  return !heavy;
};

const guardAnswer = (
  world: World,
  p: Player,
  enemy: Enemy,
  ecfg: CombatConfig['enemies'][EnemyArchetype],
  def: AttackDef,
  heavy: boolean,
  cfg: CombatConfig,
): GuardAnswer => {
  const guard = ecfg.defence;
  if (guard === undefined) return 'none';
  if (!guardCovers(p, enemy, ecfg, heavy)) return 'none';
  if (!inArc(enemy.pos, enemy.facing, p.pos, Number.POSITIVE_INFINITY, guard.arcDeg)) {
    return 'none';
  }

  enemy.guardAbsorbs = (enemy.guardAbsorbs ?? 0) + 1;
  const counter = guard.unearned;
  const parried =
    counter !== undefined &&
    counter.parryEveryNth > 0 &&
    enemy.guardAbsorbs % counter.parryEveryNth === 0;

  enemy.guardImpactTick = world.tick;
  enemy.guardImpactParried = parried;

  p.state.struck.push(enemy.id);

  if (parried && counter !== undefined) {
    enemy.attackCooldownMs = Math.min(enemy.attackCooldownMs, counter.counterCooldownMs);
    applyHitstop(world, counter.parryHitstopMs, p, [enemy]);
    spendStamina(world, p, cfg, counter.parryStaminaCost);

    emit(world, 'enemy_parried', {
      actor: enemy.id,
      target: p.id,
      data: {
        attack: p.state.attack ?? 'none',
        absorbed: def.damage,
        staminaCost: counter.parryStaminaCost,
        staminaRemaining: p.stamina,
        counterCooldownMs: counter.counterCooldownMs,
        absorbs: enemy.guardAbsorbs,
        enemyState: enemy.state.kind,
      },
    });
    enterPlayerStagger(world, p);
    return 'parried';
  }

  const chip = def.damage * guard.chipFraction;
  enemy.hp -= chip;
  enemy.attackCooldownMs = Math.min(enemy.attackCooldownMs, guard.provokedCooldownMs);
  applyHitstop(world, def.hitstopMs, p, [enemy]);

  emit(world, 'enemy_blocked', {
    actor: p.id,
    target: enemy.id,
    data: {
      damage: chip,
      absorbed: def.damage - chip,
      hpRemaining: Math.max(0, enemy.hp),
      provokedCooldownMs: guard.provokedCooldownMs,
      enemyState: enemy.state.kind,
      absorbs: enemy.guardAbsorbs,
    },
  });

  if (enemy.hp <= 0) killEnemyByPlayer(world, p, enemy, cfg, false);
  return 'blocked';
};

export const resolvePlayerAttack = (world: World, player: Player, cfg: CombatConfig): void => {
  const kind = player.state.attack;
  if (kind === null) return;
  const def = playerAttackDef(player.state, cfg.player)!;
  const heavy = kind === 'heavy';

  for (const enemy of world.enemies) {
    if (player.state.struck.length >= def.maxTargets) break;
    if (enemy.state.kind === 'dead') continue;
    if (enemyIsInvulnerable(enemy)) continue;
    if (player.state.struck.includes(enemy.id)) continue;

    const ecfg = cfg.enemies[enemy.archetype];
    if (!inArc(player.pos, player.facing, enemy.pos, def.range + ecfg.radius, def.arcDeg)) continue;

    const answer = guardAnswer(world, player, enemy, ecfg, def, heavy, cfg);
    if (answer === 'blocked') continue;
    if (answer === 'parried') return;

    player.state.struck.push(enemy.id);
    enemy.hp -= def.damage;
    enemy.poise -= def.poiseDamage;

    const push = scale(
      norm(sub(enemy.pos, player.pos)),
      def.knockback * (ecfg.knockbackScale ?? 1),
    );

    emit(world, 'hit_landed', {
      actor: player.id,
      target: enemy.id,
      data: {
        attack: kind,
        damage: def.damage,
        poiseDamage: def.poiseDamage,
        hpRemaining: Math.max(0, enemy.hp),
        poiseRemaining: Math.max(0, enemy.poise),
        enemyState: enemy.state.kind,
        ...(player.state.chainStep !== undefined ? { chainStep: player.state.chainStep } : {}),
      },
    });

    applyHitstop(world, def.hitstopMs, player, [enemy]);

    if (enemy.hp <= 0) killEnemyByPlayer(world, player, enemy, cfg, heavy);
    else if (enemy.poise <= 0) staggerEnemy(world, enemy);



    enemy.vel = { x: enemy.vel.x + push.x, y: enemy.vel.y + push.y };
  }
};


export interface IncomingHit {
  amount: number;
  sourceId: EntityId;
  fromPos: Vec2;
  parryable: boolean;
  attackId: string;
}

export type HitOutcome = 'evaded' | 'parried' | 'blocked' | 'guard_broken' | 'hit';

const enterPlayerStagger = (world: World, p: Player): void => {
  p.state = {
    kind: 'stagger',
    enteredTick: world.tick,
    elapsedMs: 0,
    attack: null,
    struck: [],
  };
  p.vel = { x: 0, y: 0 };
};

const spendStamina = (world: World, p: Player, cfg: CombatConfig, cost: number): void => {
  p.stamina = Math.max(0, p.stamina - cost);
  p.regenDelayMs = cfg.player.staminaRegenDelayMs;
  if (p.stamina === 0) emit(world, 'stamina_empty', { actor: p.id });
};

export const applyDamageToPlayer = (
  world: World,
  player: Player,
  cfg: CombatConfig,
  hit: IncomingHit,
): HitOutcome => {
  if (player.state.kind === 'dead') return 'evaded';

  const pc = cfg.player;
  const towardSource = angleOf(sub(hit.fromPos, player.pos));
  const facesSource = (arcDeg: number): boolean =>
    arcDeg >= 360 || Math.abs(angleDelta(player.facing, towardSource)) <= (arcDeg * DEG) / 2;

  if (player.iframeMs > 0) {
    emit(world, 'attack_whiffed', {
      actor: hit.sourceId,
      target: player.id,
      data: { attackId: hit.attackId, reason: 'iframe' },
    });
    requestSlowMo(world, player, 'near_miss');
    return 'evaded';
  }

  const takeFull = (reason: string): HitOutcome => {
    player.hp = Math.max(0, player.hp - hit.amount);
    player.parryStreak = 0;
    emit(world, 'hit_received', {
      actor: hit.sourceId,
      target: player.id,
      data: {
        attackId: hit.attackId,
        damage: hit.amount,
        hpRemaining: player.hp,
        playerState: player.state.kind,
        reason,
      },
    });
    return 'hit';
  };

  if (!hit.parryable) return takeFull('unparryable');

  let attempted: ParryPhase | null = null;
  if (player.state.kind === 'parry') {
    attempted = parryPhaseAt(player.state.elapsedMs, pc.parry);
    const offsetMs = parryOffsetMs(player.state.elapsedMs, pc.parry);

    if (attempted === 'perfect' && facesSource(pc.parry.arcDeg)) {
      return perfectParry(world, player, cfg, hit, offsetMs);
    }
    if (attempted === 'onset') {
      emit(world, 'parry_failed', {
        actor: player.id,
        target: hit.sourceId,
        data: {
          attackId: hit.attackId,
          offsetMs,
          pressLeadMs: player.state.elapsedMs,
          reason: 'early',
        },
      });
      return takeFull('parry_early');
    }
    if (attempted === 'perfect') {
      emit(world, 'parry_failed', {
        actor: player.id,
        target: hit.sourceId,
        data: {
          attackId: hit.attackId,
          offsetMs,
          pressLeadMs: player.state.elapsedMs,
          reason: 'arc',
        },
      });
    } else {
      emit(world, 'parry_failed', {
        actor: player.id,
        target: hit.sourceId,
        data: {
          attackId: hit.attackId,
          offsetMs,
          pressLeadMs: player.state.elapsedMs,
          reason: 'late',
        },
      });
    }
  }

  const guarding = player.state.kind === 'guard' || player.state.kind === 'parry';
  if (!guarding) return takeFull('open');
  if (!facesSource(pc.guard.arcDeg)) return takeFull('behind_guard');

  if (!player.state.struck.includes(hit.sourceId)) player.state.struck.push(hit.sourceId);

  if (player.stamina < pc.guard.staminaPerHit) {
    player.stamina = 0;
    player.hp = Math.max(0, player.hp - hit.amount);
    player.parryStreak = 0;
    emit(world, 'guard_broken', {
      actor: hit.sourceId,
      target: player.id,
      data: { attackId: hit.attackId, damage: hit.amount, hpRemaining: player.hp },
    });
    enterPlayerStagger(world, player);
    return 'guard_broken';
  }

  spendStamina(world, player, cfg, pc.guard.staminaPerHit);
  const chip = hit.amount * pc.guard.chipFraction;
  player.hp = Math.max(0, player.hp - chip);
  if (chip > 0) player.parryStreak = 0;
  emit(world, 'guard_success', {
    actor: hit.sourceId,
    target: player.id,
    data: {
      attackId: hit.attackId,
      chip,
      hpRemaining: player.hp,
      staminaRemaining: player.stamina,
      viaLateParry: attempted === 'late' || attempted === 'expired',
    },
  });
  return 'blocked';
};

const perfectParry = (
  world: World,
  player: Player,
  cfg: CombatConfig,
  hit: IncomingHit,
  offsetMs: Ms,
): HitOutcome => {
  const parry = cfg.player.parry;

  player.stamina = Math.min(cfg.player.maxStamina, player.stamina + parry.staminaReward);
  player.riposteWindowMs = parry.riposteWindowMs;
  player.parryStreak += 1;
  if (!player.state.struck.includes(hit.sourceId)) player.state.struck.push(hit.sourceId);

  const source = world.enemies.find((e) => e.id === hit.sourceId);
  applyHitstop(world, parry.hitstopMs, player, source === undefined ? [] : [source]);
  if (source && source.state.kind !== 'dead') {
    source.poise -= parry.poiseDamage;
    const sourceDef = cfg.enemies[source.archetype].attacks[source.state.attackIndex];
    if (sourceDef?.traversesArena) {
      source.sequenceParries = (source.sequenceParries ?? 0) + 1;
      const phaseTwo = cfg.enemies[source.archetype].sequence?.phaseTwo;
      const completedPerfectPhrase =
        source.phase === 2 &&
        phaseTwo !== undefined &&
        source.sequenceStep === phaseTwo.attackIndices.length - 1 &&
        source.sequenceParries === phaseTwo.attackIndices.length;

      if (completedPerfectPhrase) {
        const ecfg = cfg.enemies[source.archetype];
        const gap = cfg.player.radius + ecfg.radius + 0.8;
        const direction = { x: cos(source.facing), y: sin(source.facing) };
        source.glideTarget = clampToArena(
          world.arena,
          add(player.pos, scale(direction, gap)),
          ecfg.radius,
        );
        source.staggerAfterAttack = true;
      }
      if (source.poise < 0) source.poise = 0;
    } else if (source.poise <= 0) {
      staggerEnemy(world, source);
    } else if (!continueEnemySequence(world, source, cfg, 'parry')) {
      source.state = {
        kind: 'recovery',
        enteredTick: world.tick,
        elapsedMs: 0,
        attackIndex: source.state.attackIndex,
        telegraphJitterMs: 0,
        struck: [],
      };
    }
  }

  emit(world, 'parry_success', {
    actor: player.id,
    target: hit.sourceId,
    data: {
      attackId: hit.attackId,
      offsetMs,
      windowMs: parry.perfectMs,
      pressLeadMs: player.state.elapsedMs,
      streak: player.parryStreak,
      staminaRemaining: player.stamina,
    },
  });
  requestSlowMo(world, player, 'perfect_parry');
  return 'parried';
};


const resolveFriendlyMelee = (
  world: World,
  attacker: Enemy,
  cfg: CombatConfig,
  def: EnemyAttackDef,
  forcedByTurncoat = false,
): void => {
  const ff = cfg.friendlyFire;
  for (const victim of world.enemies) {
    if (victim.id === attacker.id) continue;
    if (victim.state.kind === 'dead') continue;
    if (enemyIsInvulnerable(victim)) continue;
    if (attacker.state.struck.includes(victim.id)) continue;

    const reach = def.range + cfg.enemies[victim.archetype].radius;
    if (!inArc(attacker.pos, attacker.facing, victim.pos, reach, def.arcDeg)) continue;

    attacker.state.struck.push(victim.id);
    victim.hp -= def.damage;
    if (ff.poise || forcedByTurncoat) victim.poise -= def.damage;

    emit(world, 'friendly_fire', {
      actor: attacker.id,
      target: victim.id,
      data: {
        attackId: def.id,
        damage: def.damage,
        hpRemaining: Math.max(0, victim.hp),
        turncoat: forcedByTurncoat,
      },
    });

    if (victim.hp <= 0) {
      resetEnemySequence(victim);
      killEnemy(world, victim, 'friendly_fire');
    } else if ((ff.poise || forcedByTurncoat) && victim.poise <= 0) {
      staggerEnemy(world, victim);
    }
  }
};

export const resolveEnemyAttack = (
  world: World,
  enemy: Enemy,
  target: Player,
  cfg: CombatConfig,
): void => {
  const ecfg = cfg.enemies[enemy.archetype];
  const def = ecfg.attacks[enemy.state.attackIndex];
  if (def === undefined || def.kind !== 'melee') return;

  if ((enemy.turncoatMs ?? 0) > 0) {
    resolveFriendlyMelee(world, enemy, cfg, def, true);
    return;
  }

  if (cfg.friendlyFire.melee) resolveFriendlyMelee(world, enemy, cfg, def);

  const companion = world.companion;
  if (
    companion !== null &&
    companion.state === 'following' &&
    !enemy.state.struck.includes(companion.id) &&
    inArc(
      enemy.pos,
      enemy.facing,
      companion.pos,
      def.range + companion.radius,
      def.arcDeg,
    )
  ) {
    enemy.state.struck.push(companion.id);
    applyDamageToCompanion(world, def.damage, enemy.id, def.id);
  }

  if (enemy.state.struck.includes(target.id)) return;

  if (target.state.kind === 'dead') return;

  const reach = def.range + cfg.player.radius;
  if (!inArc(enemy.pos, enemy.facing, target.pos, reach, def.arcDeg)) {
    if (enemy.state.elapsedMs <= def.activeMs / 2) {
      const d = lenSq(sub(target.pos, enemy.pos));
      const grazeSq = (reach + 0.6) * (reach + 0.6);
      if (d <= grazeSq) requestSlowMo(world, target, 'near_miss');
    }
    return;
  }

  enemy.state.struck.push(target.id);
  applyDamageToPlayer(world, target, cfg, {
    amount: def.damage,
    sourceId: enemy.id,
    fromPos: enemy.pos,
    parryable: def.parryable,
    attackId: def.id,
  });
};
