
import type {
  EntityId,
  Intent,
  Ms,
  Player,
  SlowMoConfig,
  CombatConfig,
  SlowMoTrigger,
  TimeScales,
  World,
} from './types';
import { NEUTRAL_INTENT } from './types';
import { emit } from './events';

const TRIGGER_RANK: Record<SlowMoTrigger, number> = {
  manual: 100,
  last_enemy: 60,
  parry_streak: 50,
  lethal_heavy: 45,
  perfect_parry: 40,
  multi_threat: 30,
  first_contact: 25,
  near_miss: 20,
};

export const requestSlowMo = (world: World, owner: Player, trigger: SlowMoTrigger): void => {
  const current = world.slowMo.pending;
  if (current !== null && TRIGGER_RANK[current] >= TRIGGER_RANK[trigger]) return;
  world.slowMo.pending = trigger;
  world.slowMo.pendingOwner = owner.id;
};

const ease = (t: number): number => t * t * (3 - 2 * t);

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export const currentScales = (world: World): TimeScales => world.slowMo.scales;

const threatCount = (world: World): number =>
  world.enemies.filter((e) => e.state.kind === 'telegraph' || e.state.kind === 'attack').length;

const activate = (
  world: World,
  cfg: SlowMoConfig,
  trigger: SlowMoTrigger,
  owner: Player,
): void => {
  const sm = world.slowMo;
  sm.active = true;
  sm.remainingMs = cfg.durationMs;
  owner.slowMoCooldownMs = cfg.cooldownMs;
  owner.slowMoUsedThisEncounter += 1;
  sm.lastTrigger = trigger;
  sm.ownerId = owner.id;
  emit(world, 'slowmo_started', {
    actor: owner.id,
    data: {
      trigger,
      mode: cfg.mode,
      worldScale: effectiveScale(cfg.worldScale, cfg.intensity),
      playerScale: effectiveScale(cfg.playerScale, cfg.intensity),
      intensity: cfg.intensity,
      durationMs: cfg.durationMs,
      used: owner.slowMoUsedThisEncounter,
    },
  });
};

const effectiveScale = (configured: number, intensity: number): number =>
  1 + (configured - 1) * clamp01(intensity);

export const stepSlowMo = (
  world: World,
  cfg: SlowMoConfig,
  combat: CombatConfig,
  intents: readonly Intent[],
  dtMs: Ms,
): void => {
  const sm = world.slowMo;
  const pending = sm.pending;
  const pendingOwner = sm.pendingOwner;
  sm.pending = null;
  sm.pendingOwner = null;

  if (cfg.mode === 'none') {
    sm.active = false;
    sm.remainingMs = 0;
    sm.ownerId = null;
    sm.scales = { world: 1, player: 1 };
    return;
  }

  for (const p of world.players) {
    if (p.slowMoCooldownMs > 0) p.slowMoCooldownMs = Math.max(0, p.slowMoCooldownMs - dtMs);
  }

  if (cfg.mode === 'player_focus' && pending === 'perfect_parry') {
    sm.charge += 1;
  }

  const intentOf = (player: Player): Intent =>
    intents[world.players.indexOf(player)] ?? NEUTRAL_INTENT;

  if (sm.active) {
    sm.remainingMs -= dtMs;

    const owner = world.players.find((p) => p.id === sm.ownerId) ?? world.players[0];
    const held = intentOf(owner);
    const decisive = held.lightPressed || held.heavyPressed || held.stepPressed;
    if (cfg.endOnDecisiveAction && decisive && sm.remainingMs > cfg.blendMs) {
      sm.remainingMs = cfg.blendMs;
    }

    if (sm.remainingMs <= 0) {
      sm.active = false;
      sm.remainingMs = 0;
      sm.ownerId = null;
      sm.scales = { world: 1, player: 1 };
      emit(world, 'slowmo_ended', {
        data: { trigger: sm.lastTrigger ?? 'none' },
      });
      return;
    }
  } else {
    const owner = ownerFor(world, cfg, pendingOwner, intents);
    if (canFire(cfg, owner)) {
      const trigger = chooseTrigger(world, cfg, combat, pending, owner, intentOf(owner));
      if (trigger !== null) activate(world, cfg, trigger, owner);
    }
  }

  if (!sm.active) {
    sm.scales = { world: 1, player: 1 };
    return;
  }

  const elapsed = cfg.durationMs - sm.remainingMs;
  const depth =
    cfg.blendMs <= 0
      ? 1
      : ease(Math.min(clamp01(elapsed / cfg.blendMs), clamp01(sm.remainingMs / cfg.blendMs)));

  sm.scales = {
    world: 1 + (effectiveScale(cfg.worldScale, cfg.intensity) - 1) * depth,
    player: 1 + (effectiveScale(cfg.playerScale, cfg.intensity) - 1) * depth,
  };
};

const ownerFor = (
  world: World,
  cfg: SlowMoConfig,
  pendingOwner: EntityId | null,
  intents: readonly Intent[],
): Player => {
  if (cfg.mode === 'player_focus') {
    const presser = world.players.find(
      (player, index) => intents[index]?.focusPressed === true,
    );
    if (presser !== undefined) return presser;
  }
  if (pendingOwner === null) return world.players[0];
  return world.players.find((player) => player.id === pendingOwner) ?? world.players[0];
};

const canFire = (cfg: SlowMoConfig, owner: Player): boolean => {
  if (owner.slowMoCooldownMs > 0) return false;
  if (owner.slowMoUsedThisEncounter >= cfg.maxPerEncounter) return false;
  if (owner.state.kind === 'dead') return false;
  if (cfg.intensity <= 0) return false;
  return true;
};

const chooseTrigger = (
  world: World,
  cfg: SlowMoConfig,
  combat: CombatConfig,
  pending: SlowMoTrigger | null,
  owner: Player,
  intent: Intent,
): SlowMoTrigger | null => {
  const sm = world.slowMo;

  if (cfg.mode === 'player_focus') {
    if (!intent.focusPressed) return null;
    if (!cfg.triggers.includes('manual')) return null;
    if (sm.charge < cfg.chargePerActivation) return null;
    sm.charge -= cfg.chargePerActivation;
    return 'manual';
  }

  if (cfg.triggers.includes('multi_threat') && threatCount(world) >= 2) {
    return 'multi_threat';
  }



  if (cfg.triggers.includes('first_contact')) {
    for (const enemy of world.enemies) {
      if (enemy.state.kind !== 'telegraph') continue;
      const id = combat.enemies[enemy.archetype]?.attacks[enemy.state.attackIndex]?.id;
      if (id === undefined || sm.seenAttacks.includes(id)) continue;
      sm.seenAttacks.push(id);
      return 'first_contact';
    }
  }

  if (pending === null) return null;

  if (
    pending === 'perfect_parry' &&
    cfg.triggers.includes('parry_streak') &&
    owner.parryStreak >= cfg.streakThreshold
  ) {
    return 'parry_streak';
  }

  return cfg.triggers.includes(pending) ? pending : null;
};
