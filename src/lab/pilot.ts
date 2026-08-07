
import type {
  AttackDef,
  CombatConfig,
  Enemy,
  EnemyAttackDef,
  Intent,
  Ms,
  Projectile,
  RngState,
  Vec2,
  World,
} from '../sim/types';
import { NEUTRAL_INTENT, enemyIsInvulnerable } from '../sim/types';
import { add, angleDelta, angleOf, dist, dot, len, norm, scale, sub } from '../sim/vec';
import { makeRng, nextRange } from '../sim/rng';

export interface PilotSkill {
  id: string;
  reactionMs: Ms;
  timingSpreadMs: Ms;
  standoff: number;
  patienceMs: Ms;
  staminaReserve: number;
  jitterBias: number;
  unparryableMargin: number | null;
}

export const PILOT_SKILLS: Record<string, PilotSkill> = {
  steady: {
    id: 'steady',
    jitterBias: 0.5,
    reactionMs: 180,
    timingSpreadMs: 45,
    standoff: 1.15,
    patienceMs: 140,
    staminaReserve: 24,
    unparryableMargin: 0.3,
  },
  bold: {
    id: 'bold',
    jitterBias: 0.5,
    reactionMs: 180,
    timingSpreadMs: 45,
    standoff: 0.95,
    patienceMs: 140,
    staminaReserve: 24,
    unparryableMargin: null,
  },
  instant: {
    id: 'instant',
    jitterBias: 0.5,
    reactionMs: 0,
    timingSpreadMs: 0,
    standoff: 1.15,
    patienceMs: 140,
    staminaReserve: 24,
    unparryableMargin: 0.3,
  },
  raw: {
    id: 'raw',
    jitterBias: 0,
    reactionMs: 320,
    timingSpreadMs: 130,
    standoff: 0.7,
    patienceMs: 0,
    staminaReserve: 0,
    unparryableMargin: null,
  },
};

export const DEFAULT_PILOT_SKILL_ID = 'steady';

interface Threat {
  impactMs: Ms;
  fromPos: Vec2;
  parryable: boolean;
  jitterMs: Ms;
}

interface Threats {
  soonest: Threat;
  second: Threat | null;
}

const alive = (enemy: Enemy): boolean =>
  enemy.state.kind !== 'dead' && !enemyIsInvulnerable(enemy);

const attackOf = (cfg: CombatConfig, enemy: Enemy): EnemyAttackDef | undefined =>
  cfg.enemies[enemy.archetype].attacks[enemy.state.attackIndex];

const telegraphedShelter = (
  world: World,
  cfg: CombatConfig,
  reactionMs: Ms,
): Vec2 | null => {
  const p = world.players[0];
  for (const enemy of world.enemies) {
    if (enemy.state.kind !== 'telegraph' || enemy.state.elapsedMs < reactionMs) continue;
    const ecfg = cfg.enemies[enemy.archetype];
    const def = ecfg.attacks[enemy.state.attackIndex];
    const wave = ecfg.volley?.shockwave;
    if (def?.kind !== 'shockwave' || wave === undefined) continue;

    const { x: hx, y: hy } = world.arena.halfExtents;
    let best: Vec2 | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const x of [-hx, hx]) {
      for (const y of [-hy, hy]) {
        const corner = { x, y };
        const d = dist(p.pos, corner);
        if (d < bestDist) {
          best = corner;
          bestDist = d;
        }
      }
    }
    if (best !== null && bestDist <= wave.cornerRadius * 0.82) return p.pos;
    return best;
  }
  return null;
};

const nearestEnemy = (world: World): Enemy | null => {
  let best: Enemy | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const enemy of world.enemies) {
    if (!alive(enemy)) continue;
    const d = dist(world.players[0].pos, enemy.pos);
    if (d < bestDist || (d === bestDist && enemy.id < (best?.id ?? Number.POSITIVE_INFINITY))) {
      best = enemy;
      bestDist = d;
    }
  }
  return best;
};

const projectileImpactMs = (world: World, cfg: CombatConfig, shot: Projectile): Ms | null => {
  if (shot.hostileTo !== 'player' || shot.kind !== 'linear') return null;
  const toPlayer = sub(world.players[0].pos, shot.pos);
  const speed = len(shot.vel);
  if (speed <= 0 || dot(toPlayer, shot.vel) <= 0) return null;
  const gap = len(toPlayer) - cfg.player.radius - cfg.projectileRadius;
  return (Math.max(0, gap) / speed) * 1000;
};

const incomingThreats = (world: World, cfg: CombatConfig, skill: PilotSkill): Threats | null => {
  let best: Threat | null = null;
  let runnerUp: Threat | null = null;
  const take = (candidate: Threat): void => {
    if (best === null || candidate.impactMs < best.impactMs) {
      runnerUp = best;
      best = candidate;
    } else if (runnerUp === null || candidate.impactMs < runnerUp.impactMs) {
      runnerUp = candidate;
    }
  };

  for (const enemy of world.enemies) {
    if (!alive(enemy)) continue;
    const swinging = enemy.state.kind === 'attack';
    if (enemy.state.kind !== 'telegraph' && !swinging) continue;
    if (!swinging && enemy.state.elapsedMs < skill.reactionMs) continue;
    const def = attackOf(cfg, enemy);
    if (def === undefined || def.kind === 'projectile') continue;

    const impactMs = swinging ? 0 : Math.max(0, def.telegraphMs - enemy.state.elapsedMs);
    const closing = (cfg.enemies[enemy.archetype].moveSpeed * impactMs) / 1000;
    const reach = def.range + def.lungeDistance + cfg.player.radius + closing;
    if (dist(world.players[0].pos, enemy.pos) > reach + 0.6) continue;

    take({
      impactMs,
      fromPos: enemy.pos,
      parryable: def.parryable,
      jitterMs: def.telegraphJitterMs,
    });
  }

  for (const shot of world.projectiles) {
    const impactMs = projectileImpactMs(world, cfg, shot);
    if (impactMs === null || impactMs > 900) continue;
    take({ impactMs, fromPos: shot.pos, parryable: true, jitterMs: 0 });
  }

  return best === null ? null : { soonest: best, second: runnerUp };
};

const crowdPressure = (world: World, cfg: CombatConfig, reach: number): Vec2 | null => {
  const bearings: number[] = [];
  let sum = { x: 0, y: 0 };
  for (const enemy of world.enemies) {
    if (!alive(enemy)) continue;
    const toEnemy = sub(enemy.pos, world.players[0].pos);
    if (len(toEnemy) > reach + cfg.enemies[enemy.archetype].radius) continue;
    bearings.push(angleOf(toEnemy));
    sum = add(sum, norm(toEnemy));
  }
  if (bearings.length < 2 || len(sum) <= 0.001) return null;

  let widest = 0;
  for (let i = 0; i < bearings.length; i++) {
    for (let j = i + 1; j < bearings.length; j++) {
      widest = Math.max(widest, Math.abs(angleDelta(bearings[i], bearings[j])));
    }
  }
  if (widest <= (cfg.player.guard.arcDeg * Math.PI) / 180) return null;

  return norm(scale(sum, -1));
};

const unparryableStandoff = (
  cfg: CombatConfig,
  target: Enemy,
  margin: number | null,
): number => {
  if (margin === null) return 0;
  if (target.state.kind === 'recovery' || target.state.kind === 'stagger') return 0;

  let worst = 0;
  for (const def of cfg.enemies[target.archetype].attacks) {
    if (def.parryable || def.kind === 'projectile') continue;
    worst = Math.max(worst, def.range + def.lungeDistance + cfg.player.radius);
  }
  return worst === 0 ? 0 : worst + margin;
};

const shieldCannotCoverBoth = (world: World, cfg: CombatConfig, threats: Threats): boolean => {
  const second = threats.second;
  if (second === null) return false;
  if (second.impactMs > threats.soonest.impactMs + cfg.player.parry.perfectMs) return false;

  const toFirst = sub(threats.soonest.fromPos, world.players[0].pos);
  const toSecond = sub(second.fromPos, world.players[0].pos);
  if (len(toFirst) <= 0.001 || len(toSecond) <= 0.001) return false;

  const halfArc = (cfg.player.guard.arcDeg * Math.PI) / 360;
  return Math.abs(angleDelta(angleOf(toFirst), angleOf(toSecond))) > halfArc;
};

const commitmentOf = (attack: AttackDef): Ms =>
  attack.windupMs + attack.activeMs + attack.recoveryMs;

const perpendicular = (v: Vec2): Vec2 => ({ x: -v.y, y: v.x });

export class Pilot {
  readonly skill: PilotSkill;
  private readonly rng: RngState;
  private pressScatterMs = 0;
  private scatterForTick = -1;
  private orbitSign = 1;

  constructor(skill: PilotSkill = PILOT_SKILLS[DEFAULT_PILOT_SKILL_ID], seed = 1) {
    this.skill = skill;
    this.rng = makeRng(seed);
  }

  intent(world: World, cfg: CombatConfig): Intent {
    const p = world.players[0];
    const pc = cfg.player;
    if (p.state.kind === 'dead') return { ...NEUTRAL_INTENT, move: { x: 0, y: 0 } };

    const target = nearestEnemy(world);
    const threats = incomingThreats(world, cfg, this.skill);
    const threat = threats?.soonest ?? null;
    const facePos = threat !== null ? threat.fromPos : (target?.pos ?? null);
    const toFace = facePos === null ? null : sub(facePos, p.pos);
    const facing = toFace !== null && len(toFace) > 0.001 ? angleOf(toFace) : p.facing;

    const out: Intent = { ...NEUTRAL_INTENT, move: { x: 0, y: 0 }, facing };

    const accepts =
      p.state.kind === 'idle' ||
      p.state.kind === 'move' ||
      p.state.kind === 'guard' ||
      p.state.kind === 'parry';

    const shelter = telegraphedShelter(world, cfg, this.skill.reactionMs);
    if (shelter !== null && accepts) {
      const toward = sub(shelter, p.pos);
      out.move = len(toward) > 0.05 ? norm(toward) : { x: 0, y: 0 };
      return out;
    }

    let steering: 'free' | 'held' = 'free';
    if (threats !== null && accepts) {
      const answer = this.answerThreat(out, world, cfg, threats);
      if (answer === 'answered') return out;
      if (answer === 'retreat') steering = 'held';
    }

    if (target === null) return out;

    const gap = dist(p.pos, target.pos);
    const reach = pc.attacks.light.range + cfg.enemies[target.archetype].radius;
    const standoff = Math.max(reach * this.skill.standoff, unparryableStandoff(cfg, target, this.skill.unparryableMargin));
    const toTarget = sub(target.pos, p.pos);
    const dir = len(toTarget) > 0.001 ? norm(toTarget) : { x: 1, y: 0 };

    const orbit = scale(perpendicular(dir), this.orbitSign * 0.45);
    const crowd = crowdPressure(world, cfg, reach);
    if (steering === 'held') {
    } else if (crowd !== null) {
      out.move = crowd;
    } else if (gap > standoff + 0.15) out.move = norm({ x: dir.x + orbit.x, y: dir.y + orbit.y });
    else if (gap < standoff - 0.35) out.move = scale(dir, -1);
    else out.move = orbit;

    if (accepts) this.considerAttack(out, world, cfg, target, gap, threats);
    return out;
  }

  private answerThreat(
    out: Intent,
    world: World,
    cfg: CombatConfig,
    threats: Threats,
  ): 'answered' | 'retreat' | 'none' {
    const p = world.players[0];
    const pc = cfg.player;
    const threat = threats.soonest;

    if (shieldCannotCoverBoth(world, cfg, threats)) {
      const away = this.awayFromBoth(world, threats);
      out.move = away;
      if (
        threat.impactMs <= pc.step.iframeMs * 0.5 + 40 &&
        p.stamina >= pc.step.staminaCost &&
        p.state.kind !== 'parry'
      ) {
        out.stepPressed = true;
        return 'answered';
      }
      out.guardHeld = true;
      return 'answered';
    }

    if (this.scatterForTick !== world.tick) {
      this.pressScatterMs = nextRange(this.rng, -this.skill.timingSpreadMs, this.skill.timingSpreadMs);
      this.scatterForTick = world.tick;
    }

    if (!threat.parryable) {
      const stepLead = pc.step.iframeMs * 0.5;
      out.move = norm(scale(sub(threat.fromPos, p.pos), -1));
      if (threat.impactMs > stepLead + 40 || p.stamina < pc.step.staminaCost) return 'retreat';
      out.stepPressed = true;
      return 'answered';
    }

    if (p.parryLockoutMs > 0) {
      out.guardHeld = true;
      return 'answered';
    }

    const lead =
      pc.parry.onsetMs +
      pc.parry.perfectMs / 2 +
      this.pressScatterMs -
      threat.jitterMs * this.skill.jitterBias;
    if (threat.impactMs > lead) return 'none';

    out.guardHeld = true;
    if (p.state.kind !== 'parry') out.guardPressed = true;
    return 'answered';
  }

  private awayFromBoth(world: World, threats: Threats): Vec2 {
    const p = world.players[0];
    const toFirst = sub(threats.soonest.fromPos, p.pos);
    const toSecond = threats.second === null ? toFirst : sub(threats.second.fromPos, p.pos);
    const bisector = add(norm(toFirst), norm(toSecond));
    return len(bisector) > 0.001 ? norm(scale(bisector, -1)) : norm(scale(toFirst, -1));
  }

  private considerAttack(
    out: Intent,
    world: World,
    cfg: CombatConfig,
    target: Enemy,
    gap: number,
    threats: Threats | null,
  ): void {
    const p = world.players[0];
    const pc = cfg.player;
    const heavyReach = pc.attacks.heavy.range + cfg.enemies[target.archetype].radius;
    const lightReach = pc.attacks.light.range + cfg.enemies[target.archetype].radius;

    const openTarget = target.state.kind === 'recovery' || target.state.kind === 'stagger';
    const riposte = p.riposteWindowMs > 0;

    if (
      (riposte || openTarget) &&
      gap <= heavyReach &&
      p.stamina >= pc.attacks.heavy.staminaCost + this.skill.staminaReserve &&
      this.windowIsClear(threats, commitmentOf(pc.attacks.heavy))
    ) {
      out.heavyPressed = true;
      this.orbitSign = -this.orbitSign;
      return;
    }

    if (
      gap <= lightReach &&
      p.stamina >= pc.attacks.light.staminaCost + this.skill.staminaReserve &&
      target.state.kind !== 'telegraph' &&
      this.windowIsClear(threats, commitmentOf(pc.attacks.light))
    ) {
      out.lightPressed = true;
      this.orbitSign = -this.orbitSign;
    }
  }

  private windowIsClear(threats: Threats | null, costMs: Ms): boolean {
    if (threats === null) return true;
    return threats.soonest.impactMs > costMs + this.skill.patienceMs;
  }
}
