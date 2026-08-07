
import { DEFAULT_COMBAT, SLOWMO_PRESETS } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import { createWorld } from '../src/sim/encounter';
import type { Intent, SimEvent, World } from '../src/sim/types';
import { NEUTRAL_INTENT } from '../src/sim/types';
import { stepWorld } from '../src/sim/world';

const combat = () => structuredClone(DEFAULT_COMBAT);
const encounter = ENCOUNTERS.elite_guard;

const step = (
  world: World,
  cfg: ReturnType<typeof combat>,
  input: Intent = NEUTRAL_INTENT,
): SimEvent[] => {
  stepWorld(world, [input], cfg, SLOWMO_PRESETS.none, encounter);
  return [...world.events];
};

const makeWorld = () => {
  const cfg = combat();
  const world = createWorld(encounter, cfg, 17);
  step(world, cfg);
  const boss = world.enemies[0];
  if (boss?.archetype !== 'elite_guard') {
    throw new Error('elite_guard did not spawn its mechanical subject');
  }
  for (let i = 0; i < 600 && boss.state.kind !== 'approach'; i++) step(world, cfg);

  world.players[0].pos = { x: 0, y: 0 };
  world.players[0].facing = 0;
  boss.pos = { x: 1.5, y: 0 };
  boss.facing = Math.PI;
  boss.attackCooldownMs = 5000;
  boss.state = {
    kind: 'approach',
    enteredTick: world.tick,
    elapsedMs: 0,
    attackIndex: 0,
    telegraphJitterMs: 0,
    struck: [],
  };
  world.events.length = 0;
  return { world, boss, cfg };
};

const swing = (
  world: World,
  cfg: ReturnType<typeof combat>,
  kind: 'light' | 'heavy',
  maxTicks = 120,
): SimEvent[] => {
  const collected: SimEvent[] = [];
  const press: Intent = {
    ...NEUTRAL_INTENT,
    facing: 0,
    lightPressed: kind === 'light',
    heavyPressed: kind === 'heavy',
  };
  for (let i = 0; i < maxTicks; i++) {
    collected.push(...step(world, cfg, i === 0 ? press : { ...NEUTRAL_INTENT, facing: 0 }));
    if (collected.some((e) => e.type === 'enemy_blocked' || e.type === 'hit_landed')) break;
  }
  return collected;
};

describe('the frontal guard', () => {
  it('absorbs a light attack for chip and emits the fact', () => {
    const { world, boss, cfg } = makeWorld();
    const light = cfg.player.attacks.light;
    const guard = cfg.enemies.elite_guard.defence!;
    const startHp = boss.hp;

    const blocked = swing(world, cfg, 'light').find((e) => e.type === 'enemy_blocked');

    expect(blocked).toBeDefined();
    expect(blocked?.data?.damage).toBeCloseTo(light.damage * guard.chipFraction);
    expect(blocked?.data?.absorbed).toBeCloseTo(light.damage * (1 - guard.chipFraction));
    expect(startHp - boss.hp).toBeCloseTo(light.damage * guard.chipFraction);
  });

  it('takes no poise from an absorbed light, however many arrive', () => {
    const { world, boss, cfg } = makeWorld();

    for (let i = 0; i < 6; i++) {
      boss.attackCooldownMs = 5000;
      swing(world, cfg, 'light');
    }

    expect(boss.poise).toBe(boss.maxPoise);
    expect(boss.state.kind).not.toBe('stagger');
  });

  it('lets a heavy through at full damage and full poise', () => {
    const { world, boss, cfg } = makeWorld();
    const heavy = cfg.player.attacks.heavy;
    const startHp = boss.hp;

    const landed = swing(world, cfg, 'heavy').find((e) => e.type === 'hit_landed');

    expect(landed).toBeDefined();
    expect(startHp - boss.hp).toBeCloseTo(heavy.damage);
    expect(boss.maxPoise - boss.poise).toBeCloseTo(heavy.poiseDamage, 0);
  });

  it('does not guard what it cannot see', () => {
    const { world, boss, cfg } = makeWorld();
    boss.facing = 0;
    const startHp = boss.hp;

    const events = swing(world, cfg, 'light');

    expect(events.some((e) => e.type === 'enemy_blocked')).toBe(false);
    expect(startHp - boss.hp).toBeCloseTo(cfg.player.attacks.light.damage);
  });
});

describe('the guard covers the neutral stance and nothing else', () => {
  const committedStates = ['telegraph', 'attack', 'recovery', 'stagger'] as const;

  for (const kind of committedStates) {
    it(`leaves a light attack landing in full during ${kind}`, () => {
      const { world, boss, cfg } = makeWorld();
      boss.state = {
        kind,
        enteredTick: world.tick,
        elapsedMs: 0,
        attackIndex: 0,
        telegraphJitterMs: 0,
        struck: [],
      };
      const startHp = boss.hp;

      const events = swing(world, cfg, 'light');

      expect(events.some((e) => e.type === 'enemy_blocked')).toBe(false);
      expect(startHp - boss.hp).toBeCloseTo(cfg.player.attacks.light.damage);
    });
  }
});

describe('the provocation', () => {
  it('drops the next cooldown to the provoked value', () => {
    const { world, boss, cfg } = makeWorld();
    const guard = cfg.enemies.elite_guard.defence!;

    swing(world, cfg, 'light');

    expect(boss.attackCooldownMs).toBeLessThanOrEqual(guard.provokedCooldownMs);
  });

  it('answers a poke far sooner than it acts unprovoked', () => {
    const ticksToTelegraph = (provoke: boolean): number => {
      const { world, boss, cfg } = makeWorld();
      boss.attackCooldownMs = cfg.enemies.elite_guard.attackCooldownMs;
      if (provoke) swing(world, cfg, 'light');
      for (let i = 0; i < 900; i++) {
        if (step(world, cfg, { ...NEUTRAL_INTENT, facing: 0 }).some(
          (e) => e.type === 'enemy_telegraph',
        )) {
          return i;
        }
      }
      throw new Error('the wall never swung');
    };

    expect(ticksToTelegraph(true) * 3).toBeLessThan(ticksToTelegraph(false));
  });
});

describe('the instrument keeps the rules the rest of the cast keeps', () => {
  const ecfg = () => combat().enemies.elite_guard;

  it('gives its three reads visibly different wedges', () => {
    const attacks = ecfg().attacks;
    expect(attacks).toHaveLength(3);

    for (let i = 0; i < attacks.length; i++) {
      for (let j = i + 1; j < attacks.length; j++) {
        const reach = Math.abs(attacks[i].range - attacks[j].range);
        const arc = Math.abs(attacks[i].arcDeg - attacks[j].arcDeg);
        expect(reach > 0.5 || arc > 40).toBe(true);
      }
    }
  });

  it('suffers worse than anything else in the cast when its poise breaks', () => {
    const cfg = combat();
    const others = Object.values(cfg.enemies)
      .filter((e) => e.archetype !== 'elite_guard')
      .map((e) => e.staggerMs);

    expect(cfg.enemies.elite_guard.staggerMs).toBeGreaterThan(Math.max(...others));
  });

  it('holds its timing steady, leaving jitter to the condition that measures it', () => {
    const cfg = ecfg();
    expect(cfg.attackCooldownJitterMs).toBe(0);
    expect(cfg.attacks.every((a) => a.telegraphJitterMs === 0)).toBe(true);
  });

  it('stays a study rather than a character', () => {
    expect(ecfg().boss?.name).toBe('WALL STUDY');
    expect(ecfg().attackPatternPhaseTwo).toBeUndefined();
  });
});
