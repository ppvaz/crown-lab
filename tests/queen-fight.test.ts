
import { DEFAULT_COMBAT } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import { QUEEN } from '../src/lab/enemies/queen';
import { createWorld } from '../src/sim/encounter';
import type { Enemy, EnemyAttackDef, World } from '../src/sim/types';
import { stepWorld } from '../src/sim/world';
import { intent, noSlowMo } from './support/world';

const attackOf = (id: string): EnemyAttackDef => {
  const found = QUEEN.attacks.find((attack) => attack.id === id);
  if (found === undefined) throw new Error(`no attack ${id}`);
  return found;
};

const movements = QUEEN.sequence!.movements!;
const ACTS = [
  { name: 'REGALIA', primary: QUEEN.sequence!.attackIndices, alt: QUEEN.sequence!.altAttackIndices! },
  { name: 'UNSWORN', primary: movements[0].attackIndices, alt: movements[0].altAttackIndices! },
  { name: 'LAST DECREE', primary: movements[1].attackIndices, alt: movements[1].altAttackIndices! },
];

const makeQueenWorld = (): { world: World; queen: Enemy; step: (ticks: number) => void } => {
  const combat = structuredClone(DEFAULT_COMBAT);
  const def = ENCOUNTERS.queen;
  const world = createWorld(def, combat, 31);
  stepWorld(world, [intent()], combat, noSlowMo(), def);
  const queen = world.enemies[0];
  if (queen?.archetype !== 'queen') throw new Error('the queen room did not spawn the Queen');
  return {
    world,
    queen,
    step: (ticks: number) => {
      for (let i = 0; i < ticks; i += 1) stepWorld(world, [intent()], combat, noSlowMo(), def);
    },
  };
};

describe('three acts', () => {
  it('authors one phrase pair per act, each closing on the same strike', () => {
    expect(movements).toHaveLength(2);
    for (const act of ACTS) {
      expect(act.primary.length, act.name).toBeGreaterThanOrEqual(3);
      expect(act.alt.length, act.name).toBe(act.primary.length);
      expect(act.alt[act.alt.length - 1], act.name).toBe(act.primary[act.primary.length - 1]);
      expect(act.alt, act.name).not.toEqual(act.primary);
      for (const index of [...act.primary, ...act.alt]) {
        expect(QUEEN.attacks[index], `${act.name} names attack ${index}`).toBeDefined();
      }
    }
  });

  it('ends every act on its longest recovery — the window the act is teaching', () => {
    for (const act of ACTS) {
      const recoveries = act.primary.map((index) => QUEEN.attacks[index].recoveryMs);
      expect(Math.max(...recoveries), act.name).toBe(recoveries[recoveries.length - 1]);
    }
  });

  it('gets faster act over act, in footwork and in crossing', () => {
    expect(movements[0].moveSpeedScale).toBeGreaterThan(1);
    expect(movements[1].moveSpeedScale).toBeGreaterThan(movements[0].moveSpeedScale);
    expect(movements[0].repositionMs).toBeLessThan(QUEEN.sequence!.repositionMs);
    expect(movements[1].repositionMs).toBeLessThan(movements[0].repositionMs);
  });

  it('draws no random number, anywhere', () => {
    expect(QUEEN.attackCooldownJitterMs).toBe(0);
    for (const attack of QUEEN.attacks) {
      expect(attack.telegraphJitterMs, attack.id).toBe(0);
    }
  });
});

describe('what the acts escalate with', () => {
  it('keeps act one entirely parryable and puts the unparryable swings later', () => {
    const unparryableIn = (indices: readonly number[]): string[] =>
      indices.filter((index) => !QUEEN.attacks[index].parryable).map((index) => QUEEN.attacks[index].id);

    expect(unparryableIn([...ACTS[0].primary, ...ACTS[0].alt])).toHaveLength(0);
    expect(unparryableIn(ACTS[1].primary).length).toBeGreaterThan(0);
    expect(unparryableIn(ACTS[2].primary).length).toBeGreaterThan(0);
  });

  it('winds the unparryable swings up for longer than the strikes around them', () => {
    for (const act of [ACTS[1], ACTS[2]]) {
      const melee = act.primary.map((index) => QUEEN.attacks[index]).filter((a) => a.kind === 'melee');
      const unparryable = melee.filter((a) => !a.parryable);
      const parryable = melee.filter((a) => a.parryable);
      expect(unparryable.length, act.name).toBeGreaterThan(0);
      for (const swing of unparryable) {
        for (const other of parryable) {
          expect(swing.telegraphMs, `${swing.id} vs ${other.id}`).toBeGreaterThan(other.telegraphMs);
        }
      }
    }
  });

  it('quotes the cast rather than inventing: a feint that wears its own strike\'s posture', () => {
    const feint = attackOf('queen_decree_feint');
    const honest = attackOf('queen_decree_thrust');
    expect(feint.feint).toBeDefined();
    expect(feint.tell).toBe(honest.tell);
    expect(feint.arcDeg).toBe(honest.arcDeg);
    expect(feint.range).toBe(honest.range);
    expect(feint.damage).toBe(honest.damage);
    expect(feint.telegraphMs).toBeGreaterThan(honest.telegraphMs);
  });
});

describe('the last act\'s dilemma', () => {
  const playerRadius = DEFAULT_COMBAT.player.radius;

  it('leaves the sampled centre outside every impact', () => {
    for (const id of ['queen_last_decree_rain', 'queen_last_decree_rain_tight']) {
      const field = attackOf(id).rain!;
      const kill = field.impactRadius + playerRadius;
      for (const offset of field.offsets) {
        expect(Math.hypot(offset.x, offset.y), `${id} marks its own centre`).toBeGreaterThan(kill);
      }
    }
  });

  it('answers standing still with a sweep wider than a half circle', () => {
    const sweep = attackOf('queen_glaive_sweep');
    expect(sweep.arcDeg).toBeGreaterThan(180);
    expect(sweep.parryable).toBe(false);
    expect(sweep.range).toBeGreaterThan(attackOf('queen_last_decree_rain').rain!.offsets[0].y);
  });

  it('leaves a gap between adjacent impacts wide enough to run through', () => {
    for (const id of ['queen_last_decree_rain', 'queen_last_decree_rain_tight']) {
      const field = attackOf(id).rain!;
      const kill = field.impactRadius + playerRadius;
      const gaps = field.offsets.map((offset, i) => {
        const next = field.offsets[(i + 1) % field.offsets.length];
        return Math.hypot(next.x - offset.x, next.y - offset.y);
      });
      expect(Math.min(...gaps), `${id} closes its perimeter`).toBeGreaterThan(kill);
    }
  });
});

describe('the third act as machinery', () => {
  it('sits below the second act\'s threshold, so two roars cannot land on one hit', () => {
    const boss = QUEEN.boss!;
    expect(boss.phaseThreeHpFraction).toBeDefined();
    expect(boss.phaseThreeHpFraction!).toBeLessThan(boss.phaseTwoHpFraction);
    expect(boss.phaseThreeHpFraction!).toBeGreaterThan(0);
  });

  it('roars into act two and then into act three, and speaks each act\'s phrase', () => {
    const { world, queen, step } = makeQueenWorld();
    step(300);
    expect(queen.phase ?? 1).toBe(1);

    queen.hp = queen.maxHp * (QUEEN.boss!.phaseTwoHpFraction - 0.01);
    step(200);
    expect(queen.phase).toBe(2);

    queen.hp = queen.maxHp * (QUEEN.boss!.phaseThreeHpFraction! - 0.01);
    step(200);
    expect(queen.phase).toBe(3);

    const thirdAct = new Set([...ACTS[2].primary, ...ACTS[2].alt]);
    let spoke = 0;
    for (let i = 0; i < 900; i += 1) {
      step(1);
      if (queen.state.kind === 'telegraph' || queen.state.kind === 'attack') {
        expect(thirdAct.has(queen.state.attackIndex), `spoke attack ${queen.state.attackIndex}`).toBe(
          true,
        );
        spoke += 1;
      }
    }
    expect(spoke, 'she never attacked in the third act').toBeGreaterThan(0);
    expect(world.enemies).toHaveLength(1);
  });

  it('leaves a two-phase boss with two phases', () => {
    const combat = structuredClone(DEFAULT_COMBAT);
    const def = ENCOUNTERS.first_blade;
    const world = createWorld(def, combat, 19);
    stepWorld(world, [intent()], combat, noSlowMo(), def);
    const blade = world.enemies[0];
    expect(blade.archetype).toBe('first_blade');
    expect(combat.enemies.first_blade.boss?.phaseThreeHpFraction).toBeUndefined();

    for (let i = 0; i < 140; i += 1) stepWorld(world, [intent()], combat, noSlowMo(), def);
    blade.hp = 1;
    for (let i = 0; i < 600; i += 1) stepWorld(world, [intent()], combat, noSlowMo(), def);
    expect(blade.phase).toBe(2);
  });
});
