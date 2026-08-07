
import { describe, expect, it } from 'vitest';

import {
  ATTACK_PHASES,
  IDLE_FALLBACK,
  bindBodyClips,
  enemyClipDrive,
  playerClipDrive,
} from '../src/render/mesh-clips-lab';
import type { BodyClip } from '../src/render/mesh-body-lab';
import { DEFAULT_COMBAT, DEFAULT_SLOWMO_ID, SLOWMO_PRESETS } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import { createWorld } from '../src/sim/encounter';
import { stepWorld } from '../src/sim/world';
import { CAST_MESHES } from '../src/render/cast-meshes-lab';
import { oneEnemy } from './support/world';
import type {
  AttackKind, CombatConfig, Enemy, EnemyStateKind, Player, PlayerStateKind,
} from '../src/sim/types';
import { NEUTRAL_INTENT, TICK_MS } from '../src/sim/types';

const PACK: readonly BodyClip[] = [
  ['Attack', 2.8],
  ['Block10', 0.5666666],
  ['Hit_Reaction', 1.6333333],
  ['Hit_Reaction_with_Bow', 2],
  ['Left_Slash', 3.1666666],
  ['Running', 0.6333333],
  ['Shield_Push_Left', 2.4],
  ['Walking', 1.0333333],
].map(([name, durationSec]) => ({
  name: name as string,
  durationSec: durationSec as number,
  tracks: [],
}));

const bank = bindBodyClips(PACK);

const world = createWorld(ENCOUNTERS[Object.keys(ENCOUNTERS)[0]], DEFAULT_COMBAT, 11);

const bodyIn = (
  kind: PlayerStateKind,
  elapsedMs: number,
  attack: AttackKind | null = null,
): Player => ({
  ...world.players[0],
  vel: { x: 0, y: 0 },
  state: { ...world.players[0].state, kind, elapsedMs, attack, struck: [] },
});

const driveOf = (player: Player, cfg: CombatConfig = DEFAULT_COMBAT) => {
  const drive = playerClipDrive(world, player, cfg, bank);
  expect(drive).not.toBeNull();
  return drive!;
};

const tuned = (kind: AttackKind, windupMs: number, activeMs: number, recoveryMs: number) => ({
  ...DEFAULT_COMBAT,
  player: {
    ...DEFAULT_COMBAT.player,
    chain: undefined,
    attacks: {
      ...DEFAULT_COMBAT.player.attacks,
      [kind]: { ...DEFAULT_COMBAT.player.attacks[kind], windupMs, activeMs, recoveryMs },
    },
  },
}) as CombatConfig;

describe('the blade cannot disagree with the hitbox', () => {
  it('puts the clip at the contact frame the moment the hitbox goes live, at any tuning', () => {
    const tunings: [number, number, number][] = [
      [220, 90, 260],
      [600, 40, 120],
      [40, 400, 40],
      [1, 1, 1],
      [2000, 16, 900],
    ];
    for (const [windupMs, activeMs, recoveryMs] of tunings) {
      const cfg = tuned('light', windupMs, activeMs, recoveryMs);
      const endOfWindup = driveOf(bodyIn('windup', windupMs, 'light'), cfg);
      const startOfActive = driveOf(bodyIn('active', 0, 'light'), cfg);
      expect(endOfWindup.at).toBeCloseTo(ATTACK_PHASES.contact, 9);
      expect(startOfActive.at).toBeCloseTo(ATTACK_PHASES.contact, 9);
      expect(startOfActive.clip.name).toBe(endOfWindup.clip.name);
    }
  });

  it('hands the swing over to the recovery at the settle frame, at any tuning', () => {
    for (const [windupMs, activeMs, recoveryMs] of [[220, 90, 260], [30, 700, 30]] as const) {
      const cfg = tuned('heavy', windupMs, activeMs, recoveryMs);
      expect(driveOf(bodyIn('active', activeMs, 'heavy'), cfg).at)
        .toBeCloseTo(ATTACK_PHASES.settle, 9);
      expect(driveOf(bodyIn('recovery', 0, 'heavy'), cfg).at)
        .toBeCloseTo(ATTACK_PHASES.settle, 9);
    }
  });

  it('runs the whole swing from the first frame to the last, monotonically', () => {
    const cfg = tuned('light', 300, 120, 200);
    const samples: number[] = [];
    for (const [kind, duration] of [['windup', 300], ['active', 120], ['recovery', 200]] as const) {
      for (let step = 0; step <= 8; step++) {
        samples.push(driveOf(bodyIn(kind, (duration * step) / 8, 'light'), cfg).at);
      }
    }
    expect(samples[0]).toBeCloseTo(0, 9);
    expect(samples[samples.length - 1]).toBeCloseTo(1, 9);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1] - 1e-9);
    }
  });

  it('is a function of simulation progress alone, so a scaled clock changes nothing', () => {
    const cfg = tuned('light', 200, 100, 200);
    const half = driveOf(bodyIn('windup', 100, 'light'), cfg);
    expect(half.at).toBeCloseTo(ATTACK_PHASES.contact / 2, 9);
    const later = { ...world, tick: world.tick + 5000 };
    const drive = playerClipDrive(later, bodyIn('windup', 100, 'light'), cfg, bank);
    expect(drive!.at).toBeCloseTo(half.at, 9);
  });

  it('never leaves the clip, however far past its deadline a state runs', () => {
    const cfg = tuned('light', 200, 100, 200);
    for (const kind of ['windup', 'active', 'recovery'] as const) {
      const drive = driveOf(bodyIn(kind, 10_000, 'light'), cfg);
      expect(drive.at).toBeLessThanOrEqual(1);
      expect(drive.seconds).toBeLessThanOrEqual(drive.clip.durationSec + 1e-9);
      expect(drive.seconds).toBeGreaterThanOrEqual(0);
    }
  });

  it('reads the chain step rather than the pose when a chain is configured', () => {
    const cfg = DEFAULT_COMBAT;
    if (cfg.player.chain === undefined) return;
    const step = cfg.player.chain.steps[0];
    const body = bodyIn('windup', step.windupMs, 'light');
    body.state.chainStep = 0;
    expect(driveOf(body, cfg).at).toBeCloseTo(ATTACK_PHASES.contact, 9);
  });
});

describe('the states with no deadline', () => {
  it('walks on the same 620 ms cycle the primitive king walks on', () => {
    const GAIT_CYCLE_MS = 620;
    const perCycle = GAIT_CYCLE_MS / TICK_MS;
    const walking = { ...bodyIn('move', 0), vel: { x: 0.4, y: 0 } };
    const at = (tick: number) =>
      playerClipDrive({ ...world, tick }, walking, DEFAULT_COMBAT, bank)!.at;
    const apart = (a: number, b: number): number => {
      const gap = Math.abs(a - b) % 1;
      return Math.min(gap, 1 - gap);
    };
    expect(apart(at(perCycle * 5), at(0))).toBeLessThan(1e-6);
    expect(apart(at(perCycle * 8), at(0))).toBeLessThan(1e-6);
    expect(apart(at(perCycle * 2.5), 0.5)).toBeLessThan(1e-6);
    expect(apart(at(perCycle * 0.25), 0.25)).toBeLessThan(1e-6);
  });

  it('picks the run clip only above a real fraction of the walk speed', () => {
    const slow = { ...bodyIn('move', 0), vel: { x: DEFAULT_COMBAT.player.moveSpeed * 0.2, y: 0 } };
    const fast = { ...bodyIn('move', 0), vel: { x: DEFAULT_COMBAT.player.moveSpeed * 0.95, y: 0 } };
    expect(driveOf(slow).role).toBe('walk');
    expect(driveOf(fast).role).toBe('run');
    expect(driveOf(slow).clip.name).toBe('Walking');
    expect(driveOf(fast).clip.name).toBe('Running');
  });

  it('runs the walk cycle backwards when the king is giving ground', () => {
    const tick = 40;
    const speed = DEFAULT_COMBAT.player.moveSpeed * 0.5;
    const facingEast = (vx: number) => ({ ...bodyIn('move', 0), facing: 0, vel: { x: vx, y: 0 } });
    const advancing = playerClipDrive({ ...world, tick }, facingEast(speed), DEFAULT_COMBAT, bank)!;
    const retreating = playerClipDrive({ ...world, tick }, facingEast(-speed), DEFAULT_COMBAT, bank)!;
    expect(retreating.clip.name).toBe(advancing.clip.name);
    expect(retreating.at).toBeCloseTo(1 - advancing.at, 6);
  });

  it('walks rather than sprints backwards, whatever the speed says', () => {
    const fast = DEFAULT_COMBAT.player.moveSpeed * 0.95;
    expect(driveOf({ ...bodyIn('move', 0), facing: 0, vel: { x: -fast, y: 0 } }).role).toBe('walk');
    expect(driveOf({ ...bodyIn('move', 0), facing: 0, vel: { x: fast, y: 0 } }).role).toBe('run');
  });

  it('keeps a strafe walking forwards, because the pack has no strafe clip', () => {
    const speed = DEFAULT_COMBAT.player.moveSpeed * 0.5;
    const tick = 40;
    const ahead = playerClipDrive(
      { ...world, tick }, { ...bodyIn('move', 0), facing: 0, vel: { x: speed, y: 0 } },
      DEFAULT_COMBAT, bank,
    )!;
    const across = playerClipDrive(
      { ...world, tick }, { ...bodyIn('move', 0), facing: 0, vel: { x: 0, y: speed } },
      DEFAULT_COMBAT, bank,
    )!;
    expect(across.at).toBeCloseTo(ahead.at, 6);
  });

  it('does not chatter about direction at a standstill', () => {
    const still = { ...bodyIn('move', 0), facing: 0, vel: { x: 0, y: 0 } };
    const tick = 40;
    const a = playerClipDrive({ ...world, tick }, still, DEFAULT_COMBAT, bank)!;
    const b = playerClipDrive({ ...world, tick }, { ...still, vel: { x: 1e-9, y: -1e-9 } }, DEFAULT_COMBAT, bank)!;
    expect(a.at).toBeCloseTo(b.at, 6);
  });

  it('raises the guard over real time and then holds it', () => {
    const early = driveOf(bodyIn('guard', 40));
    const late = driveOf(bodyIn('guard', 4000));
    expect(early.at).toBeGreaterThan(0);
    expect(late.at).toBeGreaterThan(early.at);
    expect(driveOf(bodyIn('guard', 40_000)).at).toBeCloseTo(late.at, 9);
    expect(late.scrubbed).toBe(false);
  });

  it('plays death once and stays down', () => {
    expect(driveOf(bodyIn('dead', 60_000)).at).toBe(1);
  });
});

describe('binding the pack', () => {
  it('takes the plainer of two clips that both match a word', () => {
    expect(bank.clip.stagger?.name).toBe('Hit_Reaction');
  });

  it('binds every role to something, so no state can fail to draw a body', () => {
    for (const role of Object.keys(bank.clip) as (keyof typeof bank.clip)[]) {
      expect(bank.clip[role]).not.toBeNull();
    }
  });

  it('reports the missing idle even though it stood something in for it', () => {
    expect(bank.unbound).toContain('idle');
    expect(bank.clip.idle).toBe(bank.clip[IDLE_FALLBACK]);
  });

  it('binds the roles the pack really does answer', () => {
    expect(bank.clip.attackLight?.name).toBe('Left_Slash');
    expect(bank.clip.attackHeavy?.name).toBe('Attack');
    expect(bank.clip.guard?.name).toBe('Block10');
    expect(bank.clip.parry?.name).toBe('Shield_Push_Left');
    expect(bank.unbound).not.toContain('guard');
  });

  it('returns null rather than a body for a pack with no clips at all', () => {
    const empty = bindBodyClips([]);
    expect(playerClipDrive(world, bodyIn('idle', 0), DEFAULT_COMBAT, empty)).toBeNull();
  });

  it('lets a body answer a role with a gait it could actually have', () => {
    expect(bank.clip.run?.name).toBe('Running');

    const guard = bindBodyClips(PACK, CAST_MESHES.guard.clipNames);
    expect(guard.clip.run?.name).toBe('Walking');
    expect(guard.clip.walk?.name).toBe(bank.clip.walk?.name);
    expect(guard.clip.attackLight?.name).toBe(bank.clip.attackLight?.name);
    expect(guard.unbound).toEqual(bank.unbound);
  });
});

describe('the other state machine: an enemy', () => {
  const world2 = (() => {
    const def = oneEnemy('guard', { x: 3, y: 0 });
    const w = createWorld(def, DEFAULT_COMBAT, 3);
    stepWorld(w, [NEUTRAL_INTENT], DEFAULT_COMBAT, SLOWMO_PRESETS[DEFAULT_SLOWMO_ID], def);
    return w;
  })();
  const archetype = world2.enemies[0].archetype;
  const ecfg = DEFAULT_COMBAT.enemies[archetype];

  const enemyIn = (kind: EnemyStateKind, elapsedMs: number, attackIndex = 0): Enemy => ({
    ...world2.enemies[0],
    archetype,
    vel: { x: 0, y: 0 },
    facing: 0,
    state: { ...world2.enemies[0].state, kind, elapsedMs, attackIndex, telegraphJitterMs: 0 },
  });

  const drive = (enemy: Enemy) => {
    const d = enemyClipDrive(world2, enemy, DEFAULT_COMBAT, bank);
    expect(d).not.toBeNull();
    return d!;
  };

  it('follows the feint back down, because the wedge does', () => {
    const feinting = DEFAULT_COMBAT.enemies[archetype].attacks.find((a) => a.feint !== undefined);
    const def = feinting ?? { ...ecfg.attacks[0], feint: { atMs: 300, resetMs: 150 } };
    const cfg = {
      ...DEFAULT_COMBAT,
      enemies: {
        ...DEFAULT_COMBAT.enemies,
        [archetype]: { ...ecfg, attacks: [def, ...ecfg.attacks.slice(1)] },
      },
    } as CombatConfig;
    const at = (ms: number) =>
      enemyClipDrive(world2, enemyIn('telegraph', ms), cfg, bank)!.at;
    const peak = at(def.feint!.atMs);
    const trough = at(def.feint!.atMs + def.feint!.resetMs);
    const later = at(def.telegraphMs);
    expect(peak).toBeGreaterThan(trough);
    expect(later).toBeGreaterThan(trough);
    expect(peak / ATTACK_PHASES.contact).toBeCloseTo(0.94, 6);
  });

  it('puts the blade on the contact frame the moment the enemy hitbox goes live', () => {
    const def = ecfg.attacks[0];
    expect(drive(enemyIn('telegraph', def.telegraphMs)).at).toBeCloseTo(ATTACK_PHASES.contact, 6);
    expect(drive(enemyIn('attack', 0)).at).toBeCloseTo(ATTACK_PHASES.contact, 6);
    expect(drive(enemyIn('attack', def.activeMs)).at).toBeCloseTo(ATTACK_PHASES.settle, 6);
    expect(drive(enemyIn('recovery', 0)).at).toBeCloseTo(ATTACK_PHASES.settle, 6);
  });

  it('walks on every repositioning state, because they differ in why and not in what a leg does', () => {
    for (const kind of ['approach', 'reposition', 'sequence_reposition', 'edge_reposition'] as const) {
      const moving = { ...enemyIn(kind, 0), vel: { x: ecfg.moveSpeed * 0.4, y: 0 } };
      expect(['walk', 'run']).toContain(drive(moving).role);
    }
  });

  it('gives ground with the same reversed cycle a king does', () => {
    const tick = 40;
    const ahead = { ...enemyIn('approach', 0), vel: { x: ecfg.moveSpeed * 0.4, y: 0 } };
    const back = { ...enemyIn('approach', 0), vel: { x: -ecfg.moveSpeed * 0.4, y: 0 } };
    const a = enemyClipDrive({ ...world2, tick }, ahead, DEFAULT_COMBAT, bank)!;
    const b = enemyClipDrive({ ...world2, tick }, back, DEFAULT_COMBAT, bank)!;
    expect(b.at).toBeCloseTo(1 - a.at, 6);
  });

  it('falls back to the idle for a roar no ordinary pack carries', () => {
    expect(bank.unbound).toContain('roar');
    expect(drive(enemyIn('entrance_roar', 100)).clip).toBe(bank.clip.idle);
  });

  it('scrubs a stagger over the archetype own window', () => {
    expect(drive(enemyIn('stagger', 0)).at).toBeCloseTo(0, 6);
    expect(drive(enemyIn('stagger', ecfg.staggerMs)).at).toBeCloseTo(1, 6);
  });
});
