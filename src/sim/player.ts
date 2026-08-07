
import type {
  AttackKind,
  ChainDef,
  CombatConfig,
  Intent,
  Ms,
  Player,
  PlayerStateKind,
  World,
} from './types';
import { playerAttackDef } from './types';
import { add, angleDelta, angleOf, len, norm, scale, sub } from './vec';
import { clampToArena } from './arena';
import { cos, sin } from './trig';
import { resolvePlayerAttack } from './combat';
import { emit } from './events';

const CANCELLABLE: ReadonlySet<PlayerStateKind> = new Set<PlayerStateKind>([
  'idle',
  'move',
  'guard',
  'parry',
]);

const NO_REGEN: ReadonlySet<PlayerStateKind> = new Set<PlayerStateKind>([
  'guard',
  'parry',
  'windup',
  'active',
]);

const transition = (
  world: World,
  p: Player,
  kind: PlayerStateKind,
  attack: AttackKind | null = null,
): void => {
  const from = p.state.kind;
  p.state = { kind, enteredTick: world.tick, elapsedMs: 0, attack, struck: [] };

  const trivial =
    (from === 'idle' || from === 'move') && (kind === 'idle' || kind === 'move');
  if (trivial) return;

  emit(world, 'player_state_change', {
    actor: p.id,
    data: { from, to: kind, attack: attack ?? 'none' },
  });
};

const spend = (world: World, p: Player, cfg: CombatConfig, cost: number): void => {
  p.stamina = Math.max(0, p.stamina - cost);
  p.regenDelayMs = cfg.player.staminaRegenDelayMs;
  if (p.stamina === 0) {
    emit(world, 'stamina_empty', { actor: p.id });
  }
};


const advancePhase = (world: World, p: Player, intent: Intent, cfg: CombatConfig): void => {
  const pc = cfg.player;
  const st = p.state;

  switch (st.kind) {
    case 'windup': {
      const def = playerAttackDef(st, pc)!;
      if (st.elapsedMs < def.windupMs) return;
      transition(world, p, 'active', st.attack);
      if (st.earned === true) p.state.earned = true;
      if (st.chainStep !== undefined) p.state.chainStep = st.chainStep;
      return;
    }

    case 'active': {
      const def = playerAttackDef(st, pc)!;
      resolvePlayerAttack(world, p, cfg);
      if (p.state !== st) return;
      if (st.elapsedMs >= def.activeMs) {
        const connected = st.struck.length > 0;
        const attack = st.attack;
        transition(world, p, 'recovery', attack);
        if (st.chainStep !== undefined) p.state.chainStep = st.chainStep;
        if (!connected) {
          emit(world, 'attack_whiffed', {
            actor: p.id,
            data: { attack: attack ?? 'none', recoveryMs: def.recoveryMs },
          });
        }
      }
      return;
    }

    case 'recovery': {
      const durationMs =
        st.attack === null ? pc.step.recoveryMs : playerAttackDef(st, pc)!.recoveryMs;
      if (st.elapsedMs >= durationMs) transition(world, p, 'idle');
      return;
    }

    case 'step': {
      if (st.elapsedMs >= pc.step.durationMs) transition(world, p, 'recovery', null);
      return;
    }

    case 'stagger': {
      if (st.elapsedMs >= pc.guard.guardBreakStaggerMs) transition(world, p, 'idle');
      return;
    }

    case 'parry': {
      const totalMs = pc.parry.onsetMs + pc.parry.perfectMs + pc.parry.lateMs;
      if (st.elapsedMs < totalMs) return;
      if (st.struck.length === 0) p.parryLockoutMs = pc.parry.whiffLockoutMs;
      transition(world, p, intent.guardHeld ? 'guard' : 'idle');
      return;
    }

    case 'guard': {
      if (!intent.guardHeld) transition(world, p, 'idle');
      return;
    }

    default:
      return;
  }
};


const beginStep = (world: World, p: Player, intent: Intent, cfg: CombatConfig): void => {
  const s = cfg.player.step;
  spend(world, p, cfg, s.staminaCost);
  transition(world, p, 'step');
  p.iframeMs = s.iframeMs;

  const dir = len(intent.move) > 0.001 ? norm(intent.move) : scale(fromFacing(p.facing), -1);
  p.vel = scale(dir, s.distance / (s.durationMs / 1000));

  emit(world, 'step_started', {
    actor: p.id,
    data: { distance: s.distance, iframeMs: s.iframeMs, durationMs: s.durationMs },
  });
};

const fromFacing = (a: number) => ({ x: cos(a), y: sin(a) });

const beginAttack = (world: World, p: Player, cfg: CombatConfig, kind: AttackKind): void => {
  const chain = cfg.player.chain;
  const step = chain !== undefined ? (p.chainStep ?? 0) : undefined;
  const def = chain !== undefined ? chain.steps[step!] : cfg.player.attacks[kind];
  const pose = chain !== undefined ? chain.steps[step!].pose : kind;
  const riposte = (chain !== undefined || kind === 'heavy') && p.riposteWindowMs > 0;

  const earned = p.riposteWindowMs > 0;

  spend(world, p, cfg, def.staminaCost);
  transition(world, p, 'windup', pose);
  if (earned) p.state.earned = true;
  if (chain !== undefined) {
    p.state.chainStep = step;
    p.chainStep = (step! + 1) % chain.steps.length;
    p.chainIdleMs = 0;
  }
  p.vel = { x: 0, y: 0 };

  if (riposte) {
    p.state.elapsedMs = def.windupMs * (1 - cfg.player.parry.riposteWindupScale);
    p.riposteWindowMs = 0;
  }

  emit(world, 'attack_started', {
    actor: p.id,
    data: {
      attack: pose,
      riposte,
      windupMs: def.windupMs,
      effectiveWindupMs: def.windupMs - p.state.elapsedMs,
      ...(step !== undefined ? { chainStep: step } : {}),
    },
  });
};

const resetChain = (world: World, p: Player, reason: string): void => {
  p.chainIdleMs = 0;
  if (p.chainStep === undefined || p.chainStep === 0) return;
  p.chainStep = 0;
  emit(world, 'chain_reset', { actor: p.id, data: { reason } });
};

const stepChain = (world: World, p: Player, chain: ChainDef, dtMs: Ms): void => {
  const kind = p.state.kind;
  if (kind === 'stagger') {
    resetChain(world, p, 'stagger');
    return;
  }
  const swingInFlight =
    kind === 'windup' || kind === 'active' || (kind === 'recovery' && p.state.attack !== null);
  if (swingInFlight) {
    p.chainIdleMs = 0;
    return;
  }
  p.chainIdleMs = (p.chainIdleMs ?? 0) + dtMs;
  if (p.chainIdleMs >= chain.resetMs) resetChain(world, p, 'timeout');
};

const beginGuard = (world: World, p: Player): void => {
  transition(world, p, p.parryLockoutMs > 0 ? 'guard' : 'parry');
};

const applyIntent = (world: World, p: Player, intent: Intent, cfg: CombatConfig): void => {
  const pc = cfg.player;
  if (!CANCELLABLE.has(p.state.kind)) return;

  if (intent.stepPressed && p.stamina >= pc.step.staminaCost) {
    if (pc.chain !== undefined && !pc.chain.persistThroughStep) resetChain(world, p, 'step');
    beginStep(world, p, intent, cfg);
    return;
  }
  if (pc.chain !== undefined) {
    const atkPressed = intent.lightPressed || intent.heavyPressed;
    if (atkPressed && p.stamina >= pc.chain.steps[p.chainStep ?? 0].staminaCost) {
      beginAttack(world, p, cfg, 'light');
      return;
    }
  } else {
    if (intent.heavyPressed && p.stamina >= pc.attacks.heavy.staminaCost) {
      beginAttack(world, p, cfg, 'heavy');
      return;
    }
    if (intent.lightPressed && p.stamina >= pc.attacks.light.staminaCost) {
      beginAttack(world, p, cfg, 'light');
      return;
    }
  }
  if (intent.guardPressed && p.state.kind !== 'parry') {
    if (pc.chain !== undefined && !pc.chain.persistThroughGuard) resetChain(world, p, 'guard');
    beginGuard(world, p);
    return;
  }
  if (intent.guardHeld && (p.state.kind === 'idle' || p.state.kind === 'move')) {
    if (pc.chain !== undefined && !pc.chain.persistThroughGuard) resetChain(world, p, 'guard');
    transition(world, p, 'guard');
  }
};


const MOTIONLESS: ReadonlySet<PlayerStateKind> = new Set<PlayerStateKind>([
  'windup',
  'active',
  'recovery',
  'stagger',
  'dead',
]);

const moveAndFace = (
  world: World,
  p: Player,
  intent: Intent,
  cfg: CombatConfig,
  dtMs: Ms,
): void => {
  const pc = cfg.player;
  const dtSec = dtMs / 1000;
  const kind = p.state.kind;

  if (kind === 'step') {
    p.pos = add(p.pos, scale(p.vel, dtSec));
  } else {
    const raw = intent.move;
    const rawLen = len(raw);
    const dir = rawLen > 1 ? scale(raw, 1 / rawLen) : raw;
    const channelMult =
      p.powerChannelMs > 0 && cfg.power !== 'none' ? cfg.powers[cfg.power].channelMoveMult : 1;
    const mult =
      (kind === 'guard' || kind === 'parry' ? pc.guard.moveSpeedMult : 1) * channelMult;
    const desired = MOTIONLESS.has(kind) ? { x: 0, y: 0 } : scale(dir, pc.moveSpeed * mult);

    const dv = sub(desired, p.vel);
    const dvLen = len(dv);
    const rate = len(desired) > 0.001 ? pc.acceleration : pc.deceleration;
    const maxDelta = rate * dtSec;
    p.vel = dvLen <= maxDelta ? desired : add(p.vel, scale(dv, maxDelta / dvLen));
    p.pos = add(p.pos, scale(p.vel, dtSec));
  }

  if (p.shoveMs !== undefined && p.shoveMs > 0 && p.shoveVel !== undefined) {
    const appliedMs = Math.min(dtMs, p.shoveMs);
    const remaining = Math.max(0, p.shoveMs - appliedMs);
    const decay = p.shoveMs > 0 ? remaining / p.shoveMs : 0;
    const averageVel = scale(p.shoveVel, (1 + decay) / 2);
    p.pos = add(p.pos, scale(averageVel, appliedMs / 1000));
    p.shoveVel = scale(p.shoveVel, decay);
    p.shoveMs = remaining;
    if (remaining <= 0) {
      p.shoveVel = undefined;
      p.shoveMs = undefined;
    }
  }

  p.pos = clampToArena(world.arena, p.pos, pc.radius);

  const target =
    intent.facing !== null
      ? intent.facing
      : len(intent.move) > 0.001
        ? angleOf(intent.move)
        : null;
  if (target === null) return;



  const attackRecovery = kind === 'recovery' && p.state.attack !== null;
  const rate =
    kind === 'windup'
      ? playerAttackDef(p.state, pc)!.turnRateDuringWindup
      : kind === 'active' || kind === 'stagger' || attackRecovery
        ? 0
        : pc.turnRate;
  if (rate <= 0) return;

  const delta = angleDelta(p.facing, target);
  const maxTurn = rate * dtSec;
  p.facing += Math.abs(delta) <= maxTurn ? delta : Math.sign(delta) * maxTurn;
};


export const stepPlayer = (
  world: World,
  player: Player,
  intent: Intent,
  cfg: CombatConfig,
  dtMs: Ms,
): void => {
  if (player.state.kind === 'dead') return;

  if (player.hp <= 0) {
    player.hp = 0;
    player.vel = { x: 0, y: 0 };
    transition(world, player, 'dead');
    return;
  }

  player.state.elapsedMs += dtMs;
  player.iframeMs = Math.max(0, player.iframeMs - dtMs);
  player.riposteWindowMs = Math.max(0, player.riposteWindowMs - dtMs);
  player.parryLockoutMs = Math.max(0, player.parryLockoutMs - dtMs);
  player.regenDelayMs = Math.max(0, player.regenDelayMs - dtMs);

  advancePhase(world, player, intent, cfg);
  applyIntent(world, player, intent, cfg);
  if (cfg.player.chain !== undefined) stepChain(world, player, cfg.player.chain, dtMs);
  moveAndFace(world, player, intent, cfg, dtMs);

  if (player.regenDelayMs <= 0 && !NO_REGEN.has(player.state.kind)) {
    player.stamina = Math.min(
      cfg.player.maxStamina,
      player.stamina + cfg.player.staminaRegenPerSec * (dtMs / 1000),
    );
  }

  if (player.state.kind === 'idle' && len(player.vel) > 0.05) transition(world, player, 'move');
  else if (player.state.kind === 'move' && len(player.vel) <= 0.05) {
    transition(world, player, 'idle');
  }
};
