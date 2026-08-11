
import type { CombatConfig, Enemy, Player, PlayerConfig, World } from '../sim/types';
import { playerAttackDef } from '../sim/types';
import type { BodyClip } from './mesh-body-lab';
import { TAU, gaitPhaseFor, telegraphProgress } from './draw-primitives';

export type BodyClipRole =
  | 'idle'
  | 'walk'
  | 'run'
  | 'attackLight'
  | 'attackHeavy'
  | 'guard'
  | 'parry'
  | 'stagger'
  | 'step'
  | 'power'
  | 'roar'
  | 'dead';

export const BODY_CLIP_ROLES: readonly BodyClipRole[] = [
  'idle', 'walk', 'run', 'attackLight', 'attackHeavy',
  'guard', 'parry', 'stagger', 'step', 'power', 'roar', 'dead',
];

export const BODY_CLIP_NAMES: Readonly<Record<BodyClipRole, readonly string[]>> = {
  idle: ['idle', 'stand'],
  walk: ['walking', 'walk'],
  run: ['running', 'run', 'walking'],

  attackLight: ['left_slash', 'slash', 'attack'],
  attackHeavy: ['attack'],
  guard: ['block', 'guard'],
  parry: ['shield_push', 'block'],
  stagger: ['hit_reaction'],
  step: ['running', 'walking'],
  power: ['power_cast', 'power'],
  roar: ['roar', 'shout', 'taunt'],
  dead: ['hit_reaction'],
};

export const IDLE_FALLBACK: BodyClipRole = 'walk';

export interface BodyClipBank {
  clip: Readonly<Record<BodyClipRole, BodyClip | null>>;
  unbound: readonly BodyClipRole[];
}

export const bindBodyClips = (
  clips: readonly BodyClip[],
  overrides: Partial<Record<BodyClipRole, readonly string[]>> = {},
  roles?: Readonly<Record<string, number>>,
): BodyClipBank => {
  const clip = {} as Record<BodyClipRole, BodyClip | null>;
  const unbound: BodyClipRole[] = [];
  if (roles !== undefined) {
    for (const role of BODY_CLIP_ROLES) {
      const found = clips[roles[role] ?? -1] ?? null;
      clip[role] = found;
      if (found === null) unbound.push(role);
    }
    if (clip.idle === null) clip.idle = clip[IDLE_FALLBACK] ?? clips[0] ?? null;
    for (const role of BODY_CLIP_ROLES) if (clip[role] === null) clip[role] = clip.idle;
    return { clip, unbound };
  }
  for (const role of BODY_CLIP_ROLES) {
    let found: BodyClip | null = null;
    for (const wanted of [...(overrides[role] ?? BODY_CLIP_NAMES[role]), role.toLowerCase()]) {
      const matches = clips.filter((candidate) => candidate.name.toLowerCase().includes(wanted));
      if (matches.length === 0) continue;
      found = matches.reduce((best, candidate) =>
        candidate.name.length < best.name.length ? candidate : best);
      break;
    }
    clip[role] = found;
    if (found === null) unbound.push(role);
  }
  if (clip.idle === null) clip.idle = clip[IDLE_FALLBACK] ?? clips[0] ?? null;
  for (const role of BODY_CLIP_ROLES) {
    if (clip[role] === null) clip[role] = clip.idle;
  }
  return { clip, unbound };
};

export interface AttackPhases {
  contact: number;
  settle: number;
}

export const ATTACK_PHASES: AttackPhases = { contact: 0.52, settle: 0.7 };

const PARRY_SPAN = 0.35;

const STEP_STRIDE = 0.5;

const AT_REST_SPEED = 1e-6;

const GUARD_RAISE_SEC = 0.22;

const advanceRatio = (vel: { x: number; y: number }, facing: number): number => {
  const speed = Math.hypot(vel.x, vel.y);
  if (speed < 1e-4) return 1;
  return (Math.cos(facing) * vel.x + Math.sin(facing) * vel.y) / speed;
};

export interface BodyClipDrive {
  role: BodyClipRole;
  clip: BodyClip;
  at: number;
  seconds: number;
  scrubbed: boolean;
  fadeSec: number;
}

const phaseProgress = (elapsedMs: number, durationMs: number): number =>
  Math.max(0, Math.min(1, elapsedMs / Math.max(1, durationMs)));

const parryDurationMs = (pc: PlayerConfig): number =>
  pc.parry.onsetMs + pc.parry.perfectMs + pc.parry.lateMs;

interface RolePosition {
  role: BodyClipRole;
  at: (durationSec: number) => number;
  scrubbed: boolean;
  fadeSec: number;
}

const rolePosition = (
  world: World,
  player: Player,
  cfg: CombatConfig,
  phases: AttackPhases,
): RolePosition => {
  const pc = cfg.player;
  const state = player.state;

  if (player.powerChannelMs > 0 && cfg.power !== 'none') {
    const windupMs = Math.max(1, cfg.powers[cfg.power].channelWindupMs);
    const at = Math.min(1, player.powerChannelMs / windupMs);
    return { role: 'power', at: () => at, scrubbed: true, fadeSec: 0.08 };
  }

  switch (state.kind) {
    case 'windup':
    case 'active':
    case 'recovery': {
      const def = playerAttackDef(state, pc);
      const role: BodyClipRole = state.attack === 'heavy' ? 'attackHeavy' : 'attackLight';
      const { contact, settle } = phases;
      const at =
        def === null
          ? 0
          : state.kind === 'windup'
            ? contact * phaseProgress(state.elapsedMs, def.windupMs)
            : state.kind === 'active'
              ? contact + (settle - contact) * phaseProgress(state.elapsedMs, def.activeMs)
              : settle + (1 - settle) * phaseProgress(state.elapsedMs, def.recoveryMs);
      return {
        role,
        at: () => at,
        scrubbed: true,
        fadeSec: 0,
      };
    }

    case 'parry': {
      const at = PARRY_SPAN * phaseProgress(state.elapsedMs, parryDurationMs(pc));
      return { role: 'parry', at: () => at, scrubbed: true, fadeSec: 0 };
    }

    case 'stagger': {
      const at = phaseProgress(state.elapsedMs, pc.guard.guardBreakStaggerMs);
      return { role: 'stagger', at: () => at, scrubbed: true, fadeSec: 0 };
    }

    case 'step': {


      const t = phaseProgress(state.elapsedMs, pc.step.durationMs);
      const travelled = STEP_STRIDE * t;
      const at = advanceRatio(player.vel, player.facing) < 0 ? STEP_STRIDE - travelled : travelled;
      return { role: 'step', at: () => at, scrubbed: true, fadeSec: 0.04 };
    }

    case 'guard':
      return {
        role: 'guard',
        at: (duration) => Math.min(GUARD_RAISE_SEC, state.elapsedMs / 1000) / Math.max(1e-6, duration),
        scrubbed: false,
        fadeSec: 0.08,
      };

    case 'dead':
      return {
        role: 'dead',
        at: (duration) => (state.elapsedMs / 1000) / Math.max(1e-6, duration),
        scrubbed: false,
        fadeSec: 0.06,
      };

    case 'move':
      return locomotion(world, player.vel, player.facing, pc.moveSpeed);

    case 'idle':
    default:
      return { role: 'idle', at: () => 0, scrubbed: false, fadeSec: 0.16 };
  }
};

const locomotion = (
  world: World,
  vel: { x: number; y: number },
  facing: number,
  moveSpeed: number,
): RolePosition => {
  {
    {
      const speed = Math.hypot(vel.x, vel.y);




      if (speed <= AT_REST_SPEED) {
        return { role: 'idle', at: () => 0, scrubbed: false, fadeSec: 0.16 };
      }
      const phase = gaitPhaseFor(world, 'move') / TAU;
      const wrapped = phase - Math.floor(phase);


      const forward = advanceRatio(vel, facing);
      const at = forward < 0 ? 1 - wrapped : wrapped;
      return {
        role: forward >= 0 && speed > moveSpeed * 0.7 ? 'run' : 'walk',
        at: () => at,
        scrubbed: false,
        fadeSec: 0.12,
      };
    }
  }
};

export const playerClipDrive = (
  world: World,
  player: Player,
  cfg: CombatConfig,
  bank: BodyClipBank,
  phases: AttackPhases = ATTACK_PHASES,
): BodyClipDrive | null => {
  const position = rolePosition(world, player, cfg, phases);
  const clip = bank.clip[position.role];
  if (clip === null) return null;
  const at = Math.max(0, Math.min(1, position.at(clip.durationSec)));
  return {
    role: position.role,
    clip,
    at,
    seconds: at * clip.durationSec,
    scrubbed: position.scrubbed,
    fadeSec: position.fadeSec,
  };
};


export const enemyClipDrive = (
  world: World,
  enemy: Enemy,
  cfg: CombatConfig,
  bank: BodyClipBank,
  phases: AttackPhases = ATTACK_PHASES,
): BodyClipDrive | null => {
  const ecfg = cfg.enemies[enemy.archetype];
  const state = enemy.state;
  const { contact, settle } = phases;



  const rebukeTotal = ecfg.volley?.rebukeMs ?? 0;
  const rebuking = (enemy.rebukeMs ?? 0) > 0 && rebukeTotal > 0;

  const position = ((): RolePosition => {
    if (rebuking) {
      const through = 1 - (enemy.rebukeMs ?? 0) / rebukeTotal;
      return { role: 'parry', at: () => Math.max(0, Math.min(1, through)), scrubbed: true, fadeSec: 0.05 };
    }
    switch (state.kind) {
      case 'telegraph': {
        const def = ecfg.attacks[state.attackIndex];
        const at =
          def === undefined
            ? 0
            : contact * telegraphProgress(def, state.elapsedMs, state.telegraphJitterMs);
        return { role: 'attackHeavy', at: () => at, scrubbed: true, fadeSec: 0 };
      }

      case 'attack': {
        const def = ecfg.attacks[state.attackIndex];
        const at = contact +
          (settle - contact) * phaseProgress(state.elapsedMs, def?.activeMs ?? 1);
        return { role: 'attackHeavy', at: () => at, scrubbed: true, fadeSec: 0 };
      }

      case 'recovery': {
        const def = ecfg.attacks[state.attackIndex];
        const at = settle + (1 - settle) * phaseProgress(state.elapsedMs, def?.recoveryMs ?? 1);
        return { role: 'attackHeavy', at: () => at, scrubbed: true, fadeSec: 0 };
      }

      case 'stagger': {
        const at = phaseProgress(state.elapsedMs, ecfg.staggerMs);
        return { role: 'stagger', at: () => at, scrubbed: true, fadeSec: 0 };
      }

      case 'approach':
      case 'reposition':
      case 'sequence_reposition':
      case 'edge_reposition':
        return locomotion(world, enemy.vel, enemy.facing, ecfg.moveSpeed);

      case 'entrance_fall':
      case 'entrance_roar':
      case 'phase_roar':
        return { role: 'roar', at: (d) => (state.elapsedMs / 1000) / Math.max(1e-6, d), scrubbed: false, fadeSec: 0.2 };

      case 'dead':
        return {
          role: 'dead',
          at: (d) => (state.elapsedMs / 1000) / Math.max(1e-6, d),
          scrubbed: false,
          fadeSec: 0.06,
        };

      case 'idle':
      default:
        return { role: 'idle', at: () => 0, scrubbed: false, fadeSec: 0.16 };
    }
  })();

  const clip = bank.clip[position.role];
  if (clip === null) return null;
  const at = Math.max(0, Math.min(1, position.at(clip.durationSec)));
  return {
    role: position.role,
    clip,
    at,
    seconds: at * clip.durationSec,
    scrubbed: position.scrubbed,
    fadeSec: position.fadeSec,
  };
};
